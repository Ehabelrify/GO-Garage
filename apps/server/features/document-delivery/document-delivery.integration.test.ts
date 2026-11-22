import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GarageActor } from "../auth/authz";

/**
 * P2T-006/P2T-007: sending an invoice to a customer needs recorded WhatsApp consent. Without it the answer is 422 and nothing
 * is written; with it exactly one delivery-log row is written and a replay of the same idempotency key returns that row.
 * Runs only against the disposable CI database (GARAGE_TEST_DATABASE_URL); otherwise skipped. Messaging stays simulated
 * (no provider), so the status is always sent-simulated. document_delivery_log and issued invoices are append-only by
 * design, so cleanup is best effort and leftovers carry this run's unique ids.
 */
const testDatabaseUrl = process.env.GARAGE_TEST_DATABASE_URL;
const originalEnvironment = { databaseUrl: process.env.DATABASE_URL, environmentId: process.env.GARAGE_ENVIRONMENT_ID };
const integration = testDatabaseUrl ? describe : describe.skip;
const suffix = crypto.randomUUID();
const environmentId = `it-docdel-${suffix}`;
const branchId = `it-dd-branch-${suffix}`;
const ownerId = `it-dd-owner-${suffix}`;
const channelId = `it-dd-channel-${suffix}`;
const noConsentCustomer = `it-dd-cust-no-${suffix}`;
const consentCustomer = `it-dd-cust-yes-${suffix}`;
const owner: GarageActor = { userId: ownerId, email: `${ownerId}@example.test`, name: "Fictional Delivery Owner", role: "owner", branchIds: [] };

