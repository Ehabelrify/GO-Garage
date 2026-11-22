import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { hasCapability, type GarageActor } from "../auth/authz";
import { findDuplicatePairs, type DuplicateCandidate, type DuplicatePair } from "./duplicate-scoring";
import { isColumnOf, isSafeIdentifier, leftInPlace, moveSpecs, specForTable, vehicleSpec, type MoveSpec } from "./merge-registry";

export const UNDO_WINDOW_DAYS = 30;

export class MergeError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
const fail = (status: number, code: string, message: string, details?: unknown): never => { throw new MergeError(status, code, message, details); };

type Q = Pick<PoolClient, "query">;

/** Reading duplicates and previews: Owner / settings.manage. Demo owners may read. */
export function assertMergeAccess(actor: GarageActor) {
  if (!hasCapability(actor, "settings.manage")) fail(403, "OWNER_REQUIRED", "Only the Owner can review and merge duplicate customers.");
}
/** Merge and undo: also never for demo identities. */
export function assertMergeWrite(actor: GarageActor) {
  if (actor.isDemo) fail(403, "DEMO_ACTION_DISABLED", "Merging customers is unavailable in a temporary demo session.");
  assertMergeAccess(actor);
}

const archivedCustomer = "NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind='customer' AND ra.entity_id=c.id)";

interface CandidateRow {
  id: string; name: string; phone: string; phone_normalized: string; created_at: Date | string;
  branch_ids: string[] | null; vehicles: { key: string; plate: string }[] | null; bookings: string | number;
}

export async function listDuplicates(actor: GarageActor): Promise<{ pairs: DuplicatePair[] }> {
  assertMergeAccess(actor);
  const result = await pool.query<CandidateRow>(
    `SELECT c.id, c.name, c.phone, c.phone_normalized, c.created_at,
            COALESCE((SELECT array_agg(cb.branch_id) FROM customer_branches cb WHERE cb.customer_id = c.id), '{}') AS branch_ids,
            COALESCE((SELECT json_agg(json_build_object('key', garage_normalize_plate(v.plate), 'plate', v.plate))
                        FROM vehicles v WHERE v.customer_id = c.id
                         AND NOT EXISTS (SELECT 1 FROM record_archives rv WHERE rv.entity_kind='vehicle' AND rv.entity_id=v.id)), '[]'::json) AS vehicles,
            (SELECT count(*) FROM bookings b WHERE b.customer_id = c.id) AS bookings
       FROM customers c WHERE ${archivedCustomer} ORDER BY c.created_at LIMIT 20000`);
  const candidates: DuplicateCandidate[] = result.rows.map((row) => ({
    id: row.id, name: row.name, phone: row.phone, phoneNormalized: row.phone_normalized,
    createdAt: new Date(row.created_at).toISOString(), branchIds: row.branch_ids ?? [],
    vehicles: row.vehicles ?? [], bookings: Number(row.bookings),
  }));
  return { pairs: findDuplicatePairs(candidates) };
}

// ---- Plan: what a merge would touch -------------------------------------------------------------------------------

export interface VehiclePlan { moved: { id: string; plate: string }[]; collided: { mergedVehicleId: string; survivorVehicleId: string; plate: string }[] }
export interface MergePlan {
  survivor: { id: string; name: string; phone: string };
  merged: { id: string; name: string; phone: string };
  vehicles: VehiclePlan;
  counts: { key: string; labelEn: string; labelAr: string; count: number }[];
  consentsCopied: number;
  branchesCopied: number;
  leftInPlace: { key: string; labelEn: string; labelAr: string; count: number }[];
  total: number;
}

const count = async (q: Q, sql: string, params: unknown[]) => Number((await q.query<{ n: string }>(sql, params)).rows[0]?.n ?? 0);

