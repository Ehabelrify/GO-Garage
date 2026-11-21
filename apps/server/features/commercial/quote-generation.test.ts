import { describe, expect, it, vi } from "vitest";
import type { PackageVersion } from "@garage/domain";
import type { GarageActor } from "../auth/authz";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query },
  withTransaction: async (run: (client: { query: typeof query }) => unknown) => run({ query }),
}));
const gen = await import("./quote-generation");

const actor = (role: GarageActor["role"] = "receptionist", extra: Partial<GarageActor> = {}): GarageActor => ({ userId: "u1", email: "", name: role, role, branchIds: ["b1"], ...extra });
const occ = { id: "work-occupancy:x", version: 1 };
const approval = { approvedBy: "o", approvedAt: "", evidenceRef: "private:x", reason: "r" };
const pkg = (over: Record<string, unknown> = {}): PackageVersion => ({
  ref: { id: "pkg-a", version: 2 }, revision: 1, kind: "package", name: { en: "PPF", ar: "ppf" }, vehicleCategoryIds: ["sedan"], vehicleModels: [], branchIds: ["b1"],
  effectiveFrom: null, effectiveThrough: null,
  scope: [{ id: "s1", serviceId: "full-ppf", gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: ["tint"], exclusions: [], quantity: 1 }],
  work: [{ id: "w1", serviceId: "full-ppf", scopeItemIds: ["s1"], occupancyRule: occ }],
  price: { state: "approved", value: { minor: 3000000, currency: "EGP" }, policy: { id: "p", version: 1 }, approval },
  tax: { state: "approved", value: { rule: { id: "t", version: 1 }, amount: { minor: 420000, currency: "EGP" } }, policy: { id: "p2", version: 1 }, approval },
  workAggregation: { state: "unconfigured", missing: [] }, provenance: "", approval: null, state: "published", ...over,
}) as unknown as PackageVersion;
let n = 0;
const base = () => ({
  today: "2026-11-21", actorId: "u1", branchId: "b1", customerId: "c1", vehicle: { vehicleId: "v1", model: "Civic", categoryId: "sedan" }, sourceLabel: "booking bk1",
  serviceId: "full-ppf", serviceActive: true, packages: [pkg()], occupancyFallback: occ, transport: [] as Array<{ id: string; direction: string; mode: string; fee: { minor: number; currency: string } }>, benefitIds: [] as string[],
  terms: { acceptancePolicy: { id: "qa", version: 1 }, taxTreatment: { id: "qt", version: 1 }, validityDays: 30 } as { acceptancePolicy: { id: string; version: number }; taxTreatment: { id: string; version: number }; validityDays: number } | null,
  newId: (prefix: string) => `${prefix}-${++n}`,
});

describe("assembleQuoteDraft", () => {
  it("builds a catalogue draft whose lines equal the approved price and tax", () => {
    const { input, mode, warnings } = gen.assembleQuoteDraft(base());
    expect(mode).toBe("catalogue");
    expect(input.state).toBe("draft");
    expect(input.packageVersion).toEqual({ id: "pkg-a", version: 2 });
    expect(input.priceOrigin).toEqual({ kind: "catalogue" });
    expect(input.lines.reduce((sum, l) => sum + l.unitPrice.minor * l.quantity, 0)).toBe(3000000);
    expect(input.lines.reduce((sum, l) => sum + (l.tax?.minor ?? 0), 0)).toBe(420000);
    expect(input.scope[0].addOnIds).toEqual(["tint"]);
    expect(warnings).not.toContain("tax-not-set");
    expect(input.validThrough).toBe("2026-12-05");
  });
  it("picks one eligible package deterministically and flags ambiguity", () => {
    const second = pkg({ ref: { id: "pkg-b", version: 1 } });
    const a = gen.assembleQuoteDraft({ ...base(), packages: [second, pkg()] });
    expect(a.input.packageVersion?.id).toBe("pkg-a");
    expect(a.warnings).toContain("package-ambiguous");
    expect(gen.assembleQuoteDraft({ ...base(), packages: [second, pkg()], preferredPackageId: "pkg-b" }).input.packageVersion?.id).toBe("pkg-b");
  });
  it("adds transport fees as separate lines in the same currency and drops the catalogue origin", () => {
    const { input, mode, warnings } = gen.assembleQuoteDraft({ ...base(), transport: [{ id: "t1", direction: "pickup", mode: "driver", fee: { minor: 35000, currency: "EGP" } }] });
    expect(mode).toBe("manual");
    expect(input.packageVersion).toBeNull();
    expect(input.priceOrigin).toMatchObject({ kind: "manual", actorId: "u1" });
    expect(input.lines).toHaveLength(2);
    expect(input.lines[1].unitPrice).toEqual({ minor: 35000, currency: "EGP" });
    expect(input.lines[1].scopeItemId).toBe("transport:t1");
    expect(warnings).toEqual(expect.arrayContaining(["transport-added", "tax-not-set"]));
  });
  it("rejects a transport fee in another currency", () => {
    expect(() => gen.assembleQuoteDraft({ ...base(), transport: [{ id: "t1", direction: "pickup", mode: "driver", fee: { minor: 100, currency: "SAR" } }] })).toThrowError(expect.objectContaining({ code: "CURRENCY_MISMATCH" }));
  });
  it("rejects an unsupported or mismatched package currency", () => {
    const odd = pkg({ price: { state: "approved", value: { minor: 100, currency: "GBP" }, policy: { id: "p", version: 1 }, approval } });
    expect(() => gen.assembleQuoteDraft({ ...base(), packages: [odd] })).toThrowError(expect.objectContaining({ code: "CURRENCY_UNSUPPORTED" }));
    const mixed = pkg({ tax: { state: "approved", value: { rule: { id: "t", version: 1 }, amount: { minor: 5, currency: "USD" } }, policy: { id: "p2", version: 1 }, approval } });
    expect(() => gen.assembleQuoteDraft({ ...base(), packages: [mixed] })).toThrowError(expect.objectContaining({ code: "CURRENCY_MISMATCH" }));
  });
  it("refuses an inactive service and ignores unpriced packages", () => {
    expect(() => gen.assembleQuoteDraft({ ...base(), serviceActive: false })).toThrowError(expect.objectContaining({ code: "SERVICE_INACTIVE" }));
    const unpriced = pkg({ price: { state: "unconfigured", missing: ["price"] } });
    const out = gen.assembleQuoteDraft({ ...base(), packages: [unpriced] });
    expect(out.mode).toBe("manual");
    expect(out.input.lines[0].unitPrice.minor).toBe(0);
    expect(out.warnings).toContain("no-catalogue-price");
  });
  it("builds a manual draft from an accepted special request price and validity", () => {
    const { input, warnings } = gen.assembleQuoteDraft({ ...base(), packages: [], request: { title: "Custom wrap", price: { minor: 480000, currency: "SAR" }, validUntil: "2026-12-10" } });
    expect(input.lines[0].unitPrice).toEqual({ minor: 480000, currency: "SAR" });
    expect(input.priceOrigin).toMatchObject({ kind: "manual" });
    expect(input.validThrough).toBe("2026-12-10");
    expect(warnings).toEqual(expect.arrayContaining(["price-from-request", "tax-not-set"]));
    expect(() => gen.assembleQuoteDraft({ ...base(), packages: [], request: { title: "x", price: { minor: 1, currency: "GBP" }, validUntil: null } })).toThrowError(expect.objectContaining({ code: "CURRENCY_UNSUPPORTED" }));
  });
  it("needs an occupancy rule for manual work and caps validity by policy", () => {
    expect(() => gen.assembleQuoteDraft({ ...base(), packages: [], occupancyFallback: null })).toThrowError(expect.objectContaining({ code: "NO_OCCUPANCY_RULE" }));
    expect(gen.generatedValidThrough("2026-11-21", "2027-06-01", 10)).toBe("2026-12-01");
    expect(gen.generatedValidThrough("2026-11-21", "2026-01-01", null)).toBe("2026-12-05");
  });
  it("flags missing terms and available benefits", () => {
    const { warnings, input } = gen.assembleQuoteDraft({ ...base(), terms: null, benefitIds: ["vip"] });
    expect(warnings).toEqual(expect.arrayContaining(["terms-missing", "benefit-available"]));
    expect(input.taxTreatment).toBeNull();
  });
});

