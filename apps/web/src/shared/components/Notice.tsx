import type { ReactNode } from "react";
import { AlertCircle, Info } from "lucide-react";

/** Single compact notice. Use at most one per page. */
export function Notice({ tone = "warning", children }: { tone?: "info" | "warning"; children: ReactNode }) {
  const Icon = tone === "info" ? Info : AlertCircle;
  return <div className={`warning-banner ${tone}`} role={tone === "warning" ? "note" : undefined}><Icon size={17} aria-hidden="true" /> <div>{children}</div></div>;
}
