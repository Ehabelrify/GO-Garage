import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import type { Locale } from "@garage/domain";
import { Amount, Delta, EmptyState, Notice, PrintButton, PrintHost, Select, Skeleton, type DocumentModel } from "../../shared/components";
import { auditErrorMessage, fetchDailySummary } from "./audit-api";
import { basisNote, countTiles, moneyTiles, summaryAsText, summaryCaveats, type DailySummary } from "./audit-logic";
import "./audit.css";

interface Props { lang: Locale; branches: Array<{ id: string; label: string }>; notify: (message: string) => void }

const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const groups = [
  { id: "bookings", en: "Bookings", ar: "الحجوزات" }, { id: "workshop", en: "Workshop", ar: "الورشة" }, { id: "sales", en: "Quotes", ar: "عروض الأسعار" },
  { id: "people", en: "Customers", ar: "العملاء" }, { id: "attention", en: "Needs attention now", ar: "يحتاج اهتماماً الآن" },
] as const;

/** Printable model: counts as quantity lines, money per currency as amount lines. */
export function summaryDocument(summary: DailySummary, lang: Locale, scopeLabel: string): DocumentModel {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const lines: DocumentModel["lines"] = [];
  for (const tile of countTiles) {
    const item = summary.counts[tile.key];
    if (item) lines.push({ description: tile[lang], detail: item.basis === "snapshot" ? basisNote.snapshot[lang] : item.basis === "approximate" ? basisNote.approximate[lang] : undefined, quantity: item.value, unitMinor: null, amountMinor: null, currency: "EGP" });
  }
  for (const tile of moneyTiles) for (const row of summary.money[tile.key] ?? []) lines.push({ description: `${tile[lang]} (${row.currency})`, quantity: row.count, unitMinor: null, amountMinor: row.amountMinor, currency: row.currency });
  return {
    lang, business: { name: "Go Stores", subtitle: t("Workshop services", "خدمات الورشة") }, title: t("Daily summary", "ملخص اليوم"), number: null,
    branch: scopeLabel, issueDate: summary.date, customer: { label: t("Prepared for", "أُعد لـ"), name: t("Owner", "المالك") }, lines, totals: [],
    notes: summaryCaveats.map((pair) => pair[lang]).join("\n"), signatures: [{ label: t("Owner", "المالك") }],
  };
}

/** Owner's end-of-day numbers with the previous day beside them. Figures say where they come from when the source is incomplete. */
export function DailySummaryTab({ lang, branches, notify }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [date, setDate] = useState(todayIso);
  const [branchId, setBranchId] = useState("all");
  const [data, setData] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchDailySummary(date, branchId, controller.signal)
      .then(setData)
      .catch((failure) => { if ((failure as { name?: string })?.name !== "AbortError") { setData(null); setError(auditErrorMessage(failure, lang)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, branchId, lang, tick]);

  const scopeLabel = branchId === "all" ? t("All branches", "كل الفروع") : branches.find((item) => item.id === branchId)?.label ?? "";
  const model = useMemo(() => (data ? summaryDocument(data, lang, scopeLabel) : null), [data, lang, scopeLabel]);

  const copy = async () => {
    if (!data) return;
    try { await navigator.clipboard.writeText(summaryAsText(data, lang, scopeLabel)); notify(t("Summary copied.", "تم نسخ الملخص.")); } catch { notify(t("Could not copy. Use Print instead.", "تعذر النسخ. استخدم الطباعة.")); }
  };

  return <section className="audit-tab" aria-label={t("Daily summary", "ملخص اليوم")}>
    <div className="audit-toolbar no-print">
      <label className="audit-date"><span>{t("Date", "التاريخ")}</span><input className="field-input" type="date" value={date} max={todayIso()} onChange={(event) => event.target.value && setDate(event.target.value)} /></label>
      <label className="audit-date"><span>{t("Branch", "الفرع")}</span>
        <Select label={t("Branch", "الفرع")} value={branchId} onChange={(event) => setBranchId(event.target.value)} options={[{ value: "all", label: t("All branches", "كل الفروع") }, ...branches.map((item) => ({ value: item.id, label: item.label }))]} /></label>
      <div className="audit-actions">
        <button type="button" className="btn btn-sm" disabled={!data} onClick={copy}><Copy size={14} aria-hidden="true" />{t("Copy as text", "نسخ كنص")}</button>
        {model && <><PrintHost model={model} /><PrintButton lang={lang} label={t("Print", "طباعة")} /></>}
      </div>
    </div>

    {loading && <Skeleton rows={6} label={t("Loading the summary", "جارٍ تحميل الملخص")} />}
    {!loading && error && <EmptyState variant="error" title={error} action={<button type="button" className="btn btn-sm" onClick={() => setTick((value) => value + 1)}>{t("Retry", "إعادة المحاولة")}</button>} />}
    {!loading && data && <>
      <p className="audit-hint">{t("Compared with the day before. Cairo time.", "مقارنة باليوم السابق. بتوقيت القاهرة.")}</p>
      {groups.map((group) => <div key={group.id} className="audit-group">
        <h3>{group[lang]}</h3>
        <div className="audit-tiles">
          {countTiles.filter((tile) => tile.group === group.id).map((tile) => {
            const item = data.counts[tile.key];
            if (!item) return null;
            return <div className="stat-card audit-tile" key={tile.key}>
              <div className="stat-head"><span>{tile[lang]}</span></div>
              <div><div className="stat-value">{new Intl.NumberFormat("en-US").format(item.value)}</div>
                <div className="stat-foot">{item.delta !== null ? <><Delta value={item.delta} unit="number" lang={lang} /> <span>{t("vs yesterday", "عن أمس")}</span></> : <span>{basisNote.snapshot[lang]}</span>}
                  {item.basis === "approximate" && <span className="audit-basis">{basisNote.approximate[lang]}</span>}</div></div>
            </div>;
          })}
        </div>
      </div>)}

      <div className="audit-group">
        <h3>{t("Money", "المال")}</h3>
        <div className="audit-tiles">
          {moneyTiles.map((tile) => {
            const rows = data.money[tile.key] ?? [];
            return <div className="stat-card audit-tile" key={tile.key}>
              <div className="stat-head"><span>{tile[lang]}</span></div>
              <div>
                {rows.length === 0 ? <div className="stat-value">0</div> : rows.map((row) => <div className="audit-money" key={row.currency}>
                  <div className="stat-value"><Amount minor={row.amountMinor} currency={row.currency} lang={lang} variant="kpi" /></div>
                  <div className="stat-foot"><span>{row.count} {t(row.count === 1 ? "entry" : "entries", "حركة")}</span> <Delta value={row.deltaMinor} unit="minor" currency={row.currency} lang={lang} /></div>
                </div>)}
              </div>
            </div>;
          })}
        </div>
      </div>
      <Notice tone="info"><ul className="audit-caveats">{summaryCaveats.map((pair) => <li key={pair.en}>{pair[lang]}</li>)}</ul></Notice>
    </>}
  </section>;
}
