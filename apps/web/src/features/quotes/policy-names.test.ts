import { describe, expect, it } from "vitest";
import { humaniseKey, knownPolicyName, policyDisplayName, policyKey } from "./policy-names";

describe("policy names", () => {
  it("strips the family and seed prefix", () => {
    expect(policyKey("benefit-eligibility:seed-free-wash")).toBe("free-wash");
    expect(policyKey("seed_vip-transport")).toBe("vip-transport");
  });
  it("keeps acronyms upper case", () => {
    expect(humaniseKey("vip-transport")).toBe("VIP transport");
    expect(humaniseKey("cairo-tow")).toBe("Cairo tow");
    expect(humaniseKey("")).toBe("");
  });
  it("localises the advertised examples and humanises the rest", () => {
    expect(policyDisplayName("benefit-eligibility:seed-vip-transport", "en")).toBe("VIP transport");
    expect(policyDisplayName("benefit-eligibility:seed-fourth-car", "ar")).toBe("السيارة الرابعة مجاناً");
    expect(policyDisplayName("promotion-qualification:seed-ultimate-club", "ar")).toBe("نادي ألتيميت");
    expect(policyDisplayName("benefit-eligibility:seed-window-tint-check", "en")).toBe("Window tint check");
    expect(knownPolicyName("x:unknown", "en")).toBeNull();
  });
});
