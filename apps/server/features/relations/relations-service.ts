import { pool } from "../../infrastructure/database/db";
import { canAccessBranch, hasCapability, type Capability, type GarageActor } from "../auth/authz";
import { commercialContext } from "../commercial/policy-service";
import { canAccessInbox, loadInboxMembership } from "../whatsapp/inbox-access";
import {
  digitsOnly, escapeLike, normalizePlate, parseWarrantyCode, plateLikePatterns, restrictedSection,
  type RelationSection, type SearchType,
} from "./relations-helpers";

export class RelationsError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const fail = (status: number, code: string, message: string): never => { throw new RelationsError(status, code, message); };

export type SearchResult = { type: SearchType; id: string; title: string; subtitle: string; badge?: string; route: string };

const PREVIEW_LIMIT = 5;
const SEARCH_LIMIT = 8;
const routes = {
  customer: (id: string) => `/workspace/customers?customerId=${encodeURIComponent(id)}`,
  vehicle: (id: string) => `/workspace/customers?vehicleId=${encodeURIComponent(id)}`,
  booking: (id: string) => `/workspace/bookings?record=${encodeURIComponent(id)}`,
  quote: (id: string) => `/workspace/quotes?record=${encodeURIComponent(id)}`,
  warranty: (id: string) => `/workspace/warranties?record=${encodeURIComponent(id)}`,
};
/** SQL predicate that is true when the record is NOT soft-archived. */
const notArchived = (kind: string, column: string) =>
  `NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind='${kind}' AND ra.entity_id=${column})`;

function scopeOf(actor: GarageActor) {
  return { owner: actor.role === "owner", branchIds: actor.branchIds };
}
const can = (actor: GarageActor, capability: Capability) =>
  hasCapability(actor, capability) || (capability === "quotes.view" && hasCapability(actor, "quotes.manage"));
/** Contact details are hidden for demo identities (same stance as transport contacts). */
const phoneFor = (actor: GarageActor, phone: string): string | null => (actor.isDemo ? null : phone);

function maskPhone(phone: string): string {
  const digits = digitsOnly(phone);
  return digits.length > 4 ? `${"*".repeat(digits.length - 4)}${digits.slice(-4)}` : phone;
}

