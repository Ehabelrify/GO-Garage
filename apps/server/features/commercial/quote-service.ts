import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { AcceptedQuoteSnapshot, Money, QuoteDraftInput, QuoteFollowup, QuoteRevision, QuoteVersionRef } from "@garage/domain";
import { withTransaction, pool } from "../../infrastructure/database/db";
import { canAccessBranch, canManageQuotes, canViewQuotes, type GarageActor } from "../auth/authz";
import { commercialContext, type ExecutionContext } from "./policy-service";
import { materializeBenefitsInTransaction } from "./benefit-service";

export class QuoteError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const id = z.string().trim().min(1);
const ref = z.object({ id, version: z.number().int().positive() }).strict();
const money = z.object({ minor: z.number().int().safe().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/) }).strict();
const scope = z.object({ id, serviceId: id, gradeVersion: ref.nullable(), areas: z.array(id), roof: z.enum(["included", "excluded", "not-applicable"]), addOnIds: z.array(id), exclusions: z.array(id), quantity: z.number().int().positive() }).strict();
const work = z.object({ id, serviceId: id, scopeItemIds: z.array(id).min(1), occupancyRule: ref }).strict();
const line = z.object({ id, scopeItemId: id, quantity: z.number().int().positive(), unitPrice: money, discount: money, tax: money.nullable() }).strict();
export const quoteDraftSchema = z.object({
  quoteId: id.optional(), priorRevision: z.object({ quoteId: id, revision: z.number().int().positive() }).strict().optional(),
  branchId: id, customerId: id, vehicle: z.object({ vehicleId: id, model: id, categoryId: id.nullable() }).strict(),
  enquiryRef: id.nullable().optional(), sourceChannelRef: id.nullable().optional(), packageVersion: ref.nullable(),
  scope: z.array(scope).min(1), work: z.array(work).min(1), lines: z.array(line).min(1),
  priceOrigin: z.discriminatedUnion("kind", [z.object({ kind: z.literal("catalogue") }).strict(), z.object({ kind: z.enum(["manual", "inspection"]), actorId: id, reason: id }).strict()]),
  taxTreatment: ref.nullable(), acceptancePolicy: ref.nullable(), validThrough: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  warrantyBindings: z.array(z.object({ componentId: id, policy: ref, issuanceAuthority: ref }).strict()), benefitBindings: z.array(ref),
  state: z.enum(["draft", "offered"]),
}).strict();
const acceptanceSchema = z.object({ ref: z.object({ quoteId: id, revision: z.number().int().positive() }).strict(), expectedDigest: id, acceptanceEvidenceRef: id, idempotencyKey: id }).strict();
type AcceptanceTerms = { validityDays: number; acceptanceMethods: Array<"staff-recorded" | "customer-confirmed">; evidenceRequired: boolean; overrideRole: "owner" | "branch-manager" | null; taxTreatment: { id: string; version: number } };
type VersionRow = { quote_id: string; revision: number; state: QuoteRevision["state"]; snapshot: { input: QuoteDraftInput; total: Money | null; acceptanceTerms: AcceptanceTerms | null }; digest: string; valid_through: string | null };
type Head = { id: string; environment_id:string; branch_id: string; customer_id: string; vehicle_id: string; current_revision: number; accepted_revision: number | null };
const fail = (status: number, code: string, message: string): never => { throw new QuoteError(status, code, message); };
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
function scoped(actor: GarageActor, branchId: string) { if (!canManageQuotes(actor)) fail(403, "ROLE_FORBIDDEN", "Quote authority is required."); if (!canAccessBranch(actor, branchId)) fail(404, "QUOTE_NOT_FOUND", "Quote not found."); }
function totalFor(lines: QuoteDraftInput["lines"]): Money {
  const currency = lines[0]?.unitPrice.currency;
  if (!currency) return fail(422, "POLICY_UNCONFIGURED", "Currency is required.");
  let total = 0;
  for (const item of lines) {
    if (!item.tax || [item.unitPrice, item.discount, item.tax].some((m) => m.currency !== currency)) return fail(422, "POLICY_UNCONFIGURED", "Tax and matching currency are required on every line.");
    const gross = item.unitPrice.minor * item.quantity;
    if (!Number.isSafeInteger(gross) || item.discount.minor > gross) return fail(400, "INVALID_AMOUNT", "Line amount exceeds safe limits or discount exceeds price.");
    total += gross - item.discount.minor + item.tax.minor;
    if (!Number.isSafeInteger(total)) return fail(400, "INVALID_AMOUNT", "Total exceeds safe integer limits.");
  }
  return { minor: total, currency };
}
async function approvedPolicy(client: PoolClient, policy: { id: string; version: number } | null, family?: string) {
  if (!policy) return fail(422, "POLICY_UNCONFIGURED", "Approved policy reference is required.");
  const result = await client.query<{ value: unknown; family: string }>("SELECT v.value,v.family FROM commercial_policy_versions v JOIN commercial_policy_active a USING(policy_id,version) WHERE v.policy_id=$1 AND v.version=$2 AND v.state='approved' AND (v.effective_from IS NULL OR v.effective_from<=CURRENT_DATE) AND (v.effective_through IS NULL OR v.effective_through>=CURRENT_DATE)", [policy.id, policy.version]);
  if (!result.rowCount || (family && result.rows[0].family !== family)) return fail(422, "POLICY_UNCONFIGURED", "Referenced approved policy is unavailable.");
  return result.rows[0].value;
}
async function validateReferences(client: PoolClient, actor: GarageActor, input: QuoteDraftInput, offer: boolean): Promise<{ total: Money | null; terms: AcceptanceTerms | null }> {
  const relationship = await client.query<{ model: string; category_id: string | null }>("SELECT v.model,v.category_id FROM vehicles v JOIN customers c ON c.id=v.customer_id JOIN customer_branches cb ON cb.customer_id=c.id WHERE v.id=$1 AND c.id=$2 AND cb.branch_id=$3", [input.vehicle.vehicleId, input.customerId, input.branchId]);
  if (!relationship.rowCount) return fail(404, "QUOTE_CONTEXT_NOT_FOUND", "Customer, vehicle or branch is unavailable.");
  if (relationship.rows[0].model !== input.vehicle.model || relationship.rows[0].category_id !== input.vehicle.categoryId) return fail(409, "VEHICLE_SELECTION_STALE", "Vehicle selection changed.");
  const scopeIds = new Set(input.scope.map((s) => s.id));
  const componentIds = new Set(input.work.map((w) => w.id));
  if (scopeIds.size !== input.scope.length || componentIds.size !== input.work.length || new Set(input.lines.map((l) => l.id)).size !== input.lines.length || input.lines.some((l) => !scopeIds.has(l.scopeItemId) || l.quantity !== input.scope.find((s) => s.id === l.scopeItemId)?.quantity) || input.work.some((w) => w.scopeItemIds.some((s) => !scopeIds.has(s))) || input.warrantyBindings.some((b) => !componentIds.has(b.componentId))) return fail(400, "INVALID_SCOPE", "Quote lines and components must match unique scope items.");
  const services = [...new Set([...input.scope.map(s=>s.serviceId),...input.work.map(w=>w.serviceId)])];
  const foundServices = await client.query<{ id: string }>("SELECT id FROM services WHERE id=ANY($1::text[]) AND active=true",[services]);
  if (foundServices.rowCount !== services.length) return fail(400,"UNKNOWN_SERVICE","Choose active services for the quoted scope.");
  if (input.packageVersion || input.priceOrigin.kind === "catalogue") {
    if (!input.packageVersion) { if (offer) return fail(422, "POLICY_UNCONFIGURED", "Published catalogue version is required."); return {total:null,terms:null}; }
    const packageRow = await client.query<{ scope: unknown; work: unknown; price: { state: string; value?: Money }; tax: { state: string; value?: { amount: Money | null } }; branch_ids: string[]; vehicle_category_ids: string[]; vehicle_models: string[]; state: string }>("SELECT * FROM catalogue_package_versions WHERE package_id=$1 AND version=$2", [input.packageVersion.id,input.packageVersion.version]);
    const p = packageRow.rows[0];
    if (!p || p.state !== "published" || !p.branch_ids.includes(input.branchId) || !input.vehicle.categoryId || !p.vehicle_category_ids.includes(input.vehicle.categoryId) || (p.vehicle_models.length && !p.vehicle_models.includes(input.vehicle.model)) || canonical(p.scope) !== canonical(input.scope) || canonical(p.work) !== canonical(input.work)) return fail(409, "CATALOGUE_SCOPE_STALE", "Selected catalogue scope is unavailable or changed.");
    if (offer && input.priceOrigin.kind === "catalogue" && (p.price.state !== "approved" || p.tax.state !== "approved" || !p.price.value || !p.tax.value?.amount)) return fail(422, "POLICY_UNCONFIGURED", "Approved catalogue price and tax are required.");
    if (offer && input.priceOrigin.kind === "catalogue" && p.price.value && p.tax.value?.amount) {
      const base = input.lines.reduce((n,l) => n + l.unitPrice.minor*l.quantity - l.discount.minor, 0);
      const tax = input.lines.reduce((n,l) => n + (l.tax?.minor ?? 0), 0);
      if (!Number.isSafeInteger(base) || base !== p.price.value.minor || tax !== p.tax.value.amount.minor || input.lines.some((l) => l.unitPrice.currency !== p.price.value?.currency || l.tax?.currency !== p.tax.value?.amount?.currency)) return fail(409, "CATALOGUE_PRICE_STALE", "Quoted price or tax differs from approved catalogue terms.");
    }
  }
  if (!offer) return {total:null,terms:null};
  const policy = await approvedPolicy(client,input.acceptancePolicy,"quote-acceptance") as AcceptanceTerms;
  if (!input.taxTreatment || canonical(input.taxTreatment) !== canonical(policy.taxTreatment)) return fail(422, "POLICY_UNCONFIGURED", "Approved tax treatment is required.");
  await approvedPolicy(client,input.taxTreatment);
  if (!input.validThrough || input.validThrough < new Date().toISOString().slice(0,10)) return fail(422, "POLICY_UNCONFIGURED", "Offer validity must be configured and current.");
  const maxValidity = new Date(); maxValidity.setUTCDate(maxValidity.getUTCDate()+policy.validityDays);
  if (input.validThrough > maxValidity.toISOString().slice(0,10)) return fail(422,"POLICY_UNCONFIGURED","Offer validity exceeds the approved policy.");
  if (input.priceOrigin.kind !== "catalogue" && (input.priceOrigin.actorId !== actor.userId || !input.priceOrigin.reason.trim() || (actor.role !== "owner" && actor.role !== policy.overrideRole))) return fail(403, "PRICING_AUTHORITY_REQUIRED", "Manual or inspection pricing requires configured authority and reason.");
  if (input.lines.some((l) => l.discount.minor > 0)) return fail(422, "POLICY_UNCONFIGURED", "A configured discount grant is required before discounting.");
  for (const item of input.work) await approvedPolicy(client,item.occupancyRule);
  for (const item of input.warrantyBindings) {
    const warranty = await client.query<{ status: string }>("SELECT status FROM warranty_policies WHERE policy_id=$1 AND version=$2", [item.policy.id, item.policy.version]);
    if (warranty.rows[0]?.status !== "published") return fail(422, "WARRANTY_TERMS_UNAVAILABLE", "Choose an approved published warranty version before offering it.");
    await approvedPolicy(client, item.issuanceAuthority, "warranty-issuance");
  }
  for (const item of input.benefitBindings) await approvedPolicy(client,item);
  return { total:totalFor(input.lines),terms:policy };
}
export async function createQuoteRevision(context: ExecutionContext, actor: GarageActor, raw: QuoteDraftInput): Promise<QuoteVersionRef> {
  const input = quoteDraftSchema.parse(raw) as QuoteDraftInput;
  scoped(actor,input.branchId);
  const quoteId = input.quoteId ?? randomUUID();
  return withTransaction(async (client) => {
    await client.query("INSERT INTO quote_heads(id,environment_id,branch_id,customer_id,vehicle_id,created_by) SELECT $1,$2,b.id,c.id,v.id,$6 FROM branches b JOIN customer_branches cb ON cb.branch_id=b.id JOIN customers c ON c.id=cb.customer_id JOIN vehicles v ON v.customer_id=c.id WHERE b.id=$3 AND c.id=$4 AND v.id=$5 ON CONFLICT(id) DO NOTHING", [quoteId,context.environmentId,input.branchId,input.customerId,input.vehicle.vehicleId,actor.userId]);
    const head = (await client.query<Head>("SELECT * FROM quote_heads WHERE id=$1 AND environment_id=$2 FOR UPDATE",[quoteId,context.environmentId])).rows[0];
    if (!head) return fail(404,"QUOTE_CONTEXT_NOT_FOUND","Customer, vehicle or branch is unavailable.");
    if (head.branch_id !== input.branchId || head.customer_id !== input.customerId || head.vehicle_id !== input.vehicle.vehicleId) return fail(409,"QUOTE_CONTEXT_CHANGED","Quote context cannot be replaced.");
    if (head.accepted_revision !== null || (head.current_revision > 0 && (!input.priorRevision || input.priorRevision.quoteId !== quoteId || input.priorRevision.revision !== head.current_revision)) || (head.current_revision === 0 && input.priorRevision)) return fail(409,"STALE_QUOTE_REVISION","Refresh the latest quote revision.");
    const validated = await validateReferences(client,actor,input,input.state === "offered");
    const revision = head.current_revision + 1;
    const snapshot = { input: { ...input, quoteId }, total:validated.total, acceptanceTerms:validated.terms };
    const digest = hash({ quoteId, revision, snapshot });
    await client.query("INSERT INTO quote_versions(quote_id,revision,state,snapshot,digest,valid_through,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",[quoteId,revision,input.state,JSON.stringify(snapshot),digest,input.validThrough,actor.userId]);
    await client.query("UPDATE quote_heads SET current_revision=$2 WHERE id=$1",[quoteId,revision]);
    if (revision === 1) await client.query("INSERT INTO quote_followups(quote_id) VALUES($1)",[quoteId]);
    await client.query("INSERT INTO quote_audit(quote_id,revision,action,actor_id) VALUES($1,$2,$3,$4)",[quoteId,revision,input.state === "offered" ? "offered" : "draft-created",actor.userId]);
    return { quoteId, revision };
  });
}
export async function readQuoteRevision(context: ExecutionContext, actor: GarageActor, ref: QuoteVersionRef): Promise<QuoteRevision> {
  const result = await pool.query<VersionRow & { branch_id: string; current_revision: number; accepted_revision: number | null }>("SELECT v.*,h.branch_id,h.current_revision,h.accepted_revision FROM quote_versions v JOIN quote_heads h ON h.id=v.quote_id WHERE v.quote_id=$1 AND v.revision=$2 AND h.environment_id=$3",[ref.quoteId,ref.revision,context.environmentId]);
  const row = result.rows[0];
  if (!row || !canAccessBranch(actor,row.branch_id) || !canViewQuotes(actor)) return fail(404,"QUOTE_NOT_FOUND","Quote not found.");
  const state = row.accepted_revision === row.revision ? "accepted" : row.revision < row.current_revision ? "superseded" : row.state;
  return { ref, state, input: row.snapshot.input, total: row.snapshot.total, digest: row.digest, validThrough: row.valid_through && String(row.valid_through).slice(0,10) };
}
export async function listQuotes(context: ExecutionContext, actor: GarageActor): Promise<Array<QuoteRevision & { followup: QuoteFollowup }>> {
  if (!canViewQuotes(actor)) return fail(403,"ROLE_FORBIDDEN","Quote access is required.");
  const rows = await pool.query<VersionRow & { current_revision: number; accepted_revision: number | null; requested_at: Date; responsible_user_id: string | null; status: QuoteFollowup["status"]; answered_at: Date | null; promised_response_at: Date | null }>("SELECT v.*,h.current_revision,h.accepted_revision,f.* FROM quote_heads h JOIN quote_versions v ON v.quote_id=h.id AND v.revision=h.current_revision JOIN quote_followups f ON f.quote_id=h.id WHERE h.environment_id=$1 AND NOT EXISTS(SELECT 1 FROM record_archives ra WHERE ra.entity_kind='quote' AND ra.entity_id=h.id) AND ($2='owner' OR h.branch_id=ANY($3::text[])) ORDER BY v.created_at DESC",[context.environmentId,actor.role,actor.branchIds]);
  return rows.rows.map((r) => ({ ref: { quoteId:r.quote_id,revision:r.revision }, state:r.accepted_revision===r.revision?"accepted":r.state, input:r.snapshot.input,total:r.snapshot.total,digest:r.digest,validThrough:r.valid_through&&String(r.valid_through).slice(0,10),followup:{ requestedAt:r.requested_at.toISOString(),responsibleUserId:r.responsible_user_id,status:r.status,answeredAt:r.answered_at?.toISOString()??null,promisedResponseAt:r.promised_response_at?.toISOString()??null } }));
}
export async function acceptQuote(context: ExecutionContext, actor: GarageActor, raw: { ref: QuoteVersionRef; expectedDigest: string; acceptanceEvidenceRef: string; idempotencyKey: string }): Promise<AcceptedQuoteSnapshot> {
  const input = acceptanceSchema.parse(raw);
  const requestHash = hash(input);
  return withTransaction(async (client) => {
    const head = (await client.query<Head>("SELECT * FROM quote_heads WHERE id=$1 AND environment_id=$2 FOR UPDATE",[input.ref.quoteId,context.environmentId])).rows[0];
    if (!head || !canAccessBranch(actor,head.branch_id) || !canManageQuotes(actor)) return fail(404,"QUOTE_NOT_FOUND","Quote not found.");
    const prior = await client.query<{ request_hash: string; accepted_snapshot: AcceptedQuoteSnapshot }>("SELECT request_hash,accepted_snapshot FROM quote_acceptance_events WHERE environment_id=$1 AND actor_id=$2 AND quote_id=$3 AND idempotency_key=$4",[context.environmentId,actor.userId,input.ref.quoteId,input.idempotencyKey]);
    if (prior.rowCount) { if (prior.rows[0].request_hash !== requestHash) return fail(409,"IDEMPOTENCY_CONFLICT","This key belongs to a different acceptance request."); return prior.rows[0].accepted_snapshot; }
    if (head.accepted_revision !== null || head.current_revision !== input.ref.revision) return fail(409,"STALE_QUOTE_REVISION","Quote revision changed or was already accepted.");
    const row = (await client.query<VersionRow>("SELECT * FROM quote_versions WHERE quote_id=$1 AND revision=$2",[input.ref.quoteId,input.ref.revision])).rows[0];
    if (!row || row.state !== "offered" || row.digest !== input.expectedDigest) return fail(409,"STALE_QUOTE_DIGEST","Review the current offered quote.");
    if (!row.valid_through || String(row.valid_through).slice(0,10) < new Date().toISOString().slice(0,10)) return fail(409,"QUOTE_EXPIRED","Quote offer is no longer valid.");
    const policy = row.snapshot.acceptanceTerms;
    if (!policy || !/^private:[A-Za-z0-9/_-]+$/.test(input.acceptanceEvidenceRef)) return fail(422,"ACCEPTANCE_EVIDENCE_REQUIRED","Protected acceptance evidence is required.");
    const verified = await client.query("SELECT 1 FROM quote_customer_confirmations WHERE quote_id=$1 AND revision=$2 AND customer_id=$3 AND evidence_ref=$4 AND verified_at IS NOT NULL",[input.ref.quoteId,input.ref.revision,head.customer_id,input.acceptanceEvidenceRef]);
    const method = verified.rowCount ? "customer-confirmed" : "staff-recorded";
    if (!policy.acceptanceMethods.includes(method)) return fail(422,"ACCEPTANCE_EVIDENCE_REQUIRED","This acceptance method is not approved.");
    const recomputed = totalFor(row.snapshot.input.lines);
    if (canonical(recomputed) !== canonical(row.snapshot.total) || hash({ quoteId:input.ref.quoteId,revision:input.ref.revision,snapshot:row.snapshot }) !== row.digest) return fail(409,"QUOTE_SNAPSHOT_INVALID","Stored offer integrity check failed.");
    const accepted: AcceptedQuoteSnapshot = { ref:input.ref,branchId:head.branch_id,customerId:head.customer_id,vehicle:row.snapshot.input.vehicle,packageVersion:row.snapshot.input.packageVersion,scope:row.snapshot.input.scope,lines:row.snapshot.input.lines,total:recomputed,taxTreatment:row.snapshot.input.taxTreatment!,work:row.snapshot.input.work,warrantyBindings:row.snapshot.input.warrantyBindings,benefitBindings:row.snapshot.input.benefitBindings,acceptance:{ method,actorId:actor.userId,evidenceRef:input.acceptanceEvidenceRef,at:new Date().toISOString() },digest:row.digest };
    await client.query("INSERT INTO quote_acceptance_events(quote_id,revision,environment_id,actor_id,method,evidence_ref,idempotency_key,request_hash,accepted_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[input.ref.quoteId,input.ref.revision,context.environmentId,actor.userId,method,input.acceptanceEvidenceRef,input.idempotencyKey,requestHash,JSON.stringify(accepted)]);
    await client.query("UPDATE quote_heads SET accepted_revision=$2 WHERE id=$1",[input.ref.quoteId,input.ref.revision]);
    await client.query("INSERT INTO quote_audit(quote_id,revision,action,actor_id) VALUES($1,$2,'accepted',$3)",[input.ref.quoteId,input.ref.revision,actor.userId]);
    await materializeBenefitsInTransaction(client,context,actor,{quoteRef:input.ref,trigger:"accepted"});
    return accepted;
  });
}
export async function readAcceptanceOutcome(context: ExecutionContext, actor: GarageActor, quoteId: string, idempotencyKey: string): Promise<AcceptedQuoteSnapshot | null> {
  const h = await pool.query<Head>("SELECT * FROM quote_heads WHERE id=$1 AND environment_id=$2",[quoteId,context.environmentId]);
  if (!h.rowCount || !canViewQuotes(actor) || !canAccessBranch(actor,h.rows[0].branch_id)) return fail(404,"QUOTE_NOT_FOUND","Quote not found.");
  const event = await pool.query<{ accepted_snapshot: AcceptedQuoteSnapshot }>("SELECT accepted_snapshot FROM quote_acceptance_events WHERE environment_id=$1 AND actor_id=$2 AND quote_id=$3 AND idempotency_key=$4",[context.environmentId,actor.userId,quoteId,idempotencyKey]);
  return event.rows[0]?.accepted_snapshot ?? null;
}
export async function readAcceptedQuote(context: ExecutionContext, actor: GarageActor, ref: QuoteVersionRef): Promise<AcceptedQuoteSnapshot> {
  const event = await pool.query<{ branch_id: string; accepted_snapshot: AcceptedQuoteSnapshot }>("SELECT h.branch_id,e.accepted_snapshot FROM quote_acceptance_events e JOIN quote_heads h ON h.id=e.quote_id WHERE e.quote_id=$1 AND e.revision=$2 AND e.environment_id=$3 AND h.environment_id=$3",[ref.quoteId,ref.revision,context.environmentId]);
  if (!event.rowCount || !canViewQuotes(actor) || !canAccessBranch(actor,event.rows[0].branch_id)) return fail(404,"QUOTE_NOT_FOUND","Accepted quote not found.");
  return event.rows[0].accepted_snapshot;
}
export async function recordQuoteFollowup(context: ExecutionContext, actor: GarageActor, input: { quoteId: string; expectedRevision: number; nextStatus: QuoteFollowup["status"]; responsibleUserId?: string | null; promisedResponseAt?: string | null }): Promise<void> {
  await withTransaction(async (client) => {
    const head = (await client.query<Head>("SELECT * FROM quote_heads WHERE id=$1 AND environment_id=$2 FOR UPDATE",[input.quoteId,context.environmentId])).rows[0];
    if (!head || !canManageQuotes(actor) || !canAccessBranch(actor,head.branch_id)) return fail(404,"QUOTE_NOT_FOUND","Quote not found.");
    if (head.current_revision !== input.expectedRevision) return fail(409,"STALE_QUOTE_REVISION","Refresh quote follow-up.");
    const current = (await client.query<{ status: QuoteFollowup["status"] }>("SELECT status FROM quote_followups WHERE quote_id=$1 FOR UPDATE",[input.quoteId])).rows[0];
    if (!current || current.status === "cancelled" || current.status === "answered" || !({ requested:["preparing","answered","cancelled"],preparing:["requested","answered","cancelled"] } as Record<string,string[]>)[current.status]?.includes(input.nextStatus)) return fail(409,"FOLLOWUP_TRANSITION_INVALID","Follow-up transition is unavailable.");
    if (input.nextStatus === "answered") { const offered = await client.query("SELECT 1 FROM quote_versions WHERE quote_id=$1 AND revision=$2 AND state='offered'",[input.quoteId,input.expectedRevision]); if (!offered.rowCount) return fail(409,"OFFER_REQUIRED","Record an offered quote before answering follow-up."); }
    if (input.responsibleUserId !== undefined && input.responsibleUserId !== null) { const member = await client.query<{ branch_ids: string[]; role: string }>("SELECT branch_ids,role FROM staff_memberships WHERE clerk_user_id=$1 AND status='active'",[input.responsibleUserId]); if (!member.rowCount || (member.rows[0].role !== "owner" && !member.rows[0].branch_ids.includes(head.branch_id))) return fail(400,"INVALID_RESPONSIBLE_USER","Choose an active user for this branch."); }
    await client.query("UPDATE quote_followups SET status=$2,answered_at=CASE WHEN $2='answered' THEN now() ELSE NULL END,responsible_user_id=CASE WHEN $3 THEN $4 ELSE responsible_user_id END,promised_response_at=CASE WHEN $5 THEN $6 ELSE promised_response_at END WHERE quote_id=$1",[input.quoteId,input.nextStatus,input.responsibleUserId!==undefined,input.responsibleUserId??null,input.promisedResponseAt!==undefined,input.promisedResponseAt??null]);
    await client.query("INSERT INTO quote_audit(quote_id,revision,action,actor_id) VALUES($1,$2,$3,$4)",[input.quoteId,input.expectedRevision,`followup-${input.nextStatus}`,actor.userId]);
  });
}
export const boundQuoteContext = commercialContext;
