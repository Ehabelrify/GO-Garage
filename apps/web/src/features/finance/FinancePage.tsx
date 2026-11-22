import { useCallback, useMemo, useState } from "react";
import { Info, Plus } from "lucide-react";
import type { Branch, FinancialMetricId, FinancialReport, FinancialSourceRow, Locale, MetricComparison, MetricValue, MoneyEvent, ReportFilter } from "@garage/domain";
import { financeApi, useGarageStore } from "../../shared/store";
import {
  Amount, Collapsible, DataTable, DetailDrawer, Delta, EmptyState, FilterBar, Notice, PageHeader, RecordRef, Skeleton, TabBar, TabPanel, useUrlState,
  type Column,
} from "../../shared/components";
import { FinanceRecordDetail } from "./FinanceRecordDetail";
import { MoneyEventForm } from "./MoneyEventForm";
import { AttestationPanel } from "./AttestationPanel";
import {
  allMetricIds, canViewFinance, isInverseMetric, reconciliationGap, sparklinePoints, canWriteFinance, emptyEventFilter, errorText, filterEvents, kindLabels, metricGroups, metricHints, metricLabels, moneyEventKinds,
  periodRange, provenanceLabel, reasonLabel, reportBranchOptions, signedMinor, sourceKindLabel, sourceMethodLabel, type EventFilter, type Period,
} from "./finance-logic";
import { dateTimeLabel, EventDate, makeT, Pill, useFinanceLookups } from "./finance-ui";
import { useLoad } from "./use-load";
import "./finance.css";

const TABS = ["overview", "events", "records"] as const;
type TabId = (typeof TABS)[number];

export function FinancePage({ lang, branches }: { lang: Locale; branches: Branch[] }) {
  const t = makeT(lang);
  const { actor, state } = useGarageStore();
  const canView = canViewFinance(actor);
  const canWrite = canWriteFinance(actor);
  const lookups = useFinanceLookups(branches, lang);
  const [tabParam, setTab] = useUrlState("tab", "overview");
  const tab: TabId = (TABS as readonly string[]).includes(tabParam) ? (tabParam as TabId) : "overview";
  const [recordId, setRecordId] = useUrlState("record", "");
  const [adding, setAdding] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [metric, setMetric] = useState<FinancialMetricId>("collections");

  const branchChoice = reportBranchOptions(actor, branches);
  const defaultBranch = state?.currentBranch && state.currentBranch !== "all" && branchChoice.branches.some((branch) => branch.id === state.currentBranch)
    ? state.currentBranch
    : branchChoice.all ? "all" : branchChoice.branches[0]?.id ?? "";
  const [period, setPeriodValue] = useState<Period>("month");
  const [range, setRange] = useState(() => periodRange("month"));
  const [reportBranch, setReportBranch] = useState(defaultBranch);
  const filter = useMemo<ReportFilter>(() => ({ branchId: reportBranch, ...range }), [reportBranch, range]);

  const events = useLoad<MoneyEvent[]>(() => (canView ? financeApi.events() : Promise.resolve([])), [canView], ["finance", "invoices"]);
  const selected = events.data?.find((event) => event.id === recordId);

  if (!canView) {
    return <>
      <PageHeader title={t("Finance", "المالية")} />
      <EmptyState title={t("Finance is not available for your account", "المالية غير متاحة لحسابك")} />
    </>;
  }

  const tabs = [
    { id: "overview", label: t("Overview", "نظرة عامة") },
    { id: "events", label: t("Money events", "الحركات المالية"), count: events.data?.length },
    { id: "records", label: t("Source records", "سجلات المصدر") },
  ];
  const openSources = (id: FinancialMetricId) => { setMetric(id); setTab("records"); };

  return <>
    <PageHeader
      title={t("Finance", "المالية")}
      subtitle={t("Operational figures from recorded sources. Not accounting.", "أرقام تشغيلية من مصادر مسجلة. ليست محاسبة.")}
      actions={canWrite ? <button type="button" className="btn btn-primary finance-add" onClick={() => { setTab("events"); setAdding(true); }}><Plus size={16} aria-hidden="true" />{t("Add money event", "إضافة حركة مالية")}</button> : undefined}
      tabs={<TabBar tabs={tabs} value={tab} onChange={(id) => setTab(id)} ariaLabel={t("Finance sections", "أقسام المالية")} idPrefix="fin" />}
    />
    {toast && <div role="status" className="finance-toast">{toast}</div>}
    <TabPanel idPrefix="fin" id="overview" active={tab === "overview"}>
      <OverviewTab lang={lang} filter={filter} period={period} setPeriod={(next) => { setPeriodValue(next); if (next !== "custom") setRange(periodRange(next)); }}
        range={range} setRange={(next) => { setPeriodValue("custom"); setRange(next); }} reportBranch={reportBranch} setReportBranch={setReportBranch}
        branchChoice={branchChoice} lookups={lookups} onSources={openSources} canWrite={canWrite} />
    </TabPanel>
    <TabPanel idPrefix="fin" id="events" active={tab === "events"}>
      <EventsTab lang={lang} events={events} lookups={lookups} branchChoice={branchChoice} selectedId={selected?.id ?? null} onOpen={setRecordId} canWrite={canWrite} onAdd={() => setAdding(true)} />
    </TabPanel>
    <TabPanel idPrefix="fin" id="records" active={tab === "records"}>
      <RecordsTab lang={lang} filter={filter} metric={metric} setMetric={setMetric} lookups={lookups} />
    </TabPanel>

    <DetailDrawer
      open={Boolean(selected)}
      onClose={() => setRecordId("")}
      lang={lang}
      title={selected ? kindLabels[selected.kind][lang] : ""}
      subtitle={selected ? dateTimeLabel(selected.effectiveAt, lang) : undefined}
    >
      {selected && <FinanceRecordDetail event={selected} lang={lang} lookups={lookups} canWrite={canWrite} onChanged={() => { events.reload(); setToast(t("Reversal added. The original stays on record.", "تمت إضافة العكس. يبقى الأصل محفوظاً.")); }} />}
    </DetailDrawer>
    {canWrite && <DetailDrawer
      open={adding}
      onClose={() => { if (!formBusy) setAdding(false); }}
      lang={lang}
      title={t("Add money event", "إضافة حركة مالية")}
      footer={<>
        <button type="button" className="btn" disabled={formBusy} onClick={() => setAdding(false)}>{t("Cancel", "إلغاء")}</button>
        <button type="submit" form="money-event-form" className="btn btn-primary" disabled={formBusy}>{formBusy ? t("Saving…", "جارٍ الحفظ…") : t("Record", "تسجيل")}</button>
      </>}
    >
      <MoneyEventForm formId="money-event-form" lang={lang} branches={branchChoice.branches} defaultBranchId={defaultBranch} lookups={lookups} onBusyChange={setFormBusy}
        onSaved={() => { setAdding(false); events.reload(); setToast(t("Money event recorded.", "تم تسجيل الحركة المالية.")); }} />
    </DetailDrawer>}
  </>;
}

