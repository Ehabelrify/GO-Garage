import { useEffect, useState } from "react";
import {
  Activity, CalendarDays, CheckCircle2, ChevronDown, CircleDollarSign, ClipboardList,
  Gauge, Package, ShieldAlert, ShieldCheck, Settings2, UserRoundCog, Users, Wrench, MessageCircle,
} from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { Link, useLocation } from "wouter";
import { useGarageStore, type GarageActor } from "./store";
import type { BranchId, GarageRole, PageId } from "./types";
import { branchDisplay, customerDisplay, serviceDisplay, type Lang, type ModalConfig } from "./ui";
import { OverviewPage } from "./pages/OverviewPage";
import { SettingsPage } from "./pages/SettingsPage";
import { BookingsPage } from "./pages/BookingsPage";
import { WorkshopPage } from "./pages/WorkshopPage";
import { CustomersPage } from "./pages/CustomersPage";
import { StaffPage } from "./pages/StaffPage";
import { WarrantiesPage } from "./pages/WarrantiesPage";
import { WhatsAppSimulationPage } from "./pages/WhatsAppSimulationPage";

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
  { id: "overview", path: "/workspace/overview", icon: Gauge, en: "Overview", ar: "نظرة عامة", roles: ["owner", "branch-manager"] },
  { id: "bookings", path: "/workspace/bookings", icon: CalendarDays, en: "Bookings", ar: "الحجوزات", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "workshop", path: "/workspace/workshop", icon: Wrench, en: "Workshop", ar: "الورشة", roles: ["owner", "branch-manager", "technician"] },
  { id: "customers", path: "/workspace/customers", icon: Users, en: "Customers", ar: "العملاء", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "warranties", path: "/workspace/warranties", icon: ShieldCheck, en: "Warranties", ar: "الضمانات", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "settings", path: "/workspace/settings", icon: Settings2, en: "Settings", ar: "الإعدادات", roles: ["owner"] },
  { id: "staff", path: "/workspace/staff", icon: UserRoundCog, en: "Staff access", ar: "صلاحيات الموظفين", roles: ["owner"] },
  { id: "whatsapp", path: "/workspace/whatsapp", icon: MessageCircle, en: "WhatsApp simulation", ar: "محاكاة واتساب", roles: ["owner", "branch-manager", "receptionist"] },
];

const holdItems = [
  { en: "WhatsApp connection", ar: "ربط واتساب", icon: MessageCircle },
  { en: "Inventory", ar: "المخزون", icon: Package },
  { en: "Payments", ar: "المدفوعات", icon: CircleDollarSign },
];

function LoadingWorkspace() {
  return <div className="workspace-state" role="status"><div className="brand-mark"><Wrench size={19} /></div><strong>Garage OS</strong><span>بنحمّل مساحة العمل...</span><div className="loading-line" /></div>;
}

function AccessPending({ onSignOut }: { onSignOut: () => void }) {
  const lang = document.documentElement.lang === "en" ? "en" : "ar";
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

function WorkspaceError({ onRetry }: { onRetry: () => void }) {
  return <main className="access-state" dir="rtl"><div className="access-state-card">
    <div className="access-icon"><ShieldAlert size={24} /></div>
    <div className="eyebrow">GARAGE OS</div>
    <h1>ماقدرناش نحمّل مساحة العمل</h1>
    <p>بيانات الحساب ما اتحمّلتش. جرّب تاني؛ مافيش أي تغييرات اتحفظت من الطلب ده.</p>
    <button className="btn btn-primary" onClick={onRetry}>جرّب تاني</button>
  </div></main>;
}

export function App() {
  const store = useGarageStore();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const leaveWorkspace = async () => {
    await fetch("/api/demo/session", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
    if (store.actor?.isDemo) {
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

  if (store.status === "loading") return <LoadingWorkspace />;
  if (store.status === "error") {
    if (store.errorCode === "ACCESS_PENDING") return <AccessPending onSignOut={() => void leaveWorkspace()} />;
    return <WorkspaceError onRetry={() => void store.refresh()} />;
  }
  if (!store.actor || !store.state) return <WorkspaceError onRetry={() => void store.refresh()} />;

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

  const branchName = (branchId: BranchId) => {
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
      <button className="signout-button" onClick={signOut}>{t("Sign out", "تسجيل الخروج")}</button>
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
        </div>
      </header>
      <main className="page-wrap" key={page}>
        {page === "overview" && <OverviewPage lang={lang} t={t} state={state} navigate={navigate} branchName={branchName} notify={notify} />}
        {page === "settings" && actor.role === "owner" && <SettingsPage lang={lang} t={t} state={state} notify={notify} branchName={branchName} />}
        {page === "bookings" && <BookingsPage lang={lang} t={t} state={state} branchName={branchName} customerName={customerName} serviceName={serviceName} vehicleFor={vehicleFor} notify={notify} confirmModal={setModal} />}
        {page === "workshop" && <WorkshopPage lang={lang} t={t} state={state} branchName={branchName} customerName={customerName} serviceName={serviceName} vehicleFor={vehicleFor} notify={notify} role={actor.role} />}
        {page === "customers" && actor.role !== "technician" && <CustomersPage lang={lang} t={t} state={state} notify={notify} branchId={state.currentBranch === "all" ? state.branches[0]?.id : state.currentBranch} />}
        {page === "warranties" && actor.role !== "technician" && <WarrantiesPage lang={lang} t={t} state={state} notify={notify} />}
        {page === "staff" && actor.role === "owner" && <StaffPage lang={lang} t={t} state={state} notify={notify} confirmModal={setModal} />}
        {page === "whatsapp" && ["owner", "branch-manager", "receptionist"].includes(actor.role) && <WhatsAppSimulationPage lang={lang} t={t} state={state} notify={notify} branchName={branchName} role={actor.role} />}
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
