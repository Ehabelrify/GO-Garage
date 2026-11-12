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
  booked: { en: "Booked", ar: "اتحجزت" },
  received: { en: "Received", ar: "اتسلمت" },
  "in-service": { en: "In service", ar: "شغالة" },
  qc: { en: "Quality check", ar: "فحص الجودة" },
  ready: { en: "Ready", ar: "جاهزة" },
  delivered: { en: "Delivered", ar: "اتسلّمت" },
  cancelled: { en: "Cancelled", ar: "اتلغت" },
  "no-show": { en: "No-show", ar: "ماجاش" },
};

export const sampleNames: Record<string, string> = {
  "Mariam Hassan": "مريم حسن",
  "Omar Fawzy": "عمر فوزي",
  "Nour El-Sayed": "نور السيد",
  "Nasr City Service Center": "مركز خدمة مدينة نصر",
  "Maadi Workshop": "ورشة المعادي",
  "Branch A": "الفرع أ",
  "Branch B": "الفرع ب",
};

export const decisionNames: Record<string, { en: string; ar: string }> = {
  "branch-model": { en: "Branch operating model", ar: "نظام تشغيل الفروع" },
  "booking-confirmation": { en: "Booking confirmation", ar: "تأكيد الحجز" },
  "daily-dropoff-limit": { en: "Maximum drop-offs per day", ar: "أقصى عدد عربيات للاستلام في اليوم" },
  "branch-working-hours": { en: "Working hours per day", ar: "ساعات العمل اليومية" },
  "clean-bays": { en: "Clean bays", ar: "بايات التنظيف" },
  "general-bays": { en: "General bays", ar: "البايات العادية" },
  "weekly-day-off": { en: "Weekly day off", ar: "يوم الإجازة كل أسبوع" },
  "tint-hours": { en: "Window tint bay-hours", ar: "ساعات باي تظليل النوافذ" },
  "ceramic-hours": { en: "Ceramic coating bay-hours", ar: "ساعات باي الطلاء السيراميك" },
  "intake-photos": { en: "Required intake photos", ar: "صور الاستلام المطلوبة" },
  "technician-assignment": { en: "Technician assignment", ar: "توزيع الشغل على الفنيين" },
  "job-lifecycle": { en: "Job lifecycle", ar: "مراحل الشغل" },
  "customer-updates": { en: "Customer status updates", ar: "تحديثات حالة العميل" },
};

export const categoryNames: Record<string, { en: string; ar: string }> = {
  Branches: { en: "Branches", ar: "الفروع" },
  Bookings: { en: "Bookings", ar: "الحجوزات" },
  Capacity: { en: "Capacity", ar: "الطاقة الاستيعابية" },
  Workshop: { en: "Workshop", ar: "الورشة" },
  Services: { en: "Services", ar: "الخدمات" },
  "Customer communication": { en: "Customer communication", ar: "التواصل مع العملاء" },
  Language: { en: "Language", ar: "اللغة" },
};

export const serviceNames: Record<string, { en: string; ar: string }> = {
  Inspection: { en: "Inspection", ar: "كشف" },
  "Window tint": { en: "Window tint", ar: "تظليل النوافذ" },
  "Audio upgrade": { en: "Audio upgrade", ar: "تطوير النظام الصوتي" },
  "Ceramic coating": { en: "Ceramic coating", ar: "طلاء سيراميك" },
  "Full PPF": { en: "Full PPF", ar: "حماية كاملة للدهان" },
};

