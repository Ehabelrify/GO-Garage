import type { ReactNode } from "react";
import { AlertCircle, Inbox, SearchX, type LucideIcon } from "lucide-react";

export type EmptyVariant = "no-data" | "no-results" | "error";

export interface EmptyStateProps {
  title: string;
  text?: string;
  variant?: EmptyVariant;
  icon?: LucideIcon;
  /** Next step (button/link). For no-results pass a "Clear filters" button, for error a "Retry" button. */
  action?: ReactNode;
}

const icons: Record<EmptyVariant, LucideIcon> = { "no-data": Inbox, "no-results": SearchX, error: AlertCircle };

export function EmptyState({ title, text, variant = "no-data", icon, action }: EmptyStateProps) {
  const Icon = icon ?? icons[variant];
  return <div className={`empty-state ${variant === "error" ? "error" : ""}`} role={variant === "error" ? "alert" : undefined}>
    <Icon size={22} aria-hidden="true" />
    <strong>{title}</strong>
    {text && <p>{text}</p>}
    {action && <div className="empty-state-actions">{action}</div>}
  </div>;
}

/** Loading placeholder. Use `rows` for list-shaped content. */
export function Skeleton({ rows = 4, label }: { rows?: number; label?: string }) {
  return <div className="skeleton-rows" role="status" aria-busy="true" aria-label={label}>
    {Array.from({ length: rows }, (_, index) => <span className="skeleton" key={index} style={{ width: `${92 - (index % 3) * 14}%` }} />)}
  </div>;
}
