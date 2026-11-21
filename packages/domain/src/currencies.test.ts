import { describe, expect, it } from "vitest";
import {
  CURRENCIES, DEFAULT_CURRENCY, currencyExponent, findMixedCurrency, formatCurrencyAmount, isSupportedCurrency, resolveCurrency, supportedCurrencies,
} from "./currencies";

describe("currency list", () => {
  it("supports EGP, SAR and USD in selector order", () => {
    expect(supportedCurrencies().map((c) => c.code)).toEqual(["EGP", "SAR", "USD"]);
    expect(new Set(CURRENCIES.map((c) => c.code)).size).toBe(CURRENCIES.length);
  });
  it("validates codes against the list only", () => {
    expect(isSupportedCurrency("SAR")).toBe(true);
    expect(isSupportedCurrency("sar")).toBe(false);
    expect(isSupportedCurrency("EUR")).toBe(false);
    expect(isSupportedCurrency(undefined)).toBe(false);
  });
  it("falls back to the default when unsupported", () => {
    expect(resolveCurrency(null)).toBe(DEFAULT_CURRENCY);
    expect(resolveCurrency("EUR", "USD")).toBe("USD");
    expect(resolveCurrency("SAR")).toBe("SAR");
    expect(currencyExponent("USD")).toBe(2);
  });
  it("flags a line in another currency and ignores inheriting lines", () => {
    expect(findMixedCurrency([{}, { currency: "EGP" }, { currency: null }], "EGP")).toBe(-1);
    expect(findMixedCurrency([{ currency: "EGP" }, { currency: "USD" }], "EGP")).toBe(1);
  });
  it("formats with the currency symbol", () => {
    expect(formatCurrencyAmount(1250, "EGP", "en")).toBe("E£ 1,250.00");
    expect(formatCurrencyAmount(1250, "USD", "en")).toBe("$ 1,250.00");
    expect(formatCurrencyAmount(1250, "SAR", "ar")).toBe("1,250.00 ر.س");
    expect(formatCurrencyAmount(null, "EGP", "en")).toBe("—");
  });
});
