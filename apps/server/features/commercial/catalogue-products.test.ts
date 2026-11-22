import { describe, expect, it, vi } from "vitest";
import type { PackageVersion } from "@garage/domain";
import type { GarageActor } from "../auth/authz";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query },
  withTransaction: async (run: (client: { query: typeof query }) => unknown) => run({ query }),
}));
const { intakeEligible, toIntakeItem, listIntakeItems, savePackageDraft } = await import("./catalogue-service");
const { commercialContext } = await import("./policy-service");

const approval = { approvedBy: "o", approvedAt: "2026-11-01T00:00:00Z", evidenceRef: "private:x", reason: "r" };
const priced = { state: "approved", value: { minor: 120000, currency: "EGP" }, policy: { id: "p", version: 1 }, approval };
const taxed = { state: "approved", value: { rule: { id: "t", version: 1 }, amount: { minor: 0, currency: "EGP" } }, policy: { id: "t", version: 1 }, approval };
const product = (over: Record<string, unknown> = {}): PackageVersion => ({
  ref: { id: "prod-mats", version: 1 }, revision: 1, kind: "product", name: { en: "Floor mats", ar: "دواسات" }, productCategory: { en: "Accessories", ar: "إكسسوارات" },
  vehicleCategoryIds: [], vehicleModels: [], branchIds: ["b1"], effectiveFrom: null, effectiveThrough: null,
  scope: [{ id: "scope-product", serviceId: "product", gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1, productId: "prod-mats", label: { en: "Floor mats", ar: "دواسات" } }],
  work: [], price: priced, tax: taxed, workAggregation: { state: "unconfigured", missing: ["not applicable"] }, provenance: "", approval: null, state: "published", ...over,
}) as unknown as PackageVersion;
const tint = (over: Record<string, unknown> = {}): PackageVersion => ({
  ref: { id: "svc-tint", version: 1 }, revision: 1, kind: "standalone", name: { en: "Tint", ar: "تظليل" }, vehicleCategoryIds: ["sedan"], vehicleModels: [], branchIds: ["b1"], effectiveFrom: null, effectiveThrough: null,
  scope: [{ id: "s1", serviceId: "tint", gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1 }],
  work: [{ id: "w1", serviceId: "tint", scopeItemIds: ["s1"], occupancyRule: { id: "o", version: 1 } }],
  price: priced, tax: taxed, workAggregation: { state: "unconfigured", missing: ["n/a"] }, provenance: "", approval: null, state: "published", ...over,
}) as unknown as PackageVersion;
const actor = (role: GarageActor["role"], extra: Partial<GarageActor> = {}): GarageActor => ({ userId: "u1", email: "", name: role, role, branchIds: ["b1"], ...extra });
const row = (pkg: PackageVersion) => ({
  package_id: pkg.ref.id, version: pkg.ref.version, revision: 1, kind: pkg.kind, state: "published", name: pkg.name, vehicle_category_ids: pkg.vehicleCategoryIds, vehicle_models: pkg.vehicleModels,
  branch_ids: pkg.branchIds, effective_from: null, effective_through: null, scope: pkg.scope, work: pkg.work, price: pkg.price, tax: pkg.tax, work_aggregation: pkg.workAggregation,
  provenance: "", approval: null, product_category: pkg.productCategory ?? null,
});

