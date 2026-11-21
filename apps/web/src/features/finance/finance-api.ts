import type { FinancialMetricId, PolicyRef } from "@garage/domain";
import { definitionPolicyId } from "./finance-logic";

export type ActiveDefinition =
  | { state: "approved"; ref: PolicyRef; currency: string }
  | { state: "unconfigured" };

/** Reads the active approved finance definition for a metric (the policy store stays the authority). */
export async function fetchActiveDefinition(metric: FinancialMetricId): Promise<ActiveDefinition> {
  const response = await fetch(`/api/commercial-policies/${encodeURIComponent(definitionPolicyId(metric))}`, { credentials: "same-origin" });
  if (response.status === 404 || response.status === 403) return { state: "unconfigured" };
  if (!response.ok) throw new Error(String(response.status));
  const body = await response.json().catch(() => null) as { state?: string; policy?: PolicyRef; value?: { currency?: string } } | null;
  if (body?.state === "approved" && body.policy && typeof body.value?.currency === "string" && body.value.currency) {
    return { state: "approved", ref: body.policy, currency: body.value.currency };
  }
  return { state: "unconfigured" };
}
