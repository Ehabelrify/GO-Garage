import type { BenefitEntitlement, BenefitLimit, Configured, Locale } from "@garage/domain";
import { policyDisplayName } from "../quotes/policy-names";

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

/** Name shown for a benefit, localised and humanised ("seed-vip-transport" -> "VIP transport" / Arabic name). */
export function benefitName(benefit: { id: string }, lang: Locale): string {
  return policyDisplayName(benefit.id, lang) || (lang === "ar" ? "منفعة" : "Benefit");
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

/** Short allowance for chips and cells: "2 uses", "1 per month". */
export function shortLimitText(limit: Configured<BenefitLimit>, lang: Locale): string {
  if (limit.state !== "approved") return lang === "ar" ? "غير معتمد" : "Not approved";
  const value = limit.value;
  if (value.kind === "quantity") return lang === "ar" ? (value.quantity === 1 ? "استخدام واحد" : `${value.quantity} استخدامات`) : `${value.quantity} use${value.quantity === 1 ? "" : "s"}`;
  if (value.kind === "recurring") return `${value.quantity} ${intervalLabel(value.interval, lang)}`;
  return lang === "ar" ? "حسب السياسة" : "Per rule";
}

/** "1 of 2 used, 1 left" for fixed quantities; null when the total is not a fixed number. */
export function usageText(limit: Configured<BenefitLimit>, used: number, lang: Locale): string | null {
  const total = totalUses(limit);
  if (total === null) return null;
  const left = Math.max(0, total - used);
  return lang === "ar" ? `${used} من ${total} مستخدم، المتبقي ${left}` : `${used} of ${total} used, ${left} left`;
}

export interface BenefitGroup { key: string; customerId: string; vehicleId: string; items: BenefitEntitlement[] }

/** One row per customer and vehicle with all of their benefits (active first), instead of the same customer repeated. */
export function groupBenefits(rows: BenefitEntitlement[]): BenefitGroup[] {
  const groups = new Map<string, BenefitGroup>();
  for (const row of rows) {
    const key = `${row.customerId}:${row.vehicleId}`;
    const group = groups.get(key) ?? { key, customerId: row.customerId, vehicleId: row.vehicleId, items: [] };
    group.items.push(row);
    groups.set(key, group);
  }
  const rank = (status: BenefitEntitlement["status"]) => (status === "active" ? 0 : status === "exhausted" ? 1 : 2);
  return [...groups.values()].map((group) => ({ ...group, items: [...group.items].sort((a, b) => rank(a.status) - rank(b.status)) }));
}

/** Worst-to-best group status for sorting and the status filter: any active benefit makes the group active. */
export const groupStatus = (group: BenefitGroup): BenefitEntitlement["status"] =>
  group.items.some((item) => item.status === "active") ? "active" : group.items.some((item) => item.status === "exhausted") ? "exhausted" : "cancelled";
