import { isSupportedCurrency, type Locale } from "@garage/domain";
import { majorToMinor } from "../../shared/format";

/** Pure rules for the special-requests UI: parsing server payloads, form validation, decision payloads. */

export type RequestStatus = "new" | "under-review" | "needs-info" | "accepted" | "declined" | "closed";
export const requestStatuses: RequestStatus[] = ["new", "under-review", "needs-info", "accepted", "declined", "closed"];
export type Decision = "accepted" | "declined" | "needs-info";
export interface MoneyValue { minor: number; currency: string }

export interface RequestReply {
  decision: Decision; message: string; quotedPrice: MoneyValue | null; durationDays: number | null; durationNote: string;
  availableFrom: string | null; offerValidUntil: string | null;
}
export interface SpecialRequest {
  id: string; customerId: string; vehicleId: string; branchId: string | null; source: string; title: string; description: string;
  requestedFrom: string; requestedTo: string | null; preferredTimeNote: string; budgetNote: string; status: RequestStatus;
  reply: RequestReply | null; decidedAt: string | null; quoteId: string | null; revision: number; createdAt: string;
  customerName: string; plate: string; ownerNotes?: string;
}
export interface HistoryEvent { seq: number; action: string; fromStatus: string | null; toStatus: string; actorName: string | null; reason: string; occurredAt: string }

const obj = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);
const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const nullableText = (value: unknown) => (typeof value === "string" && value ? value : null);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const money = (value: unknown): MoneyValue | null => {
  const o = obj(value);
  return o && num(o.minor) !== null && typeof o.currency === "string" ? { minor: o.minor as number, currency: o.currency } : null;
};

export function parseRequest(raw: unknown): SpecialRequest | null {
  const o = obj(raw);
  if (!o || typeof o.id !== "string" || !requestStatuses.includes(o.status as RequestStatus)) return null;
  const reply = obj(o.reply);
  return {
    id: o.id, customerId: text(o.customerId), vehicleId: text(o.vehicleId), branchId: nullableText(o.branchId), source: text(o.source, "staff"),
    title: text(o.title), description: text(o.description), requestedFrom: text(o.requestedFrom), requestedTo: nullableText(o.requestedTo),
    preferredTimeNote: text(o.preferredTimeNote), budgetNote: text(o.budgetNote), status: o.status as RequestStatus,
    reply: reply && ["accepted", "declined", "needs-info"].includes(text(reply.decision)) ? {
      decision: reply.decision as Decision, message: text(reply.message), quotedPrice: money(reply.quotedPrice), durationDays: num(reply.durationDays),
      durationNote: text(reply.durationNote), availableFrom: nullableText(reply.availableFrom), offerValidUntil: nullableText(reply.offerValidUntil),
    } : null,
    decidedAt: nullableText(o.decidedAt), quoteId: nullableText(o.quoteId), revision: num(o.revision) ?? 1, createdAt: text(o.createdAt),
    customerName: text(o.customerName), plate: text(o.plate), ownerNotes: typeof o.ownerNotes === "string" ? o.ownerNotes : undefined,
  };
}

export function parseHistory(raw: unknown): HistoryEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(obj).filter((e): e is Record<string, unknown> => e !== null && typeof e.seq === "number").map((e) => ({
    seq: e.seq as number, action: text(e.action), fromStatus: nullableText(e.fromStatus), toStatus: text(e.toStatus),
    actorName: nullableText(e.actorName), reason: text(e.reason), occurredAt: text(e.occurredAt),
  }));
}

export const isOpen = (status: RequestStatus) => status === "new" || status === "under-review" || status === "needs-info";

export function filterRequests(rows: SpecialRequest[], filter: { query: string; status: string }): SpecialRequest[] {
  const q = filter.query.trim().toLowerCase();
  return rows.filter((row) => (filter.status === "all" || (filter.status === "open" ? isOpen(row.status) : row.status === filter.status))
    && (!q || `${row.title} ${row.customerName} ${row.plate}`.toLowerCase().includes(q)));
}

// ---------- create form ----------

