import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  /** Optional category label above the title. */
  eyebrow?: string;
  /** Optional single line (about 90 characters max). */
  subtitle?: string;
  /** Badges / counts rendered under the title. */
  meta?: ReactNode;
  /** Buttons on the trailing side (right in English, left in Arabic). One primary only. */
  actions?: ReactNode;
  /** Tabs rendered directly under the header (slot contract: title, subtitle, meta, actions, tabs). */
  tabs?: ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, meta, actions, tabs }: PageHeaderProps) {
  const header = <header className="page-heading">
    <div className="page-heading-main">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {subtitle && <p className="subtitle">{subtitle}</p>}
      {meta && <div className="page-heading-meta">{meta}</div>}
    </div>
    {actions && <div className="page-heading-actions">{actions}</div>}
  </header>;
  return tabs ? <>{header}{tabs}</> : header;
}
