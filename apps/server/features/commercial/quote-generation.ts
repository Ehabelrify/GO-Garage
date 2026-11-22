import { createHash, randomUUID } from "node:crypto";
import type { Money, PackageVersion, PolicyRef, QuoteDraftInput, QuoteLine, QuoteVersionRef, ScopeItem, VehicleSelection, WorkComponent } from "@garage/domain";
import { DEFAULT_CURRENCY, findMixedCurrency, isSupportedCurrency } from "@garage/domain";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { canAccessBranch, canManageQuotes, type GarageActor } from "../auth/authz";
import { getEligiblePackages } from "./catalogue-service";
import { getActiveQuoteAcceptance, type ExecutionContext } from "./policy-service";
import { QuoteError, createQuoteRevision } from "./quote-service";

/**
 * Quote auto-generation. Content assembly (assembleQuoteDraft, pure) is separate from the loaders and from any layout, so a
 * confirmed template can replace the print layout without touching this. Generated quotes are always DRAFTS and go through the
 * normal createQuoteRevision validation; nothing here relaxes the price/tax staleness checks.
 */
export type QuoteSource =
  | { kind: "special-request"; requestId: string }
  | { kind: "booking"; bookingId: string };

export type GenerationWarning =
  | "no-catalogue-price" | "tax-not-set" | "package-ambiguous" | "transport-added" | "terms-missing"
  | "benefit-available" | "service-guessed" | "price-from-request";

export interface AssembleInput {
  today: string;
  actorId: string;
  branchId: string;
  customerId: string;
  vehicle: VehicleSelection;
  sourceLabel: string;
  serviceId: string;
  serviceActive: boolean;
  serviceGuessed?: boolean;
  /** Accepted special request reply (price, time frame, dates). */
  request?: { title: string; price: Money; validUntil: string | null } | null;
  /** Eligible published packages for this vehicle/service (already excludes archived/retired ones). */
  packages: PackageVersion[];
  preferredPackageId?: string | null;
  /** Approved occupancy rule used when no package carries one for the service. */
  occupancyFallback: PolicyRef | null;
  transport: Array<{ id: string; direction: string; mode: string; fee: Money }>;
  terms: { acceptancePolicy: PolicyRef; taxTreatment: PolicyRef; validityDays: number } | null;
  benefitIds: string[];
  newId?: (prefix: string) => string;
}

export interface Assembled { input: QuoteDraftInput; warnings: GenerationWarning[]; mode: "catalogue" | "manual" }

const fail = (status: number, code: string, message: string): never => { throw new QuoteError(status, code, message); };
const defaultId = (prefix: string) => `${prefix}-${randomUUID()}`;
export const TRANSPORT_SCOPE_PREFIX = "transport:";

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Request/booking date wins when set; otherwise 14 days; never later than the approved acceptance policy allows or earlier than today. */
export function generatedValidThrough(today: string, preferred: string | null, validityDays: number | null): string {
  const cap = validityDays && validityDays > 0 ? addDaysIso(today, validityDays) : null;
  let value = preferred && preferred >= today ? preferred : addDaysIso(today, Math.min(14, validityDays && validityDays > 0 ? validityDays : 14));
  if (cap && value > cap) value = cap;
  return value;
}

const approvedPrice = (pkg: PackageVersion): Money | null => (pkg.price.state === "approved" ? pkg.price.value : null);
const approvedTax = (pkg: PackageVersion): Money | null => (pkg.tax.state === "approved" ? pkg.tax.value.amount : null);

/** The whole approved price sits on the first single-quantity scope item (same rule the quote form uses, so validation passes). */
function packageLines(pkg: PackageVersion, newId: (prefix: string) => string): QuoteLine[] | null {
  const price = approvedPrice(pkg);
  const tax = approvedTax(pkg);
  const carrier = pkg.scope.findIndex((item) => item.quantity === 1);
  if (!price || carrier < 0) return null;
  return pkg.scope.map((item, index) => ({
    id: newId("line"), scopeItemId: item.id, quantity: item.quantity,
    unitPrice: index === carrier ? { ...price } : { minor: 0, currency: price.currency },
    discount: { minor: 0, currency: price.currency },
    tax: !tax ? null : index === carrier ? { ...tax } : { minor: 0, currency: tax.currency },
  }));
}