export async function globalSearch(actor: GarageActor, rawQuery: string, types: SearchType[]): Promise<SearchResult[]> {
  const q = rawQuery.trim();
  // Search exposes customer identities, so it needs customers.read like the customer list does.
  if (!can(actor, "customers.read")) fail(403, "ROLE_FORBIDDEN", "Search is not available to your role.");
  if (q.length < 2 || q.length > 120) return [];
  const { owner, branchIds } = scopeOf(actor);
  const like = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;
  const digits = digitsOnly(q);
  const plate = normalizePlate(q);
  const results: SearchResult[] = [];
  const customerVisible = `(c.id IN (SELECT cb.customer_id FROM customer_branches cb WHERE $1 OR cb.branch_id = ANY($2::text[])) AND ${notArchived("customer", "c.id")})`;

  if (types.includes("customer")) {
    // Phone lookups are skipped for demo identities, whose contacts are hidden.
    const phoneSearch = !actor.isDemo && digits.length >= 3 && digits.length === q.replace(/[\s+()-]/g, "").length;
    const rows = await pool.query<{ id: string; name: string; phone: string }>(
      `SELECT c.id, c.name, c.phone FROM customers c
       WHERE ${customerVisible} AND (c.name ILIKE $3 ESCAPE '\\' OR ($4::boolean AND reverse(c.phone_normalized) LIKE reverse($5::text) || '%'))
       ORDER BY c.name LIMIT ${SEARCH_LIMIT}`,
      [owner, branchIds, like, phoneSearch, digits],
    );
    for (const row of rows.rows) {
      results.push({ type: "customer", id: row.id, title: row.name, subtitle: actor.isDemo ? "" : maskPhone(row.phone), route: routes.customer(row.id) });
    }
  }
  if (types.includes("vehicle") && plate.length >= 2) {
    const rows = await pool.query<{ id: string; plate: string; make: string; model: string; name: string }>(
      `SELECT v.id, v.plate, v.make, v.model, c.name FROM vehicles v JOIN customers c ON c.id = v.customer_id
       WHERE ${customerVisible} AND garage_normalize_plate(v.plate) LIKE ANY($3::text[])
       ORDER BY v.plate LIMIT ${SEARCH_LIMIT}`,
      [owner, branchIds, plateLikePatterns(q)],
    );
    for (const row of rows.rows) {
      results.push({ type: "vehicle", id: row.id, title: row.plate, subtitle: `${[row.make, row.model].filter(Boolean).join(" ")} - ${row.name}`, route: routes.vehicle(row.id) });
    }
  }
  if (types.includes("booking") && can(actor, "bookings.manage")) {
    const rows = await pool.query<{ id: string; status: string; dropoff_date: string; name: string }>(
      `SELECT b.id, b.status, b.dropoff_date::text AS dropoff_date, c.name FROM bookings b JOIN customers c ON c.id = b.customer_id
       WHERE ($1 OR b.branch_id = ANY($2::text[])) AND b.id ILIKE $3 ESCAPE '\\' ORDER BY b.created_at DESC LIMIT ${SEARCH_LIMIT}`,
      [owner, branchIds, prefix],
    );
    for (const row of rows.rows) {
      results.push({ type: "booking", id: row.id, title: row.id, subtitle: `${row.name} - ${row.dropoff_date}`, badge: row.status, route: routes.booking(row.id) });
    }
  }
  if (types.includes("quote") && can(actor, "quotes.view")) {
    const rows = await pool.query<{ id: string; state: string | null; name: string }>(
      `SELECT h.id, CASE WHEN h.accepted_revision IS NOT NULL THEN 'accepted' ELSE v.state END AS state, c.name
       FROM quote_heads h JOIN customers c ON c.id = h.customer_id
       LEFT JOIN quote_versions v ON v.quote_id = h.id AND v.revision = h.current_revision
       WHERE h.environment_id = $3 AND ($1 OR h.branch_id = ANY($2::text[])) AND h.id ILIKE $4 ESCAPE '\\' AND ${notArchived("quote", "h.id")}
       ORDER BY h.created_at DESC LIMIT ${SEARCH_LIMIT}`,
      [owner, branchIds, commercialContext.environmentId, prefix],
    );
    for (const row of rows.rows) {
      results.push({ type: "quote", id: row.id, title: row.id, subtitle: row.name, badge: row.state ?? undefined, route: routes.quote(row.id) });
    }
  }
  if (types.includes("warranty") && can(actor, "warranty.view")) {
    const parsed = parseWarrantyCode(q);
    const rows = await pool.query<{ id: string; status: string; plate: string; name: string }>(
      `SELECT DISTINCT w.id, w.status, v.plate, c.name
       FROM warranties w JOIN vehicles v ON v.id = w.vehicle_id JOIN customers c ON c.id = w.customer_id
       LEFT JOIN warranty_verification_tokens t ON t.warranty_id = w.id AND t.token_hash = $4::text
       WHERE ($1 OR w.branch_id = ANY($2::text[])) AND (w.id ILIKE $3 ESCAPE '\\' OR t.id IS NOT NULL)
       LIMIT ${SEARCH_LIMIT}`,
      [owner, branchIds, `${escapeLike(parsed.code)}%`, parsed.tokenHash],
    );
    for (const row of rows.rows) {
      results.push({ type: "warranty", id: row.id, title: row.id, subtitle: `${row.plate} - ${row.name}`, badge: row.status, route: routes.warranty(row.id) });
    }
  }
  return results;
}

type Section = RelationSection<Record<string, unknown>>;
type SectionSpec = {
  key: string;
  capability: Capability;
  /** $1 subject id, $2 owner flag, $3 branch ids, $4 environment id. */
  sql: (subject: "customer_id" | "vehicle_id") => string;
  map: (row: Record<string, unknown>) => Record<string, unknown>;
};
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value == null ? null : String(value));

