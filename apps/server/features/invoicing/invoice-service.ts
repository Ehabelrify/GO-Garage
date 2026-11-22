import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { DEFAULT_CURRENCY, isSupportedCurrency } from "@garage/domain";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { hasCapability, type GarageActor } from "../auth/authz";
import { commercialContext } from "../commercial/policy-service";
import {
  applyTaxRate, canTransition, computeTotals, formatInvoiceNumber, lineProblem, paymentStatus, toInvoice, toLine,
  type DraftUpdate, type InvoiceRow, type InvoiceStatus, type LineInput, type LineRow, type PaymentInput,
} from "./invoice-logic";

export class InvoiceError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const fail = (status: number, code: string, message: string): never => { throw new InvoiceError(status, code, message); };

const canRead = (actor: GarageActor) => hasCapability(actor, "bookings.manage") || hasCapability(actor, "finance.view");
const canWrite = (actor: GarageActor) => hasCapability(actor, "bookings.manage");
const canVoid = (actor: GarageActor) => actor.role === "owner" || (hasCapability(actor, "finance.view") && canWrite(actor));

function requireReader(actor: GarageActor) {
  if (!canRead(actor)) fail(403, "ROLE_FORBIDDEN", "Invoices are not available to your role.");
}
function requireWriter(actor: GarageActor, allowed: (a: GarageActor) => boolean = canWrite) {
  if (actor.isDemo) fail(403, "DEMO_ACTION_DISABLED", "Invoices cannot be changed in a role preview session.");
  if (!allowed(actor)) fail(403, "ROLE_FORBIDDEN", "Your role cannot do this invoice action.");
}

const SELECT = `SELECT i.id, i.branch_id, i.customer_id, i.vehicle_id, i.booking_id, i.job_id, i.quote_id, i.warranty_id, i.source, i.number, i.status, i.currency,
  i.tax_rate_percent::text AS tax_rate_percent, i.subtotal_minor::text AS subtotal_minor, i.discount_minor::text AS discount_minor, i.tax_minor::text AS tax_minor,
  i.total_minor::text AS total_minor, i.paid_minor::text AS paid_minor, i.issue_date::text AS issue_date, i.notes, i.terms, i.revision, i.created_at, i.updated_at,
  i.issued_at, i.void_reason, c.name AS customer_name, v.plate
  FROM invoices i JOIN customers c ON c.id = i.customer_id JOIN vehicles v ON v.id = i.vehicle_id`;
/** $1 owner flag, $2 branch ids, $3 environment. Branch scope plus not-archived customer. */
const SCOPE = `i.environment_id = $3 AND ($1 OR i.branch_id = ANY($2::text[]))
  AND NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind='customer' AND ra.entity_id = i.customer_id)`;
const scopeArgs = (actor: GarageActor) => [actor.role === "owner", actor.branchIds, commercialContext.environmentId];

const LINES = `SELECT id, position, kind, description_en, description_ar, quantity::text AS quantity, unit_minor::text AS unit_minor,
  discount_minor::text AS discount_minor, tax_minor::text AS tax_minor FROM invoice_lines WHERE invoice_id = $1 ORDER BY position`;

type Runner = Pick<PoolClient, "query">;

export async function listInvoices(actor: GarageActor, filter: { status?: string; customerId?: string; vehicleId?: string; jobId?: string }) {
  requireReader(actor);
  const clauses = [SCOPE];
  const args: unknown[] = scopeArgs(actor);
  for (const [column, value] of [["i.status", filter.status], ["i.customer_id", filter.customerId], ["i.vehicle_id", filter.vehicleId], ["i.job_id", filter.jobId]] as const) {
    if (value) { args.push(value); clauses.push(`${column} = $${args.length}`); }
  }
  const rows = await pool.query<InvoiceRow>(`${SELECT} WHERE ${clauses.join(" AND ")} ORDER BY i.created_at DESC LIMIT 300`, args);
  return { invoices: rows.rows.map(toInvoice), canWrite: !actor.isDemo && canWrite(actor), canVoid: !actor.isDemo && canVoid(actor) };
}

async function loadScoped(actor: GarageActor, id: string, client?: Runner, lock = false): Promise<InvoiceRow> {
  const runner = client ?? pool;
  const found = await runner.query<InvoiceRow>(`${SELECT} WHERE i.id = $4 AND ${SCOPE}${lock ? " FOR UPDATE OF i" : ""}`, [...scopeArgs(actor), id]);
  return found.rows[0] ?? fail(404, "INVOICE_NOT_FOUND", "Invoice not found.");
}