describe("catalogue products", () => {
  it("maps a product to an intake item with a category, a price and no bay work", () => {
    expect(toIntakeItem(product())).toEqual({
      id: { packageId: "prod-mats", version: 1 }, kind: "product", name: { en: "Floor mats", ar: "دواسات" }, category: { en: "Accessories", ar: "إكسسوارات" },
      price: { minor: 120000, currency: "EGP" }, tax: { minor: 0, currency: "EGP" }, requiresVehicle: false, bayWork: false,
    });
    expect(toIntakeItem(tint())).toMatchObject({ kind: "service", bayWork: true, requiresVehicle: true });
    expect(toIntakeItem(tint({ kind: "package" })).kind).toBe("package");
    expect(toIntakeItem(product({ price: { state: "unconfigured", missing: ["price"] } })).price).toBeNull();
  });
  it("filters by branch and vehicle; a product without category limits is open to every vehicle", () => {
    const sedan = { model: "Civic", categoryId: "sedan" };
    const unclassified = { model: "Civic", categoryId: null };
    expect(intakeEligible(product(), { actor: actor("receptionist"), vehicle: sedan })).toBe(true);
    expect(intakeEligible(tint(), { actor: actor("receptionist"), vehicle: sedan })).toBe(true);
    expect(intakeEligible(tint(), { actor: actor("receptionist"), vehicle: { model: "X", categoryId: "suv" } })).toBe(false);
    expect(intakeEligible(tint(), { actor: actor("receptionist"), vehicle: unclassified })).toBe(true);
    expect(intakeEligible(product(), { actor: actor("receptionist", { branchIds: ["other"] }) })).toBe(false);
    expect(intakeEligible(product(), { actor: actor("owner"), branchId: "b2" })).toBe(false);
    expect(intakeEligible(product(), { actor: actor("owner"), branchId: "b1" })).toBe(true);
  });
  it("lists services, packages and products together, searchable, in one ordered list; technicians are refused", async () => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => String(sql).includes("catalogue_package_active") && !String(sql).includes("grade") ? { rows: [row(product()), row(tint()), row(tint({ ref: { id: "pkg-ppf", version: 1 }, kind: "package", name: { en: "PPF", ar: "ppf" } }))], rowCount: 3 } : { rows: [], rowCount: 0 });
    const all = await listIntakeItems(actor("receptionist"), {});
    expect(all.map((item) => item.kind)).toEqual(["service", "package", "product"]);
    expect((await listIntakeItems(actor("receptionist"), { q: "accessor" })).map((item) => item.id.packageId)).toEqual(["prod-mats"]);
    expect((await listIntakeItems(actor("receptionist"), { kind: "package" })).map((item) => item.id.packageId)).toEqual(["pkg-ppf"]);
    await expect(listIntakeItems(actor("technician"), {})).rejects.toMatchObject({ status: 403 });
    await expect(listIntakeItems(actor("receptionist"), { branchId: "other" })).rejects.toMatchObject({ status: 404 });
  });
  it("saves a product draft without work and refuses malformed products", async () => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes("FROM branches") || text.includes("catalogue_vehicle_categories") || text.includes("commercial_policy_versions")) return { rows: [{ id: "b1" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const draft = product({ state: "draft", price: { state: "unconfigured", missing: ["price"] }, tax: { state: "unconfigured", missing: ["tax"] }, workAggregation: { state: "unconfigured", missing: ["not applicable"] } });
    await expect(savePackageDraft(commercialContext, actor("owner"), { package: draft, expectedRevision: 0 })).resolves.toEqual({ id: "prod-mats", version: 1 });
    const insert = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO catalogue_package_versions"))!;
    expect(String(insert[0])).toContain("product_category");
    expect((insert[1] as unknown[])[3]).toBe("product");
    const withWork = product({ state: "draft", work: [{ id: "w1", serviceId: "tint", scopeItemIds: ["scope-product"], occupancyRule: { id: "o", version: 1 } }] });
    await expect(savePackageDraft(commercialContext, actor("owner"), { package: withWork, expectedRevision: 0 })).rejects.toMatchObject({ code: "INVALID_PRODUCT" });
    await expect(savePackageDraft(commercialContext, actor("owner"), { package: product({ state: "draft", productCategory: null }), expectedRevision: 0 })).rejects.toMatchObject({ code: "PRODUCT_CATEGORY_REQUIRED" });
    await expect(savePackageDraft(commercialContext, actor("receptionist"), { package: draft, expectedRevision: 0 })).rejects.toMatchObject({ status: 403 });
  });
});
