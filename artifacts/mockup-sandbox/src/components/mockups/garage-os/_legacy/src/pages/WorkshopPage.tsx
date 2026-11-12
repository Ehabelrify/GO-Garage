import { useState } from "react";
import { Search, ShieldAlert } from "lucide-react";
import { nextJobStages } from "../domain";
import { useGarageStore } from "../store";
import type { JobStage } from "../types";
import { dateLabel, EmptyState, PageHeading, stageNames, Status, type RecordPageProps } from "../ui";

const nextAction: Record<JobStage, { en: string; ar: string }> = {
  booked: { en: "Mark received", ar: "تسجيل الاستلام" },
  received: { en: "Start service", ar: "بدء التنفيذ" },
  "in-service": { en: "Send to quality check", ar: "إرسال لفحص الجودة" },
  qc: { en: "Mark ready", ar: "تسجيل الجاهزية" },
  ready: { en: "Mark delivered", ar: "تسجيل التسليم" },
  delivered: { en: "Completed", ar: "مكتملة" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
  "no-show": { en: "No-show", ar: "لم يحضر" },
};

export function WorkshopPage({ lang, t, state, branchName, customerName, serviceName, vehicleFor, notify }: RecordPageProps) {
  const store = useGarageStore();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<JobStage | "all">("all");
  const jobs = state.jobs.filter((job) => {
    const vehicle = vehicleFor(job.customerId, job.vehicleId);
    const searchable = `${vehicle?.plate ?? ""} ${vehicle?.makeModel ?? ""} ${customerName(job.customerId)} ${job.id} ${serviceName(job.serviceId)}`.toLowerCase();
    return searchable.includes(query.toLowerCase()) &&
      (stage === "all" || job.stage === stage) &&
      (state.currentBranch === "all" || job.branchId === state.currentBranch);
  });
  const move = (jobId: string, target: JobStage) => {
    notify(store.transitionJob(jobId, target)
      ? t("Job stage updated in demo data.", "تم تحديث مرحلة العمل في البيانات التجريبية.")
      : t("That transition is not allowed.", "هذا الانتقال غير مسموح."));
  };

  return <>
    <PageHeading eyebrow={t("Workshop · Jobs", "الورشة · الوظائف")} title={t("Workshop board", "لوحة الورشة")} subtitle={t("Move each sample vehicle through its allowed next stage. Stage changes are recorded in local demo history.", "انقل كل مركبة تجريبية إلى المرحلة التالية المسموح بها. تُسجل تغييرات المراحل في سجل العرض المحلي.")} />
    <div className="warning-banner"><ShieldAlert size={17} /><div>{t("These are sample jobs. No customer updates or WhatsApp messages are sent when a stage changes.", "هذه وظائف تجريبية. لا يتم إرسال تحديثات للعملاء أو رسائل واتساب عند تغيير المرحلة.")}</div></div>
    <div className="toolbar"><div className="toolbar-start"><label className="search-wrap"><Search size={16} /><span className="sr-only">{t("Search workshop jobs", "البحث في وظائف الورشة")}</span><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search plate, customer, service or job ID…", "ابحث باللوحة أو العميل أو الخدمة أو رقم الوظيفة…")} /></label><select className="filter-select" style={{ width: "auto" }} value={stage} onChange={(event) => setStage(event.target.value as JobStage | "all")}><option value="all">{t("All stages", "كل المراحل")}</option>{Object.entries(stageNames).map(([key, label]) => <option key={key} value={key}>{lang === "ar" ? label.ar : label.en}</option>)}</select></div><span className="top-meta">{jobs.length} {t("jobs", "وظائف")}</span></div>
    <div className="job-list">
      {jobs.map((job) => {
        const vehicle = vehicleFor(job.customerId, job.vehicleId);
        const booking = state.bookings.find((item) => item.id === job.bookingId);
        const choices = nextJobStages(job.stage);
        return <article className="job-card" key={job.id}>
          <div>
            <div className="job-vehicle mono">{vehicle?.plate ?? "—"}</div>
            <div className="job-detail"><span>{vehicle?.makeModel}</span><span>{customerName(job.customerId)}</span><span>{serviceName(job.serviceId)}</span></div>
            <div className="job-status-line"><Status status={job.stage} lang={lang} /><span className="tag">{branchName(job.branchId)}</span></div>
            <div className="job-detail"><span>{t("Drop-off", "الاستلام")}: {booking ? dateLabel(booking.dropoffDate, lang) : "—"}</span><span>{t("Expected pickup", "التسليم المتوقع")}: {booking ? dateLabel(booking.expectedPickup, lang) : "—"}</span></div>
          </div>
          <div className="job-actions">{choices.length
            ? choices.map((target) => <button key={target} className={`btn btn-sm ${target === "cancelled" || target === "no-show" ? "btn-danger" : "btn-primary"}`} onClick={() => move(job.id, target)}>
              {target === "cancelled" || target === "no-show"
                ? lang === "ar" ? stageNames[target].ar : stageNames[target].en
                : lang === "ar" ? nextAction[job.stage].ar : nextAction[job.stage].en}
            </button>)
            : <span className="top-meta">{t("No further actions", "لا توجد إجراءات أخرى")}</span>}</div>
        </article>;
      })}
      {!jobs.length && <EmptyState title={t("No jobs match this view", "لا توجد وظائف مطابقة")} text={t("Try a different search, stage or branch.", "جرّب بحثاً أو مرحلة أو فرعاً آخر.")} />}
    </div>
  </>;
}
