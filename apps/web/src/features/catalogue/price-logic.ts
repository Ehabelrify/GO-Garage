import type { PackageVersion } from "@garage/domain";
import { isPublishable } from "./catalogue-logic";

export type MoneyValue = { minor: number; currency: string };

/** Seeded or advertised examples are labelled "example data, not approved policy" until the Owner confirms them. */
export function isExampleData(p: Pick<PackageVersion, "provenance" | "approval">): boolean {
  return /example/i.test(p.provenance) || /example/i.test(p.approval?.reason ?? "");
}

/** A draft that carries an Owner price edit can be published even when its own price fields are unchanged. */
export function hasPriceEdit(p: Pick<PackageVersion, "priceChange">): boolean {
  return Boolean(p.priceChange);
}

export function canPublish(p: Pick<PackageVersion, "price" | "tax" | "workAggregation" | "priceChange">): boolean {
  return hasPriceEdit(p) || isPublishable(p);
}

export type PriceRule = { key: string; ref: { id: string; version: number } };

/** Distinct approved tax rules already used by packages, so one can be picked instead of typed. */
export function taxRuleOptions(packages: PackageVersion[]): PriceRule[] {
  const map = new Map<string, PriceRule>();
  for (const pkg of packages) if (pkg.tax.state === "approved") {
    const ref = pkg.tax.value.rule;
    map.set(`${ref.id}:${ref.version}`, { key: `${ref.id}:${ref.version}`, ref });
  }
  return [...map.values()];
}

export type AggregationOption = { key: string; rule: { id: string; version: number }; mode: "sum" | "max" };

/** Distinct approved work-aggregation settings already used by packages. */
export function aggregationOptions(packages: PackageVersion[]): AggregationOption[] {
  const map = new Map<string, AggregationOption>();
  for (const pkg of packages) if (pkg.workAggregation.state === "approved") {
    const { rule, mode } = pkg.workAggregation.value;
    map.set(`${rule.id}:${rule.version}:${mode}`, { key: `${rule.id}:${rule.version}:${mode}`, rule, mode });
  }
  return [...map.values()];
}

export type PriceFormState = { price: string; tax: string; currency: string; effectiveFrom: string; reason: string; taxRuleKey: string; aggregationKey: string };

/** Starting values for the price editor: the current approved price/tax, or empty for an unpriced item. */
export function priceFormFrom(p: PackageVersion, defaultCurrency: string, today: string, minorToMajor: (minor: number, currency: string) => number): PriceFormState {
  const price = p.priceChange?.price ?? (p.price.state === "approved" ? p.price.value : null);
  const tax = p.priceChange?.tax ?? (p.tax.state === "approved" ? p.tax.value.amount : null);
  const currency = price?.currency ?? tax?.currency ?? defaultCurrency;
  const taxRule = p.priceChange?.taxRule ?? (p.tax.state === "approved" ? p.tax.value.rule : null);
  const aggregation = p.priceChange?.aggregation ?? (p.workAggregation.state === "approved" ? p.workAggregation.value : null);
  return {
    price: price ? String(minorToMajor(price.minor, currency)) : "",
    tax: tax ? String(minorToMajor(tax.minor, currency)) : "0",
    currency, effectiveFrom: today, reason: "",
    taxRuleKey: taxRule ? `${taxRule.id}:${taxRule.version}` : "",
    aggregationKey: aggregation ? `${aggregation.rule.id}:${aggregation.rule.version}:${aggregation.mode}` : "",
  };
}

/** Field errors for the price editor; empty object means valid. Messages are [en, ar]. Amounts are major-unit text. */
export function validatePriceForm(form: PriceFormState, parse: (text: string, currency: string) => number | null, today: string, supported: (code: string) => boolean): Record<string, [string, string]> {
  const errors: Record<string, [string, string]> = {};
  if (!supported(form.currency)) errors.currency = ["Choose a supported currency.", "اختر عملة مدعومة."];
  if (parse(form.price, form.currency) === null) errors.price = ["Enter a price of zero or more.", "أدخل سعراً صفراً أو أكثر."];
  if (parse(form.tax || "0", form.currency) === null) errors.tax = ["Enter tax of zero or more.", "أدخل ضريبة صفراً أو أكثر."];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.effectiveFrom) || form.effectiveFrom > today) errors.effectiveFrom = ["Choose today or an earlier date.", "اختر تاريخ اليوم أو تاريخاً سابقاً."];
  if (!form.reason.trim()) errors.reason = ["Enter a reason for the change.", "أدخل سبب التغيير."];
  if (!form.taxRuleKey) errors.taxRule = ["Choose an approved tax rule.", "اختر قاعدة ضريبة معتمدة."];
  if (!form.aggregationKey) errors.aggregation = ["Choose a work-time setting.", "اختر إعداد وقت العمل."];
  return errors;
}

export type PriceDiff = { before: MoneyValue | null; after: MoneyValue; delta: number | null; sameCurrency: boolean };

/** Old to new price for the publish confirmation; the delta is only meaningful when both use the same currency. */
export function priceDiff(before: MoneyValue | null, after: MoneyValue): PriceDiff {
  const sameCurrency = before === null || before.currency === after.currency;
  return { before, after, sameCurrency, delta: before && sameCurrency ? after.minor - before.minor : null };
}

/** Catalogue price-matrix groups: PPF grades, add-ons and the rest, by package name. */
export type PriceGroup = "ppf" | "addon" | "other";
export function priceGroup(p: Pick<PackageVersion, "kind" | "ref">): PriceGroup {
  if (/-addon-|-draft-/.test(p.ref.id) || p.kind === "standalone") return "addon";
  return /-ppf-|promo/.test(p.ref.id) ? "ppf" : "other";
}
