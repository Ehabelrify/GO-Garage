import { describe, expect, it, vi } from "vitest";
import type { PackageVersion } from "@garage/domain";
import type { GarageActor } from "../auth/authz";

type Query = ReturnType<typeof vi.fn>;
const client: { query: Query } = { query: vi.fn() };
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
  withTransaction: vi.fn(async (work: (c: typeof client) => unknown) => work(client)),
}));
const { buildPriceChange, priceEditProblem } = await import("./catalogue-price");
const { savePriceDraft, listPackagePriceHistory } = await import("./catalogue-service");
const { invoiceCurrencyProblem } = await import("../warranty/warranty-invoices");

const approval = { approvedBy: "u", approvedAt: "2026-01-01T00:00:00.000Z", evidenceRef: "private:x", reason: "r" };
const rule = { id: "tax-rule", version: 1 };
const occ = { id: "occ", version: 1 };
const published = (over: Partial<PackageVersion> = {}): PackageVersion => ({
  ref: { id: "pkg", version: 2 }, revision: 2, kind: "package", name: { ar: "ا", en: "A" }, vehicleCategoryIds: ["sedan"], vehicleModels: [], branchIds: ["b1"],
  effectiveFrom: "2026-01-01", effectiveThrough: null,
  scope: [{ id: "s", serviceId: "svc", gradeVersion: null, areas: [], roof: "excluded", addOnIds: [], exclusions: [], quantity: 1 }], work: [],
  price: { state: "approved", value: { minor: 2800000, currency: "EGP" }, policy: { id: "p", version: 1 }, approval },
  tax: { state: "approved", value: { rule, amount: { minor: 0, currency: "EGP" } }, policy: rule, approval },
  workAggregation: { state: "approved", value: { rule: occ, mode: "sum" }, policy: occ, approval },
  provenance: "", approval, state: "published", ...over,
});
const actor = (role: GarageActor["role"], extra: Partial<GarageActor> = {}): GarageActor => ({ userId: `${role}-1`, email: "", name: role, role, branchIds: ["b1"], ...extra });
const input = (over: Record<string, unknown> = {}) => ({
  packageId: "pkg", expectedVersion: 2, expectedRevision: 2, price: { minor: 3000000, currency: "EGP" }, tax: { minor: 0, currency: "EGP" },
  effectiveFrom: "2026-11-01", reason: "New list price", ...over,
});
const row = (over: Record<string, unknown> = {}) => ({
  package_id: "pkg", version: 2, revision: 2, kind: "package", state: "published", name: { ar: "ا", en: "A" }, vehicle_category_ids: ["sedan"], vehicle_models: [], branch_ids: ["b1"],
  effective_from: "2026-01-01", effective_through: null, scope: published().scope, work: [], price: published().price, tax: published().tax, work_aggregation: published().workAggregation,
  provenance: "", approval, ...over,
});

describe("price edit validation", () => {
  it("accepts supported, matching currencies and a past or current effective date", () => {
    expect(priceEditProblem(input() as never, "2026-11-21", { effectiveThrough: null })).toBeNull();
    expect(priceEditProblem({ ...input(), price: { minor: 1, currency: "SAR" }, tax: { minor: 0, currency: "SAR" } } as never, "2026-11-21", { effectiveThrough: null })).toBeNull();
  });
  it("rejects unsupported and mixed currencies and out-of-range dates", () => {
    expect(priceEditProblem({ ...input(), price: { minor: 1, currency: "EUR" } } as never, "2026-11-21", { effectiveThrough: null })?.code).toBe("UNSUPPORTED_CURRENCY");
    expect(priceEditProblem({ ...input(), tax: { minor: 0, currency: "USD" } } as never, "2026-11-21", { effectiveThrough: null })?.code).toBe("MIXED_CURRENCY");
    expect(priceEditProblem(input({ effectiveFrom: "2027-01-01" }) as never, "2026-11-21", { effectiveThrough: null })?.code).toBe("EFFECTIVE_DATE_INVALID");
    expect(priceEditProblem(input({ effectiveFrom: "2026-11-01" }) as never, "2026-11-21", { effectiveThrough: "2026-10-01" })?.code).toBe("EFFECTIVE_DATE_INVALID");
  });
  it("keeps the previous approved tax and aggregation rules and records the old price", () => {
    const change = buildPriceChange(input() as never, published());
    expect(change.taxRule).toEqual(rule);
    expect(change.aggregation).toEqual({ rule: occ, mode: "sum" });
    expect(change.previous.price).toEqual({ minor: 2800000, currency: "EGP" });
  });
});

