import { AlertCircle, ArrowLeft, CalendarDays, CarFront, CheckCircle2, Gauge, Wrench } from "lucide-react";
import { configuredNumber } from "../domain";
import type { Job } from "../types";
import { dateLabel, EmptyState, PageHeading, pageBranchMatches, SectionTitle, serviceDisplay, Stat, Status, type BranchPageProps } from "../ui";

interface OverviewPageProps extends BranchPageProps {
  navigate: (path: string) => void;
}

export function OverviewPage({ lang, t, state, navigate, branchName }: OverviewPageProps) {
  const jobs = state.jobs.filter((job) => pageBranchMatches(state, job.branchId));
  const bookings = state.bookings.filter((booking) => pageBranchMatches(state, booking.branchId));
  const activeJobs = jobs.filter((job) => !["delivered", "cancelled", "no-show"].includes(job.stage));
  const pendingBookings = bookings.filter((booking) => booking.status === "pending");
  const readyJobs = jobs.filter((job) => job.stage === "ready");
  const attentionJobs = jobs.filter((job) => ["qc", "ready"].includes(job.stage));

  return <>
    <PageHeading
      eyebrow={t("Go Stores · Operations", "جو ستورز · العمليات")}
      title={t("Today at a glance", "ملخص سريع لليوم")}
      subtitle={t("A live view of booking pressure, vehicles in service, and the work waiting for the next handoff.", "تابع الحجوزات والعربيات اللي شغالة والشغل اللي مستني التسليم الجاي.")}
    />
    <div className="grid stats-grid">
      <Stat icon={CarFront} label={t("Active vehicles", "عربيات شغالة")} value={activeJobs.length} foot={t("Currently in the workshop", "موجودة في الورشة دلوقتي")} />
      <Stat icon={CalendarDays} label={t("Booking requests", "طلبات الحجز")} value={pendingBookings.length} foot={t("Waiting for staff review", "مستنية مراجعة الفريق")} />
      <Stat icon={CheckCircle2} label={t("Ready for delivery", "جاهزة للتسليم")} value={readyJobs.length} foot={t("Workshop handoff required", "محتاجة تسليم من الورشة")} />
      <Stat icon={Gauge} label={t("Open workshop jobs", "أوامر شغل مفتوحة")} value={activeJobs.length} foot={t("Across your assigned branches", "في الفروع المسندة ليك")} />
    </div>

    <div className="grid overview-grid">
      <section className="panel">
        <SectionTitle title={t("Branch operations", "شغل الفروع")} description={t("Current workload and configured capacity", "الشغل الحالي والسعة المحددة")} action={<button className="text-link" onClick={() => navigate("/workspace/workshop")}>{t("Open workshop", "افتح الورشة")} <ArrowLeft size={13} /></button>} />
        {state.branches.filter((branch) => pageBranchMatches(state, branch.id)).map((branch, index) => {
          const branchJobs = jobs.filter((job) => job.branchId === branch.id);
          const active = branchJobs.filter((job) => !["delivered", "cancelled", "no-show"].includes(job.stage)).length;
          const confirmed = bookings.filter((booking) => booking.branchId === branch.id && booking.status === "confirmed").length;
          const cleanBays = configuredNumber(state.decisions, "clean-bays", branch.id, branch.cleanBays);
          const generalBays = configuredNumber(state.decisions, "general-bays", branch.id, branch.generalBays);
          const workingHours = configuredNumber(state.decisions, "branch-working-hours", branch.id, branch.workingHours);
          return <div className="branch-row" key={branch.id}>
            <div className="branch-info"><span className={`branch-dot ${index ? "alt" : ""}`} /><div>
              <div className="branch-title">{branchName(branch.id)}</div>
              <div className="branch-meta">{cleanBays} {t("clean bays", "بايات تنظيف")} · {generalBays} {t("general bays", "بايات عادية")} · {workingHours} {t("operating hours", "ساعة تشغيل")}</div>
            </div></div>
            <div className="branch-count">{active}<small>{t("active ·", "شغالة ·")} {confirmed} {t("confirmed bookings", "حجز متأكد")}</small></div>
          </div>;
        })}
        {!state.branches.length && <EmptyState title={t("No branch access", "مافيش صلاحية لفرع")} text={t("Ask the owner to assign your account to a branch.", "اطلب من المالك يضيف حسابك لفرع.")} />}
      </section>

      <section className="panel">
        <SectionTitle title={t("Next handoffs", "التسليمات الجاية")} description={t("Bookings and workshop stages that need attention", "حجوزات ومراحل شغل محتاجة متابعة")} action={<button className="text-link" onClick={() => navigate("/workspace/bookings")}>{t("Open bookings", "افتح الحجوزات")} <ArrowLeft size={13} /></button>} />
        <div className="attention-list">
          {pendingBookings.slice(0, 3).map((booking) => <div className="attention-row" key={booking.id}>
            <span className="attention-mark"><AlertCircle size={15} /></span>
            <div className="attention-copy"><strong>{t("Booking needs review", "حجز محتاج مراجعة")}</strong><span>{dateLabel(booking.dropoffDate, lang)} · {branchName(booking.branchId)}</span></div>
          </div>)}
          {attentionJobs.slice(0, Math.max(0, 4 - pendingBookings.length)).map((job) => <div className="attention-row" key={job.id}>
            <span className="attention-mark"><Wrench size={15} /></span>
            <div className="attention-copy"><strong>{job.stage === "qc" ? t("Quality check", "فحص الجودة") : t("Ready for delivery", "جاهزة للتسليم")}</strong><span>{serviceDisplay(state.services.find((service) => service.id === job.serviceId)?.name ?? "—", lang)} · {branchName(job.branchId)}</span></div>
          </div>)}
          {!pendingBookings.length && !attentionJobs.length && <EmptyState title={t("No immediate handoffs", "مفيش تسليمات مستعجلة")} text={t("New requests and workshop milestones will appear here.", "الطلبات الجديدة ومراحل الشغل هتظهر هنا.")} />}
        </div>
      </section>
    </div>

    <section className="panel section-gap">
      <SectionTitle title={t("Workshop status", "حالة الورشة")} description={t("Vehicles currently moving through service", "العربيات اللي بتعدي بمراحل الخدمة دلوقتي")} action={<button className="text-link" onClick={() => navigate("/workspace/workshop")}>{t("View all jobs", "اعرض كل أوامر الشغل")} <ArrowLeft size={13} /></button>} />
      <div className="table-wrap"><table><thead><tr><th>{t("Vehicle", "المركبة")}</th><th>{t("Service", "الخدمة")}</th><th>{t("Branch", "الفرع")}</th><th>{t("Stage", "المرحلة")}</th><th>{t("Updated", "آخر تحديث")}</th></tr></thead><tbody>
        {jobs.slice(0, 5).map((job: Job) => {
          const vehicle = state.customers.find((customer) => customer.id === job.customerId)?.vehicles.find((item) => item.id === job.vehicleId);
          const service = state.services.find((item) => item.id === job.serviceId);
          return <tr key={job.id}><td><div className="primary-cell mono">{vehicle?.plate ?? "—"}</div><div className="secondary-cell">{vehicle?.makeModel}</div></td><td>{service ? serviceDisplay(service.name, lang) : "—"}</td><td>{branchName(job.branchId)}</td><td><Status status={job.stage} lang={lang} /></td><td>{dateLabel(job.updatedAt, lang)}</td></tr>;
        })}
        {!jobs.length && <tr><td colSpan={5}><EmptyState title={t("No jobs in this branch", "مفيش أوامر شغل في الفرع ده")} text={t("Newly confirmed bookings will appear in the workshop.", "الحجوزات اللي هتتأكد هتظهر في الورشة.")} /></td></tr>}
      </tbody></table></div>
    </section>
  </>;
}
