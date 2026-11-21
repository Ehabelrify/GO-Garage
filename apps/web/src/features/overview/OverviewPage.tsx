import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FinancialMetricId, FinancialReport, GarageState, Job, MetricValue, QueueItem } from "@garage/domain";
import { configuredNumber } from "@garage/domain";
import { ArrowUpRight } from "lucide-react";
import { financeApi, useGarageStore, workQueueApi } from "../../shared/store";
import { dateLabel, pageBranchMatches, serviceDisplay, customerDisplay, type BranchPageProps } from "../../shared/ui";
import { Collapsible, DataTable, EmptyState, FilterBar, Money, PageHeader, RecordRef, StatusBadge, type Column } from "../../shared/components";
import type { RecordType } from "../../shared/record-types";
import { isActiveJob, localIsoDate, monthStart, nextActionLabels, queueKinds, queueLabels, queueRecordType, queueTarget, sortQueue, summariseBranches, todayBookings, type BranchSummary } from "./overview-logic";
import "./overview.css";

interface OverviewPageProps extends BranchPageProps {
  navigate: (path: string) => void;
}

const financeTiles: Array<{ id: FinancialMetricId; en: string; ar: string }> = [
  { id: "collections", en: "Collections this month", ar: "المحصّل هذا الشهر" },
  { id: "outstanding", en: "Outstanding balance", ar: "الرصيد المستحق" },
  { id: "gross-profit", en: "Gross profit this month", ar: "مجمل ربح الشهر" },
];

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }

function Tile({ label, value, foot, onOpen, tone }: { label: string; value: ReactNode; foot?: string; onOpen: () => void; tone?: "warning" }) {
  return <button type="button" className="ov-tile" data-tone={tone} onClick={onOpen}>
    <span className="ov-tile-label">{label}<ArrowUpRight size={14} aria-hidden="true" /></span>
    <span className="ov-tile-value">{value}</span>
    {foot && <span className="ov-tile-foot">{foot}</span>}
  </button>;
}