type BranchChoice = ReturnType<typeof reportBranchOptions<Branch>>;

function OverviewTab({ lang, filter, period, setPeriod, range, setRange, reportBranch, setReportBranch, branchChoice, lookups, onSources, canWrite }: {
  lang: Locale; filter: ReportFilter; period: Period; setPeriod: (period: Period) => void;
  range: { from: string; to: string; groupBy: ReportFilter["groupBy"] }; setRange: (range: { from: string; to: string; groupBy: ReportFilter["groupBy"] }) => void;
  reportBranch: string; setReportBranch: (id: string) => void; branchChoice: BranchChoice; lookups: ReturnType<typeof useFinanceLookups>;
  onSources: (metric: FinancialMetricId) => void; canWrite: boolean;
}) {
  const t = makeT(lang);
  const report = useLoad<FinancialReport>(() => financeApi.report(filter), [filter.branchId, filter.from, filter.to, filter.groupBy], ["finance", "invoices"]);
  const lockedBranch = !branchChoice.all && branchChoice.branches.length === 1;
  const gap = report.data ? reconciliationGap(report.data.metrics) : null;
  const periodText = `${filter.from} – ${filter.to}`;
  const hasIncomplete = report.data && allMetricIds.some((id) => report.data!.metrics[id]?.state !== "available");
  const branchOptions = [...(branchChoice.all ? [{ value: "all", label: t("All branches", "كل الفروع") }] : []), ...branchChoice.branches.map((branch) => ({ value: branch.id, label: lookups.branchName(branch.id) }))];
  const periodOptions: Array<{ value: Period; label: string }> = [
    { value: "month", label: t("This month", "هذا الشهر") }, { value: "last-month", label: t("Last month", "الشهر الماضي") },
    { value: "ytd", label: t("Year to date", "منذ بداية السنة") }, { value: "custom", label: t("Custom dates", "فترة مخصصة") },
  ];
  return <>
    <FilterBar lang={lang}
      filters={[
        { key: "period", label: t("Period", "الفترة"), value: period, options: periodOptions, onChange: (value) => setPeriod(value as Period), allValue: "__none" },
        ...(lockedBranch ? [] : [{ key: "branch", label: t("Branch", "الفرع"), value: reportBranch, options: branchOptions, onChange: setReportBranch, allValue: branchChoice.all ? "all" : "__none" }]),
      ]}>
      {lockedBranch && <span className="tag" title={t("Your branch", "فرعك")}>{t("Your branch", "فرعك")}: {lookups.branchName(branchChoice.branches[0].id)}</span>}
      {period === "custom" && <>
        <label><span className="sr-only">{t("From", "من")}</span><input className="filter-select" type="date" value={range.from} max={range.to} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label>
        <label><span className="sr-only">{t("To", "إلى")}</span><input className="filter-select" type="date" value={range.to} min={range.from} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label>
      </>}
    </FilterBar>
    {report.loading && <Skeleton rows={6} label={t("Loading report", "جارٍ تحميل التقرير")} />}
    {report.error && <EmptyState variant="error" title={t("Could not load the report", "تعذر تحميل التقرير")} text={report.error} action={<button type="button" className="btn" onClick={report.reload}>{t("Retry", "إعادة المحاولة")}</button>} />}
    {report.data && !report.loading && <>
      {hasIncomplete && <Notice tone="info">{t("Figures marked incomplete or unavailable are not estimated.", "الأرقام غير المكتملة أو غير المتاحة لا يتم تقديرها.")}</Notice>}
      <p className="finance-period"><span>{t("Figures for", "الأرقام عن")}</span> <bdi dir="ltr">{periodText}</bdi></p>
      {metricGroups.map((group) => <section className="finance-group" key={group.id} aria-label={group[lang]}>
        <h2 className="finance-group-title">{group[lang]}</h2>
        <div className="finance-metrics">
          {group.metrics.map((id) => <MetricCard key={id} id={id} value={report.data!.metrics[id]} comparison={report.data!.comparisons[id]} lang={lang} pipeline={group.id === "pipeline"} onSources={() => onSources(id)} />)}
        </div>
      </section>)}
      {gap && <p className="finance-recon"><Info size={15} aria-hidden="true" /><span>{t(
        "Collections is cash received minus refunds. Recognized revenue follows the approved rule (work done), so the two differ by",
        "المحصّل هو النقد المستلم بعد الاسترداد. الإيراد المعترف به يتبع القاعدة المعتمدة (العمل المنجز)، لذلك يختلفان بمقدار")} <Amount variant="kpi" minor={Math.abs(gap.gapMinor)} currency={gap.currency} lang={lang} />.</span></p>}
      <TrendPreview report={report.data} lang={lang} />
      <Collapsible title={t("Trend by period", "الاتجاه حسب الفترة")} count={report.data.trends.length}>
        <TrendTable report={report.data} lang={lang} />
      </Collapsible>
    </>}
    {canWrite && <Collapsible title={t("Approve a definition's completeness", "اعتماد اكتمال تعريف")}><AttestationPanel lang={lang} onDone={report.reload} /></Collapsible>}
  </>;
}

