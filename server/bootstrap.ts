import { initialState } from "../src/demoData";
import type {
  AuditEvent, Branch, BranchId, Booking, Customer, GarageState, Job, JobEvent, Service,
  WarrantyAuditEvent, WarrantyClaim, WarrantyClaimAttachment, WarrantyInvoiceDraft,
  WarrantyInvoiceDraftItem, WarrantyPolicy, WarrantyQrPrintEvent, WarrantyRecord,
  WarrantyVerificationField,
} from "../src/types";
import { allowedBranchIds, canReadCustomers, canViewWarrantyRecords, type GarageActor } from "./authz";
import { pool } from "./db";
import { normalizeWarrantyVerificationFields } from "./warranty-verification";

function dateValue(value: string | Date) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export async function loadGarageBootstrap(actor: GarageActor) {
  const allBranchRows = await pool.query<{
    id: string;
    name_en: string;
    name_ar: string;
    daily_dropoff_limit: number;
    working_hours: string;
    clean_bays: number;
    general_bays: number;
    weekly_day_off: string;
  }>(
    `SELECT id, name_en, name_ar, daily_dropoff_limit, working_hours, clean_bays, general_bays, weekly_day_off
     FROM branches ORDER BY id`,
  );
  const accessibleIds = allowedBranchIds(actor, allBranchRows.rows.map((branch) => branch.id));
  const accessibleBranches = allBranchRows.rows.filter((branch) => accessibleIds.includes(branch.id));
  const branchIds = accessibleBranches.map((branch) => branch.id);

  const branches: Branch[] = accessibleBranches.map((branch) => ({
    id: branch.id as BranchId,
    name: branch.name_en,
    nameAr: branch.name_ar,
    shortName: branch.name_en,
    dailyDropoffLimit: branch.daily_dropoff_limit,
    cleanBays: branch.clean_bays,
    generalBays: branch.general_bays,
    workingHours: Number(branch.working_hours),
    weeklyDayOff: branch.weekly_day_off,
  }));

  const servicesResult = await pool.query<{
    id: string;
    name_en: string;
    name_ar: string;
    bay_type: "clean" | "general";
    bay_hours: string;
    price_label: string;
  }>(
    "SELECT id, name_en, name_ar, bay_type, bay_hours, price_label FROM services WHERE active = true ORDER BY name_en",
  );
  const services: Service[] = servicesResult.rows.map((service) => ({
    id: service.id,
    name: service.name_en,
    nameAr: service.name_ar,
    bayType: service.bay_type,
    bayHours: Number(service.bay_hours),
    priceLabel: service.price_label,
  }));

  const settingResult = actor.role === "owner" || actor.role === "branch-manager"
    ? await pool.query<{ setting_id: string; scope_key: string; value: string; version: number; effective_date: string | Date }>(
      `SELECT setting_id, scope_key, value, version, effective_date
       FROM operating_settings
       WHERE scope_key = 'business' OR scope_key = ANY($1::text[])`,
      [branchIds],
    )
    : { rows: [] as { setting_id: string; scope_key: string; value: string; version: number; effective_date: string | Date }[] };

  const settings = initialState.decisions
    .filter((definition) => ["booking-confirmation", "daily-dropoff-limit", "branch-working-hours", "clean-bays", "general-bays", "weekly-day-off", "tint-hours", "ceramic-hours"].includes(definition.id))
    .map((definition) => {
      const values = { ...definition.valueByScope };
      const versions = { ...definition.versionByScope };
      const effectiveDates = { ...definition.effectiveDateByScope };
      for (const record of settingResult.rows) {
        if (record.setting_id !== definition.id) continue;
        const scope = record.scope_key as BranchId | "business";
        values[scope] = record.value;
        versions[scope] = record.version;
        effectiveDates[scope] = dateValue(record.effective_date);
      }
      return {
        ...definition,
        valueByScope: values,
        versionByScope: versions,
        effectiveDateByScope: effectiveDates,
        statusByScope: Object.fromEntries(
          Object.keys(values).map((scope) => [scope, "active"]),
        ) as typeof definition.statusByScope,
      };
    });

  let jobSql = `
    SELECT j.id, j.booking_id, b.customer_id, b.vehicle_id, b.service_id, j.branch_id,
           j.stage, j.assigned_user_id, j.updated_at
    FROM jobs j
    JOIN bookings b ON b.id = j.booking_id
  `;
  const jobParams: unknown[] = [branchIds];
  let jobWhere = "j.branch_id = ANY($1::text[])";
  if (actor.role === "technician") {
    jobParams.push(actor.userId);
    jobWhere += " AND j.assigned_user_id = $2";
  }
  const jobResult = await pool.query<{
    id: string;
    booking_id: string;
    customer_id: string;
    vehicle_id: string;
    service_id: string;
    branch_id: string;
    stage: Job["stage"];
    assigned_user_id: string | null;
    updated_at: Date;
  }>(`${jobSql} WHERE ${jobWhere} ORDER BY j.updated_at DESC`, jobParams);
  const visibleJobIds = jobResult.rows.map((job) => job.id);
  const jobs: Job[] = jobResult.rows.map((job) => ({
    id: job.id,
    bookingId: job.booking_id,
    customerId: job.customer_id,
    vehicleId: job.vehicle_id,
    serviceId: job.service_id,
    branchId: job.branch_id as BranchId,
    stage: job.stage,
    updatedAt: job.updated_at.toISOString(),
    assignedUserId: job.assigned_user_id,
  }));

  const bookingResult = actor.role === "technician"
    ? visibleJobIds.length
      ? await pool.query<{
        id: string; customer_id: string; vehicle_id: string; service_id: string; branch_id: string;
        dropoff_date: string | Date; dropoff_time: string; expected_pickup: string | Date; status: Booking["status"];
      }>(
        `SELECT DISTINCT b.id, b.customer_id, b.vehicle_id, b.service_id, b.branch_id,
                b.dropoff_date, b.dropoff_time, b.expected_pickup, b.status
         FROM bookings b JOIN jobs j ON j.booking_id = b.id
         WHERE j.id = ANY($1::text[]) ORDER BY b.dropoff_date, b.dropoff_time`,
        [visibleJobIds],
      )
      : { rows: [] as { id: string; customer_id: string; vehicle_id: string; service_id: string; branch_id: string; dropoff_date: string | Date; dropoff_time: string; expected_pickup: string | Date; status: Booking["status"] }[] }
    : await pool.query<{
      id: string; customer_id: string; vehicle_id: string; service_id: string; branch_id: string;
      dropoff_date: string | Date; dropoff_time: string; expected_pickup: string | Date; status: Booking["status"];
    }>(
      `SELECT id, customer_id, vehicle_id, service_id, branch_id, dropoff_date, dropoff_time, expected_pickup, status
       FROM bookings WHERE branch_id = ANY($1::text[]) ORDER BY dropoff_date, dropoff_time`,
      [branchIds],
    );
  const bookings: Booking[] = bookingResult.rows.map((booking) => ({
    id: booking.id,
    customerId: booking.customer_id,
    vehicleId: booking.vehicle_id,
    serviceId: booking.service_id,
    branchId: booking.branch_id as BranchId,
    dropoffDate: dateValue(booking.dropoff_date),
    dropoffTime: booking.dropoff_time.slice(0, 5),
    expectedPickup: dateValue(booking.expected_pickup),
    status: booking.status,
  }));

  let customers: Customer[] = [];
  if (branchIds.length && (canReadCustomers(actor) || actor.role === "technician")) {
    const customerResult = actor.role === "technician"
      ? await pool.query<{ id: string; name: string; phone: string; preferred_language: "ar" | "en" }>(
        `SELECT DISTINCT c.id, c.name, ''::text AS phone, c.preferred_language
         FROM customers c
         JOIN bookings b ON b.customer_id = c.id
         JOIN jobs j ON j.booking_id = b.id
         WHERE j.assigned_user_id = $1 AND j.branch_id = ANY($2::text[])`,
        [actor.userId, branchIds],
      )
      : await pool.query<{ id: string; name: string; phone: string; preferred_language: "ar" | "en" }>(
        `SELECT DISTINCT c.id, c.name, c.phone, c.preferred_language
         FROM customers c
         JOIN customer_branches cb ON cb.customer_id = c.id
         WHERE cb.branch_id = ANY($1::text[])
         ORDER BY c.name`,
        [branchIds],
      );

    const customerIds = customerResult.rows.map((customer) => customer.id);
    const vehicleResult = actor.role === "technician"
      ? await pool.query<{ id: string; customer_id: string; plate: string; make: string; model: string; year: number | null }>(
        `SELECT DISTINCT v.id, v.customer_id, v.plate, v.make, v.model, v.year
         FROM vehicles v
         JOIN bookings b ON b.vehicle_id = v.id
         JOIN jobs j ON j.booking_id = b.id
         WHERE j.assigned_user_id = $1 AND j.branch_id = ANY($2::text[])`,
        [actor.userId, branchIds],
      )
      : customerIds.length
        ? await pool.query<{ id: string; customer_id: string; plate: string; make: string; model: string; year: number | null }>(
        `SELECT id, customer_id, plate, make, model, year
         FROM vehicles WHERE customer_id = ANY($1::text[]) ORDER BY created_at`,
        [customerIds],
      )
        : { rows: [] as { id: string; customer_id: string; plate: string; make: string; model: string; year: number | null }[] };
    customers = customerResult.rows.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      language: customer.preferred_language,
      vehicles: vehicleResult.rows
        .filter((vehicle) => vehicle.customer_id === customer.id)
        .map((vehicle) => ({
          id: vehicle.id,
          plate: vehicle.plate,
          makeModel: [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" "),
        })),
    }));
  }

  const jobEventResult = visibleJobIds.length
    ? await pool.query<{
      id: string; job_id: string; from_stage: JobEvent["previousStage"]; to_stage: JobEvent["nextStage"];
      full_name: string | null; created_at: Date;
    }>(
      `SELECT e.id, e.job_id, e.from_stage, e.to_stage, m.full_name, e.created_at
       FROM job_events e
       LEFT JOIN staff_memberships m ON m.clerk_user_id = e.actor_user_id
       WHERE e.job_id = ANY($1::text[])
       ORDER BY e.created_at DESC`,
      [visibleJobIds],
    )
    : { rows: [] as { id: string; job_id: string; from_stage: JobEvent["previousStage"]; to_stage: JobEvent["nextStage"]; full_name: string | null; created_at: Date }[] };
  const jobEvents: JobEvent[] = jobEventResult.rows.map((event) => ({
    id: event.id,
    jobId: event.job_id,
    previousStage: event.from_stage,
    nextStage: event.to_stage,
    actorLabel: event.full_name || "Garage OS staff",
    occurredAt: event.created_at.toISOString(),
  }));

  let auditEvents: AuditEvent[] = [];
  if (actor.role === "owner") {
    const auditResult = await pool.query<{
      id: string; setting_id: string; scope_key: string; old_value: string | null;
      new_value: string; effective_date: string | Date | null; created_at: Date;
    }>(
      `SELECT id, setting_id, scope_key, old_value, new_value, effective_date, created_at
       FROM setting_audit_events
       ORDER BY created_at DESC LIMIT 100`,
    );
    auditEvents = auditResult.rows.map((event) => ({
      id: event.id,
      settingTitle: event.setting_id,
      scopeLabel: event.scope_key,
      previousValue: event.old_value ?? "",
      newValue: event.new_value,
      effectiveDate: event.effective_date ? dateValue(event.effective_date) : undefined,
      action: "setting-updated",
      occurredAt: event.created_at.toISOString(),
    }));
  }

  const warrantyPolicies: WarrantyPolicy[] = actor.role === "technician"
    ? []
    : (await pool.query<{
      policy_id: string; version: number; name: string; eligible_service_ids: string[];
      auto_issue: boolean;
      start_rule: WarrantyPolicy["startRule"]; duration_months: number; exclusions: string;
      evidence_requirements: string; review_role: WarrantyPolicy["reviewRole"];
      response_days: number; status: WarrantyPolicy["status"]; created_at: Date; published_at: Date | null;
    }>(
      actor.role === "owner"
        ? `SELECT policy_id, version, name, eligible_service_ids, auto_issue, start_rule, duration_months,
                  exclusions, evidence_requirements, review_role, response_days, status, created_at, published_at
           FROM warranty_policies ORDER BY policy_id, version DESC`
        : `SELECT policy_id, version, name, eligible_service_ids, auto_issue, start_rule, duration_months,
                  exclusions, evidence_requirements, review_role, response_days, status, created_at, published_at
           FROM warranty_policies p
           WHERE status = 'published'
              OR EXISTS (
                SELECT 1 FROM warranties w
                WHERE w.policy_id = p.policy_id AND w.policy_version = p.version
                  AND w.branch_id = ANY($1::text[])
              )
           ORDER BY policy_id, version DESC`,
      actor.role === "owner" ? [] : [branchIds],
    )).rows.map((policy) => ({
      policyId: policy.policy_id,
      version: policy.version,
      name: policy.name,
      eligibleServiceIds: policy.eligible_service_ids,
      autoIssue: policy.auto_issue,
      startRule: policy.start_rule,
      durationMonths: policy.duration_months,
      exclusions: policy.exclusions,
      evidenceRequirements: policy.evidence_requirements,
      reviewRole: policy.review_role,
      responseDays: policy.response_days,
      status: policy.status,
      createdAt: policy.created_at.toISOString(),
      publishedAt: policy.published_at?.toISOString(),
    }));

  const verificationSettingsResult = await pool.query<{
    enabled: boolean;
    approved_fields: string[];
  }>(
    "SELECT enabled, approved_fields FROM warranty_verification_settings WHERE singleton = true",
  );
  if (!verificationSettingsResult.rowCount) {
    throw new Error("Warranty verification settings are not initialized.");
  }
  const warrantyVerificationSettings = {
    enabled: verificationSettingsResult.rows[0].enabled,
    approvedFields: normalizeWarrantyVerificationFields(verificationSettingsResult.rows[0].approved_fields) as WarrantyVerificationField[],
  };

  let warranties: WarrantyRecord[] = [];
  let warrantyInvoiceDrafts: WarrantyInvoiceDraft[] = [];
  let warrantyQrPrintEvents: WarrantyQrPrintEvent[] = [];
  let warrantyClaims: WarrantyClaim[] = [];
  let warrantyAuditEvents: WarrantyAuditEvent[] = [];
  if (branchIds.length && canViewWarrantyRecords(actor)) {
    const warrantyResult = await pool.query<{
      id: string; policy_id: string; policy_version: number; policy_name: string; job_id: string;
      customer_id: string; vehicle_id: string; branch_id: string; service_id: string;
      start_date: string | Date; expires_on: string | Date; status: WarrantyRecord["status"];
      void_reason: string | null; issued_at: Date; verification_token_active: boolean;
    }>(
      `SELECT w.id, w.policy_id, w.policy_version, p.name AS policy_name, w.job_id,
              w.customer_id, w.vehicle_id, w.branch_id, w.service_id, w.start_date,
              w.expires_on,
              CASE WHEN w.status = 'void' THEN 'void'
                   WHEN w.expires_on < (now() AT TIME ZONE 'Africa/Cairo')::date THEN 'expired'
                   ELSE 'active' END AS status,
               w.void_reason, w.issued_at,
               EXISTS (
                 SELECT 1 FROM warranty_verification_tokens token
                 WHERE token.warranty_id = w.id AND token.revoked_at IS NULL
               ) AS verification_token_active
       FROM warranties w
       JOIN warranty_policies p ON p.policy_id = w.policy_id AND p.version = w.policy_version
       WHERE w.branch_id = ANY($1::text[])
       ORDER BY w.issued_at DESC`,
      [branchIds],
    );
    warranties = warrantyResult.rows.map((warranty) => ({
      id: warranty.id,
      policyId: warranty.policy_id,
      policyVersion: warranty.policy_version,
      policyName: warranty.policy_name,
      jobId: warranty.job_id,
      customerId: warranty.customer_id,
      vehicleId: warranty.vehicle_id,
      branchId: warranty.branch_id as BranchId,
      serviceId: warranty.service_id,
      startDate: dateValue(warranty.start_date),
      expiresOn: dateValue(warranty.expires_on),
      status: warranty.status,
      voidReason: warranty.void_reason ?? undefined,
      issuedAt: warranty.issued_at.toISOString(),
      verificationTokenActive: warranty.verification_token_active,
    }));

    const warrantyIds = warranties.map((warranty) => warranty.id);
    if (warrantyIds.length) {
      const invoiceResult = await pool.query<{
        id: string; warranty_id: string; branch_id: string; tax_rate_percent: string | null;
        paid_amount: string; payment_method: WarrantyInvoiceDraft["paymentMethod"];
        payment_recorded_at: Date | null; payment_recorded_by: string | null;
        notes: string; created_at: Date; updated_at: Date;
      }>(
        `SELECT invoice.id, invoice.warranty_id, invoice.branch_id, invoice.tax_rate_percent,
                invoice.paid_amount, invoice.payment_method, invoice.payment_recorded_at,
                CASE WHEN recorder.clerk_user_id IS NULL THEN NULL
                     ELSE COALESCE(recorder.full_name, recorder.email) END AS payment_recorded_by,
                invoice.notes, invoice.created_at, invoice.updated_at
         FROM warranty_invoice_drafts invoice
         LEFT JOIN staff_memberships recorder ON recorder.clerk_user_id = invoice.payment_recorded_by
         WHERE invoice.warranty_id = ANY($1::text[])
         ORDER BY invoice.updated_at DESC`,
        [warrantyIds],
      );
      const invoiceIds = invoiceResult.rows.map((invoice) => invoice.id);
      const itemResult = invoiceIds.length
        ? await pool.query<{
          id: string; invoice_id: string; description: string; quantity: string;
          unit_amount: string | null; sort_order: number;
        }>(
          `SELECT id, invoice_id, description, quantity, unit_amount, sort_order
           FROM warranty_invoice_draft_items
           WHERE invoice_id = ANY($1::text[])
           ORDER BY invoice_id, sort_order`,
          [invoiceIds],
        )
        : { rows: [] as {
          id: string; invoice_id: string; description: string; quantity: string;
          unit_amount: string | null; sort_order: number;
        }[] };
      const itemsByInvoice = new Map<string, WarrantyInvoiceDraftItem[]>();
      for (const row of itemResult.rows) {
        const items = itemsByInvoice.get(row.invoice_id) ?? [];
        items.push({
          id: row.id,
          description: row.description,
          quantity: Number(row.quantity),
          unitAmount: row.unit_amount === null ? null : Number(row.unit_amount),
          sortOrder: row.sort_order,
        });
        itemsByInvoice.set(row.invoice_id, items);
      }
      warrantyInvoiceDrafts = invoiceResult.rows.map((invoice) => ({
        id: invoice.id,
        warrantyId: invoice.warranty_id,
        branchId: invoice.branch_id as BranchId,
        status: "draft",
        taxRatePercent: invoice.tax_rate_percent === null ? null : Number(invoice.tax_rate_percent),
        paidAmount: Number(invoice.paid_amount),
        paymentMethod: invoice.payment_method,
        paymentRecordedAt: invoice.payment_recorded_at?.toISOString() ?? null,
        paymentRecordedBy: invoice.payment_recorded_by,
        notes: invoice.notes,
        items: itemsByInvoice.get(invoice.id) ?? [],
        createdAt: invoice.created_at.toISOString(),
        updatedAt: invoice.updated_at.toISOString(),
      }));

      const printEventsResult = await pool.query<{
        id: string; warranty_id: string; token_id: string; action: WarrantyQrPrintEvent["action"];
        replaces_token_id: string | null; full_name: string | null; email: string | null; created_at: Date;
      }>(
        `SELECT e.id, e.warranty_id, e.token_id, e.action, e.replaces_token_id,
                m.full_name, m.email, e.created_at
         FROM warranty_qr_print_events e
         JOIN staff_memberships m ON m.clerk_user_id = e.actor_user_id
         WHERE e.warranty_id = ANY($1::text[])
         ORDER BY e.created_at DESC`,
        [warrantyIds],
      );
      warrantyQrPrintEvents = printEventsResult.rows.map((event) => ({
        id: event.id,
        warrantyId: event.warranty_id,
        tokenId: event.token_id,
        action: event.action,
        replacesTokenId: event.replaces_token_id ?? undefined,
        actorLabel: event.full_name || event.email || "Garage OS staff",
        createdAt: event.created_at.toISOString(),
      }));
    }

    const claimResult = warrantyIds.length
      ? await pool.query<{
        id: string; warranty_id: string; branch_id: string; summary: string; evidence: string;
        status: WarrantyClaim["status"]; resolution: string | null; opened_by: string;
        reviewed_by: string | null; reviewed_at: Date | null; created_at: Date; updated_at: Date;
      }>(
        `SELECT c.id, c.warranty_id, w.branch_id, c.summary, c.evidence, c.status, c.resolution,
                COALESCE(opener.full_name, opener.email) AS opened_by,
                CASE WHEN reviewer.clerk_user_id IS NULL THEN NULL
                     ELSE COALESCE(reviewer.full_name, reviewer.email) END AS reviewed_by,
                c.reviewed_at, c.created_at, c.updated_at
         FROM warranty_claims c
         JOIN warranties w ON w.id = c.warranty_id
         JOIN staff_memberships opener ON opener.clerk_user_id = c.opened_by
         LEFT JOIN staff_memberships reviewer ON reviewer.clerk_user_id = c.reviewed_by
         WHERE c.warranty_id = ANY($1::text[])
         ORDER BY c.created_at DESC`,
        [warrantyIds],
      )
      : { rows: [] as {
        id: string; warranty_id: string; branch_id: string; summary: string; evidence: string;
        status: WarrantyClaim["status"]; resolution: string | null; opened_by: string;
        reviewed_by: string | null; reviewed_at: Date | null; created_at: Date; updated_at: Date;
      }[] };
    warrantyClaims = claimResult.rows.map((claim) => ({
      id: claim.id,
      warrantyId: claim.warranty_id,
      branchId: claim.branch_id as BranchId,
      summary: claim.summary,
      evidence: claim.evidence,
      status: claim.status,
      resolution: claim.resolution ?? undefined,
      openedBy: claim.opened_by,
      reviewedBy: claim.reviewed_by ?? undefined,
      reviewedAt: claim.reviewed_at?.toISOString(),
      createdAt: claim.created_at.toISOString(),
      updatedAt: claim.updated_at.toISOString(),
      attachments: [],
    }));

    const claimIds = warrantyClaims.map((claim) => claim.id);
    if (claimIds.length) {
      const attachmentResult = await pool.query<{
        id: string;
        claim_id: string;
        original_filename: string;
        content_type: WarrantyClaimAttachment["contentType"];
        byte_size: number;
        uploaded_by: string;
        created_at: Date;
      }>(
        `SELECT a.id, a.claim_id, a.original_filename, a.content_type, a.byte_size,
                COALESCE(m.full_name, m.email) AS uploaded_by, a.created_at
         FROM warranty_claim_attachments a
         JOIN staff_memberships m ON m.clerk_user_id = a.uploaded_by
         WHERE a.claim_id = ANY($1::text[])
         ORDER BY a.created_at DESC`,
        [claimIds],
      );
      const attachmentsByClaim = new Map<string, WarrantyClaimAttachment[]>();
      for (const attachment of attachmentResult.rows) {
        const attachments = attachmentsByClaim.get(attachment.claim_id) ?? [];
        attachments.push({
          id: attachment.id,
          fileName: attachment.original_filename,
          contentType: attachment.content_type,
          byteSize: attachment.byte_size,
          uploadedBy: attachment.uploaded_by,
          uploadedAt: attachment.created_at.toISOString(),
        });
        attachmentsByClaim.set(attachment.claim_id, attachments);
      }
      warrantyClaims = warrantyClaims.map((claim) => ({
        ...claim,
        attachments: attachmentsByClaim.get(claim.id) ?? [],
      }));
    }

    const auditResult = actor.role === "owner"
      ? await pool.query<{
        id: string; policy_id: string | null; policy_version: number | null;
        warranty_id: string | null; claim_id: string | null; action: string;
        details: string; full_name: string | null; email: string | null; created_at: Date;
      }>(
        `SELECT e.id, e.policy_id, e.policy_version, e.warranty_id, e.claim_id, e.action,
                e.details, m.full_name, m.email, e.created_at
         FROM warranty_audit_events e
         LEFT JOIN staff_memberships m ON m.clerk_user_id = e.actor_user_id
         ORDER BY e.created_at DESC LIMIT 200`,
      )
      : await pool.query<{
        id: string; policy_id: string | null; policy_version: number | null;
        warranty_id: string | null; claim_id: string | null; action: string;
        details: string; full_name: string | null; email: string | null; created_at: Date;
      }>(
        `SELECT e.id, e.policy_id, e.policy_version, e.warranty_id, e.claim_id, e.action,
                e.details, m.full_name, m.email, e.created_at
         FROM warranty_audit_events e
         LEFT JOIN staff_memberships m ON m.clerk_user_id = e.actor_user_id
         WHERE e.warranty_id = ANY($1::text[]) OR e.claim_id = ANY($2::text[])
         ORDER BY e.created_at DESC LIMIT 200`,
        [warrantyIds, claimIds],
      );
    warrantyAuditEvents = auditResult.rows.map((event) => {
      const entityType: WarrantyAuditEvent["entityType"] = event.policy_id ? "policy" : event.warranty_id ? "warranty" : "claim";
      return {
        id: event.id,
        entityType,
        entityId: event.policy_id ?? event.warranty_id ?? event.claim_id ?? "",
        policyVersion: event.policy_version ?? undefined,
        action: event.action,
        details: event.details,
        actorLabel: event.full_name || event.email || "Garage OS staff",
        occurredAt: event.created_at.toISOString(),
      };
    });
  }

  const currentBranch = actor.role === "owner"
    ? "all"
    : branches[0]?.id ?? "branch-a";
  const state: GarageState = {
    locale: "ar",
    currentBranch,
    branches,
    services,
    decisions: settings,
    drafts: [],
    auditEvents,
    customers,
    bookings,
    jobs,
    jobEvents,
    warrantyPolicies,
    warrantyVerificationSettings,
    warranties,
    warrantyInvoiceDrafts,
    warrantyQrPrintEvents,
    warrantyClaims,
    warrantyAuditEvents,
  };

  return { actor, state };
}
