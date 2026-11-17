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
export type PackageVersion = {
  ref: PolicyRef; revision: number; kind: "package" | "standalone";
  name: BilingualName; vehicleCategoryIds: string[]; vehicleModels: string[];
  branchIds: string[]; effectiveFrom: string | null; effectiveThrough: string | null;
  scope: ScopeItem[]; work: WorkComponent[];
  price: Configured<Money>; tax: Configured<{ rule: PolicyRef; amount: Money | null }>;
  workAggregation: Configured<{ rule: PolicyRef; mode: "sum" | "max" }>;
  provenance: string; approval: ApprovalEvidence | null;
  state: "draft" | "published" | "retired";
};