const transportLabel = (row: { direction: string; mode: string }) => `${row.direction} / ${row.mode}`;

/** Pure assembly of a draft from already-loaded facts. Throws QuoteError for sources that cannot be quoted safely. */
export function assembleQuoteDraft(source: AssembleInput): Assembled {
  const newId = source.newId ?? defaultId;
  const warnings: GenerationWarning[] = [];
  if (!source.serviceActive) fail(422, "SERVICE_INACTIVE", "The service for this source is no longer active.");
  if (source.serviceGuessed) warnings.push("service-guessed");

  const occupancyFor = (serviceId: string): PolicyRef | null => {
    for (const pkg of source.packages) { const hit = pkg.work.find((work) => work.serviceId === serviceId); if (hit) return hit.occupancyRule; }
    return source.occupancyFallback;
  };

  let scope: ScopeItem[] = [];
  let work: WorkComponent[] = [];
  let lines: QuoteLine[] = [];
  let packageVersion: PolicyRef | null = null;
  let mode: Assembled["mode"] = "manual";
  let reason = `Generated from ${source.sourceLabel}`;
  let preferredValidity: string | null = null;

  const usable = source.packages.filter((pkg) => approvedPrice(pkg) !== null && pkg.scope.some((item) => item.quantity === 1))
    .sort((a, b) => a.ref.id.localeCompare(b.ref.id) || b.ref.version - a.ref.version);
  const chosen = source.request ? null : usable.find((pkg) => pkg.ref.id === source.preferredPackageId) ?? usable[0] ?? null;

  if (source.request) {
    if (!isSupportedCurrency(source.request.price.currency)) fail(422, "CURRENCY_UNSUPPORTED", "The request currency is not in the supported currency list.");
    const occupancy = occupancyFor(source.serviceId) ?? fail(422, "NO_OCCUPANCY_RULE", "No approved workshop capacity rule is available for this service.");
    const scopeId = newId("scope");
    scope = [{ id: scopeId, serviceId: source.serviceId, gradeVersion: null, areas: [source.request.title], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1 }];
    work = [{ id: newId("work"), serviceId: source.serviceId, scopeItemIds: [scopeId], occupancyRule: occupancy }];
    lines = [{ id: newId("line"), scopeItemId: scopeId, quantity: 1, unitPrice: { ...source.request.price }, discount: { minor: 0, currency: source.request.price.currency }, tax: null }];
    reason = `Special request: ${source.request.title}`;
    preferredValidity = source.request.validUntil;
    warnings.push("price-from-request");
  } else if (chosen) {
    if (usable.filter((pkg) => pkg.ref.id !== chosen.ref.id).length > 0 && !source.preferredPackageId) warnings.push("package-ambiguous");
    const price = approvedPrice(chosen)!;
    const tax = approvedTax(chosen);
    if (!isSupportedCurrency(price.currency)) fail(422, "CURRENCY_UNSUPPORTED", "The catalogue currency is not in the supported currency list.");
    if (tax && tax.currency !== price.currency) fail(422, "CURRENCY_MISMATCH", "Catalogue price and tax use different currencies.");
    lines = packageLines(chosen, newId)!;
    scope = chosen.scope.map((item) => ({ ...item }));
    work = chosen.work.map((item) => ({ ...item }));
    if (source.transport.length === 0) { mode = "catalogue"; packageVersion = chosen.ref; }
    else reason = `Generated from ${source.sourceLabel}: catalogue package ${chosen.ref.id} plus transport fee`;
    if (!tax) warnings.push("tax-not-set");
  } else {
    const occupancy = occupancyFor(source.serviceId) ?? fail(422, "NO_OCCUPANCY_RULE", "No approved workshop capacity rule is available for this service.");
    const scopeId = newId("scope");
    scope = [{ id: scopeId, serviceId: source.serviceId, gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1 }];
    work = [{ id: newId("work"), serviceId: source.serviceId, scopeItemIds: [scopeId], occupancyRule: occupancy }];
    lines = [{ id: newId("line"), scopeItemId: scopeId, quantity: 1, unitPrice: { minor: 0, currency: DEFAULT_CURRENCY }, discount: { minor: 0, currency: DEFAULT_CURRENCY }, tax: null }];
    reason = `Generated from ${source.sourceLabel}: no approved catalogue price, price to be set by staff`;
    warnings.push("no-catalogue-price");
  }

  const currency = lines[0].unitPrice.currency;
  for (const row of source.transport) {
    if (!isSupportedCurrency(row.fee.currency) || row.fee.currency !== currency) fail(422, "CURRENCY_MISMATCH", "A transport fee uses a different currency from the quote.");
    const scopeId = `${TRANSPORT_SCOPE_PREFIX}${row.id}`;
    scope.push({ id: scopeId, serviceId: source.serviceId, gradeVersion: null, areas: [`Transport: ${transportLabel(row)}`], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1 });
    lines.push({ id: newId("line"), scopeItemId: scopeId, quantity: 1, unitPrice: { ...row.fee }, discount: { minor: 0, currency }, tax: null });
  }
  if (source.transport.length > 0) { warnings.push("transport-added"); if (!warnings.includes("tax-not-set")) warnings.push("tax-not-set"); }
  if (findMixedCurrency(lines.map((line) => ({ currency: line.unitPrice.currency })), currency) !== -1) fail(422, "CURRENCY_MISMATCH", "Quote lines mix currencies.");
  if (source.request) warnings.push("tax-not-set");
  if (!source.terms) warnings.push("terms-missing");
  if (source.benefitIds.length > 0) warnings.push("benefit-available");

  const input: QuoteDraftInput = {
    branchId: source.branchId, customerId: source.customerId, vehicle: source.vehicle, enquiryRef: null, sourceChannelRef: null,
    packageVersion, scope, work, lines,
    priceOrigin: mode === "catalogue" ? { kind: "catalogue" } : { kind: "manual", actorId: source.actorId, reason },
    taxTreatment: source.terms?.taxTreatment ?? null, acceptancePolicy: source.terms?.acceptancePolicy ?? null,
    validThrough: generatedValidThrough(source.today, preferredValidity, source.terms?.validityDays ?? null),
    warrantyBindings: [], benefitBindings: [], state: "draft",
  };
  return { input, warnings: [...new Set(warnings)], mode };
}

