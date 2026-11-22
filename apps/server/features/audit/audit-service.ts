import { z } from "zod";
import { pool } from "../../infrastructure/database/db";
import { allowedBranchIds, hasCapability, type GarageActor } from "../auth/authz";
import { commercialContext } from "../commercial/policy-service";
import { actionLabel, entityTypeLabel, kindLabel, type AuditLang } from "./audit-labels";
import { auditKinds, auditUnionSql } from "./audit-sources";

export class AuditError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export const REPORT_TIMEZONE = "Africa/Cairo";
export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 200;
export const EXPORT_ROW_CAP = 10_000;
const EXPORT_BATCH = 1_000;

/** Owner (or settings.manage, which only an owner holds today). Demo identities may read: nothing here writes. */
export function assertAuditAccess(actor: GarageActor) {
  if (!hasCapability(actor, "settings.manage")) throw new AuditError(403, "ROLE_FORBIDDEN", "The activity log is available to the Owner only.");
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid date");
const text = (max: number) => z.string().trim().min(1).max(max);

const filterSchema = z.object({
  from: day.optional(),
  to: day.optional(),
  actor: text(120).optional(),
  kind: z.string().trim().min(1).max(400).optional(),
  entity: text(200).optional(),
  branchId: text(80).optional(),
  q: text(120).optional(),
  cursor: text(300).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).optional(),
  lang: z.enum(["en", "ar"]).optional(),
}).strict();

export interface AuditFilters {
  from?: string; to?: string; actor?: string; kinds?: string[]; entity?: string; branchId?: string; q?: string; cursor?: string; limit: number; lang: AuditLang;
}

/** Empty query values are treated as absent; unknown kinds are a 400. */
export function parseAuditFilters(query: Record<string, unknown>): AuditFilters {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" && value.trim() !== "") cleaned[key] = value;
  }
  const parsed = filterSchema.safeParse(cleaned);
  if (!parsed.success) throw new AuditError(400, "INVALID_AUDIT_FILTER", "Check the dates and filters.");
  const data = parsed.data;
  const kinds = data.kind ? data.kind.split(",").map((item) => item.trim()).filter(Boolean) : undefined;
  if (kinds?.some((kind) => !(auditKinds as readonly string[]).includes(kind))) throw new AuditError(400, "INVALID_AUDIT_FILTER", "Unknown activity type.");
  if (data.from && data.to && data.from > data.to) throw new AuditError(400, "INVALID_AUDIT_FILTER", "The start date is after the end date.");
  return { from: data.from, to: data.to, actor: data.actor, kinds, entity: data.entity, branchId: data.branchId, q: data.q, cursor: data.cursor, limit: data.limit ?? PAGE_SIZE_DEFAULT, lang: data.lang ?? "en" };
}

export interface AuditCursor { at: string; uid: string }
export const encodeCursor = (cursor: AuditCursor) => Buffer.from(JSON.stringify([cursor.at, cursor.uid]), "utf8").toString("base64url");
export function decodeCursor(value: string): AuditCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (Array.isArray(parsed) && typeof parsed[0] === "string" && typeof parsed[1] === "string" && !Number.isNaN(Date.parse(parsed[0]))) return { at: parsed[0], uid: parsed[1] };
  } catch { /* fall through */ }
  throw new AuditError(400, "INVALID_AUDIT_CURSOR", "The page marker is not valid. Reload the list.");
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/** Branch scope for the actor: null means every branch (owner), an array limits rows to those branches. */
export function branchScope(actor: GarageActor, requested: string | undefined): string[] | null {
  if (actor.role === "owner") return requested ? [requested] : null;
  const allowed = allowedBranchIds(actor, actor.branchIds);
  if (requested && !allowed.includes(requested)) throw new AuditError(403, "BRANCH_FORBIDDEN", "That branch is not available to you.");
  return requested ? [requested] : allowed;
}

