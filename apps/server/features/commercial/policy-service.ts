import { z } from "zod";
import type { Configured, PolicyRef } from "@garage/domain";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { canAccessBranch, hasCapability, type GarageActor } from "../auth/authz";

export type ExecutionContext = Readonly<{ mode: "operational" | "scenario"; environmentId: string }>;
// Created once during server startup. HTTP input cannot select a dataset.
export const commercialContext: ExecutionContext = Object.freeze({
  mode: process.env.GARAGE_EXECUTION_MODE === "scenario" ? "scenario" : "operational",
  environmentId: process.env.GARAGE_ENVIRONMENT_ID ?? "default",
});

const label = z.object({ ar: z.string().trim().min(1), en: z.string().trim().min(1) }).strict();
const money = z.object({ minor: z.number().int().safe().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/) }).strict();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ref = z.object({ id: z.string().trim().min(1), version: z.number().int().positive() }).strict();
const schemas = {
  "catalogue-pricing": z.object({ name: label, serviceId: z.string().min(1), vehicleCategoryId: z.string().min(1), gradeId: z.string().min(1), roof: z.enum(["included", "excluded", "not-applicable"]), price: money, tax: money.nullable(), bayType: z.enum(["clean", "general"]), bayHours: z.number().positive(), exclusions: z.array(z.string().min(1)) }).strict(),
  "quote-acceptance": z.object({ validityDays: z.number().int().positive(), acceptanceMethods: z.array(z.enum(["staff-recorded", "customer-confirmed"])).min(1), evidenceRequired: z.boolean(), overrideRole: z.enum(["owner", "branch-manager"]).nullable(), taxTreatment: ref }).strict(),
  "reservation-deposit": z.object({ validityDays: z.number().int().positive(), deposit: z.object({ required: z.boolean(), amount: money.nullable(), refundRule: label }).strict(), cancellationRule: label, cancellationDisposition: z.enum(["retain","release","review-required"]), priceLock: z.literal(true), redemptionTiming: z.enum(["booking","installation"]), restoreAllowed: z.boolean(), expiryAction: z.enum(["release","review-required"]) }).strict(),
  "benefit-eligibility": z.object({
    benefitId: z.string().min(1),
    activationTrigger: z.enum(["accepted", "delivered"]),
    eligibleBranchIds: z.array(z.string().min(1)).min(1),
    limit: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("quantity"), quantity: z.number().int().positive() }).strict(),
      z.object({ kind: z.literal("recurring"), quantity: z.number().int().positive(), interval: z.enum(["calendar-month", "calendar-year"]), startsOn: date, endsOn: date.nullable(), eligibilityPolicy: ref }).strict(),
      z.object({ kind: z.literal("policy-evaluated"), eligibilityPolicy: ref }).strict(),
    ]),
    eligibilityRule: label,
    responsibleTeamId: z.string().min(1).nullable(),
    transferRule: z.enum(["same-customer-vehicle", "review-required"]),
    cancellationRule: z.enum(["retain", "cancel", "review-required"]),
    expiryRule: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("none") }).strict(),
      z.object({ kind: z.literal("date"), expiresOn: date }).strict(),
      z.object({ kind: z.literal("policy-evaluated"), policy: ref }).strict(),
    ]),
    reversalRestoresEligibility: z.boolean(),
  }).strict(),
  "transport-availability": z.object({ direction: z.enum(["pickup", "return", "courtesy"]), mode: z.enum(["tow", "driver", "courtesy-car"]), serviceArea: label, providerId: z.string().min(1), capacity: z.number().int().positive(), fee: money.nullable(), custodyRule: label }).strict(),
  "promotion-qualification": z.object({ promotionId: z.string().min(1), evidenceKinds: z.array(z.enum(["warranty-reference", "membership-verification", "grouped-vehicles"])).min(1), evidenceVerification: z.object({ required:z.literal(true), authorizedRoles:z.array(z.enum(["owner","branch-manager"])).min(1), expiresAfterDays:z.number().int().positive().nullable() }).strict(), maximumUnits: z.number().int().positive(), recipient:z.object({ kind:z.enum(["customer","referred-customer"]),transferWarranty:z.literal(false) }).strict(), stackability:z.object({ allowed:z.boolean(),permittedPromotionIds:z.array(z.string().min(1)) }).strict(), grouping:z.object({ minimumVehicles:z.number().int().positive(),maximumVehicles:z.number().int().positive(),timing:z.enum(["same-quote","same-booking","accepted-quote-group"]),timingWindowHours:z.number().int().positive() }).strict(), discountAllocation:z.object({ kind:z.enum(["equal-remainder-by-vehicle","per-vehicle-fixed"]),total:money,perVehicle:money.nullable() }).strict(), exceptionAuthority:z.object({ roles:z.array(z.enum(["owner","branch-manager"])).min(1),requiresReason:z.literal(true),requiresEvidence:z.literal(true) }).strict(), beneficiaryRule: label }).strict(),
  "finance-definition": z.object({ metric: z.enum(["quoted-value", "draft-value", "collections", "outstanding", "direct-cost", "recognized-revenue", "gross-profit", "net-profit"]), currency: z.string().regex(/^[A-Z]{3}$/), minorUnitExponent: z.number().int().min(0).max(6), reportingTimezone: z.string().min(1), recognitionRule: label, taxTreatment: label, sourceKinds: z.array(z.string().min(1)).min(1), completenessRule: label, emptyPeriod: z.enum(["complete", "unavailable"]), requiredSourceKinds: z.array(z.string().min(1)) }).strict(),
  "work-occupancy": z.object({ bayType: z.enum(["clean", "general", "off-bay"]), requiredMinutes: z.number().int().positive(), durationDays: z.number().int().positive(), aggregation: z.enum(["sum", "max"]) }).strict(),
  "pickup-commitment": z.object({ authorizedRoles: z.array(z.enum(["owner", "branch-manager"])).min(1), requiresCustomerAgreement: z.literal(true) }).strict(),
  "warranty-issuance": z.object({ honorRetiredAcceptedWarranty: z.boolean() }).strict(),
} as const;
export type PolicyFamily = keyof typeof schemas;
export const policyFamilies = Object.keys(schemas) as PolicyFamily[];

