import type { PoolClient } from "pg";
import { pool } from "../../infrastructure/database/db";
import { runDueReminders } from "./reminder-service";

/** In-process reminder scheduler (simulated outbox only). Cross-instance safety comes from a Postgres advisory lock. */
const LOCK_KEY = 74_210_031; // arbitrary app-wide constant for the reminder run
const DEFAULT_INTERVAL_SECONDS = 300;

export interface ReminderSchedulerStatus {
  enabled: boolean;
  running: boolean;
  intervalSeconds: number;
  lastRunAt: string | null;
  lastError: string | null;
  nextRunAt: string | null;
}

const state = {
  enabled: false, running: false, intervalSeconds: 0,
  lastRunAt: null as Date | null, lastError: null as string | null, nextRunAt: null as Date | null,
  timer: null as NodeJS.Timeout | null,
};

export function getReminderSchedulerStatus(): ReminderSchedulerStatus {
  return {
    enabled: state.enabled, running: state.running, intervalSeconds: state.intervalSeconds,
    lastRunAt: state.lastRunAt?.toISOString() ?? null, lastError: state.lastError, nextRunAt: state.nextRunAt?.toISOString() ?? null,
  };
}

export function readIntervalSeconds(raw: string | undefined = process.env.GARAGE_REMINDER_INTERVAL_SECONDS): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_INTERVAL_SECONDS;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_INTERVAL_SECONDS;
}

/** One guarded tick. Never throws. */
export async function runReminderTick(): Promise<void> {
  if (state.running) return;
  state.running = true;
  let client: PoolClient | null = null;
  let locked = false;
  try {
    client = await pool.connect();
    const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_KEY]);
    locked = result.rows[0]?.locked === true;
    if (!locked) return; // another instance is running the job
    await runDueReminders(new Date(), "system");
    state.lastRunAt = new Date();
    state.lastError = null;
  } catch (error) {
    state.lastRunAt = new Date();
    state.lastError = error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
    console.error("Reminder scheduler run failed.", state.lastError);
  } finally {
    if (client) {
      if (locked) await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
      client.release();
    }
    state.running = false;
    if (state.enabled && state.intervalSeconds > 0) state.nextRunAt = new Date(Date.now() + state.intervalSeconds * 1000);
  }
}

export function startReminderScheduler(options: { intervalSeconds?: number; allowInTest?: boolean } = {}): boolean {
  stopReminderScheduler();
  const intervalSeconds = options.intervalSeconds ?? readIntervalSeconds();
  if (intervalSeconds <= 0 || (process.env.NODE_ENV === "test" && !options.allowInTest)) {
    state.intervalSeconds = intervalSeconds;
    return false;
  }
  state.enabled = true;
  state.intervalSeconds = intervalSeconds;
  state.nextRunAt = new Date(Date.now() + intervalSeconds * 1000);
  state.timer = setInterval(() => { void runReminderTick(); }, intervalSeconds * 1000);
  state.timer.unref();
  return true;
}

export function stopReminderScheduler(): void {
  if (state.timer) clearInterval(state.timer);
  Object.assign(state, { timer: null, enabled: false, running: false, nextRunAt: null, lastRunAt: null, lastError: null });
}