export async function getInvoice(actor: GarageActor, id: string) {
  requireReader(actor);
  const row = await loadScoped(actor, id);
  const lines = await pool.query<LineRow>(LINES, [id]);
  const events = await pool.query<{ seq: number; action: string; from_status: string | null; to_status: string; reason: string; occurred_at: Date; actor_name: string | null }>(
    `SELECT e.seq, e.action, e.from_status, e.to_status, e.reason, e.occurred_at, s.full_name AS actor_name
     FROM invoice_events e LEFT JOIN staff_memberships s ON s.clerk_user_id = e.actor_id WHERE e.invoice_id = $1 ORDER BY e.seq`, [id]);
  const payments = await pool.query<{ id: string; amount_minor: string; currency: string; method: string; reference: string; received_on: string; created_at: Date }>(
    `SELECT id, amount_minor::text AS amount_minor, currency, method, reference, received_on::text AS received_on, created_at FROM invoice_payment_references WHERE invoice_id = $1 ORDER BY created_at`, [id]);
  return {
    invoice: toInvoice(row),
    lines: lines.rows.map(toLine),
    history: events.rows.map((e) => ({ seq: e.seq, action: e.action, fromStatus: e.from_status, toStatus: e.to_status, actorName: e.actor_name, reason: e.reason, occurredAt: e.occurred_at.toISOString() })),
    payments: payments.rows.map((p) => ({ id: p.id, amountMinor: Number(p.amount_minor), currency: p.currency, method: p.method, reference: p.reference, receivedOn: p.received_on, recordedAt: p.created_at.toISOString() })),
    canWrite: !actor.isDemo && canWrite(actor), canVoid: !actor.isDemo && canVoid(actor),
  };
}

async function appendEvent(client: Runner, id: string, action: string, from: InvoiceStatus | null, to: InvoiceStatus, actorId: string | null, reason: string, snapshot: unknown = null) {
  await client.query(
    `INSERT INTO invoice_events (invoice_id, seq, action, from_status, to_status, actor_id, reason, snapshot)
     VALUES ($1, (SELECT coalesce(max(seq), 0) + 1 FROM invoice_events WHERE invoice_id = $1), $2, $3, $4, $5, $6, $7::jsonb)`,
    [id, action, from, to, actorId, reason, snapshot === null ? null : JSON.stringify(snapshot)]);
}

