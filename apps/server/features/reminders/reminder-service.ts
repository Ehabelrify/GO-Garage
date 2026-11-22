import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { canAccessBranch, hasCapability, type GarageActor } from "../auth/authz";
import { recordStaffCustomerAudit } from "../audit/audit-writer";
import { commercialContext } from "../commercial/policy-service";
import {
  addDays, bookingCandidate, cairoDate, checkinCandidate, defaultRule, displayStatus, initialState, isReminderKind, leadLimits, mergeRules, quoteCandidate,
  readyCandidate, renderCandidate, renderTemplate, templateProblem, unknownPlaceholders, warrantyCandidate, reminderKinds, placeholdersByKind,
  type BookingRow, type Candidate, type JobRow, type QuoteRow, type ReminderKind, type RuleConfig, type StoredRule, type StoredStatus, type WarrantyRow,
} from "./reminder-logic";

export class ReminderError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const fail = (status: number, code: string, message: string): never => { throw new ReminderError(status, code, message); };

type Runner = Pick<PoolClient, "query">;
const env = () => commercialContext.environmentId;

/** Viewing and acting on the queue: bookings.manage. Rules: owner only. Running the job: owner or branch manager. */
function requireViewer(actor: GarageActor) {
  if (!hasCapability(actor, "bookings.manage")) fail(403, "ROLE_FORBIDDEN", "Follow-ups are not available to your role.");
}
function requireWriter(actor: GarageActor) {
  requireViewer(actor);
  if (actor.isDemo) fail(403, "DEMO_ACTION_DISABLED", "Follow-ups cannot be changed in a role preview session.");
}
function requireOwner(actor: GarageActor) {
  requireViewer(actor);
  if (actor.role !== "owner") fail(403, "OWNER_REQUIRED", "Only the owner can change reminder rules.");
  if (actor.isDemo) fail(403, "DEMO_ACTION_DISABLED", "Reminder rules cannot be changed in a role preview session.");
}
function requireRunner(actor: GarageActor) {
  requireWriter(actor);
  if (actor.role !== "owner" && actor.role !== "branch-manager") fail(403, "ROLE_FORBIDDEN", "Only the owner or a branch manager can run reminders.");
}

// ---------- Rules ----------

export async function loadRules(client: Runner = pool): Promise<RuleConfig[]> {
  const rows = await client.query<StoredRule>(
    "SELECT kind, enabled, lead_days, auto_send, template_en, template_ar, revision FROM reminder_rules WHERE environment_id = $1", [env()]);
  return mergeRules(rows.rows);
}

export interface RuleView extends RuleConfig { placeholders: readonly string[]; leadMin: number; leadMax: number }
const ruleView = (rule: RuleConfig): RuleView => ({ ...rule, placeholders: placeholdersByKind[rule.kind], leadMin: leadLimits[rule.kind].min, leadMax: leadLimits[rule.kind].max });

export async function listRules(actor: GarageActor) {
  requireViewer(actor);
  return { rules: (await loadRules()).map(ruleView), canManageRules: !actor.isDemo && actor.role === "owner" };
}

export interface RulePatch { enabled?: boolean; leadDays?: number; autoSend?: boolean; templateEn?: string; templateAr?: string; expectedRevision: number }

