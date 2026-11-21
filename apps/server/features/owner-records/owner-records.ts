import type { PoolClient } from "pg";
import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { actorFor } from "../auth/auth";
import { hasCapability, type GarageActor } from "../auth/authz";

export const archivableKinds = ["customer", "quote", "reservation", "catalogue-package", "catalogue-grade", "commercial-policy", "warranty-policy"] as const;
export type ArchivableKind = (typeof archivableKinds)[number];
/** Kinds whose rows can ever be hard-deleted; every other kind carries append-only history and is archive-only. */
const hardDeletableKinds: readonly ArchivableKind[] = ["customer"];

export class OwnerRecordError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
const fail = (status: number, code: string, message: string, details?: unknown): never => { throw new OwnerRecordError(status, code, message, details); };

/** Owner full control: owner-only capability, never available to demo identities. */
export function assertOwnerControl(actor: GarageActor) {
  if (actor.isDemo) fail(403, "DEMO_ACTION_DISABLED", "Record control is unavailable in a temporary demo session.");
  if (!hasCapability(actor, "settings.manage")) fail(403, "OWNER_REQUIRED", "Only the Owner can archive or delete records.");
}

type Dependents = { label: string; count: number }[];
type Q = Pick<PoolClient, "query">;
const count = async (q: Q, sql: string, params: unknown[]) => Number((await q.query<{ n: string }>(sql, params)).rows[0]?.n ?? 0);

/** Returns blocking dependents; empty means the record can be archived. Throws 404 when absent. */
async function archiveBlockers(q: Q, kind: ArchivableKind, id: string): Promise<Dependents> {
  const blockers: Dependents = [];
  const add = (label: string, n: number) => { if (n > 0) blockers.push({ label, count: n }); };
  switch (kind) {
    case "customer": {
      if (!await count(q, "SELECT count(*) AS n FROM customers WHERE id=$1", [id])) fail(404, "RECORD_NOT_FOUND", "Record not found.");
      add("open bookings", await count(q, "SELECT count(*) AS n FROM bookings WHERE customer_id=$1 AND status IN ('pending','confirmed')", [id]));
      add("in-progress jobs", await count(q, "SELECT count(*) AS n FROM jobs j JOIN bookings b ON b.id=j.booking_id WHERE b.customer_id=$1 AND j.stage NOT IN ('delivered','cancelled','no-show')", [id]));
      add("active warranties", await count(q, "SELECT count(*) AS n FROM warranties WHERE customer_id=$1 AND status='active' AND (coverage_kind='lifetime' OR expires_on >= CURRENT_DATE)", [id]));
      add("open warranty claims", await count(q, "SELECT count(*) AS n FROM warranty_claims c JOIN warranties w ON w.id=c.warranty_id WHERE w.customer_id=$1 AND c.status IN ('open','under-review')", [id]));
      add("active reservations", await count(q, "SELECT count(*) AS n FROM promotion_reservations WHERE beneficiary_id=$1 AND status IN ('reserved','scheduled')", [id]));
      add("active benefits", await count(q, "SELECT count(*) AS n FROM benefit_entitlements WHERE customer_id=$1 AND status='active'", [id]));
      add("open transport requests", await count(q, "SELECT count(*) AS n FROM transport_requests WHERE customer_id=$1 AND status NOT IN ('completed','cancelled')", [id]));
      add("open conversations", await count(q, "SELECT count(*) AS n FROM whatsapp_conversations WHERE customer_id=$1 AND status <> 'resolved'", [id]));
      break;
    }
    case "quote": {
      const head = (await q.query<{ accepted_revision: number | null }>("SELECT accepted_revision FROM quote_heads WHERE id=$1", [id])).rows[0];
      if (!head) return fail(404, "RECORD_NOT_FOUND", "Record not found.");
      add("accepted revision", head.accepted_revision != null ? 1 : 0);
      add("reservations", await count(q, "SELECT count(*) AS n FROM promotion_reservations WHERE quote_id=$1 AND status IN ('reserved','scheduled','redeemed')", [id]));
      add("bookings", await count(q, "SELECT count(*) AS n FROM bookings WHERE accepted_quote_id=$1", [id]));
      break;
    }
    case "reservation": {
      const row = (await q.query<{ status: string }>("SELECT status FROM promotion_reservations WHERE id=$1", [id])).rows[0];
      if (!row) return fail(404, "RECORD_NOT_FOUND", "Record not found.");
      add("active or redeemed reservation", ["reserved", "scheduled", "redeemed"].includes(row.status) ? 1 : 0);
      break;
    }
    case "catalogue-package": {
      if (!await count(q, "SELECT count(*) AS n FROM catalogue_package_versions WHERE package_id=$1", [id])) fail(404, "RECORD_NOT_FOUND", "Record not found.");
      add("active published version", await count(q, "SELECT count(*) AS n FROM catalogue_package_active WHERE package_id=$1 AND retired=false", [id]));
      break;
    }
    case "catalogue-grade": {
      if (!await count(q, "SELECT count(*) AS n FROM catalogue_grade_versions WHERE grade_id=$1", [id])) fail(404, "RECORD_NOT_FOUND", "Record not found.");
      add("active published version", await count(q, "SELECT count(*) AS n FROM catalogue_grade_active WHERE grade_id=$1 AND retired=false", [id]));
      add("packages using this grade", await count(q, "SELECT count(DISTINCT p.package_id) AS n FROM catalogue_package_active a JOIN catalogue_package_versions p ON p.package_id=a.package_id AND p.version=a.version, jsonb_array_elements(p.scope) s WHERE a.retired=false AND s->'gradeVersion'->>'id'=$1", [id]));
      break;
    }
    case "commercial-policy": {
      if (!await count(q, "SELECT count(*) AS n FROM commercial_policy_versions WHERE policy_id=$1", [id])) fail(404, "RECORD_NOT_FOUND", "Record not found.");
      add("active policy", await count(q, "SELECT count(*) AS n FROM commercial_policy_active WHERE policy_id=$1", [id]));
      break;
    }
    case "warranty-policy": {
      if (!await count(q, "SELECT count(*) AS n FROM warranty_policies WHERE policy_id=$1", [id])) fail(404, "RECORD_NOT_FOUND", "Record not found.");
      add("published version", await count(q, "SELECT count(*) AS n FROM warranty_policies WHERE policy_id=$1 AND status='published'", [id]));
      add("issued warranties", await count(q, "SELECT count(*) AS n FROM warranties WHERE policy_id=$1", [id]));
      break;
    }
  }
  return blockers;
}

