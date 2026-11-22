import {
  BadgePercent,
  CalendarClock,
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

/**
 * Consolidated navigation (UI/UX audit 21 Nov 2026, section 2).
 *
 * Owner 10 items, branch manager 8 (Finance by finance.view), receptionist 5, technician 1.
 *
 * Several top-level pages were merged into one entry. Merged-away ids stay in `routeAliases`
 * (and `redirectedAliases`) so old URLs redirect to the parent with `?tab=`; the merged page owns its TabBar.
 *
 *   quotes       <- reservations, benefits, promotions (tab=...)
 *   bookings     <- transport (tab=transport)
 *   settings     <- staff (tab=access); Warranty tab hosts the warranty policy manager
 *
 * Menu roles are the default role matrix; the page itself still checks capabilities and the server decides.
 */

export interface WorkspaceNavigationItem {
  id: PageId;
  path: string;
  icon: LucideIcon;
  en: string;
  ar: string;
  roles: GarageRole[];
  /** Short labels for the phone bottom bar and the icon rail tooltip (one word where possible). */
  shortEn?: string;
  shortAr?: string;
}

const all: GarageRole[] = ["owner", "branch-manager", "receptionist", "technician"];
const office: GarageRole[] = ["owner", "branch-manager", "receptionist"];
const managers: GarageRole[] = ["owner", "branch-manager"];

/** Visible menu entries in display order (role order is applied by `navigationForRole`). */
export const navigation: WorkspaceNavigationItem[] = [
  { id: "overview", path: "/workspace/overview", icon: Gauge, en: "Overview", ar: "نظرة عامة", roles: managers },
  { id: "whatsapp", path: "/workspace/whatsapp", icon: MessageCircle, en: "Inbox", ar: "صندوق الرسائل", shortAr: "الرسائل", roles: office },
  { id: "bookings", path: "/workspace/bookings", icon: CalendarDays, en: "Bookings", ar: "الحجوزات", roles: office },
  { id: "workshop", path: "/workspace/workshop", icon: Wrench, en: "Workshop", ar: "الورشة", roles: ["owner", "branch-manager", "technician"] },
  { id: "customers", path: "/workspace/customers", icon: Users, en: "Customers", ar: "العملاء", shortEn: "Clients", roles: office },
  { id: "quotes", path: "/workspace/quotes", icon: ClipboardList, en: "Quotes & offers", ar: "عروض الأسعار والعروض", shortEn: "Quotes", shortAr: "العروض", roles: office },
  { id: "warranties", path: "/workspace/warranties", icon: ShieldCheck, en: "Warranties", ar: "الضمانات", shortEn: "Warranty", roles: office },
  { id: "finance", path: "/workspace/finance", icon: CircleDollarSign, en: "Finance", ar: "المالية", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "catalogue", path: "/workspace/catalogue", icon: Package, en: "Catalogue", ar: "الكتالوج", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "settings", path: "/workspace/settings", icon: Settings2, en: "Settings", ar: "الإعدادات", roles: ["owner"] },
];

export interface RouteAlias {
  /** Merged-away page id (old URL: /workspace/<id>). */
  id: PageId;
  /** Menu entry that now owns it. */
  parent: PageId;
  /** Tab inside the parent. */
  tab: string;
  icon: LucideIcon;
  en: string;
  ar: string;
  /** Roles allowed to open the old page (unchanged from before the merge). */
  roles: GarageRole[];
}

export const routeAliases: RouteAlias[] = [
  { id: "reservations", parent: "quotes", tab: "reservations", icon: CalendarClock, en: "Reservations", ar: "الحجوزات المؤجلة", roles: office },
  { id: "benefits", parent: "quotes", tab: "benefits", icon: Gift, en: "Benefits", ar: "المنافع", roles: office },
  { id: "promotions", parent: "quotes", tab: "promotions", icon: BadgePercent, en: "Promotions", ar: "العروض الترويجية", roles: office },
  { id: "transport", parent: "bookings", tab: "transport", icon: Truck, en: "Transport", ar: "النقل", roles: office },
  { id: "staff", parent: "settings", tab: "access", icon: UserRoundCog, en: "Staff access", ar: "صلاحيات الموظفين", roles: ["owner"] },
];

/**
 * Aliases whose merged page exists, so the old URL redirects to `/workspace/<parent>?tab=<tab>`.
 * All five merged pages are mounted (Quotes & offers, Bookings with Transport, Settings with Staff & permissions).
 */
export const redirectedAliases: ReadonlySet<PageId> = new Set<PageId>(["reservations", "benefits", "promotions", "transport", "staff"]);

const primaryNavigationByRole: Record<GarageRole, PageId[]> = {
  owner: ["overview", "whatsapp", "bookings", "workshop", "customers", "quotes", "warranties", "finance", "catalogue", "settings"],
  "branch-manager": ["overview", "whatsapp", "bookings", "workshop", "customers", "quotes", "warranties", "finance"],
  receptionist: ["whatsapp", "customers", "bookings", "quotes", "warranties"],
  technician: ["workshop"],
};

/** Bottom bar shows every item up to this many, otherwise the first (limit - 1) plus "More". */
export const MOBILE_BAR_LIMIT = 5;

/** Pages gated by one capability instead of the role matrix (the matrix is the default; an override can add or remove). */
const capabilityPages: Partial<Record<PageId, string>> = { finance: "finance.view", catalogue: "catalogue.manage" };

/** Pages visible with any one of several capabilities (Quotes & offers: view or manage). */
const anyCapabilityPages: Partial<Record<PageId, string[]>> = { quotes: ["quotes.view", "quotes.manage"] };

/** Capability probe for the signed-in actor; omit to use the role defaults only. */
export type CapabilityProbe = (capability: string) => boolean;

export function navigationForRole(role: GarageRole, has?: CapabilityProbe): WorkspaceNavigationItem[] {
  const gated = (id: PageId) => {
    if (has === undefined) return undefined;
    const any = anyCapabilityPages[id];
    if (any) return any.some((capability) => has(capability));
    const capability = capabilityPages[id];
    return capability !== undefined ? has(capability) : undefined;
  };
  const kept = primaryNavigationByRole[role].filter((id) => gated(id) ?? true);
  // Capability-gated pages the role does not list by default are appended (settings stays last for owners, who list it by default).
  const extra = has ? ([...Object.keys(capabilityPages), ...Object.keys(anyCapabilityPages)] as PageId[]).filter((id) => !kept.includes(id) && gated(id)) : [];
  return [...kept, ...extra]
    .map((id) => navigation.find((item) => item.id === id))
    .filter((item): item is WorkspaceNavigationItem => item !== undefined);
}

/** Items shown directly in the mobile bottom bar. */
export function primaryNavigationForRole(role: GarageRole, has?: CapabilityProbe): WorkspaceNavigationItem[] {
  const items = navigationForRole(role, has);
  return items.length <= MOBILE_BAR_LIMIT ? items : items.slice(0, MOBILE_BAR_LIMIT - 1);
}

/** Items behind the mobile "More" button (empty when everything fits in the bar). */
export function overflowNavigationForRole(role: GarageRole, has?: CapabilityProbe): WorkspaceNavigationItem[] {
  const items = navigationForRole(role, has);
  return items.length <= MOBILE_BAR_LIMIT ? [] : items.slice(MOBILE_BAR_LIMIT - 1);
}

export function aliasFor(page: string): RouteAlias | undefined {
  return routeAliases.find((alias) => alias.id === page);
}

export interface ResolvedPage {
  /** Page to render (may be a legacy alias page). */
  page: PageId;
  /** Menu entry to highlight. */
  menu: PageId;
  /** Set when the URL should be replaced with the merged route. */
  redirectTo?: string;
}

/** Resolve a URL segment for a role. Returns null when the role may not open it (caller redirects to the default page). */
export function resolveWorkspacePage(role: GarageRole, segment: string | undefined, has?: CapabilityProbe): ResolvedPage | null {
  if (!segment) return null;
  const direct = navigationForRole(role, has).find((item) => item.id === segment);
  if (direct) return { page: direct.id, menu: direct.id };
  const alias = aliasFor(segment);
  if (!alias || !alias.roles.includes(role)) return null;
  if (!navigationForRole(role, has).some((item) => item.id === alias.parent)) return null;
  return {
    page: alias.id,
    menu: alias.parent,
    redirectTo: redirectedAliases.has(alias.id) ? `/workspace/${alias.parent}?tab=${alias.tab}` : undefined,
  };
}

/** Temporary sub-page tabs for a menu entry (parent first), limited to what the role may open. */
export function sectionPagesFor(role: GarageRole, menu: PageId): Array<{ id: PageId; path: string; en: string; ar: string }> {
  const aliases = routeAliases.filter((alias) => alias.parent === menu && alias.roles.includes(role) && !redirectedAliases.has(alias.id));
  if (aliases.length === 0) return [];
  const parent = navigation.find((item) => item.id === menu);
  if (!parent) return [];
  return [
    { id: parent.id, path: parent.path, en: parent.en, ar: parent.ar },
    ...aliases.map((alias) => ({ id: alias.id, path: `/workspace/${alias.id}`, en: alias.en, ar: alias.ar })),
  ];
}

export function defaultPageForRole(role: GarageRole): PageId {
  return role === "receptionist" ? "whatsapp" : role === "technician" ? "workshop" : "overview";
}

export const allRoles = all;
