import type { Locale } from "@garage/domain";
import { formatPlateDisplay } from "@garage/domain";
import { isRecordType, type RecordType } from "../../shared/record-types";

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

export interface AuditFilter { from: string; to: string; actor: string; kind: string; branchId: string; q: string }
export const emptyFilter: AuditFilter = { from: "", to: "", actor: "", kind: "", branchId: "", q: "" };

type Pair = { en: string; ar: string };

export const kindOptions: Array<{ value: string } & Pair> = [
  { value: "settings", en: "Settings", ar: "الإعدادات" },
  { value: "policy", en: "Policies", ar: "السياسات" },
  { value: "catalogue", en: "Catalogue", ar: "الكتالوج" },
  { value: "quote", en: "Quotes", ar: "عروض الأسعار" },
  { value: "warranty", en: "Warranties", ar: "الضمانات" },
  { value: "whatsapp", en: "WhatsApp", ar: "واتساب" },
  { value: "job", en: "Jobs", ar: "أوامر الشغل" },
  { value: "owner-record", en: "Archive and delete", ar: "الأرشفة والحذف" },
  { value: "availability", en: "Capacity", ar: "السعة" },
  { value: "invoice", en: "Invoices", ar: "الفواتير" },
  { value: "special-request", en: "Special requests", ar: "الطلبات الخاصة" },
  { value: "benefit", en: "Benefits", ar: "المنافع" },
  { value: "transport", en: "Transport", ar: "النقل" },
  { value: "reservation", en: "Reservations", ar: "الحجوزات المؤجلة" },
  { value: "customer-merge", en: "Customer merges", ar: "دمج العملاء" },
  { value: "money", en: "Money", ar: "الحركات المالية" },
  { value: "consent", en: "Messaging consent", ar: "موافقة المراسلة" },
  { value: "staff-access", en: "Staff access", ar: "صلاحيات الفريق" },
];

const actions: Record<string, Pair> = {
  "setting-changed": { en: "Setting changed", ar: "تغيير إعداد" }, proposed: { en: "Proposed", ar: "اقتراح" }, approved: { en: "Approved", ar: "اعتماد" },
  activated: { en: "Activated", ar: "تفعيل" }, "draft-saved": { en: "Draft saved", ar: "حفظ مسودة" }, "draft-created": { en: "Draft created", ar: "إنشاء مسودة" },
  "draft-updated": { en: "Draft updated", ar: "تعديل مسودة" }, published: { en: "Published", ar: "نشر" }, retired: { en: "Retired", ar: "إيقاف" },
  offered: { en: "Offered", ar: "تم العرض" }, accepted: { en: "Accepted", ar: "تم القبول" }, "acceptance-recorded": { en: "Acceptance recorded", ar: "تسجيل قبول" },
  archived: { en: "Archived", ar: "أرشفة" }, restored: { en: "Restored", ar: "استعادة" }, deleted: { en: "Deleted", ar: "حذف" },
  "approved-and-activated": { en: "Capacity approved", ar: "اعتماد السعة" }, "warranty-issued": { en: "Warranty issued", ar: "إصدار ضمان" },
  "warranty-auto-issued": { en: "Warranty issued automatically", ar: "إصدار ضمان تلقائي" }, "warranty-voided": { en: "Warranty voided", ar: "إلغاء ضمان" },
  "claim-opened": { en: "Claim opened", ar: "فتح مطالبة" }, "claim-status-changed": { en: "Claim status changed", ar: "تغيير حالة مطالبة" },
  "policy-published": { en: "Warranty policy published", ar: "نشر سياسة ضمان" }, "job-opened": { en: "Job opened", ar: "فتح أمر شغل" }, "job-updated": { en: "Job updated", ar: "تعديل أمر شغل" },
  "stage-received": { en: "Car received", ar: "استلام السيارة" }, "stage-in-service": { en: "Work started", ar: "بدء الشغل" }, "stage-qc": { en: "Quality check", ar: "فحص الجودة" },
  "stage-ready": { en: "Marked ready", ar: "جاهزة للتسليم" }, "stage-delivered": { en: "Delivered", ar: "تم التسليم" }, "stage-cancelled": { en: "Cancelled", ar: "إلغاء" },
  "stage-no-show": { en: "No-show", ar: "لم يحضر" }, generated: { en: "Generated", ar: "إنشاء" }, created: { en: "Created", ar: "إنشاء" }, edited: { en: "Edited", ar: "تعديل" },
  issued: { en: "Issued", ar: "إصدار" }, "payment-recorded": { en: "Payment recorded", ar: "تسجيل دفعة" }, voided: { en: "Voided", ar: "إلغاء" }, declined: { en: "Declined", ar: "رفض" },
  closed: { en: "Closed", ar: "إغلاق" }, "review-started": { en: "Review started", ar: "بدء المراجعة" }, "customers-merged": { en: "Customers merged", ar: "دمج عميلين" },
  "merge-undone": { en: "Merge undone", ar: "التراجع عن الدمج" }, "collection-recorded": { en: "Collection recorded", ar: "تسجيل تحصيل" }, "refund-recorded": { en: "Refund recorded", ar: "تسجيل استرداد" },
  "money-reversed": { en: "Money entry reversed", ar: "عكس حركة مالية" }, "consent-granted": { en: "Consent granted", ar: "منح موافقة" }, "consent-revoked": { en: "Consent withdrawn", ar: "سحب موافقة" },
  "inbox-granted": { en: "Inbox access granted", ar: "منح صلاحية صندوق الوارد" }, "inbox-revoked": { en: "Inbox access removed", ar: "إزالة صلاحية صندوق الوارد" },
  "conversation-assigned": { en: "Conversation assigned", ar: "إسناد محادثة" }, "contact-linked": { en: "Contact linked to customer", ar: "ربط جهة اتصال بعميل" },
  "conversation-created": { en: "Conversation opened", ar: "فتح محادثة" },
};

