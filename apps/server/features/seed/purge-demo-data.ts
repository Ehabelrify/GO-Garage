import type { PoolClient } from "pg";
import { pool } from "../../infrastructure/database/db";
import { buildSteps, parseArgs, purgeGate, type Step } from "./purge-plan";

/**
 * Removes every row the development seeder created (extended seed-* dataset plus the legacy sample rows)
 * so the system can go live clean. Dry-run is the default and writes nothing.
 *
 *   dry run : npm run db:purge:demo
 *   execute : GARAGE_CONFIRM_PURGE=yes npm run db:purge:demo -- --execute
 *
 * Rows are matched by the seeded customer set (and everything hanging off it) plus seed-* identifiers and the
 * SEED_REASON marker on policy/capacity rows. Real configuration (branches, operating settings, owner bootstrap,
 * the dataset marker) is never touched.
 */

async function targetLabel(client: PoolClient) {
  const row = (await client.query<{ db: string; host: string | null }>("SELECT current_database() AS db, inet_server_addr()::text AS host")).rows[0];
  return `${row.db}${row.host ? ` @ ${row.host}` : ""}`;
}

async function count(client: PoolClient, step: Step) {
  const result = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${step.table} WHERE ${step.where}`);
  return Number(result.rows[0].n);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const gate = purgeGate(args, process.env);
  const steps = buildSteps(args);
  const client = await pool.connect();
  try {
    console.info(`Target database: ${await targetLabel(client)}`);
    console.info(`Mode: ${gate.mode.toUpperCase()} - ${gate.reason}`);
    if (gate.mode === "dry-run") {
      let total = 0;
      for (const step of steps) {
        const n = await count(client, step);
        total += n;
        if (n) console.info(`  would delete ${String(n).padStart(6)}  ${step.label} (${step.table})`);
      }
      console.info(`Total rows that would be removed: ${total}.`);
      console.info("To execute: GARAGE_CONFIRM_PURGE=yes npm run db:purge:demo -- --execute   (add --keep-demo-accounts to retain demo-* staff).");
      return;
    }

    await client.query("BEGIN");
    // Append-only history tables reject DELETE through their triggers; lift them for this one transaction only.
    const triggered = await client.query<{ relname: string }>(
      "SELECT DISTINCT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND t.tgenabled = 'O' AND c.relname = ANY($1::text[])",
      [[...new Set(steps.map((step) => step.table))]],
    );
    const relaxed = triggered.rows.map((row) => row.relname);
    for (const table of relaxed) await client.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
    let total = 0;
    const skipped: string[] = [];
    for (const step of steps) {
      await client.query("SAVEPOINT purge_step");
      try {
        const result = await client.query(`DELETE FROM ${step.table} WHERE ${step.where}`);
        await client.query("RELEASE SAVEPOINT purge_step");
        total += result.rowCount ?? 0;
        if (result.rowCount) console.info(`  deleted ${String(result.rowCount).padStart(6)}  ${step.label} (${step.table})`);
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT purge_step");
        if (!step.optional) throw error;
        skipped.push(`${step.label}: ${error instanceof Error ? error.message : "blocked"}`);
      }
    }
    for (const table of relaxed) await client.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
    await client.query("COMMIT");
    console.info(`Purge complete: ${total} rows removed.`);
    for (const line of skipped) console.warn(`  kept (still referenced by non-seeded data): ${line}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error: unknown) => {
  console.error("Demo data purge failed; nothing was removed.", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
