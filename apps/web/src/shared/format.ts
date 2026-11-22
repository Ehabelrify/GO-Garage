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

/* ---------------------------------------------------------------------------------------------
 * Amount formatting (UI_PATTERNS.md "Numbers"). Pure functions; the Amount component renders them.
 * Latin digits in both locales, real minus U+2212 directly before the number, no mixed decimals per variant.
 * ------------------------------------------------------------------------------------------- */

export type AmountVariant = "kpi" | "table" | "detail";

export interface AmountOptions {
  currency?: string;
  lang?: Locale;
  /** kpi: whole units, compact when large. table/detail: 2 decimals always. */
  variant?: AmountVariant;
  /** Viewer preference "Show full precision": exact fractions everywhere, never compact. */
  fullPrecision?: boolean;
}

export interface AmountParts {
  /** "-" is rendered with the real minus sign. */
  negative: boolean;
  number: string;
  /** Currency label (EGP / ج.م.). */
  currency: string;
  /** Display text in the language's order (en: "EGP 1,250.00", ar: "1,250.00 ج.م."). */
  text: string;
  /** Exact value with fractions, for title and aria-label when the text is compact. */
  full: string;
  compact: boolean;
}

export const MINUS = String.fromCodePoint(0x2212);
const COMPACT_THRESHOLD_MAJOR = 100_000;

const latin = (minimumFractionDigits: number, maximumFractionDigits = minimumFractionDigits) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits, maximumFractionDigits, useGrouping: true });

export function currencyLabel(currency: string, lang: Locale): string {
  return lang === "ar" && currency === "EGP" ? "ج.م." : currency;
}

function compactNumber(absMajor: number, lang: Locale): string {
  const trim = (value: number) => latin(0, 1).format(value);
  if (absMajor >= 999_950) { const m = trim(absMajor / 1_000_000); return lang === "ar" ? `${m} م` : `${m}M`; }
  const k = Math.round(absMajor / 1000);
  return k >= 1000 ? (lang === "ar" ? "1 م" : "1M") : lang === "ar" ? `${k} ألف` : `${k}K`;
}

const place = (negative: boolean, number: string, label: string, lang: Locale) => {
  const signed = `${negative ? MINUS : ""}${number}`;
  return lang === "ar" ? `${signed} ${label}` : `${label} ${signed}`;
};

/** Format minor units per the numeric rule. Returns null for null/undefined/NaN (render an em dash). */
export function formatAmount(minor: number | null | undefined, options: AmountOptions = {}): AmountParts | null {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return null;
  const { currency = "EGP", lang = "en", variant = "table", fullPrecision = false } = options;
  const digits = currencyDigits(currency);
  const major = minorToMajor(minor, currency);
  const abs = Math.abs(major);
  const label = currencyLabel(currency, lang);
  // "-0.00" never shows: judge sign after rounding to the displayed precision.
  const fullNumber = latin(digits).format(abs);
  const negative = major < 0 && Number(fullNumber.replace(/,/g, "")) !== 0;
  const full = place(negative, fullNumber, label, lang);
  if (fullPrecision || variant !== "kpi") return { negative, number: fullNumber, currency: label, text: full, full, compact: false };
  if (abs >= COMPACT_THRESHOLD_MAJOR) {
    const number = compactNumber(abs, lang);
    return { negative, number, currency: label, text: place(negative, number, label, lang), full, compact: true };
  }
  const whole = latin(0).format(abs);
  const wholeNegative = major < 0 && Number(whole.replace(/,/g, "")) !== 0;
  return { negative: wholeNegative, number: whole, currency: label, text: place(wholeNegative, whole, label, lang), full, compact: false };
}

export type DeltaUnit = "percent" | "number" | "minor";

export interface DeltaOptions {
  unit?: DeltaUnit;
  lang?: Locale;
  currency?: string;
  /** Fraction digits for percent/number (default 1 for percent, 0 for number). */
  digits?: number;
}

/** One string for sign + number + unit, always built in logical LTR order ("+12.4%", "−219,224.80 EGP" style). */
export function formatDelta(value: number | null | undefined, options: DeltaOptions = {}): { text: string; direction: "up" | "down" | "flat" } | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const { unit = "percent", lang = "en", currency = "EGP" } = options;
  let body: string;
  let magnitude: number;
  if (unit === "minor") {
    const parts = formatAmount(Math.abs(value), { currency, lang, variant: "table" });
    body = parts?.text ?? "";
    magnitude = Math.abs(minorToMajor(value, currency));
  } else {
    const digits = options.digits ?? (unit === "percent" ? 1 : 0);
    body = `${latin(digits).format(Math.abs(value))}${unit === "percent" ? "%" : ""}`;
    magnitude = Number(latin(digits).format(Math.abs(value)).replace(/,/g, ""));
  }
  if (magnitude === 0) return { text: body, direction: "flat" };
  return value > 0 ? { text: `+${body}`, direction: "up" } : { text: `${MINUS}${body}`, direction: "down" };
}

/** Egyptian mobile/landline display: "+20 122 000 1046". Other numbers are returned trimmed. */
export function formatPhone(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/[^\d+]/g, "").replace(/^00/, "+");
  const match = /^(?:\+20|20|0)(1\d{2})(\d{3})(\d{4})$/.exec(digits);
  return match ? `+20 ${match[1]} ${match[2]} ${match[3]}` : raw;
}
