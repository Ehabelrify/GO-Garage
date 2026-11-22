import { z } from "zod";
import { PRODUCT_SERVICE_ID, validateMoney, type GradeVersion, type IntakeCatalogueItem, type PackagePriceChange, type PackagePriceHistoryEntry, type PackageVersion, type PolicyRef, type VehicleSelection } from "@garage/domain";
import { buildPriceChange, priceEditInput, priceEditProblem, pricingPolicyId, pricingPolicyValue } from "./catalogue-price";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { canAccessBranch, hasCapability, type GarageActor } from "../auth/authz";
import type { ExecutionContext } from "./policy-service";

export class CatalogueError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const id = z.string().trim().min(1);
const ref = z.object({ id, version: z.number().int().positive() }).strict();
const configured = <T extends z.ZodTypeAny>(value: T) => z.discriminatedUnion("state", [z.object({ state: z.literal("unconfigured"), missing: z.array(id).min(1) }).strict(), z.object({ state: z.literal("approved"), value, policy: ref, approval: z.object({ approvedBy: id, approvedAt: id, evidenceRef: id, reason: id }).strict() }).strict()]);
const money = z.object({ minor: z.number().int().safe().nonnegative(), currency: id }).strict();
const scopeItem = z.object({ id, serviceId: id, gradeVersion: ref.nullable(), areas: z.array(id), roof: z.enum(["included", "excluded", "not-applicable"]), addOnIds: z.array(id), exclusions: z.array(id), quantity: z.number().int().positive(), productId: id.nullable().optional(), label: z.object({ ar: id, en: id }).strict().nullable().optional() }).strict();
const workComponent = z.object({ id, serviceId: id, scopeItemIds: z.array(id).min(1), occupancyRule: ref }).strict();
const packageInput = z.object({ ref, revision: z.number().int().positive(), kind: z.enum(["package", "standalone", "product"]), productCategory: z.object({ ar: id, en: id }).strict().nullable().optional(), name: z.object({ ar: id, en: id }).strict(), vehicleCategoryIds: z.array(id), vehicleModels: z.array(id), branchIds: z.array(id).min(1), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), effectiveThrough: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), scope: z.array(scopeItem).min(1), work: z.array(workComponent), price: configured(money), tax: configured(z.object({ rule: ref, amount: money.nullable() }).strict()), workAggregation: configured(z.object({ rule: ref, mode: z.enum(["sum", "max"]) }).strict()), provenance: z.string(), approval: z.object({ approvedBy: id, approvedAt: id, evidenceRef: id, reason: id }).strict().nullable(), state: z.enum(["draft", "published", "retired"]), priceChange: z.unknown().optional() }).strict();
const gradeInput = z.object({ ref, revision: z.number().int().positive(), name: z.object({ ar: id, en: id }).strict(), thicknessMicrometres: z.number().int().positive().nullable(), provenance: z.string(), approval: z.null(), state: z.literal("draft") }).strict();
type PackageRow = { package_id: string; version: number; revision: number; kind: PackageVersion["kind"]; state: PackageVersion["state"]; name: PackageVersion["name"]; vehicle_category_ids: string[]; vehicle_models: string[]; branch_ids: string[]; effective_from: string | null; effective_through: string | null; scope: PackageVersion["scope"]; work: PackageVersion["work"]; price: PackageVersion["price"]; tax: PackageVersion["tax"]; work_aggregation: PackageVersion["workAggregation"]; provenance: string; approval: PackageVersion["approval"]; price_change?: PackagePriceChange | null; product_category?: PackageVersion["productCategory"] };
const map = (r: PackageRow): PackageVersion => ({ ref: { id: r.package_id, version: r.version }, revision: r.revision, kind: r.kind, state: r.state, name: r.name, vehicleCategoryIds: r.vehicle_category_ids, vehicleModels: r.vehicle_models, branchIds: r.branch_ids, effectiveFrom: r.effective_from && String(r.effective_from).slice(0, 10), effectiveThrough: r.effective_through && String(r.effective_through).slice(0, 10), scope: r.scope, work: r.work, price: r.price, tax: r.tax, workAggregation: r.work_aggregation, provenance: r.provenance, approval: r.approval, ...(r.price_change ? { priceChange: r.price_change } : {}), ...(r.kind === "product" ? { productCategory: r.product_category ?? null } : {}) });
const owner = (actor: GarageActor) => { if (!hasCapability(actor, "catalogue.manage")) throw new CatalogueError(403, "ROLE_FORBIDDEN", "Catalogue management permission is required."); };
async function known(table: "branches" | "services" | "catalogue_vehicle_categories", ids: string[]) {
  if (!ids.length) return;
  const found = await pool.query<{ id: string }>(`SELECT id FROM ${table} WHERE id = ANY($1::text[])`, [ids]);
  if (new Set(found.rows.map((r) => r.id)).size !== new Set(ids).size) throw new CatalogueError(400, "UNKNOWN_REFERENCE", `Unknown ${table} reference.`);
}
/** A product is a name, bilingual category, price and tax. It has no bay work and one scope item that carries its stable id (the package id). */
function validateProduct(input: PackageVersion) {
  const item = input.scope[0];
  if (input.scope.length !== 1 || input.work.length !== 0 || item.serviceId !== PRODUCT_SERVICE_ID || item.productId !== input.ref.id || item.gradeVersion || item.addOnIds.length || !item.label)
    throw new CatalogueError(400, "INVALID_PRODUCT", "A product has one item, no workshop work and its own product id.");
  if (!input.productCategory) throw new CatalogueError(400, "PRODUCT_CATEGORY_REQUIRED", "Choose a product category.");
}
async function validate(input: PackageVersion) {
  if (input.kind === "product") {
    validateProduct(input);
    await known("branches", input.branchIds);
    await known("catalogue_vehicle_categories", input.vehicleCategoryIds);
    const refs = [...(input.price.state === "approved" ? [input.price.policy] : []), ...(input.tax.state === "approved" ? [input.tax.policy, input.tax.value.rule] : [])];
    for (const ref of refs) {
      const policy = await pool.query("SELECT 1 FROM commercial_policy_versions WHERE policy_id=$1 AND version=$2 AND state='approved'", [ref.id, ref.version]);
      if (!policy.rowCount) throw new CatalogueError(400, "UNKNOWN_POLICY", "Select an approved policy version for price or tax.");
    }
    if (input.price.state === "approved") validateMoney(input.price.value);
    if (input.tax.state === "approved" && input.tax.value.amount) validateMoney(input.tax.value.amount);
    return;
  }
  if (input.work.length === 0) throw new CatalogueError(400, "INVALID_COMPONENT", "Work components are required for services and packages.");
  await known("branches", input.branchIds);
  await known("services", [...input.scope.map((s) => s.serviceId), ...input.work.map((w) => w.serviceId), ...input.scope.flatMap((s) => s.addOnIds)]);
  await known("catalogue_vehicle_categories", input.vehicleCategoryIds);
  if (!input.vehicleCategoryIds.length) throw new CatalogueError(400, "CATEGORY_REQUIRED", "Configure at least one vehicle category before saving a package.");
  const scopeIds = new Set(input.scope.map((s) => s.id));
  if (scopeIds.size !== input.scope.length || new Set(input.work.map((w) => w.id)).size !== input.work.length || input.work.some((w) => w.scopeItemIds.some((s) => !scopeIds.has(s)))) throw new CatalogueError(400, "INVALID_COMPONENT", "Work components must refer to unique scope items.");
  for (const s of input.scope) if (s.gradeVersion) {
    const grade = await pool.query("SELECT 1 FROM catalogue_grade_active a JOIN catalogue_grade_versions v ON v.grade_id=a.grade_id AND v.version=a.version WHERE v.grade_id=$1 AND v.version=$2 AND v.state='published' AND a.retired=false", [s.gradeVersion.id, s.gradeVersion.version]);
    if (!grade.rowCount) throw new CatalogueError(400, "UNKNOWN_GRADE", "Select a published grade version.");
  }
  const policyRefs = [
    ...input.work.map((w) => w.occupancyRule),
    ...(input.price.state === "approved" ? [input.price.policy] : []),
    ...(input.tax.state === "approved" ? [input.tax.policy, input.tax.value.rule] : []),
    ...(input.workAggregation.state === "approved" ? [input.workAggregation.policy, input.workAggregation.value.rule] : []),
  ];
  for (const ref of policyRefs) {
    const policy = await pool.query("SELECT 1 FROM commercial_policy_versions WHERE policy_id=$1 AND version=$2 AND state='approved'", [ref.id, ref.version]);
    if (!policy.rowCount) throw new CatalogueError(400, "UNKNOWN_POLICY", "Select an approved policy version for price, tax or work.");
  }
  if (input.price.state === "approved") validateMoney(input.price.value);
  if (input.tax.state === "approved" && input.tax.value.amount) validateMoney(input.tax.value.amount);
}
export async function listPackageVersions(actor: GarageActor): Promise<PackageVersion[]> {
  owner(actor);
  const rows = await pool.query<PackageRow>("SELECT * FROM catalogue_package_versions v WHERE NOT EXISTS(SELECT 1 FROM record_archives ra WHERE ra.entity_kind='catalogue-package' AND ra.entity_id=v.package_id) ORDER BY package_id,version DESC");
  return rows.rows.map(map);
}
export async function listGradeVersions(actor: GarageActor): Promise<GradeVersion[]> {
  owner(actor);
  const rows = await pool.query<{ grade_id: string; version: number; revision: number; name: GradeVersion["name"]; thickness_micrometres: number | null; provenance: string; approval: GradeVersion["approval"]; state: GradeVersion["state"] }>("SELECT * FROM catalogue_grade_versions v WHERE NOT EXISTS(SELECT 1 FROM record_archives ra WHERE ra.entity_kind='catalogue-grade' AND ra.entity_id=v.grade_id) ORDER BY grade_id,version DESC");
  return rows.rows.map((r) => ({ ref: { id: r.grade_id, version: r.version }, revision: r.revision, name: r.name, thicknessMicrometres: r.thickness_micrometres, provenance: r.provenance, approval: r.approval, state: r.state }));
}
export async function listVehicleCategories(actor: GarageActor): Promise<Array<{ id: string; name: { ar: string; en: string } }>> {
  owner(actor);
  const rows = await pool.query<{ id: string; name: { ar: string; en: string } }>("SELECT id,name FROM catalogue_vehicle_categories ORDER BY id");
  return rows.rows;
}
export async function saveVehicleCategory(actor: GarageActor, input: { id: string; name: { ar: string; en: string } }) {
  owner(actor);
  const value = z.object({ id, name: z.object({ ar: id, en: id }).strict() }).strict().parse(input);
  await pool.query("INSERT INTO catalogue_vehicle_categories(id,name,created_by) VALUES($1,$2,$3)", [value.id,JSON.stringify(value.name),actor.userId]);
  return value;
}
export async function classifyVehicle(actor: GarageActor, input: { vehicleId: string; categoryId: string }) {
  owner(actor);
  await known("catalogue_vehicle_categories", [input.categoryId]);
  const result = await pool.query("UPDATE vehicles SET category_id=$2 WHERE id=$1 RETURNING id", [input.vehicleId,input.categoryId]);
  if (!result.rowCount) throw new CatalogueError(404, "VEHICLE_NOT_FOUND", "Vehicle not found.");
  return { vehicleId: input.vehicleId, categoryId: input.categoryId };
}
export async function saveGradeDraft(_context: ExecutionContext, actor: GarageActor, input: { grade: GradeVersion; expectedRevision: number }): Promise<PolicyRef> {
  owner(actor); const grade = gradeInput.parse(input.grade);
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`grade:${grade.ref.id}`]);
    const latest = await client.query<{ version: number; revision: number }>("SELECT version,revision FROM catalogue_grade_versions WHERE grade_id=$1 ORDER BY version DESC LIMIT 1", [grade.ref.id]);
    if ((latest.rows[0]?.revision ?? 0) !== input.expectedRevision || grade.revision !== input.expectedRevision + 1 || grade.ref.version !== (latest.rows[0]?.version ?? 0) + 1) throw new CatalogueError(409, "STALE_GRADE", "Grade changed; refresh before saving.");
    await client.query("INSERT INTO catalogue_grade_versions(grade_id,version,revision,state,name,thickness_micrometres,provenance,created_by) VALUES($1,$2,$3,'draft',$4,$5,$6,$7)", [grade.ref.id,grade.ref.version,grade.revision,JSON.stringify(grade.name),grade.thicknessMicrometres,grade.provenance,actor.userId]);
    await client.query("INSERT INTO catalogue_audit(entity_kind,entity_id,version,action,actor_id) VALUES('grade',$1,$2,'draft-saved',$3)", [grade.ref.id,grade.ref.version,actor.userId]);
    return grade.ref;
  });
}
export async function publishGradeVersion(_context: ExecutionContext, actor: GarageActor, input: { gradeId: string; expectedRevision: number; evidenceRef: string; reason: string }): Promise<PolicyRef> {
  owner(actor);
  if (!/^private:[A-Za-z0-9/_-]+$/.test(input.evidenceRef) || !input.reason.trim()) throw new CatalogueError(400, "APPROVAL_REQUIRED", "Protected approval evidence and reason are required.");
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`grade:${input.gradeId}`]);
    const latest = await client.query<{ version: number; revision: number; state: string }>("SELECT version,revision,state FROM catalogue_grade_versions WHERE grade_id=$1 ORDER BY version DESC LIMIT 1", [input.gradeId]);
    const draft = latest.rows[0];
    if (!draft || draft.revision !== input.expectedRevision || draft.state !== "draft") throw new CatalogueError(409, "STALE_GRADE", "Grade draft changed; refresh before publishing.");
    const version = draft.version + 1;
    const approval = { approvedBy: actor.userId, approvedAt: new Date().toISOString(), evidenceRef: input.evidenceRef, reason: input.reason.trim() };
    await client.query("INSERT INTO catalogue_grade_versions(grade_id,version,revision,state,name,thickness_micrometres,provenance,approval,created_by) SELECT grade_id,$2,revision+1,'published',name,thickness_micrometres,provenance,$3,$4 FROM catalogue_grade_versions WHERE grade_id=$1 AND version=$5", [input.gradeId,version,JSON.stringify(approval),actor.userId,draft.version]);
    await client.query("INSERT INTO catalogue_grade_active(grade_id,version,retired) VALUES($1,$2,false) ON CONFLICT(grade_id) DO UPDATE SET version=EXCLUDED.version,retired=false", [input.gradeId,version]);
    await client.query("INSERT INTO catalogue_audit(entity_kind,entity_id,version,action,actor_id,reason) VALUES('grade',$1,$2,'published',$3,$4)", [input.gradeId,version,actor.userId,input.reason.trim()]);
    return { id: input.gradeId, version };
  });
}
export async function retireGradeVersion(_context: ExecutionContext, actor: GarageActor, input: { gradeId: string; expectedRevision: number; expectedVersion: number; reason: string }): Promise<PolicyRef> {
  owner(actor);
  if (!input.reason.trim()) throw new CatalogueError(400, "REASON_REQUIRED", "Retirement reason is required.");
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`grade:${input.gradeId}`]);
    const latest = await client.query<{ version: number; revision: number; state: string }>("SELECT version,revision,state FROM catalogue_grade_versions WHERE grade_id=$1 ORDER BY version DESC LIMIT 1", [input.gradeId]);
    const current = latest.rows[0];
    if (!current || current.version !== input.expectedVersion || current.revision !== input.expectedRevision || current.state !== "published") throw new CatalogueError(409, "STALE_GRADE", "Published grade changed; refresh before retirement.");
    const version = current.version + 1;
    await client.query("INSERT INTO catalogue_grade_versions(grade_id,version,revision,state,name,thickness_micrometres,provenance,approval,created_by) SELECT grade_id,$2,revision+1,'retired',name,thickness_micrometres,provenance,approval,$3 FROM catalogue_grade_versions WHERE grade_id=$1 AND version=$4", [input.gradeId,version,actor.userId,current.version]);
    const pointer = await client.query("UPDATE catalogue_grade_active SET version=$2,retired=true WHERE grade_id=$1 AND version=$3 AND retired=false", [input.gradeId,version,current.version]);
    if (!pointer.rowCount) throw new CatalogueError(409, "STALE_GRADE", "Active grade changed; refresh before retirement.");
    await client.query("INSERT INTO catalogue_audit(entity_kind,entity_id,version,action,actor_id,reason) VALUES('grade',$1,$2,'retired',$3,$4)", [input.gradeId,version,actor.userId,input.reason.trim()]);
    return { id: input.gradeId, version };
  });
}
export async function getEligiblePackages(_context: ExecutionContext, actor: GarageActor, input: { branchId: string; vehicle: VehicleSelection; serviceIntent: string }): Promise<{ packages: PackageVersion[]; missing: string[] }> {
  if (!canAccessBranch(actor, input.branchId)) throw new CatalogueError(404, "BRANCH_NOT_FOUND", "Branch not found.");
  await known("branches", [input.branchId]);
  const vehicle = await pool.query<{ category_id: string | null; model: string }>("SELECT category_id,model FROM vehicles WHERE id=$1", [input.vehicle.vehicleId]);
  if (!vehicle.rowCount || vehicle.rows[0].category_id !== input.vehicle.categoryId || vehicle.rows[0].model !== input.vehicle.model) throw new CatalogueError(409, "VEHICLE_SELECTION_STALE", "Refresh the vehicle selection before checking eligibility.");
  const missing: string[] = [];
  if (!input.vehicle.categoryId) missing.push("vehicle category requires review");
  else await known("catalogue_vehicle_categories", [input.vehicle.categoryId]);
  const service = await pool.query("SELECT 1 FROM services WHERE id=$1 AND active=true", [input.serviceIntent]);
  if (!service.rowCount) return { packages: [], missing: [...missing, "unsupported service intent; human enquiry required"] };
  const rows = await pool.query<PackageRow>("SELECT v.* FROM catalogue_package_active a JOIN catalogue_package_versions v ON v.package_id=a.package_id AND v.version=a.version WHERE a.retired=false AND v.state='published' AND NOT EXISTS(SELECT 1 FROM record_archives ra WHERE ra.entity_kind='catalogue-package' AND ra.entity_id=v.package_id) AND $1=ANY(v.branch_ids) AND (v.effective_from IS NULL OR v.effective_from<=CURRENT_DATE) AND (v.effective_through IS NULL OR v.effective_through>=CURRENT_DATE)", [input.branchId]);
  const candidates = rows.rows.map(map).filter((p) => p.kind !== "product" && p.scope.some((s) => s.serviceId === input.serviceIntent) && !!input.vehicle.categoryId && p.vehicleCategoryIds.includes(input.vehicle.categoryId) && (p.vehicleModels.length === 0 || p.vehicleModels.includes(input.vehicle.model)));
  const gradeRefs = candidates.flatMap((p) => p.scope.map((s) => s.gradeVersion).filter((r): r is PolicyRef => r !== null));
  const gradeStates = gradeRefs.length ? await pool.query<{ grade_id: string; version: number }>("SELECT grade_id,version FROM catalogue_grade_active WHERE retired=false AND grade_id=ANY($1::text[])", [gradeRefs.map((r) => r.id)]) : { rows: [] };
  const activeGrades = new Set(gradeStates.rows.map((r) => `${r.grade_id}:${r.version}`));
  const packages = candidates.filter((p) => p.scope.every((s) => !s.gradeVersion || activeGrades.has(`${s.gradeVersion.id}:${s.gradeVersion.version}`)));
  if (packages.length < candidates.length) missing.push("grade retired; human review required");
  if (!packages.length) missing.push("approved vehicle-specific catalogue scope");
  if (packages.some((p) => p.price.state !== "approved")) missing.push("approved price unavailable");
  return { packages, missing };
}
export async function retirePackageVersion(_context: ExecutionContext, actor: GarageActor, input: { packageId: string; expectedRevision: number; expectedVersion: number; reason: string }): Promise<PolicyRef> {
  owner(actor);
  if (!input.reason.trim()) throw new CatalogueError(400, "REASON_REQUIRED", "Retirement reason is required.");
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`catalogue:${input.packageId}`]);
    const latest = await client.query<PackageRow>("SELECT * FROM catalogue_package_versions WHERE package_id=$1 ORDER BY version DESC LIMIT 1", [input.packageId]);
    const current = latest.rows[0];
    if (!current || current.version !== input.expectedVersion || current.revision !== input.expectedRevision || current.state !== "published") throw new CatalogueError(409, "STALE_CATALOGUE", "Published version changed; refresh before retirement.");
    const version = current.version + 1;
    await client.query("INSERT INTO catalogue_package_versions(package_id,version,revision,kind,state,name,vehicle_category_ids,vehicle_models,branch_ids,effective_from,effective_through,scope,work,price,tax,work_aggregation,provenance,approval,created_by,product_category) SELECT package_id,$2,revision+1,kind,'retired',name,vehicle_category_ids,vehicle_models,branch_ids,effective_from,effective_through,scope,work,price,tax,work_aggregation,provenance,approval,$3,product_category FROM catalogue_package_versions WHERE package_id=$1 AND version=$4", [input.packageId,version,actor.userId,current.version]);
    const pointer = await client.query("UPDATE catalogue_package_active SET version=$2,retired=true WHERE package_id=$1 AND version=$3 AND retired=false", [input.packageId,version,current.version]);
    if (!pointer.rowCount) throw new CatalogueError(409, "STALE_CATALOGUE", "Active package changed; refresh before retirement.");
    await client.query("INSERT INTO catalogue_audit(entity_kind,entity_id,version,action,actor_id,reason) VALUES('package',$1,$2,'retired',$3,$4)", [input.packageId,version,actor.userId,input.reason.trim()]);
    return { id: input.packageId, version };
  });
}
export async function savePackageDraft(_context: ExecutionContext, actor: GarageActor, input: { package: PackageVersion; expectedRevision: number }): Promise<PolicyRef> {
  owner(actor); const parsed = packageInput.parse(input.package) as PackageVersion;
  if (parsed.state !== "draft" || parsed.approval) throw new CatalogueError(400, "INVALID_DRAFT", "Save a draft without approval.");
  await validate(parsed);
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`catalogue:${parsed.ref.id}`]);
    const latest = await client.query<{ version: number; revision: number; state?: string; price_change?: PackagePriceChange | null }>("SELECT version,revision,state,price_change FROM catalogue_package_versions WHERE package_id=$1 ORDER BY version DESC LIMIT 1", [parsed.ref.id]);
    if ((latest.rows[0]?.revision ?? 0) !== input.expectedRevision || parsed.revision !== input.expectedRevision + 1 || parsed.ref.version !== (latest.rows[0]?.version ?? 0) + 1) throw new CatalogueError(409, "STALE_CATALOGUE", "Catalogue changed; refresh before saving.");
    const carriedPriceChange = latest.rows[0]?.state === "draft" && latest.rows[0].price_change ? JSON.stringify(latest.rows[0].price_change) : null;
    await client.query("INSERT INTO catalogue_package_versions(package_id,version,revision,kind,state,name,vehicle_category_ids,vehicle_models,branch_ids,effective_from,effective_through,scope,work,price,tax,work_aggregation,provenance,approval,created_by,price_change,product_category) VALUES($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NULL,$17,$18,$19)", [parsed.ref.id,parsed.ref.version,parsed.revision,parsed.kind,JSON.stringify(parsed.name),parsed.vehicleCategoryIds,parsed.vehicleModels,parsed.branchIds,parsed.effectiveFrom,parsed.effectiveThrough,JSON.stringify(parsed.scope),JSON.stringify(parsed.work),JSON.stringify(parsed.price),JSON.stringify(parsed.tax),JSON.stringify(parsed.workAggregation),parsed.provenance,actor.userId,carriedPriceChange,parsed.kind === "product" ? JSON.stringify(parsed.productCategory) : null]);
    await client.query("INSERT INTO catalogue_audit(entity_kind,entity_id,version,action,actor_id) VALUES('package',$1,$2,'draft-saved',$3)", [parsed.ref.id,parsed.ref.version,actor.userId]);
    return parsed.ref;
  });
}
export async function publishPackageVersion(_context: ExecutionContext, actor: GarageActor, input: { packageId: string; expectedRevision: number; evidenceRef: string; reason: string }): Promise<PolicyRef> {
  owner(actor);
  if (!/^private:[A-Za-z0-9/_-]+$/.test(input.evidenceRef) || !input.reason.trim()) throw new CatalogueError(400, "APPROVAL_REQUIRED", "Protected approval evidence and reason are required.");
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`catalogue:${input.packageId}`]);
    const latest = await client.query<PackageRow>("SELECT * FROM catalogue_package_versions WHERE package_id=$1 ORDER BY version DESC LIMIT 1", [input.packageId]);
    const draft = latest.rows[0];
    if (!draft || draft.revision !== input.expectedRevision || draft.state !== "draft") throw new CatalogueError(409, "STALE_CATALOGUE", "Draft changed; refresh before publishing.");
    const packageValue = map(draft);
    await validate(packageValue);
    if (!draft.price_change && (packageValue.price.state !== "approved" || packageValue.tax.state !== "approved" || (packageValue.kind !== "product" && packageValue.workAggregation.state !== "approved"))) throw new CatalogueError(400, "CONFIGURATION_MISSING", "Approved price, tax and work aggregation are required for publication.");
    const approval = { approvedBy: actor.userId, approvedAt: new Date().toISOString(), evidenceRef: input.evidenceRef, reason: input.reason.trim() };
    const version = draft.version + 1;
    const change = draft.price_change ?? null;
    if (change) {
      // Owner price edit: the proposed price/tax become an approved, activated catalogue-pricing policy and the new published version.
      const today = new Date().toISOString().slice(0, 10);
      const problem = priceEditProblem(change, today, { effectiveThrough: packageValue.effectiveThrough });
      if (problem) throw new CatalogueError(400, problem.code, problem.message);
      const isProduct = packageValue.kind === "product";
      if (!change.taxRule || (!isProduct && !change.aggregation)) throw new CatalogueError(400, "CONFIGURATION_MISSING", "An approved tax rule and work-aggregation rule are required for publication.");
      for (const rule of [change.taxRule, ...(change.aggregation ? [change.aggregation.rule] : [])]) {
        const found = await client.query("SELECT 1 FROM commercial_policy_versions WHERE policy_id=$1 AND version=$2 AND state='approved'", [rule.id, rule.version]);
        if (!found.rowCount) throw new CatalogueError(400, "UNKNOWN_POLICY", "Select an approved policy version for price, tax or work.");
      }
      // A product has no workshop service: it carries zero bay hours.
      const svc = packageValue.kind === "product" ? { rowCount: 1, rows: [{ bay_type: "general" as const, bay_hours: "0" }] } : await client.query<{ bay_type: "clean" | "general"; bay_hours: string }>("SELECT bay_type,bay_hours FROM services WHERE id=$1", [packageValue.scope[0].serviceId]);
      if (!svc.rowCount) throw new CatalogueError(400, "UNKNOWN_REFERENCE", "Unknown services reference.");
      const pricingId = pricingPolicyId(input.packageId, version);
      const pricingValue = pricingPolicyValue(packageValue, change, { bayType: svc.rows[0].bay_type, bayHours: Number(svc.rows[0].bay_hours) });
      await client.query("INSERT INTO commercial_policy_versions(policy_id,family,version,value,effective_from,state,evidence_ref,approved_by,approved_at,reason,created_by) VALUES($1,'catalogue-pricing',1,$2,$3,'approved',$4,$5,now(),$6,$5)", [pricingId, JSON.stringify(pricingValue), change.effectiveFrom, input.evidenceRef, actor.userId, input.reason.trim()]);
      await client.query("INSERT INTO commercial_policy_active(policy_id,version,activated_by) VALUES($1,1,$2)", [pricingId, actor.userId]);
      for (const action of ["proposed", "approved", "activated"] as const) await client.query("INSERT INTO commercial_policy_audit(policy_id,version,action,actor_id,reason) VALUES($1,1,$2,$3,$4)", [pricingId, action, actor.userId, input.reason.trim()]);
      const pricingRef = { id: pricingId, version: 1 };
      const price = { state: "approved", value: change.price, policy: pricingRef, approval };
      const tax = { state: "approved", value: { rule: change.taxRule, amount: change.tax }, policy: change.taxRule, approval };
      const aggregation = change.aggregation ? { state: "approved", value: { rule: change.aggregation.rule, mode: change.aggregation.mode }, policy: change.aggregation.rule, approval } : JSON.parse(JSON.stringify(draft.work_aggregation));
      await client.query("INSERT INTO catalogue_package_versions(package_id,version,revision,kind,state,name,vehicle_category_ids,vehicle_models,branch_ids,effective_from,effective_through,scope,work,price,tax,work_aggregation,provenance,approval,created_by,product_category) SELECT package_id,$2,revision+1,kind,'published',name,vehicle_category_ids,vehicle_models,branch_ids,$6::date,effective_through,scope,work,$7::jsonb,$8::jsonb,$9::jsonb,provenance,$3,$4,product_category FROM catalogue_package_versions WHERE package_id=$1 AND version=$5", [input.packageId,version,JSON.stringify(approval),actor.userId,draft.version,change.effectiveFrom,JSON.stringify(price),JSON.stringify(tax),JSON.stringify(aggregation)]);
    } else {
      await client.query("INSERT INTO catalogue_package_versions(package_id,version,revision,kind,state,name,vehicle_category_ids,vehicle_models,branch_ids,effective_from,effective_through,scope,work,price,tax,work_aggregation,provenance,approval,created_by,product_category) SELECT package_id,$2,revision+1,kind,'published',name,vehicle_category_ids,vehicle_models,branch_ids,effective_from,effective_through,scope,work,price,tax,work_aggregation,provenance,$3,$4,product_category FROM catalogue_package_versions WHERE package_id=$1 AND version=$5", [input.packageId,version,JSON.stringify(approval),actor.userId,draft.version]);
    }
    await client.query("INSERT INTO catalogue_package_active(package_id,version,retired) VALUES($1,$2,false) ON CONFLICT(package_id) DO UPDATE SET version=EXCLUDED.version,retired=false", [input.packageId,version]);
    await client.query("INSERT INTO catalogue_audit(entity_kind,entity_id,version,action,actor_id,reason) VALUES('package',$1,$2,'published',$3,$4)", [input.packageId,version,actor.userId,input.reason.trim()]);
    return { id: input.packageId, version };
  });
}