export class CommercialPolicyError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
function familyFor(id: string): PolicyFamily {
  const family = id.split(":", 1)[0] as PolicyFamily;
  if (!(family in schemas)) throw new CommercialPolicyError(400, "INVALID_POLICY", "Choose a supported commercial policy family.");
  return family;
}
function owner(actor: GarageActor) {
  if (!hasCapability(actor, "catalogue.manage")) throw new CommercialPolicyError(403, "ROLE_FORBIDDEN", "Catalogue and policy management permission is required.");
}
function scope(actor: GarageActor, branchId: string | null) {
  if (branchId && !canAccessBranch(actor, branchId)) throw new CommercialPolicyError(404, "POLICY_NOT_FOUND", "Policy not found.");
}
function parseValue(family: PolicyFamily, value: unknown): unknown {
  const result = schemas[family].safeParse(value);
  if (!result.success) throw new CommercialPolicyError(400, "INVALID_POLICY_VALUE", "Complete the required policy fields before approval.");
  return result.data;
}
type Row = { policy_id: string; family: PolicyFamily; version: number; value: unknown; branch_id: string | null; effective_from: string | null; effective_through: string | null; evidence_ref: string | null; approved_by: string | null; approved_at: Date | null; reason: string | null; state: string };
export async function getCommercialPolicy<T>(_context: ExecutionContext, actor: GarageActor, id: string): Promise<Configured<T>> {
  const family = familyFor(id);
  const result = await pool.query<Row>(`SELECT v.* FROM commercial_policy_active a JOIN commercial_policy_versions v USING (policy_id, version) WHERE a.policy_id = $1`, [id]);
  const row = result.rows[0];
  if (!row) return { state: "unconfigured", missing: ["approved policy", "protected approval evidence", "Owner activation"] };
  scope(actor, row.branch_id);
  const today = new Date().toISOString().slice(0, 10);
  if ((row.effective_from && String(row.effective_from).slice(0, 10) > today) || (row.effective_through && String(row.effective_through).slice(0, 10) < today)) return { state: "unconfigured", missing: ["policy effective for the current date"] };
  if (row.family !== family || row.state !== "approved" || !row.approved_by || !row.approved_at || !row.evidence_ref || !row.reason) return { state: "unconfigured", missing: ["complete approved policy"] };
  try { parseValue(family, row.value); } catch { return { state: "unconfigured", missing: ["complete typed value"] }; }
  return { state: "approved", value: row.value as T, policy: { id, version: row.version }, approval: { approvedBy: row.approved_by, approvedAt: row.approved_at.toISOString(), evidenceRef: row.evidence_ref, reason: row.reason } };
}
export async function proposeCommercialPolicy(_context: ExecutionContext, actor: GarageActor, input: { id: string; expectedVersion: number; value: unknown; branchId?: string | null; effectiveFrom?: string | null; effectiveThrough?: string | null }): Promise<PolicyRef> {
  owner(actor); const family = familyFor(input.id); const value = parseValue(family, input.value);
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`commercial:${input.id}`]);
    const latest = await client.query<{ version: number }>("SELECT version FROM commercial_policy_versions WHERE policy_id = $1 ORDER BY version DESC LIMIT 1", [input.id]);
    if ((latest.rows[0]?.version ?? 0) !== input.expectedVersion) throw new CommercialPolicyError(409, "STALE_POLICY_VERSION", "This policy has changed. Refresh before saving.");
    const version = input.expectedVersion + 1;
    await client.query(`INSERT INTO commercial_policy_versions (policy_id,family,version,value,branch_id,effective_from,effective_through,state,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8)`, [input.id,family,version,JSON.stringify(value),input.branchId ?? null,input.effectiveFrom ?? null,input.effectiveThrough ?? null,actor.userId]);
    await client.query("INSERT INTO commercial_policy_audit (policy_id,version,action,actor_id) VALUES ($1,$2,'proposed',$3)", [input.id,version,actor.userId]);
    return { id: input.id, version };
  });
}
export async function approveCommercialPolicy(_context: ExecutionContext, actor: GarageActor, input: { id: string; expectedVersion: number; value: unknown; evidenceRef: string; reason: string }): Promise<PolicyRef> {
  owner(actor); const family = familyFor(input.id); const value = parseValue(family, input.value);
  if (!/^private:[A-Za-z0-9/_-]+$/.test(input.evidenceRef) || !input.reason.trim()) throw new CommercialPolicyError(400, "INVALID_APPROVAL_EVIDENCE", "A protected evidence reference and reason are required.");
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`commercial:${input.id}`]);
    const latest = await client.query<{ version: number }>("SELECT version FROM commercial_policy_versions WHERE policy_id = $1 ORDER BY version DESC LIMIT 1", [input.id]);
    if ((latest.rows[0]?.version ?? 0) !== input.expectedVersion) throw new CommercialPolicyError(409, "STALE_POLICY_VERSION", "This policy has changed. Refresh before approval.");
    const version = input.expectedVersion + 1;
    await client.query(`INSERT INTO commercial_policy_versions (policy_id,family,version,value,state,evidence_ref,approved_by,approved_at,reason,created_by) VALUES ($1,$2,$3,$4,'approved',$5,$6,now(),$7,$6)`, [input.id,family,version,JSON.stringify(value),input.evidenceRef,actor.userId,input.reason.trim()]);
    await client.query("INSERT INTO commercial_policy_audit (policy_id,version,action,actor_id,reason) VALUES ($1,$2,'approved',$3,$4)", [input.id,version,actor.userId,input.reason.trim()]);
    return { id: input.id, version };
  });
}
export async function activateCommercialPolicy(_context: ExecutionContext, actor: GarageActor, input: { id: string; version: number; expectedActiveVersion: number | null }): Promise<PolicyRef> {
  owner(actor); familyFor(input.id);
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`commercial:${input.id}`]);
    const active = await client.query<{ version: number }>("SELECT version FROM commercial_policy_active WHERE policy_id = $1", [input.id]);
    if ((active.rows[0]?.version ?? null) !== input.expectedActiveVersion) throw new CommercialPolicyError(409, "STALE_POLICY_VERSION", "The active policy changed. Review it before activation.");
    const target = await client.query<Row>("SELECT * FROM commercial_policy_versions WHERE policy_id = $1 AND version = $2", [input.id,input.version]);
    if (target.rows[0]?.state !== "approved") throw new CommercialPolicyError(422, "POLICY_UNCONFIGURED", "An approved policy is required before activation.");
    await client.query(`INSERT INTO commercial_policy_active (policy_id,version,activated_by) VALUES ($1,$2,$3) ON CONFLICT (policy_id) DO UPDATE SET version = EXCLUDED.version, activated_by = EXCLUDED.activated_by, activated_at = now()`, [input.id,input.version,actor.userId]);
    await client.query("INSERT INTO commercial_policy_audit (policy_id,version,action,actor_id) VALUES ($1,$2,'activated',$3)", [input.id,input.version,actor.userId]);
    return { id: input.id, version: input.version };
  });
}
export async function commercialPolicyReview(actor: GarageActor, id: string) {
  owner(actor); familyFor(id);
  const versions = await pool.query<Row>("SELECT * FROM commercial_policy_versions WHERE policy_id = $1 ORDER BY version DESC", [id]);
  const active = await pool.query<{ version: number }>("SELECT version FROM commercial_policy_active WHERE policy_id = $1", [id]);
  return { activeVersion: active.rows[0]?.version ?? null, versions: versions.rows.map((row) => ({ version: row.version, state: row.state, value: row.value, branchId: row.branch_id, approvedBy: row.approved_by, approvedAt: row.approved_at, reason: row.reason, hasProtectedEvidence: Boolean(row.evidence_ref) })) };
}

