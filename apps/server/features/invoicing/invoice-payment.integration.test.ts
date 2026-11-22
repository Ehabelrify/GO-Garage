import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PolicyRef } from "@garage/domain";
import type { GarageActor } from "../auth/authz";

/**
 * P2T-003: a payment writes exactly one finance `collection` event in its own transaction, a retry never duplicates it,
 * and without an approved + attested collections definition nothing is written. Runs only against the disposable CI
 * database (GARAGE_TEST_DATABASE_URL); otherwise the whole suite is skipped and nothing connects anywhere.
 * Append-only tables (money events, payment references, invoice events, policy versions) cannot be cleaned up by design;
 * every row carries this run's unique suffix or environment id, so the leftovers are inert in a throwaway database.
 */
const testDatabaseUrl = process.env.GARAGE_TEST_DATABASE_URL;
const integration = testDatabaseUrl ? describe : describe.skip;
const suffix = crypto.randomUUID();
const environmentId = `it-invoice-pay-${suffix}`;
const branchId = `it-invpay-branch-${suffix}`;
const ownerId = `it-invpay-owner-${suffix}`;
const customerId = `it-invpay-customer-${suffix}`;
const vehicleId = `it-invpay-vehicle-${suffix}`;
const originalEnvironment = { databaseUrl: process.env.DATABASE_URL, environmentId: process.env.GARAGE_ENVIRONMENT_ID };
const today = () => new Date().toISOString().slice(0, 10);