/** Owner price edit: saves a NEW draft version (never edits a published one) carrying the proposed price and tax. Publish it through publishPackageVersion. */
export async function savePriceDraft(_context: ExecutionContext, actor: GarageActor, raw: unknown): Promise<PolicyRef> {
  owner(actor); const input = priceEditInput.parse(raw);
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`catalogue:${input.packageId}`]);
    const latest = await client.query<PackageRow>("SELECT * FROM catalogue_package_versions WHERE package_id=$1 ORDER BY version DESC LIMIT 1", [input.packageId]);
    const current = latest.rows[0];
    if (!current || current.version !== input.expectedVersion || current.revision !== input.expectedRevision) throw new CatalogueError(409, "STALE_CATALOGUE", "Catalogue changed; refresh before editing prices.");
    if (current.state === "retired") throw new CatalogueError(409, "PACKAGE_RETIRED", "A retired package cannot be repriced.");
    const pkg = map(current);
    const problem = priceEditProblem(input, new Date().toISOString().slice(0, 10), { effectiveThrough: pkg.effectiveThrough });
    if (problem) throw new CatalogueError(400, problem.code, problem.message);
    const change = buildPriceChange(input, pkg);
    if (!change.taxRule || (pkg.kind !== "product" && !change.aggregation)) throw new CatalogueError(400, "CONFIGURATION_MISSING", "Choose an approved tax rule and work-aggregation rule.");
    for (const rule of [change.taxRule, ...(change.aggregation ? [change.aggregation.rule] : [])]) {
      const found = await client.query("SELECT 1 FROM commercial_policy_versions WHERE policy_id=$1 AND version=$2 AND state='approved'", [rule.id, rule.version]);
      if (!found.rowCount) throw new CatalogueError(400, "UNKNOWN_POLICY", "Select an approved policy version for price, tax or work.");
    }
    const version = current.version + 1;
    await client.query("INSERT INTO catalogue_package_versions(package_id,version,revision,kind,state,name,vehicle_category_ids,vehicle_models,branch_ids,effective_from,effective_through,scope,work,price,tax,work_aggregation,provenance,approval,created_by,price_change,product_category) SELECT package_id,$2,revision+1,kind,'draft',name,vehicle_category_ids,vehicle_models,branch_ids,effective_from,effective_through,scope,work,price,tax,work_aggregation,provenance,NULL,$3,$4,product_category FROM catalogue_package_versions WHERE package_id=$1 AND version=$5", [input.packageId,version,actor.userId,JSON.stringify(change),current.version]);
    await client.query("INSERT INTO catalogue_audit(entity_kind,entity_id,version,action,actor_id,reason) VALUES('package',$1,$2,'draft-saved',$3,$4)", [input.packageId,version,actor.userId,change.reason]);
    return { id: input.packageId, version };
  });
}

