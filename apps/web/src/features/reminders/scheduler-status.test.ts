import { describe, expect, it } from "vitest";
import { schedulerLine } from "./scheduler-status";

const base = { enabled: true, running: false, intervalSeconds: 300, lastRunAt: "L", lastError: null, nextRunAt: "N" };
describe("scheduler line", () => {
  it("shows interval, last and next", () => { expect(schedulerLine(base, "en")).toEqual({ tone: "info", text: "Automatic check every 5 min, last run L, next N." }); });
  it("flags errors and disabled, handles missing", () => {
    expect(schedulerLine({ ...base, lastError: "x" }, "ar")?.tone).toBe("warning");
    expect(schedulerLine({ ...base, enabled: false }, "en")?.text).toMatch(/off/);
    expect(schedulerLine(undefined, "en")).toBeNull();
    expect(schedulerLine({ ...base, lastRunAt: null, running: true }, "en")?.text).toMatch(/not yet.*running now/);
  });
});
