export type PolicyRef = { id: string; version: number };
export type ApprovalEvidence = { approvedBy: string; approvedAt: string; evidenceRef: string; reason: string };
export type Configured<T> =
  | { state: "unconfigured"; missing: string[] }
  | { state: "approved"; value: T; policy: PolicyRef; approval: ApprovalEvidence };
