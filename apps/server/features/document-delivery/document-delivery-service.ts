import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { canAccessBranch, canViewQuotes, canViewWarrantyRecords, hasCapability, type GarageActor } from "../auth/authz";
import { commercialContext } from "../commercial/policy-service";
import { hasActiveCustomerConsent } from "../whatsapp/customer-consent";
import { deliveryAdapter } from "../whatsapp/provider";
import { hashWarrantyVerificationToken, isWarrantyVerificationTokenFormat } from "../warranty/warranty-verification";
import { buildDocumentMessage, maskPhone, type DocumentKind, type MessageLanguage } from "./document-message";

export const documentKinds = ["invoice", "quote", "warranty-card"] as const;
/** "app" is a typed future value: the customer app does not exist yet, so it answers 501. */
export const deliveryChannels = ["whatsapp", "app"] as const;
export type DeliveryChannel = (typeof deliveryChannels)[number];

export class DeliveryError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const fail = (status: number, code: string, message: string): never => { throw new DeliveryError(status, code, message); };

type Runner = Pick<PoolClient, "query">;
const env = () => commercialContext.environmentId;
const NOT_ARCHIVED = (alias: string) => `NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind = 'customer' AND ra.entity_id = ${alias}.customer_id)`;

export interface SendRequest {
  documentKind: DocumentKind;
  documentId: string;
  channel: DeliveryChannel;
  idempotencyKey: string;
  /** Warranty cards only: the one-time live QR token the browser still holds, so the message can link the verification page. */
  verificationToken?: string;
}

interface LoadedDocument {
  kind: DocumentKind;
  id: string;
  branchId: string;
  customerId: string;
  reference: string | null;
  status?: string;
  totalMinor?: number | null;
  paidMinor?: number | null;
  currency?: string | null;
  date?: string | null;
  serviceName?: (lang: MessageLanguage) => string | null;
  plate?: string | null;
}

export interface DeliveryEntry {
  id: string;
  documentKind: DocumentKind;
  documentId: string;
  channel: "whatsapp";
  status: string;
  deliveryMode: "simulated" | "live";
  trigger: "manual" | "auto";
  recipient: string;
  language: MessageLanguage;
  linkIncluded: boolean;
  sentAt: string;
}

/** Capability that lets an actor send (and read the history of) each kind. */
export function canSendKind(actor: GarageActor, kind: DocumentKind): boolean {
  if (kind === "invoice") return hasCapability(actor, "invoices.view");
  if (kind === "quote") return canViewQuotes(actor);
  return hasCapability(actor, "warranty.view");
}

