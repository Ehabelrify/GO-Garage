import { describe, expect, it } from "vitest";
import type { PromotionInfo } from "../quotes/commercial-data";
import { evidenceText, filterPromotions, promotionOrder, promotionValue, validityState, vehiclesText } from "./promotion-logic";
import { toPromotion } from "../quotes/commercial-data";

const egp = (pounds: number) => ({ minor: pounds * 100, currency: "EGP" });
const promo = (patch: Partial<PromotionInfo> = {}): PromotionInfo => ({
  ref: { id: "promotion-qualification:seed-ultimate-club", version: 1 }, name: "Ultimate club", rule: { en: "Club membership confirmed", ar: "عضوية النادي مؤكدة" },
  evidenceKinds: ["membership-verification"], maximumUnits: 15, minVehicles: 1, maxVehicles: 1, verifierRoles: ["owner"], discount: null, perVehicle: null,
  validFrom: null, validUntil: null, recipient: "customer", stackable: false, ...patch,
});

describe("promotion logic", () => {
  it("reads the value as per-vehicle, shared or package price", () => {
    expect(promotionValue(promo({ perVehicle: egp(10000), discount: egp(10000) }))).toEqual({ kind: "per-vehicle", amount: egp(10000) });
    expect(promotionValue(promo({ discount: egp(35000) }))).toEqual({ kind: "shared", amount: egp(35000) });
    expect(promotionValue(promo())).toEqual({ kind: "package" });
  });
  it("places a promotion in its date window", () => {
    expect(validityState(promo(), "2026-11-22")).toBe("active");
    expect(validityState(promo({ validFrom: "2026-12-01" }), "2026-11-22")).toBe("upcoming");
    expect(validityState(promo({ validUntil: "2026-11-25" }), "2026-11-22")).toBe("ending-soon");
    expect(validityState(promo({ validUntil: "2026-12-31" }), "2026-11-22")).toBe("active");
    expect(validityState(promo({ validUntil: "2026-11-01" }), "2026-11-22")).toBe("ended");
  });
  it("orders ending soon first and ended last", () => {
    const rows = [promo({ name: "B", validUntil: "2026-11-01" }), promo({ name: "A" }), promo({ name: "C", validUntil: "2026-11-23" })];
    expect(promotionOrder(rows, "en", "2026-11-22").map((row) => row.name)).toEqual(["C", "A", "B"]);
  });
  it("words evidence and vehicle counts", () => {
    expect(evidenceText(["membership-verification", "warranty-reference"], "en")).toBe("Club membership, Warranty on file");
    expect(evidenceText(["grouped-vehicles"], "ar")).toBe("عدة مركبات معاً");
    expect(vehiclesText(promo(), "en")).toBe("1");
    expect(vehiclesText(promo({ minVehicles: 3, maxVehicles: 4 }), "ar")).toBe("3 إلى 4");
  });
  it("filters by name and rule text", () => {
    const rows = [promo(), promo({ name: "Referral", rule: { en: "Existing warranty card", ar: "كارت ضمان" } })];
    expect(filterPromotions(rows, "referral", "en")).toHaveLength(1);
    expect(filterPromotions(rows, "warranty card", "en")).toHaveLength(1);
    expect(filterPromotions(rows, "", "en")).toHaveLength(2);
  });
});

describe("toPromotion from the server list", () => {
  it("keeps a localised title, the rule as description, the value and validity", () => {
    const info = toPromotion({ id: "promotion-qualification:seed-warranty-card-referral", version: 2 }, {
      evidenceKinds: ["warranty-reference"], maximumUnits: 50, recipient: { kind: "referred-customer" }, stackability: { allowed: false },
      discountAllocation: { total: egp(10000), perVehicle: egp(10000) }, beneficiaryRule: { en: "Existing warranty card", ar: "كارت ضمان سابق" },
    }, { en: "Existing warranty card", ar: "كارت ضمان سابق" }, "ar", { validFrom: "2026-10-01", validUntil: null });
    expect(info.name).toBe("إحالة بكارت الضمان");
    expect(info.rule?.en).toBe("Existing warranty card");
    expect(info.perVehicle?.minor).toBe(1_000_000);
    expect(info.recipient).toBe("referred-customer");
    expect(info.validFrom).toBe("2026-10-01");
  });
  it("ignores a zero discount", () => {
    const info = toPromotion({ id: "promotion-qualification:seed-plus-lifetime", version: 1 }, { discountAllocation: { total: egp(0), perVehicle: egp(0) } });
    expect(info.discount).toBeNull();
    expect(info.perVehicle).toBeNull();
    expect(info.name).toBe("Plus lifetime");
  });
});
