import type { ReactNode } from "react";
import { AlertCircle, type LucideIcon } from "lucide-react";
import type { BranchId, Decision, GarageState, JobStage, Locale, Vehicle } from "./types";

export type Lang = Locale;
export type Translator = (english: string, arabic: string) => string;
export type BranchName = (branchId: BranchId) => string;
export type CustomerName = (customerId: string) => string;
export type ServiceName = (serviceId: string) => string;
export type VehicleLookup = (customerId: string, vehicleId: string) => Vehicle | undefined;

export interface PageProps {
  lang: Lang;
  t: Translator;
  state: GarageState;
  notify: (message: string) => void;
}
export interface BranchPageProps extends PageProps {
  branchName: BranchName;
}
export interface RecordPageProps extends BranchPageProps {
  customerName: CustomerName;
  serviceName: ServiceName;
  vehicleFor: VehicleLookup;
}
export interface ModalConfig {
  title: string;
  body: string;
  confirm: () => void;
  danger?: boolean;
}

export const stageNames: Record<JobStage, { en: string; ar: string }> = {
  booked: { en: "Booked", ar: "محجوزة" },
  received: { en: "Received", ar: "تم الاستلام" },
  "in-service": { en: "In service", ar: "تحت التنفيذ" },
  qc: { en: "Quality check", ar: "فحص الجودة" },
  ready: { en: "Ready", ar: "جاهزة" },
  delivered: { en: "Delivered", ar: "تم التسليم" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
  "no-show": { en: "No-show", ar: "لم يحضر" },
};

export const sampleNames: Record<string, string> = {
  "Sample customer 1": "عميل تجريبي ١",
  "Sample customer 2": "عميل تجريبي ٢",
  "Sample customer 3": "عميل تجريبي ٣",
  "Sample branch A": "الفرع التجريبي أ",
  "Sample branch B": "الفرع التجريبي ب",
  "Branch A": "الفرع أ",
  "Branch B": "الفرع ب",
};

export const decisionNames: Record<string, { en: string; ar: string }> = {
  "branch-model": { en: "Branch operating model", ar: "نموذج تشغيل الفروع" },
  "booking-confirmation": { en: "Booking confirmation", ar: "تأكيد الحجز" },
  "daily-dropoff-limit": { en: "Maximum drop-offs per day", ar: "الحد الأقصى للاستلام اليومي" },
  "branch-working-hours": { en: "Working hours per day", ar: "ساعات العمل اليومية" },
  "clean-bays": { en: "Clean bays", ar: "بايات التنظيف" },
  "general-bays": { en: "General bays", ar: "البايات العامة" },
  "weekly-day-off": { en: "Weekly day off", ar: "يوم الإجازة الأسبوعية" },
  "tint-hours": { en: "Window tint bay-hours", ar: "ساعات باي تظليل النوافذ" },
  "ceramic-hours": { en: "Ceramic coating bay-hours", ar: "ساعات باي الطلاء السيراميك" },
  "intake-photos": { en: "Required intake photos", ar: "صور الاستلام المطلوبة" },
  "technician-assignment": { en: "Technician assignment", ar: "إسناد الفنيين" },
  "job-lifecycle": { en: "Job lifecycle", ar: "مراحل تنفيذ العمل" },
  "customer-updates": { en: "Customer status updates", ar: "تحديثات حالة العميل" },
};

export const categoryNames: Record<string, { en: string; ar: string }> = {
  Branches: { en: "Branches", ar: "الفروع" },
  Bookings: { en: "Bookings", ar: "الحجوزات" },
  Capacity: { en: "Capacity", ar: "السعة التشغيلية" },
  Workshop: { en: "Workshop", ar: "الورشة" },
  Services: { en: "Services", ar: "الخدمات" },
  "Customer communication": { en: "Customer communication", ar: "التواصل مع العملاء" },
  Language: { en: "Language", ar: "اللغة" },
};

export const serviceNames: Record<string, { en: string; ar: string }> = {
  Inspection: { en: "Inspection", ar: "فحص" },
  "Window tint": { en: "Window tint", ar: "تظليل النوافذ" },
  "Audio upgrade": { en: "Audio upgrade", ar: "ترقية النظام الصوتي" },
  "Ceramic coating": { en: "Ceramic coating", ar: "طلاء سيراميك" },
  "Full PPF": { en: "Full PPF", ar: "حماية كاملة للطلاء" },
};

export const decisionCopy: Record<string, { question: string; impact: string; options: Record<string, string> }> = {
  "branch-model": { question: "كيف يتشارك الفرعان الموظفين والحجوزات والموارد؟", impact: "يؤثر في رؤية الموظفين وتوفر الحجوزات وملكية المخزون وتقارير الفروع.", options: { independent: "يدير كل فرع عملياته اليومية بشكل مستقل.", shared: "يمكن مشاركة بعض الموظفين أو المخزون أو السعة.", mixed: "يُحدد نطاق المشاركة لكل مورد على حدة." } },
  "booking-confirmation": { question: "متى يصبح الحجز مؤكداً؟", impact: "يؤثر في وعود العملاء وحجز السعة وقائمة مراجعة الموظفين.", options: { instant: "يؤكد النظام الحجز فور توفر السعة.", "staff-review": "يراجع موظف الاستقبال الطلب قبل التأكيد.", "manager-review": "تحتاج طلبات محددة إلى موافقة المدير." } },
  "daily-dropoff-limit": { question: "كم مركبة يمكن أن تصل إلى هذا الفرع يومياً؟", impact: "يؤثر في قبول الحجوزات بشكل مستقل عن سعة ساعات البايات.", options: { "4": "حد يومي تجريبي أقل للاستلام.", "6": "حد يومي تجريبي متوسط للاستلام.", "8": "حد يومي تجريبي أعلى للاستلام.", "10": "أعلى خيار تجريبي؛ تحقّق من الموظفين والبايات." } },
  "branch-working-hours": { question: "كم ساعة تشغيلية ينبغي استخدامها في فحص السعة التجريبي؟", impact: "يحدد ميزانية ساعات البايات اليومية. يجب تأكيد أوقات الفتح والاستراحات الفعلية مع المالك.", options: { "8": "يوم عمل تجريبي أقصر.", "10": "يوم العمل المقترح للعرض.", "12": "يوم عمل تجريبي أطول." } },
  "clean-bays": { question: "كم باي تنظيف ينبغي استخدامه في فحص السعة لهذا الفرع؟", impact: "يؤثر في الخدمات التي تتطلب باي تنظيف مثل الطلاء السيراميك وحماية الطلاء الكاملة.", options: { "1": "سعة تجريبية أقل.", "2": "سعة الفرع أ في العينة.", "3": "سعة أعلى؛ تحقّق من موقع العمل." } },
  "general-bays": { question: "كم باي عام ينبغي استخدامه في فحص السعة لهذا الفرع؟", impact: "يؤثر في الخدمات التي تستخدم البايات العامة مثل الفحص والتظليل والصوتيات.", options: { "2": "سعة تجريبية أقل.", "3": "سعة الفرع ب في العينة.", "4": "سعة الفرع أ في العينة.", "5": "سعة أعلى؛ تحقّق من موقع العمل." } },
  "weekly-day-off": { question: "أي يوم ينبغي اعتباره إغلاقاً أسبوعياً اعتيادياً للحجوزات؟", impact: "يؤثر في تواريخ الاستلام المتاحة وتوقيت التذكيرات.", options: { Friday: "تقويم أسبوعي تجريبي.", Sunday: "بديل ليوم الإغلاق الأسبوعي.", None: "كل الأيام متاحة وفق ساعات العمل التي يحددها المالك." } },
  "tint-hours": { question: "كم ساعة باي تتطلبها خدمة التظليل في العينة؟", impact: "يغير سعة البايات العامة المتاحة لليوم المحدد.", options: { "2": "مدة خدمة تجريبية أقصر.", "3": "مدة العينة من المقترح.", "4": "مدة خدمة تجريبية أطول.", "6": "مدة خدمة ممتدة." } },
  "ceramic-hours": { question: "كم ساعة باي يتطلب الطلاء السيراميك في العينة؟", impact: "يغير سعة بايات التنظيف في يوم الحجز؛ يجب التحقق من وقت المعالجة والانتظار خارج الباي.", options: { "12": "مدة خدمة تجريبية أقصر.", "20": "مدة العينة من المقترح.", "30": "مدة خدمة تجريبية أطول." } },
  "intake-photos": { question: "ما أدلة الصور المطلوبة قبل تسجيل استلام المركبة؟", impact: "يغير وقت الاستلام واكتمال الأدلة وإجراءات تسجيل الدخول.", options: { "0": "يمكن للموظفين تسجيل الحالة دون صور إلزامية.", "2": "متطلبات أدلة أقل.", "4": "الأمام والخلف والجانبان؛ مقترح تجريبي." } },
  "technician-assignment": { question: "كيف تُسند الأعمال إلى الفنيين المؤهلين؟", impact: "يؤثر في رؤية عبء العمل وصلاحية الوصول والمساءلة عند التسليم.", options: { manager: "يختار المدير الفني أو الفريق.", "self-claim": "يختار الفنيون الأعمال المتاحة بأنفسهم.", hybrid: "يقترح النظام ويتولى المدير التأكيد." } },
  "job-lifecycle": { question: "ما المراحل الأساسية التي يستخدمها الموظفون لكل مركبة؟", impact: "يؤثر في إجراءات الفنيين وتقارير المدير والحالة الظاهرة للعميل.", options: { standard: "محجوزة ← تم الاستلام ← تحت التنفيذ ← فحص الجودة ← جاهزة ← تم التسليم.", expanded: "إضافة مرحلتي الانتظار وإعادة العمل بعد اعتماد المالك." } },
  "customer-updates": { question: "ما مراحل العمل التي ينبغي أن تُنشئ تحديثاً للعميل؟", impact: "قد ينشئ توقعات لدى العميل ويتطلب نصاً معتمداً وموافقة ومزوداً فعلياً.", options: { off: "يتواصل الموظفون مع العملاء يدوياً.", milestones: "إشعار عند مراحل متفق عليها مثل الاستلام والجاهزية.", all: "إرسال رسالة عند كل تغيير مرحلة معتمد." } },
};

export function dateLabel(value: string, lang: Lang) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function valueLabel(decision: Decision, value: string, lang: Lang): string {
  const option = decision.options.find((item) => item.value === value);
  if (!option) return value || "—";
  if (decision.id === "weekly-day-off") {
    const days: Record<string, string> = { Friday: "الجمعة", Sunday: "الأحد", None: "لا يوجد" };
    return lang === "ar" ? days[value] ?? option.label : option.label;
  }
  if (decision.id === "daily-dropoff-limit") return lang === "ar" ? `${value} مركبات` : option.label;
  if (["branch-working-hours", "tint-hours", "ceramic-hours"].includes(decision.id)) return lang === "ar" ? `${value} ساعات` : option.label;
  if (["clean-bays", "general-bays"].includes(decision.id)) return lang === "ar" ? `${value} ${value === "1" ? "باي" : "بايات"}` : option.label;
  if (decision.id === "intake-photos" && value === "0") return lang === "ar" ? "اختياري" : "Optional";
  if (decision.id === "intake-photos" && value === "4") return lang === "ar" ? "٤ زوايا" : "4 angles";
  if (decision.id === "intake-photos" && value === "2") return lang === "ar" ? "صورتان" : "2 photos";
  if (lang === "en") return option.label;
  const labels: Record<string, string> = {
    mixed: "مختلط", independent: "مستقل", shared: "مشترك", instant: "فوري عند توفر السعة",
    "staff-review": "تأكيد الاستقبال", "manager-review": "موافقة المدير", manager: "إسناد المدير",
    "self-claim": "اختيار الفني", hybrid: "اقتراح النظام", standard: "مراحل أساسية",
    expanded: "مراحل موسعة", off: "بدون تحديثات تلقائية", milestones: "مراحل محددة",
    all: "كل تغييرات الحالة",
  };
  return labels[value] ?? option.label;
}

export function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="subtitle">{subtitle}</p></div>{action}</div>;
}

