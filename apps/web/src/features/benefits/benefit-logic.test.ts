import { describe, expect, it } from "vitest";
import type { BenefitEntitlement } from "@garage/domain";
import { benefitName, expiryText, filterBenefits, groupBenefits, groupStatus, limitText, reasonText, shortLimitText, totalUses, usageText } from "./benefit-logic";

const approval = { approvedBy: "o", approvedAt: "x", evidenceRef: "protected", reason: "r" };
const quantity = (n: number) => ({ state: "approved" as const, value: { kind: "quantity" as const, quantity: n }, policy: { id: "p", version: 1 }, approval });
const entitlement = (patch: Partial<BenefitEntitlement> = {}): BenefitEntitlement => ({ id: "e", sourceQuote: { quoteId: "q", revision: 1 }, benefit: { id: "benefit-eligibility:seed-free-wash", version: 1 }, customerId: "c", vehicleId: "v", branchIds: ["b"], limit: quantity(2), responsibleTeamId: null, status: "active", revision: 1, ...patch });

describe("benefit logic", () => {
  it("writes limits as sentences, never JSON", () => {
    expect(limitText(quantity(1), "en")).toBe("1 use in total");
    expect(limitText(quantity(2), "en")).toBe("2 uses in total");
    expect(limitText({ state: "unconfigured", missing: ["x"] }, "en")).toBe("Limit not approved yet");
    expect(limitText({ state: "approved", value: { kind: "recurring", quantity: 1, interval: "calendar-month", startsOn: "2026-01-01", endsOn: null, eligibilityPolicy: { id: "p", version: 1 } }, policy: { id: "p", version: 1 }, approval }, "en")).toBe("1 per month");
  });
  it("knows the total only for fixed quantities", () => {
    expect(totalUses(quantity(3))).toBe(3);
    expect(totalUses({ state: "unconfigured", missing: [] })).toBeNull();
  });
  it("writes expiry rules in words", () => {
    const date = (iso: string) => `D(${iso})`;
    expect(expiryText({ kind: "none" }, "en", date)).toBe("Does not expire");
    expect(expiryText({ kind: "date", expiresOn: "2027-01-01" }, "en", date)).toBe("Expires D(2027-01-01)");
    expect(expiryText({ kind: "policy-evaluated" }, "ar", date)).toBe("تحددها السياسة");
  });
  it("names a benefit from its policy id without leaking the id", () => {
    expect(benefitName({ id: "benefit-eligibility:seed-free-wash" }, "en")).toBe("Free wash");
    expect(benefitName({ id: "" }, "ar")).toBe("منفعة");
  });
  it("filters by status and text", () => {
    const rows = [entitlement(), entitlement({ id: "f", status: "exhausted" })];
    expect(filterBenefits(rows, { query: "", status: "exhausted" }, () => "x")).toHaveLength(1);
    expect(filterBenefits(rows, { query: "wash", status: "all" }, () => "Free wash")).toHaveLength(2);
    expect(filterBenefits(rows, { query: "tow", status: "all" }, () => "Free wash")).toHaveLength(0);
  });
  it("humanises eligibility reason codes", () => {
    expect(reasonText("limit-reached", "en")).toBe("Limit reached");
    expect(reasonText("Requested quantity exceeds remaining eligibility.", "en")).toBe("Requested quantity exceeds remaining eligibility.");
  });
});

describe("benefit grouping and labels", () => {
  it("humanises and localises benefit names", () => {
    expect(benefitName({ id: "benefit-eligibility:seed-vip-transport" }, "en")).toBe("VIP transport");
    expect(benefitName({ id: "benefit-eligibility:seed-fourth-car" }, "ar")).toBe("السيارة الرابعة مجاناً");
    expect(benefitName({ id: "benefit-eligibility:seed-cairo-tow" }, "en")).toBe("Cairo tow");
  });
  it("shows used and remaining for fixed quantities only", () => {
    expect(usageText(quantity(2), 1, "en")).toBe("1 of 2 used, 1 left");
    expect(usageText(quantity(2), 5, "en")).toBe("5 of 2 used, 0 left");
    expect(usageText({ state: "unconfigured", missing: [] }, 0, "en")).toBeNull();
    expect(shortLimitText(quantity(1), "en")).toBe("1 use");
    expect(shortLimitText(quantity(3), "ar")).toBe("3 استخدامات");
  });
  it("groups one row per customer and vehicle with active benefits first", () => {
    const rows = [entitlement({ id: "a", status: "exhausted" }), entitlement({ id: "b" }), entitlement({ id: "c", vehicleId: "v2" }), entitlement({ id: "d", customerId: "c2" })];
    const groups = groupBenefits(rows);
    expect(groups).toHaveLength(3);
    expect(groups[0].items.map((item) => item.id)).toEqual(["b", "a"]);
    expect(groupStatus(groups[0])).toBe("active");
    expect(groupStatus({ ...groups[0], items: [entitlement({ status: "cancelled" })] })).toBe("cancelled");
  });
});
