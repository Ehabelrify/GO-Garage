import type { ReactNode } from "react";
import type { WarrantyRecord } from "@garage/domain";

export function CoverageDetail({ record, title, status, detailLabel, primaryAction, children }: {
  record: WarrantyRecord; title: ReactNode; status: string; detailLabel: string; primaryAction?: ReactNode; children: ReactNode;
}) {
  return <article className="w-record"><div className="w-record-summary"><div className="w-record-title"><strong>{title}</strong><span className={`w-badge ${record.status}`}>{status}</span><span className="w-policy-meta">{record.policyName} · v{record.policyVersion} · {record.coverageKind}</span></div>
    {primaryAction && <div className="w-actions">{primaryAction}</div>}
    <details className="w-optional"><summary>{detailLabel}</summary><div className="w-record-expanded">{children}</div></details></div></article>;
}