async function loadCustomer(q: Q, id: string, lock: boolean) {
  const found = await q.query<{ id: string; name: string; phone: string; phone_normalized: string; preferred_language: string; created_at: Date }>(
    `SELECT id, name, phone, phone_normalized, preferred_language, created_at FROM customers WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [id]);
  return found.rows[0] ?? null;
}

async function assertMergeable(q: Q, survivorId: string, mergedId: string, lock: boolean) {
  if (survivorId === mergedId) fail(400, "SAME_CUSTOMER", "Choose two different customers.");
  const [first, second] = [survivorId, mergedId].sort();
  const a = await loadCustomer(q, first, lock);
  const b = await loadCustomer(q, second, lock);
  const survivor = first === survivorId ? a : b;
  const merged = first === survivorId ? b : a;
  if (!survivor || !merged) return fail(404, "RECORD_NOT_FOUND", "Customer not found.");
  const archived = await q.query<{ entity_id: string }>("SELECT entity_id FROM record_archives WHERE entity_kind='customer' AND entity_id = ANY($1::text[])", [[survivorId, mergedId]]);
  if (archived.rowCount) return fail(409, "ALREADY_ARCHIVED", "An archived customer cannot be merged. Restore it first.");
  return { survivor, merged };
}

async function planVehicles(q: Q, survivorId: string, mergedId: string): Promise<VehiclePlan> {
  const rows = await q.query<{ id: string; plate: string; key: string; owner: string }>(
    `SELECT v.id, v.plate, garage_normalize_plate(v.plate) AS key, v.customer_id AS owner FROM vehicles v
      WHERE v.customer_id = ANY($1::text[])
        AND NOT EXISTS (SELECT 1 FROM record_archives rv WHERE rv.entity_kind='vehicle' AND rv.entity_id=v.id)
      ORDER BY v.created_at, v.id`, [[survivorId, mergedId]]);
  const firstByKey = new Map<string, string>();
  for (const row of rows.rows) if (row.owner === survivorId && row.key && !firstByKey.has(row.key)) firstByKey.set(row.key, row.id);
  const plan: VehiclePlan = { moved: [], collided: [] };
  for (const row of rows.rows) {
    if (row.owner !== mergedId) continue;
    const twin = row.key ? firstByKey.get(row.key) : undefined;
    if (twin) plan.collided.push({ mergedVehicleId: row.id, survivorVehicleId: twin, plate: row.plate });
    else { plan.moved.push({ id: row.id, plate: row.plate }); if (row.key) firstByKey.set(row.key, row.id); }
  }
  return plan;
}

/** WHERE clause and parameters selecting a customer's rows plus rows that point at one of the folded vehicles. */
function whereFor(spec: MoveSpec, mergedId: string, vehicleIds: string[]): { sql: string; params: unknown[] } {
  const parts: string[] = []; const params: unknown[] = [];
  if (spec.customerCol) { params.push(mergedId); parts.push(`${spec.customerCol} = $${params.length}`); }
  if (spec.vehicleCol) { params.push(vehicleIds); parts.push(`${spec.vehicleCol} = ANY($${params.length}::text[])`); }
  return { sql: parts.join(" OR "), params };
}

async function buildPlan(q: Q, survivorId: string, mergedId: string, lock: boolean) {
  const { survivor, merged } = await assertMergeable(q, survivorId, mergedId, lock);
  const vehicles = await planVehicles(q, survivorId, mergedId);
  const collidedIds = vehicles.collided.map((c) => c.mergedVehicleId);
  const counts: MergePlan["counts"] = [];
  counts.push({ key: vehicleSpec.key, labelEn: vehicleSpec.labelEn, labelAr: vehicleSpec.labelAr, count: vehicles.moved.length + vehicles.collided.length });
  for (const spec of moveSpecs) {
    const where = whereFor(spec, mergedId, collidedIds);
    counts.push({ key: spec.key, labelEn: spec.labelEn, labelAr: spec.labelAr, count: await count(q, `SELECT count(*) AS n FROM ${spec.table} WHERE ${where.sql}`, where.params) });
  }
  const consentsCopied = await count(q,
    `SELECT count(*) AS n FROM messaging_customer_consents m WHERE m.customer_id=$1
        AND NOT EXISTS (SELECT 1 FROM messaging_customer_consents s WHERE s.customer_id=$2 AND s.channel_id=m.channel_id AND s.purpose=m.purpose)`, [mergedId, survivorId]);
  const branchesCopied = await count(q,
    `SELECT count(*) AS n FROM customer_branches m WHERE m.customer_id=$1
        AND NOT EXISTS (SELECT 1 FROM customer_branches s WHERE s.customer_id=$2 AND s.branch_id=m.branch_id)`, [mergedId, survivorId]);
  const kept: MergePlan["leftInPlace"] = [];
  for (const item of leftInPlace) kept.push({ key: item.key, labelEn: item.labelEn, labelAr: item.labelAr, count: await count(q, `SELECT count(*) AS n FROM ${item.table} WHERE ${item.col} = $1`, [mergedId]) });
  const total = counts.reduce((sum, c) => sum + c.count, 0) + consentsCopied + branchesCopied;
  const plan: MergePlan = {
    survivor: { id: survivor.id, name: survivor.name, phone: survivor.phone },
    merged: { id: merged.id, name: merged.name, phone: merged.phone },
    vehicles, counts, consentsCopied, branchesCopied, leftInPlace: kept, total,
  };
  return { plan, survivor, merged };
}

export async function previewMerge(actor: GarageActor, survivorId: string, mergedId: string): Promise<MergePlan> {
  assertMergeAccess(actor);
  const client = await pool.connect();
  try { return (await buildPlan(client, survivorId, mergedId, false)).plan; } finally { client.release(); }
}

// ---- Merge ---------------------------------------------------------------------------------------------------------

interface LogRow { kind: "move" | "insert"; table: string; pk: Record<string, string>; column: string | null; oldValue: string | null; newValue: string | null }

async function writeLog(q: Q, mergeId: string, rows: LogRow[]) {
  if (!rows.length) return;
  await q.query(
    `INSERT INTO customer_merge_moves(merge_id, kind, table_name, pk, column_name, old_value, new_value)
     SELECT $1, r.kind, r.table_name, r.pk::jsonb, r.column_name, r.old_value, r.new_value
       FROM jsonb_to_recordset($2::jsonb) AS r(kind text, table_name text, pk text, column_name text, old_value text, new_value text)`,
    [mergeId, JSON.stringify(rows.map((r) => ({ kind: r.kind, table_name: r.table, pk: JSON.stringify(r.pk), column_name: r.column, old_value: r.oldValue, new_value: r.newValue })))]);
}

async function moveRows(q: Q, spec: MoveSpec, mergedId: string, survivorId: string, vehicleMap: Map<string, string>, mergeId: string): Promise<number> {
  const cols = [...spec.pk, spec.customerCol, spec.vehicleCol].filter((c): c is string => !!c);
  const where0 = whereFor(spec, mergedId, [...vehicleMap.keys()]);
  const rows = await q.query<Record<string, string | null>>(
    `SELECT ${cols.join(", ")} FROM ${spec.table} WHERE ${where0.sql} FOR UPDATE`, where0.params);
  const log: LogRow[] = [];
  for (const row of rows.rows) {
    const sets: string[] = []; const values: unknown[] = []; const pk: Record<string, string> = {};
    for (const key of spec.pk) pk[key] = String(row[key]);
    const change = (col: string | undefined, next: string | undefined) => {
      if (!col || next === undefined || row[col] === next) return;
      values.push(next); sets.push(`${col} = $${values.length}`);
      log.push({ kind: "move", table: spec.table, pk, column: col, oldValue: row[col] ?? null, newValue: next });
    };
    if (spec.customerCol && row[spec.customerCol] === mergedId) change(spec.customerCol, survivorId);
    if (spec.vehicleCol && row[spec.vehicleCol] && vehicleMap.has(String(row[spec.vehicleCol]))) change(spec.vehicleCol, vehicleMap.get(String(row[spec.vehicleCol])));
    if (!sets.length) continue;
    const where = spec.pk.map((key) => { values.push(pk[key]); return `${key} = $${values.length}`; }).join(" AND ");
    await q.query(`UPDATE ${spec.table} SET ${sets.join(", ")} WHERE ${where}`, values);
  }
  await writeLog(q, mergeId, log);
  return new Set(log.map((l) => JSON.stringify(l.pk))).size;
}

export interface MergeResult { mergeId: string; survivorId: string; mergedId: string; counts: Record<string, number>; total: number }

export async function mergeCustomers(actor: GarageActor, input: { survivorId: string; mergedId: string; reason: string }): Promise<MergeResult> {
  assertMergeWrite(actor);
  const reason = input.reason.trim();
  if (!reason) fail(400, "REASON_REQUIRED", "Enter a reason.");
  return withTransaction(async (client) => {
    // Deterministic lock order (sorted ids) so two merges touching the same customer serialise.
    for (const id of [input.survivorId, input.mergedId].sort()) await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`customer-merge:${id}`]);
    const { plan, survivor, merged } = await buildPlan(client, input.survivorId, input.mergedId, true);
    const active = await client.query("SELECT 1 FROM customer_merges WHERE merged_id = ANY($1::text[]) AND undone_at IS NULL", [[input.survivorId, input.mergedId]]);
    if (active.rowCount) return fail(409, "ALREADY_MERGED", "One of these customers was already merged into another record.");

    const mergeId = `merge-${randomUUID()}`;
    await client.query(
      `INSERT INTO customer_merges(id, survivor_id, merged_id, reason, merged_by, counts, merged_snapshot)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
      [mergeId, survivor.id, merged.id, reason, actor.userId, "{}", JSON.stringify({ merged, survivor })]);
    // The only moment the customer/vehicle pins of accepted reservations, benefits and issued invoices may change.
    await client.query("SELECT set_config('garage.customer_merge', 'on', true)");

    const counts: Record<string, number> = {};
    const log: LogRow[] = [];
    const vehicleMap = new Map<string, string>(plan.vehicles.collided.map((c) => [c.mergedVehicleId, c.survivorVehicleId]));

    // 1. Vehicles: unique plates move to the survivor; plate collisions fold into the survivor's vehicle and are archived.
    for (const vehicle of plan.vehicles.moved) {
      await client.query("UPDATE vehicles SET customer_id=$1 WHERE id=$2 AND customer_id=$3", [survivor.id, vehicle.id, merged.id]);
      log.push({ kind: "move", table: "vehicles", pk: { id: vehicle.id }, column: "customer_id", oldValue: merged.id, newValue: survivor.id });
    }
    for (const collision of plan.vehicles.collided) {
      await client.query(
        "INSERT INTO record_archives(entity_kind, entity_id, archived_by, reason) VALUES('vehicle',$1,$2,$3) ON CONFLICT DO NOTHING",
        [collision.mergedVehicleId, actor.userId, `Merged into vehicle ${collision.survivorVehicleId}: ${reason}`.slice(0, 500)]);
      log.push({ kind: "insert", table: "record_archives", pk: { entity_kind: "vehicle", entity_id: collision.mergedVehicleId }, column: null, oldValue: null, newValue: null });
    }
    counts[vehicleSpec.key] = plan.vehicles.moved.length + plan.vehicles.collided.length;
    await writeLog(client, mergeId, log);

    // 2. Every table with a customer/beneficiary/vehicle pointer.
    for (const spec of moveSpecs) counts[spec.key] = await moveRows(client, spec, merged.id, survivor.id, vehicleMap, mergeId);

    // 3. Rows keyed by customer that cannot be re-pointed (composite FKs / unique keys): copy what the survivor lacks.
    const copiedConsents = await client.query<{ channel_id: string; purpose: string; revision: number }>(
      `INSERT INTO messaging_customer_consents(channel_id, customer_id, purpose, status, evidence_ref, consented_at, expires_at, consented_by, revoked_at, revoked_by, revision)
       SELECT m.channel_id, $2, m.purpose, m.status, m.evidence_ref, m.consented_at, m.expires_at, m.consented_by, m.revoked_at, m.revoked_by, m.revision
         FROM messaging_customer_consents m WHERE m.customer_id=$1
          AND NOT EXISTS (SELECT 1 FROM messaging_customer_consents s WHERE s.customer_id=$2 AND s.channel_id=m.channel_id AND s.purpose=m.purpose)
       RETURNING channel_id, purpose, revision`, [merged.id, survivor.id]);
    const copiedBranches = await client.query<{ branch_id: string }>(
      `INSERT INTO customer_branches(customer_id, branch_id)
       SELECT $2, m.branch_id FROM customer_branches m WHERE m.customer_id=$1
          AND NOT EXISTS (SELECT 1 FROM customer_branches s WHERE s.customer_id=$2 AND s.branch_id=m.branch_id)
       RETURNING branch_id`, [merged.id, survivor.id]);
    counts.consents = copiedConsents.rowCount ?? 0;
    counts.branches = copiedBranches.rowCount ?? 0;

    // 4. The merged-away customer becomes an archived stub that points at the survivor.
    await client.query(
      "INSERT INTO record_archives(entity_kind, entity_id, archived_by, reason) VALUES('customer',$1,$2,$3)",
      [merged.id, actor.userId, `Merged into customer ${survivor.id} (${mergeId}): ${reason}`.slice(0, 500)]);
    await writeLog(client, mergeId, [
      ...copiedConsents.rows.map((r): LogRow => ({ kind: "insert", table: "messaging_customer_consents", pk: { channel_id: r.channel_id, customer_id: survivor.id, purpose: r.purpose }, column: null, oldValue: null, newValue: String(r.revision) })),
      ...copiedBranches.rows.map((r): LogRow => ({ kind: "insert", table: "customer_branches", pk: { customer_id: survivor.id, branch_id: r.branch_id }, column: null, oldValue: null, newValue: null })),
      { kind: "insert", table: "record_archives", pk: { entity_kind: "customer", entity_id: merged.id }, column: null, oldValue: null, newValue: null },
    ]);

    // 5. Counts are final only now: the merge row is append-only except for the one undo mark, so they live in the audit
    //    snapshot and are recomputed from the move log for display.
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const snapshot = { mergeId, survivorId: survivor.id, mergedId: merged.id, counts };
    await client.query(
      "INSERT INTO owner_record_audit(entity_kind, entity_id, action, actor_id, reason, snapshot) VALUES('customer',$1,'merged',$2,$3,$4::jsonb), ('customer',$5,'merged',$2,$3,$4::jsonb)",
      [merged.id, actor.userId, reason, JSON.stringify(snapshot), survivor.id]);
    return { mergeId, survivorId: survivor.id, mergedId: merged.id, counts, total };
  });
}

