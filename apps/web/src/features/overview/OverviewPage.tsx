import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FinancialMetricId, FinancialReport, GarageState, Job, MetricValue, QueueItem } from "@garage/domain";
import { configuredNumber } from "@garage/domain";
import { ArrowUpRight } from "lucide-react";
import { financeApi, useGarageStore, workQueueApi } from "../../shared/store";
import { pageBranchMatches, serviceDisplay, customerDisplay, type BranchPageProps } from "../../shared/ui";
import { Amount, Collapsible, DataTable, DateText, Delta, EmptyState, PageHeader, Plate, RecordRef, StatusBadge, type Column } from "../../shared/components";
import { isActiveJob, localIsoDate, monthStart, nextActionLabels, queueLabels, queuePath, queueTarget, selectAttention, groupQueue, summariseBranches, describeQueueRecord, todayBookings, type BranchSummary, type QueueLookup } from "./overview-logic";
import "./overview.css";

interface OverviewPageProps extends BranchPageProps {
  navigate: (path: string) => void;
}

const ATTENTION_LIMIT = 10;
const WORKSHOP_LIMIT = 8;

const financeTiles: Array<{ id: FinancialMetricId; en: string; ar: string; inverse?: boolean }> = [
  { id: "collections", en: "Collections", ar: "المحصّل" },
  { id: "outstanding", en: "Outstanding balance", ar: "الرصيد المستحق", inverse: true },
  { id: "gross-profit", en: "Gross profit", ar: "مجمل الربح" },
];

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }

function Tile({ label, value, foot, onOpen, tone }: { label: string; value: ReactNode; foot?: ReactNode; onOpen: () => void; tone?: "warning" }) {
  return <button type="button" className="ov-tile" data-tone={tone} onClick={onOpen}>
    <span className="ov-tile-label"><span className="ov-tile-label-text">{label}</span><ArrowUpRight size={14} aria-hidden="true" /></span>
    <span className="ov-tile-value">{value}</span>
    {foot && <span className="ov-tile-foot">{foot}</span>}
  </button>;
}

