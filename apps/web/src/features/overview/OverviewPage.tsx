import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, ListChecks } from "lucide-react";
import { configuredNumber } from "@garage/domain";
import type { FinancialMetricId, FinancialReport, FinancialSourceRow, Job, QueueItem, ReportFilter, SignedMoney } from "@garage/domain";
import { financeApi, useGarageStore, workQueueApi } from "../../shared/store";
import { dateLabel, EmptyState, PageHeading, pageBranchMatches, SectionTitle, serviceDisplay, stageNames, Stat, Status, type BranchPageProps } from "../../shared/ui";

interface OverviewPageProps extends BranchPageProps {
  navigate: (path: string) => void;
}

const metricIds: FinancialMetricId[] = ["quoted-value", "draft-value", "collections", "outstanding", "direct-cost", "recognized-revenue", "gross-profit", "net-profit"];
const queueKinds = ["booking-review", "unassigned-job", "quality-check", "ready-pickup", "quote-followup", "pickup-commitment", "benefit-fulfillment", "transport", "warranty-claim"];
const metricLabels: Record<FinancialMetricId, { en: string; ar: string }> = {
  "quoted-value": { en: "Quoted value", ar: "قيمة عروض الأسعار" },
  "draft-value": { en: "Draft quote value", ar: "قيمة مسودات العروض" },
  collections: { en: "Collections", ar: "المبالغ المحصلة" },
  outstanding: { en: "Outstanding balance", ar: "الرصيد المستحق" },
  "direct-cost": { en: "Direct costs", ar: "التكاليف المباشرة" },
  "recognized-revenue": { en: "Recognized revenue", ar: "الإيراد المعترف به" },
  "gross-profit": { en: "Gross profit", ar: "مجمل الربح" },
  "net-profit": { en: "Net profit", ar: "صافي الربح" },
};
const queueLabels: Record<string, { en: string; ar: string }> = {
  "booking-review": { en: "Booking review", ar: "مراجعة الحجز" },
  "unassigned-job": { en: "Unassigned job", ar: "أمر شغل غير مسند" },
  "quality-check": { en: "Quality check", ar: "فحص الجودة" },
  "ready-pickup": { en: "Ready for pickup", ar: "جاهز للتسليم" },
  "quote-followup": { en: "Quote follow-up", ar: "متابعة عرض السعر" },
  "pickup-commitment": { en: "Pickup commitment", ar: "موعد التسليم المتفق عليه" },
  "benefit-fulfillment": { en: "Benefit to fulfill", ar: "منفعة تحتاج تنفيذ" },
  transport: { en: "Transport", ar: "النقل" },
  "warranty-claim": { en: "Warranty claim", ar: "مطالبة ضمان" },
};

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function monthStart() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; }
function yearStart() { return `${new Date().getFullYear()}-01-01`; }
function money(value: SignedMoney, lang: "ar" | "en") {
  return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-EG", { style: "currency", currency: value.currency, minimumFractionDigits: value.minorUnitExponent, maximumFractionDigits: value.minorUnitExponent }).format(value.minor / (10 ** value.minorUnitExponent));
}