integration("Invoice payment writes one finance collection event (P2T-003)", () => {
  let db: typeof import("../../infrastructure/database/db");
  let invoiceService: typeof import("./invoice-service");
  let owner: GarageActor;
  const invoiceIds: string[] = [];

  async function makeInvoice(currency: string, totalMinor: number): Promise<string> {
    const id = `it-inv-${crypto.randomUUID()}`;
    await db.pool.query(
      `INSERT INTO invoices (id, environment_id, branch_id, customer_id, vehicle_id, source, idempotency_key, number, status, currency,
         subtotal_minor, tax_minor, total_minor, issue_date)
       VALUES ($1,$2,$3,$4,$5,'manual',$6,$7,'issued',$8,$9,0,$9,CURRENT_DATE)`,
      [id, environmentId, branchId, customerId, vehicleId, `it-key-${id}`, `INV-IT-${id.slice(-12)}`, currency, totalMinor]);
    invoiceIds.push(id);
    return id;
  }
  const events = async (invoiceId: string, reference?: string) =>
    (await db.pool.query<{ kind: string; amount_minor: string; source_method: string; source_reference: string }>(
      `SELECT kind, amount_minor::text AS amount_minor, source_method, source_reference FROM operational_money_events
       WHERE environment_id = $1 AND source_method = 'invoice-payment' AND source_reference LIKE $2`,
      [environmentId, `${invoiceId}:${reference ?? "%"}`])).rows;
  const payments = async (invoiceId: string) =>
    (await db.pool.query("SELECT 1 FROM invoice_payment_references WHERE invoice_id = $1", [invoiceId])).rowCount ?? 0;
  const pay = (reference: string, amountMinor: number, expectedRevision: number) =>
    ({ expectedRevision, amountMinor, method: "cash" as const, reference, receivedOn: today() });

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("GARAGE_TEST_DATABASE_URL is required for database integration tests.");
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.GARAGE_ENVIRONMENT_ID = environmentId;
    db = await import("../../infrastructure/database/db");
    invoiceService = await import("./invoice-service");
    const policyService = await import("../commercial/policy-service");
    const financeService = await import("../finance/finance-service");
    const context = policyService.commercialContext;
    expect(context.environmentId).toBe(environmentId);
    owner = { userId: ownerId, email: `${ownerId}@example.test`, name: "Fictional Payment Owner", role: "owner", branchIds: [] };

    await db.pool.query(
      `INSERT INTO branches (id, name_en, name_ar, location_label, daily_dropoff_limit, working_hours, clean_bays, general_bays, weekly_day_off)
       VALUES ($1, 'Invoice Payment Branch', 'فرع اختبار', 'Disposable', 6, 10, 1, 2, 'Friday')`, [branchId]);
    await db.pool.query(
      `INSERT INTO staff_memberships (clerk_user_id, email, full_name, role, branch_ids, status)
       VALUES ($1, $2, 'Fictional Payment Owner', 'owner', '{}'::text[], 'active')`, [ownerId, owner.email]);
    await db.pool.query(
      `INSERT INTO customers (id, name, phone, phone_normalized, preferred_language) VALUES ($1, 'Fictional Payer', '+20 100 000 0301', $2, 'en')`,
      [customerId, `2010000301${suffix.replaceAll("-", "").slice(0, 8)}`]);
    await db.pool.query(
      `INSERT INTO vehicles (id, customer_id, make, model, year, plate) VALUES ($1, $2, 'Sample', 'Payment Vehicle', 2025, $3)`,
      [vehicleId, customerId, `PAY-${suffix.slice(0, 8)}`]);
    await db.pool.query("INSERT INTO customer_branches (customer_id, branch_id) VALUES ($1, $2)", [customerId, branchId]);

    // Approved, evidenced, activated and attested finance definition for EGP collections (no USD one on purpose).
    const id = `finance-definition:${suffix}:collections`;
    const value = {
      metric: "collections", currency: "EGP", minorUnitExponent: 2, reportingTimezone: "Africa/Cairo",
      recognitionRule: { ar: "المصدر المسجل", en: "Recorded source" }, taxTreatment: { ar: "غير منطبق", en: "Not applicable" },
      sourceKinds: ["collection"], completenessRule: { ar: "كل التحصيلات", en: "All collections" }, emptyPeriod: "complete", requiredSourceKinds: ["collection"],
    };
    const draft = await policyService.proposeCommercialPolicy(context, owner, { id, expectedVersion: 0, value });
    const approved: PolicyRef = await policyService.approveCommercialPolicy(context, owner, {
      id, expectedVersion: draft.version, value, evidenceRef: `private:it-invoice-pay/${suffix}`, reason: "Synthetic definition for the disposable integration test" });
    await policyService.activateCommercialPolicy(context, owner, { id, version: approved.version, expectedActiveVersion: null });
    await financeService.attestFinanceDefinition(context, owner, { definition: approved, evidenceRef: `private:it-invoice-pay/${suffix}/attest` });
  });

  afterAll(async () => {
    try {
      if (db) {
        // Best effort: append-only history blocks most deletes by design; failures are expected and ignored.
        const attempt = async (sql: string, params: unknown[]) => { try { await db.pool.query(sql, params); } catch { /* append-only or referenced */ } };
        await attempt("DELETE FROM invoices WHERE id = ANY($1::text[]) AND status = 'draft'", [invoiceIds]);
        await db.pool.end();
      }
    } finally {
      if (originalEnvironment.databaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalEnvironment.databaseUrl;
      if (originalEnvironment.environmentId === undefined) delete process.env.GARAGE_ENVIRONMENT_ID; else process.env.GARAGE_ENVIRONMENT_ID = originalEnvironment.environmentId;
    }
  });

  it("creates exactly one collection event per payment and a retry never duplicates it", async () => {
    const invoiceId = await makeInvoice("EGP", 10_000);
    await invoiceService.recordPayment(owner, invoiceId, pay("R1", 4_000, 1));
    const first = await events(invoiceId, "R1");
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ kind: "collection", amount_minor: "4000", source_method: "invoice-payment", source_reference: `${invoiceId}:R1` });

    // Retry with the stale revision, then with the fresh revision but the same reference: both refused, nothing duplicated.
    await expect(invoiceService.recordPayment(owner, invoiceId, pay("R1", 4_000, 1))).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    await expect(invoiceService.recordPayment(owner, invoiceId, pay("R1", 4_000, 2))).rejects.toMatchObject({ status: 409, code: "DUPLICATE_REFERENCE" });
    expect(await events(invoiceId)).toHaveLength(1);
    expect(await payments(invoiceId)).toBe(1);

    // A different reference is a different payment and gets its own event.
    await invoiceService.recordPayment(owner, invoiceId, pay("R2", 6_000, 2));
    expect(await events(invoiceId)).toHaveLength(2);
    const row = (await db.pool.query<{ status: string; paid_minor: string }>("SELECT status, paid_minor::text AS paid_minor FROM invoices WHERE id = $1", [invoiceId])).rows[0];
    expect(row).toEqual({ status: "paid", paid_minor: "10000" });
  });

  it("records one event when two clients submit the same payment at once", async () => {
    const invoiceId = await makeInvoice("EGP", 8_000);
    const outcomes = await Promise.allSettled([
      invoiceService.recordPayment(owner, invoiceId, pay("RACE", 3_000, 1)),
      invoiceService.recordPayment(owner, invoiceId, pay("RACE", 3_000, 1)),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter((o): o is PromiseRejectedResult => o.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ status: 409 });
    expect(await events(invoiceId)).toHaveLength(1);
    expect(await payments(invoiceId)).toBe(1);
  });

  it("refuses the payment and writes nothing when no approved attested definition exists for the currency", async () => {
    const invoiceId = await makeInvoice("USD", 5_000);
    await expect(invoiceService.recordPayment(owner, invoiceId, pay("NODEF", 1_000, 1))).rejects.toMatchObject({ status: 422, code: "FINANCE_DEFINITION_REQUIRED" });
    expect(await events(invoiceId)).toHaveLength(0);
    expect(await payments(invoiceId)).toBe(0);
    const row = (await db.pool.query<{ status: string; paid_minor: string; revision: number }>("SELECT status, paid_minor::text AS paid_minor, revision FROM invoices WHERE id = $1", [invoiceId])).rows[0];
    expect(row).toEqual({ status: "issued", paid_minor: "0", revision: 1 });
  });
});