/** Pure builder: SQL text and bind values for the unified timeline. Newest first; keyset on (occurred_at, uid). */
export function buildAuditQuery(actor: GarageActor, filters: AuditFilters, limit: number, cursor?: AuditCursor, environmentId = commercialContext.environmentId): { sql: string; params: unknown[] } {
  const params: unknown[] = [environmentId];
  const where: string[] = [];
  const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
  if (filters.from) where.push(`u.occurred_at >= (${bind(filters.from)}::date)::timestamp AT TIME ZONE '${REPORT_TIMEZONE}'`);
  if (filters.to) where.push(`u.occurred_at < ((${bind(filters.to)}::date) + 1)::timestamp AT TIME ZONE '${REPORT_TIMEZONE}'`);
  if (filters.actor) where.push(`u.actor_id = ${bind(filters.actor)}`);
  if (filters.kinds?.length) where.push(`u.kind = ANY(${bind(filters.kinds)}::text[])`);
  if (filters.entity) {
    const [first, ...rest] = filters.entity.split(":");
    if (rest.length) where.push(`(u.entity_type = ${bind(first)} AND u.entity_id = ${bind(rest.join(":"))})`);
    else where.push(`u.entity_id = ${bind(filters.entity)}`);
  }
  const scope = branchScope(actor, filters.branchId);
  if (scope) where.push(`u.branch_id = ANY(${bind(scope)}::text[])`);
  if (filters.q) {
    const pattern = bind(`%${escapeLike(filters.q)}%`);
    where.push(`(u.detail ILIKE ${pattern} OR u.action ILIKE ${pattern} OR u.entity_id ILIKE ${pattern} OR u.before_value ILIKE ${pattern} OR u.after_value ILIKE ${pattern} OR s.full_name ILIKE ${pattern})`);
  }
  if (cursor) where.push(`(u.occurred_at, u.uid) < (${bind(cursor.at)}::timestamptz, ${bind(cursor.uid)}::text)`);
  const sql = `SELECT u.uid, to_char(u.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at_key, u.occurred_at, u.kind, u.action, u.actor_id,
       s.full_name AS actor_name, s.role AS actor_role, u.entity_type, u.entity_id, u.branch_id, br.name_en AS branch_name_en, br.name_ar AS branch_name_ar,
       u.detail, u.before_value, u.after_value, u.extra
  FROM (
${auditUnionSql}
  ) u
  LEFT JOIN staff_memberships s ON s.clerk_user_id = u.actor_id
  LEFT JOIN branches br ON br.id = u.branch_id
  ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
  ORDER BY u.occurred_at DESC, u.uid DESC
  LIMIT ${bind(limit)}`;
  return { sql, params };
}

interface AuditRow {
  uid: string; at_key: string; occurred_at: Date | string; kind: string; action: string; actor_id: string | null; actor_name: string | null; actor_role: string | null;
  entity_type: string; entity_id: string; branch_id: string | null; branch_name_en: string | null; branch_name_ar: string | null;
  detail: string; before_value: string | null; after_value: string | null; extra: Record<string, unknown> | null;
}

export interface AuditEvent {
  id: string;
  occurredAt: string;
  kind: string;
  action: string;
  actor: { id: string | null; name: string | null; role: string | null };
  entity: { type: string; id: string; label: string | null };
  branch: { id: string; nameEn: string; nameAr: string } | null;
  detail: string;
  before: string | null;
  after: string | null;
  extra: Record<string, unknown> | null;
}

const iso = (value: Date | string) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

export function projectAuditRow(row: AuditRow, labels: Map<string, string>): AuditEvent {
  return {
    id: row.uid,
    occurredAt: iso(row.occurred_at),
    kind: row.kind,
    action: row.action,
    actor: { id: row.actor_id, name: row.actor_name, role: row.actor_role },
    entity: { type: row.entity_type, id: row.entity_id, label: labels.get(`${row.entity_type}:${row.entity_id}`) ?? null },
    branch: row.branch_id ? { id: row.branch_id, nameEn: row.branch_name_en ?? row.branch_id, nameAr: row.branch_name_ar ?? row.branch_name_en ?? row.branch_id } : null,
    detail: row.detail ?? "",
    before: row.before_value,
    after: row.after_value,
    extra: row.extra,
  };
}

