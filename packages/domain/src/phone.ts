import { toAsciiDigits } from "./plate";

/** Canonical phone digits: Arabic-Indic and Eastern digits become ASCII, everything else non-numeric is dropped (P2T-027). */
export function phoneDigits(value: string | null | undefined): string {
  return toAsciiDigits(String(value ?? "")).replace(/\D/g, "");
}