/** Stable per-source quote id: the same source can never produce a second quote head. */
export const generatedQuoteId = (sourceKey: string) => `qg-${createHash("sha256").update(sourceKey).digest("hex").slice(0, 32)}`;

export interface GenerateResult { quote: QuoteVersionRef; created: boolean; sourceKey: string; warnings: GenerationWarning[]; customerId: string; vehicleId: string }

type Resolved = {
  sourceKey: string; sourceLabel: string; branchId: string; customerId: string; vehicleId: string; serviceId: string; serviceGuessed: boolean;
  request: AssembleInput["request"]; bookingId: string | null; preferredPackageId: string | null;
};
const todayIso = () => new Date().toISOString().slice(0, 10);
const inScope = (actor: GarageActor) => [actor.role === "owner", actor.branchIds] as const;

async function resolveSource(actor: GarageActor, source: QuoteSource): Promise<Resolved> {
  if (source.kind === "special-request") {
    const found = await pool.query<{ id: string; customer_id: string; vehicle_id: string; branch_id: string | null; status: string; title: string; quoted_price_minor: string | number | null; quoted_currency: string | null; offer_valid_until: string | null }>(
      `SELECT r.id,r.customer_id,r.vehicle_id,r.branch_id,r.status,r.title,r.quoted_price_minor,r.quoted_currency,r.offer_valid_until::text AS offer_valid_until
       FROM special_requests r WHERE r.id=$3 AND r.customer_id IN (SELECT cb.customer_id FROM customer_branches cb WHERE $1 OR cb.branch_id=ANY($2::text[]))`, [...inScope(actor), source.requestId]);
    const row = found.rows[0] ?? fail(404, "SOURCE_NOT_FOUND", "Special request not found.");
    if (row.status !== "accepted" || row.quoted_price_minor == null || !row.quoted_currency) return fail(409, "REQUEST_NOT_ACCEPTED", "Only an accepted special request with a price can become a quote.");
    let branchId = row.branch_id;
    if (!branchId) {
      const branches = await pool.query<{ branch_id: string }>("SELECT cb.branch_id FROM customer_branches cb WHERE cb.customer_id=$1 AND ($2 OR cb.branch_id=ANY($3::text[])) ORDER BY cb.branch_id LIMIT 1", [row.customer_id, ...inScope(actor)]);
      branchId = branches.rows[0]?.branch_id ?? fail(404, "SOURCE_NOT_FOUND", "No branch is available for this request.");
    }
    if (!canAccessBranch(actor, branchId)) return fail(404, "SOURCE_NOT_FOUND", "Special request not found.");
    const prior = await pool.query<{ service_id: string }>("SELECT service_id FROM bookings WHERE vehicle_id=$1 AND status<>'cancelled' ORDER BY dropoff_date DESC LIMIT 1", [row.vehicle_id]);
    let serviceId = prior.rows[0]?.service_id;
    if (!serviceId) {
      const any = await pool.query<{ id: string }>("SELECT id FROM services WHERE active=true ORDER BY name_en LIMIT 1");
      serviceId = any.rows[0]?.id ?? fail(422, "SERVICE_INACTIVE", "No active service is available.");
    }
    return {
      sourceKey: `special-request:${row.id}`, sourceLabel: `special request ${row.id}`, branchId, customerId: row.customer_id, vehicleId: row.vehicle_id, serviceId, serviceGuessed: true,
      request: { title: row.title, price: { minor: Number(row.quoted_price_minor), currency: row.quoted_currency }, validUntil: row.offer_valid_until }, bookingId: null, preferredPackageId: null,
    };
  }
  const found = await pool.query<{ id: string; customer_id: string; vehicle_id: string; branch_id: string; service_id: string; status: string; accepted_quote_id: string | null; accepted_quote_revision: number | null }>(
    "SELECT id,customer_id,vehicle_id,branch_id,service_id,status,accepted_quote_id,accepted_quote_revision FROM bookings WHERE id=$1", [source.bookingId]);
  const row = found.rows[0];
  if (!row || !canAccessBranch(actor, row.branch_id)) return fail(404, "SOURCE_NOT_FOUND", "Booking not found.");
  if (row.status === "cancelled") return fail(409, "SOURCE_CANCELLED", "A cancelled booking cannot be quoted.");
  let preferredPackageId: string | null = null;
  if (row.accepted_quote_id && row.accepted_quote_revision) {
    const snapshot = await pool.query<{ snapshot: { input?: { packageVersion?: { id?: string } | null } } }>("SELECT snapshot FROM quote_versions WHERE quote_id=$1 AND revision=$2", [row.accepted_quote_id, row.accepted_quote_revision]);
    preferredPackageId = snapshot.rows[0]?.snapshot?.input?.packageVersion?.id ?? null;
  }
  return {
    sourceKey: `booking:${row.id}`, sourceLabel: `booking ${row.id}`, branchId: row.branch_id, customerId: row.customer_id, vehicleId: row.vehicle_id,
    serviceId: row.service_id, serviceGuessed: false, request: null, bookingId: row.id, preferredPackageId,
  };
}