/** Active approved quote-acceptance rule (tax + validity) for quoting staff. Read-only; no id needs to be known. */
export async function getActiveQuoteAcceptance(actor: GarageActor): Promise<Configured<unknown>> {
  if (!hasCapability(actor, "catalogue.manage") && !hasCapability(actor, "quotes.view") && !hasCapability(actor, "quotes.manage")) throw new CommercialPolicyError(403, "ROLE_FORBIDDEN", "Quoting permission is required.");
  const active = await pool.query<{ policy_id: string }>("SELECT policy_id FROM commercial_policy_active WHERE policy_id LIKE 'quote-acceptance:%' ORDER BY policy_id");
  const approved: Array<Configured<unknown> & { state: "approved" }> = [];
  for (const row of active.rows) {
    const policy = await getCommercialPolicy(commercialContext, actor, row.policy_id);
    if (policy.state === "approved") approved.push(policy);
  }
  // A tax-treatment policy shares the family and points at itself; the acceptance rule points at another policy.
  const rule = approved.find((policy) => (policy.value as { taxTreatment?: { id?: string } }).taxTreatment?.id !== policy.policy.id) ?? approved[0];
  if (rule) return rule;
  return { state: "unconfigured", missing: ["approved quote-acceptance policy"] };
}

export type PromotionListItem = { ref: PolicyRef; name: { ar: string; en: string }; kind: "promotion-qualification"; value: unknown; validFrom: string | null; validUntil: string | null; status: "active" };
/**
 * Active, approved, currently effective promotion policies for anyone who can see quotes
 * (quotes.view or quotes.manage). Branch-scoped policies are limited to the actor's branches.
 * `name` is the policy's bilingual beneficiary rule (the policy value carries no separate title).
 */
