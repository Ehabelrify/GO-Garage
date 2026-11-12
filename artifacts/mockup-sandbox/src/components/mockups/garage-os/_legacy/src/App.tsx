import { useEffect, useState } from "react";
import {
  CheckCircle2, LayoutDashboard, ListChecks, CalendarDays, Wrench, Users, RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useGarageStore } from "./store";
import type { BranchId, PageId } from "./types";
import { branchDisplay, customerDisplay, serviceDisplay, type Lang, type ModalConfig } from "./ui";
import { OverviewPage } from "./pages/OverviewPage";
import { DecisionsPage } from "./pages/DecisionsPage";
import { BookingsPage } from "./pages/BookingsPage";
import { WorkshopPage } from "./pages/WorkshopPage";
import { CustomersPage } from "./pages/CustomersPage";
import "./styles.css";

type DemoRole = "owner" | "branch-manager" | "receptionist" | "technician";
const navItems: { id: PageId; icon: typeof LayoutDashboard; en: string; ar: string; path: string }[] = [
  { id: "overview", icon: LayoutDashboard, en: "Overview", ar: "نظرة عامة", path: "/" },
  { id: "decisions", icon: ListChecks, en: "Decisions", ar: "القرارات", path: "/decisions" },
  { id: "bookings", icon: CalendarDays, en: "Bookings", ar: "الحجوزات", path: "/bookings" },
  { id: "workshop", icon: Wrench, en: "Workshop", ar: "الورشة", path: "/workshop" },
  { id: "customers", icon: Users, en: "Customers", ar: "العملاء", path: "/customers" },
];