const entityTypes: Record<string, Pair> = {
  setting: { en: "Setting", ar: "إعداد" }, "commercial-policy": { en: "Policy", ar: "سياسة" }, "catalogue-package": { en: "Package", ar: "باقة" },
  "catalogue-grade": { en: "Grade", ar: "درجة" }, quote: { en: "Quote", ar: "عرض سعر" }, claim: { en: "Claim", ar: "مطالبة" }, warranty: { en: "Warranty", ar: "ضمان" },
  "warranty-policy": { en: "Warranty policy", ar: "سياسة ضمان" }, conversation: { en: "Conversation", ar: "محادثة" }, job: { en: "Job", ar: "أمر شغل" },
  branch: { en: "Branch", ar: "فرع" }, invoice: { en: "Invoice", ar: "فاتورة" }, "special-request": { en: "Special request", ar: "طلب خاص" }, benefit: { en: "Benefit", ar: "منفعة" },
  transport: { en: "Transport", ar: "نقل" }, reservation: { en: "Reservation", ar: "حجز مؤجل" }, customer: { en: "Customer", ar: "عميل" },
  "money-event": { en: "Money entry", ar: "حركة مالية" }, staff: { en: "Staff member", ar: "عضو فريق" },
};

const roles: Record<string, Pair> = {
  owner: { en: "Owner", ar: "المالك" }, "branch-manager": { en: "Branch manager", ar: "مدير فرع" }, receptionist: { en: "Receptionist", ar: "موظف استقبال" }, technician: { en: "Technician", ar: "فني" },
};

const humanise = (value: string) => { const text = value.replace(/[-_]+/g, " ").trim(); return text ? text.charAt(0).toUpperCase() + text.slice(1) : ""; };
const pick = (pair: Pair | undefined, lang: Locale, fallback: string) => (pair ? pair[lang] : fallback);

export const kindName = (kind: string, lang: Locale) => pick(kindOptions.find((item) => item.value === kind), lang, humanise(kind));
export const entityTypeName = (type: string, lang: Locale) => pick(entityTypes[type], lang, humanise(type));
export const roleName = (role: string | null, lang: Locale) => (role ? pick(roles[role], lang, humanise(role)) : "");
export function actionName(action: string, lang: Locale): string {
  const known = actions[action];
  if (known) return known[lang];
  return humanise(action.startsWith("status-") ? action.slice(7) : action);
}

