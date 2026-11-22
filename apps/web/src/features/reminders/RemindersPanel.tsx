import { useMemo, useState } from "react";
import { Play, Send, SkipForward } from "lucide-react";
import { formatPlateDisplay, type Locale } from "@garage/domain";
import { BulkRunDialog, DataTable, DateText, EmptyState, FilterBar, Notice, PageHeader, RecordRef, Select, runBulk, useViewer, type Column } from "../../shared/components";
import { customerDisplay } from "../../shared/ui";
import { useLoad } from "../finance/use-load";
import { cairoClock, actionable,defaultSortValue, errorCopy, filterReminders, kindLabel, kindOrder, reasonLabel, runSummaryText, statusLabel, statusOrder, statusTone, type StatusFilter } from "./reminder-model";
import { ReminderApiError, remindersApi, type ReminderItem } from "./reminders-api";
import { RulesPanel } from "./RulesPanel";
import "./reminders.css";

interface Props { lang: Locale; tabs?: React.ReactNode }

/** Follow-ups tab in Bookings: due / upcoming / sent items from the simulated outbox, with send now, skip and snooze; owner rules below. */
export function RemindersPanel({ lang, tabs }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const list = useLoad(() => remindersApi.list(), []);
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  const [bulkRun, setBulkRun] = useState<{ kind: "snooze" | "skip"; rows: ReminderItem[] } | null>(null);
  const viewer = useViewer();

  const data = list.data;
  const rows = useMemo(() => filterReminders(data?.reminders ?? [], { kind, status, query }), [data, kind, status, query]);
  const filtered = kind !== "all" || status !== "open" || Boolean(query.trim());
  const clear = () => { setKind("all"); setStatus("open"); setQuery(""); };

  const act = async (key: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(key); setMessage(null);
    try { await work(); if (done) setMessage({ tone: "info", text: done }); list.reload(); }
    catch (failure) { setMessage({ tone: "warning", text: errorCopy(failure instanceof ReminderApiError ? failure.code : "", lang) }); list.reload(); }
    finally { setBusy(null); }
  };

  const columns: Column<ReminderItem>[] = [
    { key: "due", header: t("Due", "الموعد"), csv: (row) => row.dueAt.slice(0, 10), sortable: true, sortValue: defaultSortValue, render: (row) => <DateText value={row.dueAt} lang={lang} time={cairoClock(row.dueAt)} /> },
    { key: "type", header: t("Type", "النوع"), primary: true, csv: (row) => kindLabel(row.kind, lang), sortable: true, sortValue: (row) => kindOrder.indexOf(row.kind), render: (row) => kindLabel(row.kind, lang) },
    { key: "customer", header: t("Customer", "العميل"), csv: (row) => row.customerName, render: (row) => <RecordRef type="customer" id={row.customerId} label={customerDisplay(row.customerName, lang)} /> },
    { key: "source", header: t("About", "بخصوص"), render: (row) => <span className="reminder-links">
      {row.plate && row.vehicleId && <RecordRef type="vehicle" id={row.vehicleId} label={formatPlateDisplay(row.plate)} />}
      {row.bookingId && <RecordRef type="booking" id={row.bookingId} />}
      {row.warrantyId && <RecordRef type="warranty" id={row.warrantyId} />}
      {row.quoteId && <RecordRef type="quote" id={row.quoteId} />}
    </span> },
    { key: "message", header: t("Message", "الرسالة"), hideOnCard: true, render: (row) => <span className="reminder-body" dir={row.language === "ar" ? "rtl" : "ltr"} title={row.body}>{row.body}</span> },
    { key: "status", header: t("Status", "الحالة"), csv: (row) => statusLabel(row.status, lang), sortable: true, sortValue: (row) => statusOrder.indexOf(row.status), render: (row) => <span className="reminder-state">
      <span className="status" data-tone={statusTone[row.status]}>{statusLabel(row.status, lang)}</span>
      {row.reason && <small>{reasonLabel(row.reason, lang)}</small>}
      {row.status === "snoozed" && row.snoozedUntil && <small>{t("until", "حتى")} <DateText value={row.snoozedUntil} lang={lang} /></small>}
    </span> },
    { key: "actions", header: t("Actions", "إجراءات"), hideOnCard: false, render: (row) => <span className="reminder-actions">
      {data?.canAct && actionable(row) && <>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy === row.id} onClick={() => void act(row.id, () => remindersApi.send(row.id), t("Marked as sent (simulated). Nothing was delivered.", "سُجلت كمُرسلة (محاكاة). لم يُسلَّم شيء."))}>
          <Send size={14} aria-hidden="true" />{t("Send now", "إرسال الآن")}</button>
        <button type="button" className="btn btn-sm" disabled={busy === row.id} onClick={() => void act(row.id, () => remindersApi.skip(row.id))}>
          <SkipForward size={14} aria-hidden="true" />{t("Skip", "تخطي")}</button>
        <Select label={t("Snooze", "تأجيل")} value="" disabled={busy === row.id}
          onChange={(event) => { const days = Number(event.target.value); if (days) void act(row.id, () => remindersApi.snooze(row.id, days)); }}
          options={[{ value: "", label: t("Snooze…", "تأجيل…") }, ...[1, 2, 3, 7].map((days) => ({ value: String(days), label: t(`${days} day${days > 1 ? "s" : ""}`, days === 1 ? "يوم" : days === 2 ? "يومان" : `${days} أيام`) }))]} />
      </>}
      {row.conversationId && <RecordRef type="conversation" id={row.conversationId} label={t("Open conversation", "فتح المحادثة")} mode="link" />}
    </span> },
  ];

  const error = list.error ? errorCopy(list.error.replace(/^.*: /, ""), lang) : null;
  const counts = data?.counts;
  return <>
    <PageHeader title={t("Follow-ups", "المتابعات")}
      subtitle={t("Reminders and check-ins for customers. Messages are simulated: nothing is delivered.", "تذكيرات ومتابعات للعملاء. الرسائل محاكاة: لا يُسلَّم شيء فعلياً.")}
      meta={counts ? <span className="reminder-counts">
        <span>{t("Due", "مستحقة")} <b>{counts.due}</b></span><span>{t("Upcoming", "قادمة")} <b>{counts.upcoming}</b></span><span>{t("Sent", "مُرسلة")} <b>{counts["sent-simulated"]}</b></span>
      </span> : undefined}
      actions={data?.canRun ? <button type="button" className="btn btn-primary" disabled={busy === "run"}
        onClick={() => void act("run", async () => { const summary = await remindersApi.run(); setMessage({ tone: "info", text: runSummaryText(summary, lang) }); })}>
        <Play size={14} aria-hidden="true" />{busy === "run" ? t("Checking…", "جارٍ الفحص…") : t("Check now", "افحص الآن")}</button> : undefined}
      tabs={tabs} />
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <FilterBar lang={lang}
      search={{ value: query, onChange: setQuery, placeholder: t("Search customer, plate or message", "ابحث بالعميل أو اللوحة أو الرسالة") }}
      filters={[
        { key: "kind", label: t("Type", "النوع"), value: kind, onChange: setKind, options: [{ value: "all", label: t("All types", "كل الأنواع") }, ...kindOrder.map((value) => ({ value, label: kindLabel(value, lang) }))] },
        { key: "status", label: t("Status", "الحالة"), value: status, onChange: (value) => setStatus(value as StatusFilter), allValue: "open",
          options: [{ value: "open", label: t("To do (due, upcoming, snoozed)", "المطلوب (مستحق، قادم، مؤجل)") }, { value: "all", label: t("All statuses", "كل الحالات") }, ...statusOrder.map((value) => ({ value, label: statusLabel(value, lang) }))] },
      ]}
      onClear={clear} resultCount={data ? rows.length : undefined} viewsId="followups" />
    <BulkRunDialog open={bulkRun !== null} lang={lang}
      title={bulkRun?.kind === "skip" ? t(`Skip ${bulkRun.rows.length} follow-ups?`, `تخطي ${bulkRun.rows.length} متابعة؟`) : t(`Snooze ${bulkRun?.rows.length ?? 0} follow-ups for 1 day?`, `تأجيل ${bulkRun?.rows.length ?? 0} متابعة ليوم؟`)}
      body={t("Messages are simulated: nothing is delivered.", "الرسائل محاكاة: لا يُسلَّم شيء فعلياً.")}
      confirmLabel={bulkRun?.kind === "skip" ? t("Skip all", "تخطي الكل") : t("Snooze all", "تأجيل الكل")}
      run={() => runBulk(bulkRun?.rows ?? [], (row) => row.id, async (row) => {
        try { if (bulkRun?.kind === "skip") await remindersApi.skip(row.id); else await remindersApi.snooze(row.id, 1); return { ok: true }; }
        catch (failure) { return { ok: false, error: failure instanceof ReminderApiError ? failure.code : "REQUEST_FAILED" }; }
      })}
      label={(key) => { const row = data?.reminders.find((item) => item.id === key); return row ? `${customerDisplay(row.customerName, lang)} · ${kindLabel(row.kind, lang)}` : "-"; }}
      errorText={(code) => errorCopy(code ?? "", lang)}
      onFinished={() => { setBulkRun(null); list.reload(); }} onCancel={() => setBulkRun(null)} />
    <DataTable listId="followups" exportName="follow-ups" bulk={data?.canAct && !viewer?.isDemo ? {
        isSelectable: actionable,
        actions: ({ rows: picked }) => <>
          <button type="button" className="btn btn-sm" onClick={() => setBulkRun({ kind: "snooze", rows: picked })}>{t("Snooze 1 day", "تأجيل يوم")}</button>
          <button type="button" className="btn btn-sm" onClick={() => setBulkRun({ kind: "skip", rows: picked })}>{t("Skip", "تخطي")}</button>
        </>,
      } : undefined}
      columns={columns} rows={rows} rowKey={(row) => row.id} lang={lang} caption={t("Follow-ups", "المتابعات")}
      loading={list.loading} error={error ? t("Follow-ups could not be loaded.", "تعذر تحميل المتابعات.") : null} onRetry={list.reload}
      initialSort={{ key: "due", direction: "asc" }}
      empty={filtered
        ? <EmptyState variant="no-results" title={t("No follow-ups match", "لا توجد متابعات مطابقة")} action={<button type="button" className="btn" onClick={clear}>{t("Clear filters", "مسح التصفية")}</button>} />
        : <EmptyState title={t("Nothing to follow up", "لا توجد متابعات")} text={t("Reminders appear here before bookings, when a car is ready, before a warranty ends and after quotes go unanswered.", "تظهر التذكيرات هنا قبل الحجوزات وعند جاهزية السيارة وقبل انتهاء الضمان وبعد عروض الأسعار بلا رد.")} />} />
    {data?.canManageRules && <RulesPanel lang={lang} />}
  </>;
}
