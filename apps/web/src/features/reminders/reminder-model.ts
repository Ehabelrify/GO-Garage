import type { Locale } from "@garage/domain";
import type { ReminderItem, ReminderKind, ReminderStatus } from "./reminders-api";

const t = (lang: Locale, en: string, ar: string) => (lang === "ar" ? ar : en);

export const kindOrder: ReminderKind[] = ["booking_day_before", "booking_morning_of", "ready_for_pickup", "warranty_expiry", "quote_followup", "post_service_checkin"];
export const statusOrder: ReminderStatus[] = ["due", "upcoming", "snoozed", "sent-simulated", "skipped", "cancelled"];

export function kindLabel(kind: ReminderKind, lang: Locale): string {
  const labels: Record<ReminderKind, [string, string]> = {
    booking_day_before: ["Booking reminder (day before)", "تذكير بالحجز (قبلها بيوم)"],
    booking_morning_of: ["Booking reminder (morning of)", "تذكير بالحجز (صباح اليوم)"],
    ready_for_pickup: ["Ready for pickup", "جاهزة للاستلام"],
    warranty_expiry: ["Warranty ending", "قرب انتهاء الضمان"],
    quote_followup: ["Quote follow-up", "متابعة عرض السعر"],
    post_service_checkin: ["Check-in after service", "الاطمئنان بعد الخدمة"],
  };
  return t(lang, ...labels[kind]);
}

export function statusLabel(status: ReminderStatus, lang: Locale): string {
  const labels: Record<ReminderStatus, [string, string]> = {
    due: ["Due", "مستحق"], upcoming: ["Upcoming", "قادم"], snoozed: ["Snoozed", "مؤجل"],
    "sent-simulated": ["Sent (simulated)", "أُرسل (محاكاة)"], skipped: ["Skipped", "متخطى"], cancelled: ["Cancelled", "ملغى"],
  };
  return t(lang, ...labels[status]);
}

/** Tone per status for the shared StatusBadge; kept here so the badge never needs a new registry domain. */
export const statusTone: Record<ReminderStatus, "info" | "warning" | "success" | "danger" | "neutral"> = {
  due: "warning", upcoming: "info", snoozed: "neutral", "sent-simulated": "success", skipped: "neutral", cancelled: "neutral",
};

export function reasonLabel(reason: string | null, lang: Locale): string {
  switch (reason) {
    case "no-consent": return t(lang, "No WhatsApp consent on record", "لا توجد موافقة واتساب مسجلة");
    case "staff-skipped": return t(lang, "Skipped by staff", "تخطاه الموظف");
    case "source-changed": return t(lang, "The booking, job or quote changed", "تغيّر الحجز أو الشغل أو العرض");
    default: return "";
  }
}

export function errorCopy(code: string, lang: Locale): string {
  const messages: Record<string, [string, string]> = {
    ROLE_FORBIDDEN: ["Your role does not allow this.", "دورك لا يسمح بذلك."],
    OWNER_REQUIRED: ["Only the owner can change reminder rules.", "المالك فقط يغيّر قواعد التذكير."],
    DEMO_ACTION_DISABLED: ["This cannot be changed in a role preview session.", "لا يمكن التغيير في جلسة معاينة الدور."],
    REMINDER_NOT_OPEN: ["This follow-up was already handled.", "تمت معالجة هذه المتابعة بالفعل."],
    REMINDER_NOT_FOUND: ["This follow-up no longer exists.", "هذه المتابعة لم تعد موجودة."],
    REVISION_CONFLICT: ["This rule changed. Reload and try again.", "تغيّرت القاعدة. أعد التحميل وحاول مجدداً."],
    INVALID_LEAD_TIME: ["Choose a lead time within the allowed range.", "اختر مدة ضمن النطاق المسموح."],
    EMPTY_TEMPLATE: ["The message cannot be empty.", "لا يمكن ترك الرسالة فارغة."],
    TEMPLATE_TOO_LONG: ["The message is too long.", "الرسالة طويلة جداً."],
    UNKNOWN_PLACEHOLDER: ["The message uses a placeholder that is not available for this rule.", "الرسالة تستخدم متغيراً غير متاح لهذه القاعدة."],
    WRITE_OUTCOME_UNKNOWN: ["The connection dropped. Reload to see whether it was saved.", "انقطع الاتصال. أعد التحميل لتعرف إن كان تم الحفظ."],
  };
  const found = messages[code];
  return found ? t(lang, ...found) : t(lang, "Something went wrong. Try again.", "حدث خطأ. حاول مرة أخرى.");
}

export type StatusFilter = "open" | "all" | ReminderStatus;

/** Open = due, upcoming and snoozed (what staff still has to handle). */
export const isOpen = (status: ReminderStatus) => status === "due" || status === "upcoming" || status === "snoozed";

export function filterReminders(rows: ReminderItem[], filter: { kind: string; status: StatusFilter; query: string }): ReminderItem[] {
  const text = filter.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.kind !== "all" && row.kind !== filter.kind) return false;
    if (filter.status === "open" ? !isOpen(row.status) : filter.status !== "all" && row.status !== filter.status) return false;
    return !text || [row.customerName, row.plate ?? "", row.body].some((value) => value.toLowerCase().includes(text));
  });
}

/** Sort key for the default order: open items by due time ascending first, then closed items newest first. */
export function defaultSortValue(row: ReminderItem): number {
  const due = new Date(row.dueAt).getTime();
  return isOpen(row.status) ? due : Number.MAX_SAFE_INTEGER / 2 - due / 1e6;
}

export function actionable(row: ReminderItem): boolean {
  return row.status === "due" || row.status === "snoozed";
}

export function runSummaryText(summary: { generated: number; skippedNoConsent: number; autoSent: number; cancelled: number }, lang: Locale): string {
  if (!summary.generated && !summary.autoSent && !summary.cancelled) return t(lang, "Nothing new. The follow-ups are up to date.", "لا جديد. المتابعات محدّثة.");
  const parts = [t(lang, `${summary.generated} new`, `${summary.generated} جديدة`)];
  if (summary.skippedNoConsent) parts.push(t(lang, `${summary.skippedNoConsent} skipped (no consent)`, `${summary.skippedNoConsent} متخطاة (بدون موافقة)`));
  if (summary.autoSent) parts.push(t(lang, `${summary.autoSent} marked sent (simulated)`, `${summary.autoSent} أُرسلت (محاكاة)`));
  if (summary.cancelled) parts.push(t(lang, `${summary.cancelled} cancelled`, `${summary.cancelled} ملغاة`));
  return parts.join(" · ");
}

/** HH:MM of an instant on the Cairo clock (the garage's local time), so the shown time does not depend on the browser zone. */
export function cairoClock(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${pick("hour")}:${pick("minute")}`;
}
