import type { PoolClient } from "pg";
import { Json, NATURAL_KEYS, TABLE_ORDER, type Dataset, type Row, type TableName } from "./seed-core";

const MAX_PARAMS = 30_000;

/** Tables that have no usable unique constraint, so a natural-key lookup keeps re-runs from duplicating audit rows. */
async function existingNaturalKeys(client: PoolClient, table: TableName, keys: string[]) {
  const result = await client.query(`SELECT ${keys.join(", ")} FROM ${table}`);
  return new Set(result.rows.map((row) => keys.map((key) => String(row[key] instanceof Date ? row[key].toISOString() : row[key] ?? "")).join("|")));
}

export async function insertDataset(client: PoolClient, dataset: Dataset): Promise<Record<string, number>> {
  const inserted: Record<string, number> = {};
  for (const table of TABLE_ORDER) {
    let rows = dataset.rows(table);
    if (!rows.length) continue;
    const naturalKeys = NATURAL_KEYS[table];
    if (naturalKeys) {
      const known = await existingNaturalKeys(client, table, naturalKeys);
      rows = rows.filter((row) => !known.has(naturalKeys.map((key) => String(row[key] instanceof Date ? (row[key] as Date).toISOString() : row[key] ?? "")).join("|")));
    }
    // Rows in one table may carry different column sets (for example audit events keyed by policy or by warranty).
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const signature = Object.keys(row).sort().join(",");
      groups.set(signature, [...(groups.get(signature) ?? []), row]);
    }
    let count = 0;
    for (const [signature, group] of groups) {
      const columns = signature.split(",");
      const perChunk = Math.max(1, Math.min(500, Math.floor(MAX_PARAMS / columns.length)));
      for (let start = 0; start < group.length; start += perChunk) {
        const chunk = group.slice(start, start + perChunk);
        const values: unknown[] = [];
        const tuples = chunk.map((row) => `(${columns.map((column) => {
          const value = row[column];
          if (value instanceof Json) { values.push(JSON.stringify(value.value)); return `$${values.length}::jsonb`; }
          values.push(value === undefined ? null : value);
          return `$${values.length}`;
        }).join(", ")})`);
        const result = await client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")} ON CONFLICT DO NOTHING`, values);
        count += result.rowCount ?? 0;
      }
    }
    inserted[table] = count;
  }
  return inserted;
}
