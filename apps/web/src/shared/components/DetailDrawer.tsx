import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import type { Locale } from "@garage/domain";
import { useFocusTrap, useLockBodyScroll } from "../hooks";

export interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  lang: Locale;
  children: ReactNode;
  /** Sticky action area (primary buttons). */
  footer?: ReactNode;
  /** When set, a back button replaces nothing and sits before the title (e.g. returning to the previous preview). */
  onBack?: () => void;
  wide?: boolean;
}

const text = { en: { close: "Close", back: "Back" }, ar: { close: "إغلاق", back: "رجوع" } };

/**
 * Side panel (inline-end; full screen under 760px). Traps focus, closes on Esc and backdrop click,
 * restores focus to the opener. For URL-addressable use pair with `useUrlState("record", "")`.
 */
export function DetailDrawer({ open, onClose, title, subtitle, lang, children, footer, onBack, wide }: DetailDrawerProps) {
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  useFocusTrap(panel, open, onClose);
  useLockBodyScroll(open);
  if (!open) return null;
  const copy = text[lang];
  return createPortal(
    <div className="overlay drawer" dir={lang === "ar" ? "rtl" : "ltr"} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside ref={panel} className={`drawer-panel${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="drawer-head">
          {onBack && <button type="button" className="drawer-icon-button drawer-back" aria-label={copy.back} onClick={onBack}><ArrowLeft size={18} /></button>}
          <div className="drawer-head-main">
            <h2 className="drawer-title" id={titleId}>{title}</h2>
            {subtitle && <p className="drawer-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="drawer-icon-button" aria-label={copy.close} onClick={onClose} data-autofocus><X size={18} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}
