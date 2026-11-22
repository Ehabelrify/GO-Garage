// Production migration runner (P2T-014). Manual only: never called by dev, start or post-merge.
// Usage: GARAGE_ALLOW_PRODUCTION_MIGRATION=yes npm run db:migrate:production -- --target <database> [--dry-run]
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";
import { planProductionMigration } from "./migrate-production-guard";

const decision = planProductionMigration(process.env, process.argv.slice(2));
if (!decision.ok) {
  console.error(`Production migration refused. ${decision.error}`);
  process.exit(1);
}
const { plan } = decision;
const LOCK_KEY = 704202612; // distinct from the development runner so the two never block each other by accident
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const migrationsDir = fileURLToPath(new URL("./migrations/", import.meta.url));

async function run() {
  const client = await pool.connect();
  let locked = false;
  try {
    const got = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (!got.rows[0]?.ok) throw new Error("Another production migration is running (advisory lock held). Nothing was run.");
    locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
    const applied = new Set((await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((row) => row.name));
    const pending = files.filter((name) => !applied.has(name));
    console.info(`Database "${plan.databaseName}": ${pending.length} pending of ${files.length} migration file(s).`);
    if (plan.dryRun) {
      for (const name of pending) console.info(`  would apply: ${name}`);
      return;
    }
    for (const name of pending) {
      const sql = await readFile(path.join(migrationsDir, name), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
        console.info(`Applied production migration: ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

run().catch((error: unknown) => {
  console.error("Production migration failed.", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
