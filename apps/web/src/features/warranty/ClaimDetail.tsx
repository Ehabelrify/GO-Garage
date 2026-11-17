import type { ReactNode } from "react";
import type { WarrantyClaim } from "@garage/domain";

export function ClaimDetail({ claim, version, kind, status, detailLabel, primaryAction, children }: {
  claim: WarrantyClaim; version?: number; kind?: string; status: string; detailLabel: string; primaryAction?: ReactNode; children: ReactNode;
}) {
  return <article className="w-claim"><div className="w-claim-top"><div><h3>{claim.summary}</h3><div className="w-claim-sub"><bdi>{claim.id}</bdi> · v{version ?? "—"} · {kind ?? "—"}</div></div><span className={`w-badge ${claim.status}`}>{status}</span></div>{primaryAction && <div className="w-card-actions">{primaryAction}</div>}<details className="w-optional"><summary>{detailLabel}</summary>{children}</details></article>;
}