/** Records the generated quote on its accepted special request (once; history event appended). Safe to repeat. */
async function linkToRequest(source: QuoteSource, quoteId: string, actor: GarageActor): Promise<void> {
  if (source.kind !== "special-request") return;
  await withTransaction(async (client) => {
    const updated = await client.query("UPDATE special_requests SET quote_id=$2, revision=revision+1, updated_at=now() WHERE id=$1 AND status='accepted' AND quote_id IS NULL RETURNING id", [source.requestId, quoteId]);
    if (!updated.rowCount) return;
    await client.query(
      `INSERT INTO special_request_events (request_id, seq, action, from_status, to_status, actor_id, reason, snapshot)
       VALUES ($1, (SELECT coalesce(max(seq), 0) + 1 FROM special_request_events WHERE request_id = $1), 'quote-linked', 'accepted', 'accepted', $2, $3, NULL)`, [source.requestId, actor.userId, quoteId]);
  });
}

async function existingRef(context: ExecutionContext, quoteId: string): Promise<QuoteVersionRef | null> {
  const head = await pool.query<{ current_revision: number }>("SELECT current_revision FROM quote_heads WHERE id=$1 AND environment_id=$2", [quoteId, context.environmentId]);
  return head.rows[0] && head.rows[0].current_revision > 0 ? { quoteId, revision: head.rows[0].current_revision } : null;
}