async function audit(q: Q, kind: string, id: string, action: "archived" | "restored" | "deleted", actor: GarageActor, reason: string, snapshot: unknown = null) {
  await q.query("INSERT INTO owner_record_audit(entity_kind,entity_id,action,actor_id,reason,snapshot) VALUES($1,$2,$3,$4,$5,$6)",
    [kind, id, action, actor.userId, reason, snapshot === null ? null : JSON.stringify(snapshot)]);
}

export async function archiveRecord(actor: GarageActor, kind: ArchivableKind, id: string, reason: string) {
  assertOwnerControl(actor);
  if (!reason.trim()) fail(400, "REASON_REQUIRED", "Enter a reason.");
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`owner-record:${kind}:${id}`]);
    const already = await client.query("SELECT 1 FROM record_archives WHERE entity_kind=$1 AND entity_id=$2", [kind, id]);
    if (already.rowCount) return fail(409, "ALREADY_ARCHIVED", "This record is already archived.");
    const blockers = await archiveBlockers(client, kind, id);
    if (blockers.length) return fail(409, "HAS_DEPENDENTS", "This record still has active dependents.", blockers);
    await client.query("INSERT INTO record_archives(entity_kind,entity_id,archived_by,reason) VALUES($1,$2,$3,$4)", [kind, id, actor.userId, reason.trim()]);
    await audit(client, kind, id, "archived", actor, reason.trim());
    return { kind, id, archived: true };
  });
}

export async function restoreRecord(actor: GarageActor, kind: ArchivableKind, id: string, reason: string) {
  assertOwnerControl(actor);
  return withTransaction(async (client) => {
    const removed = await client.query("DELETE FROM record_archives WHERE entity_kind=$1 AND entity_id=$2", [kind, id]);
    if (!removed.rowCount) return fail(404, "NOT_ARCHIVED", "This record is not archived.");
    await audit(client, kind, id, "restored", actor, reason.trim());
    return { kind, id, archived: false };
  });
}