export async function updateRule(actor: GarageActor, kindValue: string, patch: RulePatch) {
  requireOwner(actor);
  if (!isReminderKind(kindValue)) return fail(404, "RULE_NOT_FOUND", "Unknown reminder rule.");
  const kind: ReminderKind = kindValue;
  const limits = leadLimits[kind];
  if (patch.leadDays !== undefined && (!Number.isInteger(patch.leadDays) || patch.leadDays < limits.min || patch.leadDays > limits.max)) {
    return fail(400, "INVALID_LEAD_TIME", "Choose a lead time within the allowed range.");
  }
  for (const [value] of [[patch.templateEn], [patch.templateAr]] as const) {
    if (value === undefined) continue;
    const problem = templateProblem(kind, value);
    if (problem) return fail(400, problem, "Check the message text and its placeholders.");
  }
  return withTransaction(async (client) => {
    const rules = await loadRules(client);
    const current = rules.find((rule) => rule.kind === kind) ?? defaultRule(kind);
    if (current.revision !== patch.expectedRevision) return fail(409, "REVISION_CONFLICT", "This rule changed. Reload and try again.");
    const next: RuleConfig = {
      ...current,
      enabled: patch.enabled ?? current.enabled,
      leadDays: patch.leadDays ?? current.leadDays,
      autoSend: patch.autoSend ?? current.autoSend,
      templateEn: patch.templateEn?.trim() ?? current.templateEn,
      templateAr: patch.templateAr?.trim() ?? current.templateAr,
      revision: current.revision + 1,
    };
    // P2T-024: the write itself is conditional on the revision that was read, so a concurrent edit cannot be overwritten.
    const values = [env(), kind, next.enabled, next.leadDays, next.autoSend, next.templateEn, next.templateAr, next.revision, actor.userId];
    const written = current.revision === 0
      ? await client.query(
        `INSERT INTO reminder_rules (environment_id, kind, enabled, lead_days, auto_send, template_en, template_ar, revision, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now()) ON CONFLICT (environment_id, kind) DO NOTHING`, values)
      : await client.query(
        `UPDATE reminder_rules SET enabled = $3, lead_days = $4, auto_send = $5, template_en = $6, template_ar = $7, revision = $8, updated_by = $9, updated_at = now()
         WHERE environment_id = $1 AND kind = $2 AND revision = $10`, [...values, current.revision]);
    if ((written.rowCount ?? 0) !== 1) return fail(409, "REVISION_CONFLICT", "This rule changed. Reload and try again.");
    const fields = (["enabled", "leadDays", "autoSend", "templateEn", "templateAr"] as const).filter((field) => next[field] !== current[field]);
    await recordStaffCustomerAudit(client, { entityKind: "reminder-rule", entityId: kind, action: "rule-updated", summary: `Fields changed: ${fields.join(", ") || "none"}; revision ${next.revision}`, actorUserId: actor.userId });
    return { rule: ruleView(next) };
  });
}

/** Renders a template with sample values so the owner can see the wording before saving. */
export function previewTemplate(kindValue: string, template: string, lang: "ar" | "en") {
  if (!isReminderKind(kindValue)) return fail(404, "RULE_NOT_FOUND", "Unknown reminder rule.");
  const problem = templateProblem(kindValue, template);
  const sample = lang === "ar"
    ? { name: "أحمد", plate: "أ ب ج 1234", branch: "فرع المعادي", service: "تنظيف داخلي", date: "2026-12-01", time: "10:00", expiry: "2027-01-15" }
    : { name: "Ahmed", plate: "ABC 1234", branch: "Maadi branch", service: "Interior detailing", date: "2026-12-01", time: "10:00", expiry: "2027-01-15" };
  return { text: renderTemplate(template, sample), problem, unknown: unknownPlaceholders(kindValue, template) };
}

// ---------- Generation ----------

const CONSENT = `EXISTS (SELECT 1 FROM messaging_customer_consents mc WHERE mc.customer_id = c.id AND mc.purpose = 'service' AND mc.status = 'granted'
  AND mc.evidence_ref IS NOT NULL AND mc.consented_at <= $1 AND (mc.expires_at IS NULL OR mc.expires_at > $1)) AS has_consent`;
/** Consent for the reminder's own customer at dispatch time ($3 is now). */
const CONSENT_AT_DISPATCH = `EXISTS (SELECT 1 FROM messaging_customer_consents mc WHERE mc.customer_id = r.customer_id AND mc.purpose = 'service' AND mc.status = 'granted'
  AND mc.evidence_ref IS NOT NULL AND mc.consented_at <= $3 AND (mc.expires_at IS NULL OR mc.expires_at > $3))`;
