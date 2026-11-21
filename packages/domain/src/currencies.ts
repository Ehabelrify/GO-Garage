/**
 * Central currency list. Adding a currency later is a one-line change: append an entry here.
 * Server validation, selectors and display all read from this list.
 */
export interface CurrencyDefinition {
  /** ISO 4217 code. */
  code: string;
  name: { en: string; ar: string };
  /** Display symbol per language. */
  symbol: { en: string; ar: string };
  /** Number of minor-unit digits (2 means 1 unit = 100 minor units). */
  minorUnitExponent: number;
  /** Position in selectors (ascending). */
  order: number;
}

export const CURRENCIES: readonly CurrencyDefinition[] = [
  { code: "EGP", name: { en: "Egyptian pound", ar: "جنيه مصري" }, symbol: { en: "E£", ar: "ج.م" }, minorUnitExponent: 2, order: 1 },
  { code: "SAR", name: { en: "Saudi riyal", ar: "ريال سعودي" }, symbol: { en: "SAR", ar: "ر.س" }, minorUnitExponent: 2, order: 2 },
  { code: "USD", name: { en: "US dollar", ar: "دولار أمريكي" }, symbol: { en: "$", ar: "$" }, minorUnitExponent: 2, order: 3 },
];

/** Used when no policy or definition configures a currency. */
export const DEFAULT_CURRENCY = "EGP";

/** The list in selector order. */
export function supportedCurrencies(): CurrencyDefinition[] {
  return [...CURRENCIES].sort((a, b) => a.order - b.order);
}

export function currencyDefinition(code: string | null | undefined): CurrencyDefinition | undefined {
  return code ? CURRENCIES.find((currency) => currency.code === code) : undefined;
}

export function isSupportedCurrency(code: unknown): code is string {
  return typeof code === "string" && currencyDefinition(code) !== undefined;
}

export function currencyExponent(code: string | null | undefined, fallback = 2): number {
  return currencyDefinition(code)?.minorUnitExponent ?? fallback;
}

/** The code when supported, otherwise the fallback (a supported code, default EGP). */
export function resolveCurrency(code: string | null | undefined, fallback: string = DEFAULT_CURRENCY): string {
  return isSupportedCurrency(code) ? code : isSupportedCurrency(fallback) ? fallback : DEFAULT_CURRENCY;
}

/** Index of the first line whose own currency differs from the expected one, or -1. Lines without a currency inherit it. */
export function findMixedCurrency(lines: ReadonlyArray<{ currency?: string | null }>, expected: string): number {
  return lines.findIndex((line) => line.currency !== undefined && line.currency !== null && line.currency !== expected);
}

/** Major-unit amount with the currency symbol, e.g. "E£ 1,250.00" / "1,250.00 ج.م". Em dash when there is no amount. */
export function formatCurrencyAmount(major: number | null | undefined, code: string | null | undefined, lang: "ar" | "en"): string {
  if (major === null || major === undefined || !Number.isFinite(major)) return "—";
  const definition = currencyDefinition(code);
  const digits = definition?.minorUnitExponent ?? 2;
  const number = new Intl.NumberFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(major);
  const symbol = definition ? definition.symbol[lang] : code ?? "";
  return !symbol ? number : lang === "ar" ? `${number} ${symbol}` : `${symbol} ${number}`;
}
