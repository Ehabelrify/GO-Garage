import type { Configured } from "./commercial-policy";
import type { EligibilityResult } from "./qualification";
import type { DateOnly } from "./types";
import { warrantyExpiryDate } from "./rules";

export interface LifetimeDefinition {
  subject: "purchaser" | "vehicle" | "ownership" | "product" | "other";
  subjectDefinition: string;
  terminationConditions: string;
  transferRule: string;
  maintenanceConditions: string;
  issuer: string;
  remedy: string;
  publicWording: { ar: string; en: string };
}
export type WarrantyTerm =
  | { kind: "fixed"; durationMonths: number }
  | { kind: "lifetime"; definition: Configured<LifetimeDefinition> };
export type CoveragePeriod =
  | { kind: "fixed"; startDate: DateOnly; expiresOn: DateOnly }
  | { kind: "lifetime"; startDate: DateOnly; expiresOn: null; definition: LifetimeDefinition; terminatedOn: DateOnly | null };

export function completeLifetimeDefinition(value: unknown): value is LifetimeDefinition {
  if (!value || typeof value !== "object") return false;
  const definition = value as Partial<LifetimeDefinition>;
  return ["purchaser", "vehicle", "ownership", "product", "other"].includes(definition.subject ?? "") &&
    [definition.subjectDefinition, definition.terminationConditions, definition.transferRule,
      definition.maintenanceConditions, definition.issuer, definition.remedy,
      definition.publicWording?.ar, definition.publicWording?.en]
      .every((part) => typeof part === "string" && part.trim().length > 0);
}

export function buildCoveragePeriod(start: DateOnly, term: WarrantyTerm): CoveragePeriod {
  if (term.kind === "fixed") return { kind: "fixed", startDate: start, expiresOn: warrantyExpiryDate(start, term.durationMonths) };
  if (term.definition.state !== "approved" || !completeLifetimeDefinition(term.definition.value) ||
      !term.definition.policy?.id?.trim() || !Number.isInteger(term.definition.policy.version) || term.definition.policy.version < 1 ||
      ![term.definition.approval?.approvedBy, term.definition.approval?.approvedAt,
        term.definition.approval?.evidenceRef, term.definition.approval?.reason]
        .every((part) => typeof part === "string" && part.trim().length > 0)) {
    throw new RangeError("An approved complete lifetime definition is required before issuance.");
  }
  return { kind: "lifetime", startDate: start, expiresOn: null, definition: term.definition.value, terminatedOn: null };
}

export function coverageStatus(period: CoveragePeriod, recordStatus: "active" | "void", today: DateOnly): "active" | "expired" | "terminated" | "void" {
  if (recordStatus === "void") return "void";
  if (period.kind === "lifetime") return period.terminatedOn && period.terminatedOn <= today ? "terminated" : "active";
  return period.expiresOn < today ? "expired" : "active";
}

export function evaluateClaimIntake(period: CoveragePeriod, status: "active" | "void", today: DateOnly, eligibility: EligibilityResult): EligibilityResult {
  const coverage = coverageStatus(period, status, today);
  if (coverage !== "active") return { state: "review-required", reasons: [`Coverage is ${coverage}.`], criteria: [] };
  if (period.kind === "lifetime" || eligibility.state !== "eligible") {
    return { state: "review-required", reasons: eligibility.state === "eligible" ? ["Lifetime conditions require human review."] : eligibility.reasons, criteria: eligibility.criteria };
  }
  return eligibility;
}