integration("Document delivery requires consent and is idempotent", () => {
  let db: typeof import("../../infrastructure/database/db");
  let delivery: typeof import("./document-delivery-service");
  const invoiceFor = (customer: string) => `it-dd-inv-${customer}`;
  const logRows = async (invoiceId: string) =>
    (await db.pool.query<{ idempotency_key: string; status: string; delivery_mode: string; trigger: string; sent_by: string; recipient_masked: string }>(
      `SELECT idempotency_key, status, delivery_mode, trigger, sent_by, recipient_masked FROM document_delivery_log
       WHERE environment_id = $1 AND document_kind = 'invoice' AND document_id = $2`, [environmentId, invoiceId])).rows;

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("GARAGE_TEST_DATABASE_URL is required for database integration tests.");
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.GARAGE_ENVIRONMENT_ID = environmentId;
    db = await import("../../infrastructure/database/db");
    delivery = await import("./document-delivery-service");

    await db.pool.query(
      `INSERT INTO branches (id, name_en, name_ar, location_label, daily_dropoff_limit, working_hours, clean_bays, general_bays, weekly_day_off)
       VALUES ($1, 'Delivery Branch', 'فرع اختبار', 'Disposable', 8, 10, 1, 2, 'Friday')`, [branchId]);
    await db.pool.query(
      `INSERT INTO staff_memberships (clerk_user_id, email, full_name, role, branch_ids, status) VALUES ($1, $2, 'Fictional Delivery Owner', 'owner', '{}'::text[], 'active')`,
      [ownerId, owner.email]);
    await db.pool.query(`INSERT INTO messaging_channels (id, provider, display_label, status) VALUES ($1, 'simulated', 'Delivery test channel', 'disconnected')`, [channelId]);
    for (const [index, customer] of [noConsentCustomer, consentCustomer].entries()) {
      await db.pool.query(
        `INSERT INTO customers (id, name, phone, phone_normalized, preferred_language) VALUES ($1, 'Fictional Delivery Customer', '+20 100 000 0304', $2, 'en')`,
        [customer, `2010000304${index}${suffix.replaceAll("-", "").slice(0, 8)}`]);
      await db.pool.query(`INSERT INTO vehicles (id, customer_id, make, model, year, plate) VALUES ($1, $2, 'Sample', 'Delivery Vehicle', 2025, $3)`, [`veh-${customer}`, customer, `DD-${index}-${suffix.slice(0, 6)}`]);
      await db.pool.query("INSERT INTO customer_branches (customer_id, branch_id) VALUES ($1, $2)", [customer, branchId]);
      await db.pool.query(
        `INSERT INTO invoices (id, environment_id, branch_id, customer_id, vehicle_id, source, idempotency_key, number, status, currency, subtotal_minor, tax_minor, total_minor, issue_date)
         VALUES ($1, $2, $3, $4, $5, 'manual', $6, $7, 'issued', 'EGP', 5000, 0, 5000, CURRENT_DATE)`,
        [invoiceFor(customer), environmentId, branchId, customer, `veh-${customer}`, `it-key-${customer}`, `INV-DD-${index}-${suffix.slice(0, 8)}`]);
    }
    await db.pool.query(
      `INSERT INTO messaging_customer_consents (channel_id, customer_id, purpose, status, evidence_ref, consented_at, consented_by, revision)
       VALUES ($1, $2, 'service', 'granted', 'private:it-docdel/consent', now() - interval '1 day', $3, 1)`, [channelId, consentCustomer, ownerId]);
  });

  afterAll(async () => {
    try {
      if (!db) return;
      const attempt = async (sql: string, params: unknown[]) => { try { await db.pool.query(sql, params); } catch { /* append-only or referenced: expected */ } };
      await attempt("DELETE FROM messaging_customer_consents WHERE channel_id = $1", [channelId]);
      await attempt("DELETE FROM messaging_channels WHERE id = $1", [channelId]);
      for (const customer of [noConsentCustomer, consentCustomer]) {
        await attempt("DELETE FROM invoices WHERE customer_id = $1", [customer]);
        await attempt("DELETE FROM customer_branches WHERE customer_id = $1", [customer]);
        await attempt("DELETE FROM vehicles WHERE customer_id = $1", [customer]);
        await attempt("DELETE FROM customers WHERE id = $1", [customer]);
      }
      await db.pool.end();
    } finally {
      if (originalEnvironment.databaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalEnvironment.databaseUrl;
      if (originalEnvironment.environmentId === undefined) delete process.env.GARAGE_ENVIRONMENT_ID; else process.env.GARAGE_ENVIRONMENT_ID = originalEnvironment.environmentId;
    }
  });

  it("answers 422 CONSENT_REQUIRED without consent and writes nothing", async () => {
    const request = { documentKind: "invoice" as const, documentId: invoiceFor(noConsentCustomer), channel: "whatsapp" as const, idempotencyKey: `it-dd-key-no-${suffix}` };
    await expect(delivery.sendDocument(owner, request)).rejects.toMatchObject({ status: 422, code: "CONSENT_REQUIRED" });
    expect(await logRows(invoiceFor(noConsentCustomer))).toHaveLength(0);
    // The failed attempt did not burn the key: the history is empty.
    expect((await delivery.listDeliveries(owner, "invoice", invoiceFor(noConsentCustomer))).deliveries).toHaveLength(0);
  });

  it("writes one log row with consent and replays the same key without a second row", async () => {
    const invoiceId = invoiceFor(consentCustomer);
    const request = { documentKind: "invoice" as const, documentId: invoiceId, channel: "whatsapp" as const, idempotencyKey: `it-dd-key-yes-${suffix}` };
    const first = await delivery.sendDocument(owner, request);
    expect(first).toMatchObject({ replayed: false, simulated: true, entry: { documentKind: "invoice", documentId: invoiceId, status: "sent-simulated", trigger: "manual", deliveryMode: "simulated" } });
    expect(await logRows(invoiceId)).toHaveLength(1);
    expect((await logRows(invoiceId))[0]).toMatchObject({ sent_by: ownerId, status: "sent-simulated" });
    expect((await logRows(invoiceId))[0].recipient_masked).not.toContain("2010000304");

    const replay = await delivery.sendDocument(owner, request);
    expect(replay).toMatchObject({ replayed: true });
    expect(replay.entry.id).toBe(first.entry.id);
    expect(await logRows(invoiceId)).toHaveLength(1);

    // The same key for a different document is a conflict, not a second send.
    await expect(delivery.sendDocument(owner, { ...request, documentId: invoiceFor(noConsentCustomer) })).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    expect(await logRows(invoiceFor(noConsentCustomer))).toHaveLength(0);
  });

  it("the append-only log rejects UPDATE and DELETE", async () => {
    const invoiceId = invoiceFor(consentCustomer);
    await expect(db.pool.query("UPDATE document_delivery_log SET body = 'x' WHERE environment_id = $1 AND document_id = $2", [environmentId, invoiceId])).rejects.toThrow(/append-only/i);
    await expect(db.pool.query("DELETE FROM document_delivery_log WHERE environment_id = $1 AND document_id = $2", [environmentId, invoiceId])).rejects.toThrow(/append-only/i);
  });
});
