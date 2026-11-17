import type { WarrantyClaimStatus } from "@garage/domain";

export interface AutomaticWarrantyPolicyCandidate {
  policy_id: string;
  version: number;
  duration_months: number | null;
  coverage_kind?: "fixed" | "lifetime";
  eligible_service_ids: string[];
  auto_issue: boolean;
  status: string;
  start_rule: string;
}

export function selectAutomaticWarrantyPolicy<T extends AutomaticWarrantyPolicyCandidate>(
  policies: readonly T[],
  serviceId: string,
) {
  const matches = policies.filter((policy) =>
    policy.status === "published" &&
    policy.auto_issue &&
    policy.start_rule === "job-delivery" &&
    policy.eligible_service_ids.includes(serviceId),
  );

  if (matches.length > 1) return { error: "overlapping-policies" as const };
  return { policy: matches[0] ?? null };
}

export function isWarrantyExpired(expiresOn: string, cairoToday: string) {
  return expiresOn < cairoToday;
}

export function canAttachEvidenceToClaim(status: WarrantyClaimStatus) {
  return status === "open" || status === "under-review";
}