function MetricCard({ id, value, comparison, lang, pipeline, onSources }: { id: FinancialMetricId; value: MetricValue | undefined; comparison: MetricComparison | undefined; lang: Locale; pipeline: boolean; onSources: () => void }) {
  const t = makeT(lang);
  const state = value?.state ?? "unavailable";
  const reasons = value && value.state !== "available" ? value.reasons : [];
  const unavailableWhy = state === "unavailable"
    ? (reasons.length ? reasons.map((reason) => reasonLabel(reason, lang)).join(" ") : t("No approved source for this figure yet.", "لا يوجد مصدر معتمد لهذا الرقم بعد."))
    : "";
  const inverse = isInverseMetric(id);
  return <article className={`finance-metric${pipeline ? " pipeline" : ""}`} data-state={state} data-metric={id}>
    <div className="finance-metric-head">
      <h3>{metricLabels[id][lang]}</h3>
      {state === "incomplete" && <Pill lang={lang} tone="warning">{t("Incomplete", "غير مكتمل")}</Pill>}
      {state === "unavailable" && <Pill lang={lang} tone="neutral">{t("Unavailable", "غير متاح")}</Pill>}
    </div>
    <div className="finance-metric-value">
      {value && value.state !== "unavailable"
        ? <Amount variant="kpi" minor={value.amount.minor} currency={value.amount.currency} lang={lang} />
        : <span aria-label={t("No figure", "لا يوجد رقم")}>—</span>}
    </div>
    <p className="finance-metric-hint">{metricHints[id][lang]}</p>
    <div className="finance-metric-note">
      {state === "unavailable" && <p className="finance-why" role="note"><Info size={13} aria-hidden="true" />{unavailableWhy}</p>}
      {state === "incomplete" && reasons.length > 0 && <ul className="finance-reasons">{reasons.map((reason) => <li key={reason}>{reasonLabel(reason, lang)}</li>)}</ul>}
      {value && value.state === "incomplete" && value.excludedSourceCount > 0 && <p className="finance-metric-hint">{t(`${value.excludedSourceCount} sources excluded`, `${value.excludedSourceCount} مصدر مستبعد`)}</p>}
    </div>
    <div className="finance-metric-delta">
      {comparison?.state === "available"
        ? <>
            {comparison.percent !== null && <Delta value={comparison.percent} unit="percent" lang={lang} inverse={inverse} />}
            <Delta value={comparison.delta.minor} unit="minor" currency={comparison.delta.currency} lang={lang} inverse={inverse} />
            <span className="finance-delta-label">{t("vs previous period", "مقارنة بالفترة السابقة")}</span>
          </>
        : <span className="finance-delta-label">{t("No comparison", "لا توجد مقارنة")}</span>}
    </div>
    <div className="finance-metric-foot">
      {value && value.state !== "unavailable" && value.sourceCount > 0
        ? <button type="button" className="btn btn-quiet btn-sm" onClick={onSources}>{t(`View ${value.sourceCount} sources`, `عرض ${value.sourceCount} مصدر`)}</button>
        : <span className="finance-delta-label">{t("No sources to show", "لا توجد مصادر للعرض")}</span>}
    </div>
  </article>;
}

