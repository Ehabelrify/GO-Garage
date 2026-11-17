import "./_group.css";
import { useState } from "react";
import {
  Activity, CalendarDays, ChevronDown, CircleDollarSign, ClipboardList, Gauge, Gift, Menu,
  MessageCircle, Package, ShieldCheck, Settings2, Truck, UserRoundCog, Users, Wrench, X,
} from "lucide-react";

type Role = "owner" | "branch-manager" | "receptionist" | "technician";
type RouteId =
  | "overview" | "whatsapp" | "bookings" | "workshop" | "customers" | "transport"
  | "catalogue" | "quotes" | "promotions" | "reservations" | "benefits" | "warranties"
  | "finance" | "settings" | "staff";

const roles: Array<{ id: Role; label: string }> = [
  { id: "owner", label: "Owner" },
  { id: "branch-manager", label: "Branch Manager" },
  { id: "receptionist", label: "Receptionist" },
  { id: "technician", label: "Technician" },
];

const groups: Array<{
  label: string;
  items: Array<{ id: RouteId; label: string; icon: typeof Gauge; roles: Role[] }>;
}> = [
  {
    label: "Daily operations",
    items: [
      { id: "overview", label: "Overview", icon: Gauge, roles: ["owner", "branch-manager"] },
      { id: "whatsapp", label: "Messaging inbox", icon: MessageCircle, roles: ["owner", "branch-manager", "receptionist"] },
      { id: "bookings", label: "Bookings", icon: CalendarDays, roles: ["owner", "branch-manager", "receptionist"] },
      { id: "workshop", label: "Workshop", icon: Wrench, roles: ["owner", "branch-manager", "technician"] },
      { id: "customers", label: "Customers", icon: Users, roles: ["owner", "branch-manager", "receptionist"] },
      { id: "transport", label: "Transport", icon: Truck, roles: ["owner", "branch-manager", "receptionist"] },
    ],
  },
  {
    label: "Customer offers and care",
    items: [
      { id: "catalogue", label: "Catalogue", icon: Package, roles: ["owner"] },
      { id: "quotes", label: "Quotes", icon: ClipboardList, roles: ["owner", "branch-manager", "receptionist"] },
      { id: "promotions", label: "Promotions", icon: CircleDollarSign, roles: ["owner", "branch-manager", "receptionist"] },
      { id: "reservations", label: "Reservations", icon: CalendarDays, roles: ["owner", "branch-manager", "receptionist"] },
      { id: "benefits", label: "Benefits", icon: Gift, roles: ["owner", "branch-manager", "receptionist"] },
      { id: "warranties", label: "Warranties", icon: ShieldCheck, roles: ["owner", "branch-manager", "receptionist"] },
    ],
  },
  {
    label: "Business management",
    items: [
      { id: "finance", label: "Operational finance", icon: CircleDollarSign, roles: ["owner"] },
      { id: "settings", label: "Settings", icon: Settings2, roles: ["owner"] },
      { id: "staff", label: "Staff access", icon: UserRoundCog, roles: ["owner"] },
    ],
  },
];

const pageHeadings: Record<RouteId, string> = {
  overview: "Today at a glance",
  whatsapp: "Messaging inbox",
  bookings: "Bookings",
  workshop: "Workshop",
  customers: "Customers",
  transport: "Transport",
  catalogue: "Catalogue",
  quotes: "Quotes",
  promotions: "Promotions",
  reservations: "Reservations",
  benefits: "Benefits",
  warranties: "Warranties",
  finance: "Operational finance",
  settings: "Settings",
  staff: "Staff access",
};

