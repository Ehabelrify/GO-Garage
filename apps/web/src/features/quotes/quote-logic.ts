import type { Locale, Money, PackageVersion, PolicyRef, QuoteFollowup, QuoteLine, QuoteRevision, ScopeItem } from "@garage/domain";

import { policyDisplayName } from "./policy-names";

export type QuoteRow = QuoteRevision & { followup: QuoteFollowup };
export type Bilingual = { ar: string; en: string };

export const protectedRefPattern = /^private:[A-Za-z0-9/_-]+$/;
export const isProtectedRef = (value: string) => protectedRefPattern.test(value.trim());

/** Keeps the highest revision of each quote (list order preserved). */
export function latestPerQuote<T extends { ref: { quoteId: string; revision: number } }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const current = best.get(row.ref.quoteId);
    if (!current || row.ref.revision > current.ref.revision) best.set(row.ref.quoteId, row);
  }
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of rows) {
    const id = row.ref.quoteId;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(best.get(id)!);
  }
  return result;
}

export const lineGross = (line: QuoteLine) => line.unitPrice.minor * line.quantity;
export const lineTotal = (line: QuoteLine) => lineGross(line) - line.discount.minor + (line.tax?.minor ?? 0);

export interface QuoteSummary { currency: string; subtotal: number; discount: number; tax: number; total: number }

/** Same arithmetic the server uses for the exact total (gross - discount + tax). */
export function summariseLines(lines: QuoteLine[], fallbackCurrency = "EGP"): QuoteSummary {
  const currency = lines[0]?.unitPrice.currency || fallbackCurrency;
  let subtotal = 0, discount = 0, tax = 0;
  for (const line of lines) {
    subtotal += lineGross(line);
    discount += line.discount.minor;
    tax += line.tax?.minor ?? 0;
  }
  return { currency, subtotal, discount, tax, total: subtotal - discount + tax };
}

export const approvedPrice = (pkg: PackageVersion): Money | null => (pkg.price.state === "approved" ? pkg.price.value : null);
export const approvedTax = (pkg: PackageVersion): Money | null => (pkg.tax.state === "approved" ? pkg.tax.value.amount : null);

/**
 * Turns a published package into quote lines that match the approved catalogue price exactly.
 * The whole price sits on the first single-quantity scope item; other items carry zero.
 * Tax is null when the package has no approved tax amount (drafts only; the server rejects an offer).
 * Returns null when the package has no approved price or no single-quantity item to carry it.
 */
export function buildCatalogueLines(pkg: PackageVersion, newId: () => string): QuoteLine[] | null {
  const price = approvedPrice(pkg);
  const tax = approvedTax(pkg);
  if (!price || pkg.scope.length === 0) return null;
  const carrier = pkg.scope.findIndex((item) => item.quantity === 1);
  if (carrier < 0) return null;
  return pkg.scope.map((item, index) => ({
    id: newId(),
    scopeItemId: item.id,
    quantity: item.quantity,
    unitPrice: index === carrier ? { ...price } : { minor: 0, currency: price.currency },
    discount: { minor: 0, currency: price.currency },
    tax: !tax ? null : index === carrier ? { ...tax } : { minor: 0, currency: tax.currency },
  }));
}

/** An offer needs an approved price and an approved tax amount on the package. */
export const isOfferable = (pkg: PackageVersion) => approvedPrice(pkg) !== null && approvedTax(pkg) !== null;

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

/** Default validity: 14 days, never beyond what the approved acceptance policy allows. */
export function defaultValidThrough(today: string, validityDays: number | null): string {
  return addDays(today, validityDays && validityDays > 0 ? Math.min(14, validityDays) : 14);
}

export function validThroughProblem(value: string | null, today: string, validityDays: number | null): "missing" | "past" | "too-far" | null {
  if (!value) return "missing";
  if (value < today) return "past";
  if (validityDays && value > addDays(today, validityDays)) return "too-far";
  return null;
}

