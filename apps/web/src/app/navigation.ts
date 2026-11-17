import {
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Gauge,
  Gift,
  MessageCircle,
  Package,
  Settings2,
  ShieldCheck,
  Truck,
  UserRoundCog,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { GarageRole, PageId } from "@garage/domain";

export type NavigationGroupId = "operations" | "customer-care" | "management";

export interface WorkspaceNavigationItem {
  id: PageId;
  path: string;
  icon: LucideIcon;
  en: string;
  ar: string;
  group: NavigationGroupId;
  roles: GarageRole[];
}

export const navigationGroups: Array<{
  id: NavigationGroupId;
  en: string;
  ar: string;
  descriptionEn: string;
  descriptionAr: string;
}> = [
  {
    id: "operations",
    en: "Daily operations",
    ar: "التشغيل اليومي",
    descriptionEn: "Bookings, customer conversations, branch work, and vehicle progress.",
    descriptionAr: "الحجوزات ومحادثات العملاء وشغل الفروع ومراحل المركبات.",
  },
  {
    id: "customer-care",
    en: "Customer offers and care",
    ar: "عروض العملاء وخدماتهم",
    descriptionEn: "Catalogue, quotes, reservations, benefits, and warranty records.",
    descriptionAr: "الكتالوج وعروض الأسعار والحجوزات المؤجلة والمنافع وسجلات الضمان.",
  },
  {
    id: "management",
    en: "Business management",
    ar: "إدارة النشاط",
    descriptionEn: "Owner reporting, business settings, and staff access.",
    descriptionAr: "تقارير المالك وإعدادات النشاط وصلاحيات الموظفين.",
  },
];

export const navigation: WorkspaceNavigationItem[] = [
  { id: "overview", path: "/workspace/overview", icon: Gauge, en: "Overview", ar: "نظرة عامة", group: "operations", roles: ["owner", "branch-manager"] },
  { id: "whatsapp", path: "/workspace/whatsapp", icon: MessageCircle, en: "Messaging inbox", ar: "صندوق الرسائل", group: "operations", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "bookings", path: "/workspace/bookings", icon: CalendarDays, en: "Bookings", ar: "الحجوزات", group: "operations", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "workshop", path: "/workspace/workshop", icon: Wrench, en: "Workshop", ar: "الورشة", group: "operations", roles: ["owner", "branch-manager", "technician"] },
  { id: "customers", path: "/workspace/customers", icon: Users, en: "Customers", ar: "العملاء", group: "operations", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "transport", path: "/workspace/transport", icon: Truck, en: "Transport", ar: "النقل", group: "operations", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "catalogue", path: "/workspace/catalogue", icon: Package, en: "Catalogue", ar: "الكتالوج", group: "customer-care", roles: ["owner"] },
  { id: "quotes", path: "/workspace/quotes", icon: ClipboardList, en: "Quotes", ar: "عروض الأسعار", group: "customer-care", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "promotions", path: "/workspace/promotions", icon: CircleDollarSign, en: "Promotions", ar: "العروض الترويجية", group: "customer-care", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "reservations", path: "/workspace/reservations", icon: CalendarDays, en: "Reservations", ar: "الحجوزات المؤجلة", group: "customer-care", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "benefits", path: "/workspace/benefits", icon: Gift, en: "Benefits", ar: "المنافع", group: "customer-care", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "warranties", path: "/workspace/warranties", icon: ShieldCheck, en: "Warranties", ar: "الضمانات", group: "customer-care", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "finance", path: "/workspace/finance", icon: CircleDollarSign, en: "Operational finance", ar: "المالية التشغيلية", group: "management", roles: ["owner"] },
  { id: "settings", path: "/workspace/settings", icon: Settings2, en: "Settings", ar: "الإعدادات", group: "management", roles: ["owner"] },
  { id: "staff", path: "/workspace/staff", icon: UserRoundCog, en: "Staff access", ar: "صلاحيات الموظفين", group: "management", roles: ["owner"] },
];

const primaryNavigationByRole: Record<GarageRole, PageId[]> = {
  owner: ["overview", "whatsapp", "bookings", "workshop"],
  "branch-manager": ["overview", "whatsapp", "bookings", "workshop"],
  receptionist: ["whatsapp", "bookings", "customers", "workshop"],
  technician: ["workshop"],
};

export function navigationForRole(role: GarageRole) {
  return navigation.filter((item) => item.roles.includes(role));
}

export function groupedNavigationForRole(role: GarageRole) {
  const visible = navigationForRole(role);
  return navigationGroups
    .map((group) => ({ ...group, items: visible.filter((item) => item.group === group.id) }))
    .filter((group) => group.items.length > 0);
}

export function primaryNavigationForRole(role: GarageRole) {
  const visible = navigationForRole(role);
  return primaryNavigationByRole[role]
    .map((id) => visible.find((item) => item.id === id))
    .filter((item): item is WorkspaceNavigationItem => item !== undefined);
}