/** Collapsed-trend preview: one sparkline per headline figure so the accordion is not a blank label. */
function TrendPreview({ report, lang }: { report: FinancialReport; lang: Locale }) {
  const t = makeT(lang);
  const shown: FinancialMetricId[] = ["collections", "recognized-revenue", "net-profit"];
  const lines = shown.map((id) => {
    const values = report.trends.map((row) => { const v = row.metrics[id]; return v && v.state !== "unavailable" ? v.amount.minor : null; });
    return { id, points: sparklinePoints(values, 120, 28) };
  }).filter((line) => line.points);
  if (!lines.length) return null;
  return <div className="finance-spark-row">
    {lines.map((line) => <figure key={line.id} className="finance-spark">
      <figcaption>{metricLabels[line.id][lang]}</figcaption>
      <svg viewBox="0 0 120 28" role="img" aria-label={`${metricLabels[line.id][lang]}: ${t("trend over the period", "الاتجاه خلال الفترة")}`} preserveAspectRatio="none"><polyline points={line.points!} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>
    </figure>)}
  </div>;
}

function TrendTable({ report, lang }: { report: FinancialReport; lang: Locale }) {
  const t = makeT(lang);
  const shown: FinancialMetricId[] = ["collections", "direct-cost", "recognized-revenue", "net-profit"];
  const columns: Column<FinancialReport["trends"][number]>[] = [
    { key: "bucket", header: t("Period", "الفترة"), render: (row) => <bdi dir="ltr">{row.bucket}</bdi>, primary: true, sortable: true, sortValue: (row) => row.bucket },
    ...shown.map((id) => ({
      key: id, header: metricLabels[id][lang], numeric: true,
      render: (row: FinancialReport["trends"][number]) => { const value = row.metrics[id]; return value && value.state !== "unavailable" ? <Amount minor={value.amount.minor} currency={value.amount.currency} lang={lang} /> : "—"; },
    })),
  ];
  return <DataTable columns={columns} rows={report.trends} rowKey={(row) => row.bucket} lang={lang} caption={t("Trend by period", "الاتجاه حسب الفترة")} empty={<EmptyState title={t("No data in this period", "لا توجد بيانات في هذه الفترة")} />} />;
}

