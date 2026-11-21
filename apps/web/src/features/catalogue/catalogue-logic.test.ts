import { describe, expect, it } from "vitest";
import type { PackageVersion } from "@garage/domain";
import { occupancyOptions, addOnUsage, approvalGap, confirmation, historyOf, latestById, priceMatrix, roofState, toggleId } from "./catalogue-logic";

const base = (id: string, version: number, over: Partial<PackageVersion> = {}): PackageVersion => ({
  ref: { id, version }, revision: version, kind: "package", name: { ar: "ا", en: "A" }, vehicleCategoryIds: ["sedan"], vehicleModels: [],
  branchIds: ["b1"], effectiveFrom: null, effectiveThrough: null,
  scope: [{ id: "s1", serviceId: "svc", gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1 }], work: [],
  price: { state: "unconfigured", missing: [] }, tax: { state: "unconfigured", missing: [] }, workAggregation: { state: "unconfigured", missing: [] },
  provenance: "", approval: null, state: "draft", ...over,
});
const approved = { state: "approved" as const, value: { minor: 125000, currency: "EGP" }, policy: { id: "p", version: 1 }, approval: { approvedBy: "u", approvedAt: "d", evidenceRef: "private:x", reason: "r" } };

describe("catalogue logic", () => {
  it("keeps the highest version per id and lists history newest first", () => {
    const list = [base("a", 2), base("a", 1), base("b", 1)];
    expect(latestById(list).get("a")?.ref.version).toBe(2);
    expect(historyOf(list, "a").map((p) => p.ref.version)).toEqual([2, 1]);
  });
  it("labels unconfigured prices as advertised", () => {
    expect(confirmation(base("a", 1))).toBe("advertised");
    expect(confirmation(base("a", 1, { price: approved, approval: approved.approval }))).toBe("confirmed");
  });
  it("builds the price matrix only for applicable categories", () => {
    const rows = priceMatrix([base("a", 1, { price: approved, vehicleCategoryIds: ["sedan"] }), base("r", 1, { state: "retired" })], [{ id: "sedan", name: { en: "Sedan", ar: "سيدان" } }, { id: "suv", name: { en: "SUV", ar: "دفع" } }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].cells.sedan?.minor).toBe(125000);
    expect(rows[0].cells.suv).toBeNull();
    expect(rows[0].appliesTo.suv).toBe(false);
  });
  it("summarises roof state", () => {
    expect(roofState([{ roof: "not-applicable" }])).toBe("not-applicable");
    expect(roofState([{ roof: "included" }, { roof: "excluded" }])).toBe("mixed");
    expect(roofState([{ roof: "included" }])).toBe("included");
  });
  it("collects add-on usage", () => {
    const p = base("a", 1); p.scope[0].addOnIds = ["x"];
    expect(addOnUsage([p])).toEqual([{ serviceId: "x", packageIds: ["a"] }]);
  });
  it("toggles ids and checks approval", () => {
    expect(toggleId(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleId(["a", "b"], "a", false)).toEqual(["b"]);
    expect(approvalGap("nope", "r")).toBe("evidence");
    expect(approvalGap("private:doc/1", " ")).toBe("reason");
    expect(approvalGap("private:doc/1", "ok")).toBeNull();
  });
});

describe("occupancyOptions", () => {
  it("lists distinct rules and skips blanks", () => {
    const a = base("a", 1); a.work = [{ id: "w1", serviceId: "s1", scopeItemIds: [], occupancyRule: { id: "r", version: 1 } }, { id: "w2", serviceId: "s2", scopeItemIds: [], occupancyRule: { id: "", version: 1 } }];
    const b = base("b", 1); b.work = [{ id: "w3", serviceId: "s3", scopeItemIds: [], occupancyRule: { id: "r", version: 1 } }];
    const options = occupancyOptions([a, b]);
    expect(options).toHaveLength(1);
    expect(options[0].services).toEqual(["s1", "s3"]);
  });
});

import { isPublishable, normaliseDraft, validateDraft } from "./catalogue-logic";
describe("draft helpers", () => {
  it("defaults work steps and validates required fields", () => {
    const d = base("a", 1, { vehicleCategoryIds: [], branchIds: [] });
    d.scope[0].serviceId = "svc";
    d.work = [{ id: "w", serviceId: "", scopeItemIds: [], occupancyRule: { id: "", version: 1 } }];
    const n = normaliseDraft(d);
    expect(n.work[0].serviceId).toBe("svc");
    expect(n.work[0].scopeItemIds).toEqual(["s1"]);
    expect(Object.keys(validateDraft(d)).sort()).toEqual(["branches", "categories", "work0"]);
  });
  it("needs approved price, tax and aggregation to publish", () => {
    expect(isPublishable(base("a", 1))).toBe(false);
    expect(isPublishable(base("a", 1, { price: approved, tax: approved as never, workAggregation: approved as never }))).toBe(true);
  });
});
