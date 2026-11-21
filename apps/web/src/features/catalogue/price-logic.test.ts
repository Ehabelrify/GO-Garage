import { describe, expect, it } from "vitest";
import type { PackageVersion } from "@garage/domain";
import { aggregationOptions, canPublish, isExampleData, priceDiff, priceFormFrom, priceGroup, taxRuleOptions, validatePriceForm } from "./price-logic";

const ruleRef = { id: "tax", version: 1 };
const occ = { id: "occ", version: 1 };
const approval = { approvedBy: "u", approvedAt: "d", evidenceRef: "private:x", reason: "r" };
const base = (id: string, over: Partial<PackageVersion> = {}): PackageVersion => ({
  ref: { id, version: 1 }, revision: 1, kind: "package", name: { ar: "ا", en: "A" }, vehicleCategoryIds: ["sedan"], vehicleModels: [], branchIds: ["b1"],
  effectiveFrom: null, effectiveThrough: null, scope: [], work: [],
  price: { state: "unconfigured", missing: [] }, tax: { state: "unconfigured", missing: [] }, workAggregation: { state: "unconfigured", missing: [] },
  provenance: "", approval: null, state: "draft", ...over,
});
const priced = (id: string) => base(id, {
  price: { state: "approved", value: { minor: 125000, currency: "EGP" }, policy: { id: "p", version: 1 }, approval },
  tax: { state: "approved", value: { rule: ruleRef, amount: { minor: 0, currency: "EGP" } }, policy: ruleRef, approval },
  workAggregation: { state: "approved", value: { rule: occ, mode: "sum" }, policy: occ, approval },
});
const major = (minor: number) => minor / 100;
const parse = (text: string) => { const v = Number(text.replace(/,/g, "")); return text.trim() !== "" && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null; };
const ok = (code: string) => ["EGP", "SAR", "USD"].includes(code);

describe("owner price editing logic", () => {
  it("labels seeded examples", () => {
    expect(isExampleData(base("a", { provenance: "Advertised list. Example data." }))).toBe(true);
    expect(isExampleData(base("a", { provenance: "Owner confirmed" }))).toBe(false);
  });
  it("offers existing rules and lets an edited draft publish", () => {
    const list = [priced("a"), base("b")];
    expect(taxRuleOptions(list)).toHaveLength(1);
    expect(aggregationOptions(list)[0].mode).toBe("sum");
    expect(canPublish(base("b"))).toBe(false);
    const edited = base("b", { priceChange: { price: { minor: 1, currency: "EGP" }, tax: { minor: 0, currency: "EGP" }, effectiveFrom: "2026-11-01", reason: "r", taxRule: ruleRef, aggregation: { rule: occ, mode: "sum" }, previous: { price: null, tax: null } } });
    expect(canPublish(edited)).toBe(true);
  });
  it("prefills from the approved price and validates the form", () => {
    const form = priceFormFrom(priced("a"), "EGP", "2026-11-21", major);
    expect(form.price).toBe("1250");
    expect(form.taxRuleKey).toBe("tax:1");
    expect(validatePriceForm({ ...form, reason: "" }, parse, "2026-11-21", ok).reason).toBeDefined();
    expect(validatePriceForm({ ...form, reason: "x", price: "-5" }, parse, "2026-11-21", ok).price).toBeDefined();
    expect(validatePriceForm({ ...form, reason: "x", currency: "EUR" }, parse, "2026-11-21", ok).currency).toBeDefined();
    expect(validatePriceForm({ ...form, reason: "x", effectiveFrom: "2027-01-01" }, parse, "2026-11-21", ok).effectiveFrom).toBeDefined();
    expect(Object.keys(validatePriceForm({ ...form, reason: "x" }, parse, "2026-11-21", ok))).toEqual([]);
  });
  it("requires rules for an unpriced item", () => {
    const form = priceFormFrom(base("n"), "SAR", "2026-11-21", major);
    expect(form.currency).toBe("SAR");
    expect(validatePriceForm({ ...form, reason: "x", price: "10" }, parse, "2026-11-21", ok).taxRule).toBeDefined();
  });
  it("computes a diff only within one currency", () => {
    expect(priceDiff({ minor: 100, currency: "EGP" }, { minor: 150, currency: "EGP" }).delta).toBe(50);
    expect(priceDiff({ minor: 100, currency: "EGP" }, { minor: 150, currency: "USD" })).toMatchObject({ delta: null, sameCurrency: false });
    expect(priceDiff(null, { minor: 5, currency: "EGP" }).delta).toBeNull();
  });
  it("groups packages for the price list", () => {
    expect(priceGroup({ kind: "package", ref: { id: "seed-pkg-ppf-pro-sedan", version: 1 } })).toBe("ppf");
    expect(priceGroup({ kind: "standalone", ref: { id: "seed-pkg-addon-vkool", version: 1 } })).toBe("addon");
  });
});