export function GroupedWorkspace() {
  const [role, setRole] = useState<Role>("owner");
  const [activePage, setActivePage] = useState<RouteId>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const roleLabel = roles.find((item) => item.id === role)?.label ?? "Owner";
  const visibleGroups = groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
  const allVisibleItems = visibleGroups.flatMap((group) => group.items);
  const currentPage = allVisibleItems.some((item) => item.id === activePage)
    ? activePage
    : role === "technician" ? "workshop" : role === "receptionist" ? "bookings" : "overview";
  const isOverview = currentPage === "overview";

  const navigate = (id: RouteId) => {
    setActivePage(id);
    setMobileMenuOpen(false);
  };
  const changeRole = (nextRole: Role) => {
    setRole(nextRole);
    setActivePage(nextRole === "technician" ? "workshop" : nextRole === "receptionist" ? "bookings" : "overview");
    setMobileMenuOpen(false);
  };

  return <div className="app-shell locale-en grouped-shell" dir="ltr">
    <aside className="sidebar grouped-sidebar">
      <a className="brand brand-link" href="#workspace" onClick={(event) => { event.preventDefault(); navigate(role === "technician" ? "workshop" : role === "receptionist" ? "bookings" : "overview"); }}>
        <span className="brand-mark"><Wrench size={19} strokeWidth={1.7} /></span>
        <span><strong className="brand-name">Garage OS</strong><small className="brand-sub">GO STORES · EGYPT</small></span>
      </a>
      <div className="group-nav-scroll">
        {visibleGroups.map((group) => <section className="group-nav-section" key={group.label}>
          <div className="nav-label">{group.label}</div>
          <nav className="nav-list" aria-label={group.label}>
            {group.items.map(({ id, icon: Icon, label }) => <button
              key={id}
              type="button"
              className={`nav-item ${currentPage === id ? "active" : ""}`}
              aria-current={currentPage === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
            </button>)}
          </nav>
        </section>)}
        {(role === "owner" || role === "branch-manager") && <section className="group-nav-section hold-nav-block">
          <div className="nav-label">On hold</div>
          {[
            { label: "WhatsApp connection", icon: MessageCircle },
            { label: "Inventory", icon: Package },
            { label: "Payments", icon: CircleDollarSign },
          ].map(({ label, icon: Icon }) => <div className="nav-item nav-item-disabled" key={label} aria-disabled="true">
            <Icon size={16} /><span>{label}</span><span className="hold-mini">On hold</span>
          </div>)}
        </section>}
      </div>
      <div className="sidebar-spacer" />
      <div className="sidebar-account">
        <span className="account-avatar">D</span>
        <span className="account-copy"><strong>Demo user</strong><small>{roleLabel}</small></span>
      </div>
      <button className="signout-button" type="button">Sign out</button>
    </aside>

    <div className="main-area grouped-main">
      <header className="topbar grouped-topbar">
        <div className="topbar-start">
          <label className="branch-context"><span className="sr-only">Branch</span>
            <select className="branch-select" defaultValue="all" aria-label="Branch">
              <option value="all">All branches</option><option>Nasr City</option><option>Maadi</option>
            </select><ChevronDown size={14} />
          </label>
          <span className="workspace-role"><Activity size={14} />{roleLabel}</span>
        </div>
        <div className="topbar-end grouped-topbar-end">
          <span className="environment-label"><ClipboardList size={13} />Temporary demo account</span>
          <div className="lang-switch" aria-label="Language"><button className="selected" type="button">EN</button><button type="button">عربي</button></div>
          <label className="role-picker"><span>Preview role</span>
            <select aria-label="Preview role" value={role} onChange={(event) => changeRole(event.target.value as Role)} className="branch-select role-select">
              {roles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
      </header>

      <main className="page-wrap grouped-page">
        <div className="workspace-context">
          <div><span className="context-mark"><Activity size={14} /></span><span>GO Stores <i>/</i> Operations</span></div>
          <span>Tuesday, 18 June <b>·</b> Two branches</span>
        </div>
        <div className="page-heading grouped-heading">
          <div>
            <div className="eyebrow">{isOverview ? "BUSINESS OVERVIEW" : "WORKSPACE"}</div>
            <h1>{pageHeadings[currentPage]}</h1>
            <p className="subtitle">{isOverview
              ? "A clear view of today's work across Nasr City and Maadi."
              : `Authorized ${pageHeadings[currentPage].toLowerCase()} workspace for ${roleLabel.toLowerCase()}.`}</p>
          </div>
          <div className="overview-scope"><span className="scope-dot" />Live workspace <span className="scope-divider" /> All branches</div>
        </div>

        <section className="grouped-stats" aria-label="Today's operational summary">
          <article className="group-stat">
            <div className="group-stat-top"><span>Booking requests</span><CalendarDays size={16} /></div>
            <div className="group-stat-bottom"><strong>4</strong><span>Waiting for staff review</span></div>
          </article>
          <article className="group-stat">
            <div className="group-stat-top"><span>Ready for delivery</span><ShieldCheck size={16} /></div>
            <div className="group-stat-bottom"><strong>2</strong><span>Workshop handoff required</span></div>
          </article>
          <article className="group-stat group-stat-emphasis">
            <div className="group-stat-top"><span>Actions in this view</span><ClipboardList size={16} /></div>
            <div className="group-stat-bottom"><strong>6</strong><span>Current operational work</span></div>
          </article>
          <article className="branch-pulse">
            <div className="branch-pulse-head"><span>Branch pulse</span><span>Today</span></div>
            <div className="pulse-branch"><span className="pulse-indicator" /><span>Nasr City</span><strong>3 <small>active jobs</small></strong></div>
            <div className="pulse-branch"><span className="pulse-indicator pulse-indicator-warm" /><span>Maadi</span><strong>3 <small>active jobs</small></strong></div>
          </article>
        </section>

        <section className="panel grouped-queue">
          <div className="panel-title-row">
            <div><div className="queue-kicker">NEEDS ATTENTION</div><h2 className="panel-title">Action queue</h2><p className="panel-desc">Role- and branch-scoped current work.</p></div>
            <button className="queue-count" type="button" onClick={() => navigate("bookings")}><span>3</span> of 6 items <ChevronDown size={14} /></button>
          </div>
          <div className="queue-table-wrap">
            <table className="grouped-table">
              <thead><tr><th>Work item</th><th>Branch</th><th>Stage</th><th>Next action</th><th><span className="sr-only">Open item</span></th></tr></thead>
              <tbody>
                <tr>
                  <td><div className="queue-primary">Booking review</div><div className="queue-secondary">Honda Civic · 6842 JHA</div></td>
                  <td>Nasr City</td><td><span className="status pending">Pending</span></td><td>Confirm requested time</td>
                  <td><button className="queue-open" type="button" onClick={() => navigate("bookings")}>Open <span>→</span></button></td>
                </tr>
                <tr>
                  <td><div className="queue-primary">Quality check</div><div className="queue-secondary">Hyundai Tucson · 2197 RSB</div></td>
                  <td>Maadi</td><td><span className="status in-service">In service</span></td><td>Complete inspection</td>
                  <td><button className="queue-open" type="button" onClick={() => navigate("workshop")}>Open <span>→</span></button></td>
                </tr>
                <tr>
                  <td><div className="queue-primary">Ready pickup</div><div className="queue-secondary">Nissan Sunny · 4318 MNT</div></td>
                  <td>Nasr City</td><td><span className="status ready">Ready</span></td><td>Confirm customer handoff</td>
                  <td><button className="queue-open" type="button" onClick={() => navigate("customers")}>Open <span>→</span></button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="queue-footer"><span>Showing representative work from today's overview</span><button type="button" onClick={() => navigate("overview")}>View overview <span>→</span></button></div>
        </section>

        <footer className="workspace-footer"><span>Garage OS <i>·</i> Operations workspace</span><span>Data shown reflects recorded source facts</span></footer>
      </main>
    </div>

    <button className="mobile-nav-trigger" type="button" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>
      {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}<span>{mobileMenuOpen ? "Close navigation" : "Workspace navigation"}</span><ChevronDown className={mobileMenuOpen ? "trigger-chevron open" : "trigger-chevron"} size={16} />
    </button>
    {mobileMenuOpen && <div className="mobile-menu-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileMenuOpen(false); }}>
      <section className="mobile-workspace-menu" aria-label="Workspace navigation">
        <div className="mobile-menu-head"><div><span className="eyebrow">GARAGE OS</span><h2>Workspace navigation</h2></div><button type="button" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)}><X size={18} /></button></div>
        <label className="mobile-role-picker">Preview role
          <select value={role} onChange={(event) => changeRole(event.target.value as Role)}>
            {roles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <div className="mobile-group-list">
          {visibleGroups.map((group) => <section className="mobile-nav-group" key={group.label}>
            <h3>{group.label}</h3>
            <div>{group.items.map(({ id, label, icon: Icon }) => <button
              key={id} type="button" className={currentPage === id ? "mobile-route active" : "mobile-route"}
              onClick={() => navigate(id)}
            ><Icon size={17} /><span>{label}</span><span className="mobile-route-arrow">→</span></button>)}</div>
          </section>)}
        </div>
      </section>
    </div>}
  </div>;
}
