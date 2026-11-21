import { describe, expect, it } from "vitest";
import { availabilityComplete, availabilityFromApi, availabilityPayload, blankAvailability, cleanClosures } from "./availability-form";

describe("availability form", () => {
  it("treats unconfigured as blank", () => {
    expect(availabilityFromApi({ status: "unconfigured" })).toEqual(blankAvailability);
  });
  it("maps API data and builds the same payload shape", () => {
    const form = availabilityFromApi({ version: 3, timezone: "Africa/Cairo", opensAt: "09:00:00", closesAt: "18:00:00", workingWeekdays: [6, 0, 1], slotMinutes: 30, dailyIntakeLimit: 12, bayCounts: { clean: 2, general: 4 }, effectiveFrom: "2026-01-01T00:00:00Z", closures: [{ closed_date: "2026-05-01", reason: "Holiday" }] });
    expect(form.opensAt).toBe("09:00");
    const payload = availabilityPayload({ ...form, reason: "Review" });
    expect(payload).toMatchObject({ expectedVersion: 3, workingWeekdays: [0, 1, 6], bayCounts: { clean: 2, general: 4 }, closures: [{ date: "2026-05-01", reason: "Holiday" }], effectiveFrom: "2026-01-01" });
    expect(availabilityComplete({ ...form, reason: "Review" })).toBe(true);
    expect(availabilityComplete(form)).toBe(false);
  });
  it("ignores blank closure rows and rejects incomplete ones", () => {
    expect(cleanClosures([{ date: "", reason: "" }])).toEqual([]);
    expect(cleanClosures([{ date: "2026-01-01", reason: "" }])).toBeNull();
    expect(cleanClosures([{ date: "01/01", reason: "x" }])).toBeNull();
  });
});
