import { forwardRef, type SelectHTMLAttributes } from "react";

export interface SelectOption { value: string; label: string; disabled?: boolean }

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
  /** Accessible name when there is no visible label. */
  label?: string;
}

/** Styled native select: one chevron, width by content (max 240px; add className="field-select" for full width). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ options, label, className, ...rest }, ref) {
  return <span className="select-wrap">
    <select ref={ref} aria-label={label} className={`select${className ? ` ${className}` : ""}`} {...rest}>
      {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
  </span>;
});
