import { useEffect, useState } from "react";
import { Search, UserRound, UserRoundCheck } from "lucide-react";
import { nextJobStages } from "../domain";
import { useGarageStore } from "../store";
import type { GarageRole, JobStage } from "../types";
import { dateLabel, EmptyState, PageHeading, stageNames, Status, type RecordPageProps } from "../ui";

const nextAction: Record<JobStage, { en: string; ar: string }> = {
  booked: { en: "Mark received", ar: "سجّل الاستلام" },
  received: { en: "Start service", ar: "ابدأ الشغل" },
  "in-service": { en: "Send to quality check", ar: "ابعت لفحص الجودة" },
  qc: { en: "Mark ready", ar: "سجّل إنها جاهزة" },
  ready: { en: "Mark delivered", ar: "سجّل التسليم" },
  delivered: { en: "Completed", ar: "خلصت" },
  cancelled: { en: "Cancelled", ar: "اتلغى" },
  "no-show": { en: "No-show", ar: "ماجاش" },
};

interface WorkshopPageProps extends RecordPageProps {
  role: GarageRole;
}

interface Technician {
  userId: string;
  name: string;
  role: GarageRole;
  branchIds: string[];
  status: string;
}

export function WorkshopPage({ lang, t, state, branchName, customerName, serviceName, vehicleFor, notify, role }: WorkshopPageProps) {
  const store = useGarageStore();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<JobStage | "all">("all");
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState<Record<string, string>>({});
  const [savingJob, setSavingJob] = useState("");
  const canAssign = role === "owner" || role === "branch-manager";

  useEffect(() => {
    if (!canAssign) return;
    let mounted = true;
    void fetch("/api/staff", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load technicians.");
        return response.json() as Promise<{ members: Technician[] }>;
      })
      .then((payload) => { if (mounted) setTechnicians(payload.members.filter((member) => member.role === "technician" && member.status === "active")); })
      .catch(() => { if (mounted) setTechnicians([]); });
    return () => { mounted = false; };
  }, [canAssign]);

  const jobs = state.jobs.filter((job) => {
    const vehicle = vehicleFor(job.customerId, job.vehicleId);
    const searchable = `${vehicle?.plate ?? ""} ${vehicle?.makeModel ?? ""} ${customerName(job.customerId)} ${job.id} ${serviceName(job.serviceId)}`.toLowerCase();
    return searchable.includes(query.toLowerCase()) &&
      (stage === "all" || job.stage === stage) &&
      (state.currentBranch === "all" || job.branchId === state.currentBranch);
  });

  const move = async (jobId: string, target: JobStage) => {
    const result = await store.transitionJob(jobId, target);
    notify(result.ok
      ? t("Workshop stage updated.", "مرحلة الشغل اتحدّثت.")
      : result.error === "INVALID_TRANSITION"
        ? t("That stage change is not allowed.", "مش مسموح بتغيير المرحلة دي.")
        : t("The stage could not be changed. Check your access.", "ماقدرناش نغيّر المرحلة. راجع صلاحيتك."));
  };

  const assign = async (jobId: string) => {
    const technicianUserId = selectedTechnician[jobId];
    if (!technicianUserId) return;
    setSavingJob(jobId);
    const result = await store.assignJob(jobId, technicianUserId);
    setSavingJob("");
    notify(result.ok
      ? t("Technician assigned to this job.", "الفني اتضاف لأمر الشغل.")
      : t("Could not assign this technician to the job.", "ماقدرناش نضيف الفني لأمر الشغل ده."));
  };

  const roleHeading = role === "technician"
    ? t("My assigned work", "الشغل المسند ليا")
    : t("Workshop board", "لوحة الورشة");
  const roleDescription = role === "technician"
    ? t("Only vehicles assigned to your account appear here. Update each job through its next allowed stage.", "هنا هتظهر العربيات المسندة لحسابك بس. حدّث كل أمر شغل للمرحلة الجاية المسموح بيها.")
    : t("Follow each vehicle through the workshop and keep branch handoffs clear.", "تابع كل عربية في الورشة وخلي التسليم بين الفرق واضح.");

  return <>
    <PageHeading eyebrow={t("Workshop · Jobs", "الورشة · أوامر الشغل")} title={roleHeading} subtitle={roleDescription} />
    <div className="toolbar"><div className="toolbar-start"><label className="search-wrap"><Search size={16} /><span className="sr-only">{t("Search workshop jobs", "دوّر في أوامر الشغل")}</span><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search plate, customer, service or job…", "دوّر باللوحة أو العميل أو الخدمة أو أمر الشغل…")} /></label>
      <select className="filter-select" style={{ width: "auto" }} value={stage} onChange={(event) => setStage(event.target.value as JobStage | "all")}><option value="all">{t("All stages", "كل المراحل")}</option>{Object.entries(stageNames).map(([key, label]) => <option key={key} value={key}>{lang === "ar" ? label.ar : label.en}</option>)}</select>
    </div><span className="top-meta">{jobs.length} {t("jobs", "أوامر شغل")}</span></div>

    <div className="job-list">
      {jobs.map((job) => {
        const vehicle = vehicleFor(job.customerId, job.vehicleId);
        const booking = state.bookings.find((item) => item.id === job.bookingId);
        const choices = nextJobStages(job.stage);
        const branchTechnicians = technicians.filter((item) => item.branchIds.includes(job.branchId));
        const assignedTechnician = technicians.find((item) => item.userId === job.assignedUserId);
        const selected = selectedTechnician[job.id] ?? job.assignedUserId ?? "";
        return <article className="job-card" key={job.id}>
          <div className="job-card-main">
            <div className="job-vehicle mono">{vehicle?.plate ?? "—"}</div>
            <div className="job-detail"><span>{vehicle?.makeModel}</span><span>{customerName(job.customerId)}</span><span>{serviceName(job.serviceId)}</span></div>
            <div className="job-status-line"><Status status={job.stage} lang={lang} /><span className="tag">{branchName(job.branchId)}</span></div>
            <div className="job-detail"><span>{t("Drop-off", "استلام الفرع")}: {booking ? dateLabel(booking.dropoffDate, lang) : "—"}</span><span>{t("Expected pickup", "التسليم المتوقع")}: {booking ? dateLabel(booking.expectedPickup, lang) : "—"}</span></div>
          </div>
          <div className="job-card-side">
            {canAssign && <div className="assignment-control">
              {branchTechnicians.length
                ? <><label className="assignment-label" htmlFor={`assign-${job.id}`}><UserRound size={14} />{t("Assigned technician", "الفني المسؤول")}</label>
                  <select id={`assign-${job.id}`} className="field-select" value={selected} onChange={(event) => setSelectedTechnician((current) => ({ ...current, [job.id]: event.target.value }))}>
                    <option value="">{t("Select technician", "اختار فني")}</option>
                    {branchTechnicians.map((item) => <option key={item.userId} value={item.userId}>{item.name || t("Technician", "فني")}</option>)}
                  </select>
                  <button className="btn btn-sm" type="button" onClick={() => void assign(job.id)} disabled={!selected || savingJob === job.id || selected === job.assignedUserId}>
                    <UserRoundCheck size={14} />{savingJob === job.id ? t("Saving…", "بنحفظ…") : t(assignedTechnician ? "Update assignment" : "Assign", assignedTechnician ? "حدّث المسؤول" : "اسند الشغل")}
                  </button>
                </>
                : <span className="assignment-empty">{t("No active technician is assigned to this branch.", "مفيش فني نشط متاح في الفرع ده.")}</span>}
            </div>}
            <div className="job-actions">{choices.length
              ? choices.map((target) => <button key={target} className={`btn btn-sm ${target === "cancelled" || target === "no-show" ? "btn-danger" : "btn-primary"}`} onClick={() => void move(job.id, target)}>
                {target === "cancelled" || target === "no-show"
                  ? lang === "ar" ? stageNames[target].ar : stageNames[target].en
                  : lang === "ar" ? nextAction[job.stage].ar : nextAction[job.stage].en}
              </button>)
              : <span className="top-meta">{t("No further actions", "مفيش خطوات تانية")}</span>}</div>
          </div>
        </article>;
      })}
      {!jobs.length && <EmptyState title={role === "technician" ? t("No jobs assigned", "مفيش شغل متسند ليك") : t("No jobs match this view", "مفيش أوامر شغل مطابقة")} text={role === "technician"
        ? t("A manager must assign a job to your account before it appears here.", "المدير لازم يسند شغل لحسابك عشان يظهر هنا.")
        : t("Try a different search, stage, or branch.", "جرّب كلمة بحث أو مرحلة أو فرع تاني.")} />}
    </div>
  </>;
}