export function OverviewPage({ lang, t, state, navigate, branchName }: OverviewPageProps) {
  const { actor } = useGarageStore();
  const isOwner = actor?.role === "owner";
  const jobs = state.jobs.filter((job) => pageBranchMatches(state, job.branchId));
  const bookings = state.bookings.filter((booking) => pageBranchMatches(state, booking.branchId));
  const pendingBookings = bookings.filter((booking) => booking.status === "pending");
  const readyJobs = jobs.filter((job) => job.stage === "ready");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueError, setQueueError] = useState("");
  const [kind, setKind] = useState("all");
  const [showRecord, setShowRecord] = useState(false);
  const [showAction, setShowAction] = useState(true);
  const [period, setPeriod] = useState<"month" | "ytd" | "custom">("month");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDate(new Date()));
  const [groupBy, setGroupBy] = useState<ReportFilter["groupBy"]>("month");
  const [reportBranch, setReportBranch] = useState<string>(state.currentBranch);
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [reportError, setReportError] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [drilldown, setDrilldown] = useState<{ metric: FinancialMetricId; rows: FinancialSourceRow[] } | null>(null);

  const queueBranch = state.currentBranch;
  useEffect(() => {
    let current = true;
    setQueueError("");
    void workQueueApi.list({ branchId: queueBranch, kinds: kind === "all" ? undefined : [kind] })
      .then((items) => { if (current) setQueue(items); })
      .catch((error) => { if (current) setQueueError(error instanceof Error ? error.message : String(error)); });
    return () => { current = false; };
  }, [queueBranch, kind]);

  useEffect(() => { setReportBranch(state.currentBranch); }, [state.currentBranch]);
  const filter = useMemo<ReportFilter>(() => ({ branchId: reportBranch, from, to, groupBy }), [reportBranch, from, to, groupBy]);
  const loadReport = useCallback(async () => {
    setReportLoading(true); setReportError(""); setDrilldown(null);
    try { setReport(await financeApi.report(filter)); }
    catch (error) { setReport(null); setReportError(error instanceof Error ? error.message : String(error)); }
    finally { setReportLoading(false); }
  }, [filter]);
  useEffect(() => { if (actor?.role === "owner") void loadReport(); }, [actor?.role, loadReport]);

  function choosePeriod(next: "month" | "ytd" | "custom") {
    setPeriod(next);
    if (next === "month") { setFrom(monthStart()); setTo(isoDate(new Date())); setGroupBy("day"); }
    if (next === "ytd") { setFrom(yearStart()); setTo(isoDate(new Date())); setGroupBy("month"); }
  }
  async function openDrilldown(metric: FinancialMetricId) {
    setReportError("");
    try { const result = await financeApi.drilldown(filter, metric); setDrilldown({ metric, rows: result.rows }); }
    catch (error) { setReportError(error instanceof Error ? error.message : String(error)); }
  }
  function queuePath(item: QueueItem) {
    if (["booking-review", "pickup-commitment"].includes(item.kind)) return "/workspace/bookings";
    if (["unassigned-job", "quality-check", "ready-pickup"].includes(item.kind)) return "/workspace/workshop";
    if (item.kind === "quote-followup") return "/workspace/quotes";
    if (item.kind === "benefit-fulfillment") return "/workspace/benefits";
    if (item.kind === "transport") return "/workspace/transport";
    return "/workspace/warranties";
  }

  return <>
    <PageHeading
      eyebrow={t("Go Stores · Operations", "جو ستورز · العمليات")}
      title={isOwner ? t("Business overview", "ملخص النشاط") : t("Branch operations", "تشغيل الفرع")}
      subtitle={isOwner
        ? t("Review work and exceptions across branches, then open the source page to act.", "راجع الشغل والاستثناءات في الفروع، ثم افتح صفحة السجل لاتخاذ الإجراء.")
        : t("Review this branch’s current work and follow each item to its next action.", "راجع الشغل الحالي في الفرع وتابع الإجراء التالي لكل بند.")}
    />
    <div className="grid stats-grid">
      <Stat icon={CalendarDays} label={t("Booking requests", "طلبات الحجز")} value={pendingBookings.length} foot={t("Waiting for staff review", "مستنية مراجعة الفريق")} />
      <Stat icon={CheckCircle2} label={t("Ready for delivery", "جاهزة للتسليم")} value={readyJobs.length} foot={t("Workshop handoff required", "محتاجة تسليم من الورشة")} />
      <Stat icon={ListChecks} label={t("Actions in this view", "إجراءات في العرض الحالي")} value={queue.length} foot={t("Current facts, not a financial-period total", "حقائق حالية وليست إجمالي فترة مالية")} />
    </div>

    <section className="panel section-gap">
      <SectionTitle title={t("Action queue", "قائمة الإجراءات")} description={t("Role- and branch-scoped current work. Counts change when source records move stage.", "شغل حالي حسب الصلاحية والفرع. العدد بيتغير لما مرحلة السجل تتغير.")} />
      <div className="form-grid">
        <label>{t("Queue", "القائمة")}<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">{t("All actions", "كل الإجراءات")}</option>{queueKinds.map((value) => <option key={value} value={value}>{t(queueLabels[value].en, queueLabels[value].ar)}</option>)}</select></label>
        <label><input type="checkbox" checked={showRecord} onChange={(event) => setShowRecord(event.target.checked)} /> {t("Show record ID", "إظهار رقم السجل")}</label>
        <label><input type="checkbox" checked={showAction} onChange={(event) => setShowAction(event.target.checked)} /> {t("Show next action", "إظهار الإجراء التالي")}</label>
      </div>
      {queueError && <p role="alert">{queueError}</p>}
      <div className="table-wrap"><table><thead><tr><th>{t("Type", "النوع")}</th>{showRecord && <th>{t("Record", "السجل")}</th>}<th>{t("Branch", "الفرع")}</th><th>{t("Stage", "المرحلة")}</th>{showAction && <th>{t("Next action", "الإجراء التالي")}</th>}<th>{t("Open", "فتح")}</th></tr></thead><tbody>
        {queue.map((item) => {
          const stage = stageNames[item.stage as keyof typeof stageNames];
          return <tr key={`${item.kind}:${item.recordId}`}><td>{t(queueLabels[item.kind]?.en ?? item.kind.replaceAll("-", " "), queueLabels[item.kind]?.ar ?? item.kind.replaceAll("-", " "))}</td>{showRecord && <td className="mono">{item.recordId}</td>}<td>{branchName(item.branchId)}</td><td>{stage ? (lang === "ar" ? stage.ar : stage.en) : item.stage.replaceAll("-", " ")}</td>{showAction && <td>{item.nextAction ?? item.waitingReason ?? t("No action recorded", "لا يوجد إجراء مسجل")}</td>}<td><button className="text-link" type="button" onClick={() => navigate(queuePath(item))}>{t("Open", "فتح")}</button></td></tr>;
        })}
        {!queue.length && !queueError && <tr><td colSpan={4 + Number(showRecord) + Number(showAction)}><EmptyState title={t("No current actions", "لا توجد إجراءات حالية")} text={t("Items appear only from authorized recorded workflow states.", "العناصر بتظهر فقط من حالات عمل مسجلة ومصرح بها.")} /></td></tr>}
      </tbody></table></div>
    </section>

    {actor?.role === "owner" && <section className="panel section-gap">
      <SectionTitle title={t("Reconciled financial view", "العرض المالي المتصالح")} description={t("Operational-source reporting. Unavailable or incomplete inputs are shown explicitly.", "تقارير من المصادر التشغيلية. المدخلات غير المتاحة أو غير المكتملة ظاهرة بوضوح.")} />
      <div className="form-grid">
        <label>{t("Period", "الفترة")}<select value={period} onChange={(event) => choosePeriod(event.target.value as typeof period)}><option value="month">{t("Current month", "الشهر الحالي")}</option><option value="ytd">{t("Year to date", "من بداية السنة")}</option><option value="custom">{t("Custom", "مخصص")}</option></select></label>
        <label>{t("From", "من")}<input type="date" value={from} onChange={(event) => { setPeriod("custom"); setFrom(event.target.value); }} /></label>
        <label>{t("To", "إلى")}<input type="date" value={to} onChange={(event) => { setPeriod("custom"); setTo(event.target.value); }} /></label>
        <label>{t("Branch", "الفرع")}<select value={reportBranch} onChange={(event) => setReportBranch(event.target.value)}><option value="all">{t("All branches", "كل الفروع")}</option>{state.branches.map((branch) => <option key={branch.id} value={branch.id}>{branchName(branch.id)}</option>)}</select></label>
        <label>{t("Group by", "التجميع")}<select value={groupBy} onChange={(event) => setGroupBy(event.target.value as ReportFilter["groupBy"])}><option value="day">{t("Day", "يوم")}</option><option value="week">{t("Week", "أسبوع")}</option><option value="month">{t("Month", "شهر")}</option></select></label>
        <button className="btn btn-primary" type="button" disabled={reportLoading} onClick={() => void loadReport()}>{reportLoading ? t("Loading…", "جاري التحميل…") : t("Refresh report", "تحديث التقرير")}</button>
      </div>
      {reportError && <p role="alert">{reportError}</p>}
      {report && <>
        <div className="table-wrap"><table><thead><tr><th>{t("Metric", "المؤشر")}</th><th>{t("Value / state", "القيمة / الحالة")}</th><th>{t("Previous-period comparison", "مقارنة الفترة السابقة")}</th><th>{t("Sources", "المصادر")}</th></tr></thead><tbody>
          {metricIds.map((id) => { const value = report.metrics[id]; const comparison = report.comparisons[id]; return <tr key={id}><td>{t(metricLabels[id].en, metricLabels[id].ar)}</td><td>{value.state === "unavailable" ? `${t("Unavailable", "غير متاح")}: ${value.reasons.join(", ")}` : <>{money(value.amount, lang)}{value.state === "incomplete" && <small> · {t("Incomplete", "غير مكتمل")}: {value.reasons.join(", ")}</small>}</>}</td><td>{comparison.state === "unavailable" ? t("Unavailable", "غير متاح") : comparison.percent === null ? t("Comparison unavailable (zero previous base)", "المقارنة غير متاحة (الفترة السابقة صفر)") : `${comparison.percent.toFixed(1)}%`}</td><td><button className="text-link" type="button" disabled={value.state === "unavailable"} onClick={() => void openDrilldown(id)}>{t("Drill down", "عرض المصادر")}</button></td></tr>; })}
        </tbody></table></div>
        <h3>{t("Trend table", "جدول الاتجاه")}</h3>
        <div className="table-wrap"><table><thead><tr><th>{t("Bucket", "الفترة")}</th>{metricIds.map((id) => <th key={id}>{t(metricLabels[id].en, metricLabels[id].ar)}</th>)}</tr></thead><tbody>{report.trends.map((trend) => <tr key={trend.bucket}><td>{trend.bucket}</td>{metricIds.map((id) => { const value = trend.metrics[id]; return <td key={id}>{!value ? "—" : value.state === "unavailable" ? t("Unavailable", "غير متاح") : money(value.amount, lang)}</td>; })}</tr>)}</tbody></table></div>
      </>}
      {drilldown && <div className="section-gap"><h3>{t("Source records", "سجلات المصدر")} · {drilldown.metric}</h3><div className="table-wrap"><table><thead><tr><th>{t("Source", "المصدر")}</th><th>{t("Effective date", "تاريخ السريان")}</th><th>{t("Branch", "الفرع")}</th><th>{t("Amount", "القيمة")}</th><th>{t("Provenance", "المنشأ")}</th></tr></thead><tbody>{drilldown.rows.map((row) => <tr key={row.id}><td>{row.sourceKind} · <span className="mono">{row.sourceId}</span></td><td>{dateLabel(row.effectiveAt, lang)}</td><td>{branchName(row.branchId)}</td><td>{money(row.amount, lang)}</td><td>{row.provenance}</td></tr>)}</tbody></table></div></div>}
    </section>}

    <div className="section-gap">
      <section className="panel"><SectionTitle title={t("Branch operations", "شغل الفروع")} description={t("Current workload and configured capacity", "الشغل الحالي والسعة المحددة")} />{state.branches.filter((branch) => pageBranchMatches(state, branch.id)).map((branch, index) => { const branchJobs = jobs.filter((job) => job.branchId === branch.id); const active = branchJobs.filter((job) => !["delivered", "cancelled", "no-show"].includes(job.stage)).length; const confirmed = bookings.filter((booking) => booking.branchId === branch.id && booking.status === "confirmed").length; const cleanBays = configuredNumber(state.decisions, "clean-bays", branch.id, branch.cleanBays); const generalBays = configuredNumber(state.decisions, "general-bays", branch.id, branch.generalBays); const workingHours = configuredNumber(state.decisions, "branch-working-hours", branch.id, branch.workingHours); return <div className="branch-row" key={branch.id}><div className="branch-info"><span className={`branch-dot ${index ? "alt" : ""}`} /><div><div className="branch-title">{branchName(branch.id)}</div><div className="branch-meta">{cleanBays} {t("clean bays", "بايات تنظيف")} · {generalBays} {t("general bays", "بايات عادية")} · {workingHours} {t("operating hours", "ساعة تشغيل")}</div></div></div><div className="branch-count">{active}<small>{t("active ·", "شغالة ·")} {confirmed} {t("confirmed bookings", "حجز متأكد")}</small></div></div>; })}</section>
    </div>

    <section className="panel section-gap"><SectionTitle title={t("Workshop status", "حالة الورشة")} description={t("Vehicles currently moving through service", "العربيات اللي بتعدي بمراحل الخدمة دلوقتي")} action={<button className="text-link" onClick={() => navigate("/workspace/workshop")}>{t("View all jobs", "اعرض كل أوامر الشغل")} <ArrowLeft size={13} /></button>} /><div className="table-wrap"><table><thead><tr><th>{t("Vehicle", "المركبة")}</th><th>{t("Service", "الخدمة")}</th><th>{t("Branch", "الفرع")}</th><th>{t("Stage", "المرحلة")}</th><th>{t("Updated", "آخر تحديث")}</th></tr></thead><tbody>{jobs.slice(0, 5).map((job: Job) => { const vehicle = state.customers.find((customer) => customer.id === job.customerId)?.vehicles.find((item) => item.id === job.vehicleId); const service = state.services.find((item) => item.id === job.serviceId); return <tr key={job.id}><td><div className="primary-cell mono">{vehicle?.plate ?? "—"}</div><div className="secondary-cell">{vehicle?.makeModel}</div></td><td>{service ? serviceDisplay(service.name, lang) : "—"}</td><td>{branchName(job.branchId)}</td><td><Status status={job.stage} lang={lang} /></td><td>{dateLabel(job.updatedAt, lang)}</td></tr>; })}{!jobs.length && <tr><td colSpan={5}><EmptyState title={t("No jobs in this branch", "مفيش أوامر شغل في الفرع ده")} text={t("Newly confirmed bookings will appear in the workshop.", "الحجوزات اللي هتتأكد هتظهر في الورشة.")} /></td></tr>}</tbody></table></div></section>
  </>;
}
