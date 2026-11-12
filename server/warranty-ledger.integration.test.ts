import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GarageActor } from "./authz";
import type { RequestWithActor } from "./auth";

const integration = process.env.DATABASE_URL ? describe : describe.skip;
const suffix = crypto.randomUUID();
const branchId = `warranty-ledger-a-${suffix}`;
const otherBranchId = `warranty-ledger-b-${suffix}`;
const serviceId = `warranty-ledger-service-${suffix}`;
const managerId = `warranty-ledger-manager-${suffix}`;
const ownerId = `warranty-ledger-owner-${suffix}`;
const customerId = `warranty-ledger-customer-${suffix}`;
const otherCustomerId = `warranty-ledger-other-customer-${suffix}`;
const vehicleId = `warranty-ledger-vehicle-${suffix}`;
const otherVehicleId = `warranty-ledger-other-vehicle-${suffix}`;
const bookingId = `warranty-ledger-booking-${suffix}`;
const otherBookingId = `warranty-ledger-other-booking-${suffix}`;
const issueBookingId = `warranty-ledger-issue-booking-${suffix}`;
const jobId = `warranty-ledger-job-${suffix}`;
const otherJobId = `warranty-ledger-other-job-${suffix}`;
const issueJobId = `warranty-ledger-issue-job-${suffix}`;
const policyId = `warranty-ledger-policy-${suffix}`;
const warrantyId = `warranty-ledger-record-${suffix}`;
const otherWarrantyId = `warranty-ledger-other-record-${suffix}`;
const managerActor: GarageActor = {
  userId: managerId,
  email: `${managerId}@example.test`,
  name: "Fictional Test Manager",
  role: "branch-manager",
  branchIds: [branchId],
};
const ownerActor: GarageActor = {
  userId: ownerId,
  email: `${ownerId}@example.test`,
  name: "Fictional Test Owner",
  role: "owner",
  branchIds: [],
};