/** Human labels (plate, customer, invoice number, branch) for the entities on one page. One query per type, only for the ids shown. */
export async function resolveEntityLabels(rows: Array<Pick<AuditRow, "entity_type" | "entity_id">>): Promise<Map<string, string>> {
  const ids = (type: string) => [...new Set(rows.filter((row) => row.entity_type === type).map((row) => row.entity_id))];
  const labels = new Map<string, string>();
  const run = async (type: string, sql: string) => {
    const list = ids(type);
    if (!list.length) return;
    const result = await pool.query<{ id: string; label: string | null }>(sql, [list]);
    for (const row of result.rows) if (row.label) labels.set(`${type}:${row.id}`, row.label);
  };
  await Promise.all([
    run("customer", "SELECT id, name AS label FROM customers WHERE id = ANY($1::text[])"),
    run("job", "SELECT j.id, v.plate AS label FROM jobs j JOIN bookings b ON b.id=j.booking_id JOIN vehicles v ON v.id=b.vehicle_id WHERE j.id = ANY($1::text[])"),
    run("quote", "SELECT h.id, c.name AS label FROM quote_heads h JOIN customers c ON c.id=h.customer_id WHERE h.id = ANY($1::text[])"),
    run("warranty", "SELECT w.id, v.plate AS label FROM warranties w JOIN vehicles v ON v.id=w.vehicle_id WHERE w.id = ANY($1::text[])"),
    run("claim", "SELECT c.id, v.plate AS label FROM warranty_claims c JOIN warranties w ON w.id=c.warranty_id JOIN vehicles v ON v.id=w.vehicle_id WHERE c.id = ANY($1::text[])"),
    run("invoice", "SELECT i.id, COALESCE(i.number, c.name) AS label FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.id = ANY($1::text[])"),
    run("conversation", "SELECT id, customer_label AS label FROM whatsapp_conversations WHERE id = ANY($1::text[])"),
    run("special-request", "SELECT id, title AS label FROM special_requests WHERE id = ANY($1::text[])"),
    run("reservation", "SELECT r.id, c.name AS label FROM promotion_reservations r JOIN customers c ON c.id=r.beneficiary_id WHERE r.id = ANY($1::text[])"),
    run("branch", "SELECT id, name_en AS label FROM branches WHERE id = ANY($1::text[])"),
    run("staff", "SELECT clerk_user_id AS id, full_name AS label FROM staff_memberships WHERE clerk_user_id = ANY($1::text[])"),
  ]);
  return labels;
}

export async function listAudit(actor: GarageActor, filters: AuditFilters): Promise<{ events: AuditEvent[]; nextCursor: string | null }> {
  assertAuditAccess(actor);
  const cursor = filters.cursor ? decodeCursor(filters.cursor) : undefined;
  const { sql, params } = buildAuditQuery(actor, filters, filters.limit + 1, cursor);
  const result = await pool.query<AuditRow>(sql, params);
  const hasMore = result.rows.length > filters.limit;
  const page = hasMore ? result.rows.slice(0, filters.limit) : result.rows;
  const labels = await resolveEntityLabels(page);
  const last = page[page.length - 1];
  return { events: page.map((row) => projectAuditRow(row, labels)), nextCursor: hasMore && last ? encodeCursor({ at: last.at_key, uid: last.uid }) : null };
}

/** Filter options for the screen: people who appear in the log (id, name) so the person filter never shows raw ids. */
export async function listAuditActors(actor: GarageActor): Promise<Array<{ id: string; name: string; role: string }>> {
  assertAuditAccess(actor);
  const result = await pool.query<{ id: string; name: string; role: string }>(
    "SELECT clerk_user_id AS id, full_name AS name, role FROM staff_memberships WHERE status <> 'invited' AND full_name <> '' ORDER BY full_name");
  return result.rows;
}

/* ------------------------------------------------------------------ CSV */

/**
 * One CSV cell. A leading =, +, - or @ (or a tab / carriage return) would be evaluated as a formula by Excel and
 * Sheets, so it is neutralised with a leading apostrophe; then the cell is quoted when it holds a comma, quote or line break.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let cell = typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}
export const csvRow = (cells: unknown[]) => `${cells.map(csvCell).join(",")}\r\n`;
/** U+FEFF built from its code point so no invisible character sits in the source. Excel needs it to read Arabic as UTF-8. */
export const CSV_BOM = String.fromCodePoint(0xfeff);

const csvHeaders: Record<AuditLang, string[]> = {
  en: ["Date and time (Cairo)", "Who", "Role", "Type", "What", "Record type", "Record", "Branch", "Before", "After", "Details"],
  ar: ["التاريخ والوقت (القاهرة)", "المنفذ", "الدور", "النوع", "الإجراء", "نوع السجل", "السجل", "الفرع", "قبل", "بعد", "التفاصيل"],
};
export const exportNote = (cap: number, lang: AuditLang) => lang === "ar"
  ? `تم تقصير التصدير عند أول ${cap} سجل. ضيّق التاريخ أو النوع لتصدير الباقي.`
  : `Export limited to the newest ${cap} rows. Narrow the dates or type to export the rest.`;

