import type { GarageState, WarrantyPolicy } from "@garage/domain";
import { useState, type Dispatch, type SetStateAction } from "react";

export type WarrantyDraftIdentity = {
  userId: string;
  dataset: "demo" | "live";
  task: "policy" | "issue" | "claim" | "review" | "void" | "invoice" | "verification";
  entityId: string;
  version: number;
};

export function warrantyDraftKey(identity: WarrantyDraftIdentity): string {
  return JSON.stringify([identity.userId, identity.dataset, identity.task, identity.entityId, identity.version]);
}

// Adapter for a shared guided-step presenter: the workspace owns warranty facts,
// while the presenter may use these reasons and readiness to guide navigation.
export function getWarrantyTaskPrerequisites(input: {
  state: GarageState;
  policy?: WarrantyPolicy;
  jobId?: string;
  componentId?: string;
  canIssue: boolean;
  allowedBranches: string[];
  pending: boolean;
  componentIds?: string[];
  retiredBinding?: boolean;
}): { ready: boolean; reasons: string[] } {
  const { state, policy, jobId, componentId, canIssue, allowedBranches, pending, componentIds, retiredBinding } = input;
  const reasons: string[] = [];
  const job = state.jobs.find((item) => item.id === jobId);
  if (!canIssue || !allowedBranches.length) reasons.push("authority");
  if (!policy || (policy.status !== "published" && !(policy.status === "retired" && retiredBinding))) reasons.push("policy");
  if (!job || job.stage !== "delivered" || !allowedBranches.includes(job.branchId) ||
    (state.currentBranch !== "all" && state.currentBranch !== job.branchId) ||
    (policy && !policy.eligibleServiceIds.includes(job.serviceId))) reasons.push("eligible-job");
  if (componentIds && componentIds.length && (!componentId || !componentIds.includes(componentId))) reasons.push("component");
  if (job && policy && state.warranties.some((record) => record.jobId === job.id &&
    record.policyId === policy.policyId && (!componentId || record.componentId === componentId))) reasons.push("duplicate");
  if (pending) reasons.push("pending");
  return { ready: reasons.length === 0, reasons };
}

export function reduceWarrantyDraft<T extends object>(
  current: { key: string; value: T } | null,
  identity: WarrantyDraftIdentity,
  initial: () => T,
  update?: Partial<T>,
): { key: string; value: T } {
  const key = warrantyDraftKey(identity);
  const value = current?.key === key ? current.value : initial();
  return { key, value: update ? { ...value, ...update } : value };
}

export function useWarrantyDraftState<T extends object>(
  identity: WarrantyDraftIdentity,
  initial: () => T,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [entry, setEntry] = useState<{ key: string; value: T } | null>(null);
  const key = warrantyDraftKey(identity);
  const value = entry?.key === key ? entry.value : initial();
  const setValue: Dispatch<SetStateAction<T>> = (next) => {
    setEntry((current) => {
      const base = reduceWarrantyDraft(current, identity, initial);
      const updated = typeof next === "function" ? (next as (previous: T) => T)(base.value) : next;
      return reduceWarrantyDraft(base, identity, initial, updated);
    });
  };
  return [value, setValue, () => setEntry((current) => current?.key === key ? null : current)];
}
