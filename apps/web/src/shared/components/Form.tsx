import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

export interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  /** Columns on wide screens (always 1 under 760px). */
  columns?: 1 | 2 | 3;
}

/** Group of fields: fieldset + legend with a responsive grid. */
export function FormSection({ title, description, children, columns = 2 }: FormSectionProps) {
  return <fieldset className="form-section">
    <legend>{title}</legend>
    {description && <p className="form-section-desc">{description}</p>}
    <div className={`form-grid${columns === 3 ? " cols-3" : ""}`} style={columns === 1 ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined}>{children}</div>
  </fieldset>;
}

/** Shown once per form when any field is required. */
export function RequiredNote({ text }: { text: string }) {
  return <p className="form-required-note"><span className="field-required" aria-hidden="true">*</span> {text}</p>;
}

export interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** Spans the full grid row. */
  full?: boolean;
  /** One form control. Receives id, aria-describedby, aria-invalid and required. */
  children: ReactElement<Record<string, unknown>> | ReactNode;
}

/** Label + control + hint/error with correct aria wiring. */
export function Field({ label, required, hint, error, full, children }: FieldProps) {
  const id = useId();
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, {
        id: (children.props.id as string | undefined) ?? id,
        "aria-describedby": [children.props["aria-describedby"] as string | undefined, describedBy].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? true : children.props["aria-invalid"],
        required: required ?? children.props.required,
      })
    : children;
  const controlId = isValidElement<Record<string, unknown>>(children) ? ((children.props.id as string | undefined) ?? id) : id;
  return <div className={`form-field${full ? " full" : ""}`}>
    <label className="field-label" htmlFor={controlId}>{label}{required && <span className="field-required" aria-hidden="true">*</span>}</label>
    {control}
    {hint && !error && <div className="form-hint" id={hintId}>{hint}</div>}
    {error && <div className="field-error" id={errorId} role="alert">{error}</div>}
  </div>;
}
