import type { ApprovalEvidence, Configured, PolicyRef } from "./commercial-policy";

export type Money = { minor: number; currency: string };
export function validateMoney(value: unknown): Money {
  if (!value || typeof value !== "object") throw new Error("Money is required.");
  const { minor, currency } = value as Partial<Money>;
  if (!Number.isSafeInteger(minor) || (minor as number) < 0 || typeof currency !== "string" || !currency.trim()) throw new Error("Money requires nonnegative safe integer minor units and a currency.");
  return { minor: minor as number, currency: currency.trim() };
}
export type VehicleSelection = { vehicleId: string; model: string; categoryId: string | null };
export type ScopeItem = { id: string; serviceId: string; gradeVersion: PolicyRef | null; areas: string[]; roof: "included" | "excluded" | "not-applicable"; addOnIds: string[]; exclusions: string[]; quantity: number };
export type WorkComponent = { id: string; serviceId: string; scopeItemIds: string[]; occupancyRule: PolicyRef };
export type BilingualName = { ar: string; en: string };
export type GradeVersion = { ref: PolicyRef; revision: number; name: BilingualName; thicknessMicrometres: number | null; provenance: string; approval: ApprovalEvidence | null; state: "draft" | "published" | "retired" };
/** Owner price edit carried by a draft until it is published. Money is in minor units. */
export type PackagePriceChange = {
  price: Money; tax: Money; effectiveFrom: string; reason: string;
  /** Approved tax rule (chosen, or kept from the previous version); required to publish. */
  taxRule: PolicyRef | null;
  /** Approved work-aggregation rule and mode (chosen, or kept from the previous version); required to publish. */
  aggregation: { rule: PolicyRef; mode: "sum" | "max" } | null;
  previous: { price: Money | null; tax: Money | null };
};
/** One row of an Owner-facing price history (names, never ids). Amounts in minor units. */
export type PackagePriceHistoryEntry = {
  version: number; state: "draft" | "published" | "retired"; price: Money | null; tax: Money | null;
  /** For a price-edit draft: the price it would replace. */
  previousPrice: Money | null; previousTax: Money | null;
  effectiveFrom: string | null; createdByName: string; createdAt: string; approvedByName: string | null; approvedAt: string | null; reason: string;
  isPriceEdit: boolean;
};
export type PackageVersion = {
  ref: PolicyRef; revision: number; kind: "package" | "standalone";
  name: BilingualName; vehicleCategoryIds: string[]; vehicleModels: string[];
  branchIds: string[]; effectiveFrom: string | null; effectiveThrough: string | null;
  scope: ScopeItem[]; work: WorkComponent[];
  price: Configured<Money>; tax: Configured<{ rule: PolicyRef; amount: Money | null }>;
  workAggregation: Configured<{ rule: PolicyRef; mode: "sum" | "max" }>;
  provenance: string; approval: ApprovalEvidence | null;
  state: "draft" | "published" | "retired";
  /** Present only on a price-edit draft. */
  priceChange?: PackagePriceChange | null;
};