const NOT_ARCHIVED = "NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind = 'customer' AND ra.entity_id = c.id)";
/** $1 is always `now`. Shared columns for every source query (aliases b, c, v, s). */
const COMMON = `b.id AS branch_id, b.name_en AS branch_en, b.name_ar AS branch_ar, c.id AS customer_id, c.name AS customer_name, c.preferred_language AS language,
  v.id AS vehicle_id, v.plate AS plate, s.name_en AS service_en, s.name_ar AS service_ar, ${CONSENT}`;

async function bookingRows(client: Runner, now: Date, today: string, until: string) {
  return (await client.query<BookingRow>(
    `SELECT bk.id AS booking_id, bk.dropoff_date::text AS dropoff_date, bk.dropoff_time::text AS dropoff_time, ${COMMON}
     FROM bookings bk JOIN branches b ON b.id = bk.branch_id JOIN customers c ON c.id = bk.customer_id JOIN vehicles v ON v.id = bk.vehicle_id
     LEFT JOIN services s ON s.id = bk.service_id
     WHERE bk.status = 'confirmed' AND bk.dropoff_date BETWEEN $2::date AND $3::date AND ${NOT_ARCHIVED}`, [now, today, until])).rows;
}

async function jobRows(client: Runner, now: Date, stage: "ready" | "delivered", since: Date) {
  return (await client.query<JobRow>(
    `SELECT j.id AS job_id, bk.id AS booking_id,
       COALESCE((SELECT max(e.created_at) FROM job_events e WHERE e.job_id = j.id AND e.to_stage = j.stage), j.updated_at) AS at, ${COMMON}
     FROM jobs j JOIN bookings bk ON bk.id = j.booking_id JOIN branches b ON b.id = bk.branch_id JOIN customers c ON c.id = bk.customer_id
     JOIN vehicles v ON v.id = bk.vehicle_id LEFT JOIN services s ON s.id = bk.service_id
     WHERE j.stage = $2 AND j.updated_at >= $3 AND ${NOT_ARCHIVED}`, [now, stage, since])).rows;
}

async function warrantyRows(client: Runner, now: Date, today: string, until: string) {
  return (await client.query<WarrantyRow>(
    `SELECT w.id AS warranty_id, w.expires_on::text AS expires_on, ${COMMON}
     FROM warranties w JOIN branches b ON b.id = w.branch_id JOIN customers c ON c.id = w.customer_id JOIN vehicles v ON v.id = w.vehicle_id
     LEFT JOIN services s ON s.id = w.service_id
     WHERE w.status = 'active' AND w.coverage_kind = 'fixed' AND w.expires_on IS NOT NULL AND w.expires_on BETWEEN $2::date AND $3::date AND ${NOT_ARCHIVED}`,
    [now, today, until])).rows;
}

async function quoteRows(client: Runner, now: Date, since: Date) {
  return (await client.query<QuoteRow>(
    `SELECT h.id AS quote_id, qv.revision, qv.created_at AS offered_at, qv.valid_through::text AS valid_through, ${COMMON.replace("s.name_en AS service_en, s.name_ar AS service_ar,", "NULL::text AS service_en, NULL::text AS service_ar,")}
     FROM quote_heads h JOIN quote_versions qv ON qv.quote_id = h.id AND qv.revision = h.current_revision
     JOIN branches b ON b.id = h.branch_id JOIN customers c ON c.id = h.customer_id JOIN vehicles v ON v.id = h.vehicle_id
     LEFT JOIN quote_followups f ON f.quote_id = h.id
     WHERE h.environment_id = $3 AND qv.state = 'offered' AND h.accepted_revision IS NULL AND qv.created_at >= $2
       AND COALESCE(f.status, 'requested') NOT IN ('answered', 'cancelled')
       AND NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind = 'quote' AND ra.entity_id = h.id) AND ${NOT_ARCHIVED}`,
    [now, since, env()])).rows;
}

export interface RunSummary {
  now: string;
  generated: number;
  skippedNoConsent: number;
  autoSent: number;
  cancelled: number;
  byKind: Record<string, number>;
}