/** Owner-only price history for one package: who changed what and when, newest first. */
export async function listPackagePriceHistory(actor: GarageActor, packageId: string): Promise<PackagePriceHistoryEntry[]> {
  owner(actor);
  const rows = await pool.query<PackageRow & { created_at: Date; created_by_name: string | null; approved_by_name: string | null; reason: string | null }>(
    `SELECT v.*, COALESCE(NULLIF(c.full_name,''),c.email) AS created_by_name, COALESCE(NULLIF(a.full_name,''),a.email) AS approved_by_name,
            (SELECT x.reason FROM catalogue_audit x WHERE x.entity_kind='package' AND x.entity_id=v.package_id AND x.version=v.version ORDER BY x.id LIMIT 1) AS reason
     FROM catalogue_package_versions v
     LEFT JOIN staff_memberships c ON c.clerk_user_id=v.created_by
     LEFT JOIN staff_memberships a ON a.clerk_user_id=v.approval->>'approvedBy'
     WHERE v.package_id=$1 ORDER BY v.version DESC`, [packageId]);
  return rows.rows.map((r) => {
    const pkg = map(r);
    const change = pkg.priceChange ?? null;
    return {
      version: r.version, state: r.state,
      price: change ? change.price : pkg.price.state === "approved" ? pkg.price.value : null,
      tax: change ? change.tax : pkg.tax.state === "approved" ? pkg.tax.value.amount : null,
      previousPrice: change ? change.previous.price : null, previousTax: change ? change.previous.tax : null,
      effectiveFrom: change ? change.effectiveFrom : pkg.effectiveFrom,
      createdByName: r.created_by_name ?? "", createdAt: new Date(r.created_at).toISOString(),
      approvedByName: r.approved_by_name ?? null, approvedAt: pkg.approval?.approvedAt ?? null,
      reason: r.reason ?? pkg.approval?.reason ?? "", isPriceEdit: Boolean(change),
    };
  });
}

