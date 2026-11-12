import { createContext, useContext, useState, type ReactNode } from "react";
import { ArrowUpLeft, Building2, CalendarDays, ClipboardList, Gauge, Settings2, ShieldCheck, Wrench } from "lucide-react";

export type GaragePage = "OwnerOverview" | "OwnerSettings" | "BranchManager" | "Receptionist" | "Technician";
type Props = { page: GaragePage; children: ReactNode; branch?: string };
const GarageLangContext = createContext<"ar" | "en">("ar");
export function useGarageLang() { return useContext(GarageLangContext); }

const pages: { id: GaragePage; icon: typeof Gauge; ar: string; en: string }[] = [
  { id: "OwnerOverview", icon: Gauge, ar: "ملخص المالك", en: "Owner overview" },
  { id: "OwnerSettings", icon: Settings2, ar: "إعدادات التشغيل", en: "Operating settings" },
  { id: "BranchManager", icon: Building2, ar: "إدارة الفرع", en: "Branch manager" },
  { id: "Receptionist", icon: CalendarDays, ar: "الاستقبال والحجوزات", en: "Reception & bookings" },
  { id: "Technician", icon: Wrench, ar: "مساحة الفني", en: "Technician workspace" },
];

export function AppLayout({ page, children, branch = "كل الفروع" }: Props) {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const ar = lang === "ar";
  const nav = pages.map(({ id, icon: Icon, ar: labelAr, en }) => (
    <a key={id} className={`go-nav-link ${page === id ? "is-active" : ""}`} href={`/__mockup/preview/garage-os/${id}`} aria-current={page === id ? "page" : undefined}>
      <Icon size={17} strokeWidth={1.8} /><span>{ar ? labelAr : en}</span>
    </a>
  ));
  return <div className="go-root" dir={ar ? "rtl" : "ltr"}>
    <div className="go-shell">
      <aside className="go-sidebar">
        <div className="go-brand"><div className="go-brand-mark"><Wrench size={19} strokeWidth={1.7} /></div><div><div className="go-brand-name">Garage OS</div><div className="go-brand-sub">GO STORES · EGYPT</div></div></div>
        <div className="go-nav-title">{ar ? "مساحات العمل" : "WORKSPACES"}</div>
        <nav className="go-nav" aria-label={ar ? "مساحات العمل" : "Workspaces"}>{nav}</nav>
        <div className="go-side-spacer" />
        <div className="go-side-note"><strong>{ar ? "نظام جو ستورز الداخلي" : "Go Stores internal system"}</strong>{ar ? "فرعان · حماية سيارات · مصر" : "Two branches · vehicle protection · Egypt"}</div>
      </aside>
      <div className="go-main">
        <header className="go-topbar">
          <div className="go-top-start"><span className="go-branch-pill"><span className="go-branch-dot" />{ar ? branch : branch === "كل الفروع" ? "All branches" : branch}</span><span className="go-context"><ShieldCheck size={14} />{ar ? "مساحة تشغيلية" : "Operations workspace"}</span></div>
          <div className="go-top-end"><div className="go-language" aria-label={ar ? "اختيار اللغة" : "Choose language"}><button type="button" className={ar ? "active" : ""} onClick={() => setLang("ar")}>عربي</button><button type="button" className={!ar ? "active" : ""} onClick={() => setLang("en")}>EN</button></div></div>
        </header>
        <GarageLangContext.Provider value={lang}><main className="go-content" key={page}>{children}</main></GarageLangContext.Provider>
      </div>
      <nav className="go-mobile-nav" aria-label={ar ? "مساحات العمل" : "Workspaces"}>{nav}</nav>
    </div>
  </div>;
}

export function PageHeading({ eyebrow, title, subtitle, extra }: { eyebrow: string; title: string; subtitle: string; extra?: ReactNode }) {
  return <div className="go-heading"><div><div className="go-eyebrow">{eyebrow}</div><h1>{title}</h1><p className="go-subtitle">{subtitle}</p></div>{extra}</div>;
}

export function PanelTitle({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="go-panel-title"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>;
}

export function Hold({ title, detail }: { title: string; detail: string }) {
  return <div className="go-onhold" aria-label={`${title}: On hold`}><div><strong>{title}</strong><p>{detail}</p></div><span className="go-hold-label">ON HOLD</span></div>;
}

export function Stage({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "ok" | "warn" | "hold" }) {
  return <span className={`go-status ${tone}`}>{children}</span>;
}

export function BreadcrumbHint({ children }: { children: ReactNode }) {
  return <span className="go-context"><ClipboardList size={14} />{children}<ArrowUpLeft size={13} /></span>;
}