const branchScope = "($2 OR x.branch_id = ANY($3::text[]))";
const sectionSpecs: SectionSpec[] = [
  { key: "bookings", capability: "bookings.manage",
    sql: (s) => `SELECT x.id, x.branch_id, x.vehicle_id, x.service_id, x.status, x.dropoff_date::text AS dropoff_date, x.accepted_quote_id, count(*) OVER() AS total FROM bookings x WHERE x.${s}=$1 AND ${branchScope} ORDER BY x.created_at DESC LIMIT ${PREVIEW_LIMIT}`,
    map: (r) => ({ id: r.id, branchId: r.branch_id, vehicleId: r.vehicle_id, serviceId: r.service_id, status: r.status, dropoffDate: r.dropoff_date, acceptedQuoteId: r.accepted_quote_id }) },
  { key: "jobs", capability: "bookings.manage",
    sql: (s) => `SELECT x.id, x.branch_id, x.booking_id, x.stage, x.assigned_user_id, x.updated_at, count(*) OVER() AS total FROM jobs x JOIN bookings b ON b.id = x.booking_id WHERE b.${s}=$1 AND ${branchScope} ORDER BY x.updated_at DESC LIMIT ${PREVIEW_LIMIT}`,
    map: (r) => ({ id: r.id, branchId: r.branch_id, bookingId: r.booking_id, stage: r.stage, assignedUserId: r.assigned_user_id, updatedAt: iso(r.updated_at) }) },
  { key: "quotes", capability: "quotes.view",
    sql: (s) => `SELECT x.id, x.branch_id, x.vehicle_id, x.current_revision, x.accepted_revision, v.state, v.snapshot->'total' AS total_amount, count(*) OVER() AS total
      FROM quote_heads x LEFT JOIN quote_versions v ON v.quote_id = x.id AND v.revision = x.current_revision
      WHERE x.${s}=$1 AND x.environment_id=$4 AND ${branchScope} AND ${notArchived("quote", "x.id")} ORDER BY x.created_at DESC LIMIT ${PREVIEW_LIMIT}`,
    map: (r) => ({ id: r.id, branchId: r.branch_id, vehicleId: r.vehicle_id, revision: r.current_revision, state: r.accepted_revision != null ? "accepted" : r.state, total: r.total_amount ?? null }) },
  { key: "reservations", capability: "quotes.view",
    sql: (s) => `SELECT x.id, x.branch_id, x.vehicle_id, x.quote_id, x.promotion_id, x.status, x.effective_on::text AS effective_on, x.expires_on::text AS expires_on, count(*) OVER() AS total
      FROM promotion_reservations x WHERE ${s === "customer_id" ? "x.beneficiary_id" : "x.vehicle_id"}=$1 AND x.environment_id=$4 AND ${branchScope} AND ${notArchived("reservation", "x.id")} ORDER BY x.created_at DESC LIMIT ${PREVIEW_LIMIT}`,
    map: (r) => ({ id: r.id, branchId: r.branch_id, vehicleId: r.vehicle_id, quoteId: r.quote_id, promotionId: r.promotion_id, status: r.status, effectiveOn: r.effective_on, expiresOn: r.expires_on }) },
  { key: "benefits", capability: "quotes.view",
    sql: (s) => `SELECT x.id, x.benefit_id, x.vehicle_id, x.status, x.source_quote_id, count(*) OVER() AS total
      FROM benefit_entitlements x WHERE x.${s}=$1 AND x.environment_id=$4 AND ($2 OR x.branch_ids && $3::text[]) ORDER BY x.created_at DESC LIMIT ${PREVIEW_LIMIT}`,
    map: (r) => ({ id: r.id, benefitId: r.benefit_id, vehicleId: r.vehicle_id, status: r.status, quoteId: r.source_quote_id }) },
  { key: "transport", capability: "transport.coordinate",
    sql: (s) => `SELECT x.id, x.branch_id, x.vehicle_id, x.booking_id, x.direction, x.mode, x.status, count(*) OVER() AS total
      FROM transport_requests x WHERE x.${s}=$1 AND x.environment_id=$4 AND ${branchScope} ORDER BY x.updated_at DESC LIMIT ${PREVIEW_LIMIT}`,
    map: (r) => ({ id: r.id, branchId: r.branch_id, vehicleId: r.vehicle_id, bookingId: r.booking_id, direction: r.direction, mode: r.mode, status: r.status }) },
  { key: "warranties", capability: "warranty.view",
    sql: (s) => `SELECT x.id, x.branch_id, x.vehicle_id, x.policy_id, x.start_date::text AS start_date, x.expires_on::text AS expires_on, x.coverage_kind,
        CASE WHEN x.status='void' THEN 'void' WHEN x.coverage_kind='lifetime' AND x.terminated_on <= (now() AT TIME ZONE 'Africa/Cairo')::date THEN 'terminated'
             WHEN x.expires_on < (now() AT TIME ZONE 'Africa/Cairo')::date THEN 'expired' ELSE 'active' END AS status, count(*) OVER() AS total
      FROM warranties x WHERE x.${s}=$1 AND ${branchScope} ORDER BY x.issued_at DESC LIMIT ${PREVIEW_LIMIT}`,
    map: (r) => ({ id: r.id, branchId: r.branch_id, vehicleId: r.vehicle_id, policyId: r.policy_id, status: r.status, startDate: r.start_date, expiresOn: r.expires_on, coverageKind: r.coverage_kind }) },
  { key: "claims", capability: "warranty.view",
    sql: (s) => `SELECT x.id, x.warranty_id, x.status, x.summary, w.branch_id, count(*) OVER() AS total
      FROM warranty_claims x JOIN warranties w ON w.id = x.warranty_id WHERE w.${s}=$1 AND ($2 OR w.branch_id = ANY($3::text[])) ORDER BY x.updated_at DESC LIMIT ${PREVIEW_LIMIT}`,
    map: (r) => ({ id: r.id, warrantyId: r.warranty_id, branchId: r.branch_id, status: r.status, summary: r.summary }) },
  // Warranty invoice drafts (kind "warranty") and generic job invoices (kind "job", migration 0030) in one section.
  { key: "invoices", capability: "warranty.view",
    sql: (s) => `SELECT u.id, u.warranty_id, u.branch_id, u.status, u.kind, u.number, u.total_minor, u.currency, count(*) OVER() AS total FROM (
        SELECT x.id, x.warranty_id, x.branch_id, x.status, 'warranty' AS kind, NULL::text AS number, NULL::text AS total_minor, x.currency, x.updated_at
        FROM warranty_invoice_drafts x JOIN warranties w ON w.id = x.warranty_id WHERE w.${s}=$1 AND ${branchScope}
        UNION ALL
        SELECT x.id, x.warranty_id, x.branch_id, x.status, 'job', x.number, x.total_minor::text, x.currency, x.updated_at
        FROM invoices x WHERE x.${s}=$1 AND x.environment_id=$4 AND ${branchScope} AND ${notArchived("customer", "x.customer_id")}
      ) u ORDER BY u.updated_at DESC LIMIT ${PREVIEW_LIMIT}`,
    map: (r) => ({ id: r.id, warrantyId: r.warranty_id, branchId: r.branch_id, status: r.status, kind: r.kind, number: r.number ?? null,
      total: r.total_minor == null ? null : { minor: Number(r.total_minor), currency: r.currency } }) },
];