const cairoStamp = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value)).replace(",", "");

export function csvLine(event: AuditEvent, lang: AuditLang): string {
  return csvRow([
    cairoStamp(event.occurredAt), event.actor.name ?? "", event.actor.role ?? "", kindLabel(event.kind, lang), actionLabel(event.action, lang),
    entityTypeLabel(event.entity.type, lang), event.entity.label ?? "", event.branch ? (lang === "ar" ? event.branch.nameAr : event.branch.nameEn) : "",
    event.before ?? "", event.after ?? "", event.detail,
  ]);
}

/** Streams the filtered timeline in keyset batches, newest first, up to the row cap. `write` receives text chunks. */
export async function streamAuditCsv(actor: GarageActor, filters: AuditFilters, write: (chunk: string) => boolean | void | Promise<boolean | void>, cap = EXPORT_ROW_CAP): Promise<{ rows: number; truncated: boolean }> {
  assertAuditAccess(actor);
  await write(CSV_BOM + csvRow(csvHeaders[filters.lang]));
  let cursor = filters.cursor ? decodeCursor(filters.cursor) : undefined;
  let written = 0;
  let truncated = false;
  for (;;) {
    const want = Math.min(EXPORT_BATCH, cap - written + 1);
    const { sql, params } = buildAuditQuery(actor, filters, want, cursor);
    const result = await pool.query<AuditRow>(sql, params);
    const room = cap - written;
    const usable = result.rows.length > room ? result.rows.slice(0, room) : result.rows;
    if (result.rows.length > room) truncated = true;
    if (usable.length) {
      const labels = await resolveEntityLabels(usable);
      await write(usable.map((row) => csvLine(projectAuditRow(row, labels), filters.lang)).join(""));
      written += usable.length;
    }
    if (truncated || result.rows.length < want) break;
    const last = usable[usable.length - 1];
    if (!last) break;
    cursor = { at: last.at_key, uid: last.uid };
  }
  if (truncated) await write(csvRow([exportNote(cap, filters.lang)]));
  return { rows: written, truncated };
}

/* -------------------------------------------------------- daily summary */

export type SummaryBasis = "exact" | "approximate" | "snapshot";
export interface SummaryCount { value: number; previous: number | null; delta: number | null; basis: SummaryBasis }
export interface SummaryMoney { currency: string; count: number; amountMinor: number; previousAmountMinor: number; deltaMinor: number }

export const countKeys = [
  "bookingsCreated", "bookingsConfirmed", "bookingsCancelled", "bookingsNoShow", "jobsStarted", "jobsDelivered", "newCustomers",
  "warrantiesIssued", "claimsOpened", "quotesOffered", "quotesAccepted", "openSpecialRequests", "pendingReviews", "whatsappAwaitingReply",
] as const;
export type CountKey = (typeof countKeys)[number];
export const moneyKeys = ["quotesOfferedValue", "quotesAcceptedValue", "collections", "refunds", "invoicePayments"] as const;
export type MoneyKey = (typeof moneyKeys)[number];

/** Bases are honest about the source: only stage changes are timestamped exactly; bookings keep a last-update time; snapshots describe now. */
export const countBasis: Record<CountKey, SummaryBasis> = {
  bookingsCreated: "exact", bookingsConfirmed: "exact", bookingsCancelled: "approximate", bookingsNoShow: "exact", jobsStarted: "exact", jobsDelivered: "exact",
  newCustomers: "exact", warrantiesIssued: "exact", claimsOpened: "exact", quotesOffered: "exact", quotesAccepted: "exact",
  openSpecialRequests: "snapshot", pendingReviews: "snapshot", whatsappAwaitingReply: "snapshot",
};

const daySql = `WITH w AS (SELECT ($1::date)::timestamp AT TIME ZONE '${REPORT_TIMEZONE}' AS s, (($1::date) + 1)::timestamp AT TIME ZONE '${REPORT_TIMEZONE}' AS e)`;
const inDay = (column: string) => `${column} >= w.s AND ${column} < w.e`;
const branchIn = (column: string) => `($2::text[] IS NULL OR ${column} = ANY($2::text[]))`;

