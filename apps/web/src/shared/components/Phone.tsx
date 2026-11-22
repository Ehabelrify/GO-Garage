import { formatPhone } from "../format";

export interface PhoneProps {
  value: string | null | undefined;
  /** Render as a tel: link. */
  link?: boolean;
  /** Render as a wa.me link (takes precedence over link). */
  whatsapp?: boolean;
  className?: string;
}

/** LTR isolate so "+20" stays at the start on Arabic pages; never wraps. */
export function Phone({ value, link, whatsapp, className }: PhoneProps) {
  const text = formatPhone(value);
  if (!text) return <span className="phone">—</span>;
  const cls = `phone${className ? ` ${className}` : ""}`;
  if (whatsapp) return <a className={cls} dir="ltr" href={`https://wa.me/${text.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">{text}</a>;
  if (link) return <a className={cls} dir="ltr" href={`tel:${text.replace(/[^\d+]/g, "")}`}>{text}</a>;
  return <bdi className={cls} dir="ltr">{text}</bdi>;
}
