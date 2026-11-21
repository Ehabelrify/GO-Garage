export type PolicyGroup = "quote" | "pickup" | "finance";

export interface PolicyEntry { id: string; group: PolicyGroup; branchId?: string; metric?: string }

export const financeMetrics = ["quoted-value", "draft-value", "collections", "outstanding", "direct-cost", "recognized-revenue", "gross-profit", "net-profit"] as const;

const financeLabels: Record<string, { en: string; ar: string }> = {
  "quoted-value": { en: "Quoted value", ar: "قيمة العروض" },
  "draft-value": { en: "Draft value", ar: "قيمة المسودات" },
  collections: { en: "Collections", ar: "التحصيلات" },
  outstanding: { en: "Outstanding", ar: "المستحقات" },
  "direct-cost": { en: "Direct cost", ar: "التكلفة المباشرة" },
  "recognized-revenue": { en: "Recognised revenue", ar: "الإيراد المعترف به" },
  "gross-profit": { en: "Gross profit", ar: "إجمالي الربح" },
  "net-profit": { en: "Net profit", ar: "صافي الربح" },
};

export const policyGroupLabels: Record<PolicyGroup, { en: string; ar: string }> = {
  quote: { en: "Quotes", ar: "عروض الأسعار" },
  pickup: { en: "Pickup commitments", ar: "مواعيد التسليم" },
  finance: { en: "Finance definitions", ar: "التعريفات المالية" },
};

/** The policy records the Owner can author (quote + one pickup per branch + eight finance). Ids match the server. */
export function buildPolicyCatalog(branchIds: string[]): PolicyEntry[] {
  return [
    { id: "quote-acceptance:default", group: "quote" },
    ...branchIds.map((branchId) => ({ id: `pickup-commitment:${branchId}`, group: "pickup" as const, branchId })),
    ...financeMetrics.map((metric) => ({ id: `finance-definition:${metric}`, group: "finance" as const, metric })),
  ];
}

export function policyLabel(entry: PolicyEntry, lang: "en" | "ar", branchName: (id: string) => string): string {
  if (entry.group === "quote") return lang === "ar" ? "قبول عرض السعر" : "Quote acceptance";
  if (entry.group === "pickup") return branchName(entry.branchId ?? "");
  const label = financeLabels[entry.metric ?? ""];
  return label ? label[lang] : (entry.metric ?? "");
}