/** What the customer bought: read model view over accepted quotes (plus quote-less delivered jobs). Amounts keep their own currency. */
const purchasesSpec: SectionSpec = {
  key: "purchases", capability: "bookings.manage",
  sql: (s) => `SELECT x.id, x.branch_id, x.vehicle_id, x.quote_id, x.booking_id, x.job_id, x.warranty_id, x.invoice_id, x.label_en, x.label_ar, x.quantity,
      x.amount_minor::text AS amount_minor, x.currency, x.purchased_on::text AS purchased_on, x.status, count(*) OVER() AS total
    FROM customer_purchases x WHERE x.${s}=$1 AND (x.environment_id IS NULL OR x.environment_id=$4) AND ${branchScope}
      AND (x.quote_id IS NULL OR ${notArchived("quote", "x.quote_id")}) ORDER BY x.purchased_on DESC, x.id LIMIT ${PREVIEW_LIMIT}`,
  map: (r) => ({
    id: r.id, branchId: r.branch_id, vehicleId: r.vehicle_id, quoteId: r.quote_id, bookingId: r.booking_id, jobId: r.job_id, warrantyId: r.warranty_id, invoiceId: r.invoice_id,
    labelEn: r.label_en, labelAr: r.label_ar, quantity: r.quantity, amount: r.amount_minor == null || !r.currency ? null : { minor: Number(r.amount_minor), currency: r.currency },
    purchasedOn: r.purchased_on, status: r.status,
  }),
};
/** Special requests for the subject. Customer-visible reply only; internal notes never leave the special-requests API. */
const customRequestsSpec: SectionSpec = {
  key: "customRequests", capability: "bookings.manage",
  sql: (s) => `SELECT x.id, x.branch_id, x.vehicle_id, x.title, x.status, x.requested_from::text AS requested_from, x.reply_decision, x.quoted_price_minor::text AS quoted_price_minor,
      x.quoted_currency, x.quote_id, x.created_at, count(*) OVER() AS total
    FROM special_requests x WHERE x.${s}=$1 AND ($2 OR x.branch_id IS NULL OR x.branch_id = ANY($3::text[])) ORDER BY x.created_at DESC LIMIT ${PREVIEW_LIMIT}`,
  map: (r) => ({
    id: r.id, branchId: r.branch_id, vehicleId: r.vehicle_id, title: r.title, status: r.status, requestedFrom: r.requested_from, decision: r.reply_decision,
    quotedPrice: r.quoted_price_minor == null || !r.quoted_currency ? null : { minor: Number(r.quoted_price_minor), currency: r.quoted_currency }, quoteId: r.quote_id, createdAt: iso(r.created_at),
  }),
};

