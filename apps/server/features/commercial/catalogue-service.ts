import { z } from "zod";
import { validateMoney, type GradeVersion, type PackageVersion, type PolicyRef, type VehicleSelection } from "@garage/domain";
import { pool, withTransaction } from "../../infrastructure/database/db";
import type { GarageActor } from "../auth/authz";
import type { ExecutionContext } from "./policy-service";

export class CatalogueError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const id = z.string().trim().min(1);
const ref = z.object({ id, version: z.number().int().positive() }).strict();
const configured = <T extends z.ZodTypeAny>(value: T) => z.discriminatedUnion("state", [z.object({ state: z.literal("unconfigured"), missing: z.array(id).min(1) }).strict(), z.object({ state: z.literal("approved"), value, policy: ref, approval: z.object({ approvedBy: id, approvedAt: id, evidenceRef: id, reason: id }).strict() }).strict()]);
const money = z.object({ minor: z.number().int().safe().nonnegative(), currency: id }).strict();
const scopeItem = z.object({ id, serviceId: id, gradeVersion: ref.nullable(), areas: z.array(id), roof: z.enum(["included", "excluded", "not-applicable"]), addOnIds: z.array(id), exclusions: z.array(id), quantity: z.number().int().positive() }).strict();
const workComponent = z.object({ id, serviceId: id, scopeItemIds: z.array(id).min(1), occupancyRule: ref }).strict();
const packageInput = z.object({ ref, revision: z.number().int().positive(), kind: z.enum(["package", "standalone"]), name: z.object({ ar: id, en: id }).strict(), vehicleCategoryIds: z.array(id), vehicleModels: z.array(id), branchIds: z.array(id).min(1), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), effectiveThrough: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), scope: z.array(scopeItem).min(1), work: z.array(workComponent).min(1), price: configured(money), tax: configured(z.object({ rule: ref, amount: money.nullable() }).strict()), workAggregation: configured(z.object({ rule: ref, mode: z.enum(["sum", "max"]) }).strict()), provenance: z.string(), approval: z.object({ approvedBy: id, approvedAt: id, evidenceRef: id, reason: id }).strict().nullable(), state: z.enum(["draft", "published", "retired"]) }).strict();
const gradeInput = z.object({ ref, revision: z.number().int().positive(), name: z.object({ ar: id, en: id }).strict(), thicknessMicrometres: z.number().int().positive().nullable(), provenance: z.string(), approval: z.null(), state: z.literal("draft") }).strict();
type PackageRow = { package_id: string; version: number; revision: number; kind: PackageVersion["kind"]; state: PackageVersion["state"]; name: PackageVersion["name"]; vehicle_category_ids: string[]; vehicle_models: string[]; branch_ids: string[]; effective_from: string | null; effective_through: string | null; scope: PackageVersion["scope"]; work: PackageVersion["work"]; price: PackageVersion["price"]; tax: PackageVersion["tax"]; work_aggregation: PackageVersion["workAggregation"]; provenance: string; approval: PackageVersion["approval"] };
const map = (r: PackageRow): PackageVersion => ({ ref: { id: r.package_id, version: r.version }, revision: r.revision, kind: r.kind, state: r.state, name: r.name, vehicleCategoryIds: r.vehicle_category_ids, vehicleModels: r.vehicle_models, branchIds: r.branch_ids, effectiveFrom: r.effective_from && String(r.effective_from).slice(0, 10), effectiveThrough: r.effective_through && String(r.effective_through).slice(0, 10), scope: r.scope, work: r.work, price: r.price, tax: r.tax, workAggregation: r.work_aggregation, provenance: r.provenance, approval: r.approval });
const owner = (actor: GarageActor) => { if (actor.role !== "owner") throw new CatalogueError(403, "ROLE_FORBIDDEN", "Only the Owner can change the catalogue."); };
async function known(table: "branches" | "services" | "catalogue_vehicle_categories", ids: string[]) {
  if (!ids.length) return;
  const found = await pool.query<{ id: string }>(`SELECT id FROM ${table} WHERE id = ANY($1::text[])`, [ids]);
  if (new Set(found.rows.map((r) => r.id)).size !== new Set(ids).size) throw new CatalogueError(400, "UNKNOWN_REFERENCE", `Unknown ${table} reference.`);
}
async function validate(input: PackageVersion) {
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
  const rows = await pool.query<PackageRow>("SELECT * FROM catalogue_package_versions ORDER BY package_id,version DESC");
  return rows.rows.map(map);
}
export async function listGradeVersions(actor: GarageActor): Promise<GradeVersion[]> {
  owner(actor);
  const rows = await pool.query<{ grade_id: string; version: number; revision: number; name: GradeVersion["name"]; thickness_micrometres: number | null; provenance: string; approval: GradeVersion["approval"]; state: GradeVersion["state"] }>("SELECT * FROM catalogue_grade_versions ORDER BY grade_id,version DESC");
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
  if (actor.role !== "owner" && !actor.branchIds.includes(input.branchId)) throw new CatalogueError(404, "BRANCH_NOT_FOUND", "Branch not found.");
  await known("branches", [input.branchId]);
  const vehicle = await pool.query<{ category_id: string | null; model: string }>("SELECT category_id,model FROM vehicles WHERE id=$1", [input.vehicle.vehicleId]);
  if (!vehicle.rowCount || vehicle.rows[0].category_id !== input.vehicle.categoryId || vehicle.rows[0].model !== input.vehicle.model) throw new CatalogueError(409, "VEHICLE_SELECTION_STALE", "Refresh the vehicle selection before checking eligibility.");
  const missing: string[] = [];
  if (!input.vehicle.categoryId) missing.push("vehicle category requires review");
  else await known("catalogue_vehicle_categories", [input.vehicle.categoryId]);
  const service = await pool.query("SELECT 1 FROM services WHERE id=$1 AND active=true", [input.serviceIntent]);
  if (!service.rowCount) return { packages: [], missing: [...missing, "unsupported service intent; human enquiry required"] };
  const rows = await pool.query<PackageRow>("SELECT v.* FROM catalogue_package_active a JOIN catalogue_package_versions v ON v.package_id=a.package_id AND v.version=a.version WHERE a.retired=false AND v.state='published' AND $1=ANY(v.branch_ids) AND (v.effective_from IS NULL OR v.effective_from<=CURRENT_DATE) AND (v.effective_through IS NULL OR v.effective_through>=CURRENT_DATE)", [input.branchId]);
  const candidates = rows.rows.map(map).filter((p) => p.scope.some((s) => s.serviceId === input.serviceIntent) && !!input.vehicle.categoryId && p.vehicleCategoryIds.includes(input.vehicle.categoryId) && (p.vehicleModels.length === 0 || p.vehicleModels.includes(input.vehicle.model)));
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
    await client.query("INSERT INTO catalogue_package_versions(package_id,version,revision,kind,state,name,vehicle_category_ids,vehicle_models,branch_ids,effective_from,effective_through,scope,work,price,tax,work_aggregation,provenance,approval,created_by) SELECT package_id,$2,revision+1,kind,'retired',name,vehicle_category_ids,vehicle_models,branch_ids,effective_from,effective_through,scope,work,price,tax,work_aggregation,provenance,approval,$3 FROM catalogue_package_versions WHERE package_id=$1 AND version=$4", [input.packageId,version,actor.userId,current.version]);
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
    const latest = await client.query<{ version: number; revision: number }>("SELECT version,revision FROM catalogue_package_versions WHERE package_id=$1 ORDER BY version DESC LIMIT 1", [parsed.ref.id]);
    if ((latest.rows[0]?.revision ?? 0) !== input.expectedRevision || parsed.revision !== input.expectedRevision + 1 || parsed.ref.version !== (latest.rows[0]?.version ?? 0) + 1) throw new CatalogueError(409, "STALE_CATALOGUE", "Catalogue changed; refresh before saving.");
    await client.query("INSERT INTO catalogue_package_versions(package_id,version,revision,kind,state,name,vehicle_category_ids,vehicle_models,branch_ids,effective_from,effective_through,scope,work,price,tax,work_aggregation,provenance,approval,created_by) VALUES($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NULL,$17)", [parsed.ref.id,parsed.ref.version,parsed.revision,parsed.kind,JSON.stringify(parsed.name),parsed.vehicleCategoryIds,parsed.vehicleModels,parsed.branchIds,parsed.effectiveFrom,parsed.effectiveThrough,JSON.stringify(parsed.scope),JSON.stringify(parsed.work),JSON.stringify(parsed.price),JSON.stringify(parsed.tax),JSON.stringify(parsed.workAggregation),parsed.provenance,actor.userId]);
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
    if (packageValue.price.state !== "approved" || packageValue.tax.state !== "approved" || packageValue.workAggregation.state !== "approved") throw new CatalogueError(400, "CONFIGURATION_MISSING", "Approved price, tax and work aggregation are required for publication.");
    const approval = { approvedBy: actor.userId, approvedAt: new Date().toISOString(), evidenceRef: input.evidenceRef, reason: input.reason.trim() };
    const version = draft.version + 1;
    await client.query("INSERT INTO catalogue_package_versions(package_id,version,revision,kind,state,name,vehicle_category_ids,vehicle_models,branch_ids,effective_from,effective_through,scope,work,price,tax,work_aggregation,provenance,approval,created_by) SELECT package_id,$2,revision+1,kind,'published',name,vehicle_category_ids,vehicle_models,branch_ids,effective_from,effective_through,scope,work,price,tax,work_aggregation,provenance,$3,$4 FROM catalogue_package_versions WHERE package_id=$1 AND version=$5", [input.packageId,version,JSON.stringify(approval),actor.userId,draft.version]);
    await client.query("INSERT INTO catalogue_package_active(package_id,version,retired) VALUES($1,$2,false) ON CONFLICT(package_id) DO UPDATE SET version=EXCLUDED.version,retired=false", [input.packageId,version]);
    await client.query("INSERT INTO catalogue_audit(entity_kind,entity_id,version,action,actor_id,reason) VALUES('package',$1,$2,'published',$3,$4)", [input.packageId,version,actor.userId,input.reason.trim()]);
    return { id: input.packageId, version };
  });
}
