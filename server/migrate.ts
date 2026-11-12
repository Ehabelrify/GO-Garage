import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";

if (process.env.NODE_ENV === "production") {
  throw new Error("Development migrations cannot be run with NODE_ENV=production.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const migrationsDir = fileURLToPath(new URL("./migrations/", import.meta.url));

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(704202611)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const name of files) {
      const alreadyApplied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name = $1",
        [name],
      );
      if (alreadyApplied.rowCount) continue;

      const sql = await readFile(path.join(migrationsDir, name), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
        console.info(`Applied development migration: ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(704202611)").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

migrate().catch((error: unknown) => {
  console.error("Development migration failed.", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