/** Setting values that are plain words get friendlier wording; everything else is shown as stored. */
export function valueText(value: string | null): string {
  if (value === null || value === "") return "";
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

/** Who did it, never the raw id: the stored name, else the role, else a neutral word for system events. */
export function actorName(event: AuditEvent, lang: Locale): string {
  if (event.actor.name) return event.actor.name;
  if (event.actor.role) return roleName(event.actor.role, lang);
  return lang === "ar" ? "النظام" : "System";
}

export function branchName(event: AuditEvent, lang: Locale): string {
  return event.branch ? (lang === "ar" ? event.branch.nameAr : event.branch.nameEn) : "";
}

/** The record this event touched: a RecordRef-able type, or null for things without a record page (settings, branches, staff). */
export function recordTarget(event: AuditEvent): { type: RecordType; id: string; label?: string } | null {
  const type = event.entity.type === "commercial-policy" || event.entity.type === "catalogue-grade" ? null : event.entity.type;
  if (!type || !isRecordType(type)) return null;
  const raw = event.entity.label ?? undefined;
  const label = raw && (type === "job" || type === "warranty" || type === "claim") ? formatPlateDisplay(raw) : raw;
  return { type, id: event.entity.id, label };
}

/** Plain-text name of the record for the CSV-like contexts and the drawer title. Never an id. */
export function recordText(event: AuditEvent, lang: Locale): string {
  const target = recordTarget(event);
  if (target?.label) return target.label;
  if (event.entity.label) return event.entity.label;
  return entityTypeName(event.entity.type, lang);
}

export function moneyNote(event: AuditEvent): { minor: number; currency: string } | null {
  const extra = event.extra;
  const minor = Number(extra?.amountMinor);
  return extra && Number.isFinite(minor) && typeof extra.currency === "string" ? { minor, currency: extra.currency } : null;
}

export function changeSummary(event: AuditEvent): string {
  const before = valueText(event.before);
  const after = valueText(event.after);
  if (before && after) return `${before} -> ${after}`;
  if (after) return after;
  return event.detail ? event.detail : "";
}

/** Query string for /api/audit and the CSV export. Empty values are dropped. */
export function auditQuery(filter: AuditFilter, lang: Locale, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  const entries: Array<[string, string]> = [["from", filter.from], ["to", filter.to], ["actor", filter.actor], ["kind", filter.kind], ["branchId", filter.branchId], ["q", filter.q.trim()], ["lang", lang]];
  for (const [key, value] of entries) if (value) params.set(key, value);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  return params.toString();
}

export function activeFilters(filter: AuditFilter): number {
  return [filter.from, filter.to, filter.actor, filter.kind, filter.branchId, filter.q.trim()].filter(Boolean).length;
}

function parseActor(value: unknown): AuditEvent["actor"] {
  const raw = (value ?? {}) as Record<string, unknown>;
  return { id: typeof raw.id === "string" ? raw.id : null, name: typeof raw.name === "string" && raw.name ? raw.name : null, role: typeof raw.role === "string" ? raw.role : null };
}

/** Tolerant parser: malformed rows are dropped rather than crashing the screen. */
export function parseAuditEvent(value: unknown): AuditEvent | null {
  const raw = value as Record<string, unknown> | null;
  if (!raw || typeof raw.id !== "string" || typeof raw.occurredAt !== "string" || typeof raw.kind !== "string" || typeof raw.action !== "string") return null;
  const entity = (raw.entity ?? {}) as Record<string, unknown>;
  const branch = raw.branch as Record<string, unknown> | null;
  return {
    id: raw.id, occurredAt: raw.occurredAt, kind: raw.kind, action: raw.action, actor: parseActor(raw.actor),
    entity: { type: typeof entity.type === "string" ? entity.type : "", id: typeof entity.id === "string" ? entity.id : "", label: typeof entity.label === "string" ? entity.label : null },
    branch: branch && typeof branch.id === "string" ? { id: branch.id, nameEn: String(branch.nameEn ?? branch.id), nameAr: String(branch.nameAr ?? branch.nameEn ?? branch.id) } : null,
    detail: typeof raw.detail === "string" ? raw.detail : "",
    before: typeof raw.before === "string" ? raw.before : null, after: typeof raw.after === "string" ? raw.after : null,
    extra: raw.extra && typeof raw.extra === "object" ? raw.extra as Record<string, unknown> : null,
  };
}

/* ------------------------------------------------------------- daily summary */

export interface SummaryCount { value: number; previous: number | null; delta: number | null; basis: "exact" | "approximate" | "snapshot" }
export interface SummaryMoney { currency: string; count: number; amountMinor: number; previousAmountMinor: number; deltaMinor: number }
export interface DailySummary {
  date: string; previousDate: string; branchId: string | null; timezone: string;
  counts: Record<string, SummaryCount>;
  money: Record<string, SummaryMoney[]>;
}

export function parseSummary(value: unknown): DailySummary | null {
  const raw = value as Partial<DailySummary> | null;
  if (!raw || typeof raw.date !== "string" || !raw.counts || typeof raw.counts !== "object" || !raw.money || typeof raw.money !== "object") return null;
  return { date: raw.date, previousDate: String(raw.previousDate ?? ""), branchId: raw.branchId ?? null, timezone: String(raw.timezone ?? ""), counts: raw.counts, money: raw.money };
}

export const countTiles: Array<{ key: string; group: "bookings" | "workshop" | "sales" | "people" | "attention" } & Pair> = [
  { key: "bookingsCreated", group: "bookings", en: "Bookings created", ar: "حجوزات جديدة" },
  { key: "bookingsConfirmed", group: "bookings", en: "Bookings confirmed", ar: "حجوزات مؤكدة" },
  { key: "bookingsCancelled", group: "bookings", en: "Bookings cancelled", ar: "حجوزات ملغاة" },
  { key: "bookingsNoShow", group: "bookings", en: "No-shows", ar: "لم يحضروا" },
  { key: "jobsStarted", group: "workshop", en: "Jobs started", ar: "أوامر شغل بدأت" },
  { key: "jobsDelivered", group: "workshop", en: "Jobs delivered", ar: "أوامر شغل سُلّمت" },
  { key: "quotesOffered", group: "sales", en: "Quotes offered", ar: "عروض أسعار قُدمت" },
  { key: "quotesAccepted", group: "sales", en: "Quotes accepted", ar: "عروض أسعار مقبولة" },
  { key: "warrantiesIssued", group: "workshop", en: "Warranties issued", ar: "ضمانات صدرت" },
  { key: "claimsOpened", group: "workshop", en: "Warranty claims opened", ar: "مطالبات ضمان فُتحت" },
  { key: "newCustomers", group: "people", en: "New customers", ar: "عملاء جدد" },
  { key: "openSpecialRequests", group: "attention", en: "Open special requests (now)", ar: "طلبات خاصة مفتوحة (الآن)" },
  { key: "pendingReviews", group: "attention", en: "Bookings awaiting review (now)", ar: "حجوزات بانتظار المراجعة (الآن)" },
  { key: "whatsappAwaitingReply", group: "attention", en: "WhatsApp awaiting reply (now)", ar: "واتساب بانتظار الرد (الآن)" },
];

export const moneyTiles: Array<{ key: string } & Pair> = [
  { key: "quotesOfferedValue", en: "Quotes offered, value", ar: "قيمة عروض الأسعار المقدمة" },
  { key: "quotesAcceptedValue", en: "Quotes accepted, value", ar: "قيمة عروض الأسعار المقبولة" },
  { key: "collections", en: "Collections (money events)", ar: "التحصيلات (حركات مالية)" },
  { key: "refunds", en: "Refunds (money events)", ar: "المستردات (حركات مالية)" },
  { key: "invoicePayments", en: "Invoice payments recorded", ar: "مدفوعات الفواتير المسجلة" },
];

export const basisNote: Record<"approximate" | "snapshot", Pair> = {
  approximate: { en: "Approximate: counted from the last time the booking changed.", ar: "تقريبي: محسوب من آخر تعديل على الحجز." },
  snapshot: { en: "A live count as of now, not for the chosen day.", ar: "عدد حيّ حتى الآن وليس لليوم المختار." },
};

export const summaryCaveats: Pair[] = [
  { en: "Collections and refunds come only from recorded money events. Cash that was not recorded there is not counted.", ar: "التحصيلات والمستردات من الحركات المالية المسجلة فقط. أي نقدية لم تُسجل هناك لا تُحسب." },
  { en: "Invoice payments are payment references recorded on invoices; they may overlap with money events, so they are shown separately and never added together.", ar: "مدفوعات الفواتير هي مراجع الدفع المسجلة على الفواتير، وقد تتكرر مع الحركات المالية، لذلك تُعرض منفصلة ولا تُجمع." },
  { en: "Amounts are shown per currency and never added across currencies.", ar: "المبالغ تُعرض لكل عملة ولا تُجمع بين العملات." },
];

const MINUS = String.fromCodePoint(0x2212);
const latin = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const signed = (value: number) => (value > 0 ? `+${latin.format(value)}` : value < 0 ? `${MINUS}${latin.format(Math.abs(value))}` : "0");
function moneyText(minor: number, currency: string): string {
  let digits = 2;
  try { digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2; } catch { /* unknown code */ }
  const major = minor / 10 ** digits;
  return `${currency} ${major.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** The whole summary as plain text for WhatsApp or e-mail. Dates are ISO, digits Latin, no ids. */
export function summaryAsText(summary: DailySummary, lang: Locale, scopeLabel: string): string {
  const t = (pair: Pair) => pair[lang];
  const lines: string[] = [`${lang === "ar" ? "ملخص اليوم" : "Daily summary"} ${summary.date} - ${scopeLabel}`, ""];
  for (const tile of countTiles) {
    const item = summary.counts[tile.key];
    if (!item) continue;
    const change = item.delta === null ? "" : ` (${signed(item.delta)} ${lang === "ar" ? "عن أمس" : "vs yesterday"})`;
    lines.push(`${t(tile)}: ${latin.format(item.value)}${change}${item.basis === "approximate" ? " *" : ""}`);
  }
  lines.push("");
  for (const tile of moneyTiles) {
    const rows = summary.money[tile.key] ?? [];
    if (!rows.length) { lines.push(`${t(tile)}: 0`); continue; }
    for (const row of rows) lines.push(`${t(tile)}: ${moneyText(row.amountMinor, row.currency)} (${row.count})`);
  }
  lines.push("", "* " + basisNote.approximate[lang]);
  lines.push(...summaryCaveats.map((pair) => `- ${pair[lang]}`));
  return lines.join("\n");
}