/** Inserts one candidate. The unique (environment_id, dedupe_key) makes reruns no-ops; returns the new id or null. */
export async function insertCandidate(client: Runner, candidate: Candidate, rule: RuleConfig, actorId: string): Promise<{ id: string; status: StoredStatus } | null> {
  const state = initialState(candidate.hasConsent);
  const id = `rem-${randomUUID()}`;
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO reminders (id, environment_id, rule_kind, dedupe_key, branch_id, customer_id, vehicle_id, booking_id, job_id, warranty_id, quote_id,
       source_date, source_revision, language, body, due_at, status, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (environment_id, dedupe_key) DO NOTHING RETURNING id`,
    [id, env(), candidate.kind, candidate.dedupeKey, candidate.branchId, candidate.customerId, candidate.vehicleId, candidate.bookingId, candidate.jobId,
      candidate.warrantyId, candidate.quoteId, candidate.sourceDate, candidate.sourceRevision, candidate.language, renderCandidate(candidate, rule), candidate.dueAt,
      state.status, state.reason]);
  if (!inserted.rows[0]) return null;
  await client.query("INSERT INTO reminder_events (reminder_id, action, actor_id, details) VALUES ($1, 'generated', $2, $3)", [id, actorId, state.reason ?? ""]);
  return { id, status: state.status };
}

/** Pure collection step so it can be tested without a database. */
export function collectCandidates(rules: RuleConfig[], source: { bookings: BookingRow[]; ready: JobRow[]; delivered: JobRow[]; warranties: WarrantyRow[]; quotes: QuoteRow[] }, now: Date): Array<{ candidate: Candidate; rule: RuleConfig }> {
  const out: Array<{ candidate: Candidate; rule: RuleConfig }> = [];
  const rule = (kind: ReminderKind) => rules.find((r) => r.kind === kind && r.enabled);
  const push = (candidate: Candidate | null, r: RuleConfig) => { if (candidate) out.push({ candidate, rule: r }); };
  for (const kind of ["booking_day_before", "booking_morning_of"] as const) {
    const r = rule(kind);
    if (r) for (const row of source.bookings) push(bookingCandidate(kind, row, r, now), r);
  }
  const ready = rule("ready_for_pickup");
  if (ready) for (const row of source.ready) push(readyCandidate(row, ready, now), ready);
  const checkin = rule("post_service_checkin");
  if (checkin) for (const row of source.delivered) push(checkinCandidate(row, checkin, now), checkin);
  const warranty = rule("warranty_expiry");
  if (warranty) for (const row of source.warranties) push(warrantyCandidate(row, warranty, now), warranty);
  const quote = rule("quote_followup");
  if (quote) for (const row of source.quotes) push(quoteCandidate(row, quote, now), quote);
  return out;
}

/** Cancels open reminders whose source changed (booking cancelled or moved, job no longer ready, quote answered or superseded, warranty void). */
async function cancelStale(client: Runner): Promise<number> {
  const cancelled = await client.query<{ id: string }>(
    `UPDATE reminders r SET status = 'cancelled', reason = 'source-changed', updated_at = now()
     WHERE r.environment_id = $1 AND r.status = 'due' AND (
       (r.rule_kind IN ('booking_day_before', 'booking_morning_of') AND NOT EXISTS (
          SELECT 1 FROM bookings bk WHERE bk.id = r.booking_id AND bk.status = 'confirmed' AND bk.dropoff_date = r.source_date))
       OR (r.rule_kind = 'ready_for_pickup' AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = r.job_id AND j.stage = 'ready'))
       OR (r.rule_kind = 'warranty_expiry' AND NOT EXISTS (SELECT 1 FROM warranties w WHERE w.id = r.warranty_id AND w.status = 'active' AND w.expires_on = r.source_date))
       OR (r.rule_kind = 'quote_followup' AND NOT EXISTS (
          SELECT 1 FROM quote_heads h LEFT JOIN quote_followups f ON f.quote_id = h.id
          WHERE h.id = r.quote_id AND h.current_revision = r.source_revision AND h.accepted_revision IS NULL
            AND COALESCE(f.status, 'requested') NOT IN ('answered', 'cancelled')
            AND EXISTS (SELECT 1 FROM quote_versions qv WHERE qv.quote_id = h.id AND qv.revision = h.current_revision AND qv.state = 'offered')))
     ) RETURNING r.id`, [env()]);
  for (const row of cancelled.rows) {
    await client.query("INSERT INTO reminder_events (reminder_id, action, actor_id, details) VALUES ($1, 'cancelled', 'system', 'source-changed')", [row.id]);
  }
  return cancelled.rows.length;
}

/**
 * Idempotent generator. Safe to call on a timer: every candidate has a dedupe key (source + rule + date or revision), so repeated runs
 * never duplicate a reminder. Simulated only: marks reminders sent-simulated for rules with auto_send; it never calls a provider.
 * Closed reminders (sent, skipped, cancelled) are never reopened.
 */
export async function runDueReminders(now: Date = new Date(), actorId = "system", client?: Runner): Promise<RunSummary> {
  const work = async (db: Runner): Promise<RunSummary> => {
    const rules = await loadRules(db);
    const today = cairoDate(now);
    const byKind: Record<string, number> = Object.fromEntries(reminderKinds.map((kind) => [kind, 0]));
    let generated = 0;
    let skippedNoConsent = 0;
    const source = { bookings: [] as BookingRow[], ready: [] as JobRow[], delivered: [] as JobRow[], warranties: [] as WarrantyRow[], quotes: [] as QuoteRow[] };
    const enabled = (kind: ReminderKind) => rules.find((rule) => rule.kind === kind)?.enabled === true;
    const lead = (kind: ReminderKind) => rules.find((rule) => rule.kind === kind)?.leadDays ?? 0;
    if (enabled("booking_day_before") || enabled("booking_morning_of")) {
      source.bookings = await bookingRows(db, now, today, addDays(today, Math.max(lead("booking_day_before"), lead("booking_morning_of")) + 2));
    }
    if (enabled("ready_for_pickup")) source.ready = await jobRows(db, now, "ready", new Date(now.getTime() - 14 * 86_400_000));
    if (enabled("post_service_checkin")) source.delivered = await jobRows(db, now, "delivered", new Date(now.getTime() - (lead("post_service_checkin") + 16) * 86_400_000));
    if (enabled("warranty_expiry")) source.warranties = await warrantyRows(db, now, today, addDays(today, lead("warranty_expiry") + 2));
    if (enabled("quote_followup")) source.quotes = await quoteRows(db, now, new Date(now.getTime() - (lead("quote_followup") + 30) * 86_400_000));
    for (const { candidate, rule } of collectCandidates(rules, source, now)) {
      const created = await insertCandidate(db, candidate, rule, actorId);
      if (!created) continue;
      generated += 1;
      byKind[candidate.kind] += 1;
      if (created.status === "skipped") skippedNoConsent += 1;
    }
    const cancelled = await cancelStale(db);
    let autoSent = 0;
    for (const rule of rules.filter((item) => item.enabled && item.autoSend)) {
      // P2T-023: consent is re-checked at dispatch. A reminder whose consent was withdrawn or expired is skipped, never marked sent.
      const noConsent = await db.query<{ id: string }>(
        `UPDATE reminders r SET status = 'skipped', reason = 'no-consent', handled_by = 'system', updated_at = now()
         WHERE r.environment_id = $1 AND r.rule_kind = $2 AND r.status = 'due' AND r.due_at <= $3 AND (r.snoozed_until IS NULL OR r.snoozed_until <= $3)
           AND NOT ${CONSENT_AT_DISPATCH} RETURNING r.id`, [env(), rule.kind, now]);
      for (const row of noConsent.rows) await db.query("INSERT INTO reminder_events (reminder_id, action, actor_id, details) VALUES ($1, 'skipped', 'system', 'no-consent')", [row.id]);
      skippedNoConsent += noConsent.rows.length;
      const sent = await db.query<{ id: string }>(
        `UPDATE reminders r SET status = 'sent-simulated', sent_at = $3, handled_by = 'system', updated_at = now()
         WHERE r.environment_id = $1 AND r.rule_kind = $2 AND r.status = 'due' AND r.due_at <= $3 AND (r.snoozed_until IS NULL OR r.snoozed_until <= $3)
           AND ${CONSENT_AT_DISPATCH} RETURNING r.id`, [env(), rule.kind, now]);
      for (const row of sent.rows) await db.query("INSERT INTO reminder_events (reminder_id, action, actor_id, details) VALUES ($1, 'sent-simulated', 'system', 'auto')", [row.id]);
      autoSent += sent.rows.length;
    }
    return { now: now.toISOString(), generated, skippedNoConsent, autoSent, cancelled, byKind };
  };
  return client ? work(client) : withTransaction(work);
}

export async function runReminders(actor: GarageActor) {
  requireRunner(actor);
  return runDueReminders(new Date(), actor.userId);
}

// ---------- Queue ----------

interface QueueRow {
  id: string; rule_kind: ReminderKind; status: StoredStatus; reason: string | null; body: string; language: "ar" | "en"; due_at: Date; snoozed_until: Date | null;
  sent_at: Date | null; branch_id: string; customer_id: string; customer_name: string; vehicle_id: string | null; plate: string | null;
  booking_id: string | null; job_id: string | null; warranty_id: string | null; quote_id: string | null; conversation_id: string | null;
}

const QUEUE_SELECT = `SELECT r.id, r.rule_kind, r.status, r.reason, r.body, r.language, r.due_at, r.snoozed_until, r.sent_at, r.branch_id, r.customer_id, c.name AS customer_name,
  r.vehicle_id, v.plate, r.booking_id, r.job_id, r.warranty_id, r.quote_id,
  (SELECT wc.id FROM whatsapp_conversations wc WHERE wc.customer_id = r.customer_id ORDER BY wc.updated_at DESC LIMIT 1) AS conversation_id
  FROM reminders r JOIN customers c ON c.id = r.customer_id LEFT JOIN vehicles v ON v.id = r.vehicle_id`;
/** $1 environment, $2 owner flag, $3 branch ids. */
const QUEUE_SCOPE = `r.environment_id = $1 AND ($2 OR r.branch_id = ANY($3::text[]))
  AND NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind = 'customer' AND ra.entity_id = r.customer_id)`;

const shape = (row: QueueRow, now: Date) => ({
  id: row.id, kind: row.rule_kind, status: displayStatus(row, now), storedStatus: row.status, reason: row.reason, body: row.body, language: row.language,
  dueAt: new Date(row.due_at).toISOString(), snoozedUntil: row.snoozed_until ? new Date(row.snoozed_until).toISOString() : null, sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
  branchId: row.branch_id, customerId: row.customer_id, customerName: row.customer_name, vehicleId: row.vehicle_id, plate: row.plate,
  bookingId: row.booking_id, jobId: row.job_id, warrantyId: row.warranty_id, quoteId: row.quote_id, conversationId: row.conversation_id,
});
export type ReminderItem = ReturnType<typeof shape>;

export async function listReminders(actor: GarageActor, filter: { kind?: string; customerId?: string } = {}, now: Date = new Date()) {
  requireViewer(actor);
  const args: unknown[] = [env(), actor.role === "owner", actor.branchIds];
  const clauses = [QUEUE_SCOPE];
  if (filter.kind && isReminderKind(filter.kind)) { args.push(filter.kind); clauses.push(`r.rule_kind = $${args.length}`); }
  if (filter.customerId) { args.push(filter.customerId); clauses.push(`r.customer_id = $${args.length}`); }
  const rows = await pool.query<QueueRow>(`${QUEUE_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY r.due_at DESC LIMIT 500`, args);
  const items = rows.rows.map((row) => shape(row, now));
  const counts = { due: 0, upcoming: 0, snoozed: 0, "sent-simulated": 0, skipped: 0, cancelled: 0 };
  for (const item of items) counts[item.status] += 1;
  return {
    reminders: items, counts, deliveryMode: "simulated" as const,
    canAct: !actor.isDemo && hasCapability(actor, "bookings.manage"),
    canRun: !actor.isDemo && (actor.role === "owner" || actor.role === "branch-manager"),
    canManageRules: !actor.isDemo && actor.role === "owner",
  };
}

async function loadOpen(client: Runner, actor: GarageActor, id: string): Promise<QueueRow> {
  const found = await client.query<QueueRow>(`${QUEUE_SELECT} WHERE r.id = $4 AND ${QUEUE_SCOPE} FOR UPDATE OF r`, [env(), actor.role === "owner", actor.branchIds, id]);
  const row = found.rows[0];
  if (!row || !canAccessBranch(actor, row.branch_id)) return fail(404, "REMINDER_NOT_FOUND", "Follow-up not found.");
  if (row.status !== "due") return fail(409, "REMINDER_NOT_OPEN", "This follow-up has already been handled.");
  return row;
}

async function hasConsentNow(client: Runner, customerId: string, now: Date): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM messaging_customer_consents WHERE customer_id = $1 AND purpose = 'service' AND status = 'granted' AND evidence_ref IS NOT NULL
       AND consented_at <= $2 AND (expires_at IS NULL OR expires_at > $2) LIMIT 1`, [customerId, now]);
  return (result.rowCount ?? 0) > 0;
}