export function App() {
  const store = useGarageStore();
  const { state } = store;
  const lang: Lang = state.locale;
  const rtl = lang === "ar";
  const [demoRole, setDemoRole] = useState<DemoRole>("owner");
  const [path, setPath] = useState(window.location.pathname);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const t = (english: string, arabic: string) => lang === "ar" ? arabic : english;
  const page: PageId = navItems.find((item) => item.path === path)?.id ?? "overview";

  const branchName = (branchId: BranchId) => {
    const branch = state.branches.find((item) => item.id === branchId);
    return branch ? branchDisplay(branch.name, lang) : branchId;
  };
  const customerName = (customerId: string) => {
    const customer = state.customers.find((item) => item.id === customerId);
    return customer ? customerDisplay(customer.name, lang) : "—";
  };
  const vehicleFor = (customerId: string, vehicleId: string) =>
    state.customers.find((item) => item.id === customerId)?.vehicles.find((vehicle) => vehicle.id === vehicleId);
  const serviceName = (serviceId: string) => {
    const service = state.services.find((item) => item.id === serviceId);
    return service ? serviceDisplay(service.name, lang) : "—";
  };
  const notify = (message: string) => setToast(message);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (to: string) => {
    if (window.location.pathname !== to) window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return <div className={`app-shell ${lang === "en" ? "locale-en" : ""}`} dir={rtl ? "rtl" : "ltr"}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Wrench size={19} strokeWidth={1.7} /></div><div><div className="brand-name">Garage OS</div><div className="brand-sub">GO STORES · EGYPT</div></div></div>
      <div className="nav-label">{t("Operations", "العمليات")}</div>
      <nav className="nav-list" aria-label={t("Main navigation", "التنقل الرئيسي")}>
        {navItems.map(({ id, icon: Icon, en, ar, path: itemPath }) => <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => navigate(itemPath)}><Icon size={18} strokeWidth={1.8} /><span>{t(en, ar)}</span>{id === "decisions" && state.decisions.some((decision) => decision.ownerDecision) && <span className="sr-only">{t("decision center", "مركز القرارات")}</span>}</button>)}
      </nav>
      <div className="sidebar-spacer" />
      <div className="demo-note"><strong>{t("Local demo data", "بيانات تجريبية محلية")}</strong>{t("People, phones, plates, capacity and policies are samples saved only on this device.", "الأشخاص والأرقام واللوحات والسعة والسياسات تجريبية ومحفوظة على هذا الجهاز فقط.")}</div>
      <button className="reset-button" onClick={() => setModal({
        title: t("Reset this demo?", "إعادة ضبط العرض التجريبي؟"),
        body: t("This restores the sample records on this device. It does not affect any real business system.", "سيعيد هذا الإجراء السجلات التجريبية على هذا الجهاز فقط، ولن يؤثر على أي نظام فعلي."),
        confirm: () => { store.resetDemo(); setModal(null); notify(t("Demo data restored.", "تمت استعادة البيانات التجريبية.")); },
      })}><RotateCcw size={15} />{t("Reset demo data", "إعادة ضبط البيانات")}</button>
    </aside>

    <div className="main-area">
      <header className="topbar">
        <div className="topbar-start">
          <label className="sr-only" htmlFor="branch-context">{t("Branch", "الفرع")}</label>
          <select id="branch-context" className="branch-select" value={state.currentBranch} onChange={(event) => store.setCurrentBranch(event.target.value as typeof state.currentBranch)}>
            <option value="all">{t("All branches", "كل الفروع")}</option>
            {state.branches.map((branch) => <option key={branch.id} value={branch.id}>{branchName(branch.id)}</option>)}
          </select>
          <span className="top-meta"><ShieldAlert size={14} />{t("Demo workspace", "مساحة تجريبية")}</span>
        </div>
        <div className="topbar-end">
          <div className="role-preview">
            <label className="sr-only" htmlFor="role-preview">{t("Role preview only; no access control", "معاينة الدور فقط؛ لا يوجد تحكم بالصلاحيات")}</label>
            <select id="role-preview" className="branch-select role-select" value={demoRole} onChange={(event) => setDemoRole(event.target.value as DemoRole)} aria-label={t("Role preview only; not authentication", "معاينة الدور فقط؛ ليست مصادقة")}>
              <option value="owner">{t("Owner preview", "معاينة المالك")}</option><option value="branch-manager">{t("Manager preview", "معاينة المدير")}</option><option value="receptionist">{t("Reception preview", "معاينة الاستقبال")}</option><option value="technician">{t("Technician preview", "معاينة الفني")}</option>
            </select>
            <span className="role-note">{t("Preview only · no permissions enforced", "معاينة فقط · لا يتم فرض الصلاحيات")}</span>
          </div>
          <span className="top-meta">{t("Staff language", "لغة الموظف")}</span>
          <div className="lang-switch" aria-label={t("Choose language", "اختيار اللغة")}><button className={lang === "ar" ? "selected" : ""} onClick={() => store.setLocale("ar")}>عربي</button><button className={lang === "en" ? "selected" : ""} onClick={() => store.setLocale("en")}>EN</button></div>
        </div>
      </header>
      <main className="page-wrap" key={page}>
        {page === "overview" && <OverviewPage lang={lang} t={t} state={state} navigate={navigate} branchName={branchName} notify={notify} />}
        {page === "decisions" && <DecisionsPage lang={lang} t={t} state={state} notify={notify} branchName={branchName} />}
        {page === "bookings" && <BookingsPage lang={lang} t={t} state={state} branchName={branchName} customerName={customerName} serviceName={serviceName} vehicleFor={vehicleFor} notify={notify} confirmModal={setModal} />}
        {page === "workshop" && <WorkshopPage lang={lang} t={t} state={state} branchName={branchName} customerName={customerName} serviceName={serviceName} vehicleFor={vehicleFor} notify={notify} />}
        {page === "customers" && <CustomersPage lang={lang} t={t} state={state} notify={notify} />}
      </main>
    </div>

    <nav className="mobile-nav" aria-label={t("Main navigation", "التنقل الرئيسي")}>{navItems.map(({ id, icon: Icon, en, ar, path: itemPath }) => <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => navigate(itemPath)}><Icon /><span>{t(en, ar)}</span></button>)}</nav>
    {toast && <div role="status" className="toast"><CheckCircle2 size={17} />{toast}</div>}
    {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h2 id="modal-title">{modal.title}</h2><p>{modal.body}</p>
      <div className="modal-actions"><button className="btn" onClick={() => setModal(null)}>{t("Go back", "رجوع")}</button><button className={`btn ${modal.danger ? "btn-danger" : "btn-primary"}`} onClick={modal.confirm}>{t("Confirm", "تأكيد")}</button></div>
    </section></div>}
  </div>;
}
