import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { hasCapability, type GarageActor } from "../auth/authz";
import {
  canTransition, decisionStatus, toRequest, validateDecision,
  type CreateInput, type DecisionInput, type RequestRow, type RequestStatus,
} from "./special-requests-logic";

export class SpecialRequestError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const fail = (status: number, code: string, message: string): never => { throw new SpecialRequestError(status, code, message); };

const canReview = (actor: GarageActor) => hasCapability(actor, "special-requests.review");
const canStaff = (actor: GarageActor) => hasCapability(actor, "bookings.manage");

function requireReader(actor: GarageActor) {
  if (!canReview(actor) && !canStaff(actor)) fail(403, "ROLE_FORBIDDEN", "Special requests are not available to your role.");
}
function requireWriter(actor: GarageActor, review: boolean) {
  if (actor.isDemo) fail(403, "DEMO_ACTION_DISABLED", "Special requests cannot be changed in a role preview session.");
  if (review ? !canReview(actor) : !canStaff(actor)) fail(403, "ROLE_FORBIDDEN", review ? "Only a request reviewer can do this." : "Your role cannot create special requests.");
}

const SELECT = `SELECT r.id, r.customer_id, r.vehicle_id, r.branch_id, r.source, r.title, r.description, r.requested_from::text AS requested_from,
  r.requested_to::text AS requested_to, r.preferred_time_note, r.budget_note, r.status, r.reply_decision, r.reply_message, r.quoted_price_minor,
  r.quoted_currency, r.duration_days, r.duration_note, r.available_from::text AS available_from, r.offer_valid_until::text AS offer_valid_until,
  r.owner_notes, r.decided_by, r.decided_at, r.quote_id, r.created_by, r.revision, r.created_at, r.updated_at, c.name AS customer_name, v.plate
  FROM special_requests r JOIN customers c ON c.id = r.customer_id JOIN vehicles v ON v.id = r.vehicle_id`;
/** $1 owner flag, $2 branch ids. Customer must be in scope and not archived (an archived customer's requests stay hidden). */
const SCOPE = `r.customer_id IN (SELECT cb.customer_id FROM customer_branches cb WHERE $1 OR cb.branch_id = ANY($2::text[]))
  AND NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind='customer' AND ra.entity_id = r.customer_id)`;
const scopeArgs = (actor: GarageActor) => [actor.role === "owner", actor.branchIds];

export async function listRequests(actor: GarageActor, filter: { status?: string; customerId?: string; vehicleId?: string }) {
  requireReader(actor);
  const clauses = [SCOPE];
  const args: unknown[] = scopeArgs(actor);
  if (filter.status === "open") clauses.push("r.status IN ('new','under-review','needs-info')");
  else if (filter.status) { args.push(filter.status); clauses.push(`r.status = $${args.length}`); }
  if (filter.customerId) { args.push(filter.customerId); clauses.push(`r.customer_id = $${args.length}`); }
  if (filter.vehicleId) { args.push(filter.vehicleId); clauses.push(`r.vehicle_id = $${args.length}`); }
  const rows = await pool.query<RequestRow>(`${SELECT} WHERE ${clauses.join(" AND ")} ORDER BY r.created_at DESC LIMIT 300`, args);
  const internal = canReview(actor);
  return { requests: rows.rows.map((row) => toRequest(row, internal)), canReview: internal };
}

async function loadScoped(actor: GarageActor, id: string, client?: Pick<PoolClient, "query">, lock = false): Promise<RequestRow> {
  const runner = client ?? pool;
  const found = await runner.query<RequestRow>(`${SELECT} WHERE r.id = $3 AND ${SCOPE}${lock ? " FOR UPDATE OF r" : ""}`, [...scopeArgs(actor), id]);
  return found.rows[0] ?? fail(404, "REQUEST_NOT_FOUND", "Special request not found.");
}

