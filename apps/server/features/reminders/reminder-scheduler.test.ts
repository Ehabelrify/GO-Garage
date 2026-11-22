import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { clientQuery, release, connect, runDue } = vi.hoisted(() => ({
  clientQuery: vi.fn(), release: vi.fn(), connect: vi.fn(), runDue: vi.fn(),
}));
vi.mock("../../infrastructure/database/db", () => ({ pool: { connect } }));
vi.mock("./reminder-service", () => ({ runDueReminders: runDue }));
const scheduler = await import("./reminder-scheduler");

const lock = (locked: boolean) => clientQuery.mockImplementation(async (sql: string) => (sql.includes("try_advisory") ? { rows: [{ locked }] } : { rows: [] }));

beforeEach(() => {
  vi.useFakeTimers();
  clientQuery.mockReset(); release.mockReset(); runDue.mockReset(); connect.mockReset();
  connect.mockResolvedValue({ query: clientQuery, release });
  runDue.mockResolvedValue({});
  lock(true);
});
afterEach(() => { scheduler.stopReminderScheduler(); vi.useRealTimers(); });

describe("reminder scheduler", () => {
  it("runs on the interval under the advisory lock and releases it", async () => {
    expect(scheduler.startReminderScheduler({ intervalSeconds: 60, allowInTest: true })).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runDue).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls.map((c) => c[0])).toEqual([expect.stringContaining("try_advisory"), expect.stringContaining("advisory_unlock")]);
    expect(release).toHaveBeenCalledTimes(1);
    const status = scheduler.getReminderSchedulerStatus();
    expect(status.lastRunAt).not.toBeNull();
    expect(status.lastError).toBeNull();
    expect(status.running).toBe(false);
    expect(status.nextRunAt).not.toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runDue).toHaveBeenCalledTimes(2);
  });

  it("skips when the lock is held elsewhere", async () => {
    lock(false);
    await scheduler.runReminderTick();
    expect(runDue).not.toHaveBeenCalled();
    expect(clientQuery.mock.calls.some((c) => String(c[0]).includes("advisory_unlock"))).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("skips while a previous run is still in progress", async () => {
    let finish: () => void = () => undefined;
    runDue.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const first = scheduler.runReminderTick();
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.getReminderSchedulerStatus().running).toBe(true);
    await scheduler.runReminderTick();
    expect(connect).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(runDue).toHaveBeenCalledTimes(1);
  });

  it("records an error without throwing and still unlocks", async () => {
    runDue.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(scheduler.runReminderTick()).resolves.toBeUndefined();
    const status = scheduler.getReminderSchedulerStatus();
    expect(status.lastError).toBe("boom");
    expect(status.lastRunAt).not.toBeNull();
    expect(clientQuery.mock.calls.some((c) => String(c[0]).includes("advisory_unlock"))).toBe(true);
    expect(release).toHaveBeenCalled();
  });

  it("is disabled when the interval is 0 or under NODE_ENV=test", async () => {
    expect(scheduler.readIntervalSeconds("0")).toBe(0);
    expect(scheduler.readIntervalSeconds(undefined)).toBe(300);
    expect(scheduler.startReminderScheduler({ intervalSeconds: 0, allowInTest: true })).toBe(false);
    expect(scheduler.startReminderScheduler({ intervalSeconds: 60 })).toBe(false); // vitest sets NODE_ENV=test
    await vi.advanceTimersByTimeAsync(600_000);
    expect(runDue).not.toHaveBeenCalled();
    expect(scheduler.getReminderSchedulerStatus().enabled).toBe(false);
  });
});
