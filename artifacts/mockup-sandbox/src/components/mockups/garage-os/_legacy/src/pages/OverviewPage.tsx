import { AlertCircle, ArrowLeft, CalendarDays, CarFront, CheckCircle2, ListChecks, ShieldAlert } from "lucide-react";
import type { Job } from "../types";
import { configuredNumber } from "../domain";
import { dateLabel, decisionNames, EmptyState, PageHeading, pageBranchMatches, SectionTitle, serviceDisplay, Stat, Status, type BranchPageProps } from "../ui";

interface OverviewPageProps extends BranchPageProps {
  navigate: (path: string) => void;
}

export function OverviewPage({ lang, t, state, navigate, branchName }: OverviewPageProps) {
  const jobs = state.jobs.filter((job) => pageBranchMatches(state, job.branchId));
  const bookings = state.bookings.filter((booking) => pageBranchMatches(state, booking.branchId));
  const pendingDecisions = state.decisions.filter((decision) => decision.ownerDecision &&
    (decision.scope === "business"
      ? decision.statusByScope.business !== "demo-approved"
      : decision.branches?.some((id) => decision.statusByScope[id] !== "demo-approved")));
  const activeJobs = jobs.filter((job) => !["delivered", "cancelled", "no-show"].includes(job.stage));
  const pendingBookings = bookings.filter((booking) => booking.status === "pending");

  return <>
    <PageHeading eyebrow={t("Go Stores · Operations", "جو ستورز · العمليات")} title={t("Today at a glance", "ملخص العمليات")} subtitle={t("A sample view across both workshops. Resolve provisional rules before treating them as operating policy.", "عرض تجريبي للفرعين. راجعوا القواعد المقترحة قبل اعتمادها كسياسات تشغيلية.")} />
    <div className="grid stats-grid">
      <Stat icon={CarFront} label={t("Active vehicles", "مركبات قيد العمل")} value={activeJobs.length} foot={t("Across the selected branch", "في الفرع المحدد")} />
      <Stat icon={CalendarDays} label={t("Booking requests", "طلبات الحجز")} value={pendingBookings.length} foot={t("Awaiting staff review", "بانتظار مراجعة الموظف")} />
      <Stat icon={ListChecks} label={t("Open decisions", "قرارات غير محسومة")} value={pendingDecisions.length} foot={t("Proposals, not approved rules", "مقترحات وليست قواعد معتمدة")} />
      <Stat icon={CheckCircle2} label={t("Ready for delivery", "جاهزة للتسليم")} value={jobs.filter((job) => job.stage === "ready").length} foot={t("Sample workshop records", "سجلات ورشة تجريبية")} />
    </div>
    <div className="grid overview-grid">
      <section className="panel">
        <SectionTitle title={t("Branch operations", "تشغيل الفروع")} description={t("Current sample workload by branch", "حجم العمل التجريبي الحالي حسب الفرع")} action={<button className="text-link" onClick={() => navigate("/workshop")}>{t("Open workshop", "فتح الورشة")} <ArrowLeft size={13} style={{ verticalAlign: "middle" }} /></button>} />
        {state.branches.map((branch, index) => {
          const branchJobs = jobs.filter((job) => job.branchId === branch.id);
          const active = branchJobs.filter((job) => !["delivered", "cancelled", "no-show"].includes(job.stage)).length;
          const confirmed = bookings.filter((booking) => booking.branchId === branch.id && booking.status === "confirmed").length;
          const cleanBays = configuredNumber(state.decisions, "clean-bays", branch.id, branch.cleanBays);
          const generalBays = configuredNumber(state.decisions, "general-bays", branch.id, branch.generalBays);
          const workingHours = configuredNumber(state.decisions, "branch-working-hours", branch.id, branch.workingHours);
          return <div className="branch-row" key={branch.id}>
            <div className="branch-info"><span className={`branch-dot ${index ? "alt" : ""}`} /><div>
              <div className="branch-title">{branchName(branch.id)}</div>
              <div className="branch-meta">{cleanBays} {t("clean bays", "بايات تنظيف")} · {generalBays} {t("general bays", "بايات عامة")} · {workingHours} {t("hours/day", "ساعات يومياً")}</div>
            </div></div>
            <div className="branch-count">{active}<small>{t("active ·", "نشطة ·")} {confirmed} {t("confirmed bookings", "حجوزات مؤكدة")}</small></div>
          </div>;
        })}
      </section>
      <section className="panel">
        <SectionTitle title={t("Needs a decision", "تحتاج إلى قرار")} description={t("Unapproved assumptions that affect daily work", "افتراضات غير معتمدة تؤثر على العمل اليومي")} action={<button className="text-link" onClick={() => navigate("/decisions")}>{t("Review all", "مراجعة الكل")} <ArrowLeft size={13} style={{ verticalAlign: "middle" }} /></button>} />
        <div className="attention-list">
          {pendingDecisions.slice(0, 4).map((decision) => <div className="attention-row" key={decision.id}><span className="attention-mark"><AlertCircle size={15} /></span><div className="attention-copy"><strong>{lang === "ar" ? decisionNames[decision.id]?.ar ?? decision.title : decisionNames[decision.id]?.en ?? decision.title}</strong><span>{lang === "ar" ? "مقترح بانتظار مراجعة المالك" : "Proposed · owner review needed"}</span></div></div>)}
          {!pendingDecisions.length && <EmptyState title={t("No unresolved proposals", "لا توجد مقترحات معلقة")} text={t("All sample proposals have been demo-approved.", "تمت الموافقة التجريبية على جميع المقترحات.")} />}
        </div>
      </section>
    </div>
    <section className="panel section-gap">
      <SectionTitle title={t("Workshop status", "حالة الورشة")} description={t("Jobs in the current sample queue", "الوظائف في قائمة العمل التجريبية")} action={<button className="text-link" onClick={() => navigate("/workshop")}>{t("View jobs", "عرض الوظائف")} <ArrowLeft size={13} style={{ verticalAlign: "middle" }} /></button>} />
      <div className="table-wrap"><table><thead><tr><th>{t("Vehicle", "المركبة")}</th><th>{t("Service", "الخدمة")}</th><th>{t("Branch", "الفرع")}</th><th>{t("Stage", "المرحلة")}</th><th>{t("Updated", "آخر تحديث")}</th></tr></thead><tbody>
        {jobs.slice(0, 5).map((job: Job) => {
          const vehicle = state.customers.find((customer) => customer.id === job.customerId)?.vehicles.find((item) => item.id === job.vehicleId);
          const service = state.services.find((item) => item.id === job.serviceId);
          return <tr key={job.id}><td><div className="primary-cell mono">{vehicle?.plate ?? "—"}</div><div className="secondary-cell">{vehicle?.makeModel}</div></td><td>{service ? serviceDisplay(service.name, lang) : "—"}</td><td>{branchName(job.branchId)}</td><td><Status status={job.stage} lang={lang} /></td><td>{dateLabel(job.updatedAt, lang)}</td></tr>;
        })}
        {!jobs.length && <tr><td colSpan={5}><EmptyState title={t("No jobs in this branch", "لا توجد وظائف في هذا الفرع")} text={t("Choose another branch or check the workshop list.", "اختر فرعاً آخر أو راجع قائمة الورشة.")} /></td></tr>}
      </tbody></table></div>
    </section>
    <div className="warning-banner section-gap"><ShieldAlert size={17} /><div><strong>{t("Demo only — no real policy is being approved.", "للعرض التجريبي فقط — لا يتم اعتماد أي سياسة فعلية.")}</strong> {t("All people, phones, plates, capacity figures and decisions are sample data stored in this browser on this device.", "جميع الأشخاص والأرقام واللوحات والسعات والقرارات بيانات تجريبية محفوظة في هذا المتصفح على هذا الجهاز.")}</div></div>
  </>;
}