// ---- History and undo ------------------------------------------------------------------------------------------------

export interface MergeSummary {
  id: string; survivorId: string; survivorName: string; mergedId: string; mergedName: string; reason: string;
  mergedAt: string; undoneAt: string | null; undoableUntil: string; canUndo: boolean;
}

export async function listMerges(actor: GarageActor): Promise<{ merges: MergeSummary[] }> {
  assertMergeAccess(actor);
  const rows = await pool.query<{ id: string; survivor_id: string; survivor_name: string; merged_id: string; merged_name: string; reason: string; merged_at: Date; undone_at: Date | null }>(
    `SELECT m.id, m.survivor_id, s.name AS survivor_name, m.merged_id, d.name AS merged_name, m.reason, m.merged_at, m.undone_at
       FROM customer_merges m JOIN customers s ON s.id=m.survivor_id JOIN customers d ON d.id=m.merged_id
      ORDER BY m.merged_at DESC LIMIT 100`);
  const now = Date.now();
  return {
    merges: rows.rows.map((r) => {
      const until = new Date(r.merged_at.getTime() + UNDO_WINDOW_DAYS * 86_400_000);
      return { id: r.id, survivorId: r.survivor_id, survivorName: r.survivor_name, mergedId: r.merged_id, mergedName: r.merged_name, reason: r.reason,
        mergedAt: r.merged_at.toISOString(), undoneAt: r.undone_at ? r.undone_at.toISOString() : null, undoableUntil: until.toISOString(), canUndo: !r.undone_at && until.getTime() > now };
    }),
  };
}

