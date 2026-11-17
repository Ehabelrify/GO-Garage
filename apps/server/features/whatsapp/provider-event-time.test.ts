import { describe, expect, it } from "vitest";
import { parseProviderEventTime } from "./provider-event-time";

describe("provider event timestamps", () => {
  const now = new Date("2026-11-17T12:00:00.000Z");

  it("accepts valid current or past event times", () => {
    expect(parseProviderEventTime("2026-11-17T12:00:00.000Z", now)).toEqual(now);
    expect(parseProviderEventTime("2026-11-17T11:59:00.000Z", now)?.toISOString())
      .toBe("2026-11-17T11:59:00.000Z");
  });

  it("rejects invalid and future event times", () => {
    expect(parseProviderEventTime("not-a-date", now)).toBeNull();
    expect(parseProviderEventTime("2026-11-17T12:00:01.000Z", now)).toBeNull();
    expect(parseProviderEventTime(undefined, now)).toBeNull();
  });
});
