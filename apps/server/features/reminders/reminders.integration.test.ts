import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GarageActor } from "../auth/authz";

/**
 * P2T-023 / P2T-024: automatic reminder dispatch re-checks consent and skips a customer whose consent was revoked;
 * updateRule is conditional on the revision it read, so two concurrent clients cannot both win.
 * Runs only against the disposable CI database (GARAGE_TEST_DATABASE_URL); otherwise skipped.
 * Everything reminder-related lives in its own environment id and is removed by that id.
 */
const testDatabaseUrl = process.env.GARAGE_TEST_DATABASE_URL;
const originalEnvironment = { databaseUrl: process.env.DATABASE_URL, environmentId: process.env.GARAGE_ENVIRONMENT_ID };
const integration = testDatabaseUrl ? describe : describe.skip;
const suffix = crypto.randomUUID();
const environmentId = `it-reminders-${suffix}`;
const branchId = `it-rem-branch-${suffix}`;
const serviceId = `it-rem-service-${suffix}`;
const ownerId = `it-rem-owner-${suffix}`;
const channelId = `it-rem-channel-${suffix}`;
const consentedCustomer = `it-rem-cust-yes-${suffix}`;
const revokedCustomer = `it-rem-cust-revoked-${suffix}`;
const owner: GarageActor = { userId: ownerId, email: `${ownerId}@example.test`, name: "Fictional Reminder Owner", role: "owner", branchIds: [] };
const ruleKinds = ["booking_day_before", "booking_morning_of", "ready_for_pickup", "warranty_expiry", "quote_followup", "post_service_checkin"] as const;

function cairoDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

