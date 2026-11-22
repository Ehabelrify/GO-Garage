import { plateMatchesQuery, phoneDigits } from "@garage/domain";
import type { TransportStatus } from "@garage/domain";

/** Mirrors the server transition table; the server stays the authority. */
export const nextByStatus: Record<TransportStatus, TransportStatus[]> = {
  proposed: ["requested", "cancelled"],
  requested: ["confirmed", "cancelled", "exception"],
  confirmed: ["pickup-in-progress", "cancelled", "exception"],
  "pickup-in-progress": ["in-custody", "cancelled", "exception"],
  "in-custody": ["completed", "exception"],
  completed: [],
  cancelled: [],
  exception: ["requested", "cancelled"],
};

export const reasonRequired = (next: TransportStatus) => next === "cancelled" || next === "exception";
export const needsCommitment = (next: TransportStatus) => next === "confirmed";
export const isDestructive = (next: TransportStatus) => next === "cancelled" || next === "exception";

export const directionLabels = {
  pickup: { en: "Pickup", ar: "استلام" },
  return: { en: "Return to customer", ar: "إعادة للعميل" },
  courtesy: { en: "Courtesy", ar: "مجاملة" },
} as const;
export const modeLabels = {
  tow: { en: "Tow truck", ar: "ونش" },
  driver: { en: "Driver", ar: "سائق" },
  "courtesy-car": { en: "Courtesy car", ar: "سيارة بديلة" },
} as const;

/** Action verbs for transition buttons (never the raw status key). */
export const transitionVerbs: Record<TransportStatus, { en: string; ar: string }> = {
  proposed: { en: "Reopen", ar: "إعادة فتح" },
  requested: { en: "Submit request", ar: "إرسال الطلب" },
  confirmed: { en: "Confirm", ar: "تأكيد" },
  "pickup-in-progress": { en: "Start pickup", ar: "بدء الاستلام" },
  "in-custody": { en: "Mark in custody", ar: "تسجيل في العهدة" },
  completed: { en: "Complete", ar: "إكمال" },
  cancelled: { en: "Cancel request", ar: "إلغاء الطلب" },
  exception: { en: "Flag a problem", ar: "الإبلاغ عن مشكلة" },
};

export type CommitmentCheck = { ok: true; startsAt: string; endsAt: string } | { ok: false; error: "window" | "order" | "evidence" };

/** Validates the committed window (datetime-local strings) and protected evidence reference for a confirmation. */
export function checkCommitment(startsAt: string, endsAt: string, evidenceRef: string): CommitmentCheck {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!startsAt || !endsAt || Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return { ok: false, error: "window" };
  if (end <= start) return { ok: false, error: "order" };
  if (!/^private:[A-Za-z0-9/_-]+$/.test(evidenceRef.trim())) return { ok: false, error: "evidence" };
  return { ok: true, startsAt: start.toISOString(), endsAt: end.toISOString() };
}

const errorCopy: Record<string, { en: string; ar: string }> = {
  TRANSPORT_UNCONFIGURED: { en: "An approved transport policy is still required.", ar: "ما زالت سياسة النقل المعتمدة مطلوبة." },
  INVALID_TRANSPORT_TRANSITION: { en: "This request changed. Refresh and choose an allowed step.", ar: "تغير الطلب. حدّث الصفحة واختر خطوة مسموحة." },
  CUSTODY_EVIDENCE_REQUIRED: { en: "Committed times and a custody evidence reference are required.", ar: "الأوقات الملتزم بها ومرجع دليل العهدة مطلوبان." },
  TRANSPORT_REASON_REQUIRED: { en: "A reason is required.", ar: "السبب مطلوب." },
  PROVIDER_UNAVAILABLE: { en: "The provider in the approved policy must be used.", ar: "يجب استخدام مقدم الخدمة المحدد في السياسة المعتمدة." },
  BOOKING_CLOSED: { en: "Cancelled or no-show bookings cannot receive a transport commitment.", ar: "لا يمكن الالتزام بنقل لحجز ملغي أو لم يحضر." },
  CONTACT_PERMISSION_REQUIRED: { en: "You do not have permission to open private contact details.", ar: "ليست لديك صلاحية فتح بيانات الاتصال الخاصة." },
  ROLE_FORBIDDEN: { en: "You do not have permission for transport coordination.", ar: "ليست لديك صلاحية تنسيق النقل." },
  INVALID_TRANSPORT_REQUEST: { en: "Check the booking, contact and location.", ar: "راجع الحجز وبيانات الاتصال والموقع." },
};

/** Bilingual copy for a known server error code, else null. */
export function transportErrorCopy(code: string | undefined): { en: string; ar: string } | null {
  return (code && errorCopy[code]) || null;
}

/** Splits an ISO timestamp into local YYYY-MM-DD and HH:MM for DateText, or null when invalid. */
export function splitDateTime(iso: string): { date: string; time: string } | null {
  const value = new Date(iso);
  if (Number.isNaN(value.valueOf())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`, time: `${pad(value.getHours())}:${pad(value.getMinutes())}` };
}

/** Transport list search: customer name, phone or plate (Arabic or Latin, spacing ignored). */
export function matchesTransport(parts: { customerName: string; phone: string; plate: string }, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const digits = phoneDigits(needle);
  const compact = needle.replace(/\s/g, "");
  return parts.customerName.toLowerCase().includes(needle)
    || (digits.length > 0 && phoneDigits(parts.phone).includes(digits))
    || plateMatchesQuery(parts.plate, needle)
    || parts.plate.toLowerCase().replace(/\s/g, "").includes(compact);
}
