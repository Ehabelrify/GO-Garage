import type { FinancialMetricId, Locale, MoneyEvent, MoneyEventKind } from "@garage/domain";
import { hasCapability } from "../../shared/capabilities";
import { majorToMinor } from "../../shared/format";

/** Minimal actor shape (mirrors server GarageActor; web never imports server code). */
export interface FinanceActor {
  role: string;
  branchIds: string[];
  isDemo?: boolean;
  capabilities?: string[];
  permissions?: Partial<Record<string, boolean>>;
}

/** Mirrors authz.ts: owner always; branch managers by default; per-user overrides unless owner/demo. */
export function canViewFinance(actor: FinanceActor | null | undefined): boolean {
  return hasCapability(actor, "finance.view");
}

/** Recording, reversing and attesting are Owner-only on the server. */
export function canWriteFinance(actor: FinanceActor | null | undefined): boolean {
  return !!actor && actor.role === "owner";
}

export const metricLabels: Record<FinancialMetricId, { en: string; ar: string }> = {
  "quoted-value": { en: "Quoted value", ar: "قيمة عروض الأسعار" },
  "draft-value": { en: "Draft quote value", ar: "قيمة مسودات العروض" },
  collections: { en: "Collections", ar: "المبالغ المحصلة" },
  outstanding: { en: "Outstanding balance", ar: "الرصيد المستحق" },
  "direct-cost": { en: "Direct costs", ar: "التكاليف المباشرة" },
  "recognized-revenue": { en: "Recognized revenue", ar: "الإيراد المعترف به" },
  "gross-profit": { en: "Gross profit", ar: "مجمل الربح" },
  "net-profit": { en: "Net profit", ar: "صافي الربح" },
};

/** One short truthful definition per metric; quotes and drafts are pipeline, never revenue. */
export const metricHints: Record<FinancialMetricId, { en: string; ar: string }> = {
  "quoted-value": { en: "Offered quotes. Not revenue.", ar: "عروض مقدمة. ليست إيراداً." },
  "draft-value": { en: "Unsent drafts. Not revenue.", ar: "مسودات لم تُرسل. ليست إيراداً." },
  collections: { en: "Money received, minus refunds.", ar: "المبالغ المستلمة بعد خصم الاسترداد." },
  outstanding: { en: "Accepted quotes not yet collected.", ar: "عروض مقبولة لم تُحصّل بعد." },
  "direct-cost": { en: "Costs tied to jobs.", ar: "تكاليف مرتبطة بأوامر الشغل." },
  "recognized-revenue": { en: "Revenue recorded under the approved rule.", ar: "إيراد مسجل وفق القاعدة المعتمدة." },
  "gross-profit": { en: "Recognized revenue minus direct costs.", ar: "الإيراد المعترف به ناقص التكاليف المباشرة." },
  "net-profit": { en: "Gross profit minus overhead.", ar: "مجمل الربح ناقص المصاريف العامة." },
};

export const pipelineMetrics: FinancialMetricId[] = ["quoted-value", "draft-value"];

export const metricGroups: Array<{ id: string; en: string; ar: string; metrics: FinancialMetricId[] }> = [
  { id: "cash", en: "Money in and out", ar: "الداخل والخارج", metrics: ["collections", "outstanding", "direct-cost"] },
  { id: "result", en: "Result", ar: "النتيجة", metrics: ["recognized-revenue", "gross-profit", "net-profit"] },
  { id: "pipeline", en: "Pipeline (not revenue)", ar: "قيد البيع (ليس إيراداً)", metrics: pipelineMetrics },
];

export const allMetricIds: FinancialMetricId[] = metricGroups.flatMap((group) => group.metrics);

export const moneyEventKinds: MoneyEventKind[] = ["collection", "refund", "direct-cost", "overhead", "recognized-revenue"];
export const kindLabels: Record<MoneyEventKind, { en: string; ar: string }> = {
  collection: { en: "Collection", ar: "تحصيل" },
  refund: { en: "Refund", ar: "استرداد" },
  "direct-cost": { en: "Direct cost", ar: "تكلفة مباشرة" },
  overhead: { en: "Overhead", ar: "مصاريف عامة" },
  "recognized-revenue": { en: "Recognized revenue", ar: "إيراد معترف به" },
};
/** Which finance definition governs each kind (mirrors the server). */
export const kindMetric: Record<MoneyEventKind, FinancialMetricId> = {
  collection: "collections",
  refund: "collections",
  "direct-cost": "direct-cost",
  overhead: "net-profit",
  "recognized-revenue": "recognized-revenue",
};
/** Kinds that reduce the balance (shown with a minus sign). */
export const outflowKinds: MoneyEventKind[] = ["refund", "direct-cost", "overhead"];