/**
 * Builds (or returns the already built) draft quote for a source. Idempotent: the quote id derives from the source key.
 * Generated drafts need quote authority (quotes.manage on the branch) like any other quote write.
 */
export async function generateQuoteDraft(context: ExecutionContext, actor: GarageActor, source: QuoteSource): Promise<GenerateResult> {
  if (!canManageQuotes(actor)) return fail(403, "ROLE_FORBIDDEN", "Quote authority is required.");
  if (actor.isDemo) return fail(403, "DEMO_ACTION_DISABLED", "Quotes cannot be generated in a role preview session.");
  const resolved = await resolveSource(actor, source);
  const archived = await pool.query("SELECT 1 FROM record_archives WHERE entity_kind='customer' AND entity_id=$1", [resolved.customerId]);
  if (archived.rowCount) return fail(404, "SOURCE_ARCHIVED", "The customer is archived.");
  const quoteId = generatedQuoteId(resolved.sourceKey);
  const base = { sourceKey: resolved.sourceKey, customerId: resolved.customerId, vehicleId: resolved.vehicleId };
  const prior = await existingRef(context, quoteId);
  if (prior) { await linkToRequest(source, quoteId, actor); return { ...base, quote: prior, created: false, warnings: [] }; }

  const vehicleRow = await pool.query<{ model: string; category_id: string | null }>("SELECT model,category_id FROM vehicles WHERE id=$1 AND customer_id=$2", [resolved.vehicleId, resolved.customerId]);
  const vehicle: VehicleSelection = vehicleRow.rows[0] ? { vehicleId: resolved.vehicleId, model: vehicleRow.rows[0].model, categoryId: vehicleRow.rows[0].category_id } : fail(404, "SOURCE_NOT_FOUND", "Vehicle not found.");
  const service = await pool.query<{ active: boolean }>("SELECT active FROM services WHERE id=$1", [resolved.serviceId]);
  let packages: PackageVersion[] = [];
  if (!resolved.request) {
    try { packages = (await getEligiblePackages(context, actor, { branchId: resolved.branchId, vehicle, serviceIntent: resolved.serviceId })).packages; } catch { packages = []; }
  }
  const occupancy = await pool.query<{ policy_id: string; version: number }>(
    "SELECT v.policy_id,v.version FROM commercial_policy_versions v JOIN commercial_policy_active a USING(policy_id,version) WHERE v.family='work-occupancy' AND v.state='approved' ORDER BY v.policy_id LIMIT 1");
  const transport = resolved.bookingId
    ? (await pool.query<{ id: string; direction: string; mode: string; fee: Money | null }>("SELECT id,direction,mode,fee FROM transport_requests WHERE booking_id=$1 AND status<>'cancelled' AND fee IS NOT NULL ORDER BY created_at", [resolved.bookingId])).rows
        .filter((row): row is typeof row & { fee: Money } => !!row.fee && typeof row.fee.minor === "number" && row.fee.minor > 0)
    : [];
  const acceptance = await getActiveQuoteAcceptance(actor).catch(() => null);
  const terms = acceptance && acceptance.state === "approved"
    ? (() => { const value = acceptance.value as { taxTreatment?: PolicyRef; validityDays?: number }; return value.taxTreatment && value.validityDays ? { acceptancePolicy: acceptance.policy, taxTreatment: value.taxTreatment, validityDays: value.validityDays } : null; })()
    : null;
  const benefits = await pool.query<{ benefit_id: string }>("SELECT DISTINCT benefit_id FROM benefit_entitlements WHERE customer_id=$1 AND status='active' LIMIT 5", [resolved.customerId]);

  const assembled = assembleQuoteDraft({
    today: todayIso(), actorId: actor.userId, branchId: resolved.branchId, customerId: resolved.customerId, vehicle, sourceLabel: resolved.sourceLabel,
    serviceId: resolved.serviceId, serviceActive: service.rows[0]?.active === true, serviceGuessed: resolved.serviceGuessed, request: resolved.request, packages,
    preferredPackageId: resolved.preferredPackageId, occupancyFallback: occupancy.rows[0] ? { id: occupancy.rows[0].policy_id, version: occupancy.rows[0].version } : null,
    transport: transport.map((row) => ({ id: row.id, direction: row.direction, mode: row.mode, fee: row.fee })), terms, benefitIds: benefits.rows.map((row) => row.benefit_id),
  });
  try {
    const quote = await createQuoteRevision(context, actor, { ...assembled.input, quoteId });
    await linkToRequest(source, quoteId, actor);
    return { ...base, quote, created: true, warnings: assembled.warnings };
  } catch (error) {
    // A concurrent generation for the same source won the race: return its quote instead of failing.
    if (error instanceof QuoteError && error.code === "STALE_QUOTE_REVISION") { const raced = await existingRef(context, quoteId); if (raced) return { ...base, quote: raced, created: false, warnings: [] }; }
    throw error;
  }
}

