import { z } from "zod";
import { isSupportedCurrency, type Money, type PackagePriceChange, type PackageVersion } from "@garage/domain";

/**
 * Pure helpers for Owner price editing. A price edit is a new DRAFT package version carrying the proposed
 * price and tax in `price_change`. Publication (catalogue-service) turns it into an approved
 * catalogue-pricing policy plus a new published version; published versions are never edited in place.
 */
export const priceEditInput = z.object({
  packageId: z.string().trim().min(1),
  expectedVersion: z.number().int().positive(),
  expectedRevision: z.number().int().positive(),
  price: z.object({ minor: z.number().int().safe().nonnegative(), currency: z.string() }).strict(),
  tax: z.object({ minor: z.number().int().safe().nonnegative(), currency: z.string() }).strict(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(1).max(500),
  taxRule: z.object({ id: z.string().trim().min(1), version: z.number().int().positive() }).strict().optional(),
  aggregation: z.object({ rule: z.object({ id: z.string().trim().min(1), version: z.number().int().positive() }).strict(), mode: z.enum(["sum", "max"]) }).strict().optional(),
}).strict();
export type PriceEditInput = z.infer<typeof priceEditInput>;

export type PriceEditProblem = { code: "UNSUPPORTED_CURRENCY" | "MIXED_CURRENCY" | "EFFECTIVE_DATE_INVALID"; message: string };

/** Currency and date rules shared by the draft save and the publish step. Returns null when valid. */
export function priceEditProblem(
  input: { price: Money; tax: Money; effectiveFrom: string },
  today: string,
  previous: { effectiveThrough: string | null },
): PriceEditProblem | null {
  if (!isSupportedCurrency(input.price.currency) || !isSupportedCurrency(input.tax.currency)) {
    return { code: "UNSUPPORTED_CURRENCY", message: "Choose a currency from the supported list." };
  }
  if (input.price.currency !== input.tax.currency) {
    return { code: "MIXED_CURRENCY", message: "Price and tax must use the same currency." };
  }
  if (Number.isNaN(Date.parse(`${input.effectiveFrom}T00:00:00Z`)) || input.effectiveFrom > today) {
    return { code: "EFFECTIVE_DATE_INVALID", message: "The effective date cannot be in the future: the new price replaces the active one when published." };
  }
  if (previous.effectiveThrough && input.effectiveFrom > previous.effectiveThrough) {
    return { code: "EFFECTIVE_DATE_INVALID", message: "The effective date must not be after the package end date." };
  }
  return null;
}

export function buildPriceChange(
  input: PriceEditInput,
  previous: { price: PackageVersion["price"]; tax: PackageVersion["tax"]; workAggregation: PackageVersion["workAggregation"] },
): PackagePriceChange {
  return {
    price: { minor: input.price.minor, currency: input.price.currency },
    tax: { minor: input.tax.minor, currency: input.tax.currency },
    effectiveFrom: input.effectiveFrom,
    reason: input.reason.trim(),
    taxRule: input.taxRule ?? (previous.tax.state === "approved" ? previous.tax.value.rule : null),
    aggregation: input.aggregation ?? (previous.workAggregation.state === "approved" ? previous.workAggregation.value : null),
    previous: {
      price: previous.price.state === "approved" ? previous.price.value : null,
      tax: previous.tax.state === "approved" ? previous.tax.value.amount : null,
    },
  };
}

/** Value stored in the approved catalogue-pricing policy created at publication. */
export function pricingPolicyValue(pkg: PackageVersion, change: PackagePriceChange, service: { bayType: "clean" | "general"; bayHours: number }) {
  const first = pkg.scope[0];
  return {
    name: pkg.name,
    serviceId: first.serviceId,
    vehicleCategoryId: pkg.vehicleCategoryIds[0],
    gradeId: first.gradeVersion?.id ?? "none",
    roof: first.roof,
    price: change.price,
    tax: change.tax,
    bayType: service.bayType,
    bayHours: service.bayHours,
    exclusions: pkg.scope.flatMap((item) => item.exclusions).filter((item) => item.trim()),
  };
}

export function pricingPolicyId(packageId: string, version: number): string {
  return `catalogue-pricing:${packageId}-v${version}`;
}

