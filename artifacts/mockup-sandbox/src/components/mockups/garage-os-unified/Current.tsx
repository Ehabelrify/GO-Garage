import "./_group.css";
import { useState } from "react";
import {
  Activity, CalendarDays, CircleDollarSign, ClipboardList, Gauge, Gift, Package,
  ShieldCheck, Settings2, Truck, UserRoundCog, Users, Wrench, MessageCircle,
} from "lucide-react";

type Role = "owner" | "branch-manager" | "receptionist" | "technician";

const roles: Array<{ id: Role; label: string }> = [
  { id: "owner", label: "Owner" },
  { id: "branch-manager", label: "Branch manager" },
  { id: "receptionist", label: "Reception" },
  { id: "technician", label: "Technician" },
];

const navigation = [
  { id: "catalogue", icon: Package, label: "Catalogue", roles: ["owner"] },
  { id: "quotes", icon: ClipboardList, label: "Quotes", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "promotions", icon: CircleDollarSign, label: "Promotions", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "reservations", icon: CalendarDays, label: "Reservations", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "benefits", icon: Gift, label: "Benefits", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "transport", icon: Truck, label: "Transport", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "finance", icon: CircleDollarSign, label: "Operational finance", roles: ["owner"] },
  { id: "overview", icon: Gauge, label: "Overview", roles: ["owner", "branch-manager"] },
  { id: "bookings", icon: CalendarDays, label: "Bookings", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "workshop", icon: Wrench, label: "Workshop", roles: ["owner", "branch-manager", "technician"] },
  { id: "customers", icon: Users, label: "Customers", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "warranties", icon: ShieldCheck, label: "Warranties", roles: ["owner", "branch-manager", "receptionist"] },
  { id: "settings", icon: Settings2, label: "Settings", roles: ["owner"] },
  { id: "staff", icon: UserRoundCog, label: "Staff access", roles: ["owner"] },
  { id: "whatsapp", icon: MessageCircle, label: "Messaging inbox", roles: ["owner", "branch-manager", "receptionist"] },
];

export function Current() {
  const [role, setRole] = useState<Role>("owner");
  const visible = navigation.filter((item) => item.roles.includes(role));
  const defaultPage = role === "technician" ? "workshop" : role === "receptionist" ? "bookings" : "overview";

  return <div className="app-shell locale-en" dir="ltr">
    <aside className="sidebar">
      <a className="brand brand-link" href="#">
        <span className="brand-mark"><Wrench size={19} strokeWidth={1.7} /></span>
        <span><strong className="brand-name">Garage OS</strong><small className="brand-sub">GO STORES · EGYPT</small></span>
      </a>
      <div className="nav-label">Your workspace</div>
      <nav className="nav-list" aria-label="Main navigation">
        {visible.map(({ id, icon: Icon, label }) => <a key={id} className={`nav-item ${id === defaultPage ? "active" : ""}`} href="#">
          <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
        </a>)}
      </nav>
      {(role === "owner" || role === "branch-manager") && <div className="hold-nav-block">
        <div className="nav-label">On hold</div>
        {[
          { label: "WhatsApp connection", icon: MessageCircle },
          { label: "Inventory", icon: Package },
          { label: "Payments", icon: CircleDollarSign },
        ].map(({ label, icon: Icon }) => <div className="nav-item nav-item-disabled" key={label} aria-disabled="true">
          <Icon size={17} /><span>{label}</span><span className="hold-mini">On hold</span>
        </div>)}
      </div>}
      <div className="sidebar-spacer" />
      <div className="sidebar-account">
        <span className="account-avatar">D</span>
        <span className="account-copy"><strong>Demo user</strong><small>{roles.find((item) => item.id === role)?.label}</small></span>
      </div>
      <button className="signout-button" type="button">Sign out</button>
    </aside>

    <div className="main-area">
      <header className="topbar">
        <div className="topbar-start">
          <label className="branch-context"><span className="sr-only">Branch</span><select className="branch-select" defaultValue="all"><option value="all">All branches</option><option>Nasr City</option><option>Maadi</option></select></label>
          <span className="workspace-role"><Activity size={14} />{roles.find((item) => item.id === role)?.label}</span>
        </div>
        <div className="topbar-end">
          <span className="environment-label"><ClipboardList size={13} />Temporary demo account</span>
          <div className="lang-switch"><button className="selected">EN</button><button>عربي</button></div>
          <select aria-label="Preview role" value={role} onChange={(event) => setRole(event.target.value as Role)} className="branch-select">
            {roles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
      </header>
      <main className="page-wrap">
        <div className="page-heading"><div><div className="eyebrow">Go Stores · Operations</div><h1>{role === "technician" ? "My workshop" : role === "receptionist" ? "Bookings" : "Today at a glance"}</h1><p className="subtitle">Authorized operational work and owner reporting from recorded source facts.</p></div></div>
        <div className="grid stats-grid">
          <div className="stat-card"><div className="stat-head"><span>Booking requests</span><CalendarDays size={16} /></div><div><div className="stat-value">4</div><div className="stat-foot">Waiting for staff review</div></div></div>
          <div className="stat-card"><div className="stat-head"><span>Ready for delivery</span><ShieldCheck size={16} /></div><div><div className="stat-value">2</div><div className="stat-foot">Workshop handoff required</div></div></div>
          <div className="stat-card"><div className="stat-head"><span>Actions in this view</span><ClipboardList size={16} /></div><div><div className="stat-value">6</div><div className="stat-foot">Current operational work</div></div></div>
        </div>
        <section className="panel section-gap"><div className="panel-title-row"><div><h2 className="panel-title">Action queue</h2><p className="panel-desc">Role- and branch-scoped current work.</p></div></div>
          <div className="table-wrap"><table><thead><tr><th>Type</th><th>Branch</th><th>Stage</th><th>Next action</th><th>Open</th></tr></thead><tbody>
            <tr><td>Booking review</td><td>Nasr City</td><td>Pending</td><td>Confirm requested time</td><td><button className="text-link">Open</button></td></tr>
            <tr><td>Quality check</td><td>Maadi</td><td>In service</td><td>Complete inspection</td><td><button className="text-link">Open</button></td></tr>
            <tr><td>Ready pickup</td><td>Nasr City</td><td>Ready</td><td>Confirm customer handoff</td><td><button className="text-link">Open</button></td></tr>
          </tbody></table></div>
        </section>
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Main navigation">
      {visible.map(({ id, icon: Icon, label }) => <a key={id} className={`nav-item ${id === defaultPage ? "active" : ""}`} href="#"><Icon size={18} /><span>{label}</span></a>)}
    </nav>
  </div>;
}
