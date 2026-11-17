import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { buildCoveragePeriod, completeLifetimeDefinition, type Configured, type LifetimeDefinition, type PolicyRef } from "@garage/domain";
import { canAccessBranch, canIssueWarranty, canManageWarrantyPolicies, type GarageActor } from "../auth/authz";
import { withTransaction } from "../../infrastructure/database/db";
import type { ExecutionContext } from "../commercial/policy-service";
import { ensureWarrantyInvoiceDraft } from "./warranty-invoices";

export class WarrantyIssuanceError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const fail = (status: number, code: string, message: string): never => { throw new WarrantyIssuanceError(status, code, message); };
const id = (prefix: string) => `${prefix}-${randomUUID()}`;
type IssueInput = { jobId: string; componentId: string | null; policyRef: PolicyRef; startDate?: string; source: "manual" | "job-delivery"; idempotencyKey: string };
export type IssuedCoverage = { warrantyId: string; startDate: string; expiresOn: string | null; coverageKind: "fixed" | "lifetime" };
type PolicyRow = { name: string; eligible_service_ids: string[]; auto_issue: boolean; start_rule: string; duration_months: number | null; coverage_kind: "fixed" | "lifetime"; lifetime_definition: Configured<LifetimeDefinition> | null; status: string; exclusions: string; evidence_requirements: string; review_role: string; response_days: number };
type Accepted = { ref: { quoteId: string; revision: number }; digest: string; warrantyBindings: { componentId: string; policy: PolicyRef; issuanceAuthority: PolicyRef }[]; work: { id: string; serviceId: string }[] };
const validDate = (value: string) => { const parsed = new Date(`${value}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value; };

export async function issueCoverageInTransaction(client: PoolClient, context: ExecutionContext, actor: GarageActor, input: IssueInput): Promise<IssuedCoverage> {
  if (!input.idempotencyKey.trim()) fail(400, "IDEMPOTENCY_KEY_REQUIRED", "An issuance request key is required.");
  const body = JSON.stringify({ jobId: input.jobId, componentId: input.componentId, policyRef: input.policyRef, startDate: input.startDate ?? null, source: input.source });
  const hash = createHash("sha256").update(body).digest("hex");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`warranty-issue:${context.environmentId}:${actor.userId}:${input.idempotencyKey}`]);
  const prior = await client.query<{ request_hash: string; warranty_id: string; start_date: string; expires_on: string | null; coverage_kind: "fixed" | "lifetime" }>(
    `SELECT r.request_hash, r.warranty_id, to_char(w.start_date,'YYYY-MM-DD') AS start_date,
            to_char(w.expires_on,'YYYY-MM-DD') AS expires_on, w.coverage_kind
     FROM warranty_issuance_requests r JOIN warranties w ON w.id=r.warranty_id
     WHERE r.environment_id=$1 AND r.actor_id=$2 AND r.idempotency_key=$3`, [context.environmentId, actor.userId, input.idempotencyKey]);
  if (prior.rows[0]) {
    if (prior.rows[0].request_hash !== hash) fail(409, "IDEMPOTENCY_CONFLICT", "This request key belongs to another issuance.");
    return { warrantyId: prior.rows[0].warranty_id, startDate: prior.rows[0].start_date, expiresOn: prior.rows[0].expires_on, coverageKind: prior.rows[0].coverage_kind };
  }
  const job = (await client.query<{ id: string; branch_id: string; assigned_user_id: string | null; stage: string; customer_id: string; vehicle_id: string; service_id: string; accepted_quote_id: string | null; accepted_quote_revision: number | null; delivery_date: string | null }>(
    `SELECT j.id,j.branch_id,j.assigned_user_id,j.stage,b.customer_id,b.vehicle_id,b.service_id,b.accepted_quote_id,b.accepted_quote_revision,
       (SELECT to_char((e.created_at AT TIME ZONE 'Africa/Cairo')::date,'YYYY-MM-DD') FROM job_events e
        WHERE e.job_id=j.id AND e.to_stage='delivered' ORDER BY e.created_at DESC LIMIT 1) AS delivery_date
     FROM jobs j JOIN bookings b ON b.id=j.booking_id WHERE j.id=$1 FOR UPDATE OF j`, [input.jobId])).rows[0];
  if (!job) fail(404, "JOB_NOT_FOUND", "The workshop job was not found.");
  if (!canIssueWarranty(actor, job.branch_id) && !(input.source === "job-delivery" && actor.role === "technician" && canAccessBranch(actor, job.branch_id) && job.assigned_user_id === actor.userId)) fail(403, "ROLE_FORBIDDEN", "This action is outside your role or branch.");
  if (job.stage !== "delivered") fail(409, "JOB_NOT_DELIVERED", "Coverage requires a delivered job.");
  const component = input.componentId ? (await client.query<{ service_id: string }>("SELECT service_id FROM job_work_components WHERE job_id=$1 AND component_id=$2 FOR UPDATE", [job.id, input.componentId])).rows[0] : null;
  if (input.componentId && !component) fail(404, "COMPONENT_NOT_FOUND", "The job component was not found.");
  const componentCount = (await client.query<{ count: string }>("SELECT count(*)::text AS count FROM job_work_components WHERE job_id=$1", [job.id])).rows[0];
  if (!input.componentId && Number(componentCount.count) > 0) fail(409, "COMPONENT_BINDING_REQUIRED", "Choose the accepted component for this coverage.");
  const serviceId = component?.service_id ?? job.service_id;
  const policy = (await client.query<PolicyRow>("SELECT * FROM warranty_policies WHERE policy_id=$1 AND version=$2 FOR SHARE", [input.policyRef.id, input.policyRef.version])).rows[0];
  if (!policy) fail(404, "POLICY_NOT_FOUND", "The exact policy version was not found.");
  if (input.source === "job-delivery" && !policy.auto_issue) fail(409, "AUTO_POLICY_NOT_APPROVED", "The bound warranty does not permit automatic issuance.");
  if (!policy.name?.trim() || !policy.eligible_service_ids?.includes(serviceId) || !policy.exclusions?.trim() || !policy.evidence_requirements?.trim() || !["owner", "branch-manager"].includes(policy.review_role) || !Number.isInteger(policy.response_days) || policy.response_days < 1 || !["job-delivery", "owner-selected-date"].includes(policy.start_rule) || (policy.coverage_kind === "fixed" ? !Number.isInteger(policy.duration_months) || (policy.duration_months ?? 0) < 1 : policy.lifetime_definition?.state !== "approved" || !completeLifetimeDefinition(policy.lifetime_definition.value))) fail(409, "POLICY_INCOMPLETE", "The exact warranty terms are incomplete. Ask the Owner to review them.");
  const service = await client.query("SELECT 1 FROM services WHERE id=$1 AND active=true", [serviceId]);
  if (!service.rowCount) fail(409, "SERVICE_NOT_ELIGIBLE", "The component service is unavailable.");
  let accepted: Accepted | null = null;
  let authority: PolicyRef | null = null;
  if (job.accepted_quote_id && job.accepted_quote_revision) {
    accepted = (await client.query<{ accepted_snapshot: Accepted }>("SELECT accepted_snapshot FROM quote_acceptance_events WHERE quote_id=$1 AND revision=$2 AND environment_id=$3", [job.accepted_quote_id, job.accepted_quote_revision,context.environmentId])).rows[0]?.accepted_snapshot ?? null;
    if (!accepted || accepted.ref.quoteId !== job.accepted_quote_id || accepted.ref.revision !== job.accepted_quote_revision) fail(409, "ACCEPTED_QUOTE_MISSING", "The accepted quote snapshot is unavailable.");
    const bindings = accepted.warrantyBindings.filter(b => b.componentId === input.componentId && b.policy.id === input.policyRef.id && b.policy.version === input.policyRef.version);
    if (bindings.length !== 1 || accepted.work.find(w => w.id === input.componentId)?.serviceId !== serviceId) fail(409, "ACCEPTED_WARRANTY_BINDING_REQUIRED", "The exact component and warranty version need an accepted binding.");
    authority = bindings[0].issuanceAuthority;
  } else if (input.componentId) fail(409, "ACCEPTED_QUOTE_MISSING", "Component coverage requires an accepted quote.");
  if (policy.status !== "published") {
    const issuanceAuthority = authority;
    if (policy.status !== "retired" || issuanceAuthority === null) throw new WarrantyIssuanceError(409, "OWNER_WARRANTY_EXCEPTION", "Ask the Owner to review this retired warranty version.");
    const approved = (await client.query<{ value: { honorRetiredAcceptedWarranty?: boolean }; state: string; approved_at: Date | null; evidence_ref: string | null }>("SELECT value,state,approved_at,evidence_ref FROM commercial_policy_versions WHERE policy_id=$1 AND version=$2", [issuanceAuthority.id, issuanceAuthority.version])).rows[0];
    if (!approved || approved.state !== "approved" || !approved.approved_at || !approved.evidence_ref || approved.value?.honorRetiredAcceptedWarranty !== true) fail(409, "OWNER_WARRANTY_EXCEPTION", "The accepted issuance authority does not permit this retired version. Ask the Owner.");
  }
  if (input.source === "job-delivery" && policy.start_rule !== "job-delivery") fail(409, "START_RULE_CONFLICT", "Automatic coverage must start on delivery.");
  const startDate = policy.start_rule === "job-delivery" ? job.delivery_date : input.startDate;
  if (typeof startDate !== "string" || !validDate(startDate)) throw new WarrantyIssuanceError(409, "START_DATE_REQUIRED", "A valid coverage start date is required.");
  const coverageStartDate = startDate;
  if (policy.start_rule === "job-delivery" && input.startDate && input.startDate !== coverageStartDate) fail(409, "START_DATE_CONFLICT", "Coverage starts on the recorded delivery date.");
  const existing = await client.query("SELECT 1 FROM warranties WHERE job_id=$1 AND component_id IS NOT DISTINCT FROM $2 AND policy_id=$3", [job.id, input.componentId, input.policyRef.id]);
  if (existing.rowCount) fail(409, "WARRANTY_ALREADY_ISSUED", "Coverage already exists for this component and policy.");
  const overlap = await client.query("SELECT 1 FROM warranties WHERE job_id=$1 AND component_id IS NOT DISTINCT FROM $2 AND policy_id<>$3 AND status='active'", [job.id, input.componentId, input.policyRef.id]);
  if (overlap.rowCount) fail(409, "WARRANTY_POLICY_OVERLAP", "This component already has coverage under another policy. Ask the Owner.");
  const period = buildCoveragePeriod(coverageStartDate, policy.coverage_kind === "fixed" ? { kind: "fixed", durationMonths: policy.duration_months! } : { kind: "lifetime", definition: policy.lifetime_definition! });
  const warrantyId = id("warranty");
  await client.query(`INSERT INTO warranties (id,policy_id,policy_version,job_id,customer_id,vehicle_id,branch_id,service_id,start_date,expires_on,issued_by,coverage_kind,lifetime_definition,component_id,accepted_quote_id,accepted_quote_revision,accepted_quote_digest,issuance_authority)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18::jsonb)`, [warrantyId,input.policyRef.id,input.policyRef.version,job.id,job.customer_id,job.vehicle_id,job.branch_id,serviceId,coverageStartDate,period.expiresOn,actor.userId,period.kind,period.kind === "lifetime" ? JSON.stringify(policy.lifetime_definition) : null,input.componentId,accepted?.ref.quoteId ?? null,accepted?.ref.revision ?? null,accepted?.digest ?? null,authority ? JSON.stringify(authority) : null]);
  const invoiceId = await ensureWarrantyInvoiceDraft(client, { warrantyId, branchId: job.branch_id, serviceId, actorUserId: actor.userId });
  if (accepted) await client.query("UPDATE warranty_invoice_drafts SET accepted_quote_id=$2,accepted_quote_revision=$3,component_id=$4,sale_source='accepted-quote-component' WHERE id=$1", [invoiceId,accepted.ref.quoteId,accepted.ref.revision,input.componentId]);
  await client.query("INSERT INTO warranty_audit_events(id,warranty_id,action,details,actor_user_id) VALUES($1,$2,$3,$4,$5),($6,$2,'invoice-draft-created',$7,$5)", [id("warranty-event"),warrantyId,input.source === "job-delivery" ? "warranty-auto-issued" : "warranty-issued",`Exact policy ${input.policyRef.id} version ${input.policyRef.version}; component ${input.componentId ?? "legacy"}; accepted quote ${accepted?.ref.quoteId ?? "none"}.`,actor.userId,id("warranty-event"),"Unpriced draft created for covered service; no revenue or payment inferred."]);
  await client.query("INSERT INTO warranty_issuance_requests(environment_id,actor_id,idempotency_key,request_hash,warranty_id) VALUES($1,$2,$3,$4,$5)", [context.environmentId,actor.userId,input.idempotencyKey,hash,warrantyId]);
  return { warrantyId, startDate: coverageStartDate, expiresOn: period.expiresOn, coverageKind: period.kind };
}

export async function retirePolicyVersion(_context: ExecutionContext, actor: GarageActor, input: { policyRef: PolicyRef; reason: string; expectedStatus: "published" | "retired" }): Promise<void> {
  if (!canManageWarrantyPolicies(actor)) fail(403,"ROLE_FORBIDDEN","Only the Owner can retire warranty terms.");
  if (!input.reason.trim()) fail(400,"REASON_REQUIRED","Record why this version is retired.");
  await withTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`warranty-policy:${input.policyRef.id}`]);
    const row = (await client.query<{ status: string }>("SELECT status FROM warranty_policies WHERE policy_id=$1 AND version=$2 FOR UPDATE",[input.policyRef.id,input.policyRef.version])).rows[0];
    if (!row) fail(404,"POLICY_NOT_FOUND","Policy version not found.");
    if (row.status !== input.expectedStatus || row.status !== "published") fail(409,"POLICY_STATUS_CHANGED","Refresh the policy status before retiring it.");
    await client.query("UPDATE warranty_policies SET status='retired' WHERE policy_id=$1 AND version=$2",[input.policyRef.id,input.policyRef.version]);
    await client.query("INSERT INTO warranty_audit_events(id,policy_id,policy_version,action,details,actor_user_id) VALUES($1,$2,$3,'policy-retired',$4,$5)",[id("warranty-event"),input.policyRef.id,input.policyRef.version,input.reason.trim(),actor.userId]);
  });
}

export async function duplicatePolicyDraft(_context: ExecutionContext, actor: GarageActor, input: { sourceRef: PolicyRef; target: "next-version" | "new-policy" }): Promise<PolicyRef> {
  if (!canManageWarrantyPolicies(actor)) fail(403,"ROLE_FORBIDDEN","Only the Owner can duplicate warranty terms.");
  return withTransaction(async client => {
    const targetId = input.target === "new-policy" ? id("warranty-policy") : input.sourceRef.id;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`warranty-policy:${targetId}`]);
    const source = (await client.query<{ status: string }>("SELECT status FROM warranty_policies WHERE policy_id=$1 AND version=$2",[input.sourceRef.id,input.sourceRef.version])).rows[0];
    if (!source) fail(404,"POLICY_NOT_FOUND","Source policy version not found.");
    if (input.target === "next-version" && source.status === "draft") fail(409,"DRAFT_EXISTS","Finish the current draft before duplicating.");
    const latest = (await client.query<{ version: number; status: string }>("SELECT version,status FROM warranty_policies WHERE policy_id=$1 ORDER BY version DESC LIMIT 1",[targetId])).rows[0];
    if (latest?.status === "draft") fail(409,"DRAFT_EXISTS","Finish the current draft before duplicating.");
    const version = (latest?.version ?? 0) + 1;
    await client.query(`INSERT INTO warranty_policies(policy_id,version,name,eligible_service_ids,auto_issue,start_rule,duration_months,exclusions,evidence_requirements,review_role,response_days,status,created_by,coverage_kind,lifetime_definition)
      SELECT $3,$4,name,eligible_service_ids,auto_issue,start_rule,duration_months,exclusions,evidence_requirements,review_role,response_days,'draft',$5,coverage_kind,
       CASE WHEN coverage_kind='lifetime' THEN jsonb_build_object('state','unconfigured','missing',jsonb_build_array('Owner approval for this draft'),'draftValue',lifetime_definition->'value') ELSE NULL END
      FROM warranty_policies WHERE policy_id=$1 AND version=$2`,[input.sourceRef.id,input.sourceRef.version,targetId,version,actor.userId]);
    await client.query("INSERT INTO warranty_audit_events(id,policy_id,policy_version,action,details,actor_user_id) VALUES($1,$2,$3,'policy-duplicated',$4,$5)",[id("warranty-event"),targetId,version,`Copied from ${input.sourceRef.id} version ${input.sourceRef.version}; new approval required.`,actor.userId]);
    return { id: targetId, version };
  });
}
