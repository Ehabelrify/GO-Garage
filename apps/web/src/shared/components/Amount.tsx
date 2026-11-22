import type { Locale } from "@garage/domain";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { MINUS, formatAmount, formatDelta, type AmountVariant, type DeltaUnit } from "../format";
import { useFullPrecision } from "../preferences";

export interface AmountProps {
  /** Integer minor units (piasters). */
  minor: number | null | undefined;
  lang: Locale;
  currency?: string;
  /** kpi: whole EGP, compact when large (full value in title/aria-label). table/detail: 2 decimals, right-aligned. Default table. */
  variant?: AmountVariant;
  /** Override the viewer preference "Show full precision". */
  fullPrecision?: boolean;
  className?: string;
}

/**
 * The one way to render money. Tabular lining numbers, bidi-isolated LTR, nowrap, real minus sign.
 * Currency is a smaller label. Honours the viewer preference "Show full precision".
 */
export function Amount({ minor, lang, currency = "EGP", variant = "table", fullPrecision, className }: AmountProps) {
  const [preference] = useFullPrecision();
  const parts = formatAmount(minor, { currency, lang, variant, fullPrecision: fullPrecision ?? preference });
  const cls = `amount${parts?.negative ? " negative" : ""}${className ? ` ${className}` : ""}`;
  if (!parts) return <span className={cls} data-variant={variant}>—</span>;
  const label = parts.compact ? parts.full : undefined;
  const sign = parts.negative ? MINUS : "";
  const cur = <span className="amount-cur">{parts.currency}</span>;
  return <bdi className={cls} data-variant={variant} dir="ltr" title={label} aria-label={label}>
    {lang === "ar" ? <>{sign}{parts.number}{cur}</> : <>{cur}{sign}{parts.number}</>}
  </bdi>;
}

export interface DeltaProps {
  value: number | null | undefined;
  lang: Locale;
  unit?: DeltaUnit;
  currency?: string;
  digits?: number;
  /** Liabilities, costs, outstanding balances: an increase is bad (red), a decrease good (green). */
  inverse?: boolean;
  className?: string;
}

/** Sign, number and unit in one LTR isolate with an arrow, so colour is never the only cue. */
export function Delta({ value, lang, unit = "percent", currency, digits, inverse = false, className }: DeltaProps) {
  const delta = formatDelta(value, { unit, lang, currency, digits });
  if (!delta) return <span className="delta">—</span>;
  const tone = delta.direction === "flat" ? "flat" : (delta.direction === "up") !== inverse ? "good" : "bad";
  const Icon = delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : Minus;
  return <bdi className={`delta${className ? ` ${className}` : ""}`} dir="ltr" data-tone={tone} data-direction={delta.direction}>
    <Icon size={13} aria-hidden="true" /><span>{delta.text}</span>
  </bdi>;
}
