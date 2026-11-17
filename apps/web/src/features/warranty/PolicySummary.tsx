import type { ReactNode } from "react";
import type { WarrantyPolicy } from "@garage/domain";

export function PolicySummary({ policy, status, kind, detailLabel, primaryAction, children }: {
  policy: WarrantyPolicy; status: string; kind: string; detailLabel: string; primaryAction?: ReactNode; children: ReactNode;
}) {
  return <article className="w-policy">
    <div className="w-policy-head"><div><div className="eyebrow">v{policy.version} · {kind}</div><h3>{policy.name}</h3><div className="w-policy-meta"><bdi>{policy.policyId}</bdi></div></div><span className={`w-badge ${policy.status}`}>{status}</span></div>
    {primaryAction && <div className="w-card-actions">{primaryAction}</div>}
    <details className="w-optional"><summary>{detailLabel}</summary>{children}</details>
  </article>;
}