/**
 * PostgreSQL rejects a bind with more parameters than the statement references ("bind message supplies 4 parameters,
 * but prepared statement requires 3"). Section queries share one parameter list, so trim it to the highest $n used.
 */
export function paramsFor<T>(sql: string, all: T[]): T[] {
  let highest = 0;
  for (const match of sql.matchAll(/\$(\d+)/g)) highest = Math.max(highest, Number(match[1]));
  return all.slice(0, highest);
}

async function loadSection(spec: SectionSpec, subject: "customer_id" | "vehicle_id", subjectId: string, actor: GarageActor): Promise<Section> {
  if (!can(actor, spec.capability)) return restrictedSection();
  const { owner, branchIds } = scopeOf(actor);
  const sql = spec.sql(subject);
  const result = await pool.query<Record<string, unknown>>(sql, paramsFor(sql, [subjectId, owner, branchIds, commercialContext.environmentId]));
  return { count: result.rows.length ? Number(result.rows[0].total) : 0, items: result.rows.map(spec.map) };
}

async function loadConversations(actor: GarageActor, subject: "customer_id" | "vehicle_id", subjectId: string): Promise<Section> {
  if (!can(actor, "whatsapp.use")) return restrictedSection();
  const membership = await loadInboxMembership(actor.userId);
  const rows = await pool.query<{ id: string; branch_id: string; status: string; unread_count: number; updated_at: Date }>(
    `SELECT x.id, x.branch_id, x.status, x.unread_count, x.updated_at FROM whatsapp_conversations x WHERE x.${subject}=$1 ORDER BY x.updated_at DESC`,
    [subjectId],
  );
  const visible = rows.rows.filter((row) => canAccessInbox(actor, membership, { branchId: row.branch_id }));
  return {
    count: visible.length,
    items: visible.slice(0, PREVIEW_LIMIT).map((row) => ({ id: row.id, branchId: row.branch_id, status: row.status, unreadCount: row.unread_count, updatedAt: iso(row.updated_at) })),
  };
}