export function OverviewPage({ lang, t, state, navigate, branchName }: OverviewPageProps) {
  const { actor } = useGarageStore();
  const role = actor?.role;
  const isOwner = role === "owner";
  const isManager = role === "branch-manager";
  const isReception = role === "receptionist";
  const canSeeFinance = isOwner;

  const [branchFilter, setBranchFilter] = useState<string>(state.currentBranch);
  useEffect(() => { setBranchFilter(state.currentBranch); }, [state.currentBranch]);
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
  const sortedQueue = useMemo(() => sortQueue(queue).filter((item) => kind === "all" || item.kind === kind), [queue, kind]);

  const visibleBranches = state.branches.filter((branch) => pageBranchMatches({ ...state, currentBranch: "all" } as GarageState, branch.id));
  const summaries = useMemo(() => summariseBranches(visibleBranches.map((branch) => branch.id), state.jobs, state.bookings, queue, today), [visibleBranches.length, state.jobs, state.bookings, queue, today]);
  const showComparison = (isOwner || isManager) && visibleBranches.length > 1;
  const canPickBranch = visibleBranches.length > 1;

  const customerOf = (customerId: string) => state.customers.find((customer) => customer.id === customerId);
  const personLabel = (customerId: string) => { const name = customerOf(customerId)?.name; return name ? customerDisplay(name, lang) : ""; };
  const plateOf = (customerId: string, vehicleId: string) => customerOf(customerId)?.vehicles.find((vehicle) => vehicle.id === vehicleId)?.plate ?? "";
  const bookingLabel = (id: string) => { const b = state.bookings.find((x) => x.id === id); return b ? [personLabel(b.customerId), plateOf(b.customerId, b.vehicleId)].filter(Boolean).join(" · ") : undefined; };
  const jobLabel = (id: string) => { const j = state.jobs.find((x) => x.id === id); return j ? [plateOf(j.customerId, j.vehicleId), personLabel(j.customerId)].filter(Boolean).join(" · ") : undefined; };
  const recordLabel = (type: RecordType, id: string) => type === "booking" ? bookingLabel(id) : type === "job" ? jobLabel(id) : undefined;
  const stageText = (stage: string) => <StatusBadge status={stage} lang={lang} />;
  const actionText = (item: QueueItem) => {
    const known = item.nextAction ? nextActionLabels[item.nextAction] : undefined;
    if (known) return t(known.en, known.ar);
    if (item.waitingReason) return t("Waiting on setup", "في انتظار الإعداد");
    return t("Open to review", "افتح للمراجعة");
  };

  const kindOptions = [{ value: "all", label: t("All types", "كل الأنواع") }, ...queueKinds.map((value) => ({ value, label: t(queueLabels[value].en, queueLabels[value].ar) }))];

  const attentionColumns: Column<QueueItem>[] = [
    { key: "kind", header: t("Type", "النوع"), primary: true, render: (item) => { const label = queueLabels[item.kind]; return label ? t(label.en, label.ar) : item.kind; } },
    { key: "record", header: t("Record", "السجل"), hideOnCard: false, render: (item) => { const type = queueRecordType(item.kind); return type ? <RecordRef type={type} id={item.recordId} label={recordLabel(type, item.recordId)} /> : <span className="ov-muted">—</span>; } },
    ...(branchFilter === "all" ? [{ key: "branch", header: t("Branch", "الفرع"), render: (item: QueueItem) => branchName(item.branchId) } as Column<QueueItem>] : []),
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
    { key: "vehicle", header: t("Vehicle", "المركبة"), primary: true, render: (job) => <RecordRef type="job" id={job.id} label={jobLabel(job.id)} /> },
    { key: "service", header: t("Service", "الخدمة"), render: (job) => { const service = state.services.find((item) => item.id === job.serviceId); return service ? serviceDisplay(service.name, lang) : "—"; } },
    { key: "branch", header: t("Branch", "الفرع"), render: (job) => branchName(job.branchId) },
    { key: "stage", header: t("Stage", "المرحلة"), render: (job) => stageText(job.stage) },
    { key: "updated", header: t("Updated", "آخر تحديث"), sortable: true, sortValue: (job) => job.updatedAt, render: (job) => dateLabel(job.updatedAt, lang) },
  ];

  type DayRow = (typeof day.dropoffs)[number];
  const dayColumns = (timeHeader: string, timeOf: (row: DayRow) => string): Column<DayRow>[] => [
    { key: "time", header: timeHeader, primary: true, mono: true, render: timeOf },
    { key: "booking", header: t("Booking", "الحجز"), render: (row) => <RecordRef type="booking" id={row.id} label={bookingLabel(row.id)} /> },
    { key: "customer", header: t("Customer", "العميل"), render: (row) => <RecordRef type="customer" id={row.customerId} label={personLabel(row.customerId) || undefined} /> },
    { key: "status", header: t("Status", "الحالة"), render: (row) => <StatusBadge status={row.status} lang={lang} domain="booking" /> },
  ];
  const dropoffTable = <DataTable<DayRow> lang={lang} caption={t("Today’s drop-offs", "تسليمات اليوم للورشة")} rows={day.dropoffs} rowKey={(row) => row.id} columns={dayColumns(t("Time", "الوقت"), (row) => row.dropoffTime)} onRowClick={(row) => navigate(`/workspace/bookings?record=${encodeURIComponent(row.id)}`)} empty={<EmptyState title={t("No drop-offs today", "لا توجد تسليمات اليوم")} />} />;
  const pickupTable = <DataTable<DayRow> lang={lang} caption={t("Today’s pickups", "تسليمات اليوم للعملاء")} rows={day.pickups} rowKey={(row) => row.id} columns={dayColumns(t("Date", "التاريخ"), (row) => dateLabel(row.expectedPickup, lang))} onRowClick={(row) => navigate(`/workspace/bookings?record=${encodeURIComponent(row.id)}`)} empty={<EmptyState title={t("No pickups today", "لا توجد تسليمات للعملاء اليوم")} />} />;

  const todaySection = <section className="ov-section" aria-label={t("Today", "اليوم")}>
    <div className="ov-section-head"><h2>{t("Today", "اليوم")}</h2></div>
    <div className="ov-split">
      <div><h3 className="ov-muted">{t("Drop-offs", "وصول السيارات")}</h3>{dropoffTable}</div>
      <div><h3 className="ov-muted">{t("Pickups", "تسليم السيارات")}</h3>{pickupTable}</div>
    </div>
  </section>;

  const metricValue = (id: FinancialMetricId): ReactNode => {
    if (reportState === "loading") return "…";
    const value: MetricValue | undefined = report?.metrics[id];
    if (!value || value.state === "unavailable") return "—";
    return <Money minor={value.amount.minor} currency={value.amount.currency} lang={lang} />;
  };
  const metricFoot = (id: FinancialMetricId) => {
    const value = report?.metrics[id];
    if (reportState === "error") return t("Unavailable", "غير متاح");
    if (value?.state === "incomplete") return t("Incomplete data", "بيانات غير مكتملة");
    if (value?.state === "unavailable") return t("Not configured", "غير مُعدّ");
    return t("Open Finance", "فتح المالية");
  };

  const title = isOwner ? t("Overview", "نظرة عامة") : isReception ? t("Today", "اليوم") : t("Branch overview", "نظرة على الفرع");
  const branchSelect = canPickBranch
    ? <label><span className="sr-only">{t("Branch", "الفرع")}</span><select className="filter-select ov-branch-select" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
      <option value="all">{t("All branches", "كل الفروع")}</option>
      {visibleBranches.map((branch) => <option key={branch.id} value={branch.id}>{branchName(branch.id)}</option>)}
    </select></label>
    : undefined;

  const attentionSection = <section className="ov-section" aria-label={t("Needs attention", "يحتاج متابعة")}>
    <div className="ov-section-head"><h2>{t("Needs attention", "يحتاج متابعة")}</h2></div>
    <FilterBar lang={lang} filters={[{ key: "kind", label: t("Type", "النوع"), value: kind, options: kindOptions, onChange: setKind }]} onClear={() => setKind("all")} resultCount={queueLoading || queueError ? undefined : sortedQueue.length} />
    <DataTable<QueueItem>
      lang={lang}
      caption={t("Needs attention", "يحتاج متابعة")}
      columns={attentionColumns}
      rows={sortedQueue}
      rowKey={(item) => `${item.kind}:${item.recordId}`}
      loading={queueLoading}
      error={queueError || undefined}
      onRetry={() => setQueueRetry((value) => value + 1)}
      onRowClick={(item) => navigate(queueTarget(item))}
      empty={kind !== "all"
        ? <EmptyState variant="no-results" title={t("Nothing of this type", "لا توجد بنود من هذا النوع")} action={<button type="button" className="btn btn-sm" onClick={() => setKind("all")}>{t("Clear filters", "مسح التصفية")}</button>} />
        : <EmptyState title={t("All clear", "لا شيء يحتاج متابعة")} />}
    />
  </section>;

  return <>
    <PageHeader title={title} subtitle={branchFilter === "all" ? t("All branches", "كل الفروع") : branchName(branchFilter)} actions={branchSelect} />

    <div className="ov-tiles">
      <Tile label={t("Needs attention", "يحتاج متابعة")} value={queueLoading ? "…" : queue.length} tone={queue.length > 0 ? "warning" : undefined} onOpen={() => document.getElementById("ov-attention")?.scrollIntoView({ behavior: "smooth" })} />
      <Tile label={t("Active jobs", "أوامر نشطة")} value={activeJobs.length} onOpen={() => navigate("/workspace/workshop")} />
      <Tile label={t("Drop-offs today", "وصول اليوم")} value={day.dropoffs.length} onOpen={() => navigate("/workspace/bookings")} />
      <Tile label={t("Ready for pickup", "جاهز للتسليم")} value={queueLoading ? "…" : readyCount} onOpen={() => navigate("/workspace/workshop")} />
      {canSeeFinance && financeTiles.map((tile) => <Tile key={tile.id} label={t(tile.en, tile.ar)} value={metricValue(tile.id)} foot={metricFoot(tile.id)} onOpen={() => navigate("/workspace/finance")} />)}
    </div>

    {isReception && todaySection}
    <div id="ov-attention">{attentionSection}</div>

    {showComparison && <section className="ov-section" aria-label={t("Branch comparison", "مقارنة الفروع")}>
      <div className="ov-section-head"><h2>{t("Branches", "الفروع")}</h2></div>
      <DataTable<BranchSummary> lang={lang} caption={t("Branch comparison", "مقارنة الفروع")} columns={branchColumns} rows={summaries} rowKey={(row) => row.branchId} selectedKey={branchFilter} onRowClick={(row) => setBranchFilter(row.branchId)} empty={<EmptyState title={t("No branches", "لا توجد فروع")} />} />
    </section>}

    {!isReception && <Collapsible title={t("Today", "اليوم")} count={day.dropoffs.length + day.pickups.length}>{todaySection}</Collapsible>}
    <Collapsible title={t("Vehicles in the workshop", "المركبات في الورشة")} count={activeJobs.length}>
      <DataTable<Job> lang={lang} caption={t("Vehicles in the workshop", "المركبات في الورشة")} columns={jobColumns} rows={activeJobs.slice(0, 8)} rowKey={(job) => job.id} onRowClick={(job) => navigate(`/workspace/workshop?record=${encodeURIComponent(job.id)}`)} empty={<EmptyState title={t("No active jobs", "لا توجد أوامر نشطة")} />} />
      {activeJobs.length > 8 && <p><button type="button" className="text-link" onClick={() => navigate("/workspace/workshop")}>{t("Open workshop", "فتح الورشة")}</button></p>}
    </Collapsible>
  </>;
}