export async function listActivePromotions(actor: GarageActor): Promise<PromotionListItem[]> {
  if (!hasCapability(actor, "quotes.view") && !hasCapability(actor, "quotes.manage")) throw new CommercialPolicyError(403, "ROLE_FORBIDDEN", "Quote access is required.");
  const rows = await pool.query<Row>(
    `SELECT v.* FROM commercial_policy_active a JOIN commercial_policy_versions v USING (policy_id, version)
     WHERE v.family = 'promotion-qualification' AND v.state = 'approved' AND v.approved_by IS NOT NULL AND v.approved_at IS NOT NULL
     ORDER BY a.policy_id`,
  );
  const today = new Date().toISOString().slice(0, 10);
  const out: PromotionListItem[] = [];
  for (const row of rows.rows) {
    if (row.branch_id && !canAccessBranch(actor, row.branch_id)) continue;
    const from = row.effective_from ? String(row.effective_from).slice(0, 10) : null;
    const until = row.effective_through ? String(row.effective_through).slice(0, 10) : null;
    if ((from && from > today) || (until && until < today)) continue;
    const parsed = schemas["promotion-qualification"].safeParse(row.value);
    if (!parsed.success) continue;
    out.push({ ref: { id: row.policy_id, version: row.version }, name: parsed.data.beneficiaryRule, kind: "promotion-qualification", value: parsed.data, validFrom: from, validUntil: until, status: "active" });
  }
  return out;
}