function EventsTab({ lang, events, lookups, branchChoice, selectedId, onOpen, canWrite, onAdd }: {
  lang: Locale; events: ReturnType<typeof useLoad<MoneyEvent[]>>; lookups: ReturnType<typeof useFinanceLookups>; branchChoice: BranchChoice;
  selectedId: string | null; onOpen: (id: string) => void; canWrite: boolean; onAdd: () => void;
}) {
  const t = makeT(lang);
  const [filter, setFilter] = useState<EventFilter>(emptyEventFilter);
  const rows = useMemo(() => filterEvents(events.data ?? [], filter), [events.data, filter]);
  const patch = (next: Partial<EventFilter>) => setFilter((current) => ({ ...current, ...next }));
  const columns: Column<MoneyEvent>[] = [
    { key: "date", header: t("Date", "التاريخ"), render: (row) => <EventDate value={row.effectiveAt} lang={lang} />, sortable: true, sortValue: (row) => row.effectiveAt, primary: true },
    { key: "kind", header: t("Type", "النوع"), render: (row) => kindLabels[row.kind][lang], sortable: true, sortValue: (row) => kindLabels[row.kind][lang] },
    { key: "amount", header: t("Amount", "المبلغ"), numeric: true, render: (row) => <Amount minor={signedMinor(row.kind, row.amount.minor)} currency={row.amount.currency} lang={lang} />, sortable: true, sortValue: (row) => signedMinor(row.kind, row.amount.minor) },
    { key: "branch", header: t("Branch", "الفرع"), render: (row) => lookups.branchName(row.branchId) },
    { key: "source", header: t("Method", "الطريقة"), render: (row) => <>{sourceMethodLabel(row.sourceMethod, lang)} <bdi className="mono">{row.sourceReference}</bdi></> },
    { key: "links", header: t("Linked to", "مرتبط بـ"), hideOnCard: false, render: (row) => <span className="finance-links">
      {row.customerId && <RecordRef type="customer" id={row.customerId} label={lookups.customerName(row.customerId)} />}
      {row.quoteId && <RecordRef type="quote" id={row.quoteId} label={lookups.quoteLabel(row.quoteId)} />}
      {row.jobId && <RecordRef type="job" id={row.jobId} label={lookups.plateForJob(row.jobId)} />}
      {row.reservationId && <RecordRef type="reservation" id={row.reservationId} label={lookups.reservationLabel(row.reservationId)} />}
      {!row.customerId && !row.quoteId && !row.jobId && !row.reservationId && "—"}
    </span> },
    { key: "status", header: t("Status", "الحالة"), render: (row) => <Pill lang={lang} tone={row.reversed ? "neutral" : "success"}>{row.reversed ? t("Reversed", "معكوس") : t("Recorded", "مسجل")}</Pill> },
  ];
  const filtered = rows.length !== (events.data?.length ?? 0);
  return <>
    <FilterBar lang={lang}
      search={{ value: filter.query, onChange: (query) => patch({ query }), placeholder: t("Search reference or reason", "ابحث بالمرجع أو السبب") }}
      filters={[
        { key: "branch", label: t("Branch", "الفرع"), value: filter.branchId, onChange: (branchId) => patch({ branchId }), options: [{ value: "all", label: t("All branches", "كل الفروع") }, ...branchChoice.branches.map((branch) => ({ value: branch.id, label: lookups.branchName(branch.id) }))] },
        { key: "kind", label: t("Type", "النوع"), value: filter.kind, onChange: (kind) => patch({ kind }), options: [{ value: "all", label: t("All types", "كل الأنواع") }, ...moneyEventKinds.map((kind) => ({ value: kind, label: kindLabels[kind][lang] }))] },
        { key: "status", label: t("Status", "الحالة"), value: filter.status, onChange: (status) => patch({ status }), options: [{ value: "all", label: t("All statuses", "كل الحالات") }, { value: "recorded", label: t("Recorded", "مسجل") }, { value: "reversed", label: t("Reversed", "معكوس") }] },
      ]}
      onClear={() => setFilter(emptyEventFilter)} resultCount={events.data ? rows.length : undefined}>
      <label><span className="sr-only">{t("From date", "من تاريخ")}</span><input className="filter-select" type="date" value={filter.from} onChange={(event) => patch({ from: event.target.value })} /></label>
      <label><span className="sr-only">{t("To date", "إلى تاريخ")}</span><input className="filter-select" type="date" value={filter.to} onChange={(event) => patch({ to: event.target.value })} /></label>
      {(filter.from || filter.to) && <button type="button" className="btn btn-quiet btn-sm" onClick={() => patch({ from: "", to: "" })}>{t("Clear dates", "مسح التواريخ")}</button>}
    </FilterBar>
    <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} lang={lang} caption={t("Money events", "الحركات المالية")}
      loading={events.loading} error={events.error ? errorText(new Error(events.error), lang) : null} onRetry={events.reload}
      onRowClick={(row) => onOpen(row.id)} selectedKey={selectedId} initialSort={{ key: "date", direction: "desc" }}
      empty={filtered || filter.query || filter.branchId !== "all"
        ? <EmptyState variant="no-results" title={t("No events match", "لا توجد حركات مطابقة")} action={<button type="button" className="btn" onClick={() => setFilter(emptyEventFilter)}>{t("Clear filters", "مسح التصفية")}</button>} />
        : <EmptyState title={t("No money events yet", "لا توجد حركات مالية بعد")} action={canWrite ? <button type="button" className="btn btn-primary" onClick={onAdd}>{t("Add money event", "إضافة حركة مالية")}</button> : undefined} />} />
  </>;
}

