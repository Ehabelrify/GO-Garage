import type { BenefitEntitlement, BenefitLimit, Configured, Locale } from "@garage/domain";

export type Bilingual = { ar: string; en: string };

export const activationLabels: Record<string, Bilingual> = {
  accepted: { en: "When the quote is accepted", ar: "عند قبول عرض السعر" },
  delivered: { en: "When the vehicle is delivered", ar: "عند تسليم المركبة" },
};
export const transferLabels: Record<string, Bilingual> = {
  "same-customer-vehicle": { en: "Stays with this customer and vehicle", ar: "تبقى مع هذا العميل وهذه المركبة" },
  "review-required": { en: "A manager reviews any transfer", ar: "يراجع المدير أي نقل" },
};
export const cancellationLabels: Record<string, Bilingual> = {
  retain: { en: "Kept if the order is cancelled", ar: "تبقى عند إلغاء الطلب" },
  cancel: { en: "Cancelled with the order", ar: "تُلغى مع الطلب" },
  "review-required": { en: "A manager reviews cancellations", ar: "يراجع المدير الإلغاء" },
};

export type ExpiryRule = { kind: string; expiresOn?: string };

export function expiryText(rule: ExpiryRule | undefined, lang: Locale, formatDate: (iso: string) => string): string {
  if (!rule || rule.kind === "none") return lang === "ar" ? "لا تنتهي" : "Does not expire";
  if (rule.kind === "date" && rule.expiresOn) return (lang === "ar" ? "تنتهي في " : "Expires ") + formatDate(rule.expiresOn);
  return lang === "ar" ? "تحددها السياسة" : "Set by the benefit rules";
}

const intervalLabel = (interval: "calendar-month" | "calendar-year", lang: Locale) =>
  interval === "calendar-month" ? (lang === "ar" ? "شهرياً" : "per month") : (lang === "ar" ? "سنوياً" : "per year");

/** Human sentence for an approved benefit limit (never JSON). */
export function limitText(limit: Configured<BenefitLimit>, lang: Locale): string {
  if (limit.state !== "approved") return lang === "ar" ? "الحد غير معتمد بعد" : "Limit not approved yet";
  const value = limit.value;
  if (value.kind === "quantity") return lang === "ar" ? `${value.quantity} استخدام إجمالاً` : `${value.quantity} use${value.quantity === 1 ? "" : "s"} in total`;
  if (value.kind === "recurring") return lang === "ar" ? `${value.quantity} ${intervalLabel(value.interval, lang)}` : `${value.quantity} ${intervalLabel(value.interval, lang)}`;
  return lang === "ar" ? "تحدده سياسة الأهلية" : "Decided by the eligibility rule";
}

/** Total uses for a fixed-quantity limit, otherwise null. */
export const totalUses = (limit: Configured<BenefitLimit>): number | null =>
  limit.state === "approved" && limit.value.kind === "quantity" ? limit.value.quantity : null;

/** Name shown for a benefit: the policy id tail, humanised ("seed-free-wash" -> "Free wash"). */
export function benefitName(benefit: { id: string }, lang: Locale): string {
  const tail = benefit.id.includes(":") ? benefit.id.slice(benefit.id.indexOf(":") + 1) : benefit.id;
  const cleaned = tail.replace(/^seed[-_]/, "").replace(/[-_]+/g, " ").trim();
  const text = cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "";
  return text || (lang === "ar" ? "منفعة" : "Benefit");
}

export interface BenefitFilter { query: string; status: string }

export function filterBenefits(rows: BenefitEntitlement[], filter: BenefitFilter, haystack: (row: BenefitEntitlement) => string): BenefitEntitlement[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter((row) => (filter.status === "all" || row.status === filter.status) && (!query || haystack(row).toLowerCase().includes(query)));
}

/** Eligibility reason codes and sentences from the server, reduced to something readable. */
export function reasonText(reason: string, lang: Locale): string {
  const trimmed = reason.trim();
  if (!trimmed) return lang === "ar" ? "غير مؤهل" : "Not eligible";
  return /^[a-z0-9_-]+$/i.test(trimmed) ? trimmed.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase()) : trimmed;
}