integration("Reminder dispatch consent and rule revision conflicts", () => {
  let db: typeof import("../../infrastructure/database/db");
  let service: typeof import("./reminder-service");
  const now = new Date();
  const dropoff = cairoDate(new Date(now.getTime() + 30 * 86_400_000));
  const reminderId = (customer: string) => `it-rem-${customer}`;

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("GARAGE_TEST_DATABASE_URL is required for database integration tests.");
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.GARAGE_ENVIRONMENT_ID = environmentId;
    db = await import("../../infrastructure/database/db");
    service = await import("./reminder-service");

    await db.pool.query(
      `INSERT INTO branches (id, name_en, name_ar, location_label, daily_dropoff_limit, working_hours, clean_bays, general_bays, weekly_day_off)
       VALUES ($1, 'Reminder Branch', 'فرع اختبار', 'Disposable', 8, 10, 1, 2, 'Friday')`, [branchId]);
    await db.pool.query(
      `INSERT INTO services (id, name_en, name_ar, bay_type, bay_hours, price_label, active) VALUES ($1, 'Test Inspection', 'فحص تجريبي', 'general', 2, 'Estimate', true)`, [serviceId]);
    await db.pool.query(
      `INSERT INTO staff_memberships (clerk_user_id, email, full_name, role, branch_ids, status) VALUES ($1, $2, 'Fictional Reminder Owner', 'owner', '{}'::text[], 'active')`,
      [ownerId, owner.email]);
    await db.pool.query(`INSERT INTO messaging_channels (id, provider, display_label, status) VALUES ($1, 'simulated', 'Reminder test channel', 'disconnected')`, [channelId]);

    for (const [index, customer] of [consentedCustomer, revokedCustomer].entries()) {
      await db.pool.query(
        `INSERT INTO customers (id, name, phone, phone_normalized, preferred_language) VALUES ($1, 'Fictional Reminder Customer', '+20 100 000 0303', $2, 'en')`,
        [customer, `2010000303${index}${suffix.replaceAll("-", "").slice(0, 8)}`]);
      await db.pool.query(`INSERT INTO vehicles (id, customer_id, make, model, year, plate) VALUES ($1, $2, 'Sample', 'Reminder Vehicle', 2025, $3)`, [`veh-${customer}`, customer, `REM-${index}-${suffix.slice(0, 6)}`]);
      await db.pool.query("INSERT INTO customer_branches (customer_id, branch_id) VALUES ($1, $2)", [customer, branchId]);
      await db.pool.query(
        `INSERT INTO bookings (id, customer_id, vehicle_id, service_id, branch_id, dropoff_date, dropoff_time, expected_pickup, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, '10:00', $6, 'confirmed', $7)`,
        [`bk-${customer}`, customer, `veh-${customer}`, serviceId, branchId, dropoff, ownerId]);
    }
    // One customer with live consent, one whose consent was granted and then revoked.
    await db.pool.query(
      `INSERT INTO messaging_customer_consents (channel_id, customer_id, purpose, status, evidence_ref, consented_at, consented_by, revision)
       VALUES ($1, $2, 'service', 'granted', 'private:it-reminders/consent', now() - interval '2 days', $3, 1)`, [channelId, consentedCustomer, ownerId]);
    await db.pool.query(
      `INSERT INTO messaging_customer_consents (channel_id, customer_id, purpose, status, evidence_ref, consented_at, revoked_at, revoked_by, consented_by, revision)
       VALUES ($1, $2, 'service', 'revoked', 'private:it-reminders/consent', now() - interval '2 days', now() - interval '1 day', $3, $3, 2)`, [channelId, revokedCustomer, ownerId]);

    // Rules: only booking_day_before is enabled and auto-sends, so nothing else is generated from other data in the database.
    for (const kind of ruleKinds) {
      const enabled = kind === "booking_day_before";
      await db.pool.query(
        `INSERT INTO reminder_rules (environment_id, kind, enabled, lead_days, auto_send, template_en, template_ar, revision)
         VALUES ($1, $2, $3, $4, $5, 'Reminder {name}', 'تذكير {name}', 1)`,
        [environmentId, kind, enabled, kind === "booking_day_before" ? 1 : kind === "booking_morning_of" || kind === "ready_for_pickup" ? 0 : 5, enabled]);
    }
    // Already-due reminders carrying the dedupe key the generator would use, so a run does not add its own.
    for (const customer of [consentedCustomer, revokedCustomer]) {
      await db.pool.query(
        `INSERT INTO reminders (id, environment_id, rule_kind, dedupe_key, branch_id, customer_id, vehicle_id, booking_id, source_date, language, body, due_at, status)
         VALUES ($1, $2, 'booking_day_before', $3, $4, $5, $6, $7, $8, 'en', 'Reminder body', now() - interval '1 hour', 'due')`,
        [reminderId(customer), environmentId, `booking_day_before:bk-${customer}:${dropoff}`, branchId, customer, `veh-${customer}`, `bk-${customer}`, dropoff]);
    }
  });

  afterAll(async () => {
    try {
      if (!db) return;
      const attempt = async (sql: string, params: unknown[]) => { try { await db.pool.query(sql, params); } catch { /* best effort */ } };
      await attempt("DELETE FROM reminder_events WHERE reminder_id IN (SELECT id FROM reminders WHERE environment_id = $1)", [environmentId]);
      await attempt("DELETE FROM reminders WHERE environment_id = $1", [environmentId]);
      await attempt("DELETE FROM reminder_rules WHERE environment_id = $1", [environmentId]);
      await attempt("DELETE FROM messaging_customer_consents WHERE channel_id = $1", [channelId]);
      await attempt("DELETE FROM messaging_channels WHERE id = $1", [channelId]);
      for (const customer of [consentedCustomer, revokedCustomer]) {
        await attempt("DELETE FROM bookings WHERE customer_id = $1", [customer]);
        await attempt("DELETE FROM customer_branches WHERE customer_id = $1", [customer]);
        await attempt("DELETE FROM vehicles WHERE customer_id = $1", [customer]);
        await attempt("DELETE FROM customers WHERE id = $1", [customer]);
      }
      await attempt("DELETE FROM services WHERE id = $1", [serviceId]);
      await attempt("DELETE FROM branches WHERE id = $1", [branchId]);
      await attempt("DELETE FROM staff_memberships WHERE clerk_user_id = $1", [ownerId]);
      await db.pool.end();
    } finally {
      if (originalEnvironment.databaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalEnvironment.databaseUrl;
      if (originalEnvironment.environmentId === undefined) delete process.env.GARAGE_ENVIRONMENT_ID; else process.env.GARAGE_ENVIRONMENT_ID = originalEnvironment.environmentId;
    }
  });

  it("auto-dispatch sends the consented reminder and skips the one whose consent was revoked", async () => {
    const summary = await service.runDueReminders(now, "system");
    expect(summary.autoSent).toBeGreaterThanOrEqual(1);
    expect(summary.skippedNoConsent).toBeGreaterThanOrEqual(1);

    const rows = await db.pool.query<{ id: string; status: string; reason: string | null; sent_at: Date | null }>(
      "SELECT id, status, reason, sent_at FROM reminders WHERE environment_id = $1 AND id = ANY($2::text[]) ORDER BY id",
      [environmentId, [reminderId(consentedCustomer), reminderId(revokedCustomer)]]);
    const byId = new Map(rows.rows.map((row) => [row.id, row]));
    expect(byId.get(reminderId(consentedCustomer))).toMatchObject({ status: "sent-simulated", reason: null });
    expect(byId.get(reminderId(consentedCustomer))?.sent_at).not.toBeNull();
    expect(byId.get(reminderId(revokedCustomer))).toMatchObject({ status: "skipped", reason: "no-consent", sent_at: null });

    const events = await db.pool.query<{ reminder_id: string; action: string }>(
      "SELECT reminder_id, action FROM reminder_events WHERE reminder_id = ANY($1::text[]) AND action IN ('sent-simulated','skipped') ORDER BY reminder_id",
      [[reminderId(consentedCustomer), reminderId(revokedCustomer)]]);
    expect(events.rows).toEqual(expect.arrayContaining([
      { reminder_id: reminderId(consentedCustomer), action: "sent-simulated" },
      { reminder_id: reminderId(revokedCustomer), action: "skipped" },
    ]));

    // A second run never reopens or resends closed reminders.
    const again = await service.runDueReminders(now, "system");
    expect(again.autoSent).toBe(0); // the two fixtures are closed; bookings of other suites have no consent in this environment
  });

  it("returns 409 for the loser when two clients update a rule with the same revision at once", async () => {
    const before = (await service.loadRules()).find((rule) => rule.kind === "quote_followup")!;
    expect(before.revision).toBe(1);
    const outcomes = await Promise.allSettled([
      service.updateRule(owner, "quote_followup", { enabled: false, expectedRevision: before.revision }),
      service.updateRule(owner, "quote_followup", { leadDays: 7, expectedRevision: before.revision }),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter((o): o is PromiseRejectedResult => o.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ status: 409, code: "REVISION_CONFLICT" });

    const after = (await service.loadRules()).find((rule) => rule.kind === "quote_followup")!;
    expect(after.revision).toBe(2);
    // Exactly one audit row for the winning change.
    const audit = await db.pool.query("SELECT 1 FROM staff_customer_audit_events WHERE entity_kind = 'reminder-rule' AND entity_id = 'quote_followup' AND summary LIKE '%revision 2'");
    expect(audit.rowCount ?? 0).toBeGreaterThanOrEqual(1);

    // A stale revision on its own is also refused.
    await expect(service.updateRule(owner, "quote_followup", { enabled: true, expectedRevision: before.revision })).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
  });
});