function RecordsTab({ lang, filter, metric, setMetric, lookups }: { lang: Locale; filter: ReportFilter; metric: FinancialMetricId; setMetric: (id: FinancialMetricId) => void; lookups: ReturnType<typeof useFinanceLookups> }) {
  const t = makeT(lang);
  const [extra, setExtra] = useState<{ key: string; rows: FinancialSourceRow[]; cursor: string | null }>({ key: "", rows: [], cursor: null });
  const [moreError, setMoreError] = useState("");
  const key = `${filter.branchId}|${filter.from}|${filter.to}|${filter.groupBy}|${metric}`;
  const first = useLoad(() => financeApi.drilldown(filter, metric), [filter.branchId, filter.from, filter.to, filter.groupBy, metric], ["finance", "invoices"]);
  const more = extra.key === key ? extra : { key, rows: [] as FinancialSourceRow[], cursor: null as string | null };
  const rows = [...(first.data?.rows ?? []), ...more.rows];
  const cursor = more.key === key && more.rows.length ? more.cursor : first.data?.nextCursor ?? null;
  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setMoreError("");
    try {
      const next = await financeApi.drilldown(filter, metric, cursor);
      setExtra({ key, rows: [...more.rows, ...next.rows], cursor: next.nextCursor });
    } catch (failure) { setMoreError(errorText(failure, lang)); }
  }, [cursor, filter, metric, key, more.rows, lang]);
  const columns: Column<FinancialSourceRow>[] = [
    { key: "date", header: t("Date", "التاريخ"), render: (row) => <EventDate value={row.effectiveAt} lang={lang} />, sortable: true, sortValue: (row) => row.effectiveAt, primary: true },
    { key: "kind", header: t("Source", "المصدر"), render: (row) => sourceKindLabel(row.sourceKind, lang) },
    { key: "amount", header: t("Amount", "المبلغ"), numeric: true, render: (row) => <Amount minor={row.amount.minor} currency={row.amount.currency} lang={lang} />, sortable: true, sortValue: (row) => row.amount.minor },
    { key: "branch", header: t("Branch", "الفرع"), render: (row) => lookups.branchName(row.branchId) },
    { key: "quote", header: t("Quote", "عرض السعر"), render: (row) => row.relatedQuoteId ? <RecordRef type="quote" id={row.relatedQuoteId} label={lookups.quoteLabel(row.relatedQuoteId)} /> : "—" },
    { key: "provenance", header: t("Basis", "الأساس"), render: (row) => provenanceLabel(row.provenance, lang) },
  ];
  return <>
    <FilterBar lang={lang} filters={[{ key: "metric", label: t("Figure", "الرقم"), value: metric, allValue: "__none", onChange: (value) => setMetric(value as FinancialMetricId), options: allMetricIds.map((id) => ({ value: id, label: metricLabels[id][lang] })) }]} resultCount={first.data ? rows.length : undefined}>
      <span className="form-hint">{t("Uses the period and branch from Overview.", "يستخدم الفترة والفرع من النظرة العامة.")} <bdi dir="ltr">{filter.from} – {filter.to}</bdi></span>
    </FilterBar>
    <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} lang={lang} caption={t("Source records", "سجلات المصدر")}
      loading={first.loading} error={first.error ? errorText(new Error(first.error), lang) : null} onRetry={first.reload}
      empty={<EmptyState title={t("No source records for this figure", "لا توجد سجلات مصدر لهذا الرقم")} text={t("Try another period or figure.", "جرّب فترة أو رقماً آخر.")} />} />
    {moreError && <p className="form-error" role="alert">{moreError}</p>}
    {cursor && <div className="form-actions"><button type="button" className="btn" onClick={() => void loadMore()}>{t("Load more", "تحميل المزيد")}</button></div>}
  </>;
}
