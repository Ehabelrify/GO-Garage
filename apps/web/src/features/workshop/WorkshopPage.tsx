import { useEffect, useState } from "react";
import { Search, UserRound, UserRoundCheck } from "lucide-react";
import { nextJobStages } from "@garage/domain";
import { unknownWriteOutcomeCopy, useGarageStore } from "../../shared/store";
import type { GarageRole, JobStage } from "@garage/domain";
import { dateLabel, EmptyState, PageHeading, stageNames, Status, type RecordPageProps } from "../../shared/ui";

const nextAction: Record<JobStage, { en: string; ar: string }> = {
  booked: { en: "Mark received at branch", ar: "Ø³Ø¬Ù„ ÙˆØµÙˆÙ„ Ø§Ù„Ø¹Ø±Ø¨ÙŠØ© Ù„Ù„ÙØ±Ø¹" },
  received: { en: "Start service", ar: "Ø§Ø¨Ø¯Ø£ Ø§Ù„Ø´ØºÙ„" },
  "in-service": { en: "Send to quality check", ar: "Ø§Ø¨Ø¹Øª Ù„ÙØ­Øµ Ø§Ù„Ø¬ÙˆØ¯Ø©" },
  qc: { en: "Mark ready", ar: "Ø³Ø¬Ù‘Ù„ Ø¥Ù†Ù‡Ø§ Ø¬Ø§Ù‡Ø²Ø©" },
  ready: { en: "Mark delivered to customer", ar: "Ø³Ø¬Ù„ ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø¹Ø±Ø¨ÙŠØ© Ù„Ù„Ø¹Ù…ÙŠÙ„" },
  delivered: { en: "Completed", ar: "Ø®Ù„ØµØª" },
  cancelled: { en: "Cancelled", ar: "Ø§ØªÙ„ØºÙ‰" },
  "no-show": { en: "No-show", ar: "Ù…Ø§Ø¬Ø§Ø´" },
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
      ? t("Workshop stage updated.", "Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ø´ØºÙ„ Ø§ØªØ­Ø¯Ù‘Ø«Øª.")
      : unknownWriteOutcomeCopy(result.error, lang) ?? (result.error === "INVALID_TRANSITION"
        ? t("That stage change is not allowed.", "Ù…Ø´ Ù…Ø³Ù…ÙˆØ­ Ø¨ØªØºÙŠÙŠØ± Ø§Ù„Ù…Ø±Ø­Ù„Ø© Ø¯ÙŠ.")
        : t("The stage could not be changed. Check your access.", "Ù…Ø§Ù‚Ø¯Ø±Ù†Ø§Ø´ Ù†ØºÙŠÙ‘Ø± Ø§Ù„Ù…Ø±Ø­Ù„Ø©. Ø±Ø§Ø¬Ø¹ ØµÙ„Ø§Ø­ÙŠØªÙƒ.")));
  };

  const assign = async (jobId: string) => {
    const technicianUserId = selectedTechnician[jobId];
    const job = state.jobs.find((item) => item.id === jobId);
    if (!job || savingJob || !technicians.some((item) => item.userId === technicianUserId && item.branchIds.includes(job.branchId)) || technicianUserId === job.assignedUserId) return;
    setSavingJob(jobId);
    const result = await store.assignJob(jobId, technicianUserId);
    setSavingJob("");
    notify(result.ok
      ? t("Technician assigned to this job.", "Ø§Ù„ÙÙ†ÙŠ Ø§ØªØ¶Ø§Ù Ù„Ø£Ù…Ø± Ø§Ù„Ø´ØºÙ„.")
      : unknownWriteOutcomeCopy(result.error, lang) ?? t("Could not assign this technician to the job.", "Ù…Ø§Ù‚Ø¯Ø±Ù†Ø§Ø´ Ù†Ø¶ÙŠÙ Ø§Ù„ÙÙ†ÙŠ Ù„Ø£Ù…Ø± Ø§Ù„Ø´ØºÙ„ Ø¯Ù‡."));
  };

  const roleHeading = role === "technician"
    ? t("My assigned work", "Ø§Ù„Ø´ØºÙ„ Ø§Ù„Ù…Ø³Ù†Ø¯ Ù„ÙŠØ§")
    : t("Workshop board", "Ù„ÙˆØ­Ø© Ø§Ù„ÙˆØ±Ø´Ø©");
  const roleDescription = role === "technician"
    ? t("Only vehicles assigned to your account appear here. Update each job through its next allowed stage.", "Ù‡Ù†Ø§ Ù‡ØªØ¸Ù‡Ø± Ø§Ù„Ø¹Ø±Ø¨ÙŠØ§Øª Ø§Ù„Ù…Ø³Ù†Ø¯Ø© Ù„Ø­Ø³Ø§Ø¨Ùƒ Ø¨Ø³. Ø­Ø¯Ù‘Ø« ÙƒÙ„ Ø£Ù…Ø± Ø´ØºÙ„ Ù„Ù„Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ø¬Ø§ÙŠØ© Ø§Ù„Ù…Ø³Ù…ÙˆØ­ Ø¨ÙŠÙ‡Ø§.")
    : t("Follow each vehicle through the workshop and keep branch handoffs clear.", "ØªØ§Ø¨Ø¹ ÙƒÙ„ Ø¹Ø±Ø¨ÙŠØ© ÙÙŠ Ø§Ù„ÙˆØ±Ø´Ø© ÙˆØ®Ù„ÙŠ Ø§Ù„ØªØ³Ù„ÙŠÙ… Ø¨ÙŠÙ† Ø§Ù„ÙØ±Ù‚ ÙˆØ§Ø¶Ø­.");

  return <>
    <PageHeading eyebrow={t("Workshop Â· Jobs", "Ø§Ù„ÙˆØ±Ø´Ø© Â· Ø£ÙˆØ§Ù…Ø± Ø§Ù„Ø´ØºÙ„")} title={roleHeading} subtitle={roleDescription} />
    <div className="toolbar"><div className="toolbar-start"><label className="search-wrap"><Search size={16} /><span className="sr-only">{t("Search workshop jobs", "Ø¯ÙˆÙ‘Ø± ÙÙŠ Ø£ÙˆØ§Ù…Ø± Ø§Ù„Ø´ØºÙ„")}</span><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search plate, customer, service or jobâ€¦", "Ø¯ÙˆÙ‘Ø± Ø¨Ø§Ù„Ù„ÙˆØ­Ø© Ø£Ùˆ Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø£Ùˆ Ø§Ù„Ø®Ø¯Ù…Ø© Ø£Ùˆ Ø£Ù…Ø± Ø§Ù„Ø´ØºÙ„â€¦")} /></label>
      <select className="filter-select" style={{ width: "auto" }} value={stage} onChange={(event) => setStage(event.target.value as JobStage | "all")}><option value="all">{t("All stages", "ÙƒÙ„ Ø§Ù„Ù…Ø±Ø§Ø­Ù„")}</option>{Object.entries(stageNames).map(([key, label]) => <option key={key} value={key}>{lang === "ar" ? label.ar : label.en}</option>)}</select>
    </div><span className="top-meta">{jobs.length} {t("jobs", "Ø£ÙˆØ§Ù…Ø± Ø´ØºÙ„")}</span></div>

    <div className="job-list">
      {jobs.map((job) => {
        const vehicle = vehicleFor(job.customerId, job.vehicleId);
        const booking = state.bookings.find((item) => item.id === job.bookingId);
        const choices = nextJobStages(job.stage);
        const branchTechnicians = technicians.filter((item) => item.branchIds.includes(job.branchId));
        const assignedTechnician = technicians.find((item) => item.userId === job.assignedUserId);
        const selected = selectedTechnician[job.id] ?? job.assignedUserId ?? "";
        const assignmentReason = savingJob === job.id
          ? t("Saving assignmentâ€¦", "Ø¬Ø§Ø±ÙŠ Ø­ÙØ¸ Ø¥Ø³Ù†Ø§Ø¯ Ø§Ù„Ø´ØºÙ„â€¦")
          : !branchTechnicians.length
            ? t("No active technician is available in this branch.", "Ù…ÙÙŠØ´ ÙÙ†ÙŠ Ù†Ø´Ø· Ù…ØªØ§Ø­ ÙÙŠ Ø§Ù„ÙØ±Ø¹ Ø¯Ù‡.")
            : !selected
              ? t("Choose a technician to assign this job.", "Ø§Ø®ØªØ§Ø± ÙÙ†ÙŠ Ø¹Ø´Ø§Ù† ØªØ³Ù†Ø¯ Ù„Ù‡ Ø§Ù„Ø´ØºÙ„ Ø¯Ù‡.")
              : !branchTechnicians.some((item) => item.userId === selected)
                ? t("Choose an active technician in this branch.", "Ø§Ø®ØªØ§Ø± ÙÙ†ÙŠ Ù†Ø´Ø· ÙÙŠ Ø§Ù„ÙØ±Ø¹ Ø¯Ù‡.")
                : selected === job.assignedUserId
                  ? t("This technician is already assigned to the job.", "Ø§Ù„ÙÙ†ÙŠ Ø¯Ù‡ Ù…Ø³Ù†Ø¯ Ù„Ù‡ Ø§Ù„Ø´ØºÙ„ Ø¨Ø§Ù„ÙØ¹Ù„.")
                  : "";
        return <article className="job-card" key={job.id}>
          <div className="job-card-main">
            <div className="job-vehicle mono">{vehicle?.plate ?? "â€”"}</div>
            <div className="job-detail"><span>{vehicle?.makeModel}</span><span>{customerName(job.customerId)}</span><span>{booking?.workSummary?.[lang] ?? serviceName(job.serviceId)}</span>{booking?.acceptedQuoteRef && <span className="mono">{t("Accepted quote", "عرض السعر المقبول")}: {booking.acceptedQuoteRef.quoteId} · {t("revision", "الإصدار")} {booking.acceptedQuoteRef.revision}</span>}</div>
            <div className="job-status-line"><Status status={job.stage} lang={lang} /><span className="tag">{branchName(job.branchId)}</span></div>
            <div className="job-detail"><span>{t("Drop-off", "Ø§Ø³ØªÙ„Ø§Ù… Ø§Ù„ÙØ±Ø¹")}: {booking ? dateLabel(booking.dropoffDate, lang) : "â€”"}</span><span>{t("Expected pickup", "Ø§Ù„ØªØ³Ù„ÙŠÙ… Ø§Ù„Ù…ØªÙˆÙ‚Ø¹")}: {booking ? dateLabel(booking.expectedPickup, lang) : "â€”"}</span></div>
          </div>
          <div className="job-card-side">
            {canAssign && <div className="assignment-control">
              <label className="assignment-label" htmlFor={`assign-${job.id}`}><UserRound size={14} />{t("Assigned technician", "Ø§Ù„ÙÙ†ÙŠ Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„")}</label>
                  <select id={`assign-${job.id}`} className="field-select" value={selected} disabled={!branchTechnicians.length || savingJob === job.id} aria-describedby={`assign-reason-${job.id}`} onChange={(event) => setSelectedTechnician((current) => ({ ...current, [job.id]: event.target.value }))}>
                    <option value="">{t("Select technician", "Ø§Ø®ØªØ§Ø± ÙÙ†ÙŠ")}</option>
                    {selected && !branchTechnicians.some((item) => item.userId === selected) && <option value={selected} disabled>{assignedTechnician?.name ?? t("Unavailable technician", "ÙÙ†ÙŠ ØºÙŠØ± Ù…ØªØ§Ø­")}</option>}
                    {branchTechnicians.map((item) => <option key={item.userId} value={item.userId}>{item.name || t("Technician", "ÙÙ†ÙŠ")}</option>)}
                  </select>
                  <button className="btn btn-sm" type="button" onClick={() => void assign(job.id)} aria-describedby={`assign-reason-${job.id}`} disabled={!!assignmentReason}>
                    <UserRoundCheck size={14} />{savingJob === job.id ? t("Savingâ€¦", "Ø¨Ù†Ø­ÙØ¸â€¦") : t(assignedTechnician ? "Update assignment" : "Assign", assignedTechnician ? "Ø­Ø¯Ù‘Ø« Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„" : "Ø§Ø³Ù†Ø¯ Ø§Ù„Ø´ØºÙ„")}
                  </button>
                  <span id={`assign-reason-${job.id}`} className="assignment-empty" role="status">{assignmentReason || t("Ready to save this assignment.", "Ø¬Ø§Ù‡Ø² Ù„Ø­ÙØ¸ Ø¥Ø³Ù†Ø§Ø¯ Ø§Ù„Ø´ØºÙ„.")}</span>
            </div>}
            <div className="job-actions">{choices.length
              ? choices.map((target) => <button key={target} className={`btn btn-sm ${target === "cancelled" || target === "no-show" ? "btn-danger" : "btn-primary"}`} onClick={() => void move(job.id, target)}>
                {target === "cancelled" || target === "no-show"
                  ? lang === "ar" ? stageNames[target].ar : stageNames[target].en
                  : lang === "ar" ? nextAction[job.stage].ar : nextAction[job.stage].en}
              </button>)
              : <span className="top-meta">{t("No further actions", "Ù…ÙÙŠØ´ Ø®Ø·ÙˆØ§Øª ØªØ§Ù†ÙŠØ©")}</span>}</div>
          </div>
        </article>;
      })}
      {!jobs.length && <EmptyState title={role === "technician" ? t("No jobs assigned", "Ù…ÙÙŠØ´ Ø´ØºÙ„ Ù…ØªØ³Ù†Ø¯ Ù„ÙŠÙƒ") : t("No jobs match this view", "Ù…ÙÙŠØ´ Ø£ÙˆØ§Ù…Ø± Ø´ØºÙ„ Ù…Ø·Ø§Ø¨Ù‚Ø©")} text={role === "technician"
        ? t("A manager must assign a job to your account before it appears here.", "Ø§Ù„Ù…Ø¯ÙŠØ± Ù„Ø§Ø²Ù… ÙŠØ³Ù†Ø¯ Ø´ØºÙ„ Ù„Ø­Ø³Ø§Ø¨Ùƒ Ø¹Ø´Ø§Ù† ÙŠØ¸Ù‡Ø± Ù‡Ù†Ø§.")
        : t("Try a different search, stage, or branch.", "Ø¬Ø±Ù‘Ø¨ ÙƒÙ„Ù…Ø© Ø¨Ø­Ø« Ø£Ùˆ Ù…Ø±Ø­Ù„Ø© Ø£Ùˆ ÙØ±Ø¹ ØªØ§Ù†ÙŠ.")} />}
    </div>
  </>;
}