export interface CreateForm {
  customerId: string; vehicleId: string; branchId: string; title: string; description: string;
  requestedFrom: string; requestedTo: string; preferredTimeNote: string; budgetNote: string;
}
export const emptyCreateForm = (): CreateForm => ({ customerId: "", vehicleId: "", branchId: "", title: "", description: "", requestedFrom: "", requestedTo: "", preferredTimeNote: "", budgetNote: "" });
export type CreateErrors = Partial<Record<"customerId" | "vehicleId" | "title" | "description" | "requestedFrom" | "requestedTo", "required" | "range">>;

export function validateCreate(form: CreateForm): CreateErrors {
  const errors: CreateErrors = {};
  if (!form.customerId) errors.customerId = "required";
  if (!form.vehicleId) errors.vehicleId = "required";
  if (!form.title.trim()) errors.title = "required";
  if (!form.description.trim()) errors.description = "required";
  if (!form.requestedFrom) errors.requestedFrom = "required";
  else if (form.requestedTo && form.requestedTo < form.requestedFrom) errors.requestedTo = "range";
  return errors;
}

export function createPayload(form: CreateForm) {
  return {
    customerId: form.customerId, vehicleId: form.vehicleId, branchId: form.branchId || null, title: form.title.trim(), description: form.description.trim(),
    requestedFrom: form.requestedFrom, requestedTo: form.requestedTo || null, preferredTimeNote: form.preferredTimeNote.trim(), budgetNote: form.budgetNote.trim(),
  };
}

// ---------- owner reply ----------

export interface ReplyForm {
  decision: Decision; message: string; price: string; currency: string; durationDays: string; durationNote: string;
  availableFrom: string; offerValidUntil: string; ownerNotes: string;
}
export const emptyReplyForm = (decision: Decision): ReplyForm => ({
  decision, message: "", price: "", currency: "EGP", durationDays: "", durationNote: "", availableFrom: "", offerValidUntil: "", ownerNotes: "",
});
export type ReplyField = "message" | "price" | "currency" | "durationDays" | "availableFrom" | "offerValidUntil";

/** Missing or invalid fields for the chosen decision (mirrors the server rules). */
export function validateReply(form: ReplyForm): ReplyField[] {
  const bad: ReplyField[] = [];
  if (form.decision === "accepted") {
    if (majorToMinor(form.price, form.currency) === null) bad.push("price");
    if (!isSupportedCurrency(form.currency)) bad.push("currency");
    const days = Number(form.durationDays);
    if (!Number.isInteger(days) || days <= 0) bad.push("durationDays");
    if (!form.availableFrom) bad.push("availableFrom");
    else if (form.offerValidUntil && form.offerValidUntil < form.availableFrom) bad.push("offerValidUntil");
  } else if (!form.message.trim()) bad.push("message");
  return bad;
}

export function decisionPayload(form: ReplyForm, expectedRevision: number) {
  const accepted = form.decision === "accepted";
  return {
    expectedRevision, decision: form.decision, message: form.message.trim(),
    quotedPriceMinor: accepted ? majorToMinor(form.price, form.currency) : null, quotedCurrency: accepted ? form.currency : null,
    durationDays: accepted ? Number(form.durationDays) : null, durationNote: accepted ? form.durationNote.trim() : "",
    availableFrom: accepted ? form.availableFrom : null, offerValidUntil: accepted ? form.offerValidUntil || null : null, ownerNotes: form.ownerNotes.trim(),
  };
}

export const actionLabels: Record<string, { en: string; ar: string }> = {
  created: { en: "Created", ar: "تم الإنشاء" },
  "review-started": { en: "Review started", ar: "بدأت المراجعة" },
  accepted: { en: "Accepted", ar: "تم القبول" },
  declined: { en: "Declined", ar: "تم الرفض" },
  "needs-info": { en: "More information requested", ar: "طُلبت معلومات إضافية" },
  "info-added": { en: "Information added", ar: "أُضيفت معلومات" },
  "quote-linked": { en: "Quote linked", ar: "تم ربط عرض سعر" },
  closed: { en: "Closed", ar: "تم الإغلاق" },
};
export const actionLabel = (action: string, lang: Locale) => (actionLabels[action] ? actionLabels[action][lang === "ar" ? "ar" : "en"] : action);

export const dateRange = (from: string, to: string | null) => (to && to !== from ? `${from} → ${to}` : from);
