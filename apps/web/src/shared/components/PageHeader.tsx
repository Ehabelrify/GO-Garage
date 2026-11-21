import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  /** Optional category label above the title. */
  eyebrow?: string;
  /** Optional single line (about 90 characters max). */
  subtitle?: string;
  /** Badges / counts rendered under the title. */
  meta?: ReactNode;
  /** Buttons on the trailing side. */
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, meta, actions }: PageHeaderProps) {
  return <header className="page-heading">
    <div className="page-heading-main">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {subtitle && <p className="subtitle">{subtitle}</p>}
      {meta && <div className="page-heading-meta">{meta}</div>}
    </div>
    {actions && <div className="page-heading-actions">{actions}</div>}
  </header>;
}
