import { describe, expect, it } from "vitest";
import { buildPolicyCatalog, policyLabel } from "./policy-catalog";

describe("policy catalog", () => {
  it("builds quote, per-branch pickup and eight finance entries", () => {
    const catalog = buildPolicyCatalog(["a", "b"]);
    expect(catalog).toHaveLength(11);
    expect(catalog[0].id).toBe("quote-acceptance:default");
    expect(catalog.filter((entry) => entry.group === "pickup").map((entry) => entry.id)).toEqual(["pickup-commitment:a", "pickup-commitment:b"]);
  });
  it("labels entries without raw ids", () => {
    const catalog = buildPolicyCatalog(["a"]);
    const name = (id: string) => `Branch ${id}`;
    expect(policyLabel(catalog[0], "en", name)).toBe("Quote acceptance");
    expect(policyLabel(catalog[1], "en", name)).toBe("Branch a");
    expect(policyLabel(catalog[2], "ar", name)).toBe("قيمة العروض");
  });
});
