import { describe, expect, it } from "vitest";
import { buildCoverageDocument } from "./warranty-document";

const record = { id: "w1", policyName: "Ceramic coating - 24 months (example)", policyVersion: 2, startDate: "2026-11-22", expiresOn: "2028-11-21", terminatedOn: null, coverageKind: "fixed" as const, status: "active" as const };
const base = { record, customerName: "Amal", plate: "1234", serviceLabel: "Ceramic", branchLabel: "Maadi", statusLabel: "Active" };

describe("buildCoverageDocument", () => {
  it("builds a priceless coverage sheet without the (example) marker", () => {
    const doc = buildCoverageDocument({ ...base, lang: "en" });
    expect(doc.totals).toEqual([]);
    expect(doc.lines[0].description).toBe("Ceramic coating - 24 months · v2");
    expect(doc.lines[0].detail).toContain("21 Nov 2028");
    expect(doc.title).toBe("Warranty coverage");
  });
  it("labels lifetime coverage and uses Arabic copy", () => {
    const doc = buildCoverageDocument({ ...base, lang: "ar", record: { ...record, coverageKind: "lifetime", expiresOn: null } });
    expect(doc.lines[0].detail).toContain("مدى الحياة");
    expect(doc.lang).toBe("ar");
  });
});
