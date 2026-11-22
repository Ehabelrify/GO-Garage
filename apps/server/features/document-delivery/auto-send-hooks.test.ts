import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GarageActor } from "../auth/authz";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query },
  withTransaction: async (run: (client: { query: typeof query }) => unknown) => run({ query }),
}));
vi.mock("../commercial/benefit-service", () => ({ materializeBenefitsInTransaction: vi.fn().mockResolvedValue([]) }));
vi.mock("../warranty/warranty-invoices", () => ({ ensureWarrantyInvoiceDraft: vi.fn().mockResolvedValue("inv-draft-1") }));
const quotes = await import("../commercial/quote-service");
const warranty = await import("../warranty/issuance-service");

const owner: GarageActor = { userId: "o1", email: "", name: "o", role: "owner", branchIds: ["b1"] };
const ctx = { mode: "operational", environmentId: "default" } as never;
const policyValue = { validityDays: 30, acceptanceMethods: ["staff-recorded"], evidenceRequired: false, overrideRole: "owner", taxTreatment: { id: "tax", version: 1 } };
const canonical = (value: unknown): string => JSON.stringify(value, (_k, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

/** Business queries are answered by `business`; once the delivery savepoint opens, every other statement fails like a broken delivery. */
function script(business: (sql: string, args: unknown[]) => { rows: unknown[]; rowCount?: number }) {
  const seen: string[] = [];
  let guarded = false;
  query.mockReset();
  query.mockImplementation(async (rawSql?: string, args: unknown[] = []) => {
    const sql = String(rawSql ?? "");
    seen.push(sql);
    if (sql.startsWith("SAVEPOINT")) { guarded = true; return { rows: [], rowCount: 0 }; }
    if (sql.startsWith("ROLLBACK TO SAVEPOINT") || sql.startsWith("RELEASE SAVEPOINT")) { guarded = false; return { rows: [], rowCount: 0 }; }
    if (guarded) throw new Error("simulated delivery failure");
    const out = business(sql, args);
    return { rowCount: out.rows.length, ...out };
  });
  return seen;
}
beforeEach(() => query.mockReset());

describe("auto-send hooks never fail the business action", () => {
  it("quote offered: a delivery error leaves createQuoteRevision successful", async () => {
    const seen = script((sql) => {
      if (sql.includes("FROM quote_heads")) return { rows: [{ id: "q1", branch_id: "b1", customer_id: "c1", vehicle_id: "v1", current_revision: 0, accepted_revision: null }] };
      if (sql.includes("FROM vehicles v")) return { rows: [{ model: "Civic", category_id: "sedan" }] };
      if (sql.includes("FROM services")) return { rows: [{ id: "s" }] };
      if (sql.includes("commercial_policy_versions")) return { rows: [{ family: "quote-acceptance", value: policyValue }] };
      return { rows: [] };
    });
    const line = { id: "l1", scopeItemId: "sc1", quantity: 1, unitPrice: { minor: 1000, currency: "EGP" }, discount: { minor: 0, currency: "EGP" }, tax: { minor: 0, currency: "EGP" } };
    const ref = await quotes.createQuoteRevisionInTransaction({ query } as never, ctx, owner, {
      quoteId: "q1", branchId: "b1", customerId: "c1", vehicle: { vehicleId: "v1", model: "Civic", categoryId: "sedan" }, packageVersion: null,
      scope: [{ id: "sc1", serviceId: "s", gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1 }],
      work: [{ id: "w1", serviceId: "s", scopeItemIds: ["sc1"], occupancyRule: { id: "occ", version: 1 } }], lines: [line],
      priceOrigin: { kind: "manual", actorId: "o1", reason: "agreed" }, taxTreatment: { id: "tax", version: 1 }, acceptancePolicy: { id: "qa", version: 1 },
      validThrough: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), warrantyBindings: [], benefitBindings: [], state: "offered",
    } as never);
    expect(ref).toEqual({ quoteId: "q1", revision: 1 });
    expect(seen.some((s) => s.startsWith("ROLLBACK TO SAVEPOINT"))).toBe(true);
  });

  it("quote accepted: a delivery error leaves acceptQuote successful", async () => {
    const lines = [{ id: "l1", scopeItemId: "sc1", quantity: 1, unitPrice: { minor: 1000, currency: "EGP" }, discount: { minor: 0, currency: "EGP" }, tax: { minor: 0, currency: "EGP" } }];
    const snapshot = { input: { lines, vehicle: { vehicleId: "v1" }, scope: [], work: [], warrantyBindings: [], benefitBindings: [], taxTreatment: { id: "tax", version: 1 }, packageVersion: null }, total: { minor: 1000, currency: "EGP" }, acceptanceTerms: policyValue };
    const digest = hash({ quoteId: "q1", revision: 1, snapshot });
    const seen = script((sql) => {
      if (sql.includes("FROM quote_heads")) return { rows: [{ id: "q1", branch_id: "b1", customer_id: "c1", vehicle_id: "v1", current_revision: 1, accepted_revision: null }] };
      if (sql.includes("FROM quote_versions")) return { rows: [{ quote_id: "q1", revision: 1, state: "offered", snapshot, digest, valid_through: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10) }] };
      return { rows: [] };
    });
    const result = await quotes.acceptQuote(ctx, owner, { ref: { quoteId: "q1", revision: 1 }, expectedDigest: digest, acceptanceEvidenceRef: "private:ev/1", idempotencyKey: "k1" });
    expect(result.ref).toEqual({ quoteId: "q1", revision: 1 });
    expect(seen.some((s) => s.startsWith("ROLLBACK TO SAVEPOINT"))).toBe(true);
  });

  it("warranty issuance: a delivery error leaves issueCoverageInTransaction successful", async () => {
    const seen = script((sql) => {
      if (sql.includes("FROM warranty_issuance_requests")) return { rows: [] };
      if (sql.includes("FROM jobs j")) return { rows: [{ id: "j1", branch_id: "b1", assigned_user_id: null, stage: "delivered", customer_id: "c1", vehicle_id: "v1", service_id: "svc", accepted_quote_id: null, accepted_quote_revision: null, delivery_date: "2026-11-01" }] };
      if (sql.includes("count(*)")) return { rows: [{ count: "0" }] };
      if (sql.includes("FROM warranty_policies")) return { rows: [{ name: "P", eligible_service_ids: ["svc"], auto_issue: true, start_rule: "job-delivery", duration_months: 12, coverage_kind: "fixed", lifetime_definition: null, status: "published", exclusions: "x", evidence_requirements: "y", review_role: "owner", response_days: 3 }] };
      if (sql.includes("FROM services")) return { rows: [{}] };
      return { rows: [] };
    });
    const result = await warranty.issueCoverageInTransaction({ query } as never, ctx, owner, { jobId: "j1", componentId: null, policyRef: { id: "wp", version: 1 }, source: "job-delivery", idempotencyKey: "k1" });
    expect(result.warrantyId).toMatch(/^warranty-/);
    expect(seen.some((s) => s.startsWith("ROLLBACK TO SAVEPOINT"))).toBe(true);
  });
});
