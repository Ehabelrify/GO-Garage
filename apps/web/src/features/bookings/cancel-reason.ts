export const cancelCategories = [
  { value: "customer-request", en: "Customer request", ar: "طلب العميل" },
  { value: "no-show", en: "No-show", ar: "لم يحضر" },
  { value: "duplicate", en: "Duplicate", ar: "حجز مكرر" },
  { value: "capacity", en: "Capacity", ar: "السعة" },
  { value: "other", en: "Other", ar: "أخرى" },
] as const;
export type CancelCategory = (typeof cancelCategories)[number]["value"];

const labels: Record<CancelCategory, string> = { "customer-request": "Customer request", "no-show": "No-show", duplicate: "Duplicate", capacity: "Capacity", other: "Other" };

/** Server stores one reason string; the category leads it so reports can group by prefix. */
export function combineCancelReason(category: CancelCategory, text: string): string {
  return `${labels[category]}: ${text.trim()}`;
}
export const cancelReasonReady = (category: string, text: string) => category in labels && text.trim().length >= 3;
