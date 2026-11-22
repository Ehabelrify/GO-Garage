import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface ReadinessQuery { query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }> }

export interface Readiness { ready: boolean; database: "ok" | "unreachable"; schema: "current" | "behind" | "unknown"; pending: string[] }

const migrationsDir = fileURLToPath(new URL("../database/migrations/", import.meta.url));

/** Names of the migration files shipped with this build. */
export async function shippedMigrations(): Promise<string[]> {
  return (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
}

/**
 * P2T-014: readiness, unlike the constant liveness answer, proves the database answers and that every migration shipped with this
 * build has been applied (a build ahead of its schema is not ready). Never throws; reports a state.
 */
export async function checkReadiness(db: ReadinessQuery, shipped: () => Promise<string[]> = shippedMigrations): Promise<Readiness> {
  try {
    await db.query("SELECT 1");
  } catch {
    return { ready: false, database: "unreachable", schema: "unknown", pending: [] };
  }
  try {
    const applied = new Set((await db.query("SELECT name FROM schema_migrations")).rows.map((row) => String(row.name)));
    const pending = (await shipped()).filter((name) => !applied.has(name));
    return { ready: pending.length === 0, database: "ok", schema: pending.length === 0 ? "current" : "behind", pending };
  } catch {
    return { ready: false, database: "ok", schema: "unknown", pending: [] };
  }
}