/** One row of scalar counts for one day. $1 date, $2 branch ids or NULL. Snapshot counts ignore the day. */
export const dailyCountsSql = `${daySql}
SELECT
 (SELECT count(*) FROM bookings x, w WHERE ${inDay("x.created_at")} AND ${branchIn("x.branch_id")}) AS "bookingsCreated",
 (SELECT count(*) FROM job_events e JOIN jobs j ON j.id=e.job_id, w WHERE e.from_stage IS NULL AND e.to_stage='booked' AND ${inDay("e.created_at")} AND ${branchIn("j.branch_id")}) AS "bookingsConfirmed",
 (SELECT count(*) FROM bookings x, w WHERE x.status='cancelled' AND ${inDay("x.updated_at")} AND ${branchIn("x.branch_id")}) AS "bookingsCancelled",
 (SELECT count(*) FROM job_events e JOIN jobs j ON j.id=e.job_id, w WHERE e.to_stage='no-show' AND ${inDay("e.created_at")} AND ${branchIn("j.branch_id")}) AS "bookingsNoShow",
 (SELECT count(*) FROM job_events e JOIN jobs j ON j.id=e.job_id, w WHERE e.to_stage='in-service' AND ${inDay("e.created_at")} AND ${branchIn("j.branch_id")}) AS "jobsStarted",
 (SELECT count(*) FROM job_events e JOIN jobs j ON j.id=e.job_id, w WHERE e.to_stage='delivered' AND ${inDay("e.created_at")} AND ${branchIn("j.branch_id")}) AS "jobsDelivered",
 (SELECT count(*) FROM customers c, w WHERE ${inDay("c.created_at")} AND ($2::text[] IS NULL OR EXISTS (SELECT 1 FROM customer_branches cb WHERE cb.customer_id=c.id AND cb.branch_id = ANY($2::text[])))) AS "newCustomers",
 (SELECT count(*) FROM warranties x, w WHERE ${inDay("x.issued_at")} AND ${branchIn("x.branch_id")}) AS "warrantiesIssued",
 (SELECT count(*) FROM warranty_claims c JOIN warranties x ON x.id=c.warranty_id, w WHERE ${inDay("c.created_at")} AND ${branchIn("x.branch_id")}) AS "claimsOpened",
 (SELECT count(*) FROM quote_audit a JOIN quote_heads h ON h.id=a.quote_id, w WHERE a.action='offered' AND ${inDay("a.occurred_at")} AND ${branchIn("h.branch_id")}) AS "quotesOffered",
 (SELECT count(*) FROM quote_acceptance_events a JOIN quote_heads h ON h.id=a.quote_id, w WHERE ${inDay("a.occurred_at")} AND ${branchIn("h.branch_id")}) AS "quotesAccepted",
 (SELECT count(*) FROM special_requests r WHERE r.status IN ('new','under-review','needs-info') AND (r.branch_id IS NULL OR ${branchIn("r.branch_id")})) AS "openSpecialRequests",
 (SELECT count(*) FROM bookings x WHERE x.status='pending' AND ${branchIn("x.branch_id")}) AS "pendingReviews",
 (SELECT count(*) FROM whatsapp_conversations c WHERE c.status <> 'resolved' AND (c.human_response_required_at IS NOT NULL OR c.unread_count > 0) AND ${branchIn("c.branch_id")}) AS "whatsappAwaitingReply"`;

