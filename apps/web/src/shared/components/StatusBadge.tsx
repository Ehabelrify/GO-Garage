import type { Locale } from "@garage/domain";
import { AlertTriangle, CheckCircle2, Circle, Info, XCircle, type LucideIcon } from "lucide-react";
import { stageNames } from "../labels";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type StatusDomain =
  | "booking" | "job" | "quote" | "reservation" | "benefit" | "transport"
  | "warranty" | "claim" | "policy" | "decision" | "staff" | "message" | "invoice" | "consent" | "request" | "purchase";

type Entry = { en: string; ar: string; tone: StatusTone };

const job: Record<string, Entry> = {
  booked: { ...stageNames.booked, tone: "neutral" },
  received: { ...stageNames.received, tone: "info" },
  "in-service": { ...stageNames["in-service"], tone: "info" },
  qc: { ...stageNames.qc, tone: "info" },
  ready: { ...stageNames.ready, tone: "success" },
  delivered: { ...stageNames.delivered, tone: "success" },
  cancelled: { ...stageNames.cancelled, tone: "danger" },
  "no-show": { ...stageNames["no-show"], tone: "danger" },
};

/** One registry for every domain. Arabic uses a single MSA register (DESIGN_SYSTEM section 7). */
export const statusRegistry: Record<StatusDomain, Record<string, Entry>> = {
  booking: {
    pending: { en: "Pending review", ar: "بانتظار المراجعة", tone: "warning" },
    confirmed: { en: "Confirmed", ar: "مؤكد", tone: "success" },
    cancelled: { en: "Cancelled", ar: "ملغي", tone: "danger" },
    "no-show": { en: "No-show", ar: "لم يحضر", tone: "danger" },
  },
  job,
  quote: {
    draft: { en: "Draft", ar: "مسودة", tone: "neutral" },
    offered: { en: "Offered", ar: "معروض", tone: "info" },
    accepted: { en: "Accepted", ar: "مقبول", tone: "success" },
    superseded: { en: "Superseded", ar: "مستبدل", tone: "neutral" },
    cancelled: { en: "Cancelled", ar: "ملغي", tone: "danger" },
    expired: { en: "Expired", ar: "منتهي", tone: "neutral" },
  },
  reservation: {
    reserved: { en: "Reserved", ar: "محجوز", tone: "info" },
    scheduled: { en: "Scheduled", ar: "مجدول", tone: "info" },
    redeemed: { en: "Redeemed", ar: "مستخدم", tone: "success" },
    cancelled: { en: "Cancelled", ar: "ملغي", tone: "danger" },
    expired: { en: "Expired", ar: "منتهي", tone: "neutral" },
  },
  benefit: {
    active: { en: "Active", ar: "ساري", tone: "success" },
    cancelled: { en: "Cancelled", ar: "ملغي", tone: "danger" },
    exhausted: { en: "Used up", ar: "مستنفد", tone: "neutral" },
    eligible: { en: "Eligible", ar: "مؤهل", tone: "success" },
    ineligible: { en: "Not eligible", ar: "غير مؤهل", tone: "danger" },
    "review-required": { en: "Needs review", ar: "يحتاج مراجعة", tone: "warning" },
    unconfigured: { en: "Not configured", ar: "غير مهيأ", tone: "neutral" },
  },
  transport: {
    proposed: { en: "Proposed", ar: "مقترح", tone: "neutral" },
    requested: { en: "Requested", ar: "مطلوب", tone: "warning" },
    confirmed: { en: "Confirmed", ar: "مؤكد", tone: "info" },
    "pickup-in-progress": { en: "Pickup in progress", ar: "الاستلام جارٍ", tone: "info" },
    "in-custody": { en: "In custody", ar: "في العهدة", tone: "info" },
    completed: { en: "Completed", ar: "مكتمل", tone: "success" },
    cancelled: { en: "Cancelled", ar: "ملغي", tone: "danger" },
    exception: { en: "Exception", ar: "استثناء", tone: "danger" },
  },
  warranty: {
    active: { en: "Active", ar: "ساري", tone: "success" },
    expired: { en: "Expired", ar: "منتهي", tone: "neutral" },
    terminated: { en: "Terminated", ar: "مُنهى", tone: "danger" },
    void: { en: "Void", ar: "ملغى", tone: "danger" },
  },
  claim: {
    open: { en: "Open", ar: "مفتوحة", tone: "warning" },
    "under-review": { en: "Under review", ar: "قيد المراجعة", tone: "info" },
    approved: { en: "Approved", ar: "موافق عليها", tone: "success" },
    denied: { en: "Denied", ar: "مرفوضة", tone: "danger" },
    closed: { en: "Closed", ar: "مغلقة", tone: "neutral" },
  },
  policy: {
    draft: { en: "Draft", ar: "مسودة", tone: "neutral" },
    published: { en: "Published", ar: "منشورة", tone: "success" },
    retired: { en: "Retired", ar: "متقاعدة", tone: "neutral" },
  },
  decision: {
    proposed: { en: "Proposed", ar: "مقترح", tone: "warning" },
    active: { en: "Active", ar: "مفعّل", tone: "success" },
    "on-hold": { en: "On hold", ar: "غير متاح بعد", tone: "neutral" },
  },
  staff: {
    active: { en: "Active", ar: "نشط", tone: "success" },
    inactive: { en: "Inactive", ar: "غير نشط", tone: "neutral" },
    pending: { en: "Awaiting sign-in", ar: "بانتظار الدخول", tone: "warning" },
    invited: { en: "Invited", ar: "مدعو", tone: "info" },
  },
  message: {
    sent: { en: "Sent", ar: "أُرسلت", tone: "info" },
    delivered: { en: "Delivered", ar: "وصلت", tone: "success" },
    read: { en: "Read", ar: "مقروءة", tone: "success" },
    failed: { en: "Failed", ar: "فشلت", tone: "danger" },
    simulated: { en: "Simulated", ar: "محاكاة", tone: "neutral" },
  },
  consent: {
    granted: { en: "Consent given", ar: "الموافقة قائمة", tone: "success" },
    revoked: { en: "Consent withdrawn", ar: "الموافقة مسحوبة", tone: "danger" },
    expired: { en: "Consent expired", ar: "الموافقة منتهية", tone: "warning" },
    missing: { en: "No consent on record", ar: "لا توجد موافقة مسجلة", tone: "neutral" },
    unknown: { en: "Consent unavailable", ar: "حالة الموافقة غير متاحة", tone: "neutral" },
  },
  request: {
    new: { en: "New", ar: "جديد", tone: "info" },
    "under-review": { en: "Under review", ar: "قيد المراجعة", tone: "info" },
    "needs-info": { en: "Needs info", ar: "يحتاج معلومات", tone: "warning" },
    accepted: { en: "Accepted", ar: "مقبول", tone: "success" },
    declined: { en: "Declined", ar: "مرفوض", tone: "danger" },
    closed: { en: "Closed", ar: "مغلق", tone: "neutral" },
  },
  purchase: {
    accepted: { en: "Accepted", ar: "مقبول", tone: "info" },
    delivered: { en: "Delivered", ar: "تم التسليم", tone: "success" },
  },
  invoice: {
    draft: { en: "Draft", ar: "مسودة", tone: "neutral" },
    issued: { en: "Issued", ar: "صادرة", tone: "info" },
    void: { en: "Void", ar: "ملغاة", tone: "danger" },
    unpriced: { en: "Not priced", ar: "بدون سعر", tone: "neutral" },
    unpaid: { en: "Unpaid", ar: "غير مدفوعة", tone: "warning" },
    partial: { en: "Part paid", ar: "مدفوعة جزئياً", tone: "info" },
    paid: { en: "Paid", ar: "مدفوعة", tone: "success" },
  },
};

const humanise = (value: string) => value.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Resolve a status to label + tone. Unknown values fall back to a humanised neutral label (never a raw enum with dashes). */
export function resolveStatus(status: string, lang: Locale, domain?: StatusDomain): { label: string; tone: StatusTone } {
  const domains = domain ? [domain] : (Object.keys(statusRegistry) as StatusDomain[]);
  for (const key of domains) {
    const entry = statusRegistry[key][status];
    if (entry) return { label: lang === "ar" ? entry.ar : entry.en, tone: entry.tone };
  }
  return { label: humanise(status), tone: "neutral" };
}

const toneIcons: Record<StatusTone, LucideIcon> = { neutral: Circle, info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };

export function StatusBadge({ status, lang, domain, label }: { status: string; lang: Locale; domain?: StatusDomain; label?: string }) {
  const resolved = resolveStatus(status, lang, domain);
  const Icon = toneIcons[resolved.tone];
  return <span className={`status ${status}`} data-tone={resolved.tone}><Icon size={12} aria-hidden="true" />{label ?? resolved.label}</span>;
}