export interface QuoteSourceOption { key: string; kind: "special-request" | "booking"; id: string; date: string; vehicleId: string; serviceId: string | null; title: string | null; status: string; quoteId: string | null }

/** Recent service work for a customer (newest first, max 8), used by the "Create quote" picker. */
export async function listQuoteSources(actor: GarageActor, input: { customerId: string; vehicleId?: string }): Promise<QuoteSourceOption[]> {
  if (!canManageQuotes(actor)) return fail(403, "ROLE_FORBIDDEN", "Quote authority is required.");
  const scope = inScope(actor);
  const bookings = await pool.query<{ id: string; vehicle_id: string; service_id: string; date: string; status: string; stage: string | null }>(
    `SELECT b.id,b.vehicle_id,b.service_id,b.dropoff_date::text AS date,b.status,j.stage FROM bookings b LEFT JOIN jobs j ON j.booking_id=b.id
     WHERE b.customer_id=$1 AND ($2::text IS NULL OR b.vehicle_id=$2) AND b.status<>'cancelled' AND ($3 OR b.branch_id=ANY($4::text[]))
     ORDER BY b.dropoff_date DESC, b.created_at DESC LIMIT 8`, [input.customerId, input.vehicleId ?? null, ...scope]);
  const requests = await pool.query<{ id: string; vehicle_id: string; title: string; date: string; quote_id: string | null }>(
    `SELECT r.id,r.vehicle_id,r.title,COALESCE(r.decided_at,r.created_at)::date::text AS date,r.quote_id FROM special_requests r
     WHERE r.customer_id=$1 AND ($2::text IS NULL OR r.vehicle_id=$2) AND r.status='accepted' AND r.quoted_price_minor IS NOT NULL
       AND r.customer_id IN (SELECT cb.customer_id FROM customer_branches cb WHERE $3 OR cb.branch_id=ANY($4::text[]))
     ORDER BY COALESCE(r.decided_at,r.created_at) DESC LIMIT 8`, [input.customerId, input.vehicleId ?? null, ...scope]);
  const rows: QuoteSourceOption[] = [
    ...requests.rows.map((row) => ({ key: `special-request:${row.id}`, kind: "special-request" as const, id: row.id, date: row.date, vehicleId: row.vehicle_id, serviceId: null, title: row.title, status: "accepted", quoteId: row.quote_id })),
    ...bookings.rows.map((row) => ({ key: `booking:${row.id}`, kind: "booking" as const, id: row.id, date: row.date, vehicleId: row.vehicle_id, serviceId: row.service_id, title: null, status: row.stage ?? row.status, quoteId: null })),
  ];
  return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
}
