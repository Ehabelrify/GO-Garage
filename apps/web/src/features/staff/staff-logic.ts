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
};

export interface CapabilityGroup { id: string; en: string; ar: string; capabilities: string[] }

const capabilityGroupDefs: CapabilityGroup[] = [
  { id: "front-desk", en: "Front desk", ar: "الاستقبال", capabilities: ["bookings.manage", "customers.read", "whatsapp.use", "transport.coordinate"] },
  { id: "warranty", en: "Warranty", ar: "الضمان", capabilities: ["warranty.view", "warranty.issue", "warranty.review", "warranty.void", "warranty.policies"] },
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