async function loadDocument(client: Runner, kind: DocumentKind, id: string): Promise<LoadedDocument | null> {
  if (kind === "invoice") {
    const row = (await client.query<{ id: string; branch_id: string; customer_id: string; number: string | null; status: string; currency: string; total_minor: string | null; paid_minor: string; plate: string | null }>(
      `SELECT i.id, i.branch_id, i.customer_id, i.number, i.status, i.currency, i.total_minor::text AS total_minor, i.paid_minor::text AS paid_minor, v.plate
       FROM invoices i JOIN vehicles v ON v.id = i.vehicle_id WHERE i.id = $1 AND i.environment_id = $2 AND ${NOT_ARCHIVED("i")}`, [id, env()])).rows[0];
    if (!row) return null;
    return { kind, id: row.id, branchId: row.branch_id, customerId: row.customer_id, reference: row.number, status: row.status, currency: row.currency,
      totalMinor: row.total_minor === null ? null : Number(row.total_minor), paidMinor: Number(row.paid_minor), plate: row.plate };
  }
  if (kind === "quote") {
    const row = (await client.query<{ id: string; branch_id: string; customer_id: string; accepted_revision: number | null; revision: number; state: string; valid_through: string | null; total: { minor?: number; currency?: string } | null }>(
      `SELECT h.id, h.branch_id, h.customer_id, h.accepted_revision, v.revision, v.state, v.valid_through::text AS valid_through, v.snapshot->'total' AS total
       FROM quote_heads h JOIN quote_versions v ON v.quote_id = h.id AND v.revision = h.current_revision
       WHERE h.id = $1 AND h.environment_id = $2 AND ${NOT_ARCHIVED("h")}
         AND NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind = 'quote' AND ra.entity_id = h.id)`, [id, env()])).rows[0];
    if (!row) return null;
    return { kind, id: row.id, branchId: row.branch_id, customerId: row.customer_id, reference: `${row.id.slice(-6).toUpperCase()}-${row.revision}`,
      status: row.accepted_revision === row.revision ? "accepted" : row.state, currency: row.total?.currency ?? null,
      totalMinor: typeof row.total?.minor === "number" ? row.total.minor : null, date: row.valid_through ? String(row.valid_through).slice(0, 10) : null };
  }
  const row = (await client.query<{ id: string; branch_id: string; customer_id: string; status: string; expires_on: string | null; coverage_kind: string; name_en: string | null; name_ar: string | null; plate: string | null }>(
    `SELECT w.id, w.branch_id, w.customer_id, w.status, w.expires_on::text AS expires_on, w.coverage_kind, s.name_en, s.name_ar, v.plate
     FROM warranties w LEFT JOIN services s ON s.id = w.service_id LEFT JOIN vehicles v ON v.id = w.vehicle_id
     WHERE w.id = $1 AND ${NOT_ARCHIVED("w")}`, [id])).rows[0];
  if (!row) return null;
  return { kind, id: row.id, branchId: row.branch_id, customerId: row.customer_id, reference: row.id.slice(-8).toUpperCase(), status: row.status,
    date: row.coverage_kind === "lifetime" ? null : row.expires_on, plate: row.plate,
    serviceName: (lang) => (lang === "ar" ? row.name_ar : row.name_en) ?? row.name_en ?? row.name_ar };
}

/** Same rule as the outbox and reminders: an active, evidenced, unexpired 'service' consent (see hasActiveCustomerConsent). */
async function hasConsent(client: Runner, customerId: string, at: Date): Promise<boolean> {
  const channels = await client.query<{ id: string }>("SELECT id FROM messaging_channels WHERE status <> 'disabled' ORDER BY id");
  for (const channel of channels.rows) {
    if (await hasActiveCustomerConsent(client, { channelId: channel.id, customerId, purpose: "service", at })) return true;
  }
  return false;
}

/** Link only to the public warranty verification page, and only when the live token checks out and verification is on. */
async function warrantyLink(client: Runner, warrantyId: string, token: string | undefined): Promise<string | null> {
  const base = process.env.GARAGE_PUBLIC_BASE_URL?.trim();
  if (!token || !base || !isWarrantyVerificationTokenFormat(token)) return null;
  const ok = await client.query(
    `SELECT 1 FROM warranty_verification_tokens t JOIN warranty_verification_settings s ON s.singleton = true AND s.enabled = true
     WHERE t.warranty_id = $1 AND t.token_hash = $2 AND t.revoked_at IS NULL LIMIT 1`, [warrantyId, hashWarrantyVerificationToken(token)]);
  return ok.rowCount ? `${base.replace(/\/$/, "")}/warranty/verify/${encodeURIComponent(token)}` : null;
}

interface LogRow {
  id: string; document_kind: DocumentKind; document_id: string; status: string; delivery_mode: "simulated" | "live"; trigger: "manual" | "auto";
  recipient_masked: string; language: MessageLanguage; link_included: boolean; created_at: Date; request_hash?: string;
}
const toEntry = (row: LogRow): DeliveryEntry => ({
  id: row.id, documentKind: row.document_kind, documentId: row.document_id, channel: "whatsapp", status: row.status, deliveryMode: row.delivery_mode,
  trigger: row.trigger, recipient: row.recipient_masked, language: row.language, linkIncluded: row.link_included, sentAt: new Date(row.created_at).toISOString(),
});
const LOG_COLUMNS = "id, document_kind, document_id, status, delivery_mode, trigger, recipient_masked, language, link_included, created_at, request_hash";