/** Rows of (metric, currency, n, amount) for one day. $1 date, $2 branch ids or NULL, $3 environment id. Reversed money events are excluded. */
export const dailyMoneySql = `${daySql}
SELECT 'quotesOfferedValue' AS metric, COALESCE(v.snapshot->'total'->>'currency','?') AS currency, count(*)::int AS n, COALESCE(sum((v.snapshot->'total'->>'minor')::bigint),0)::text AS amount
  FROM quote_audit a JOIN quote_heads h ON h.id=a.quote_id JOIN quote_versions v ON v.quote_id=a.quote_id AND v.revision=a.revision, w
  WHERE a.action='offered' AND h.environment_id=$3 AND ${inDay("a.occurred_at")} AND ${branchIn("h.branch_id")} GROUP BY 2
UNION ALL
SELECT 'quotesAcceptedValue', COALESCE(a.accepted_snapshot->'total'->>'currency','?'), count(*)::int, COALESCE(sum((a.accepted_snapshot->'total'->>'minor')::bigint),0)::text
  FROM quote_acceptance_events a JOIN quote_heads h ON h.id=a.quote_id, w
  WHERE a.environment_id=$3 AND ${inDay("a.occurred_at")} AND ${branchIn("h.branch_id")} GROUP BY 2
UNION ALL
SELECT CASE e.kind WHEN 'collection' THEN 'collections' ELSE 'refunds' END, e.currency, count(*)::int, sum(e.amount_minor)::text
  FROM operational_money_events e, w
  WHERE e.environment_id=$3 AND e.kind IN ('collection','refund') AND ${inDay("e.effective_at")} AND ${branchIn("e.branch_id")}
    AND NOT EXISTS (SELECT 1 FROM operational_money_event_reversals r WHERE r.event_id=e.id) GROUP BY 1, 2
UNION ALL
SELECT 'invoicePayments', p.currency, count(*)::int, sum(p.amount_minor)::text
  FROM invoice_payment_references p JOIN invoices i ON i.id=p.invoice_id, w
  WHERE i.environment_id=$3 AND p.received_on = $1::date AND ${branchIn("i.branch_id")} GROUP BY 2`;

export const previousDay = (value: string) => new Date(Date.parse(`${value}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
export const cairoToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

const toNumber = (value: unknown) => { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; };

export function summariseCounts(today: Record<string, unknown>, previous: Record<string, unknown>): Record<CountKey, SummaryCount> {
  const out = {} as Record<CountKey, SummaryCount>;
  for (const key of countKeys) {
    const basis = countBasis[key];
    const value = toNumber(today[key]);
    if (basis === "snapshot") { out[key] = { value, previous: null, delta: null, basis }; continue; }
    const before = toNumber(previous[key]);
    out[key] = { value, previous: before, delta: value - before, basis };
  }
  return out;
}

export interface MoneyRow { metric: string; currency: string; n: number | string; amount: string | number }
/** Per metric and currency: today, previous day and the difference. A currency present on only one day still appears. Never summed across currencies. */
export function summariseMoney(today: MoneyRow[], previous: MoneyRow[]): Record<MoneyKey, SummaryMoney[]> {
  const out = Object.fromEntries(moneyKeys.map((key) => [key, [] as SummaryMoney[]])) as Record<MoneyKey, SummaryMoney[]>;
  for (const key of moneyKeys) {
    const now = new Map(today.filter((row) => row.metric === key).map((row) => [row.currency, row]));
    const before = new Map(previous.filter((row) => row.metric === key).map((row) => [row.currency, row]));
    for (const currency of [...new Set([...now.keys(), ...before.keys()])].sort()) {
      const a = now.get(currency);
      const b = before.get(currency);
      const amountMinor = toNumber(a?.amount);
      const previousAmountMinor = toNumber(b?.amount);
      out[key].push({ currency, count: toNumber(a?.n), amountMinor, previousAmountMinor, deltaMinor: amountMinor - previousAmountMinor });
    }
  }
  return out;
}

export interface DailySummary {
  date: string; previousDate: string; branchId: string | null; timezone: string;
  counts: Record<CountKey, SummaryCount>;
  money: Record<MoneyKey, SummaryMoney[]>;
}

export async function dailySummary(actor: GarageActor, input: { date?: string; branchId?: string }, now = new Date()): Promise<DailySummary> {
  assertAuditAccess(actor);
  const date = input.date ?? cairoToday(now);
  if (!day.safeParse(date).success) throw new AuditError(400, "INVALID_DATE", "Choose a valid date.");
  const scope = branchScope(actor, input.branchId || undefined);
  const prior = previousDay(date);
  const env = commercialContext.environmentId;
  const [a, b, ma, mb] = await Promise.all([
    pool.query(dailyCountsSql, [date, scope]),
    pool.query(dailyCountsSql, [prior, scope]),
    pool.query<MoneyRow>(dailyMoneySql, [date, scope, env]),
    pool.query<MoneyRow>(dailyMoneySql, [prior, scope, env]),
  ]);
  return {
    date, previousDate: prior, branchId: input.branchId || null, timezone: REPORT_TIMEZONE,
    counts: summariseCounts(a.rows[0] ?? {}, b.rows[0] ?? {}),
    money: summariseMoney(ma.rows, mb.rows),
  };
}