export function OverviewPage({ lang, t, state, navigate, branchName }: OverviewPageProps) {
  const { actor, setCurrentBranch } = useGarageStore();
  const role = actor?.role;
  const isOwner = role === "owner";
  const isManager = role === "branch-manager";
  const isReception = role === "receptionist";
  const canSeeFinance = isOwner;

  // The topbar branch select is the only branch control; the page follows it.
  const branchFilter: string = state.currentBranch;
  const inScope = (branchId: string) => branchFilter === "all" || branchFilter === branchId;

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueError, setQueueError] = useState("");
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueRetry, setQueueRetry] = useState(0);
  const [kind, setKind] = useState("all");

  useEffect(() => {
    let current = true;
    setQueueLoading(true);
    setQueueError("");
    void workQueueApi.list({ branchId: branchFilter })
      .then((items) => { if (current) setQueue(items); })
      .catch((error) => { if (current) { setQueue([]); setQueueError(errorMessage(error)); } })
      .finally(() => { if (current) setQueueLoading(false); });
    return () => { current = false; };
  }, [branchFilter, queueRetry]);

  const [report, setReport] = useState<FinancialReport | null>(null);
  const [reportState, setReportState] = useState<"idle" | "loading" | "error">("idle");
  useEffect(() => {
    if (!canSeeFinance) return;
    let current = true;
    setReportState("loading");
    void financeApi.report({ branchId: branchFilter, from: monthStart(), to: localIsoDate(), groupBy: "month" })
      .then((result) => { if (current) { setReport(result); setReportState("idle"); } })
      .catch(() => { if (current) { setReport(null); setReportState("error"); } });
    return () => { current = false; };
  }, [canSeeFinance, branchFilter]);

  const today = localIsoDate();
  const jobs = useMemo(() => state.jobs.filter((job) => inScope(job.branchId)), [state.jobs, branchFilter]);
  const bookings = useMemo(() => state.bookings.filter((booking) => inScope(booking.branchId)), [state.bookings, branchFilter]);
  const day = useMemo(() => todayBookings(bookings, today), [bookings, today]);
  const activeJobs = jobs.filter(isActiveJob);
  const readyCount = queue.filter((item) => item.kind === "ready-pickup").length;
  const groups = useMemo(() => groupQueue(queue), [queue]);
  const attention = useMemo(() => selectAttention(queue, kind, ATTENTION_LIMIT), [queue, kind]);
  // A selected kind that no longer has items (branch change) falls back to all.
  useEffect(() => { if (kind !== "all" && !groups.some((group) => group.kind === kind)) setKind("all"); }, [groups, kind]);

  const visibleBranches = state.branches.filter((branch) => pageBranchMatches({ ...state, currentBranch: "all" } as GarageState, branch.id));
  const summaries = useMemo(() => summariseBranches(visibleBranches.map((branch) => branch.id), state.jobs, state.bookings, queue, today), [visibleBranches.length, state.jobs, state.bookings, queue, today]);
  const showComparison = (isOwner || isManager) && visibleBranches.length > 1;

  const lookup: QueueLookup = useMemo(() => ({
    bookings: state.bookings, jobs: state.jobs, claims: state.warrantyClaims, warranties: state.warranties, customers: state.customers,
  }), [state.bookings, state.jobs, state.warrantyClaims, state.warranties, state.customers]);

  const customerOf = (customerId: string) => state.customers.find((customer) => customer.id === customerId);
  const personLabel = (customerId: string) => { const name = customerOf(customerId)?.name; return name ? customerDisplay(name, lang) : ""; };
  const plateOf = (customerId: string, vehicleId: string) => customerOf(customerId)?.vehicles.find((vehicle) => vehicle.id === vehicleId)?.plate ?? "";
  const stageText = (stage: string) => <StatusBadge status={stage} lang={lang} />;
  const kindLabel = (value: string) => { const label = queueLabels[value]; return label ? t(label.en, label.ar) : value; };
  const actionText = (item: QueueItem) => {
    const known = item.nextAction ? nextActionLabels[item.nextAction] : undefined;
    if (known) return t(known.en, known.ar);
    if (item.waitingReason) return t("Waiting on setup", "في انتظار الإعداد");
    return t("Open to review", "افتح للمراجعة");
  };

  // Record cell: who (RecordRef), which car (Plate), when (DateText). Never a bare dash.
  const recordCell = (item: QueueItem) => {
    const info = describeQueueRecord(item, lookup);
    const name = info.customerName ? customerDisplay(info.customerName, lang) : "";
    return <span className="ov-record">
      <span className="ov-record-main">
        {info.type ? <RecordRef type={info.type} id={item.recordId} label={name || undefined} /> : <span className="ov-record-kind">{kindLabel(item.kind)}</span>}
      </span>
      <span className="ov-record-meta">
        {info.plate && <Plate value={info.plate} />}
        {info.date && <DateText value={info.date} lang={lang} />}
        {!info.plate && !info.date && <span>{branchName(item.branchId)}</span>}
      </span>
    </span>;
  };

  const attentionColumns: Column<QueueItem>[] = [
    { key: "record", header: t("Record", "السجل"), primary: true, hideOnCard: false, render: recordCell },
    ...(branchFilter === "all" ? [{ key: "branch", header: t("Branch", "الفرع"), render: (item: QueueItem) => <span className="ov-nowrap">{branchName(item.branchId)}</span> } as Column<QueueItem>] : []),
    { key: "stage", header: t("Stage", "المرحلة"), render: (item) => stageText(item.stage) },
    { key: "next", header: t("Next step", "الخطوة التالية"), render: actionText },
  ];

  const branchColumns: Column<BranchSummary>[] = [
    { key: "branch", header: t("Branch", "الفرع"), primary: true, sortable: true, sortValue: (row) => branchName(row.branchId), render: (row) => branchName(row.branchId) },
    { key: "active", header: t("Active jobs", "أوامر نشطة"), numeric: true, sortable: true, sortValue: (row) => row.activeJobs, render: (row) => row.activeJobs },
    { key: "today", header: t("Today’s drop-offs", "تسليمات اليوم للورشة"), numeric: true, sortable: true, sortValue: (row) => row.todayDropoffs, render: (row) => row.todayDropoffs },
    { key: "confirmed", header: t("Confirmed bookings", "حجوزات مؤكدة"), numeric: true, sortable: true, sortValue: (row) => row.confirmedBookings, render: (row) => row.confirmedBookings },
    { key: "attention", header: t("Needs attention", "يحتاج متابعة"), numeric: true, sortable: true, sortValue: (row) => row.attention, render: (row) => row.attention },
    { key: "capacity", header: t("Bays", "البايات"), numeric: true, hideOnCard: true, render: (row) => {
      const branch = state.branches.find((item) => item.id === row.branchId);
      if (!branch) return "—";
      return configuredNumber(state.decisions, "clean-bays", branch.id, branch.cleanBays) + configuredNumber(state.decisions, "general-bays", branch.id, branch.generalBays);
    } },
  ];

  const jobColumns: Column<Job>[] = [
    { key: "vehicle", header: t("Vehicle", "المركبة"), primary: true, render: (job) => <span className="ov-record"><span className="ov-record-main"><RecordRef type="job" id={job.id} label={personLabel(job.customerId) || undefined} /></span><span className="ov-record-meta"><Plate value={plateOf(job.customerId, job.vehicleId)} /></span></span> },
    { key: "service", header: t("Service", "الخدمة"), render: (job) => { const service = state.services.find((item) => item.id === job.serviceId); return service ? serviceDisplay(service.name, lang) : "—"; } },
    { key: "branch", header: t("Branch", "الفرع"), render: (job) => <span className="ov-nowrap">{branchName(job.branchId)}</span> },
    { key: "stage", header: t("Stage", "المرحلة"), render: (job) => stageText(job.stage) },
    { key: "updated", header: t("Updated", "آخر تحديث"), sortable: true, sortValue: (job) => job.updatedAt, render: (job) => <DateText value={job.updatedAt} lang={lang} /> },
  ];

  type DayRow = (typeof day.dropoffs)[number];
  const dayColumns = (timeHeader: string, timeCell: (row: DayRow) => ReactNode): Column<DayRow>[] => [
    { key: "time", header: timeHeader, primary: true, render: timeCell },
    { key: "customer", header: t("Customer", "العميل"), render: (row) => <RecordRef type="customer" id={row.customerId} label={personLabel(row.customerId) || undefined} /> },
    { key: "vehicle", header: t("Vehicle", "المركبة"), render: (row) => <Plate value={plateOf(row.customerId, row.vehicleId)} /> },
    { key: "status", header: t("Status", "الحالة"), render: (row) => <StatusBadge status={row.status} lang={lang} domain="booking" /> },
  ];
  const openBooking = (row: DayRow) => navigate(`/workspace/bookings?record=${encodeURIComponent(row.id)}`);
  const dropoffTable = <DataTable<DayRow> lang={lang} caption={t("Today’s drop-offs", "تسليمات اليوم للورشة")} rows={day.dropoffs} rowKey={(row) => row.id} columns={dayColumns(t("Time", "الوقت"), (row) => <bdi dir="ltr" className="ov-nowrap">{row.dropoffTime}</bdi>)} onRowClick={openBooking} pageSize={10} pageSizes={[10, 25, 50]} empty={<EmptyState title={t("No drop-offs today", "لا توجد تسليمات اليوم")} />} />;
  const pickupTable = <DataTable<DayRow> lang={lang} caption={t("Today’s pickups", "تسليمات اليوم للعملاء")} rows={day.pickups} rowKey={(row) => row.id} columns={dayColumns(t("Pickup", "التسليم"), (row) => <DateText value={row.expectedPickup} lang={lang} />)} onRowClick={openBooking} pageSize={10} pageSizes={[10, 25, 50]} empty={<EmptyState title={t("No pickups today", "لا توجد تسليمات للعملاء اليوم")} />} />;

  const todayTitle = isReception ? t("Arrivals and pickups", "الوصول والتسليم") : t("Today", "اليوم");
  const todaySection = <section className="ov-section" aria-label={todayTitle}>
    <div className="ov-section-head"><h2>{todayTitle}</h2><span className="ov-muted">{t(`${day.dropoffs.length} drop-offs · ${day.pickups.length} pickups`, `${day.dropoffs.length} وصول · ${day.pickups.length} تسليم`)}</span></div>
    <div className="ov-split">
      <div className="ov-col"><h3 className="ov-sub">{t("Drop-offs", "وصول السيارات")}</h3>{dropoffTable}</div>
      <div className="ov-col"><h3 className="ov-sub">{t("Pickups", "تسليم السيارات")}</h3>{pickupTable}</div>
    </div>
  </section>;

  const metricValue = (id: FinancialMetricId): ReactNode => {
    if (reportState === "loading") return "…";
    const value: MetricValue | undefined = report?.metrics[id];
    if (!value || value.state === "unavailable") return "—";
    return <Amount variant="kpi" minor={value.amount.minor} currency={value.amount.currency} lang={lang} />;
  };
  const metricFoot = (id: FinancialMetricId, inverse?: boolean): ReactNode => {
    const value = report?.metrics[id];
    if (reportState === "error") return t("Unavailable", "غير متاح");
    if (value?.state === "incomplete") return t("Incomplete data", "بيانات غير مكتملة");
    if (value?.state === "unavailable") return t("Not configured", "غير مُعدّ");
    const comparison = report?.comparisons?.[id];
    const percent = comparison && comparison.state === "available" ? comparison.percent : null;
    return <span className="ov-foot-line">
      <span>{t("This month", "هذا الشهر")}</span>
      {percent !== null && <Delta value={percent} unit="percent" lang={lang} inverse={inverse} />}
    </span>;
  };

  const title = isOwner ? t("Overview", "نظرة عامة") : isReception ? t("Today", "اليوم") : t("Branch overview", "نظرة على الفرع");

  const attentionBody = (() => {
    if (queueLoading || queueError) {
      return <DataTable<QueueItem> lang={lang} caption={t("Needs attention", "يحتاج متابعة")} columns={attentionColumns} rows={[]} rowKey={(item) => item.recordId} loading={queueLoading} error={queueError || undefined} onRetry={() => setQueueRetry((value) => value + 1)} paging={false} />;
    }
    if (queue.length === 0) return <EmptyState title={t("All clear", "لا شيء يحتاج متابعة")} text={t("Nothing is waiting for a decision.", "لا يوجد ما ينتظر قرارًا.")} />;
    return <>
      <div className="ov-chips" role="group" aria-label={t("Filter by type", "تصفية حسب النوع")}>
        <button type="button" className="ov-chip" aria-pressed={kind === "all"} onClick={() => setKind("all")}>{t("All", "الكل")} <span className="ov-chip-count">{queue.length}</span></button>
        {groups.map((group) => <button key={group.kind} type="button" className="ov-chip" aria-pressed={kind === group.kind} onClick={() => setKind(kind === group.kind ? "all" : group.kind)}>{kindLabel(group.kind)} <span className="ov-chip-count">{group.count}</span></button>)}
      </div>
      {attention.groups.map((group) => <div key={group.kind} className="ov-group">
        <div className="ov-group-head">
          <h3>{kindLabel(group.kind)} <span className="ov-chip-count">{group.count}</span></h3>
          <button type="button" className="text-link" onClick={() => navigate(queuePath(group.kind))}>{t(`View all ${group.count}`, `عرض الكل (${group.count})`)}</button>
        </div>
        <DataTable<QueueItem> lang={lang} caption={kindLabel(group.kind)} columns={attentionColumns} rows={group.items} rowKey={(item) => `${item.kind}:${item.recordId}`} onRowClick={(item) => navigate(queueTarget(item))} paging={false} />
      </div>)}
      <p className="ov-muted ov-showing" aria-live="polite">{t(`Showing ${attention.shown} of ${kind === "all" ? queue.length : (groups.find((group) => group.kind === kind)?.count ?? 0)}`, `عرض ${attention.shown} من ${kind === "all" ? queue.length : (groups.find((group) => group.kind === kind)?.count ?? 0)}`)}</p>
    </>;
  })();

  return <>
    <PageHeader title={title} subtitle={branchFilter === "all" ? t("All branches", "كل الفروع") : branchName(branchFilter)} />

    {todaySection}

    <div className="ov-tiles">
      <Tile label={t("Needs attention", "يحتاج متابعة")} value={queueLoading ? "…" : queue.length} tone={queue.length > 0 ? "warning" : undefined} onOpen={() => document.getElementById("ov-attention")?.scrollIntoView({ behavior: "smooth" })} />
      <Tile label={t("Active jobs", "أوامر نشطة")} value={activeJobs.length} onOpen={() => navigate("/workspace/workshop")} />
      <Tile label={t("Drop-offs today", "وصول اليوم")} value={day.dropoffs.length} onOpen={() => navigate("/workspace/bookings")} />
      <Tile label={t("Ready for pickup", "جاهز للتسليم")} value={queueLoading ? "…" : readyCount} onOpen={() => navigate("/workspace/workshop")} />
    </div>
    {canSeeFinance && <div className="ov-tiles ov-tiles-money">
      {financeTiles.map((tile) => <Tile key={tile.id} label={t(tile.en, tile.ar)} value={metricValue(tile.id)} foot={metricFoot(tile.id, tile.inverse)} onOpen={() => navigate("/workspace/finance")} />)}
    </div>}

    <div id="ov-attention"><section className="ov-section" aria-label={t("Needs attention", "يحتاج متابعة")}>
      <div className="ov-section-head"><h2>{t("Needs attention", "يحتاج متابعة")}</h2></div>
      {attentionBody}
    </section></div>

    {showComparison && <section className="ov-section" aria-label={t("Branch comparison", "مقارنة الفروع")}>
      <div className="ov-section-head"><h2>{t("Branches", "الفروع")}</h2></div>
      <DataTable<BranchSummary> lang={lang} caption={t("Branch comparison", "مقارنة الفروع")} columns={branchColumns} rows={summaries} rowKey={(row) => row.branchId} selectedKey={branchFilter} onRowClick={(row) => setCurrentBranch(row.branchId as GarageState["currentBranch"])} paging={false} empty={<EmptyState title={t("No branches", "لا توجد فروع")} />} />
    </section>}

    <Collapsible title={t("Vehicles in the workshop", "المركبات في الورشة")} count={activeJobs.length}>
      <DataTable<Job> lang={lang} caption={t("Vehicles in the workshop", "المركبات في الورشة")} columns={jobColumns} rows={activeJobs.slice(0, WORKSHOP_LIMIT)} rowKey={(job) => job.id} onRowClick={(job) => navigate(`/workspace/workshop?record=${encodeURIComponent(job.id)}`)} paging={false} empty={<EmptyState title={t("No active jobs", "لا توجد أوامر نشطة")} />} />
      {activeJobs.length > WORKSHOP_LIMIT && <p><button type="button" className="text-link" onClick={() => navigate("/workspace/workshop")}>{t(`View all ${activeJobs.length}`, `عرض الكل (${activeJobs.length})`)}</button></p>}
    </Collapsible>
  </>;
}
