import { useEffect, useState } from "react";
import {
  Activity, CalendarDays, CheckCircle2, ChevronDown, CircleDollarSign, ClipboardList,
  Gauge, Gift, Package, ShieldAlert, ShieldCheck, Settings2, Truck, UserRoundCog, Users, Wrench, MessageCircle,
} from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { Link, useLocation } from "wouter";
import { useGarageStore, type GarageActor } from "../shared/store";
import { RouteChunk } from "./RouteChunk";
import type { GarageRole, PageId } from "@garage/domain";
import { branchDisplay, customerDisplay, serviceDisplay, type Lang, type ModalConfig } from "../shared/ui";
const overviewPage = () => import("../features/overview/OverviewPage").then((m) => ({ default: m.OverviewPage }));
const settingsPage = () => import("../features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage }));
const bookingsPage = () => import("../features/bookings/BookingsPage").then((m) => ({ default: m.BookingsPage }));
const workshopPage = () => import("../features/workshop/WorkshopPage").then((m) => ({ default: m.WorkshopPage }));
const customersPage = () => import("../features/customers/CustomersPage").then((m) => ({ default: m.CustomersPage }));
const staffPage = () => import("../features/staff/StaffPage").then((m) => ({ default: m.StaffPage }));
const warrantiesPage = () => import("../features/warranty/WarrantiesPage").then((m) => ({ default: m.WarrantiesPage }));
  const whatsappPage = () => import("../features/whatsapp/MessagingWorkspacePage").then((m) => ({ default: m.MessagingWorkspacePage }));
const cataloguePage = () => import("../features/catalogue/CataloguePage").then((m) => ({ default: m.CataloguePage }));
const quotesPage = () => import("../features/quotes/QuoteWorkspace").then((m) => ({ default: m.QuoteWorkspace }));
const promotionsPage = () => import("../features/promotions/QualificationForm").then((m) => ({ default: m.QualificationForm }));
const reservationsPage = () => import("../features/reservations/ReservationsPage").then((m) => ({ default: m.ReservationsPage }));
const benefitsPage = () => import("../features/benefits/BenefitsPage").then((m) => ({ default: m.BenefitsPage }));
const transportPage = () => import("../features/transport/TransportPage").then((m) => ({ default: m.TransportPage }));
const financePage = () => import("../features/finance/FinancePage").then((m) => ({ default: m.FinancePage }));

const roleLabels: Record<GarageRole, { en: string; ar: string }> = {
  owner: { en: "Owner", ar: "المالك" },
  "branch-manager": { en: "Branch manager", ar: "مدير الفرع" },
  receptionist: { en: "Reception", ar: "موظف الاستقبال" },
  technician: { en: "Technician", ar: "الفني" },
};

const navigation: Array<{
  id: PageId;
  path: string;
  icon: typeof Gauge;
  en: string;
  ar: string;
  roles: GarageRole[];
}> = [
  { id: "catalogue", path: "/workspace/catalogue", icon: Package, en: "Catalogue", ar: "الكتالوج", roles: ["owner"] },
  { id: "quotes", path: "/workspace/quotes", icon: ClipboardList, en: "Quotes", ar: "عروض الأسعار", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "promotions", path: "/workspace/promotions", icon: CircleDollarSign, en: "Promotions", ar: "العروض الترويجية", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "reservations", path: "/workspace/reservations", icon: CalendarDays, en: "Reservations", ar: "الحجوزات المؤجلة", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "benefits", path: "/workspace/benefits", icon: Gift, en: "Benefits", ar: "المنافع", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "transport", path: "/workspace/transport", icon: Truck, en: "Transport", ar: "النقل", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "finance", path: "/workspace/finance", icon: CircleDollarSign, en: "Operational finance", ar: "المالية التشغيلية", roles: ["owner"] },
  { id: "overview", path: "/workspace/overview", icon: Gauge, en: "Overview", ar: "نظرة عامة", roles: ["owner", "branch-manager"] },
  { id: "bookings", path: "/workspace/bookings", icon: CalendarDays, en: "Bookings", ar: "الحجوزات", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "workshop", path: "/workspace/workshop", icon: Wrench, en: "Workshop", ar: "الورشة", roles: ["owner", "branch-manager", "technician"] },
  { id: "customers", path: "/workspace/customers", icon: Users, en: "Customers", ar: "العملاء", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "warranties", path: "/workspace/warranties", icon: ShieldCheck, en: "Warranties", ar: "الضمانات", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "settings", path: "/workspace/settings", icon: Settings2, en: "Settings", ar: "الإعدادات", roles: ["owner"] },
  { id: "staff", path: "/workspace/staff", icon: UserRoundCog, en: "Staff access", ar: "صلاحيات الموظفين", roles: ["owner"] },
  { id: "whatsapp", path: "/workspace/whatsapp", icon: MessageCircle, en: "Messaging inbox", ar: "صندوق الرسائل", roles: ["owner", "branch-manager", "receptionist"] },
];

const holdItems = [
  { en: "WhatsApp connection", ar: "ربط واتساب", icon: MessageCircle },
  { en: "Inventory", ar: "المخزون", icon: Package },
  { en: "Payments", ar: "المدفوعات", icon: CircleDollarSign },
];

function LoadingWorkspace({ lang }: { lang: Lang }) {
  return <div className="workspace-state" role="status" dir={lang === "ar" ? "rtl" : "ltr"}><div className="brand-mark"><Wrench size={19} /></div><strong>Garage OS</strong><span>{lang === "ar" ? "بنحمّل مساحة العمل..." : "Loading your workspace..."}</span><div className="loading-line" /></div>;
}

function AccessPending({ onSignOut, lang }: { onSignOut: () => void; lang: Lang }) {
  return <main className="access-state" dir={lang === "ar" ? "rtl" : "ltr"}>
    <div className="access-state-card">
      <div className="access-icon"><ShieldAlert size={24} /></div>
      <div className="eyebrow">{lang === "ar" ? "الحساب لسه من غير صلاحية" : "ACCOUNT NOT ASSIGNED"}</div>
      <h1>{lang === "ar" ? "المالك لسه ماحددش صلاحية الحساب ده." : "This account has not been assigned a role yet."}</h1>
      <p>{lang === "ar" ? "لازم بريدك يكون هو نفس البريد اللي المالك بعت له دعوة. لحد دلوقتي، مافيش أي بيانات تشغيل ظهرت للحساب ده." : "Your email must match an invitation sent by the owner. No operational data has been opened for this account."}</p>
      <button className="btn" onClick={onSignOut}>{lang === "ar" ? "تسجيل الخروج" : "Sign out"}</button>
    </div>
  </main>;
}

function WorkspaceError({ onRetry, lang }: { onRetry: () => void; lang: Lang }) {
  return <main className="access-state" dir={lang === "ar" ? "rtl" : "ltr"}><div className="access-state-card">
    <div className="access-icon"><ShieldAlert size={24} /></div>
    <div className="eyebrow">GARAGE OS</div>
    <h1>{lang === "ar" ? "ماقدرناش نحمّل مساحة العمل" : "We could not load your workspace"}</h1>
    <p>{lang === "ar" ? "بيانات الحساب ما اتحمّلتش. جرّب تاني." : "Your account data could not be loaded. Please try again."}</p>
    <button className="btn btn-primary" onClick={onRetry}>{lang === "ar" ? "جرّب تاني" : "Try again"}</button>
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
  const lang: Lang = state.locale;
  const rtl = lang === "ar";
  const t = (english: string, arabic: string) => lang === "ar" ? arabic : english;
  const page = location.split("/").filter(Boolean).at(-1) as PageId | undefined;
  const navItems = navigation.filter((item) => item.roles.includes(actor.role));
  const selectedPage = navItems.find((item) => item.id === page);
  const defaultPage = actor.role === "receptionist" ? "bookings" : actor.role === "technician" ? "workshop" : "overview";

  useEffect(() => {
    if (!selectedPage) navigate(`/workspace/${defaultPage}`);
  }, [selectedPage, defaultPage, navigate]);

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
      <div className="nav-label">{t("Your workspace", "مساحة شغلك")}</div>
      <nav className="nav-list" aria-label={t("Main navigation", "التنقل الأساسي")}>
        {navItems.map(({ id, path, icon: Icon, en, ar }) => <Link key={id} className={`nav-item ${page === id ? "active" : ""}`} href={path} aria-current={page === id ? "page" : undefined}>
          <Icon size={18} strokeWidth={1.8} /><span>{t(en, ar)}</span>
        </Link>)}
      </nav>
      {(actor.role === "owner" || actor.role === "branch-manager") && <div className="hold-nav-block">
        <div className="nav-label">{t("On hold", "لسه مش متاح")}</div>
        {holdItems.map(({ en, ar, icon: Icon }) => <div className="nav-item nav-item-disabled" key={en} aria-disabled="true">
          <Icon size={17} /><span>{t(en, ar)}</span><span className="hold-mini">{t("On hold", "لسه مش متاح")}</span>
        </div>)}
      </div>}
      <div className="sidebar-spacer" />
      <div className="sidebar-account">
        <span className="account-avatar">{profileName.slice(0, 1).toUpperCase()}</span>
        <span className="account-copy"><strong>{profileName}</strong><small>{t(roleLabels[actor.role].en, roleLabels[actor.role].ar)}</small></span>
      </div>
      <button className="signout-button" type="button" onClick={signOut}>{t("Sign out", "تسجيل الخروج")}</button>
    </aside>

    <div className="main-area">
      <header className="topbar">
        <div className="topbar-start">
          {state.branches.length > 1 && <label className="branch-context">
            <span className="sr-only">{t("Branch", "الفرع")}</span>
            <select className="branch-select" value={state.currentBranch} onChange={(event) => store.setCurrentBranch(event.target.value as typeof state.currentBranch)}>
              {actor.role === "owner" && <option value="all">{t("All branches", "كل الفروع")}</option>}
              {state.branches.map((branch) => <option key={branch.id} value={branch.id}>{branchName(branch.id)}</option>)}
            </select><ChevronDown size={14} />
          </label>}
          <span className="workspace-role"><Activity size={14} />{t(roleLabels[actor.role].en, roleLabels[actor.role].ar)}</span>
        </div>
        <div className="topbar-end">
          {import.meta.env.DEV && <span className="environment-label"><ClipboardList size={13} />{actor.isDemo ? t("Temporary demo account", "حساب مؤقت للعرض") : t("Development sample data", "بيانات تجريبية للتطوير")}</span>}
          <div className="lang-switch" aria-label={t("Choose language", "اختار اللغة")}>
            <button className={lang === "ar" ? "selected" : ""} onClick={() => store.setLocale("ar")}>عربي</button>
            <button className={lang === "en" ? "selected" : ""} onClick={() => store.setLocale("en")}>EN</button>
          </div>
          <span className="header-user" title={userEmail}>{userEmail}</span>
          <button className="mobile-signout-button" type="button" onClick={signOut}>{t("Sign out", "تسجيل الخروج")}</button>
        </div>
      </header>
      {store.refreshWarning && <div role="alert" className="refresh-warning" style={{ padding: "12px 20px", background: "#fff3cd", color: "#513d00" }}>
        {t("Your change may be saved, but the latest workspace data could not be loaded. The information shown may be outdated.", "قد يكون التغيير اتحفظ، لكن ماقدرناش نحمّل أحدث بيانات مساحة العمل. البيانات الظاهرة ممكن تكون قديمة.")}
        {" "}<button className="btn" type="button" onClick={() => void store.refresh()}>{t("Refresh data", "تحديث البيانات")}</button>
      </div>}
      <main className="page-wrap" key={page}>
        {page === "overview" && <RouteChunk loader={overviewPage} lang={lang} pageProps={{ lang, t, state, navigate, branchName, notify }} />}
        {page === "catalogue" && actor.role === "owner" && <RouteChunk loader={cataloguePage} lang={lang} pageProps={{ lang }} />}
        {page === "quotes" && actor.role !== "technician" && <RouteChunk loader={quotesPage} lang={lang} pageProps={{ lang }} />}
        {page === "promotions" && actor.role !== "technician" && <RouteChunk loader={promotionsPage} lang={lang} pageProps={{ lang, actorId:actor.userId, actorRole:actor.role }} />}
        {page === "reservations" && actor.role !== "technician" && <RouteChunk loader={reservationsPage} lang={lang} pageProps={{ lang }} />}
        {page === "benefits" && actor.role !== "technician" && <RouteChunk loader={benefitsPage} lang={lang} pageProps={{ lang }} />}
        {page === "transport" && actor.role !== "technician" && <RouteChunk loader={transportPage} lang={lang} pageProps={{ lang }} />}
        {page === "finance" && actor.role === "owner" && <RouteChunk loader={financePage} lang={lang} pageProps={{ lang, branches: state.branches }} />}
        {page === "settings" && actor.role === "owner" && <RouteChunk loader={settingsPage} lang={lang} pageProps={{ lang, t, state, notify, branchName }} />}
        {page === "bookings" && <RouteChunk loader={bookingsPage} lang={lang} pageProps={{ lang, t, state, branchName, customerName, serviceName, vehicleFor, notify, confirmModal: setModal }} />}
        {page === "workshop" && <RouteChunk loader={workshopPage} lang={lang} pageProps={{ lang, t, state, branchName, customerName, serviceName, vehicleFor, notify, role: actor.role }} />}
        {page === "customers" && actor.role !== "technician" && <RouteChunk loader={customersPage} lang={lang} pageProps={{ lang, t, state, notify, branchId: state.currentBranch === "all" ? state.branches[0]?.id : state.currentBranch }} />}
        {page === "warranties" && actor.role !== "technician" && <RouteChunk loader={warrantiesPage} lang={lang} pageProps={{ lang, t, state, notify }} />}
        {page === "staff" && actor.role === "owner" && <RouteChunk loader={staffPage} lang={lang} pageProps={{ lang, t, state, notify, confirmModal: setModal }} />}
        {page === "whatsapp" && ["owner", "branch-manager", "receptionist"].includes(actor.role) && <RouteChunk loader={whatsappPage} lang={lang} pageProps={{ lang, t, state, notify, branchName, role: actor.role }} />}
      </main>
    </div>

    <nav className="mobile-nav" aria-label={t("Main navigation", "التنقل الأساسي")}>
      {navItems.map(({ id, path, icon: Icon, en, ar }) => <Link key={id} className={`nav-item ${page === id ? "active" : ""}`} href={path}>
        <Icon size={18} /><span>{t(en, ar)}</span>
      </Link>)}
    </nav>
    {toast && <div role="status" className="toast"><CheckCircle2 size={17} />{toast}</div>}
    {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h2 id="modal-title">{modal.title}</h2><p>{modal.body}</p>
      <div className="modal-actions"><button className="btn" onClick={() => setModal(null)}>{t("Go back", "رجوع")}</button><button className={`btn ${modal.danger ? "btn-danger" : "btn-primary"}`} onClick={modal.confirm}>{t("Confirm", "تأكيد")}</button></div>
    </section></div>}
  </div>;
}
