import type { Locale } from "@garage/domain";

const numberLocale = (lang: Locale) => (lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB");

/** Number of minor-unit digits for a currency (EGP = 2). Falls back to 2. */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Convert integer minor units (piasters) to major units. Never shown to users. */
export function minorToMajor(minor: number, currency = "EGP"): number {
  return minor / 10 ** currencyDigits(currency);
}

/** Parse a typed major-unit amount ("1,250.50") to integer minor units; null when invalid. */
export function majorToMinor(input: string, currency = "EGP"): number | null {
  const cleaned = input.replace(/[,\s]/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 10 ** currencyDigits(currency)) : null;
}

/**
 * Format an amount stored in minor units as a human price, e.g. "EGP 1,250".
 * Whole amounts drop the fraction. Returns an em dash for null/undefined/NaN.
 */
export function formatMoney(minor: number | null | undefined, currency = "EGP", lang: Locale = "en"): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return "—";
  const major = minorToMajor(minor, currency);
  const whole = Number.isInteger(major);
  return new Intl.NumberFormat(numberLocale(lang), {
    style: "currency",
    currency,
    currencyDisplay: lang === "ar" ? "symbol" : "code",
    minimumFractionDigits: whole ? 0 : currencyDigits(currency),
    maximumFractionDigits: currencyDigits(currency),
  }).format(major);
}