/** Readable, localised name for a policy reference: "promotion-qualification:seed-ultimate-club" -> "Ultimate club". Never the raw id. */
export function policyLabel(ref: PolicyRef | string | null | undefined, name?: Bilingual | null, lang: Locale = "en"): string {
  if (name) return (lang === "ar" ? name.ar : name.en) || name.en || name.ar;
  const id = typeof ref === "string" ? ref : ref?.id ?? "";
  return policyDisplayName(id, lang) || (lang === "ar" ? "غير محدد" : "Not set");
}

export const roofLabels: Record<ScopeItem["roof"], Bilingual> = {
  included: { en: "Roof included", ar: "شامل السقف" },
  excluded: { en: "Roof not included", ar: "بدون السقف" },
  "not-applicable": { en: "No roof option", ar: "لا ينطبق على السقف" },
};

export const followupLabels: Record<QuoteFollowup["status"], Bilingual> = {
  requested: { en: "Waiting for us", ar: "بانتظار الرد" },
  preparing: { en: "Preparing", ar: "قيد التجهيز" },
  answered: { en: "Answered", ar: "تم الرد" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
};

export const priceOriginLabels: Record<"catalogue" | "manual" | "inspection", Bilingual> = {
  catalogue: { en: "Catalogue price", ar: "سعر الكتالوج" },
  manual: { en: "Custom price", ar: "سعر مخصص" },
  inspection: { en: "Price after inspection", ar: "سعر بعد الفحص" },
};

export interface QuoteFilter { query: string; status: string; followup: string }

/** Filters quote rows. `haystack` supplies the searchable text (customer, plate...) for a row. */
export function filterQuotes(rows: QuoteRow[], filter: QuoteFilter, haystack: (row: QuoteRow) => string): QuoteRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.status !== "all" && row.state !== filter.status) return false;
    if (filter.followup !== "all" && row.followup.status !== filter.followup) return false;
    return !query || haystack(row).toLowerCase().includes(query);
  });
}

/** Splits "a, b\nc" into trimmed non-empty parts (areas and exclusions). */
export const splitList = (value: string) => value.split(/[\n,،]/).map((item) => item.trim()).filter(Boolean);

export function isExpired(row: Pick<QuoteRevision, "state" | "validThrough">, today = todayIso()): boolean {
  return row.state === "offered" && !!row.validThrough && row.validThrough < today;
}

/** Whole days from `from` to `to` (YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

const EXPIRED_BASE = 100_000;

/**
 * Sort key that puts upcoming dates first (soonest at the top), then past dates (most recent first).
 * null when there is no date (DataTable sorts empty values last).
 */
export function upcomingFirstKey(date: string | null | undefined, today = todayIso()): number | null {
  if (!date) return null;
  const days = daysBetween(today, date);
  return days >= 0 ? days : EXPIRED_BASE - days;
}

/** Quotes list default order: offered quotes that are about to expire, then expired offers, then everything else. */
export function quoteAttentionKey(row: Pick<QuoteRevision, "state" | "validThrough">, today = todayIso()): number {
  if (row.state !== "offered") return 1_000_000;
  return upcomingFirstKey(row.validThrough, today) ?? 500_000;
}

/** A follow-up somebody still has to act on (shown as a column only when at least one quote has it). */
export const hasOpenFollowup = (row: Pick<QuoteRow, "state" | "followup">) =>
  row.state === "offered" && (row.followup.status === "requested" || row.followup.status === "preparing");

/** "Expires today" / "Expires tomorrow" / "Expires in 3 days" for dates 0 to `window` days away, otherwise null. */
export function expiresSoonLabel(date: string | null | undefined, lang: Locale, today = todayIso(), window = 7): string | null {
  if (!date) return null;
  const days = daysBetween(today, date);
  if (days < 0 || days > window) return null;
  if (lang === "ar") return days === 0 ? "ينتهي اليوم" : days === 1 ? "ينتهي غداً" : days === 2 ? "ينتهي بعد يومين" : `ينتهي بعد ${days} أيام`;
  return days === 0 ? "Expires today" : days === 1 ? "Expires tomorrow" : `Expires in ${days} days`;
}