describe("savePriceDraft", () => {
  it("is owner only (catalogue.manage) and touches nothing otherwise", async () => {
    client.query.mockReset();
    await expect(savePriceDraft({ mode: "operational", environmentId: "t" }, actor("receptionist"), input())).rejects.toMatchObject({ status: 403 });
    expect(client.query).not.toHaveBeenCalled();
  });
  it("rejects negative or fractional minor units before the database", async () => {
    await expect(savePriceDraft({ mode: "operational", environmentId: "t" }, actor("owner"), input({ price: { minor: -1, currency: "EGP" } }))).rejects.toThrow();
    await expect(savePriceDraft({ mode: "operational", environmentId: "t" }, actor("owner"), input({ price: { minor: 1.5, currency: "EGP" } }))).rejects.toThrow();
  });
  it("refuses a stale version and a retired package", async () => {
    client.query.mockReset();
    client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [row({ version: 3 })], rowCount: 1 });
    await expect(savePriceDraft({ mode: "operational", environmentId: "t" }, actor("owner"), input())).rejects.toMatchObject({ status: 409, code: "STALE_CATALOGUE" });
    client.query.mockReset();
    client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [row({ state: "retired" })], rowCount: 1 });
    await expect(savePriceDraft({ mode: "operational", environmentId: "t" }, actor("owner"), input())).rejects.toMatchObject({ status: 409, code: "PACKAGE_RETIRED" });
  });
  it("rejects mixed currency without writing", async () => {
    client.query.mockReset();
    client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [row()], rowCount: 1 });
    await expect(savePriceDraft({ mode: "operational", environmentId: "t" }, actor("owner"), input({ tax: { minor: 0, currency: "SAR" } }))).rejects.toMatchObject({ code: "MIXED_CURRENCY" });
    expect(client.query).toHaveBeenCalledTimes(2);
  });
  it("inserts a NEW draft version (never updates the published row) and audits it", async () => {
    client.query.mockReset();
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // advisory lock
      .mockResolvedValueOnce({ rows: [row()], rowCount: 1 }) // latest
      .mockResolvedValue({ rows: [{ x: 1 }], rowCount: 1 }); // policy checks + inserts
    await expect(savePriceDraft({ mode: "operational", environmentId: "t" }, actor("owner"), input())).resolves.toEqual({ id: "pkg", version: 3 });
    const sql = client.query.mock.calls.map((call) => String(call[0]));
    expect(sql.some((text) => /INSERT INTO catalogue_package_versions/.test(text) && /'draft'/.test(text))).toBe(true);
    expect(sql.some((text) => /UPDATE catalogue_package_versions/.test(text))).toBe(false);
    expect(sql.some((text) => /INSERT INTO catalogue_audit/.test(text))).toBe(true);
  });
});

describe("price history", () => {
  it("is owner only", async () => {
    await expect(listPackagePriceHistory(actor("branch-manager"), "pkg")).rejects.toMatchObject({ status: 403 });
  });
});

describe("invoice currency rules", () => {
  it("accepts supported currencies and inheriting lines", () => {
    expect(invoiceCurrencyProblem({ requested: "SAR", stored: "EGP", lines: [{}, { currency: "SAR" }], paymentEntered: false })).toBeNull();
    expect(invoiceCurrencyProblem({ requested: undefined, stored: "USD", lines: [{ currency: "USD" }], paymentEntered: true })).toBeNull();
  });
  it("rejects unsupported, mixed and payment-locked changes", () => {
    expect(invoiceCurrencyProblem({ requested: "EUR", stored: "EGP", lines: [], paymentEntered: false })).toBe("UNSUPPORTED_CURRENCY");
    expect(invoiceCurrencyProblem({ requested: "SAR", stored: "EGP", lines: [{ currency: "EGP" }], paymentEntered: false })).toBe("MIXED_CURRENCY");
    expect(invoiceCurrencyProblem({ requested: "USD", stored: "EGP", lines: [], paymentEntered: true })).toBe("CURRENCY_LOCKED");
  });
});
