import type { Locale } from "@garage/domain";

export function fmtDateTime(value: string | number | Date, lang: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** Capacity numbers live in Hours & capacity (availability config); these decision ids are not edited as settings. */
export const capacityDecisionIds: ReadonlySet<string> = new Set([
  "daily-dropoff-limit", "branch-working-hours", "clean-bays", "general-bays", "weekly-day-off",
]);

/** Operating rules still edited as settings (no capacity numbers). */
export const operatingRuleIds: readonly string[] = ["booking-confirmation", "tint-hours", "ceramic-hours"];

export function isOperatingRule(id: string): boolean {
  return operatingRuleIds.includes(id) && !capacityDecisionIds.has(id);
}