export const decisionCopy: Record<string, { question: string; impact: string; options: Record<string, string> }> = {
  "branch-model": { question: "الفرعين هيشاركوا الموظفين والحجوزات والموارد إزاي؟", impact: "ده بيأثر على مين يشوف الموظفين والحجوزات والمخزون وتقارير كل فرع.", options: { independent: "كل فرع يدير شغله اليومي لوحده.", shared: "ممكن فروع تشارك بعض الموظفين أو المخزون أو الطاقة الاستيعابية.", mixed: "نحدد المشاركة لكل مورد لوحده." } },
  "booking-confirmation": { question: "الحجز هيتأكد إمتى؟", impact: "ده بيأثر على تأكيدات العملاء وحجز السعة ومراجعة الفريق.", options: { instant: "النظام بيأكد الحجز أول ما السعة تبقى متاحة.", "staff-review": "موظف الاستقبال بيراجع الطلب قبل التأكيد.", "manager-review": "طلبات معينة محتاجة تأكيد المدير." } },
  "daily-dropoff-limit": { question: "الفرع يقدر يستقبل كام عربية في اليوم؟", impact: "ده بيحدد قبول الحجوزات بعيداً عن سعة ساعات البايات.", options: { "4": "حد يومي أقل للاستلام.", "6": "حد يومي متوسط للاستلام.", "8": "حد يومي أعلى للاستلام.", "10": "أعلى اختيار؛ راجع عدد الموظفين والبايات." } },
  "branch-working-hours": { question: "نستخدم كام ساعة تشغيل في تجربة حساب السعة؟", impact: "ده بيحدد ساعات البايات المتاحة كل يوم. لازم المالك يأكد مواعيد الفتح والراحة الفعلية.", options: { "8": "يوم شغل أقصر للتجربة.", "10": "يوم الشغل المقترح للعرض.", "12": "يوم شغل أطول للتجربة." } },
  "clean-bays": { question: "نحسب كام باي تنظيف للفرع ده؟", impact: "ده بيأثر على خدمات محتاجة باي تنظيف، زي السيراميك وحماية الدهان.", options: { "1": "سعة أقل للتجربة.", "2": "سعة الفرع أ في العينة.", "3": "سعة أكبر؛ راجع موقع الشغل." } },
  "general-bays": { question: "نحسب كام باي عادي للفرع ده؟", impact: "ده بيأثر على خدمات زي الكشف والتظليل والصوتيات.", options: { "2": "سعة أقل للتجربة.", "3": "سعة الفرع ب في العينة.", "4": "سعة الفرع أ في العينة.", "5": "سعة أكبر؛ راجع موقع الشغل." } },
  "weekly-day-off": { question: "نعتبر أنهي يوم إجازة أسبوعية عادية للحجوزات؟", impact: "ده بيأثر على مواعيد الاستلام المتاحة ووقت التذكيرات.", options: { Friday: "تقويم أسبوعي تجريبي.", Sunday: "اختيار تاني ليوم الإجازة.", None: "كل الأيام متاحة حسب مواعيد الشغل اللي يحددها المالك." } },
  "tint-hours": { question: "خدمة التظليل في العينة محتاجة كام ساعة باي؟", impact: "ده بيغيّر سعة البايات العادية المتاحة في اليوم.", options: { "2": "خدمة أقصر للتجربة.", "3": "المدة المقترحة في العينة.", "4": "خدمة أطول للتجربة.", "6": "خدمة بمدة أطول." } },
  "ceramic-hours": { question: "خدمة السيراميك في العينة محتاجة كام ساعة باي؟", impact: "ده بيغيّر سعة بايات التنظيف في يوم الحجز. لازم نراجع وقت المعالجة والانتظار بره الباي.", options: { "12": "خدمة أقصر للتجربة.", "20": "المدة المقترحة في العينة.", "30": "خدمة أطول للتجربة." } },
  "intake-photos": { question: "محتاجين صور إيه قبل ما نسجل استلام العربية؟", impact: "ده بيأثر على وقت الاستلام واكتمال الصور وخطوات تسجيل الدخول.", options: { "0": "الفريق يقدر يسجل الحالة من غير صور إلزامية.", "2": "صور أقل مطلوبة.", "4": "قدام وورا والجانبين؛ اقتراح للتجربة." } },
  "technician-assignment": { question: "هنوزّع الشغل إزاي على الفنيين المناسبين؟", impact: "ده بيأثر على متابعة ضغط الشغل والصلاحيات والمسؤولية وقت التسليم.", options: { manager: "المدير يختار الفني أو الفريق.", "self-claim": "الفنيين يختاروا الشغل المتاح بنفسهم.", hybrid: "النظام يقترح والمدير يأكد." } },
  "job-lifecycle": { question: "إيه المراحل الأساسية اللي الفريق هيتابعها لكل عربية؟", impact: "ده بيأثر على شغل الفنيين وتقارير المدير والحالة اللي بتظهر للعميل.", options: { standard: "اتحجزت ← اتسلمت ← شغالة ← فحص الجودة ← جاهزة ← اتسلّمت.", expanded: "نضيف مرحلتي انتظار وإعادة شغل بعد موافقة المالك." } },
  "customer-updates": { question: "أنهي مراحل الشغل تبعت تحديث للعميل؟", impact: "الرسائل ممكن تعمل توقعات عند العميل، فلازم نصها وموافقتها ومزود الإرسال يبقوا جاهزين.", options: { off: "الفريق بيتواصل مع العملاء بنفسه.", milestones: "نبعت إشعار في مراحل متفق عليها، زي الاستلام والجاهزية.", all: "نبعت رسالة مع كل تغيير مرحلة بنأكده." } },
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
    const days: Record<string, string> = { Friday: "الجمعة", Sunday: "الأحد", None: "مفيش" };
    return lang === "ar" ? days[value] ?? option.label : option.label;
  }
  if (decision.id === "daily-dropoff-limit") return lang === "ar" ? `${value} عربيات` : option.label;
  if (["branch-working-hours", "tint-hours", "ceramic-hours"].includes(decision.id)) return lang === "ar" ? `${value} ساعة` : option.label;
  if (["clean-bays", "general-bays"].includes(decision.id)) return lang === "ar" ? `${value} ${value === "1" ? "باي" : "بايات"}` : option.label;
  if (decision.id === "intake-photos" && value === "0") return lang === "ar" ? "اختياري" : "Optional";
  if (decision.id === "intake-photos" && value === "4") return lang === "ar" ? "٤ زوايا" : "4 angles";
  if (decision.id === "intake-photos" && value === "2") return lang === "ar" ? "صورتين" : "2 photos";
  if (lang === "en") return option.label;
  const labels: Record<string, string> = {
    mixed: "مشترك حسب الحاجة", independent: "مستقل", shared: "مشترك", instant: "تأكيد فوري لما السعة تسمح",
    "staff-review": "تأكيد الاستقبال", "manager-review": "تأكيد المدير", manager: "المدير يوزّع الشغل",
    "self-claim": "الفني يختار الشغل", hybrid: "النظام يقترح", standard: "مراحل أساسية",
    expanded: "مراحل أكتر", off: "من غير تحديثات تلقائية", milestones: "مراحل محددة",
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
  if (status === "pending") label = lang === "ar" ? "مستني المراجعة" : "Pending review";
  else if (status === "confirmed") label = lang === "ar" ? "اتأكد" : "Confirmed";
  else if (status === "cancelled") label = lang === "ar" ? "اتلغى" : "Cancelled";
  else if (status === "no-show") label = lang === "ar" ? "ماجاش" : "No-show";
  else if (status === "proposed") label = lang === "ar" ? "مقترح" : "Proposed";
  else if (status === "active") label = lang === "ar" ? "شغّال" : "Active";
  else if (status === "on-hold") label = lang === "ar" ? "لسه مش متاح" : "On hold";
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