/** Read access for quoting: catalogue managers and booking staff (quotes are prepared by reception). */
const canQuote = (actor: GarageActor) => hasCapability(actor, "catalogue.manage") || hasCapability(actor, "quotes.view") || hasCapability(actor, "quotes.manage");

/** Published, active, non-archived packages available in the actor's branches, with the vehicle categories they name. Read-only. */
export async function listAvailablePackages(actor: GarageActor): Promise<{ packages: PackageVersion[]; categories: Array<{ id: string; name: { ar: string; en: string } }> }> {
  if (!canQuote(actor)) throw new CatalogueError(403, "ROLE_FORBIDDEN", "Quoting permission is required.");
  const rows = await pool.query<PackageRow>("SELECT v.* FROM catalogue_package_active a JOIN catalogue_package_versions v ON v.package_id=a.package_id AND v.version=a.version WHERE a.retired=false AND v.state='published' AND NOT EXISTS(SELECT 1 FROM record_archives ra WHERE ra.entity_kind='catalogue-package' AND ra.entity_id=v.package_id) AND (v.effective_from IS NULL OR v.effective_from<=CURRENT_DATE) AND (v.effective_through IS NULL OR v.effective_through>=CURRENT_DATE) ORDER BY v.package_id");
  const packages = rows.rows.map(map).filter((p) => actor.role === "owner" || p.branchIds.some((branchId) => canAccessBranch(actor, branchId)));
  const categories = await pool.query<{ id: string; name: { ar: string; en: string } }>("SELECT id,name FROM catalogue_vehicle_categories ORDER BY id");
  return { packages, categories: categories.rows };
}