export async function undoMerge(actor: GarageActor, mergeId: string, reason: string) {
  assertMergeWrite(actor);
  const why = reason.trim();
  if (!why) fail(400, "REASON_REQUIRED", "Enter a reason.");
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`customer-merge-undo:${mergeId}`]);
    const found = await client.query<{ id: string; survivor_id: string; merged_id: string; merged_at: Date; undone_at: Date | null }>(
      "SELECT id, survivor_id, merged_id, merged_at, undone_at FROM customer_merges WHERE id=$1 FOR UPDATE", [mergeId]);
    const merge = found.rows[0];
    if (!merge) return fail(404, "MERGE_NOT_FOUND", "Merge not found.");
    if (merge.undone_at) return fail(409, "ALREADY_UNDONE", "This merge was already undone.");
    if (Date.now() - merge.merged_at.getTime() > UNDO_WINDOW_DAYS * 86_400_000) return fail(409, "UNDO_WINDOW_PASSED", `A merge can only be undone within ${UNDO_WINDOW_DAYS} days.`);
    // The survivor must still be a live customer and not itself merged away.
    const chained = await client.query("SELECT 1 FROM customer_merges WHERE merged_id=$1 AND undone_at IS NULL", [merge.survivor_id]);
    if (chained.rowCount) return fail(409, "UNDO_CONFLICT", "The surviving customer was merged into another record afterwards. Undo that merge first.", [{ reason: "survivor-merged-away" }]);
    await client.query("SELECT set_config('garage.customer_merge', 'on', true)");

    const moves = await client.query<{ kind: "move" | "insert"; table_name: string; pk: Record<string, string>; column_name: string | null; old_value: string | null; new_value: string | null }>(
      "SELECT kind, table_name, pk, column_name, old_value, new_value FROM customer_merge_moves WHERE merge_id=$1 ORDER BY id DESC", [mergeId]);
    const conflicts: { table: string; id: string; reason: string }[] = [];
    const idOf = (pk: Record<string, string>) => Object.values(pk).join("/");

    for (const move of moves.rows) {
      const spec = specForTable(move.table_name);
      if (move.kind === "move") {
        if (!spec || !move.column_name || !isColumnOf(spec, move.column_name) || !isSafeIdentifier(move.column_name)) return fail(500, "MERGE_LOG_INVALID", "The merge log is not valid.");
        const keys = spec.pk;
        const values: unknown[] = [move.old_value, move.new_value];
        const where = keys.map((key) => { values.push(move.pk[key]); return `${key} = $${values.length}`; }).join(" AND ");
        // Only reverts a row that still has exactly the value the merge wrote; anything newer is a conflict.
        const updated = await client.query(`UPDATE ${spec.table} SET ${move.column_name} = $1 WHERE ${where} AND ${move.column_name} = $2`, values);
        if (updated.rowCount !== 1) conflicts.push({ table: spec.table, id: idOf(move.pk), reason: "changed-since-merge" });
        continue;
      }
      if (move.table_name === "customer_branches") {
        await client.query("DELETE FROM customer_branches WHERE customer_id=$1 AND branch_id=$2", [move.pk.customer_id, move.pk.branch_id]);
      } else if (move.table_name === "messaging_customer_consents") {
        // Only a consent that is still the untouched copy (same revision, no newer events) is removed.
        const deleted = await client.query(
          `DELETE FROM messaging_customer_consents c WHERE c.channel_id=$1 AND c.customer_id=$2 AND c.purpose=$3 AND c.revision=$4::int
              AND NOT EXISTS (SELECT 1 FROM messaging_customer_consent_events e WHERE e.channel_id=c.channel_id AND e.customer_id=c.customer_id AND e.purpose=c.purpose)`,
          [move.pk.channel_id, move.pk.customer_id, move.pk.purpose, move.new_value]);
        if (deleted.rowCount !== 1) conflicts.push({ table: "messaging_customer_consents", id: idOf(move.pk), reason: "consent-changed-since-merge" });
      } else if (move.table_name === "record_archives") {
        if (move.pk.entity_kind !== "customer" && move.pk.entity_kind !== "vehicle") return fail(500, "MERGE_LOG_INVALID", "The merge log is not valid.");
        await client.query("DELETE FROM record_archives WHERE entity_kind=$1 AND entity_id=$2", [move.pk.entity_kind, move.pk.entity_id]);
      } else return fail(500, "MERGE_LOG_INVALID", "The merge log is not valid.");
    }
    if (conflicts.length) return fail(409, "UNDO_CONFLICT", "Some moved records changed after the merge, so it cannot be undone safely.", conflicts.slice(0, 50));

    await client.query("UPDATE customer_merges SET undone_at=now(), undone_by=$2, undo_reason=$3 WHERE id=$1", [mergeId, actor.userId, why]);
    const snapshot = { mergeId, survivorId: merge.survivor_id, mergedId: merge.merged_id };
    await client.query(
      "INSERT INTO owner_record_audit(entity_kind, entity_id, action, actor_id, reason, snapshot) VALUES('customer',$1,'merge-undone',$2,$3,$4::jsonb), ('customer',$5,'merge-undone',$2,$3,$4::jsonb)",
      [merge.merged_id, actor.userId, why, JSON.stringify(snapshot), merge.survivor_id]);
    return { mergeId, undone: true, moved: moves.rows.filter((m) => m.kind === "move").length };
  });
}