export async function getRequest(actor: GarageActor, id: string) {
  requireReader(actor);
  const row = await loadScoped(actor, id);
  const events = await pool.query<{ seq: number; action: string; from_status: string | null; to_status: string; actor_id: string | null; reason: string; occurred_at: Date; actor_name: string | null }>(
    `SELECT e.seq, e.action, e.from_status, e.to_status, e.actor_id, e.reason, e.occurred_at, s.full_name AS actor_name
     FROM special_request_events e LEFT JOIN staff_memberships s ON s.clerk_user_id = e.actor_id WHERE e.request_id = $1 ORDER BY e.seq`, [id]);
  return {
    request: toRequest(row, canReview(actor)),
    history: events.rows.map((event) => ({
      seq: event.seq, action: event.action, fromStatus: event.from_status, toStatus: event.to_status, actorName: event.actor_name, reason: event.reason, occurredAt: event.occurred_at.toISOString(),
    })),
  };
}

async function appendEvent(client: PoolClient, id: string, action: string, from: RequestStatus | null, to: RequestStatus, actorId: string, reason: string, snapshot: unknown = null) {
  await client.query(
    `INSERT INTO special_request_events (request_id, seq, action, from_status, to_status, actor_id, reason, snapshot)
     VALUES ($1, (SELECT coalesce(max(seq), 0) + 1 FROM special_request_events WHERE request_id = $1), $2, $3, $4, $5, $6, $7::jsonb)`,
    [id, action, from, to, actorId, reason, snapshot === null ? null : JSON.stringify(snapshot)]);
}

export async function createRequest(actor: GarageActor, input: CreateInput) {
  requireWriter(actor, false);
  return withTransaction(async (client) => {
    const owner = await client.query<{ customer_id: string }>(
      `SELECT v.customer_id FROM vehicles v WHERE v.id = $1 AND v.customer_id = $2
         AND v.customer_id IN (SELECT cb.customer_id FROM customer_branches cb WHERE $3 OR cb.branch_id = ANY($4::text[]))
         AND NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind='customer' AND ra.entity_id = v.customer_id)`,
      [input.vehicleId, input.customerId, ...scopeArgs(actor)]);
    if (!owner.rows[0]) return fail(404, "VEHICLE_NOT_FOUND", "That vehicle does not belong to this customer, or is outside your branches.");
    const branchId = input.branchId ?? null;
    if (branchId) {
      if (actor.role !== "owner" && !actor.branchIds.includes(branchId)) return fail(403, "FORBIDDEN", "You cannot use this branch.");
      const branch = await client.query("SELECT 1 FROM branches WHERE id = $1", [branchId]);
      if (!branch.rowCount) return fail(400, "INVALID_BRANCH", "Unknown branch.");
    }
    const id = `sr-${randomUUID()}`;
    await client.query(
      `INSERT INTO special_requests (id, customer_id, vehicle_id, branch_id, source, title, description, requested_from, requested_to, preferred_time_note, budget_note, created_by)
       VALUES ($1,$2,$3,$4,'staff',$5,$6,$7,$8,$9,$10,$11)`,
      [id, input.customerId, input.vehicleId, branchId, input.title, input.description, input.requestedFrom, input.requestedTo ?? null, input.preferredTimeNote, input.budgetNote, actor.userId]);
    await appendEvent(client, id, "created", null, "new", actor.userId, "");
    return { id };
  });
}

/** Locks the request, checks the revision and the allowed source status, runs the change, bumps the revision. */
async function mutate(
  actor: GarageActor, id: string, expectedRevision: number, action: "review-start" | "decide" | "info" | "close",
  apply: (client: PoolClient, row: RequestRow) => Promise<void>,
) {
  requireWriter(actor, action !== "info");
  await withTransaction(async (client) => {
    const row = await loadScoped(actor, id, client, true);
    if (row.revision !== expectedRevision) return fail(409, "REVISION_CONFLICT", "This request changed. Reload and try again.");
    if (!canTransition(action, row.status)) return fail(409, "INVALID_STATE", `A ${row.status} request cannot take this action.`);
    await apply(client, row);
  });
  return getRequest(actor, id);
}

