import { formatPlateDisplay } from "@garage/domain";

export interface PlateProps {
  /** Raw plate as stored or typed (Arabic letters, Latin letters, any digit script). */
  value: string | null | undefined;
  className?: string;
}

/**
 * One plate chip everywhere. Arabic letters are spaced and ordered by formatPlateDisplay; digits are Latin.
 * Rendered as its own isolate with dir chosen by script so surrounding text never reorders it.
 */
export function Plate({ value, className }: PlateProps) {
  const text = value ? formatPlateDisplay(value) : "";
  if (!text) return <span className="plate-empty">—</span>;
  const arabic = /[؀-ۿ]/.test(text);
  return <bdi className={`plate${className ? ` ${className}` : ""}`} dir={arabic ? "rtl" : "ltr"} data-script={arabic ? "ar" : "latin"}>{text}</bdi>;
}
