import type { ApprovalEvidence, Configured, PolicyRef } from "./commercial-policy";

export type Money = { minor: number; currency: string };
export function validateMoney(value: unknown): Money {
  if (!value || typeof value !== "object") throw new Error("Money is required.");
  const { minor, currency } = value as Partial<Money>;
  if (!Number.isSafeInteger(minor) || (minor as number) < 0 || typeof currency !== "string" || !currency.trim()) throw new Error("Money requires nonnegative safe integer minor units and a currency.");
  return { minor: minor as number, currency: currency.trim() };
}
export type VehicleSelection = { vehicleId: string; model: string; categoryId: string | null };
/** Placeholder service id carried by the scope item of a catalogue product (a product is not a workshop service and never needs bay time). */
export const PRODUCT_SERVICE_ID = "product";
export type ScopeItem = {
  id: string; serviceId: string; gradeVersion: PolicyRef | null; areas: string[]; roof: "included" | "excluded" | "not-applicable"; addOnIds: string[]; exclusions: string[]; quantity: number;
  /** Set only on a product line: the stable catalogue product id (stock and per-branch availability attach to this id later). */
  productId?: string | null;
  /** Display name of a product line, so quotes and invoices need no extra lookup. */
  label?: BilingualName | null;
};
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
  ref: PolicyRef; revision: number; kind: "package" | "standalone" | "product";
  name: BilingualName; vehicleCategoryIds: string[]; vehicleModels: string[];
  branchIds: string[]; effectiveFrom: string | null; effectiveThrough: string | null;
  scope: ScopeItem[]; work: WorkComponent[];
  price: Configured<Money>; tax: Configured<{ rule: PolicyRef; amount: Money | null }>;
  workAggregation: Configured<{ rule: PolicyRef; mode: "sum" | "max" }>;
  provenance: string; approval: ApprovalEvidence | null;
  state: "draft" | "published" | "retired";
  /** Present only on a price-edit draft. */
  priceChange?: PackagePriceChange | null;
  /** Products only: bilingual category (for example accessories, parts, care products). A product has no work (bay time). */
  productCategory?: BilingualName | null;
};

/** Kind label shown by quick intake: stand-alone catalogue services, packages and products share one list. */
export type IntakeItemKind = "service" | "package" | "product";
/** One row of GET /api/catalogue/intake-items. Money is in minor units; a missing price is null (never guessed). */
export type IntakeCatalogueItem = {
  id: { packageId: string; version: number };
  kind: IntakeItemKind;
  name: BilingualName;
  category?: BilingualName;
  price: Money | null;
  tax?: Money | null;
  requiresVehicle: boolean;
  /** True when the item needs workshop bay time. Always false for products. */
  bayWork: boolean;
};