const requestHash = (request: Pick<SendRequest, "documentKind" | "documentId" | "channel">) =>
  createHash("sha256").update(`${request.documentKind}|${request.documentId}|${request.channel}`).digest("hex");

function readyProblem(doc: LoadedDocument): [number, string, string] | null {
  if (doc.kind === "invoice" && (doc.status === "draft" || doc.status === "void")) return [409, "INVOICE_NOT_SENDABLE", "Only an issued invoice can be sent to the customer."];
  if (doc.kind === "quote" && doc.status !== "offered" && doc.status !== "accepted") return [409, "QUOTE_NOT_SENDABLE", "Only an offered or accepted quote can be sent to the customer."];
  if (doc.kind === "warranty-card" && doc.status !== "active") return [409, "WARRANTY_NOT_SENDABLE", "Only an active warranty card can be sent to the customer."];
  return null;
}

/**
 * Shared delivery step. `sentBy` is a staff user id, or "system" for the automatic hook. Consent is checked here, so every
 * caller gets the same rule. Without a connected adapter the result is recorded as sent-simulated, never as delivered.
 */
async function deliver(client: Runner, doc: LoadedDocument, request: SendRequest, sentBy: string, trigger: "manual" | "auto", now: Date): Promise<DeliveryEntry> {
  const customer = (await client.query<{ name: string; phone_normalized: string; preferred_language: MessageLanguage }>(
    "SELECT name, phone_normalized, preferred_language FROM customers WHERE id = $1", [doc.customerId])).rows[0];
  if (!customer) return fail(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
  if (!(await hasConsent(client, doc.customerId, now))) {
    return fail(422, "CONSENT_REQUIRED", "This customer has no recorded WhatsApp consent, so nothing was sent. Record consent first.");
  }
  const lang: MessageLanguage = customer.preferred_language === "en" ? "en" : "ar";
  const link = doc.kind === "warranty-card" ? await warrantyLink(client, doc.id, request.verificationToken) : null;
  const message = buildDocumentMessage({
    kind: doc.kind, lang, customerName: customer.name, reference: doc.reference, status: doc.status, totalMinor: doc.totalMinor, paidMinor: doc.paidMinor,
    currency: doc.currency, date: doc.date, serviceName: doc.serviceName?.(lang) ?? null, plate: doc.plate, link,
  });

  const adapter = deliveryAdapter();
  const live = adapter.connected;
  const result = await adapter.send({ channelId: "whatsapp", recipient: customer.phone_normalized, content: { type: "freeform", purpose: "service", language: lang, text: message.body }, idempotencyKey: request.idempotencyKey });
  const status = result.state === "accepted" ? (live ? "accepted" : "sent-simulated") : result.state === "definite-failure" ? "definite-failure" : "queued";
  const failureCode = result.state === "definite-failure" ? result.code : null;
  const inserted = await client.query<LogRow>(
    `INSERT INTO document_delivery_log (id, environment_id, document_kind, document_id, customer_id, branch_id, channel, language, recipient_masked, status, delivery_mode,
       trigger, link_included, body, provider_message_id, failure_code, idempotency_key, request_hash, sent_by)
     VALUES ($1,$2,$3,$4,$5,$6,'whatsapp',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (environment_id, idempotency_key) DO NOTHING RETURNING ${LOG_COLUMNS}`,
    [`ddl-${randomUUID()}`, env(), doc.kind, doc.id, doc.customerId, doc.branchId, lang, maskPhone(customer.phone_normalized), status, live ? "live" : "simulated", trigger, message.linkIncluded,
      message.body, result.state === "accepted" ? result.providerMessageId : null, failureCode, request.idempotencyKey, requestHash(request), sentBy]);
  const row = inserted.rows[0];
  if (!row) return fail(409, "IDEMPOTENCY_CONFLICT", "This request is already being processed. Reload and check the history.");
  if (status === "definite-failure") return fail(502, "DELIVERY_FAILED", "The message could not be delivered.");
  return toEntry(row);
}

export async function sendDocument(actor: GarageActor, request: SendRequest, now: Date = new Date()) {
  if (request.channel === "app") return fail(501, "CHANNEL_NOT_AVAILABLE", "Sending to the customer app is not available yet.");
  if (actor.isDemo) return fail(403, "DEMO_ACTION_DISABLED", "Documents cannot be sent in a role preview session.");
  if (!canSendKind(actor, request.documentKind)) return fail(403, "ROLE_FORBIDDEN", "Your role cannot send this kind of document.");
  return withTransaction(async (client) => {
    const doc = await loadDocument(client, request.documentKind, request.documentId);
    if (!doc || !canAccessBranch(actor, doc.branchId) || (doc.kind === "warranty-card" && !canViewWarrantyRecords(actor, doc.branchId))) {
      return fail(404, "DOCUMENT_NOT_FOUND", "Document not found.");
    }
    const prior = await client.query<LogRow>(`SELECT ${LOG_COLUMNS} FROM document_delivery_log WHERE environment_id = $1 AND idempotency_key = $2`, [env(), request.idempotencyKey]);
    if (prior.rows[0]) {
      if (prior.rows[0].request_hash !== requestHash(request)) return fail(409, "IDEMPOTENCY_CONFLICT", "This key belongs to a different send request.");
      return { entry: toEntry(prior.rows[0]), replayed: true, simulated: prior.rows[0].delivery_mode === "simulated" };
    }
    const problem = readyProblem(doc);
    if (problem) return fail(...problem);
    const entry = await deliver(client, doc, request, actor.userId, "manual", now);
    return { entry, replayed: false, simulated: entry.deliveryMode === "simulated" };
  });
}

/** Newest first. Same capability and branch scope as sending. */
export async function listDeliveries(actor: GarageActor, kind: DocumentKind, documentId: string) {
  if (!canSendKind(actor, kind)) return fail(403, "ROLE_FORBIDDEN", "Your role cannot see this kind of document.");
  const doc = await loadDocument(pool, kind, documentId);
  if (!doc || !canAccessBranch(actor, doc.branchId)) return fail(404, "DOCUMENT_NOT_FOUND", "Document not found.");
  const rows = await pool.query<LogRow>(
    `SELECT ${LOG_COLUMNS} FROM document_delivery_log WHERE environment_id = $1 AND document_kind = $2 AND document_id = $3 ORDER BY created_at DESC LIMIT 20`, [env(), kind, documentId]);
  return { deliveries: rows.rows.map(toEntry), deliveryMode: deliveryAdapter().connected ? ("live" as const) : ("simulated" as const) };
}

/**
 * Automatic send hook for invoice issue, quote offer or acceptance, and warranty issuance. Runs inside the caller's
 * transaction under a savepoint, so a missing consent or any failure never aborts the business action. Idempotent per
 * document and event. Not wired into any transaction yet (call sites are listed in docs/engineering/DOCUMENT_DELIVERY.md).
 */
export async function autoSendOnIssue(client: PoolClient, kind: DocumentKind, documentId: string, event: string, now: Date = new Date()): Promise<{ sent: boolean; reason?: string }> {
  await client.query("SAVEPOINT document_auto_send");
  try {
    const doc = await loadDocument(client, kind, documentId);
    if (!doc || readyProblem(doc)) { await client.query("RELEASE SAVEPOINT document_auto_send"); return { sent: false, reason: "not-sendable" }; }
    await deliver(client, doc, { documentKind: kind, documentId, channel: "whatsapp", idempotencyKey: `auto:${kind}:${documentId}:${event}` }, "system", "auto", now);
    await client.query("RELEASE SAVEPOINT document_auto_send");
    return { sent: true };
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT document_auto_send");
    return { sent: false, reason: error instanceof DeliveryError ? error.code : "delivery-error" };
  }
}
