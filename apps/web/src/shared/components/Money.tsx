import type { Locale } from "@garage/domain";
import { Amount } from "./Amount";
import type { AmountVariant } from "../format";

/**
 * Renders an amount stored in minor units. Thin wrapper over Amount, kept for existing callers.
 * Table style (2 decimals) by default; pass variant="kpi" for whole/compact dashboard use.
 */
export function Money({ minor, currency = "EGP", lang, variant = "table" }: { minor: number | null | undefined; currency?: string; lang: Locale; variant?: AmountVariant }) {
  return <Amount minor={minor} currency={currency} lang={lang} variant={variant} />;
}