integration("warranty ledger invoices and QR history", () => {
  let testPool: typeof import("./db").pool;
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let baseUrl = "";
  let requestActor: GarageActor = managerActor;
  let generatedWarrantyId: string | undefined;
  let originalVerificationSettings: {
    enabled: boolean;
    approved_fields: string[];
    updated_by: string | null;
    updated_at: Date;
  } | undefined;

  beforeAll(async () => {
    testPool = (await import("./db")).pool;
    const settings = await testPool.query<{
      enabled: boolean; approved_fields: string[]; updated_by: string | null; updated_at: Date;
    }>("SELECT enabled, approved_fields, updated_by, updated_at FROM warranty_verification_settings WHERE singleton = true");
    originalVerificationSettings = settings.rows[0];

    await testPool.query(
      `INSERT INTO branches (id, name_en, name_ar, location_label, daily_dropoff_limit, working_hours, clean_bays, general_bays, weekly_day_off)
       VALUES ($1, 'Ledger Test Branch A', 'فرع سجل أ', 'Fictional', 8, 10, 1, 2, 'Friday'),
              ($2, 'Ledger Test Branch B', 'فرع سجل ب', 'Fictional', 8, 10, 1, 2, 'Friday')`,
      [branchId, otherBranchId],
    );
    await testPool.query(
      `INSERT INTO services (id, name_en, name_ar, bay_type, bay_hours, price_label, active)
       VALUES ($1, 'Test Ceramic Service', 'خدمة سيراميك تجريبية', 'clean', 3, 'Quote after inspection', true)`,
      [serviceId],
    );
    await testPool.query(
      `INSERT INTO staff_memberships (clerk_user_id, email, full_name, role, branch_ids, status)
       VALUES ($1, $2, 'Fictional Test Manager', 'branch-manager', ARRAY[$3]::text[], 'active'),
              ($4, $5, 'Fictional Test Owner', 'owner', '{}'::text[], 'active')`,
      [managerId, managerActor.email, branchId, ownerId, ownerActor.email],
    );
    await testPool.query(
      `INSERT INTO customers (id, name, phone, phone_normalized, preferred_language)
       VALUES ($1, 'Fictional Customer A', '+20 100 000 0101', $3, 'en'),
              ($2, 'Fictional Customer B', '+20 100 000 0102', $4, 'ar')`,
      [customerId, otherCustomerId, `20100000101${suffix.replaceAll("-", "").slice(0, 6)}`, `20100000102${suffix.replaceAll("-", "").slice(0, 6)}`],
    );
    await testPool.query(
      `INSERT INTO vehicles (id, customer_id, make, model, year, plate)
       VALUES ($1, $2, 'Sample', 'Vehicle A', 2024, 'LEDGER A01'),
              ($3, $4, 'Sample', 'Vehicle B', 2023, 'LEDGER B02')`,
      [vehicleId, customerId, otherVehicleId, otherCustomerId],
    );
    await testPool.query(
      `INSERT INTO customer_branches (customer_id, branch_id)
       VALUES ($1, $2), ($3, $4)`,
      [customerId, branchId, otherCustomerId, otherBranchId],
    );
    await testPool.query(
      `INSERT INTO bookings (id, customer_id, vehicle_id, service_id, branch_id, dropoff_date, dropoff_time, expected_pickup, status, created_by)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, '09:00', CURRENT_DATE, 'confirmed', $6),
              ($7, $8, $9, $4, $10, CURRENT_DATE, '10:00', CURRENT_DATE, 'confirmed', $6),
              ($11, $2, $3, $4, $5, CURRENT_DATE, '11:00', CURRENT_DATE, 'confirmed', $6)`,
      [bookingId, customerId, vehicleId, serviceId, branchId, managerId, otherBookingId, otherCustomerId, otherVehicleId, otherBranchId, issueBookingId],
    );
    await testPool.query(
      `INSERT INTO jobs (id, booking_id, branch_id, stage)
       VALUES ($1, $2, $3, 'delivered'), ($4, $5, $6, 'delivered'), ($7, $8, $3, 'delivered')`,
      [jobId, bookingId, branchId, otherJobId, otherBookingId, otherBranchId, issueJobId, issueBookingId],
    );
    await testPool.query(
      `INSERT INTO job_events (id, job_id, from_stage, to_stage, actor_user_id)
       VALUES ($1, $2, 'ready', 'delivered', $3)`,
      [`warranty-ledger-delivery-event-${suffix}`, issueJobId, managerId],
    );
    await testPool.query(
      `INSERT INTO warranty_policies
         (policy_id, version, name, eligible_service_ids, auto_issue, start_rule, duration_months,
          exclusions, evidence_requirements, review_role, response_days, status, created_by, published_by, published_at)
       VALUES ($1, 1, 'Fictional Test Policy', ARRAY[$2]::text[], false, 'job-delivery', 12,
               'Test-only exclusion', 'Test-only evidence rule', 'branch-manager', 14, 'published', $3, $3, now())`,
      [policyId, serviceId, ownerId],
    );
    await testPool.query(
      `INSERT INTO warranties
         (id, policy_id, policy_version, job_id, customer_id, vehicle_id, branch_id, service_id, start_date, expires_on, issued_by)
       VALUES ($1, $2, 1, $3, $4, $5, $6, $7, CURRENT_DATE, CURRENT_DATE + 30, $8),
              ($9, $2, 1, $10, $11, $12, $13, $7, CURRENT_DATE, CURRENT_DATE + 30, $8)`,
      [warrantyId, policyId, jobId, customerId, vehicleId, branchId, serviceId, managerId, otherWarrantyId, otherJobId, otherCustomerId, otherVehicleId, otherBranchId],
    );

    const { warrantyRouter, publicWarrantyVerificationRouter } = await import("./routes/warranties");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as RequestWithActor).actor = requestActor;
      next();
    });
    app.use("/api/warranties", warrantyRouter);
    app.use("/api/public/warranty-verification", publicWarrantyVerificationRouter);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!testPool) return;
    if (originalVerificationSettings) {
      await testPool.query(
        `UPDATE warranty_verification_settings
         SET enabled = $1, approved_fields = $2::text[], updated_by = $3, updated_at = $4
         WHERE singleton = true`,
        [
          originalVerificationSettings.enabled,
          originalVerificationSettings.approved_fields,
          originalVerificationSettings.updated_by,
          originalVerificationSettings.updated_at,
        ],
      );
    }
    await testPool.query("DELETE FROM warranty_verification_settings_audit WHERE actor_user_id = $1", [ownerId]);
    const warrantyIds = [warrantyId, otherWarrantyId, ...(generatedWarrantyId ? [generatedWarrantyId] : [])];
    await testPool.query("DELETE FROM warranty_qr_print_events WHERE warranty_id = ANY($1::text[])", [warrantyIds]);
    await testPool.query("DELETE FROM warranty_invoice_drafts WHERE warranty_id = ANY($1::text[])", [warrantyIds]);
    await testPool.query("DELETE FROM warranty_audit_events WHERE warranty_id = ANY($1::text[])", [warrantyIds]);
    await testPool.query("DELETE FROM warranty_claims WHERE warranty_id = ANY($1::text[])", [warrantyIds]);
    await testPool.query("DELETE FROM warranties WHERE id = ANY($1::text[])", [warrantyIds]);
    await testPool.query("DELETE FROM warranty_policies WHERE policy_id = $1", [policyId]);
    await testPool.query("DELETE FROM job_events WHERE job_id = ANY($1::text[])", [[jobId, otherJobId, issueJobId]]);
    await testPool.query("DELETE FROM jobs WHERE id = ANY($1::text[])", [[jobId, otherJobId, issueJobId]]);
    await testPool.query("DELETE FROM bookings WHERE id = ANY($1::text[])", [[bookingId, otherBookingId, issueBookingId]]);
    await testPool.query("DELETE FROM customer_branches WHERE customer_id = ANY($1::text[])", [[customerId, otherCustomerId]]);
    await testPool.query("DELETE FROM vehicles WHERE id = ANY($1::text[])", [[vehicleId, otherVehicleId]]);
    await testPool.query("DELETE FROM customers WHERE id = ANY($1::text[])", [[customerId, otherCustomerId]]);
    await testPool.query("DELETE FROM staff_memberships WHERE clerk_user_id = ANY($1::text[])", [[managerId, ownerId]]);
    await testPool.query("DELETE FROM services WHERE id = $1", [serviceId]);
    await testPool.query("DELETE FROM branches WHERE id = ANY($1::text[])", [[branchId, otherBranchId]]);
  });

  it("creates draft-only invoices and traces QR preparation, printing, replacement and revocation", async () => {
    const request = async (path: string, method = "GET", body?: unknown) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const responseText = await response.text();
      try {
        return { response, body: JSON.parse(responseText) as Record<string, any> };
      } catch {
        throw new Error(`${method} ${path} returned non-JSON ${response.status}: ${responseText.slice(0, 220)}`);
      }
    };

    const created = await request(`/api/warranties/${warrantyId}/invoice-draft`, "POST", {});
    expect(created.response.status).toBe(201);
    const invoiceId = created.body.invoiceId as string;
    expect(invoiceId).toBeTruthy();
    expect((await request(`/api/warranties/${warrantyId}/invoice-draft`, "POST", {})).body.invoiceId).toBe(invoiceId);
    const initialItem = await testPool.query<{ description: string; quantity: string; unit_amount: string | null }>(
      "SELECT description, quantity, unit_amount FROM warranty_invoice_draft_items WHERE invoice_id = $1",
      [invoiceId],
    );
    expect(initialItem.rows[0]).toMatchObject({
      description: expect.stringContaining("Test Ceramic Service"),
      quantity: "1.00",
      unit_amount: null,
    });

    const updated = await request(`/api/warranties/${warrantyId}/invoice-draft`, "PUT", {
      items: [
        { description: "Ceramic service", quantity: 1, unitAmount: 1250 },
        { description: "Surface preparation", quantity: 2, unitAmount: 150 },
      ],
      taxRatePercent: 14,
      paidAmount: 300,
      paymentMethod: "cash",
      notes: "Fictional draft note",
    });
    expect(updated.response.status).toBe(200);
    const storedInvoice = await testPool.query<{
      id: string; status: string; tax_rate_percent: string; paid_amount: string; payment_method: string;
    }>(
      "SELECT id, status, tax_rate_percent, paid_amount, payment_method FROM warranty_invoice_drafts WHERE warranty_id = $1",
      [warrantyId],
    );
    expect(storedInvoice.rows[0]).toMatchObject({ id: invoiceId, status: "draft", tax_rate_percent: "14.00", paid_amount: "300.00", payment_method: "cash" });
    expect((await testPool.query("SELECT id FROM warranty_invoice_draft_items WHERE invoice_id = $1", [invoiceId])).rowCount).toBe(2);

    requestActor = ownerActor;
    const otherInvoice = await request(`/api/warranties/${otherWarrantyId}/invoice-draft`, "POST", {});
    expect(otherInvoice.response.status).toBe(201);
    requestActor = managerActor;
    const issued = await request("/api/warranties", "POST", {
      policyId,
      policyVersion: 1,
      jobId: issueJobId,
    });
    expect(issued.response.status).toBe(201);
    expect(issued.body.warrantyId).toBeTruthy();
    generatedWarrantyId = issued.body.warrantyId as string;
    const issuedInvoice = await testPool.query<{ status: string; item_count: string }>(
      `SELECT invoice.status, count(item.id)::text AS item_count
       FROM warranty_invoice_drafts invoice
       LEFT JOIN warranty_invoice_draft_items item ON item.invoice_id = invoice.id
       WHERE invoice.warranty_id = $1
       GROUP BY invoice.id`,
      [issued.body.warrantyId],
    );
    expect(issuedInvoice.rows[0]).toEqual({ status: "draft", item_count: "1" });

    const forbiddenBranchInvoice = await request(`/api/warranties/${otherWarrantyId}/invoice-draft`, "POST", {});
    expect(forbiddenBranchInvoice.response.status).toBe(403);
    requestActor = { ...managerActor, role: "technician" };
    const forbiddenRoleInvoice = await request(`/api/warranties/${warrantyId}/invoice-draft`, "POST", {});
    expect(forbiddenRoleInvoice.response.status).toBe(403);

    requestActor = ownerActor;
    const settings = await request("/api/warranties/verification-settings", "PUT", {
      enabled: true,
      approvedFields: ["service", "status"],
      approvedTerms: true,
    });
    expect(settings.response.status).toBe(200);
    const prepared = await request(`/api/warranties/${warrantyId}/verification-token`, "POST", {});
    expect(prepared.response.status).toBe(201);
    const firstToken = prepared.body.token as string;

    requestActor = managerActor;
    const firstPrint = await request(`/api/warranties/${warrantyId}/verification-token/print`, "POST", {});
    const reprint = await request(`/api/warranties/${warrantyId}/verification-token/print`, "POST", {});
    expect(firstPrint.body.action).toBe("printed");
    expect(reprint.body.action).toBe("reprinted");
    const scan = await request(`/api/public/warranty-verification/${encodeURIComponent(firstToken)}`);
    expect(scan.response.status).toBe(200);
    expect(scan.body).toMatchObject({ verified: true, status: "active" });
    expect(scan.body).not.toHaveProperty("customerName");
    expect(scan.body).not.toHaveProperty("phone");
    expect(scan.body).not.toHaveProperty("plate");

    requestActor = ownerActor;
    const replacement = await request(`/api/warranties/${warrantyId}/verification-token`, "POST", {});
    expect(replacement.response.status).toBe(201);
    const replacementToken = replacement.body.token as string;
    const storedToken = await testPool.query<{ token_hash: string }>(
      "SELECT token_hash FROM warranty_verification_tokens WHERE warranty_id = $1 AND revoked_at IS NULL",
      [warrantyId],
    );
    expect(storedToken.rows[0].token_hash).not.toBe(replacementToken);
    const obsoleteScan = await request(`/api/public/warranty-verification/${encodeURIComponent(firstToken)}`);
    expect(obsoleteScan.response.status).toBe(404);

    const { loadGarageBootstrap } = await import("./bootstrap");
    const managerBootstrap = await loadGarageBootstrap(managerActor);
    expect(managerBootstrap.state.warranties.map((item) => item.id)).toContain(warrantyId);
    expect(managerBootstrap.state.warranties.map((item) => item.id)).toContain(issued.body.warrantyId);
    expect(managerBootstrap.state.warranties.map((item) => item.id)).not.toContain(otherWarrantyId);
    const bootstrapInvoice = managerBootstrap.state.warrantyInvoiceDrafts.find((item) => item.warrantyId === warrantyId);
    expect(bootstrapInvoice?.items).toHaveLength(2);
    expect(bootstrapInvoice?.paymentRecordedBy).toBe(managerActor.name);
    expect(bootstrapInvoice?.paymentRecordedAt).toBeTruthy();
    expect(JSON.stringify(managerBootstrap.state.warrantyQrPrintEvents)).not.toContain(firstToken);
    expect(JSON.stringify(managerBootstrap.state.warrantyQrPrintEvents)).not.toContain(replacementToken);
    expect(managerBootstrap.state.warrantyInvoiceDrafts.map((item) => item.warrantyId)).not.toContain(otherWarrantyId);
    expect(managerBootstrap.state.warrantyQrPrintEvents.map((event) => event.action)).toEqual(
      expect.arrayContaining(["prepared", "printed", "reprinted", "revoked", "replaced"]),
    );

    const revoked = await request(`/api/warranties/${warrantyId}/verification-token`, "DELETE", {});
    expect(revoked.response.status).toBe(200);
    const finalScan = await request(`/api/public/warranty-verification/${encodeURIComponent(replacementToken)}`);
    expect(finalScan.response.status).toBe(404);
  });
});
