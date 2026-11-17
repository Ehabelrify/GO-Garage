import type { Configured, PolicyRef } from "./commercial-policy";
import type { QuoteVersionRef } from "./quotes";
import type { DateOnly } from "./types";

export type BenefitLimit =
  | { kind: "quantity"; quantity: number }
  | { kind: "recurring"; quantity: number; interval: "calendar-month" | "calendar-year"; startsOn: DateOnly; endsOn: DateOnly | null; eligibilityPolicy: PolicyRef }
  | { kind: "policy-evaluated"; eligibilityPolicy: PolicyRef };
export type BenefitEligibilityResult =
  | { state: "eligible"; evidenceRef: string }
  | { state: "ineligible" | "unconfigured" | "review-required"; reasons: string[] };
export type BenefitEntitlement = {
  id: string; sourceQuote: QuoteVersionRef; benefit: PolicyRef; customerId: string;
  vehicleId: string; branchIds: string[]; limit: Configured<BenefitLimit>;
  responsibleTeamId: string | null; status: "active" | "cancelled" | "exhausted";
  revision: number;
};