/** The exact model/category pair the catalogue holds for a vehicle in the actor's branches (replaces id probing). */
export async function getVehicleSelection(actor: GarageActor, vehicleId: string): Promise<VehicleSelection> {
  if (!canQuote(actor)) throw new CatalogueError(403, "ROLE_FORBIDDEN", "Quoting permission is required.");
  const found = await pool.query<{ id: string; model: string; category_id: string | null }>(
    "SELECT v.id, v.model, v.category_id FROM vehicles v WHERE v.id=$1 AND ($2 OR EXISTS(SELECT 1 FROM customer_branches cb WHERE cb.customer_id=v.customer_id AND cb.branch_id=ANY($3::text[])))",
    [vehicleId, actor.role === "owner", actor.branchIds],
  );
  const row = found.rows[0];
  if (!row) throw new CatalogueError(404, "VEHICLE_NOT_FOUND", "Vehicle not found.");
  return { vehicleId: row.id, model: row.model, categoryId: row.category_id };
}

/* ------------------------------ quick intake catalogue ------------------------------ */

export type IntakeScopeContext = { actor: Pick<GarageActor, "role" | "branchIds">; branchId?: string | null; vehicle?: { model: string; categoryId: string | null } | null };

/** Pure eligibility for the unified intake list. An unclassified vehicle (no category yet) does not hide items; staff review it on the quote. */
export function intakeEligible(p: PackageVersion, context: IntakeScopeContext): boolean {
  const branches = context.branchId ? [context.branchId] : context.actor.role === "owner" ? null : context.actor.branchIds;
  if (branches ? !p.branchIds.some((branchId) => branches.includes(branchId)) : false) return false;
  if (context.branchId && !p.branchIds.includes(context.branchId)) return false;
  const vehicle = context.vehicle;
  if (vehicle) {
    if (p.vehicleCategoryIds.length && vehicle.categoryId && !p.vehicleCategoryIds.includes(vehicle.categoryId)) return false;
    if (p.vehicleModels.length && !p.vehicleModels.includes(vehicle.model)) return false;
  }
  return true;
}

