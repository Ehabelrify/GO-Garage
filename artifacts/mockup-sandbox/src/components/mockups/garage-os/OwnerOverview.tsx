import "./_group.css";
import { ArrowUpLeft, CalendarDays, CarFront, CheckCircle2, Clock3, Gauge, Users } from "lucide-react";
import { AppLayout, PageHeading, PanelTitle, Stage, useGarageLang } from "./_shared/AppLayout";

const rows = [
  { plate: "س ن ج ٤٨٢١", model: "Toyota Corolla 2022", service: "تظليل نوافذ", serviceEn: "Window tint", branch: "الفرع أ", branchEn: "Branch A", stage: "قيد التنفيذ", stageEn: "In service", tone: "info" as const, person: "مروان السيد", personEn: "Marwan El Sayed" },
  { plate: "ر ق م ٧١٩٣", model: "Hyundai Tucson 2023", service: "فحص أولي", serviceEn: "Initial inspection", branch: "الفرع ب", branchEn: "Branch B", stage: "فحص الجودة", stageEn: "Quality check", tone: "warn" as const, person: "ندى فوزي", personEn: "Nada Fawzy" },
  { plate: "د ط ب ٣٠٦٥", model: "Kia Sportage 2021", service: "طلاء سيراميك", serviceEn: "Ceramic coating", branch: "الفرع أ", branchEn: "Branch A", stage: "جاهزة للتسليم", stageEn: "Ready for pickup", tone: "ok" as const, person: "كريم عادل", personEn: "Karim Adel" },
  { plate: "م و س ٩٢٥٤", model: "Peugeot 3008 2022", service: "حماية واجهة PPF", serviceEn: "Front PPF protection", branch: "الفرع ب", branchEn: "Branch B", stage: "بانتظار الاستلام", stageEn: "Awaiting intake", tone: "hold" as const, person: "سلمى أمين", personEn: "Salma Amin" },
];