export const sourceMethods: Array<{ value: string; en: string; ar: string; kinds?: MoneyEventKind[] }> = [
  { value: "cash", en: "Cash", ar: "نقداً" },
  { value: "card", en: "Card", ar: "بطاقة" },
  { value: "bank-transfer", en: "Bank transfer", ar: "تحويل بنكي" },
  { value: "reservation-deposit", en: "Reservation deposit", ar: "عربون حجز", kinds: ["collection"] },
  { value: "supplier-invoice", en: "Supplier invoice", ar: "فاتورة مورد", kinds: ["direct-cost", "overhead"] },
  { value: "job-completion", en: "Job completion", ar: "إتمام أمر شغل", kinds: ["recognized-revenue"] },
];
export const sourceMethodsFor = (kind: MoneyEventKind) => sourceMethods.filter((method) => !method.kinds || method.kinds.includes(kind));
const humanise = (value: string) => value.replace(/[-_]+/g, " ").replace(/^./, (char) => char.toUpperCase());
export function sourceMethodLabel(value: string, lang: Locale): string {
  const found = sourceMethods.find((method) => method.value === value);
  return found ? found[lang] : humanise(value);
}

export const provenanceLabels: Record<string, { en: string; ar: string }> = {
  recorded: { en: "Recorded", ar: "مسجل" },
  accepted: { en: "Accepted quote", ar: "عرض مقبول" },
  calculated: { en: "Calculated", ar: "محسوب" },
};
export function provenanceLabel(value: string, lang: Locale): string {
  const found = provenanceLabels[value];
  return found ? found[lang] : humanise(value);
}
const sourceKindLabels: Record<string, { en: string; ar: string }> = {
  "calculated-outstanding": { en: "Outstanding balance", ar: "رصيد مستحق" },
  "accepted-quote": { en: "Accepted quote", ar: "عرض مقبول" },
  "draft-quote": { en: "Draft quote", ar: "مسودة عرض" },
  quote: { en: "Quote", ar: "عرض سعر" },
  ...kindLabels,
};
export function sourceKindLabel(kind: string, lang: Locale): string {
  const found = sourceKindLabels[kind];
  return found ? found[lang] : humanise(kind);
}

/** "finance-definition:collections" -> metric id (or null when not a finance definition). */
export function definitionMetric(id: string): FinancialMetricId | null {
  const metric = id.startsWith("finance-definition:") ? id.slice("finance-definition:".length) : "";
  return (allMetricIds as string[]).includes(metric) ? (metric as FinancialMetricId) : null;
}
export const definitionPolicyId = (metric: FinancialMetricId) => `finance-definition:${metric}`;
export function definitionLabel(ref: { id: string; version: number }, lang: Locale): string {
  const metric = definitionMetric(ref.id);
  const name = metric ? metricLabels[metric][lang] : (lang === "ar" ? "تعريف مالي" : "Finance definition");
  return lang === "ar" ? `${name} · الإصدار ${ref.version}` : `${name} · v${ref.version}`;
}

/** Evidence references are stored as `private:<path>`; staff type a plain receipt/file name. */
export function toEvidenceRef(input: string): string {
  const cleaned = input.trim().replace(/^private:/i, "").replace(/\s+/g, "-").replace(/[^A-Za-z0-9/_-]/g, "").replace(/^\/+/, "");
  return cleaned ? `private:${cleaned}` : "";
}

export interface MoneyEventDraft {
  kind: MoneyEventKind;
  amount: string;
  currency: string;
  effectiveAt: string;
  branchId: string;
  sourceMethod: string;
  sourceReference: string;
  definitionVersion: number | null;
  reason: string;
  evidence: string;
}
export type DraftErrors = Partial<Record<keyof MoneyEventDraft, string>>;

export function validateMoneyEvent(draft: MoneyEventDraft, lang: Locale): DraftErrors {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const errors: DraftErrors = {};
  const minor = majorToMinor(draft.amount, draft.currency || "EGP");
  if (!minor || minor <= 0 || !Number.isSafeInteger(minor)) errors.amount = t("Enter an amount above zero.", "أدخل مبلغاً أكبر من صفر.");
  if (!draft.branchId) errors.branchId = t("Choose a branch.", "اختر الفرع.");
  if (!draft.effectiveAt || Number.isNaN(new Date(draft.effectiveAt).getTime())) errors.effectiveAt = t("Choose a date and time.", "اختر التاريخ والوقت.");
  if (!draft.sourceMethod) errors.sourceMethod = t("Choose how it was received or paid.", "اختر طريقة الاستلام أو الدفع.");
  if (!draft.sourceReference.trim()) errors.sourceReference = t("Enter the receipt or reference number.", "أدخل رقم الإيصال أو المرجع.");
  if (draft.definitionVersion === null || !draft.currency) errors.definitionVersion = t("No approved definition for this type.", "لا يوجد تعريف معتمد لهذا النوع.");
  if (!draft.reason.trim()) errors.reason = t("Say why this is recorded.", "اذكر سبب التسجيل.");
  if (!toEvidenceRef(draft.evidence)) errors.evidence = t("Enter the evidence reference.", "أدخل مرجع الدليل.");
  return errors;
}

