import { describe, expect, it } from "vitest";
import { capacityDecisionIds, fmtDateTime, isOperatingRule } from "./settings-format";

describe("settings format", () => {
  it("never offers capacity decisions as editable settings", () => {
    for (const id of capacityDecisionIds) expect(isOperatingRule(id)).toBe(false);
    expect(isOperatingRule("booking-confirmation")).toBe(true);
  });
  it("formats invalid dates as a dash", () => {
    expect(fmtDateTime("nope", "en")).toBe("—");
    expect(fmtDateTime("2026-01-02T10:00:00Z", "en")).toContain("2026");
  });
});
