import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import type { Locale } from "@garage/domain";
import { Amount, DataTable, DateText, DetailDrawer, EmptyState, FilterBar, Notice, RecordRef, type Column } from "../../shared/components";
import { auditErrorMessage, exportUrl, fetchAudit, fetchAuditActors } from "./audit-api";
import {
  actionName, activeFilters, actorName, auditQuery, branchName, changeSummary, emptyFilter, entityTypeName, kindName, kindOptions, moneyNote, recordTarget, recordText, roleName,
  type AuditEvent, type AuditFilter,
} from "./audit-logic";
import "./audit.css";

const PAGE = 50;
const EXPORT_CAP = 10000;

interface Props { lang: Locale; branches: Array<{ id: string; label: string }> }

/** Owner-only, read-only timeline of everything the app recorded: who did what to which record, and when. */
export function ActivityLogTab({ lang, branches }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [filter, setFilter] = useState<AuditFilter>(emptyFilter);
  const [search, setSearch] = useState("");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [actors, setActors] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const requestId = useRef(0);

  useEffect(() => { const id = window.setTimeout(() => setFilter((current) => (current.q === search ? current : { ...current, q: search })), 300); return () => window.clearTimeout(id); }, [search]);
  useEffect(() => { fetchAuditActors().then(setActors).catch(() => setActors([])); }, []);

  const baseQuery = useMemo(() => auditQuery(filter, lang), [filter, lang]);
  useEffect(() => {
    const id = ++requestId.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchAudit(auditQuery(filter, lang, { limit: String(PAGE) }), controller.signal)
      .then((page) => { if (id === requestId.current) { setEvents(page.events); setCursor(page.nextCursor); } })
      .catch((failure) => { if (id === requestId.current && (failure as { name?: string })?.name !== "AbortError") { setEvents([]); setCursor(null); setError(auditErrorMessage(failure, lang)); } })
      .finally(() => { if (id === requestId.current) setLoading(false); });
    return () => controller.abort();
  }, [filter, lang, tick]);

  const loadMore = useCallback(async () => {
    if (!cursor || more) return;
    setMore(true);
    try {
      const page = await fetchAudit(auditQuery(filter, lang, { limit: String(PAGE), cursor }));
      setEvents((current) => [...current, ...page.events.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setCursor(page.nextCursor);
    } catch (failure) { setError(auditErrorMessage(failure, lang)); } finally { setMore(false); }
  }, [cursor, more, filter, lang]);

  const set = (patch: Partial<AuditFilter>) => setFilter((current) => ({ ...current, ...patch }));
  const clear = () => { setSearch(""); setFilter(emptyFilter); };
  const active = activeFilters(filter);

  const columns: Column<AuditEvent>[] = [
    { key: "when", header: t("When", "متى"), mono: true, hideOnCard: false, render: (row) => <DateText value={row.occurredAt} lang={lang} /> },
    { key: "who", header: t("Who", "من"), primary: true, render: (row) => <span className="audit-who"><strong>{actorName(row, lang)}</strong>{row.actor.role && <small>{roleName(row.actor.role, lang)}</small>}</span> },
    { key: "what", header: t("What", "ماذا"), render: (row) => <span className="audit-what"><strong>{actionName(row.action, lang)}</strong><small>{kindName(row.kind, lang)}</small></span> },
    { key: "record", header: t("Record", "السجل"), render: (row) => <RecordCell event={row} lang={lang} /> },
    { key: "change", header: t("Change", "التغيير"), render: (row) => <ChangeCell event={row} lang={lang} /> },
    { key: "branch", header: t("Branch", "الفرع"), render: (row) => branchName(row, lang) || "—" },
  ];

  const filtersDef = [
    { key: "kind", label: t("Type", "النوع"), value: filter.kind, allValue: "", onChange: (value: string) => set({ kind: value }),
      options: [{ value: "", label: t("All types", "كل الأنواع") }, ...kindOptions.map((item) => ({ value: item.value, label: item[lang] }))] },
    { key: "actor", label: t("Person", "الشخص"), value: filter.actor, allValue: "", onChange: (value: string) => set({ actor: value }),
      options: [{ value: "", label: t("Everyone", "الكل") }, ...actors.map((item) => ({ value: item.id, label: item.name }))] },
    { key: "branch", label: t("Branch", "الفرع"), value: filter.branchId, allValue: "", onChange: (value: string) => set({ branchId: value }),
      options: [{ value: "", label: t("All branches", "كل الفروع") }, ...branches.map((item) => ({ value: item.id, label: item.label }))] },
  ];

  return <section className="audit-tab" aria-label={t("Activity log", "سجل النشاط")}>
    <FilterBar lang={lang} search={{ value: search, onChange: setSearch, placeholder: t("Search the log", "ابحث في السجل") }} filters={filtersDef}
      onClear={active ? clear : undefined} resultCount={loading ? undefined : events.length}>
      <label className="audit-date"><span>{t("From", "من")}</span><input className="field-input" type="date" value={filter.from} max={filter.to || undefined} onChange={(event) => set({ from: event.target.value })} /></label>
      <label className="audit-date"><span>{t("To", "إلى")}</span><input className="field-input" type="date" value={filter.to} min={filter.from || undefined} onChange={(event) => set({ to: event.target.value })} /></label>
      <a className="btn btn-sm audit-export" href={exportUrl(baseQuery)} download>
        <Download size={14} aria-hidden="true" />{t("Export CSV", "تصدير CSV")}
      </a>
    </FilterBar>
    <p className="audit-hint">{t(`Newest first. Read-only. The CSV holds up to ${EXPORT_CAP.toLocaleString("en-US")} rows; narrow the dates or type for more.`, `الأحدث أولاً. للقراءة فقط. ملف CSV يتسع حتى ${EXPORT_CAP.toLocaleString("en-US")} سجل؛ ضيّق التاريخ أو النوع للمزيد.`)}</p>
    {error && !loading && events.length === 0 ? null : error && <Notice>{error}</Notice>}
    <DataTable<AuditEvent> columns={columns} rows={events} rowKey={(row) => row.id} lang={lang} caption={t("Activity log", "سجل النشاط")}
      loading={loading} error={events.length === 0 ? error : null} onRetry={() => setTick((value) => value + 1)} paging={false}
      onRowClick={setOpen} selectedKey={open?.id ?? null}
      empty={<EmptyState variant={active ? "no-results" : "no-data"} title={active ? t("Nothing matches these filters", "لا توجد نتائج بهذه المرشحات") : t("No activity recorded yet", "لا يوجد نشاط مسجل بعد")}
        text={active ? undefined : t("Changes made in the app appear here.", "التغييرات التي تتم في التطبيق تظهر هنا.")}
        action={active ? <button type="button" className="btn btn-sm" onClick={clear}>{t("Clear filters", "مسح التصفية")}</button> : undefined} />} />
    {cursor && !loading && <div className="audit-more"><button type="button" className="btn" disabled={more} onClick={loadMore}>{more ? t("Loading...", "جارٍ التحميل...") : t("Load more", "تحميل المزيد")}</button></div>}

    <DetailDrawer open={open !== null} onClose={() => setOpen(null)} lang={lang} title={open ? actionName(open.action, lang) : ""}
      subtitle={open ? `${kindName(open.kind, lang)} - ${recordText(open, lang)}` : undefined}>
      {open && <EventDetail event={open} lang={lang} />}
    </DetailDrawer>
  </section>;
}

function RecordCell({ event, lang }: { event: AuditEvent; lang: Locale }) {
  const target = recordTarget(event);
  if (target) return <RecordRef type={target.type} id={target.id} label={target.label} />;
  const label = event.entity.label;
  return <span className="audit-record"><span>{label ?? entityTypeName(event.entity.type, lang)}</span>{label && <small>{entityTypeName(event.entity.type, lang)}</small>}</span>;
}

function ChangeCell({ event, lang }: { event: AuditEvent; lang: Locale }) {
  const money = moneyNote(event);
  if (money) return <Amount minor={money.minor} currency={money.currency} lang={lang} />;
  const text = changeSummary(event);
  return <span className="audit-change" title={text || undefined}>{text || "—"}</span>;
}

function EventDetail({ event, lang }: { event: AuditEvent; lang: Locale }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const money = moneyNote(event);
  const target = recordTarget(event);
  const extraRows = Object.entries(event.extra ?? {}).filter(([key, value]) => !["amountMinor", "currency", "moneyKind"].includes(key) && value !== null && typeof value !== "object");
  return <div className="audit-detail">
    <dl className="audit-facts">
      <div><dt>{t("When", "متى")}</dt><dd><DateText value={event.occurredAt} lang={lang} /></dd></div>
      <div><dt>{t("Who", "من")}</dt><dd>{actorName(event, lang)}{event.actor.role ? ` (${roleName(event.actor.role, lang)})` : ""}</dd></div>
      <div><dt>{t("What", "ماذا")}</dt><dd>{actionName(event.action, lang)}</dd></div>
      <div><dt>{t("Type", "النوع")}</dt><dd>{kindName(event.kind, lang)}</dd></div>
      <div><dt>{t("Record", "السجل")}</dt><dd>{target ? <RecordRef type={target.type} id={target.id} label={target.label} /> : `${entityTypeName(event.entity.type, lang)}${event.entity.label ? `: ${event.entity.label}` : ""}`}</dd></div>
      {branchName(event, lang) && <div><dt>{t("Branch", "الفرع")}</dt><dd>{branchName(event, lang)}</dd></div>}
      {money && <div><dt>{t("Amount", "المبلغ")}</dt><dd><Amount minor={money.minor} currency={money.currency} lang={lang} variant="detail" /></dd></div>}
    </dl>
    {(event.before || event.after) && <div className="audit-ba">
      <div><h3>{t("Before", "قبل")}</h3><p>{event.before || "—"}</p></div>
      <div><h3>{t("After", "بعد")}</h3><p>{event.after || "—"}</p></div>
    </div>}
    {event.detail && <div><h3>{t("Details", "التفاصيل")}</h3><p className="audit-text">{event.detail}</p></div>}
    {extraRows.length > 0 && <dl className="audit-facts">{extraRows.map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</dt><dd>{String(value)}</dd></div>)}</dl>}
    <p className="audit-hint">{t("This record is append-only and cannot be edited.", "هذا السجل للإضافة فقط ولا يمكن تعديله.")}</p>
  </div>;
}
