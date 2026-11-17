import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PolicyRef, PromotionRule, QualificationEvidence, QuoteDraftInput } from "@garage/domain";
import type { GarageActor } from "../auth/authz";

const testDatabaseUrl = process.env.GARAGE_TEST_DATABASE_URL;
const integration = testDatabaseUrl ? describe : describe.skip;
const suffix = crypto.randomUUID();
const environmentId = `phase1-rehearsal-${suffix}`;
const branchId = `rehearsal-branch-${suffix}`;
const serviceId = `rehearsal-service-${suffix}`;
const ownerId = `rehearsal-owner-${suffix}`;
const customerId = `rehearsal-customer-${suffix}`;
const vehicleId = `rehearsal-vehicle-${suffix}`;
const originalEnvironment = {
  databaseUrl: process.env.DATABASE_URL,
  executionMode: process.env.GARAGE_EXECUTION_MODE,
  environmentId: process.env.GARAGE_ENVIRONMENT_ID,
};

function cairoDate(): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

integration("Phase 1 commercial migration rehearsal", () => {
  let db: typeof import("../../infrastructure/database/db");
  let context: import("./policy-service").ExecutionContext;
  let owner: GarageActor;
  let quoteAcceptancePolicy: PolicyRef;
  let taxTreatmentPolicy: PolicyRef;
  let occupancyPolicy: PolicyRef;
  let promotionPolicy: PolicyRef;
  let quotedValueDefinition: PolicyRef;
  let collectionDefinition: PolicyRef;
  let policyService: typeof import("./policy-service");
  let quoteService: typeof import("./quote-service");
  let qualificationService: typeof import("./qualification-service");
  let reservationService: typeof import("./reservation-service");
  let availabilityService: typeof import("../operations/availability-service");
  let financeService: typeof import("../finance/finance-service");

  async function approveAndActivate(id: string, value: unknown): Promise<PolicyRef> {
    const draft = await policyService.proposeCommercialPolicy(context, owner, {
      id,
      expectedVersion: 0,
      value,
    });
    const approved = await policyService.approveCommercialPolicy(context, owner, {
      id,
      expectedVersion: draft.version,
      value,
      evidenceRef: `private:phase1-rehearsal/${suffix}/${id.split(":")[0]}`,
      reason: "Synthetic policy used only for the disposable migration rehearsal",
    });
    await policyService.activateCommercialPolicy(context, owner, {
      id,
      version: approved.version,
      expectedActiveVersion: null,
    });
    return approved;
  }

  async function operationalSnapshot() {
    const result = await db.pool.query<{
      accepted_quotes: string;
      reservations: string;
      money_events: string;
      bookings: string;
      jobs: string;
      outbox: string;
      provider_events: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM quote_acceptance_events WHERE environment_id='default') AS accepted_quotes,
         (SELECT count(*)::text FROM promotion_reservations WHERE environment_id='default') AS reservations,
         (SELECT count(*)::text FROM operational_money_events WHERE environment_id='default') AS money_events,
         (SELECT count(*)::text FROM bookings WHERE branch_id <> $1) AS bookings,
         (SELECT count(*)::text FROM jobs WHERE branch_id <> $1) AS jobs,
         (SELECT count(*)::text FROM messaging_outbox) AS outbox,
         (SELECT count(*)::text FROM messaging_provider_events) AS provider_events`,
      [branchId],
    );
    return result.rows[0];
  }

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("GARAGE_TEST_DATABASE_URL is required for database integration tests.");
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.GARAGE_EXECUTION_MODE = "scenario";
    process.env.GARAGE_ENVIRONMENT_ID = environmentId;
    db = await import("../../infrastructure/database/db");
    policyService = await import("./policy-service");
    quoteService = await import("./quote-service");
    qualificationService = await import("./qualification-service");
    reservationService = await import("./reservation-service");
    availabilityService = await import("../operations/availability-service");
    financeService = await import("../finance/finance-service");
    context = policyService.commercialContext;
    expect(context).toMatchObject({ mode: "scenario", environmentId });
    owner = {
      userId: ownerId,
      email: `${ownerId}@example.test`,
      name: "Fictional Rehearsal Owner",
      role: "owner",
      branchIds: [],
    };

    await db.pool.query(
      `INSERT INTO branches
         (id, name_en, name_ar, location_label, daily_dropoff_limit, working_hours,
          clean_bays, general_bays, weekly_day_off)
       VALUES ($1, 'Rehearsal Branch', 'فرع اختبار', 'Disposable', 6, 10, 1, 2, 'Friday')`,
      [branchId],
    );
    await db.pool.query(
      `INSERT INTO staff_memberships (clerk_user_id, email, full_name, role, branch_ids, status)
       VALUES ($1, $2, 'Fictional Rehearsal Owner', 'owner', '{}'::text[], 'active')`,
      [ownerId, `${ownerId}@example.test`],
    );
    await db.pool.query(
      `INSERT INTO customers (id, name, phone, phone_normalized, preferred_language)
       VALUES ($1, 'Fictional Rehearsal Customer', '+20 100 000 0199', $2, 'en')`,
      [customerId, `2010000199${suffix.replaceAll("-", "").slice(0, 6)}`],
    );
    await db.pool.query(
      `INSERT INTO vehicles (id, customer_id, make, model, year, plate)
       VALUES ($1, $2, 'Sample', 'Rehearsal Vehicle', 2025, $3)`,
      [vehicleId, customerId, `TEST-${suffix.slice(0, 8)}`],
    );
    await db.pool.query("INSERT INTO customer_branches (customer_id, branch_id) VALUES ($1, $2)", [customerId, branchId]);
    await db.pool.query(
      `INSERT INTO services (id, name_en, name_ar, bay_type, bay_hours, price_label, active)
       VALUES ($1, 'Rehearsal Service', 'خدمة اختبار', 'general', 2, 'Approved test quote', true)`,
      [serviceId],
    );
    await db.pool.query(
      `INSERT INTO branch_availability_versions
         (branch_id, version, timezone, opens_at, closes_at, working_weekdays, slot_minutes,
          daily_intake_limit, bay_counts, effective_from, approved_by, reason)
       VALUES ($1, 1, 'Africa/Cairo', '08:00', '17:00', ARRAY[0,1,2,3,4,5,6]::integer[], 60,
               6, '{"clean":1,"general":2}'::jsonb, CURRENT_DATE, $2, 'Synthetic rehearsal capacity')`,
      [branchId, ownerId],
    );
    await db.pool.query(
      "INSERT INTO branch_availability_active (branch_id, version, activated_by) VALUES ($1, 1, $2)",
      [branchId, ownerId],
    );
    await db.pool.query(
      `INSERT INTO messaging_environment_marker (singleton, dataset_class, environment_id)
       VALUES (true, 'scenario', $1)
       ON CONFLICT (singleton) DO UPDATE
         SET dataset_class='scenario', environment_id=EXCLUDED.environment_id, recorded_at=now()`,
      [environmentId],
    );

    occupancyPolicy = await approveAndActivate(`work-occupancy:${suffix}`, {
      bayType: "general",
      requiredMinutes: 120,
      durationDays: 1,
      aggregation: "sum",
    });
    taxTreatmentPolicy = await approveAndActivate(`quote-acceptance:${suffix}:tax`, {
      validityDays: 30,
      acceptanceMethods: ["staff-recorded"],
      evidenceRequired: true,
      overrideRole: "owner",
      taxTreatment: { id: `quote-acceptance:${suffix}:tax`, version: 2 },
    });
    quoteAcceptancePolicy = await approveAndActivate(`quote-acceptance:${suffix}:acceptance`, {
      validityDays: 30,
      acceptanceMethods: ["staff-recorded"],
      evidenceRequired: true,
      overrideRole: "owner",
      taxTreatment: taxTreatmentPolicy,
    });
    await approveAndActivate(`reservation-deposit:${branchId}`, {
      validityDays: 30,
      deposit: {
        required: false,
        amount: null,
        refundRule: { ar: "غير مطلوب", en: "Not required" },
      },
      cancellationRule: { ar: "المراجعة", en: "Review" },
      cancellationDisposition: "review-required",
      priceLock: true,
      redemptionTiming: "installation",
      restoreAllowed: true,
      expiryAction: "review-required",
    });
    const promotionId = `promotion-qualification:${suffix}`;
    const promotionRule: PromotionRule = {
      promotionId,
      evidenceKinds: ["grouped-vehicles"],
      evidenceVerification: { required: true, authorizedRoles: ["owner"], expiresAfterDays: 30 },
      maximumUnits: 5,
      recipient: { kind: "customer", transferWarranty: false },
      stackability: { allowed: false, permittedPromotionIds: [] },
      grouping: { minimumVehicles: 1, maximumVehicles: 1, timing: "same-quote", timingWindowHours: 24 },
      discountAllocation: {
        kind: "equal-remainder-by-vehicle",
        total: { minor: 0, currency: "EGP" },
        perVehicle: null,
      },
      exceptionAuthority: { roles: ["owner"], requiresReason: true, requiresEvidence: true },
      beneficiaryRule: { ar: "اختبار الأهلية", en: "Rehearsal eligibility" },
    };
    promotionPolicy = await approveAndActivate(promotionId, promotionRule);
    await db.pool.query(
      `INSERT INTO promotion_pools (environment_id, promotion_id, policy_version, branch_id, maximum_units)
       VALUES ($1, $2, $3, $4, 5)`,
      [environmentId, promotionPolicy.id, promotionPolicy.version, branchId],
    );

    quotedValueDefinition = await approveAndActivate(`finance-definition:${suffix}:quoted`, {
      metric: "quoted-value",
      currency: "EGP",
      minorUnitExponent: 2,
      reportingTimezone: "Africa/Cairo",
      recognitionRule: { ar: "العرض المقبول", en: "Accepted quote" },
      taxTreatment: { ar: "محدد في العرض", en: "Specified on quote" },
      sourceKinds: ["accepted-quote"],
      completenessRule: { ar: "كل العروض المقبولة", en: "All accepted quotes" },
      emptyPeriod: "complete",
      requiredSourceKinds: ["accepted-quote"],
    });
    collectionDefinition = await approveAndActivate(`finance-definition:${suffix}:collections`, {
      metric: "collections",
      currency: "EGP",
      minorUnitExponent: 2,
      reportingTimezone: "Africa/Cairo",
      recognitionRule: { ar: "المصدر المسجل", en: "Recorded source" },
      taxTreatment: { ar: "غير منطبق", en: "Not applicable" },
      sourceKinds: ["collection"],
      completenessRule: { ar: "كل التحصيلات", en: "All collections" },
      emptyPeriod: "complete",
      requiredSourceKinds: ["collection"],
    });
    await financeService.attestFinanceDefinition(context, owner, {
      definition: quotedValueDefinition,
      evidenceRef: `private:phase1-rehearsal/${suffix}/quoted-value`,
    });
    await financeService.attestFinanceDefinition(context, owner, {
      definition: collectionDefinition,
      evidenceRef: `private:phase1-rehearsal/${suffix}/collections`,
    });
  });

  afterAll(async () => {
    if (db) await db.pool.end();
    if (originalEnvironment.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalEnvironment.databaseUrl;
    if (originalEnvironment.executionMode === undefined) delete process.env.GARAGE_EXECUTION_MODE;
    else process.env.GARAGE_EXECUTION_MODE = originalEnvironment.executionMode;
    if (originalEnvironment.environmentId === undefined) delete process.env.GARAGE_ENVIRONMENT_ID;
    else process.env.GARAGE_ENVIRONMENT_ID = originalEnvironment.environmentId;
  });

  it("accepts a quote, reserves and schedules capacity, and reconciles finance sources", async () => {
    const operationalBefore = await operationalSnapshot();
    const today = cairoDate();
    const installDate = addDays(today, 3);
    const availability = await db.withTransaction((client) =>
      availabilityService.listAvailableSlotsForDemand(
        client,
        { kind: "staff", userId: ownerId },
        {
          branchId,
          demand: [{
            componentId: `component-${suffix}`,
            serviceId,
            bayType: "general",
            requiredMinutes: 120,
            durationDays: 1,
            aggregation: "sum",
          }],
          fromDate: installDate,
          toDate: installDate,
        },
      ),
    );
    expect(availability.status).toBe("available");
    if (availability.status !== "available") throw new Error("Rehearsal availability is not configured.");
    expect(availability.slots).toContainEqual({
      dropoffDate: installDate,
      dropoffTime: "09:00",
      expectedPickupDate: installDate,
    });

    const scopeId = `scope-${suffix}`;
    const componentId = `component-${suffix}`;
    const quoteInput: QuoteDraftInput = {
      branchId,
      customerId,
      vehicle: { vehicleId, model: "Rehearsal Vehicle", categoryId: null },
      enquiryRef: null,
      sourceChannelRef: null,
      packageVersion: null,
      scope: [{
        id: scopeId,
        serviceId,
        gradeVersion: null,
        areas: ["whole-vehicle"],
        roof: "not-applicable",
        addOnIds: [],
        exclusions: ["Synthetic test scope only"],
        quantity: 1,
      }],
      work: [{
        id: componentId,
        serviceId,
        scopeItemIds: [scopeId],
        occupancyRule: occupancyPolicy,
      }],
      lines: [{
        id: `line-${suffix}`,
        scopeItemId: scopeId,
        quantity: 1,
        unitPrice: { minor: 10_000, currency: "EGP" },
        discount: { minor: 0, currency: "EGP" },
        tax: { minor: 1_400, currency: "EGP" },
      }],
      priceOrigin: { kind: "manual", actorId: ownerId, reason: "Synthetic disposable rehearsal" },
      taxTreatment: taxTreatmentPolicy,
      acceptancePolicy: quoteAcceptancePolicy,
      validThrough: addDays(today, 20),
      warrantyBindings: [],
      benefitBindings: [],
      state: "offered",
    };
    const quoteRef = await quoteService.createQuoteRevision(context, owner, quoteInput);
    const offered = await quoteService.readQuoteRevision(context, owner, quoteRef);
    const accepted = await quoteService.acceptQuote(context, owner, {
      ref: quoteRef,
      expectedDigest: offered.digest,
      acceptanceEvidenceRef: `private:phase1-rehearsal/${suffix}/quote-acceptance`,
      idempotencyKey: `accept-${suffix}`,
    });
    expect(accepted.total).toEqual({ minor: 11_400, currency: "EGP" });
    expect(accepted.acceptance.method).toBe("staff-recorded");

    const evidence: QualificationEvidence = {
      kind: "grouped-vehicles",
      referenceIds: [vehicleId],
      verifiedBy: ownerId,
      verifiedAt: new Date().toISOString(),
    };
    const qualification = await qualificationService.evaluateQualification(context, owner, {
      promotionRef: promotionPolicy,
      beneficiaryId: customerId,
      vehicleIds: [vehicleId],
      evidence: [evidence],
    });
    expect(qualification.state).toBe("eligible");
    if (qualification.state !== "eligible") throw new Error("Rehearsal qualification did not pass.");

    const reservation = await reservationService.reserveOffer(context, owner, {
      quoteRef,
      promotionRef: promotionPolicy,
      qualificationId: qualification.qualificationId,
      effectiveOn: today,
      idempotencyKey: `reserve-${suffix}`,
    });
    expect(reservation.status).toBe("reserved");
    expect(reservation.deposit.state).toBe("not-required");
    expect(reservation.bookingId).toBeNull();
    const beforeSchedule = await db.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM bookings WHERE branch_id=$1 AND accepted_quote_id=$2",
      [branchId, quoteRef.quoteId],
    );
    expect(beforeSchedule.rows[0].count).toBe("0");

    const scheduled = await reservationService.scheduleReservation(context, owner, {
      reservationId: reservation.id,
      expectedRevision: reservation.revision,
      slot: { dropoffDate: installDate, dropoffTime: "09:00", configurationVersion: availability.configurationVersion },
      idempotencyKey: `schedule-${suffix}`,
    });
    expect(scheduled.reservation.status).toBe("scheduled");
    expect(scheduled.reservation.bookingId).toBe(scheduled.bookingId);
    const occupancy = await db.pool.query<{ bay_type: string; required_minutes: number }>(
      "SELECT bay_type, required_minutes FROM booking_occupancy WHERE booking_id=$1",
      [scheduled.bookingId],
    );
    expect(occupancy.rows).toEqual([{ bay_type: "general", required_minutes: 120 }]);

    const event = await financeService.recordMoneyEvent(context, owner, {
      kind: "collection",
      amount: { minor: 2_500, currency: "EGP" },
      effectiveAt: new Date().toISOString(),
      branchId,
      customerId,
      jobId: null,
      quoteId: quoteRef.quoteId,
      reservationId: reservation.id,
      sourceMethod: "rehearsal-cash",
      sourceReference: `receipt-${suffix}`,
      definition: collectionDefinition,
      reason: "Synthetic source for migration reconciliation",
      evidenceRef: `private:phase1-rehearsal/${suffix}/collection`,
      idempotencyKey: `record-${suffix}`,
    });

    const filter = { branchId, from: today, to: today, groupBy: "day" as const };
    const report = await financeService.getFinancialReport(owner, filter);
    expect(report.metrics["quoted-value"]).toMatchObject({
      state: "available",
      amount: { minor: 11_400, currency: "EGP", minorUnitExponent: 2 },
      sourceCount: 1,
    });
    expect(report.metrics.collections).toMatchObject({
      state: "available",
      amount: { minor: 2_500, currency: "EGP", minorUnitExponent: 2 },
      sourceCount: 1,
    });
    const quotedDrilldown = await financeService.getFinancialDrilldown(owner, { filter, metricId: "quoted-value" });
    expect(quotedDrilldown.rows).toHaveLength(1);
    expect(quotedDrilldown.rows[0].sourceId).toBe(`${quoteRef.quoteId}:${quoteRef.revision}`);
    const collectionDrilldown = await financeService.getFinancialDrilldown(owner, { filter, metricId: "collections" });
    expect(collectionDrilldown.rows).toHaveLength(1);
    expect(collectionDrilldown.rows[0].id).toBe(`event:${event.eventId}`);

    const scenarioState = await db.pool.query<{ dataset_class: string; environment_id: string }>(
      "SELECT dataset_class, environment_id FROM messaging_environment_marker WHERE singleton=true",
    );
    expect(scenarioState.rows[0]).toEqual({ dataset_class: "scenario", environment_id: environmentId });
    expect(await operationalSnapshot()).toEqual(operationalBefore);
  });
});
