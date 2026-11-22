import type { Locale } from "@garage/domain";

type Bilingual = { en: string; ar: string };

/** Short display names for the advertised example promotions and benefits (keyed by the policy id tail without "seed-"). */
const known: Record<string, Bilingual> = {
  "ultimate-club": { en: "Ultimate club", ar: "نادي ألتيميت" },
  "plus-lifetime": { en: "Plus lifetime", ar: "بلس مدى الحياة" },
  "recent-ultimate": { en: "Recent Ultimate offer", ar: "عرض ألتيميت الأخير" },
  "nov-announcement": { en: "5 November offer", ar: "عرض 5 نوفمبر" },
  "warranty-card-referral": { en: "Warranty card referral", ar: "إحالة بكارت الضمان" },
  "four-cars": { en: "Fourth car free", ar: "السيارة الرابعة مجاناً" },
  "multi-car": { en: "Fourth car free", ar: "السيارة الرابعة مجاناً" },
  "handover-inspection": { en: "Handover inspection", ar: "فحص التسليم" },
  "cairo-tow": { en: "Cairo tow", ar: "سحب داخل القاهرة" },
  "free-wash": { en: "Free wash", ar: "غسيل مجاني" },
  "vip-transport": { en: "VIP transport", ar: "نقل VIP" },
  "fourth-car": { en: "Fourth car free", ar: "السيارة الرابعة مجاناً" },
};

const acronyms = new Set(["vip", "ppf", "uv", "vat", "id", "qc"]);

/** "benefit-eligibility:seed-free-wash" -> "free-wash". */
export function policyKey(id: string): string {
  const tail = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  return tail.replace(/^seed[-_]/, "").trim().toLowerCase();
}

/** "free-wash" -> "Free wash"; known acronyms stay upper case ("vip-transport" -> "VIP transport"). Empty when nothing is left. */
export function humaniseKey(key: string): string {
  const words = key.split(/[-_\s]+/).filter(Boolean);
  return words.map((word, index) => (acronyms.has(word) ? word.toUpperCase() : index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(" ");
}

/** The localised short name when we know the policy, otherwise null. */
export function knownPolicyName(id: string, lang: Locale): string | null {
  const entry = known[policyKey(id)];
  return entry ? entry[lang === "ar" ? "ar" : "en"] : null;
}

/** Localised name for a policy id; humanised English tail when unknown; empty string for an empty id. */
export function policyDisplayName(id: string, lang: Locale): string {
  return knownPolicyName(id, lang) ?? humaniseKey(policyKey(id));
}