export function toIntakeItem(p: PackageVersion): IntakeCatalogueItem {
  const price = p.price.state === "approved" ? p.price.value : null;
  const tax = p.tax.state === "approved" ? p.tax.value.amount : null;
  const isProduct = p.kind === "product";
  return {
    id: { packageId: p.ref.id, version: p.ref.version },
    kind: isProduct ? "product" : p.kind === "package" ? "package" : "service",
    name: p.name,
    ...(isProduct && p.productCategory ? { category: p.productCategory } : {}),
    price, tax,
    requiresVehicle: !isProduct || p.vehicleCategoryIds.length > 0 || p.vehicleModels.length > 0,
    bayWork: !isProduct && p.work.length > 0,
  };
}

const kindOrder = { service: 0, package: 1, product: 2 } as const;

/** One list for quick intake: stand-alone services, packages and products that are published, effective, not archived and eligible. */
export async function listIntakeItems(actor: GarageActor, input: { q?: string; kind?: IntakeCatalogueItem["kind"]; vehicleId?: string; branchId?: string }): Promise<IntakeCatalogueItem[]> {
  if (!hasCapability(actor, "quotes.view") && !hasCapability(actor, "quotes.manage") && !hasCapability(actor, "bookings.manage")) throw new CatalogueError(403, "ROLE_FORBIDDEN", "Quoting or booking permission is required.");
  if (input.branchId && !canAccessBranch(actor, input.branchId)) throw new CatalogueError(404, "BRANCH_NOT_FOUND", "Branch not found.");
  let vehicle: { model: string; categoryId: string | null } | null = null;
  if (input.vehicleId) {
    const found = await pool.query<{ model: string; category_id: string | null }>(
      "SELECT v.model, v.category_id FROM vehicles v WHERE v.id=$1 AND ($2 OR EXISTS(SELECT 1 FROM customer_branches cb WHERE cb.customer_id=v.customer_id AND cb.branch_id=ANY($3::text[])))",
      [input.vehicleId, actor.role === "owner", actor.branchIds]);
    if (!found.rows[0]) throw new CatalogueError(404, "VEHICLE_NOT_FOUND", "Vehicle not found.");
    vehicle = { model: found.rows[0].model, categoryId: found.rows[0].category_id };
  }
  const rows = await pool.query<PackageRow>("SELECT v.* FROM catalogue_package_active a JOIN catalogue_package_versions v ON v.package_id=a.package_id AND v.version=a.version WHERE a.retired=false AND v.state='published' AND NOT EXISTS(SELECT 1 FROM record_archives ra WHERE ra.entity_kind='catalogue-package' AND ra.entity_id=v.package_id) AND (v.effective_from IS NULL OR v.effective_from<=CURRENT_DATE) AND (v.effective_through IS NULL OR v.effective_through>=CURRENT_DATE) ORDER BY v.package_id");
  const eligible = rows.rows.map(map).filter((p) => intakeEligible(p, { actor, branchId: input.branchId ?? null, vehicle }));
  const gradeRefs = eligible.flatMap((p) => p.scope.map((s) => s.gradeVersion).filter((r): r is PolicyRef => r !== null));
  const activeGrades = new Set<string>();
  if (gradeRefs.length) {
    const grades = await pool.query<{ grade_id: string; version: number }>("SELECT grade_id,version FROM catalogue_grade_active WHERE retired=false AND grade_id=ANY($1::text[])", [gradeRefs.map((r) => r.id)]);
    for (const g of grades.rows) activeGrades.add(`${g.grade_id}:${g.version}`);
  }
  const needle = (input.q ?? "").trim().toLowerCase();
  return eligible
    .filter((p) => p.scope.every((s) => !s.gradeVersion || activeGrades.has(`${s.gradeVersion.id}:${s.gradeVersion.version}`)))
    .map(toIntakeItem)
    .filter((item) => (!input.kind || item.kind === input.kind) && (!needle || [item.name.ar, item.name.en, item.category?.ar, item.category?.en].some((text) => text?.toLowerCase().includes(needle))))
    .sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.name.en.localeCompare(b.name.en));
}

/** Active, published, effective, non-archived versions for the exact (packageId, version) pairs a client chose. Missing or superseded pairs are simply absent. */
export async function loadIntakePackages(runner: Pick<PoolClient, "query">, refs: Array<{ packageId: string; version: number }>): Promise<PackageVersion[]> {
  if (!refs.length) return [];
  const rows = await runner.query<PackageRow>(
    "SELECT v.* FROM catalogue_package_active a JOIN catalogue_package_versions v ON v.package_id=a.package_id AND v.version=a.version WHERE a.retired=false AND v.state='published' AND v.package_id=ANY($1::text[]) AND NOT EXISTS(SELECT 1 FROM record_archives ra WHERE ra.entity_kind='catalogue-package' AND ra.entity_id=v.package_id) AND (v.effective_from IS NULL OR v.effective_from<=CURRENT_DATE) AND (v.effective_through IS NULL OR v.effective_through>=CURRENT_DATE)",
    [[...new Set(refs.map((r) => r.packageId))]]);
  const wanted = new Set(refs.map((r) => `${r.packageId}@${r.version}`));
  return rows.rows.map(map).filter((p) => wanted.has(`${p.ref.id}@${p.ref.version}`));
}
