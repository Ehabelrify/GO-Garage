import type { Money } from "./catalogue";
import type { PolicyRef } from "./commercial-policy";

export type QualificationEvidence = { kind: "warranty-reference" | "membership-verification" | "grouped-vehicles"; referenceIds: string[]; verifiedBy: string | null; verifiedAt: string | null };
export type PromotionAllocation = { id: string; promotion: PolicyRef; qualificationId: string; beneficiaryId: string; vehicleId: string; discount: Money | null; benefitVersion: PolicyRef | null; units: number; status: "reserved" | "consumed" | "reversed" };
export type EligibilityResult =
  | { state: "eligible"; qualificationId: string; criteria: string[] }
  | { state: "review-required" | "unconfigured"; reasons: string[]; criteria: string[] };
export type PromotionRule = {
  promotionId: string;
  evidenceKinds: QualificationEvidence["kind"][];
  evidenceVerification: { required: true; authorizedRoles: Array<"owner" | "branch-manager">; expiresAfterDays: number | null };
  maximumUnits: number;
  recipient: { kind: "customer" | "referred-customer"; transferWarranty: false };
  stackability: { allowed: boolean; permittedPromotionIds: string[] };
  grouping: { minimumVehicles: number; maximumVehicles: number; timing: "same-quote" | "same-booking" | "accepted-quote-group"; timingWindowHours: number };
  discountAllocation: { kind: "equal-remainder-by-vehicle" | "per-vehicle-fixed"; total: Money; perVehicle: Money | null };
  exceptionAuthority: { roles: Array<"owner" | "branch-manager">; requiresReason: true; requiresEvidence: true };
  beneficiaryRule: { ar: string; en: string };
};
