import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ClipboardList, LogOut, MoreHorizontal, ShieldAlert, Wrench, X } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { Link, useLocation } from "wouter";
import { useGarageStore, type GarageActor } from "../shared/store";
import { RouteChunk } from "./RouteChunk";
import type { GarageRole } from "@garage/domain";
import { branchDisplay, customerDisplay, serviceDisplay, type Lang, type ModalConfig } from "../shared/ui";
import { ConfirmDialog } from "../shared/components/ConfirmDialog";
import { GlobalSearch } from "../shared/components/GlobalSearch";
import { RecordProvider } from "../shared/components/RecordRef";
import { ViewerProvider } from "../shared/viewer";
import { ShortcutsHost } from "./ShortcutsHost";
import { hasCapability } from "../shared/capabilities";
import { useFullPrecision } from "../shared/preferences";
import { buildRecordRegistry } from "./record-registry";
import { IntakeButton, IntakeHost, canOpenIntake } from "../features/intake/IntakeHost";
import {
  defaultPageForRole, navigationForRole, overflowNavigationForRole, primaryNavigationForRole,
  resolveWorkspacePage, sectionPagesFor,
} from "./navigation";
const overviewPage = () => import("../features/overview/OverviewPage").then((m) => ({ default: m.OverviewPage }));
const settingsPage = () => import("../features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage }));
const bookingsPage = () => import("../features/bookings/BookingsAndTransport").then((m) => ({ default: m.BookingsAndTransport }));
const workshopPage = () => import("../features/workshop/WorkshopPage").then((m) => ({ default: m.WorkshopPage }));
const customersPage = () => import("../features/customers/CustomersPage").then((m) => ({ default: m.CustomersPage }));
const warrantiesPage = () => import("../features/warranty/WarrantiesPage").then((m) => ({ default: m.WarrantiesPage }));
const whatsappPage = () => import("../features/whatsapp/MessagingWorkspacePage").then((m) => ({ default: m.MessagingWorkspacePage }));
const cataloguePage = () => import("../features/catalogue/CataloguePage").then((m) => ({ default: m.CataloguePage }));
const quotesPage = () => import("../features/quotes/QuoteWorkspace").then((m) => ({ default: m.QuotesAndOffers }));
const financePage = () => import("../features/finance/FinancePage").then((m) => ({ default: m.FinancePage }));

const roleLabels: Record<GarageRole, { en: string; ar: string }> = {
  owner: { en: "Owner", ar: "المالك" },
  "branch-manager": { en: "Branch manager", ar: "مدير الفرع" },
  receptionist: { en: "Reception", ar: "موظف الاستقبال" },
  technician: { en: "Technician", ar: "الفني" },
};

function LoadingWorkspace({ lang }: { lang: Lang }) {
  return <div className="workspace-state" role="status" dir={lang === "ar" ? "rtl" : "ltr"}><div className="brand-mark"><Wrench size={19} /></div><strong>Garage OS</strong><span>{lang === "ar" ? "جارٍ تحميل مساحة العمل..." : "Loading your workspace..."}</span><div className="loading-line" /></div>;
}

function AccessPending({ onSignOut, lang }: { onSignOut: () => void; lang: Lang }) {
  return <main className="access-state" dir={lang === "ar" ? "rtl" : "ltr"}>
    <div className="access-state-card">
      <div className="access-icon"><ShieldAlert size={24} /></div>
      <div className="eyebrow">{lang === "ar" ? "الحساب غير مخوّل بعد" : "ACCOUNT NOT ASSIGNED"}</div>
      <h1>{lang === "ar" ? "حساب جوجل هذا غير معتمد للدخول." : "This Google account is not approved for access."}</h1>
      <p>{lang === "ar" ? "الدخول بالدعوة فقط. اطلب من المالك إضافة بريد العمل الخاص بك، ثم سجّل الدخول مجددًا بنفس حساب جوجل. لم تُعرض أي بيانات تشغيلية لهذا الحساب." : "Access is invite-only. Ask the owner to add your work email, then sign in again with that Google account. No operational data has been opened for this account."}</p>
      <button className="btn" onClick={onSignOut}>{lang === "ar" ? "تسجيل الخروج" : "Sign out"}</button>
    </div>
  </main>;
}

function WorkspaceError({ onRetry, lang }: { onRetry: () => void; lang: Lang }) {
  return <main className="access-state" dir={lang === "ar" ? "rtl" : "ltr"}><div className="access-state-card">
    <div className="access-icon"><ShieldAlert size={24} /></div>
    <div className="eyebrow">GARAGE OS</div>
    <h1>{lang === "ar" ? "تعذر تحميل مساحة العمل" : "We could not load your workspace"}</h1>
    <p>{lang === "ar" ? "تعذر تحميل بيانات الحساب. حاول مرة أخرى." : "Your account data could not be loaded. Please try again."}</p>
    <button className="btn btn-primary" onClick={onRetry}>{lang === "ar" ? "حاول مرة أخرى" : "Try again"}</button>
  </div></main>;
}

export function App() {
  const store = useGarageStore();
  const lang = store.locale;
  const { signOut } = useClerk();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const leaveWorkspace = async () => {
    if (store.actor?.isDemo) {
      const response = await fetch("/api/demo/session", { method: "DELETE", credentials: "same-origin" }).catch(() => null);
      if (!response?.ok) return;
      setLocation("/");
      return;
    }
    await signOut({ redirectUrl: "/" });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (store.status === "loading") return <LoadingWorkspace lang={lang} />;
  if (store.status === "error") {
    if (store.errorCode === "ACCESS_PENDING") return <AccessPending lang={lang} onSignOut={() => void leaveWorkspace()} />;
    return <WorkspaceError lang={lang} onRetry={() => void store.refresh()} />;
  }
  if (!store.actor || !store.state) return <WorkspaceError lang={lang} onRetry={() => void store.refresh()} />;

  return <ReadyWorkspace
    actor={store.actor}
    state={store.state}
    store={store}
    userEmail={user?.primaryEmailAddress?.emailAddress ?? store.actor.email}
    navigate={setLocation}
    notify={setToast}
    signOut={() => void leaveWorkspace()}
    toast={toast}
    modal={modal}
    setModal={setModal}
  />;
}

function AvatarMenu({ lang, name, email, roleLabel, onLanguage, onSignOut }: {
  lang: Lang; name: string; email: string; roleLabel: string; onLanguage: (lang: Lang) => void; onSignOut: () => void;
}) {
  const t = (english: string, arabic: string) => lang === "ar" ? arabic : english;
  const [open, setOpen] = useState(false);
  const [fullPrecision, setFullPrecision] = useFullPrecision();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return <div className="avatar-menu" ref={root}>
    <button type="button" className="avatar-button" aria-haspopup="dialog" aria-expanded={open} aria-label={t("Account menu", "قائمة الحساب")} onClick={() => setOpen((value) => !value)}>
      <span className="avatar-initial">{name.slice(0, 1).toUpperCase()}</span><ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <div className="avatar-popover" role="dialog" aria-label={t("Account", "الحساب")}>
      <div className="avatar-identity"><strong>{name}</strong><span dir="ltr">{email}</span><span>{roleLabel}</span></div>
      <div className="avatar-row">
        <span>{t("Language", "اللغة")}</span>
        <div className="lang-switch" role="group" aria-label={t("Choose language", "اختر اللغة")}>
          <button type="button" className={lang === "ar" ? "selected" : ""} aria-pressed={lang === "ar"} onClick={() => onLanguage("ar")}>عربي</button>
          <button type="button" className={lang === "en" ? "selected" : ""} aria-pressed={lang === "en"} onClick={() => onLanguage("en")}>EN</button>
        </div>
      </div>
      <div className="avatar-row"><label><input type="checkbox" checked={fullPrecision} onChange={(event) => setFullPrecision(event.target.checked)} />{t("Show full precision", "إظهار الأرقام كاملة")}</label></div>
      <p className="avatar-hint">{t("Exact amounts with fractions everywhere. Saved on this device only.", "المبالغ الدقيقة بالكسور في كل مكان. تُحفظ على هذا الجهاز فقط.")}</p>
      <button type="button" className="btn avatar-signout" onClick={onSignOut}><LogOut size={15} aria-hidden="true" />{t("Sign out", "تسجيل الخروج")}</button>
    </div>}
  </div>;
}

function ReadyWorkspace({
  actor, state, store, userEmail, navigate, notify, signOut, toast, modal, setModal,
}: {
  actor: GarageActor;
  state: NonNullable<ReturnType<typeof useGarageStore>["state"]>;
  store: ReturnType<typeof useGarageStore>;
  userEmail: string;
  navigate: (path: string) => void;
  notify: (message: string) => void;
  signOut: () => void;
  toast: string;
  modal: ModalConfig | null;
  setModal: (config: ModalConfig | null) => void;
}) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const lang: Lang = state.locale;
  const rtl = lang === "ar";
  const t = (english: string, arabic: string) => lang === "ar" ? arabic : english;
  const segment = location.split("/").filter(Boolean).at(-1);
  const has = useMemo(() => (capability: string) => hasCapability(actor, capability as never), [actor]);
  const resolved = resolveWorkspacePage(actor.role, segment, has);
  const page = resolved?.page;
  const menuPage = resolved?.menu;
  const navItems = navigationForRole(actor.role, has);
  const mobileNavItems = primaryNavigationForRole(actor.role, has);
  const overflowItems = overflowNavigationForRole(actor.role, has);
  const sectionPages = menuPage ? sectionPagesFor(actor.role, menuPage) : [];
  const recordRegistry = useMemo(() => buildRecordRegistry(state, lang), [state, lang]);
  const defaultPage = defaultPageForRole(actor.role);
  const viewer = useMemo(() => ({ userId: actor.userId, role: actor.role, isDemo: Boolean(actor.isDemo) }), [actor.userId, actor.role, actor.isDemo]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!resolved) navigate(`/workspace/${defaultPage}`);
    else if (resolved.redirectTo) navigate(resolved.redirectTo);
  }, [resolved, defaultPage, navigate]);

  const branchName = (branchId: string) => {
    const branch = state.branches.find((item) => item.id === branchId);
    return branch ? branchDisplay(branch.name, lang) : branchId;
  };
  const customerName = (customerId: string) => {
    const customer = state.customers.find((item) => item.id === customerId);
    return customer ? customerDisplay(customer.name, lang) : "—";
  };
  const vehicleFor = (customerId: string, vehicleId: string) =>
    state.customers.find((customer) => customer.id === customerId)?.vehicles.find((vehicle) => vehicle.id === vehicleId);
  const serviceName = (serviceId: string) => {
    const service = state.services.find((item) => item.id === serviceId);
    return service ? serviceDisplay(service.name, lang) : "—";
  };
  const profileName = actor.name && actor.name !== actor.email ? actor.name : userEmail.split("@")[0];

  return <div className={`app-shell ${lang === "en" ? "locale-en" : ""}`} dir={rtl ? "rtl" : "ltr"}>
    <aside className="sidebar">
      <Link className="brand brand-link" href="/workspace/overview">
        <span className="brand-mark"><Wrench size={19} strokeWidth={1.7} /></span>
        <span><strong className="brand-name">Garage OS</strong><small className="brand-sub">GO STORES · EGYPT</small></span>
      </Link>
      <nav className="nav-list" aria-label={t("Main navigation", "التنقل الأساسي")}>
        {navItems.map(({ id, path, icon: Icon, en, ar }) => <Link key={id} className={`nav-item ${menuPage === id ? "active" : ""}`} href={path} title={t(en, ar)} aria-label={t(en, ar)} aria-current={menuPage === id ? "page" : undefined}>
          <Icon size={17} strokeWidth={1.8} /><span>{t(en, ar)}</span>
        </Link>)}
      </nav>
    </aside>

    <div className="main-area">
      {actor.isDemo && <div className="preview-banner" role="note"><ClipboardList size={13} aria-hidden="true" />{t("Role preview account", "حساب معاينة الدور")}</div>}
      <header className="topbar">
        <div className="topbar-start">
          {state.branches.length > 1 && <label className="branch-context">
            <span className="sr-only">{t("Branch", "الفرع")}</span>
            <select className="select branch-select" value={state.currentBranch} onChange={(event) => store.setCurrentBranch(event.target.value as typeof state.currentBranch)}>
              {actor.role === "owner" && <option value="all">{t("All branches", "كل الفروع")}</option>}
              {state.branches.map((branch) => <option key={branch.id} value={branch.id}>{branchName(branch.id)}</option>)}
            </select>
          </label>}
        </div>
        <div className="topbar-search"><GlobalSearch lang={lang} onNavigate={navigate} /></div>
        <div className="topbar-end">
          {canOpenIntake(actor) && <IntakeButton lang={lang} />}
          <AvatarMenu
            lang={lang}
            name={profileName}
            email={userEmail}
            roleLabel={t(roleLabels[actor.role].en, roleLabels[actor.role].ar)}
            onLanguage={(next) => store.setLocale(next)}
            onSignOut={signOut}
          />
        </div>
      </header>
      {sectionPages.length > 1 && <nav className="tabbar page-wrap-tabs" aria-label={t("Sections", "الأقسام")} style={{ paddingInline: "clamp(14px, 3vw, 34px)", background: "var(--paper)", marginBlockEnd: 0 }}>
        {sectionPages.map(({ id, path, en, ar }) => <Link key={id} className="tab" href={path} aria-current={page === id ? "page" : undefined}>{t(en, ar)}</Link>)}
      </nav>}
      {store.refreshWarning && <div role="alert" className="refresh-warning">
        {t("Your change may be saved, but the latest workspace data could not be loaded. The information shown may be outdated.", "قد يكون التغيير قد حُفظ، لكن تعذر تحميل أحدث بيانات مساحة العمل. قد تكون البيانات المعروضة قديمة.")}
        {" "}<button className="btn" type="button" onClick={() => void store.refresh()}>{t("Refresh data", "تحديث البيانات")}</button>
      </div>}
      <ViewerProvider viewer={viewer}><RecordProvider lang={lang} registry={recordRegistry}><main className="page-wrap" key={page}>
        {page === "overview" && <RouteChunk loader={overviewPage} lang={lang} pageProps={{ lang, t, state, navigate, branchName, notify }} />}
        {page === "catalogue" && hasCapability(actor, "catalogue.manage") && <RouteChunk loader={cataloguePage} lang={lang} pageProps={{ lang }} />}
        {page === "quotes" && (hasCapability(actor, "quotes.view") || hasCapability(actor, "quotes.manage")) && <RouteChunk loader={quotesPage} lang={lang} pageProps={{ lang }} />}
        {page === "finance" && hasCapability(actor, "finance.view") && <RouteChunk loader={financePage} lang={lang} pageProps={{ lang, branches: state.branches }} />}
        {page === "settings" && actor.role === "owner" && <RouteChunk loader={settingsPage} lang={lang} pageProps={{ lang, t, state, notify, branchName }} />}
        {page === "bookings" && <RouteChunk loader={bookingsPage} lang={lang} pageProps={{ lang, t, state, branchName, customerName, serviceName, vehicleFor, notify, confirmModal: setModal }} />}
        {page === "workshop" && <RouteChunk loader={workshopPage} lang={lang} pageProps={{ lang, t, state, branchName, customerName, serviceName, vehicleFor, notify, role: actor.role }} />}
        {page === "customers" && hasCapability(actor, "customers.read") && <RouteChunk loader={customersPage} lang={lang} pageProps={{ lang, t, state, notify }} />}
        {page === "warranties" && actor.role !== "technician" && <RouteChunk loader={warrantiesPage} lang={lang} pageProps={{ lang, t, state, notify }} />}
        {page === "whatsapp" && hasCapability(actor, "whatsapp.use") && <RouteChunk loader={whatsappPage} lang={lang} pageProps={{ lang, t, state, notify, branchName, role: actor.role }} />}
      </main><IntakeHost lang={lang} actor={actor} state={state} notify={notify} /><ShortcutsHost lang={lang} allowedPages={navItems.map((item) => item.id)} canIntake={canOpenIntake(actor)} navigate={navigate} /></RecordProvider></ViewerProvider>
    </div>

    <nav className="mobile-nav" aria-label={t("Quick navigation", "التنقل السريع")} data-count={mobileNavItems.length + Number(overflowItems.length > 0)}>
      {mobileNavItems.map(({ id, path, icon: Icon, en, ar, shortEn, shortAr }) => <Link key={id} className={`mobile-nav-item ${menuPage === id ? "active" : ""}`} href={path} aria-current={menuPage === id ? "page" : undefined}>
        <Icon size={18} /><span>{lang === "ar" ? shortAr ?? ar : shortEn ?? en}</span>
      </Link>)}
      {overflowItems.length > 0 && <button
        className={`mobile-nav-item mobile-nav-more ${overflowItems.some((item) => item.id === menuPage) ? "active" : ""}`}
        type="button"
        aria-expanded={mobileMenuOpen}
        aria-controls="mobile-workspace-menu"
        onClick={() => setMobileMenuOpen((open) => !open)}
      ><MoreHorizontal size={19} /><span>{t("More", "المزيد")}</span></button>}
    </nav>
    {mobileMenuOpen && <div className="mobile-menu-layer">
      <button className="mobile-menu-scrim" type="button" aria-label={t("Close navigation menu", "إغلاق قائمة التنقل")} onClick={() => setMobileMenuOpen(false)} />
      <nav className="mobile-workspace-menu" id="mobile-workspace-menu" aria-label={t("More sections", "المزيد من الأقسام")}>
        <div className="mobile-menu-head">
          <strong>{t("More", "المزيد")}</strong>
          <button type="button" aria-label={t("Close navigation", "إغلاق التنقل")} onClick={() => setMobileMenuOpen(false)}><X size={18} /></button>
        </div>
        <div className="mobile-menu-list">{overflowItems.map(({ id, path, icon: Icon, en, ar }) => <Link
          key={id}
          className={`mobile-route ${menuPage === id ? "active" : ""}`}
          href={path}
          aria-current={menuPage === id ? "page" : undefined}
        ><Icon size={17} /><span>{t(en, ar)}</span><span className="mobile-route-arrow" aria-hidden="true">→</span></Link>)}</div>
      </nav>
    </div>}
    {toast && <div role="status" className="toast"><CheckCircle2 size={17} />{toast}</div>}
    <ConfirmDialog open={modal !== null} lang={lang} title={modal?.title ?? ""} body={modal?.body} danger={modal?.danger} onCancel={() => setModal(null)} onConfirm={() => modal?.confirm()} />
  </div>;
}