/** Hard delete: only kinds without immutable history, only when nothing references the record. */
export async function deleteRecord(actor: GarageActor, kind: ArchivableKind, id: string, reason: string) {
  assertOwnerControl(actor);
  if (!reason.trim()) fail(400, "REASON_REQUIRED", "Enter a reason.");
  if (!hardDeletableKinds.includes(kind)) fail(409, "ARCHIVE_ONLY", "This record keeps append-only history and can only be archived.");
  try {
    return await withTransaction(async (client) => {
      const found = await client.query<{ id: string; name: string }>("SELECT id, name FROM customers WHERE id=$1 FOR UPDATE", [id]);
      if (!found.rowCount) return fail(404, "RECORD_NOT_FOUND", "Record not found.");
      // Foreign keys decide "unreferenced": any booking, quote, warranty, conversation, etc. aborts the delete.
      await client.query("DELETE FROM record_archives WHERE entity_kind='customer' AND entity_id=$1", [id]);
      await client.query("DELETE FROM customers WHERE id=$1", [id]);
      await audit(client, kind, id, "deleted", actor, reason.trim(), { id, name: found.rows[0].name });
      return { kind, id, deleted: true };
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23503" || code === "P0001") throw new OwnerRecordError(409, "HAS_DEPENDENTS", "This record is referenced by other records. Archive it instead.");
    throw error;
  }
}

export async function listArchived(actor: GarageActor, kind?: ArchivableKind) {
  assertOwnerControl(actor);
  const rows = await pool.query<{ entity_kind: string; entity_id: string; archived_by: string; archived_at: Date; reason: string }>(
    "SELECT entity_kind, entity_id, archived_by, archived_at, reason FROM record_archives WHERE ($1::text IS NULL OR entity_kind=$1) ORDER BY archived_at DESC LIMIT 500", [kind ?? null]);
  return rows.rows.map((r) => ({ kind: r.entity_kind, id: r.entity_id, archivedBy: r.archived_by, archivedAt: r.archived_at.toISOString(), reason: r.reason }));
}

export async function listRecordAudit(actor: GarageActor, kind?: ArchivableKind, id?: string) {
  assertOwnerControl(actor);
  const rows = await pool.query<{ entity_kind: string; entity_id: string; action: string; actor_id: string; reason: string; occurred_at: Date }>(
    "SELECT entity_kind, entity_id, action, actor_id, reason, occurred_at FROM owner_record_audit WHERE ($1::text IS NULL OR entity_kind=$1) AND ($2::text IS NULL OR entity_id=$2) ORDER BY occurred_at DESC, id DESC LIMIT 200", [kind ?? null, id ?? null]);
  return rows.rows.map((r) => ({ kind: r.entity_kind, id: r.entity_id, action: r.action, actorId: r.actor_id, reason: r.reason, occurredAt: r.occurred_at.toISOString() }));
}

export const ownerRecordsRouter = Router();
const kindSchema = z.enum(archivableKinds);
const reasonSchema = z.object({ reason: z.string().trim().max(1000).default("") }).strict();
function respond(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof OwnerRecordError) return res.status(error.status).json({ code: error.code, message: error.message, ...(error.details ? { dependents: error.details } : {}) });
  if (error instanceof z.ZodError) return res.status(400).json({ code: "INVALID_REQUEST", message: "Check the record type and reason." });
  next(error);
}
ownerRecordsRouter.get("/archived", async (req, res, next) => {
  try { const kind = typeof req.query.kind === "string" ? kindSchema.parse(req.query.kind) : undefined; res.json({ archived: await listArchived(actorFor(req)!, kind) }); } catch (e) { respond(res, next, e); }
});
ownerRecordsRouter.get("/audit", async (req, res, next) => {
  try {
    const kind = typeof req.query.kind === "string" ? kindSchema.parse(req.query.kind) : undefined;
    res.json({ events: await listRecordAudit(actorFor(req)!, kind, typeof req.query.id === "string" ? req.query.id : undefined) });
  } catch (e) { respond(res, next, e); }
});
ownerRecordsRouter.post("/:kind/:id/archive", async (req, res, next) => {
  try { res.json(await archiveRecord(actorFor(req)!, kindSchema.parse(req.params.kind), req.params.id, reasonSchema.parse(req.body ?? {}).reason)); } catch (e) { respond(res, next, e); }
});
ownerRecordsRouter.post("/:kind/:id/restore", async (req, res, next) => {
  try { res.json(await restoreRecord(actorFor(req)!, kindSchema.parse(req.params.kind), req.params.id, reasonSchema.parse(req.body ?? {}).reason)); } catch (e) { respond(res, next, e); }
});
ownerRecordsRouter.delete("/:kind/:id", async (req, res, next) => {
  try { res.json(await deleteRecord(actorFor(req)!, kindSchema.parse(req.params.kind), req.params.id, reasonSchema.parse(req.body ?? {}).reason)); } catch (e) { respond(res, next, e); }
});