export const startReview = (actor: GarageActor, id: string, expectedRevision: number) =>
  mutate(actor, id, expectedRevision, "review-start", async (client, row) => {
    await client.query("UPDATE special_requests SET status='under-review', revision=revision+1, updated_at=now() WHERE id=$1", [id]);
    await appendEvent(client, id, "review-started", row.status, "under-review", actor.userId, "");
  });

export const decide = async (actor: GarageActor, id: string, input: DecisionInput) => {
  requireWriter(actor, true);
  const missing = validateDecision(input);
  if (missing.length) throw new SpecialRequestError(400, "DECISION_INCOMPLETE", `Missing or invalid: ${missing.join(", ")}.`);
  return mutate(actor, id, input.expectedRevision, "decide", async (client, row) => {
    const accepted = input.decision === "accepted";
    const next = decisionStatus(input.decision);
    await client.query(
      `UPDATE special_requests SET status=$2, reply_decision=$3, reply_message=$4, quoted_price_minor=$5, quoted_currency=$6, duration_days=$7, duration_note=$8,
         available_from=$9, offer_valid_until=$10, owner_notes=$11, decided_by=$12, decided_at=now(), revision=revision+1, updated_at=now() WHERE id=$1`,
      [id, next, input.decision, input.message, accepted ? input.quotedPriceMinor : null, accepted ? input.quotedCurrency : null, accepted ? input.durationDays : null,
        accepted ? input.durationNote : "", accepted ? input.availableFrom : null, accepted ? input.offerValidUntil ?? null : null, input.ownerNotes, actor.userId]);
    // The reason column mirrors the customer-visible message; internal notes are only stored on the request row.
    await appendEvent(client, id, input.decision, row.status, next, actor.userId, input.message, {
      decision: input.decision, quotedPriceMinor: accepted ? input.quotedPriceMinor : null, quotedCurrency: accepted ? input.quotedCurrency : null,
      durationDays: accepted ? input.durationDays : null, availableFrom: accepted ? input.availableFrom : null, offerValidUntil: accepted ? input.offerValidUntil ?? null : null,
    });
  });
};

/** Staff answer the owner's question; the request returns to review. */
export const addInfo = (actor: GarageActor, id: string, expectedRevision: number, text: string) =>
  mutate(actor, id, expectedRevision, "info", async (client, row) => {
    await client.query("UPDATE special_requests SET status='under-review', revision=revision+1, updated_at=now() WHERE id=$1", [id]);
    await appendEvent(client, id, "info-added", row.status, "under-review", actor.userId, text);
  });

export const closeRequest = (actor: GarageActor, id: string, expectedRevision: number, reason: string) =>
  mutate(actor, id, expectedRevision, "close", async (client, row) => {
    await client.query("UPDATE special_requests SET status='closed', revision=revision+1, updated_at=now() WHERE id=$1", [id]);
    await appendEvent(client, id, "closed", row.status, "closed", actor.userId, reason);
  });

/** Hook for quote auto-generation (W2.6): records the quote that was created for an accepted request. */
export async function linkQuote(actor: GarageActor, id: string, expectedRevision: number, quoteId: string) {
  requireWriter(actor, true);
  await withTransaction(async (client) => {
    const row = await loadScoped(actor, id, client, true);
    if (row.revision !== expectedRevision) return fail(409, "REVISION_CONFLICT", "This request changed. Reload and try again.");
    if (row.status !== "accepted" || row.quote_id) return fail(409, "INVALID_STATE", "Only an accepted request without a quote can be linked.");
    const quote = await client.query(
      "SELECT 1 FROM quote_heads WHERE id=$1 AND customer_id=$2 AND vehicle_id=$3", [quoteId, row.customer_id, row.vehicle_id]);
    if (!quote.rowCount) return fail(422, "QUOTE_MISMATCH", "That quote is not for this customer and vehicle.");
    await client.query("UPDATE special_requests SET quote_id=$2, revision=revision+1, updated_at=now() WHERE id=$1", [id, quoteId]);
    await appendEvent(client, id, "quote-linked", "accepted", "accepted", actor.userId, quoteId);
  });
  return getRequest(actor, id);
}
