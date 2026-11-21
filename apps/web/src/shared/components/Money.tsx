import type { Locale } from "@garage/domain";
import { formatMoney } from "../format";

/**
 * Renders an amount stored in minor units as a human price ("EGP 1,250").
 * Pass the Money value object fields; minor units are never shown.
 */
export function Money({ minor, currency = "EGP", lang }: { minor: number | null | undefined; currency?: string; lang: Locale }) {
  return <bdi className={`money mono${typeof minor === "number" && minor < 0 ? " negative" : ""}`}>{formatMoney(minor, currency, lang)}</bdi>;
}