describe("generatedQuoteId", () => {
  it("is stable per source and differs between sources", () => {
    expect(gen.generatedQuoteId("booking:1")).toBe(gen.generatedQuoteId("booking:1"));
    expect(gen.generatedQuoteId("booking:1")).not.toBe(gen.generatedQuoteId("booking:2"));
  });
});

describe("generateQuoteDraft", () => {
  const ctx = { mode: "operational", environmentId: "default" } as const;
  const booking = (branch = "b1") => ({ rowCount: 1, rows: [{ id: "bk1", customer_id: "c1", vehicle_id: "v1", branch_id: branch, service_id: "full-ppf", status: "confirmed", accepted_quote_id: null, accepted_quote_revision: null }] });
  it("is denied without quote authority or in a demo session, before any query", async () => {
    query.mockReset();
    await expect(gen.generateQuoteDraft(ctx, actor("technician"), { kind: "booking", bookingId: "bk" })).rejects.toMatchObject({ status: 403 });
    await expect(gen.generateQuoteDraft(ctx, actor("owner", { isDemo: true }), { kind: "booking", bookingId: "bk" })).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });
    expect(query).not.toHaveBeenCalled();
  });
  it("returns the existing quote and creates nothing when the source was already generated", async () => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      if (/FROM bookings WHERE id/.test(sql)) return booking();
      if (/record_archives/.test(sql)) return { rowCount: 0, rows: [] };
      if (/FROM quote_heads/.test(sql)) return { rowCount: 1, rows: [{ current_revision: 2 }] };
      return { rowCount: 0, rows: [] };
    });
    const out = await gen.generateQuoteDraft(ctx, actor(), { kind: "booking", bookingId: "bk1" });
    expect(out).toMatchObject({ created: false, quote: { quoteId: gen.generatedQuoteId("booking:bk1"), revision: 2 } });
    expect(query.mock.calls.some(([sql]) => /INSERT INTO quote_/.test(String(sql)))).toBe(false);
  });
  it("hides a booking outside the actor branches", async () => {
    query.mockReset();
    query.mockResolvedValue(booking("other"));
    await expect(gen.generateQuoteDraft(ctx, actor(), { kind: "booking", bookingId: "bk1" })).rejects.toMatchObject({ status: 404, code: "SOURCE_NOT_FOUND" });
  });
  it("refuses a special request that is not accepted", async () => {
    query.mockReset();
    query.mockResolvedValue({ rowCount: 1, rows: [{ id: "sr1", customer_id: "c1", vehicle_id: "v1", branch_id: "b1", status: "new", title: "t", quoted_price_minor: null, quoted_currency: null, offer_valid_until: null }] });
    await expect(gen.generateQuoteDraft(ctx, actor(), { kind: "special-request", requestId: "sr1" })).rejects.toMatchObject({ status: 409, code: "REQUEST_NOT_ACCEPTED" });
  });
});
