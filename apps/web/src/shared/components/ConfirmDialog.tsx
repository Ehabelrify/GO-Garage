import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import type { Locale } from "@garage/domain";
import { useFocusTrap, useLockBodyScroll } from "../hooks";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  lang: Locale;
  /** Destructive/backward action: red button, initial focus on Cancel. */
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Disable confirm until required input (reason/evidence) is valid. */
  confirmDisabled?: boolean;
  /** Why confirm is disabled; announced to screen readers. */
  disabledReason?: string;
  busy?: boolean;
  /** Extra inputs such as a reason or evidence field. */
  children?: ReactNode;
}

const text = { en: { confirm: "Confirm", cancel: "Go back" }, ar: { confirm: "تأكيد", cancel: "رجوع" } };

/** Modal confirmation with focus trap. Required for cancel / no-show / void / revoke / retire. */
export function ConfirmDialog({ open, title, body, lang, danger, confirmLabel, cancelLabel, onConfirm, onCancel, confirmDisabled, disabledReason, busy, children }: ConfirmDialogProps) {
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  const reasonId = useId();
  useFocusTrap(panel, open, onCancel);
  useLockBodyScroll(open);
  if (!open) return null;
  const copy = text[lang];
  const blocked = Boolean(confirmDisabled || busy);
  return createPortal(
    <div className="overlay dialog" dir={lang === "ar" ? "rtl" : "ltr"} onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section ref={panel} className="dialog-panel" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        {danger && <div className="dialog-icon"><AlertTriangle size={20} aria-hidden="true" /></div>}
        <h2 id={titleId}>{title}</h2>
        {body && <p>{body}</p>}
        {children}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel} data-autofocus={danger ? "" : undefined}>{cancelLabel ?? copy.cancel}</button>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger btn-solid" : "btn-primary"}`}
            disabled={blocked}
            aria-describedby={blocked && disabledReason ? reasonId : undefined}
            onClick={onConfirm}
          >{confirmLabel ?? copy.confirm}</button>
        </div>
        {blocked && disabledReason && <p className="form-hint" id={reasonId}>{disabledReason}</p>}
      </section>
    </div>,
    document.body,
  );
}