export function OwnerOverview() {
  const ar = useGarageLang() === "ar";
  return <AppLayout page="OwnerOverview">
    <PageHeading eyebrow="GO STORES · OPERATIONS" title={ar?"صباح الخير، يا أستاذ أحمد":"Good morning, Ahmed"} subtitle={ar?"صورة تشغيلية مباشرة لفرعي جو ستورز. تابع المركبات والالتزامات التي تحتاج انتباهك اليوم.":"A working view across both Go Stores branches. Keep track of vehicles and commitments that need attention today."} />
    <div className="go-grid go-stats">
      <Stat icon={CarFront} label={ar?"مركبات داخل الورشة":"Vehicles in workshop"} value={ar?"١٢":"12"} foot={ar?"٧ في الفرع أ · ٥ في الفرع ب":"7 in Branch A · 5 in Branch B"} />
      <Stat icon={CalendarDays} label={ar?"حجوزات اليوم":"Today’s bookings"} value={ar?"٩":"9"} foot={ar?"٢ طلبان بانتظار التأكيد":"2 requests awaiting confirmation"} />
      <Stat icon={Clock3} label={ar?"تجاوزت الموعد":"Past expected finish"} value={ar?"٢":"2"} foot={ar?"تحتاج متابعة مع مدير الفرع":"Need branch manager follow-up"} />
      <Stat icon={CheckCircle2} label={ar?"جاهزة للتسليم":"Ready for pickup"} value={ar?"٣":"3"} foot={ar?"تم فحص الجودة":"Quality check complete"} />
    </div>
    <div className="go-grid go-columns">
      <section className="go-panel">
        <PanelTitle title={ar?"حركة الفرعين":"Branch operations"} detail={ar?"الحمولة الحالية مقارنة بسعة الاستقبال اليومية":"Current load against each branch’s daily intake limit"} action={<a className="go-link" href="/__mockup/preview/garage-os/OwnerSettings">{ar?"إعدادات التشغيل":"Operating settings"} <ArrowUpLeft size={13} /></a>} />
        <Branch name={ar?"الفرع أ":"Branch A"} detail={ar?"٢ باي نظيف · ٤ بايات عامة · إغلاق الجمعة":"2 clean bays · 4 general bays · Friday closed"} total={ar?"٧":"7"} foot={ar?"مركبات نشطة · ٨ حد الاستقبال":"Active · 8 daily limit"} fill={88} />
        <Branch name={ar?"الفرع ب":"Branch B"} detail={ar?"١ باي نظيف · ٣ بايات عامة · إغلاق الجمعة":"1 clean bay · 3 general bays · Friday closed"} total={ar?"٥":"5"} foot={ar?"مركبات نشطة · ٦ حد الاستقبال":"Active · 6 daily limit"} fill={83} second />
        <div className="go-setting-foot"><span>{ar?"حد الاستقبال اليومي":"Daily intake limit"}</span><span>{ar?"١٢ من ١٤ مركبة":"12 of 14 vehicles"}</span></div>
        <div style={{height:5,background:"#e6ece7",marginTop:8}}><div style={{height:5,width:"86%",background:"var(--garage-teal)"}} /></div>
      </section>
      <section className="go-panel">
        <PanelTitle title={ar?"متابعة اليوم":"Today’s follow-ups"} detail={ar?"نقاط تحتاج تنسيقاً بين المالك والفريق":"Items needing owner and team coordination"} />
        <div className="go-handoff">
          <Handoff title={ar?"موعد تسليم متأخر":"Pickup time running late"} detail={ar?"Toyota Corolla · الفرع أ · متأخرة ٤٥ دقيقة":"Toyota Corolla · Branch A · 45 minutes late"} tone="warn" />
          <Handoff title={ar?"تأكيد طلب حجز":"Booking request needs confirmation"} detail={ar?"فحص أولي · الفرع ب · ١١:٣٠ صباحاً":"Initial inspection · Branch B · 11:30 AM"} tone="info" />
          <Handoff title={ar?"جاهزة للاستلام":"Ready for customer"} detail={ar?"Kia Sportage · تم اعتماد فحص الجودة":"Kia Sportage · quality check complete"} tone="ok" />
        </div>
      </section>
    </div>
    <section className="go-panel go-section-gap">
      <PanelTitle title={ar?"المركبات النشطة":"Active vehicles"} detail={ar?"أعمال قيد التنفيذ في الفرعين":"Work in progress across both branches"} action={<a className="go-link" href="/__mockup/preview/garage-os/BranchManager">{ar?"مساحات الفريق":"Team workspaces"} <ArrowUpLeft size={13} /></a>} />
      <div className="go-table-wrap"><table className="go-table"><thead><tr><th>{ar?"المركبة":"Vehicle"}</th><th>{ar?"الخدمة":"Service"}</th><th>{ar?"الفرع":"Branch"}</th><th>{ar?"المرحلة":"Stage"}</th><th>{ar?"مسؤول المتابعة":"Owner"}</th></tr></thead><tbody>{rows.map(row => <tr key={row.plate}><td><div className="go-primary-cell go-mono">{row.plate}</div><div className="go-secondary-cell go-ltr-data">{row.model}</div></td><td>{ar?row.service:row.serviceEn}</td><td>{ar?row.branch:row.branchEn}</td><td><Stage tone={row.tone}>{ar?row.stage:row.stageEn}</Stage></td><td>{ar?row.person:row.personEn}</td></tr>)}</tbody></table></div>
    </section>
  </AppLayout>;
}

function Stat({ icon: Icon, label, value, foot }: { icon: typeof Gauge; label: string; value: string; foot: string }) {
  return <div className="go-stat"><div className="go-stat-top"><span>{label}</span><span className="go-stat-icon"><Icon size={16} /></span></div><div><div className="go-stat-value">{value}</div><div className="go-stat-foot">{foot}</div></div></div>;
}
function Branch({ name, detail, total, foot, fill, second = false }: { name: string; detail: string; total: string; foot: string; fill: number; second?: boolean }) {
  return <div className="go-branch-row"><div className="go-branch-main"><span className={`go-branch-key ${second ? "gold" : ""}`} /><div><div className="go-branch-name">{name}</div><div className="go-branch-detail">{detail}</div></div></div><div className="go-branch-total">{total}<small>{foot}</small><div style={{height:3,width:70,marginTop:5,background:"#e6ece7"}}><div style={{height:3,width:`${fill}%`,background:second?"#b7863f":"var(--garage-teal)"}} /></div></div></div>;
}
function Handoff({ title, detail, tone }: { title: string; detail: string; tone: "warn" | "info" | "ok" }) {
  const Icon = tone === "warn" ? Clock3 : tone === "ok" ? CheckCircle2 : Users;
  return <div className="go-handoff-row"><span className="go-handoff-mark"><Icon size={14} /></span><div className="go-handoff-copy"><strong>{title}</strong><span>{detail}</span></div></div>;
}