const record = (client: Runner, id: string, action: string, actor: GarageActor, details = "") =>
  client.query("INSERT INTO reminder_events (reminder_id, action, actor_id, details) VALUES ($1, $2, $3, $4)", [id, action, actor.userId, details]);

async function reload(client: Runner, actor: GarageActor, id: string, now: Date) {
  const found = await client.query<QueueRow>(`${QUEUE_SELECT} WHERE r.id = $4 AND ${QUEUE_SCOPE}`, [env(), actor.role === "owner", actor.branchIds, id]);
  return shape(found.rows[0], now);
}

/** Staff "Send now": records a simulated send only. Consent is re-checked at the moment of sending. */
export async function sendReminder(actor: GarageActor, id: string, now: Date = new Date()) {
  requireWriter(actor);
  return withTransaction(async (client) => {
    const row = await loadOpen(client, actor, id);
    if (!(await hasConsentNow(client, row.customer_id, now))) {
      await client.query("UPDATE reminders SET status = 'skipped', reason = 'no-consent', handled_by = $2, updated_at = now() WHERE id = $1", [id, actor.userId]);
      await record(client, id, "skipped", actor, "no-consent");
    } else {
      await client.query("UPDATE reminders SET status = 'sent-simulated', sent_at = $3, handled_by = $2, updated_at = now() WHERE id = $1", [id, actor.userId, now]);
      await record(client, id, "sent-simulated", actor, "manual");
    }
    return { reminder: await reload(client, actor, id, now), deliveryState: "simulated" as const };
  });
}

export async function skipReminder(actor: GarageActor, id: string, now: Date = new Date()) {
  requireWriter(actor);
  return withTransaction(async (client) => {
    await loadOpen(client, actor, id);
    await client.query("UPDATE reminders SET status = 'skipped', reason = 'staff-skipped', handled_by = $2, updated_at = now() WHERE id = $1", [id, actor.userId]);
    await record(client, id, "skipped", actor, "staff-skipped");
    return { reminder: await reload(client, actor, id, now) };
  });
}

export async function snoozeReminder(actor: GarageActor, id: string, days: number, now: Date = new Date()) {
  requireWriter(actor);
  if (!Number.isInteger(days) || days < 1 || days > 30) return fail(400, "INVALID_SNOOZE", "Choose between 1 and 30 days.");
  return withTransaction(async (client) => {
    await loadOpen(client, actor, id);
    const until = new Date(now.getTime() + days * 86_400_000);
    await client.query("UPDATE reminders SET snoozed_until = $2, handled_by = $3, updated_at = now() WHERE id = $1", [id, until, actor.userId]);
    await record(client, id, "snoozed", actor, `${days}d`);
    return { reminder: await reload(client, actor, id, now) };
  });
}