export function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="panel-title-row"><div><h2 className="panel-title">{title}</h2>{description && <p className="panel-desc">{description}</p>}</div>{action}</div>;
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><strong>{title}</strong><p>{text}</p></div>;
}

export function Status({ status, lang }: { status: string; lang: Lang }) {
  let label = status;
  if (status === "pending") label = lang === "ar" ? "بانتظار المراجعة" : "Pending review";
  else if (status === "confirmed") label = lang === "ar" ? "مؤكد تجريبياً" : "Confirmed · demo";
  else if (status === "cancelled") label = lang === "ar" ? "ملغي" : "Cancelled";
  else if (status === "proposed") label = lang === "ar" ? "مقترح" : "Proposed";
  else if (status === "demo-approved") label = lang === "ar" ? "موافق عليه تجريبياً" : "Demo-approved";
  else {
    const stage = stageNames[status as JobStage];
    if (stage) label = lang === "ar" ? stage.ar : stage.en;
  }
  return <span className={`status ${status}`}>{label}</span>;
}

export function Stat({ icon: Icon, label, value, foot }: { icon: LucideIcon; label: string; value: string | number; foot: string }) {
  return <div className="stat-card"><div className="stat-head"><span>{label}</span><Icon size={16} /></div><div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></div></div>;
}

export function WarningBanner({ children }: { children: ReactNode }) {
  return <div className="warning-banner"><AlertCircle size={17} /> <div>{children}</div></div>;
}

export function customerDisplay(customerName: string, lang: Lang) {
  return lang === "ar" ? sampleNames[customerName] ?? customerName : customerName;
}

export function serviceDisplay(serviceName: string, lang: Lang) {
  return lang === "ar" ? serviceNames[serviceName]?.ar ?? serviceName : serviceName;
}

export function branchDisplay(branchName: string, lang: Lang) {
  return lang === "ar" ? sampleNames[branchName] ?? branchName : branchName;
}

export function currentDecisionValue(decision: Decision, scope: BranchId | "business") {
  return decision.valueByScope[scope] ?? "";
}

export function currentStatus(decision: Decision, scope: BranchId | "business") {
  return decision.statusByScope[scope] ?? "proposed";
}

export function pageBranchMatches(state: GarageState, branchId: BranchId) {
  return state.currentBranch === "all" || state.currentBranch === branchId;
}