async function writeLines(client: Runner, invoiceId: string, lines: LineInput[]) {
  await client.query("DELETE FROM invoice_lines WHERE invoice_id = $1", [invoiceId]);
  for (const [position, line] of lines.entries()) {
    await client.query(
      `INSERT INTO invoice_lines (id, invoice_id, position, kind, description_en, description_ar, quantity, unit_minor, discount_minor, tax_minor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [`invl-${randomUUID()}`, invoiceId, position, line.kind, line.descriptionEn, line.descriptionAr, line.quantity, line.unitMinor, line.discountMinor, line.taxMinor]);
  }
}

/** Stores header totals computed from the lines (null while anything is unpriced / tax unconfirmed). */
async function writeTotals(client: Runner, invoiceId: string, lines: LineInput[]) {
  const t = computeTotals(lines);
  await client.query(
    "UPDATE invoices SET subtotal_minor=$2, discount_minor=$3, tax_minor=$4, total_minor=$5 WHERE id=$1",
    [invoiceId, t.subtotalMinor, t.discountMinor, t.taxMinor, t.totalMinor]);
  return t;
}

/* ------------------------------ generation ------------------------------ */

interface JobContext {
  jobId: string; bookingId: string; branchId: string; customerId: string; vehicleId: string; stage: string; serviceId: string;
  quoteId: string | null; quoteRevision: number | null; serviceEn: string; serviceAr: string;
}
interface SnapshotLine { scopeItemId: string; quantity: number; unitPrice: { minor: number; currency: string }; discount: { minor: number }; tax: { minor: number } | null }
interface Snapshot {
  total: { minor: number; currency: string }; lines: SnapshotLine[];
  packageVersion: { id: string; version: number } | null;
  scope: Array<{ id: string; serviceId: string; addOnIds?: string[]; productId?: string | null; label?: { ar?: string; en?: string } | null }>;
}

async function loadJobContext(client: Runner, by: { jobId?: string; bookingId?: string }): Promise<JobContext | null> {
  const found = await client.query<{ job_id: string; booking_id: string; branch_id: string; customer_id: string; vehicle_id: string; stage: string; service_id: string;
    accepted_quote_id: string | null; accepted_quote_revision: number | null; name_en: string; name_ar: string }>(
    `SELECT j.id AS job_id, b.id AS booking_id, j.branch_id, b.customer_id, b.vehicle_id, j.stage, b.service_id, b.accepted_quote_id, b.accepted_quote_revision, s.name_en, s.name_ar
     FROM jobs j JOIN bookings b ON b.id = j.booking_id JOIN services s ON s.id = b.service_id
     WHERE ${by.jobId ? "j.id = $1" : "b.id = $1"}`, [by.jobId ?? by.bookingId]);
  const r = found.rows[0];
  return r ? { jobId: r.job_id, bookingId: r.booking_id, branchId: r.branch_id, customerId: r.customer_id, vehicleId: r.vehicle_id, stage: r.stage, serviceId: r.service_id,
    quoteId: r.accepted_quote_id, quoteRevision: r.accepted_quote_revision, serviceEn: r.name_en, serviceAr: r.name_ar } : null;
}

/** Lines for one job: accepted quote lines (package, services, add-ons, discounts), else the booked service unpriced; plus completed transport fees. */
async function buildDraftLines(client: Runner, job: JobContext): Promise<{ lines: LineInput[]; currency: string; notes: string[] }> {
  const notes: string[] = [];
  let currency = DEFAULT_CURRENCY;
  const lines: LineInput[] = [];
  const snap = job.quoteId && job.quoteRevision
    ? (await client.query<{ accepted_snapshot: Snapshot }>(
      "SELECT accepted_snapshot FROM quote_acceptance_events WHERE quote_id = $1 AND revision = $2 AND environment_id = $3", [job.quoteId, job.quoteRevision, commercialContext.environmentId])).rows[0]?.accepted_snapshot
    : undefined;
  if (snap && Array.isArray(snap.lines) && snap.lines.length) {
    currency = isSupportedCurrency(snap.total?.currency) ? snap.total.currency : DEFAULT_CURRENCY;
    const pkg = snap.packageVersion
      ? (await client.query<{ name: { en?: string; ar?: string } }>("SELECT name FROM catalogue_package_versions WHERE package_id = $1 AND version = $2", [snap.packageVersion.id, snap.packageVersion.version])).rows[0]?.name
      : undefined;
    const serviceIds = [...new Set((snap.scope ?? []).map((s) => s.serviceId))];
    const names = serviceIds.length ? (await client.query<{ id: string; name_en: string; name_ar: string }>("SELECT id, name_en, name_ar FROM services WHERE id = ANY($1::text[])", [serviceIds])).rows : [];
    snap.lines.forEach((line, index) => {
      const item = (snap.scope ?? []).find((s) => s.id === line.scopeItemId);
      const service = names.find((n) => n.id === item?.serviceId);
      const isPackage = index === 0 && Boolean(pkg) && !item?.productId;
      const hasAddOns = Boolean(item?.addOnIds?.length);
      // A product line carries its own name; it is invoiced as "other" (no workshop service behind it).
      lines.push({
        kind: item?.productId ? "other" : isPackage ? "package" : hasAddOns ? "add-on" : "service",
        descriptionEn: (item?.productId ? item.label?.en : isPackage ? pkg?.en : service?.name_en) ?? job.serviceEn,
        descriptionAr: (item?.productId ? item.label?.ar : isPackage ? pkg?.ar : service?.name_ar) ?? job.serviceAr,
        quantity: line.quantity, unitMinor: line.unitPrice.minor, discountMinor: line.discount?.minor ?? 0, taxMinor: line.tax ? line.tax.minor : null,
      });
    });
  } else {
    lines.push({ kind: "service", descriptionEn: job.serviceEn, descriptionAr: job.serviceAr, quantity: 1, unitMinor: null, discountMinor: 0, taxMinor: null });
    notes.push("No accepted quote: the price must be entered before issuing.");
  }
  const transport = await client.query<{ direction: string; fee: { minor: number; currency: string } | null }>(
    "SELECT direction, fee FROM transport_requests WHERE booking_id = $1 AND environment_id = $2 AND status = 'completed' ORDER BY direction", [job.bookingId, commercialContext.environmentId]);
  for (const row of transport.rows) {
    if (!row.fee) continue;
    if (row.fee.currency !== currency) { notes.push(`A ${row.direction} transport fee in ${row.fee.currency} was not added because the invoice is in ${currency}.`); continue; }
    lines.push({ kind: "transport", descriptionEn: `Transport (${row.direction})`, descriptionAr: row.direction === "pickup" ? "نقل (استلام)" : row.direction === "return" ? "نقل (تسليم)" : "نقل", quantity: 1, unitMinor: row.fee.minor, discountMinor: 0, taxMinor: null });
  }
  return { lines, currency, notes };
}

/**
 * Creates the draft for a job exactly once. The idempotency key is `job:<jobId>`, so repeated delivery,
 * retries and the manual button all return the same invoice. Never throws on a duplicate.
 */
async function generateForContext(client: Runner, job: JobContext, actorId: string | null): Promise<{ id: string; created: boolean }> {
  const key = `job:${job.jobId}`;
  const existing = await client.query<{ id: string }>("SELECT id FROM invoices WHERE environment_id = $1 AND idempotency_key = $2", [commercialContext.environmentId, key]);
  if (existing.rows[0]) return { id: existing.rows[0].id, created: false };
  const { lines, currency, notes } = await buildDraftLines(client, job);
  const warranty = await client.query<{ id: string }>("SELECT id FROM warranties WHERE job_id = $1 AND status <> 'void' ORDER BY issued_at LIMIT 1", [job.jobId]);
  const id = `inv-${randomUUID()}`;
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO invoices (id, environment_id, branch_id, customer_id, vehicle_id, booking_id, job_id, quote_id, warranty_id, source, idempotency_key, currency, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (environment_id, idempotency_key) DO NOTHING RETURNING id`,
    [id, commercialContext.environmentId, job.branchId, job.customerId, job.vehicleId, job.bookingId, job.jobId, job.quoteId, warranty.rows[0]?.id ?? null,
      actorId ? "manual" : "auto", key, currency, notes.join(" "), actorId]);
  if (!inserted.rows[0]) return { id: (await client.query<{ id: string }>("SELECT id FROM invoices WHERE environment_id = $1 AND idempotency_key = $2", [commercialContext.environmentId, key])).rows[0].id, created: false };
  await writeLines(client, id, lines);
  await writeTotals(client, id, lines);
  await appendEvent(client, id, "generated", null, "draft", actorId, actorId ? "Generated from the job on request" : "Generated automatically when the job was delivered");
  return { id, created: true };
}

/**
 * Called inside the job-delivery transaction. Runs in a savepoint so a failure here can never block delivery;
 * the manual "Generate invoice" action is the fallback.
 */
export async function autoGenerateInvoiceForDeliveredJob(client: PoolClient, jobId: string): Promise<string | null> {
  await client.query("SAVEPOINT invoice_autogen");
  try {
    const job = await loadJobContext(client, { jobId });
    if (!job || job.stage !== "delivered") { await client.query("RELEASE SAVEPOINT invoice_autogen"); return null; }
    const result = await generateForContext(client, job, null);
    await client.query("RELEASE SAVEPOINT invoice_autogen");
    return result.id;
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT invoice_autogen");
    console.error("Invoice auto-generation skipped.", error instanceof Error ? error.message : "Unknown error");
    return null;
  }
}

export async function generateInvoice(actor: GarageActor, by: { jobId?: string; bookingId?: string }) {
  requireWriter(actor);
  const id = await withTransaction(async (client) => {
    const job = await loadJobContext(client, by);
    if (!job) return fail(404, "JOB_NOT_FOUND", "No job exists for that record yet.");
    if (actor.role !== "owner" && !actor.branchIds.includes(job.branchId)) return fail(403, "FORBIDDEN", "You cannot invoice a job in this branch.");
    if (!["ready", "delivered"].includes(job.stage)) return fail(409, "JOB_NOT_COMPLETE", "An invoice can be generated once the job is ready or delivered.");
    return (await generateForContext(client, job, actor.userId)).id;
  });
  return getInvoice(actor, id);
}

/* ------------------------------ edits ------------------------------ */

async function mutate(actor: GarageActor, id: string, expectedRevision: number, action: "edit" | "issue" | "payment" | "void", allowed: (a: GarageActor) => boolean,
  apply: (client: PoolClient, row: InvoiceRow) => Promise<void>) {
  requireWriter(actor, allowed);
  await withTransaction(async (client) => {
    const row = await loadScoped(actor, id, client, true);
    if (row.revision !== expectedRevision) return fail(409, "REVISION_CONFLICT", "This invoice changed. Reload and try again.");
    if (!canTransition(action, row.status)) return fail(409, "INVALID_STATE", `A ${row.status} invoice cannot take this action.`);
    await apply(client, row);
    await client.query("UPDATE invoices SET revision = revision + 1, updated_at = now() WHERE id = $1", [id]);
  });
  return getInvoice(actor, id);
}

export const updateDraft = async (actor: GarageActor, id: string, input: DraftUpdate) => {
  if (input.currency !== undefined && !isSupportedCurrency(input.currency)) throw new InvoiceError(400, "UNSUPPORTED_CURRENCY", "Choose a currency from the supported list.");
  const lines = applyTaxRate(input.lines as LineInput[], input.taxRatePercent);
  for (const line of lines) {
    const problem = lineProblem(line);
    if (problem) throw new InvoiceError(400, "INVALID_LINE", problem);
  }
  return mutate(actor, id, input.expectedRevision, "edit", canWrite, async (client, row) => {
    await client.query("UPDATE invoices SET currency=$2, tax_rate_percent=$3, notes=$4, terms=$5 WHERE id=$1", [id, input.currency ?? row.currency, input.taxRatePercent, input.notes, input.terms]);
    await writeLines(client, id, lines);
    const totals = await writeTotals(client, id, lines);
    await appendEvent(client, id, "edited", "draft", "draft", actor.userId, "", { currency: input.currency ?? row.currency, lineCount: lines.length, ...totals });
  });
};

export const issueInvoice = (actor: GarageActor, id: string, expectedRevision: number) =>
  mutate(actor, id, expectedRevision, "issue", canWrite, async (client, row) => {
    const lines = (await client.query<LineRow>(LINES, [id])).rows.map(toLine);
    if (!lines.length) return fail(409, "INVOICE_EMPTY", "Add at least one line before issuing.");
    const totals = computeTotals(lines);
    if (totals.totalMinor === null) return fail(409, "INVOICE_UNPRICED", "Every line needs a price and a tax amount (or a tax rate) before issuing.");
    const seq = await client.query<{ last_value: number; year: number; today: string }>(
      `WITH d AS (SELECT (now() AT TIME ZONE 'Africa/Cairo')::date AS today)
       INSERT INTO invoice_number_sequences (branch_id, year, last_value) SELECT $1, extract(year FROM d.today)::int, 1 FROM d
       ON CONFLICT (branch_id, year) DO UPDATE SET last_value = invoice_number_sequences.last_value + 1
       RETURNING last_value, year, (SELECT today::text FROM d) AS today`, [row.branch_id]);
    const { last_value, year, today } = seq.rows[0];
    const number = formatInvoiceNumber(row.branch_id, year, last_value);
    await client.query("UPDATE invoices SET status='issued', number=$2, issue_date=$3, issued_by=$4, issued_at=now() WHERE id=$1", [id, number, today, actor.userId]);
    await appendEvent(client, id, "issued", "draft", "issued", actor.userId, "", { number, currency: row.currency, ...totals });
  });

export const recordPayment = (actor: GarageActor, id: string, input: PaymentInput) =>
  mutate(actor, id, input.expectedRevision, "payment", canWrite, async (client, row) => {
    const total = Number(row.total_minor);
    const paid = Number(row.paid_minor) + input.amountMinor;
    if (paid > total) return fail(409, "OVERPAYMENT", "The payment is larger than the remaining balance.");
    const dup = await client.query("SELECT 1 FROM invoice_payment_references WHERE invoice_id = $1 AND reference = $2", [id, input.reference]);
    if (dup.rowCount) return fail(409, "DUPLICATE_REFERENCE", "This payment reference was already recorded.");
    await client.query(
      `INSERT INTO invoice_payment_references (id, invoice_id, amount_minor, currency, method, reference, received_on, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [`invpay-${randomUUID()}`, id, input.amountMinor, row.currency, input.method, input.reference, input.receivedOn, actor.userId]);
    const next = paymentStatus(total, paid);
    await client.query("UPDATE invoices SET paid_minor = $2, status = $3 WHERE id = $1", [id, paid, next]);
    await appendEvent(client, id, "payment-recorded", row.status, next, actor.userId, input.reference, { amountMinor: input.amountMinor, method: input.method, currency: row.currency });
  });

export const voidInvoice = (actor: GarageActor, id: string, expectedRevision: number, reason: string) =>
  mutate(actor, id, expectedRevision, "void", canVoid, async (client, row) => {
    if (Number(row.paid_minor) > 0) return fail(409, "HAS_PAYMENTS", "An invoice with recorded payments cannot be voided.");
    await client.query("UPDATE invoices SET status='void', voided_by=$2, voided_at=now(), void_reason=$3 WHERE id=$1", [id, actor.userId, reason]);
    await appendEvent(client, id, "voided", row.status, "void", actor.userId, reason);
  });
