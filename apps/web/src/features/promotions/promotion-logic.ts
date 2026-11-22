import type { Locale, Money, QualificationEvidence } from "@garage/domain";
import type { PromotionInfo } from "../quotes/commercial-data";
import { daysBetween, todayIso } from "../quotes/quote-logic";

export type Bilingual = { en: string; ar: string };

export const evidenceLabels: Record<QualificationEvidence["kind"], Bilingual> = {
  "warranty-reference": { en: "Warranty on file", ar: "ضمان مسجل" },
  "membership-verification": { en: "Club membership", ar: "عضوية النادي" },
  "grouped-vehicles": { en: "Several vehicles together", ar: "عدة مركبات معاً" },
};

/** "Club membership, Warranty on file" in the UI language. */
export function evidenceText(kinds: QualificationEvidence["kind"][], lang: Locale): string {
  return kinds.map((kind) => evidenceLabels[kind]?.[lang] ?? kind).join(lang === "ar" ? "، " : ", ");
}

export type PromotionValue =
  | { kind: "per-vehicle"; amount: Money }
  | { kind: "shared"; amount: Money }
  | { kind: "package" };

/** What the customer gets: a fixed amount per vehicle, an amount shared between vehicles, or the advertised package price (no fixed discount). */
export function promotionValue(promotion: Pick<PromotionInfo, "discount" | "perVehicle">): PromotionValue {
  if (promotion.perVehicle) return { kind: "per-vehicle", amount: promotion.perVehicle };
  if (promotion.discount) return { kind: "shared", amount: promotion.discount };
  return { kind: "package" };
}

export const valueNote = (value: PromotionValue, lang: Locale): string =>
  value.kind === "per-vehicle" ? (lang === "ar" ? "لكل مركبة" : "per vehicle")
    : value.kind === "shared" ? (lang === "ar" ? "إجمالي مشترك" : "shared total")
      : (lang === "ar" ? "سعر الباقة المعلن" : "advertised package price");

export type Validity = "active" | "ending-soon" | "upcoming" | "ended";

/** Where a promotion is in its dates. Ending soon = within 7 days. Missing dates mean open-ended. */
export function validityState(promotion: Pick<PromotionInfo, "validFrom" | "validUntil">, today = todayIso()): Validity {
  if (promotion.validFrom && promotion.validFrom > today) return "upcoming";
  if (promotion.validUntil) {
    const left = daysBetween(today, promotion.validUntil);
    if (left < 0) return "ended";
    if (left <= 7) return "ending-soon";
  }
  return "active";
}

/** "Vehicles" cell: "1" or "3 to 4". */
export const vehiclesText = (promotion: Pick<PromotionInfo, "minVehicles" | "maxVehicles">, lang: Locale): string =>
  promotion.maxVehicles <= 1 ? "1" : promotion.minVehicles === promotion.maxVehicles ? String(promotion.minVehicles) : (lang === "ar" ? `${promotion.minVehicles} إلى ${promotion.maxVehicles}` : `${promotion.minVehicles} to ${promotion.maxVehicles}`);

/** Case-insensitive text filter over name and rule. */
export function filterPromotions(rows: PromotionInfo[], query: string, lang: Locale): PromotionInfo[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => `${row.name} ${row.rule?.[lang] ?? ""}`.toLowerCase().includes(needle));
}

/** Sort key: ending soon first, then active, upcoming, ended; ties by name. */
export function promotionOrder(rows: PromotionInfo[], lang: Locale, today = todayIso()): PromotionInfo[] {
  const rank: Record<Validity, number> = { "ending-soon": 0, active: 1, upcoming: 2, ended: 3 };
  return [...rows].sort((a, b) => rank[validityState(a, today)] - rank[validityState(b, today)] || a.name.localeCompare(b.name, lang === "ar" ? "ar" : "en"));
}
