import type { GarageRole } from "@garage/domain";

export interface StaffMember {
  userId: string;
  email: string;
  name: string;
  role: GarageRole;
  branchIds: string[];
  status: "active" | "inactive";
  permissions?: Partial<Record<string, boolean>>;
}

export interface StaffInvitation {
  id: string;
  email: string;
  role: GarageRole;
  branchIds: string[];
  status: string;
}

export interface CapabilityInfo {
  all: string[];
  ownerOnly: string[];
  roleDefaults: Record<GarageRole, string[]>;
}

export const capabilityLabels: Record<string, { en: string; ar: string }> = {
  "bookings.manage": { en: "Manage bookings", ar: "إدارة الحجوزات" },
  "customers.read": { en: "View customers", ar: "عرض العملاء" },
  "whatsapp.use": { en: "Use WhatsApp inbox", ar: "استخدام صندوق واتساب" },
  "transport.coordinate": { en: "Coordinate transport", ar: "تنسيق النقل" },
  "warranty.view": { en: "View warranties", ar: "عرض الضمانات" },
  "warranty.issue": { en: "Issue warranties", ar: "إصدار الضمانات" },
  "warranty.review": { en: "Review warranty claims", ar: "مراجعة مطالبات الضمان" },
  "warranty.void": { en: "Void warranties", ar: "إلغاء الضمانات" },
  "warranty.policies": { en: "Manage warranty policies", ar: "إدارة سياسات الضمان" },
  "catalogue.manage": { en: "Manage catalogue", ar: "إدارة الكتالوج" },
  "finance.view": { en: "View finance", ar: "عرض الماليات" },
  "special-requests.review": { en: "Review special requests", ar: "مراجعة الطلبات الخاصة" },
  "settings.manage": { en: "Manage settings", ar: "إدارة الإعدادات" },
  "staff.manage": { en: "Manage staff", ar: "إدارة الفريق" },
  "invoices.view": { en: "View invoices", ar: "عرض الفواتير" },
  "invoices.manage": { en: "Edit and issue invoices", ar: "تعديل الفواتير وإصدارها" },
  "invoices.payments": { en: "Record payments, void and correct invoices", ar: "تسجيل الدفعات وإلغاء الفواتير وتصحيحها" },
  "quotes.view": { en: "View quotes and offers (read only)", ar: "عرض العروض والتسعيرات (قراءة فقط)" },
  "quotes.manage": { en: "Create and edit quotes and offers", ar: "إنشاء وتعديل العروض والتسعيرات" },
};

/** Short hint under a capability name where the label alone is not enough. */
export const capabilityHints: Record<string, { en: string; ar: string }> = {
  "invoices.view": { en: "Invoice list, details and invoice summaries on customer and vehicle records.", ar: "قائمة الفواتير وتفاصيلها وملخصها في سجلات العملاء والمركبات." },
  "invoices.manage": { en: "Edit drafts, generate and issue. Needs View invoices.", ar: "تعديل المسودات وإنشاؤها وإصدارها. تتطلب عرض الفواتير." },
  "invoices.payments": { en: "Money actions: record payments, void, correct. Needs View invoices.", ar: "إجراءات مالية: تسجيل الدفعات والإلغاء والتصحيح. تتطلب عرض الفواتير." },
  "quotes.view": { en: "Can open Quotes & offers but cannot change anything.", ar: "يفتح العروض والتسعيرات دون أي تعديل." },
  "quotes.manage": { en: "Includes creating, offering, reserving and cancelling.", ar: "تشمل الإنشاء والعرض والحجز والإلغاء." },
};

export interface CapabilityGroup { id: string; en: string; ar: string; capabilities: string[] }

const capabilityGroupDefs: CapabilityGroup[] = [
  { id: "front-desk", en: "Front desk", ar: "الاستقبال", capabilities: ["bookings.manage", "customers.read", "whatsapp.use", "transport.coordinate"] },
  { id: "warranty", en: "Warranty", ar: "الضمان", capabilities: ["warranty.view", "warranty.issue", "warranty.review", "warranty.void", "warranty.policies"] },
  { id: "quotes", en: "Quotes & offers", ar: "العروض والتسعيرات", capabilities: ["quotes.view", "quotes.manage"] },
  { id: "invoices", en: "Invoices", ar: "الفواتير", capabilities: ["invoices.view", "invoices.manage", "invoices.payments"] },
  { id: "business", en: "Business", ar: "الأعمال", capabilities: ["catalogue.manage", "finance.view", "special-requests.review"] },
  { id: "admin", en: "Administration", ar: "الإدارة", capabilities: ["settings.manage", "staff.manage"] },
];

/** Groups the server's capability list; unknown capabilities land in an "Other" group so none is hidden. */
export function groupCapabilities(all: string[]): CapabilityGroup[] {
  const known = new Set(capabilityGroupDefs.flatMap((group) => group.capabilities));
  const groups = capabilityGroupDefs
    .map((group) => ({ ...group, capabilities: group.capabilities.filter((capability) => all.includes(capability)) }))
    .filter((group) => group.capabilities.length > 0);
  const other = all.filter((capability) => !known.has(capability));
  return other.length ? [...groups, { id: "other", en: "Other", ar: "أخرى", capabilities: other }] : groups;
}

export function effectiveAllowed(roleDefaults: string[], overrides: Record<string, boolean>, capability: string): boolean {
  return capability in overrides ? overrides[capability] : roleDefaults.includes(capability);
}

/** Next draft after toggling; an override equal to the role default is dropped. */
export function toggleOverride(draft: Record<string, boolean>, capability: string, checked: boolean, roleDefault: boolean): Record<string, boolean> {
  const next = { ...draft };
  if (checked === roleDefault) delete next[capability]; else next[capability] = checked;
  return next;
}

export function sameOverrides(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

export interface MemberFilter { query: string; role: string; status: string }

export function filterMembers(members: StaffMember[], filter: MemberFilter): StaffMember[] {
  const query = filter.query.trim().toLowerCase();
  return members.filter((member) =>
    (!filter.role || member.role === filter.role)
    && (!filter.status || member.status === filter.status)
    && (!query || `${member.name} ${member.email}`.toLowerCase().includes(query)));
}

export function overrideCount(member: Pick<StaffMember, "permissions">): number {
  return Object.keys(member.permissions ?? {}).length;
}

export function isDemoMember(member: Pick<StaffMember, "userId">): boolean {
  return member.userId.startsWith("demo-");
}

const ARABIC_SCRIPT = new RegExp("[\u0600-\u06FF]");
const LATIN_SCRIPT = /[A-Za-z]/;

/**
 * Names are sometimes stored as "Arabic name (Latin name)" or the reverse. Show the part in the viewer's script
 * instead of a mixed-script string; anything else is returned untouched.
 */
export function localisedName(name: string, lang: "ar" | "en"): string {
  const match = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(name.trim());
  if (!match) return name;
  const [, outer, inner] = match;
  const parts = [outer.trim(), inner.trim()];
  const arabic = parts.find((part) => ARABIC_SCRIPT.test(part) && !LATIN_SCRIPT.test(part));
  const latin = parts.find((part) => LATIN_SCRIPT.test(part) && !ARABIC_SCRIPT.test(part));
  if (!arabic || !latin) return name;
  return lang === "ar" ? arabic : latin;
}
