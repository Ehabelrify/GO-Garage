import { useCallback, useEffect, useMemo, useState } from "react";
import { nextJobStages } from "@garage/domain";
import type { GarageRole, Job, JobStage } from "@garage/domain";
import { unknownWriteOutcomeCopy, useGarageStore } from "../../shared/store";
import { dateLabel, stageNames, type RecordPageProps } from "../../shared/ui";
import {
  Collapsible, ConfirmDialog, DataTable, DetailDrawer, EmptyState, FilterBar, Notice, PageHeader, RecordRef,
  Skeleton, StatusBadge, TabBar, useUrlState, type Column,
} from "../../shared/components";
import {
  actionsFor, boardStages, compareJobs, groupByStage, matchesJob, stageActionLabels, terminalStages,
  type TechniciansState,
} from "./workshop-logic";
import "./WorkshopPage.css";

interface WorkshopPageProps extends RecordPageProps { role: GarageRole }

interface Technician { userId: string; name: string; role: GarageRole; branchIds: string[]; status: string }

export function WorkshopPage({ lang, t, state, branchName, customerName, serviceName, vehicleFor, notify, role }: WorkshopPageProps) {
  const store = useGarageStore();
  const isTechnician = role === "technician";
  const canAssign = role === "owner" || role === "branch-manager";
  const canCancel = canAssign;

  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<JobStage | "all">("all");
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [view, setView] = useUrlState("view", "board");
  const [openId, setOpenId] = useUrlState("record", "");
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [techState, setTechState] = useState<TechniciansState>("idle");
  const [reloadKey, setReloadKey] = useState(0);
  const [pickedTech, setPickedTech] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const [confirm, setConfirm] = useState<{ job: Job; target: JobStage } | null>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!canAssign) return;
    let mounted = true;
    setTechState("loading");
    fetch("/api/staff", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("staff");
        return response.json() as Promise<{ members: Technician[] }>;
      })
      .then((payload) => {
        if (!mounted) return;
        setTechnicians(payload.members.filter((member) => member.role === "technician" && member.status === "active"));
        setTechState("ready");
      })
      .catch(() => { if (mounted) { setTechnicians([]); setTechState("error"); } });
    return () => { mounted = false; };
  }, [canAssign, reloadKey]);

  const pickupOf = useCallback((job: Job) => state.bookings.find((b) => b.id === job.bookingId)?.expectedPickup ?? "9999-12-31", [state.bookings]);
  const techName = useCallback((id?: string | null) => {
    if (!id) return "";
    return technicians.find((x) => x.userId === id)?.name || (id === store.actor?.userId ? store.actor?.name : "") || "";
  }, [technicians, store.actor]);

  const jobs = useMemo(() => state.jobs.filter((job) => {
    const vehicle = vehicleFor(job.customerId, job.vehicleId);
    const searchable = `${vehicle?.plate ?? ""} ${vehicle?.makeModel ?? ""} ${customerName(job.customerId)} ${serviceName(job.serviceId)}`;
    return matchesJob(job, searchable, {
      query, stage, branch: state.currentBranch, technicianId: technicianFilter,
      onlyAssignedTo: isTechnician ? store.actor?.userId ?? "" : undefined,
    });
  }).sort((a, b) => compareJobs(a, b, pickupOf)), [state.jobs, query, stage, state.currentBranch, technicianFilter, isTechnician, store.actor, vehicleFor, customerName, serviceName, pickupOf]);

  const clearFilters = () => { setQuery(""); setStage("all"); setTechnicianFilter("all"); };
  const filtersActive = Boolean(query) || stage !== "all" || technicianFilter !== "all";

  const doMove = async (job: Job, target: JobStage) => {
    setMoving(true);
    const result = await store.transitionJob(job.id, target);
    setMoving(false);
    setConfirm(null);
    notify(result.ok
      ? t("Workshop stage updated.", "تم تحديث مرحلة الشغل.")
      : unknownWriteOutcomeCopy(result.error, lang) ?? (result.error === "INVALID_TRANSITION"
        ? t("That stage change is not allowed.", "هذا التغيير في المرحلة غير مسموح.")
        : t("The stage could not be changed. Check your access.", "تعذر تغيير المرحلة. تحقق من صلاحياتك.")));
  };

  const requestMove = (job: Job, target: JobStage) => {
    if (target === "cancelled" || target === "no-show") setConfirm({ job, target });
    else void doMove(job, target);
  };

  const assign = async (job: Job) => {
    const userId = pickedTech[job.id];
    if (!userId || saving || userId === job.assignedUserId) return;
    setSaving(job.id);
    const result = await store.assignJob(job.id, userId);
    setSaving("");
    notify(result.ok
      ? t("Technician assigned.", "تم إسناد الفني.")
      : unknownWriteOutcomeCopy(result.error, lang) ?? t("Could not assign this technician.", "تعذر إسناد هذا الفني."));
  };

  const vehicleLabel = (job: Job) => vehicleFor(job.customerId, job.vehicleId)?.plate ?? t("Vehicle", "مركبة");
  const actionLabel = (target: JobStage) => stageActionLabels[target][lang];

  const renderActions = (job: Job, big = false) => {
    const { primary, destructive } = actionsFor(nextJobStages(job.stage), isTechnician);
    if (!primary.length && !(canCancel && destructive.length)) return null;
    return <div className="ws-actions">
      {primary.map((target) => <button key={target} type="button" className={`btn btn-primary ${big ? "btn-lg ws-big-action" : "btn-sm"}`} onClick={() => requestMove(job, target)}>{actionLabel(target)}</button>)}
      {canCancel && destructive.map((target) => <button key={target} type="button" className="btn btn-sm btn-danger" onClick={() => requestMove(job, target)}>{actionLabel(target)}</button>)}
    </div>;
  };

  const open = openId ? state.jobs.find((job) => job.id === openId) : undefined;

  const columns: Column<Job>[] = [
    { key: "plate", header: t("Vehicle", "المركبة"), primary: true, mono: true, sortable: true, sortValue: (j) => vehicleLabel(j), render: (j) => vehicleLabel(j) },
    { key: "customer", header: t("Customer", "العميل"), sortable: true, sortValue: (j) => customerName(j.customerId), render: (j) => customerName(j.customerId) },
    { key: "service", header: t("Service", "الخدمة"), render: (j) => state.bookings.find((b) => b.id === j.bookingId)?.workSummary?.[lang] ?? serviceName(j.serviceId) },
    { key: "stage", header: t("Stage", "المرحلة"), sortable: true, sortValue: (j) => stageNames[j.stage][lang], render: (j) => <StatusBadge status={j.stage} domain="job" lang={lang} /> },
    { key: "branch", header: t("Branch", "الفرع"), render: (j) => branchName(j.branchId) },
    { key: "tech", header: t("Technician", "الفني"), render: (j) => techName(j.assignedUserId) || (j.assignedUserId ? t("Assigned", "مسند") : t("Unassigned", "غير مسند")) },
    { key: "pickup", header: t("Pickup", "التسليم"), sortable: true, sortValue: pickupOf, render: (j) => { const p = pickupOf(j); return p.startsWith("9999") ? "—" : dateLabel(p, lang); } },
  ];

  const clearButton = <button type="button" className="btn btn-sm" onClick={clearFilters}>{t("Clear filters", "مسح التصفية")}</button>;

  const empty = isTechnician
    ? <EmptyState title={t("No jobs assigned to you", "لا توجد أعمال مسندة إليك")} text={t("Ask a manager to assign a job.", "اطلب من المدير إسناد أمر عمل.")} />
    : filtersActive
      ? <EmptyState variant="no-results" title={t("No jobs match", "لا توجد أوامر مطابقة")} action={clearButton} />
      : <EmptyState title={t("No jobs yet", "لا توجد أوامر شغل بعد")} text={t("Jobs appear when a booking is confirmed.", "تظهر أوامر الشغل عند تأكيد الحجز.")} />;

  const header = <PageHeader
    title={isTechnician ? t("My jobs today", "أعمالي اليوم") : t("Workshop", "الورشة")}
    meta={<span className="top-meta">{jobs.length} {t("jobs", "أوامر شغل")}</span>}
  />;

  if (store.status === "loading") return <>{header}<Skeleton rows={5} label={t("Loading", "جارٍ التحميل")} /></>;
  if (store.status === "error") return <>{header}<EmptyState variant="error" title={t("Could not load jobs", "تعذر تحميل أوامر الشغل")} action={<button type="button" className="btn btn-sm" onClick={() => window.location.reload()}>{t("Retry", "إعادة المحاولة")}</button>} /></>;

  const jobCard = (job: Job, compact: boolean) => {
    const vehicle = vehicleFor(job.customerId, job.vehicleId);
    const booking = state.bookings.find((b) => b.id === job.bookingId);
    const service = booking?.workSummary?.[lang] ?? serviceName(job.serviceId);
    if (compact) return <button type="button" key={job.id} className="ws-card" onClick={() => setOpenId(job.id)}>
      <span className="ws-plate">{vehicle?.plate ?? "—"}</span>
      <span className="ws-sub"><bdi>{vehicle?.makeModel}</bdi><bdi>{customerName(job.customerId)}</bdi></span>
      <span className="ws-card-foot"><span>{service}</span><span>{techName(job.assignedUserId) || (canAssign && !job.assignedUserId ? t("Unassigned", "غير مسند") : "")}</span></span>
    </button>;
    return <article className="ws-tech-card" key={job.id}>
      <div className="ws-tech-head">
        <button type="button" className="ws-open" onClick={() => setOpenId(job.id)}>
          <span className="ws-plate">{vehicle?.plate ?? "—"}</span>
          <span className="ws-sub"><bdi>{vehicle?.makeModel}</bdi><bdi>{customerName(job.customerId)}</bdi></span>
          <span className="ws-sub">{service}{booking ? ` · ${t("Pickup", "التسليم")} ${dateLabel(booking.expectedPickup, lang)}` : ""}</span>
        </button>
        <StatusBadge status={job.stage} domain="job" lang={lang} />
      </div>
      {renderActions(job, true)}
    </article>;
  };

  const detail = () => {
    if (!open) return null;
    const vehicle = vehicleFor(open.customerId, open.vehicleId);
    const booking = state.bookings.find((b) => b.id === open.bookingId);
    const warranties = state.warranties.filter((w) => w.jobId === open.id);
    const history = state.jobEvents.filter((e) => e.jobId === open.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const branchTechs = technicians.filter((x) => x.branchIds.includes(open.branchId));
    const selected = pickedTech[open.id] ?? open.assignedUserId ?? "";
    const canSave = Boolean(selected) && selected !== open.assignedUserId && branchTechs.some((x) => x.userId === selected) && !saving;
    return <>
      <div className="ws-sub"><StatusBadge status={open.stage} domain="job" lang={lang} /><span>{branchName(open.branchId)}</span></div>
      {renderActions(open, true)}
      <Collapsible title={t("Linked records", "السجلات المرتبطة")} defaultOpen>
        <dl className="ws-detail-grid">
          <div><dt>{t("Vehicle", "المركبة")}</dt><dd><RecordRef type="vehicle" id={open.vehicleId} label={vehicle?.plate} subtitle={vehicle?.makeModel} /></dd></div>
          <div><dt>{t("Customer", "العميل")}</dt><dd><RecordRef type="customer" id={open.customerId} label={customerName(open.customerId)} /></dd></div>
          {booking && <div><dt>{t("Booking", "الحجز")}</dt><dd><RecordRef type="booking" id={booking.id} label={`${serviceName(booking.serviceId)} · ${dateLabel(booking.dropoffDate, lang)}`} /></dd></div>}
          {booking?.acceptedQuoteRef && <div><dt>{t("Accepted quote", "عرض السعر المقبول")}</dt><dd><RecordRef type="quote" id={booking.acceptedQuoteRef.quoteId} label={`${t("Quote", "عرض سعر")} · ${t("rev.", "إصدار")} ${booking.acceptedQuoteRef.revision}`} /></dd></div>}
          {warranties.map((w) => <div key={w.id}><dt>{t("Warranty", "الضمان")}</dt><dd><RecordRef type="warranty" id={w.id} label={w.policyName} /></dd></div>)}
        </dl>
      </Collapsible>
      <Collapsible title={t("Schedule", "الجدول")} defaultOpen>
        <dl className="ws-detail-grid">
          <div><dt>{t("Service", "الخدمة")}</dt><dd>{booking?.workSummary?.[lang] ?? serviceName(open.serviceId)}</dd></div>
          <div><dt>{t("Drop-off", "الاستلام")}</dt><dd>{booking ? dateLabel(booking.dropoffDate, lang) : "—"}</dd></div>
          <div><dt>{t("Expected pickup", "التسليم المتوقع")}</dt><dd>{booking ? dateLabel(booking.expectedPickup, lang) : "—"}</dd></div>
          <div><dt>{t("Technician", "الفني")}</dt><dd>{techName(open.assignedUserId) || (open.assignedUserId ? t("Assigned", "مسند") : t("Unassigned", "غير مسند"))}</dd></div>
        </dl>
      </Collapsible>
      {canAssign && <Collapsible title={t("Assign technician", "إسناد الفني")} defaultOpen={!open.assignedUserId}>
        {techState === "error"
          ? <div className="ws-assign"><Notice tone="warning">{t("Could not load the staff list.", "تعذر تحميل قائمة الموظفين.")}</Notice><div><button type="button" className="btn btn-sm" onClick={() => setReloadKey((k) => k + 1)}>{t("Retry", "إعادة المحاولة")}</button></div></div>
          : techState !== "ready" ? <Skeleton rows={1} label={t("Loading", "جارٍ التحميل")} />
          : !branchTechs.length ? <p className="ws-reason">{t("No active technician in this branch.", "لا يوجد فني نشط في هذا الفرع.")}</p>
          : <div className="ws-assign"><div className="ws-assign-row">
              <select className="field-select" aria-label={t("Technician", "الفني")} value={selected} disabled={!!saving} onChange={(e) => setPickedTech((c) => ({ ...c, [open.id]: e.target.value }))}>
                <option value="">{t("Select technician", "اختر فنيًا")}</option>
                {branchTechs.map((x) => <option key={x.userId} value={x.userId}>{x.name || t("Technician", "فني")}</option>)}
              </select>
              <button type="button" className="btn btn-primary" disabled={!canSave} onClick={() => void assign(open)}>{saving === open.id ? t("Saving…", "جارٍ الحفظ…") : open.assignedUserId ? t("Update", "تحديث") : t("Assign", "إسناد")}</button>
            </div></div>}
      </Collapsible>}
      {history.length > 0 && <Collapsible title={t("History", "السجل")} count={history.length}>
        <ul className="record-ref-list">{history.map((e) => <li className="record-ref-row" key={e.id}><span>{e.previousStage ? `${stageNames[e.previousStage][lang]} ← ` : ""}{stageNames[e.nextStage][lang]}<div className="record-ref-sub">{e.actorLabel} · {dateLabel(e.occurredAt, lang)}</div></span></li>)}</ul>
      </Collapsible>}
    </>;
  };

  const grouped = groupByStage(jobs);
  const stageFilterOptions = Object.entries(stageNames).map(([value, label]) => ({ value, label: label[lang] }));
  const techOptions = [{ value: "unassigned", label: t("Unassigned", "غير مسند") }, ...technicians.map((x) => ({ value: x.userId, label: x.name || t("Technician", "فني") }))];

  return <>
    {header}
    {isTechnician
      ? <div className="ws-tech-list">{jobs.length ? jobs.map((job) => jobCard(job, false)) : empty}</div>
      : <>
        <FilterBar lang={lang} resultCount={jobs.length} onClear={filtersActive ? clearFilters : undefined}
          search={{ value: query, onChange: setQuery, placeholder: t("Plate, customer or service", "اللوحة أو العميل أو الخدمة") }}
          filters={[
            ...(view === "list" ? [{ key: "stage", label: t("Stage", "المرحلة"), value: stage, options: stageFilterOptions, onChange: (v: string) => setStage(v as JobStage | "all") }] : []),
            ...(canAssign ? [{ key: "tech", label: t("Technician", "الفني"), value: technicianFilter, options: techOptions, onChange: setTechnicianFilter }] : []),
          ]} />
        {techState === "error" && <Notice tone="warning">{t("Technician list unavailable. Assignment is disabled.", "قائمة الفنيين غير متاحة. الإسناد معطل.")}</Notice>}
        <TabBar ariaLabel={t("View", "العرض")} value={view === "list" ? "list" : "board"} onChange={setView}
          tabs={[{ id: "board", label: t("Board", "اللوحة") }, { id: "list", label: t("List", "القائمة") }]} />
        {view === "list"
          ? <DataTable<Job> lang={lang} caption={t("Workshop jobs", "أوامر الشغل")} columns={columns} rows={jobs} rowKey={(j) => j.id} onRowClick={(j) => setOpenId(j.id)} selectedKey={openId || null} empty={empty} />
          : jobs.length === 0 ? empty
          : <div className="ws-board">
              {boardStages.map((s) => <section className="ws-col" key={s} aria-label={stageNames[s][lang]}>
                <div className="ws-col-head"><span>{stageNames[s][lang]}</span><span className="ws-col-count">{grouped[s].length}</span></div>
                {grouped[s].map((job) => jobCard(job, true))}
              </section>)}
              {terminalStages.some((s) => grouped[s].length) && <p className="ws-reason">{t("Closed jobs are in the List view.", "الأوامر المغلقة في عرض القائمة.")}</p>}
            </div>}
      </>}

    <DetailDrawer open={Boolean(open)} onClose={() => setOpenId("")} lang={lang}
      title={open ? vehicleLabel(open) : ""} subtitle={open ? customerName(open.customerId) : undefined}>
      {detail()}
    </DetailDrawer>

    <ConfirmDialog open={Boolean(confirm)} danger lang={lang} busy={moving}
      title={confirm ? (confirm.target === "cancelled" ? t("Cancel this job?", "إلغاء أمر الشغل؟") : t("Mark as no-show?", "تسجيل عدم الحضور؟")) : ""}
      body={confirm ? `${vehicleLabel(confirm.job)} · ${customerName(confirm.job.customerId)}` : undefined}
      confirmLabel={confirm ? actionLabel(confirm.target) : undefined}
      onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm) void doMove(confirm.job, confirm.target); }} />
  </>;
}