export interface EventFilter { branchId: string; kind: string; status: string; from: string; to: string; query: string }
export const emptyEventFilter: EventFilter = { branchId: "all", kind: "all", status: "all", from: "", to: "", query: "" };

export function filterEvents(events: MoneyEvent[], filter: EventFilter): MoneyEvent[] {
  const query = filter.query.trim().toLowerCase();
  return events.filter((event) => {
    if (filter.branchId !== "all" && event.branchId !== filter.branchId) return false;
    if (filter.kind !== "all" && event.kind !== filter.kind) return false;
    if (filter.status === "recorded" && event.reversed) return false;
    if (filter.status === "reversed" && !event.reversed) return false;
    const day = event.effectiveAt.slice(0, 10);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    if (query && !`${event.sourceReference} ${event.sourceMethod} ${event.reason}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export type Period = "month" | "last-month" | "ytd" | "custom";
export function periodRange(period: Exclude<Period, "custom">, now = new Date()): { from: string; to: string; groupBy: "day" | "week" | "month" } {
  if (period === "month") return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now), groupBy: "day" };
  if (period === "last-month") return { from: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)), groupBy: "day" };
  return { from: `${now.getFullYear()}-01-01`, to: isoDate(now), groupBy: "month" };
}

/** Branches the actor may report on. Non-owners never get "all" (the server rejects it). */
export function reportBranchOptions<B extends { id: string }>(actor: FinanceActor | null | undefined, branches: B[]): { all: boolean; branches: B[] } {
  if (!actor || actor.role === "owner") return { all: true, branches };
  return { all: false, branches: branches.filter((branch) => actor.branchIds.includes(branch.id)) };
}

function humanList(value: string): string {
  return value.split(",").map((part) => part.trim().replace(/[-_]+/g, " ")).filter(Boolean).join(", ");
}
const reasonText: Array<[RegExp, (match: RegExpMatchArray) => { en: string; ar: string }]> = [
  [/^Approved and attested finance definition is not configured\.?$/, () => ({ en: "No approved, attested definition yet.", ar: "لا يوجد تعريف معتمد ومصدّق عليه بعد." })],
  [/^Approved definition does not treat an empty period as complete\.?$/, () => ({ en: "An empty period is not counted as complete.", ar: "الفترة الفارغة لا تعتبر مكتملة." })],
  [/^Legacy draft invoices do not contain/, () => ({ en: "Draft invoices carry no approved currency or tax basis.", ar: "مسودات الفواتير بلا عملة أو أساس ضريبي معتمد." })],
  [/^Recognized-revenue and direct-cost definitions must both/, () => ({ en: "Needs approved definitions for revenue and direct costs.", ar: "يلزم تعريف معتمد للإيراد والتكاليف المباشرة." })],
  [/^Both periods must be complete/, () => ({ en: "Both periods must be complete.", ar: "يجب أن تكون الفترتان مكتملتين." })],
  [/^Both periods must use the same definition/, () => ({ en: "Both periods must use the same definition and currency.", ar: "يجب أن تستخدم الفترتان التعريف والعملة نفسيهما." })],
  [/^Unapproved source kinds/, () => ({ en: "Some sources were excluded (not approved).", ar: "تم استبعاد بعض المصادر (غير معتمدة)." })],
  [/^Missing required sources: (.*)$/, (match) => ({ en: `Missing sources: ${humanList(match[1])}`, ar: `مصادر ناقصة: ${humanList(match[1])}` })],
];
export function reasonLabel(reason: string, lang: Locale): string {
  for (const [pattern, build] of reasonText) {
    const match = reason.match(pattern);
    if (match) return build(match)[lang];
  }
  return reason;
}

const errorCopy: Record<string, { en: string; ar: string }> = {
  DUPLICATE_MONEY_SOURCE: { en: "This receipt or reference was already recorded.", ar: "تم تسجيل هذا الإيصال أو المرجع من قبل." },
  FINANCE_DEFINITION_REQUIRED: { en: "No approved definition is active for this type. Approve one in Settings.", ar: "لا يوجد تعريف معتمد لهذا النوع. اعتمد تعريفاً من الإعدادات." },
  FINANCE_ATTESTATION_REQUIRED: { en: "The definition needs the Owner's completeness attestation first.", ar: "التعريف يحتاج إلى اعتماد الاكتمال من المالك أولاً." },
  FINANCE_DEFINITION_MISMATCH: { en: "The currency or type is not allowed by the approved definition.", ar: "العملة أو النوع غير مسموح به في التعريف المعتمد." },
  SOURCE_SCOPE_MISMATCH: { en: "The linked record belongs to a different branch.", ar: "السجل المرتبط يتبع فرعاً آخر." },
  SOURCE_IDENTITY_MISMATCH: { en: "The linked records do not belong to the same customer or vehicle.", ar: "السجلات المرتبطة لا تخص العميل أو المركبة نفسها." },
  DEPOSIT_SOURCE_CHANGED: { en: "This reservation is not waiting for a deposit.", ar: "هذا الحجز المؤجل لا ينتظر عربوناً." },
  OWNER_REQUIRED: { en: "Only the Owner can do this.", ar: "هذا الإجراء للمالك فقط." },
  FINANCE_VIEW_REQUIRED: { en: "You do not have permission to view finance.", ar: "ليس لديك صلاحية عرض المالية." },
  BRANCH_FORBIDDEN: { en: "Choose a branch you are assigned to.", ar: "اختر فرعاً مسنداً إليك." },
  WRITE_OUTCOME_UNKNOWN: { en: "We could not confirm it was saved. Refresh and check before trying again.", ar: "تعذر التأكد من الحفظ. حدّث الصفحة وراجع قبل المحاولة مجدداً." },
};
/** Friendly bilingual text for API failures (falls back to the server message). */
export function errorText(failure: unknown, lang: Locale): string {
  const code = typeof failure === "object" && failure && "code" in failure ? String((failure as { code: unknown }).code) : "";
  if (errorCopy[code]) return errorCopy[code][lang];
  if (failure instanceof Error && failure.message) return failure.message;
  return lang === "ar" ? "تعذر إكمال الطلب." : "The request could not be completed.";
}

/** Signed minor amount for display: refunds, costs and overhead read as negative. */
export function signedMinor(kind: MoneyEventKind, minor: number): number {
  return kind === "refund" || kind === "direct-cost" || kind === "overhead" ? -Math.abs(minor) : Math.abs(minor);
}

/** Metrics where a higher number is bad news (costs, receivables): Delta gets `inverse`. */
export const inverseMetrics: FinancialMetricId[] = ["outstanding", "direct-cost"];
export const isInverseMetric = (id: FinancialMetricId): boolean => inverseMetrics.includes(id);

/**
 * Gap between recognized revenue and collections when both are shown for the same period.
 * Collections is cash received (less refunds); recognized revenue follows the approved rule, so they legitimately differ.
 */
export function reconciliationGap(
  metrics: Partial<Record<FinancialMetricId, { state: string; amount?: { minor: number; currency: string } }>>,
): { gapMinor: number; currency: string } | null {
  const collections = metrics.collections;
  const revenue = metrics["recognized-revenue"];
  if (!collections || !revenue || collections.state === "unavailable" || revenue.state === "unavailable" || !collections.amount || !revenue.amount) return null;
  if (collections.amount.currency !== revenue.amount.currency) return null;
  const gapMinor = revenue.amount.minor - collections.amount.minor;
  return gapMinor === 0 ? null : { gapMinor, currency: collections.amount.currency };
}

/** Local date (YYYY-MM-DD) and time (HH:MM) of an ISO instant, for DateText. */
export function localParts(value: string): { date: string; time: string } | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const two = (n: number) => String(n).padStart(2, "0");
  return { date: `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`, time: `${two(date.getHours())}:${two(date.getMinutes())}` };
}

/** SVG polyline points for a tiny trend preview. Null with fewer than two numeric values. */
export function sparklinePoints(values: Array<number | null>, width: number, height: number, pad = 2): string | null {
  const points = values.map((value, index) => ({ value, index })).filter((item): item is { value: number; index: number } => item.value !== null && Number.isFinite(item.value));
  if (points.length < 2) return null;
  const min = Math.min(...points.map((p) => p.value));
  const max = Math.max(...points.map((p) => p.value));
  const span = max - min || 1;
  const last = values.length - 1 || 1;
  return points.map((p) => {
    const x = pad + (p.index / last) * (width - pad * 2);
    const y = max === min ? height / 2 : height - pad - ((p.value - min) / span) * (height - pad * 2);
    return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
  }).join(" ");
}
