import { z } from "zod";

/** Pure rules for special requests (no database access): schemas, status transitions, customer-safe projection. */

export const requestStatuses = ["new", "under-review", "needs-info", "accepted", "declined", "closed"] as const;
export type RequestStatus = (typeof requestStatuses)[number];
export const requestSources = ["staff", "customer-app"] as const;
export const decisions = ["accepted", "declined", "needs-info"] as const;
export type Decision = (typeof decisions)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T12:00:00Z`)), "Invalid date");
/** Currency list is central (W2.5-B); until it lands any ISO-4217-shaped code is accepted. */
const currency = z.string().regex(/^[A-Z]{3}$/);

export const createSchema = z.object({
  customerId: z.string().min(1).max(100),
  vehicleId: z.string().min(1).max(100),
  branchId: z.string().min(1).max(100).nullable().optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4000),
  requestedFrom: isoDate,
  requestedTo: isoDate.nullable().optional(),
  preferredTimeNote: z.string().trim().max(300).default(""),
  budgetNote: z.string().trim().max(300).default(""),
}).strict().refine((value) => !value.requestedTo || value.requestedTo >= value.requestedFrom, { message: "requestedTo must not precede requestedFrom", path: ["requestedTo"] });
export type CreateInput = z.infer<typeof createSchema>;

const revision = z.number().int().positive();
export const reviewStartSchema = z.object({ expectedRevision: revision }).strict();
export const infoSchema = z.object({ expectedRevision: revision, text: z.string().trim().min(1).max(1000) }).strict();
export const closeSchema = z.object({ expectedRevision: revision, reason: z.string().trim().min(1).max(500) }).strict();
export const quoteLinkSchema = z.object({ expectedRevision: revision, quoteId: z.string().min(1).max(100) }).strict();

/** One flat decision payload; the per-decision requirements are enforced by validateDecision so errors name the missing field. */
export const decisionSchema = z.object({
  expectedRevision: revision,
  decision: z.enum(decisions),
  message: z.string().trim().max(1500).default(""),
  quotedPriceMinor: z.number().int().safe().nonnegative().nullable().optional(),
  quotedCurrency: currency.nullable().optional(),
  durationDays: z.number().int().positive().max(3650).nullable().optional(),
  durationNote: z.string().trim().max(300).default(""),
  availableFrom: isoDate.nullable().optional(),
  offerValidUntil: isoDate.nullable().optional(),
  ownerNotes: z.string().trim().max(2000).default(""),
}).strict();
export type DecisionInput = z.infer<typeof decisionSchema>;

/** Returns the names of required fields that are missing for the chosen decision (empty when valid). */
export function validateDecision(input: DecisionInput): string[] {
  const missing: string[] = [];
  if (input.decision === "accepted") {
    if (input.quotedPriceMinor == null) missing.push("quotedPriceMinor");
    if (!input.quotedCurrency) missing.push("quotedCurrency");
    if (input.durationDays == null) missing.push("durationDays");
    if (!input.availableFrom) missing.push("availableFrom");
    if (input.offerValidUntil && input.availableFrom && input.offerValidUntil < input.availableFrom) missing.push("offerValidUntil");
  } else if (!input.message) {
    missing.push("message");
  }
  return missing;
}

/** Which statuses a request may move from, per action. */
const transitions: Record<"review-start" | "decide" | "info" | "close", readonly RequestStatus[]> = {
  "review-start": ["new"],
  decide: ["new", "under-review", "needs-info"],
  info: ["needs-info"],
  close: ["new", "under-review", "needs-info", "accepted", "declined"],
};
export const canTransition = (action: keyof typeof transitions, from: RequestStatus) => transitions[action].includes(from);
export const decisionStatus = (decision: Decision): RequestStatus => decision;

export const isOpenStatus = (status: RequestStatus) => status === "new" || status === "under-review" || status === "needs-info";

export interface RequestRow {
  id: string; customer_id: string; vehicle_id: string; branch_id: string | null; source: string; title: string; description: string;
  requested_from: string; requested_to: string | null; preferred_time_note: string; budget_note: string; status: RequestStatus;
  reply_decision: Decision | null; reply_message: string; quoted_price_minor: string | number | null; quoted_currency: string | null;
  duration_days: number | null; duration_note: string; available_from: string | null; offer_valid_until: string | null;
  owner_notes: string; decided_by: string | null; decided_at: Date | string | null; quote_id: string | null; created_by: string | null;
  revision: number; created_at: Date | string; updated_at: Date | string;
  customer_name?: string; plate?: string;
}

const iso = (value: Date | string | null) => (value instanceof Date ? value.toISOString() : value);

/**
 * Staff projection. `includeInternal` (review capability) adds owner notes and the deciding user.
 * `customerView` below is the subset a customer client may ever see.
 */
export function toRequest(row: RequestRow, includeInternal: boolean) {
  const hasReply = row.reply_decision !== null;
  const reply = hasReply ? {
    decision: row.reply_decision,
    message: row.reply_message,
    quotedPrice: row.quoted_price_minor == null || !row.quoted_currency ? null : { minor: Number(row.quoted_price_minor), currency: row.quoted_currency },
    durationDays: row.duration_days,
    durationNote: row.duration_note,
    availableFrom: row.available_from,
    offerValidUntil: row.offer_valid_until,
  } : null;
  return {
    id: row.id, customerId: row.customer_id, vehicleId: row.vehicle_id, branchId: row.branch_id, source: row.source,
    title: row.title, description: row.description, requestedFrom: row.requested_from, requestedTo: row.requested_to,
    preferredTimeNote: row.preferred_time_note, budgetNote: row.budget_note, status: row.status, reply,
    decidedAt: iso(row.decided_at), quoteId: row.quote_id, revision: row.revision,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    customerName: row.customer_name, plate: row.plate,
    ...(includeInternal ? { ownerNotes: row.owner_notes, decidedBy: row.decided_by, createdBy: row.created_by } : {}),
  };
}

/** Fields safe to hand to the future customer app: never owner notes, staff ids or the internal revision. */
export function customerView(row: RequestRow) {
  const full = toRequest(row, false);
  return {
    id: full.id, vehicleId: full.vehicleId, title: full.title, description: full.description,
    requestedFrom: full.requestedFrom, requestedTo: full.requestedTo, status: full.status, reply: full.reply, createdAt: full.createdAt,
  };
}