type Sections = Record<string, Section | { count: 0; items: []; unavailable: true }>;
async function loadSections(actor: GarageActor, subject: "customer_id" | "vehicle_id", subjectId: string): Promise<Sections> {
  const loaded = await Promise.all(sectionSpecs.map((spec) => loadSection(spec, subject, subjectId, actor)));
  const sections: Sections = {};
  sectionSpecs.forEach((spec, index) => { sections[spec.key] = loaded[index]; });
  sections.conversations = await loadConversations(actor, subject, subjectId);
  const [purchases, customRequests] = await Promise.all([loadSection(purchasesSpec, subject, subjectId, actor), loadSection(customRequestsSpec, subject, subjectId, actor)]);
  sections.purchases = purchases;
  sections.customRequests = customRequests;
  return sections;
}

async function visibleCustomer(actor: GarageActor, customerId: string) {
  const { owner, branchIds } = scopeOf(actor);
  const row = await pool.query<{ id: string; name: string; phone: string; preferred_language: string; archived: boolean }>(
    `SELECT c.id, c.name, c.phone, c.preferred_language, NOT (${notArchived("customer", "c.id")}) AS archived
     FROM customers c WHERE c.id=$1 AND c.id IN (SELECT cb.customer_id FROM customer_branches cb WHERE $2 OR cb.branch_id = ANY($3::text[]))`,
    [customerId, owner, branchIds],
  );
  const customer = row.rows[0];
  if (!customer || (customer.archived && actor.role !== "owner")) return fail(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
  return customer;
}

function requireCustomersRead(actor: GarageActor) {
  if (!can(actor, "customers.read")) fail(403, "ROLE_FORBIDDEN", "Customer records are not available to your role.");
}

/** Strongest messaging consent state across channels for the customer ('granted' wins, else 'revoked', else 'missing'); null when the actor may not see messaging. */
async function loadConsent(actor: GarageActor, customerId: string): Promise<{ status: string } | null> {
  if (!can(actor, "whatsapp.use")) return null;
  const rows = await pool.query<{ status: string; expired: boolean }>(
    "SELECT status, (expires_at IS NOT NULL AND expires_at < now()) AS expired FROM messaging_customer_consents WHERE customer_id=$1 AND purpose='service'", [customerId]);
  if (!rows.rows.length) return { status: "missing" };
  if (rows.rows.some((r) => r.status === "granted" && !r.expired)) return { status: "granted" };
  if (rows.rows.some((r) => r.status === "granted")) return { status: "expired" };
  return { status: "revoked" };
}

export async function customer360(actor: GarageActor, customerId: string) {
  requireCustomersRead(actor);
  const customer = await visibleCustomer(actor, customerId);
  const vehicles = await pool.query<{ id: string; plate: string; make: string; model: string; year: number | null }>(
    "SELECT id, plate, make, model, year FROM vehicles WHERE customer_id=$1 ORDER BY created_at", [customerId]);
  const sections = await loadSections(actor, "customer_id", customerId);
  const consent = await loadConsent(actor, customerId);
  return {
    customer: { id: customer.id, name: customer.name, phone: phoneFor(actor, customer.phone), language: customer.preferred_language, archived: customer.archived, consent },
    vehicles: { count: vehicles.rows.length, items: vehicles.rows.slice(0, 20).map((v) => ({ id: v.id, plate: v.plate, make: v.make, model: v.model, year: v.year })) },
    ...sections,
  };
}

export async function vehicle360(actor: GarageActor, vehicleId: string) {
  requireCustomersRead(actor);
  const found = await pool.query<{ id: string; customer_id: string; plate: string; make: string; model: string; year: number | null; color: string }>(
    "SELECT id, customer_id, plate, make, model, year, color FROM vehicles WHERE id=$1", [vehicleId]);
  const vehicle = found.rows[0];
  if (!vehicle) return fail(404, "VEHICLE_NOT_FOUND", "Vehicle not found.");
  const customer = await visibleCustomer(actor, vehicle.customer_id).catch(() => fail(404, "VEHICLE_NOT_FOUND", "Vehicle not found."));
  const sections = await loadSections(actor, "vehicle_id", vehicleId);
  return {
    vehicle: { id: vehicle.id, plate: vehicle.plate, make: vehicle.make, model: vehicle.model, year: vehicle.year, color: vehicle.color },
    customer: { id: customer.id, name: customer.name, phone: phoneFor(actor, customer.phone), archived: customer.archived },
    ...sections,
  };
}

/** Staff-only lookup of a warranty by code or QR token; independent of the public verification setting. */
export async function resolveWarranty(actor: GarageActor, rawCode: string) {
  if (!can(actor, "warranty.view")) fail(403, "ROLE_FORBIDDEN", "Warranty records are not available to your role.");
  const { code, tokenHash } = parseWarrantyCode(rawCode);
  if (!code || code.length > 300) fail(400, "INVALID_CODE", "Enter a warranty code or scan its QR code.");
  const { owner, branchIds } = scopeOf(actor);
  const found = await pool.query<{
    id: string; policy_id: string; policy_version: number; job_id: string; customer_id: string; vehicle_id: string; branch_id: string; service_id: string;
    start_date: string; expires_on: string; coverage_kind: string; status: string; void_reason: string | null; by_token: boolean; token_revoked: boolean;
    plate: string; make: string; model: string; year: number | null; name: string; phone: string;
  }>(
    `SELECT w.id, w.policy_id, w.policy_version, w.job_id, w.customer_id, w.vehicle_id, w.branch_id, w.service_id,
            w.start_date::text AS start_date, w.expires_on::text AS expires_on, w.coverage_kind, w.void_reason,
            CASE WHEN w.status='void' THEN 'void' WHEN w.coverage_kind='lifetime' AND w.terminated_on <= (now() AT TIME ZONE 'Africa/Cairo')::date THEN 'terminated'
                 WHEN w.expires_on < (now() AT TIME ZONE 'Africa/Cairo')::date THEN 'expired' ELSE 'active' END AS status,
            (t.id IS NOT NULL) AS by_token, (t.revoked_at IS NOT NULL) AS token_revoked,
            v.plate, v.make, v.model, v.year, c.name, c.phone
     FROM warranties w JOIN vehicles v ON v.id = w.vehicle_id JOIN customers c ON c.id = w.customer_id
     LEFT JOIN warranty_verification_tokens t ON t.warranty_id = w.id AND t.token_hash = $2::text
     WHERE ($3 OR w.branch_id = ANY($4::text[])) AND (w.id = $1 OR t.id IS NOT NULL)
     LIMIT 1`,
    [code, tokenHash, owner, branchIds],
  );
  const row = found.rows[0];
  if (!row || !canAccessBranch(actor, row.branch_id)) return fail(404, "WARRANTY_NOT_FOUND", "No warranty matches this code.");
  const customerVisible = can(actor, "customers.read");
  return {
    matchedBy: row.by_token ? "qr-token" : "warranty-code",
    tokenRevoked: row.token_revoked,
    warranty: {
      id: row.id, policyId: row.policy_id, policyVersion: row.policy_version, jobId: row.job_id, branchId: row.branch_id, serviceId: row.service_id,
      status: row.status, startDate: row.start_date, expiresOn: row.expires_on, coverageKind: row.coverage_kind, voidReason: row.void_reason,
    },
    vehicle: { id: row.vehicle_id, plate: row.plate, make: row.make, model: row.model, year: row.year },
    customer: customerVisible ? { id: row.customer_id, name: row.name, phone: phoneFor(actor, row.phone) } : { restricted: true },
    routes: { warranty: routes.warranty(row.id), vehicle: routes.vehicle(row.vehicle_id), customer: customerVisible ? routes.customer(row.customer_id) : null },
  };
}
