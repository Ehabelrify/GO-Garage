import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@garage/domain";
import { DataTable, DateText, EmptyState, Notice, Phone, Plate, RecordRef, type Column } from "../../shared/components";
import { useGarageStore } from "../../shared/store";
import { ConfirmDialog } from "../../shared/components";
import { fetchDuplicates, fetchMerges, mergeErrorMessage, undoMerge, type DupCustomer, type DupPair, type MergeEntry } from "./merge-api";
import { MergeDrawer } from "./MergeDrawer";
import "./merge.css";

const bandText = { high: ["High", "عالية"], medium: ["Medium", "متوسطة"], low: ["Low", "منخفضة"] } as const;
const reasonText = { phone: ["Same phone", "نفس الهاتف"], plate: ["Same plate", "نفس اللوحة"], name: ["Similar name", "اسم متشابه"] } as const;

/** Duplicates tab (Owner): ranked candidate pairs with the reason, a merge drawer, and the recent merges with undo. */
export function DuplicatesPanel({ lang, notify }: { lang: Locale; notify: (message: string) => void }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const store = useGarageStore();
  const canWrite = !store.actor?.isDemo;
  const [pairs, setPairs] = useState<DupPair[]>([]);
  const [merges, setMerges] = useState<MergeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<DupPair | null>(null);
  const [undoing, setUndoing] = useState<MergeEntry | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [undoError, setUndoError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [p, m] = await Promise.all([fetchDuplicates(), fetchMerges()]);
      setPairs(p); setMerges(m);
    } catch (e) { setError(mergeErrorMessage(e, lang)); } finally { setLoading(false); }
  }, [lang]);
  useEffect(() => { void load(); }, [load]);

  const person = (customer: DupCustomer) => <span className="merge-person"><RecordRef type="customer" id={customer.id} label={customer.name} /><Phone value={customer.phone} />
    <span className="plate-chips">{customer.vehicles.slice(0, 3).map((v, i) => <Plate key={i} value={v.plate} />)}</span></span>;

  const columns: Column<DupPair>[] = [
    { key: "a", header: t("Customer", "العميل"), primary: true, render: (row) => person(row.a) },
    { key: "b", header: t("Possible duplicate", "تكرار محتمل"), render: (row) => person(row.b) },
    { key: "why", header: t("Why", "السبب"), render: (row) => <span className="merge-reasons">{row.reasons.map((r, i) => <span key={i} className="merge-reason-chip">{reasonText[r.kind][lang === "ar" ? 1 : 0]}</span>)}</span> },
    { key: "score", header: t("Confidence", "الثقة"), numeric: true, sortable: true, sortValue: (row) => row.score, render: (row) => <span className="merge-band" data-band={row.band}>{bandText[row.band][lang === "ar" ? 1 : 0]} · {Math.round(row.score * 100)}%</span> },
    ...(canWrite ? [{ key: "act", header: "", render: (row: DupPair) => <button type="button" className="btn cust-nowrap" onClick={() => setSelected(row)}>{t("Review", "مراجعة")}</button> } satisfies Column<DupPair>] : []),
  ];

  const confirmUndo = async () => {
    if (!undoing) return;
    setBusy(true); setUndoError("");
    try {
      await undoMerge(undoing.id, reason.trim());
      setUndoing(null); setReason("");
      notify(t("Merge undone.", "تم التراجع عن الدمج."));
      await load();
    } catch (e) { setUndoError(mergeErrorMessage(e, lang)); } finally { setBusy(false); }
  };

  return <div className="merge-stack">
    <Notice tone="info">{t("Likely duplicates by phone, plate and name. Merging keeps one customer and archives the other; you can undo for 30 days.", "تكرارات محتملة حسب الهاتف واللوحة والاسم. الدمج يُبقي عميلا واحدا ويؤرشف الآخر، ويمكن التراجع لمدة 30 يوما.")}</Notice>
    <DataTable columns={columns} rows={pairs} rowKey={(row) => row.key} lang={lang} caption={t("Possible duplicates", "التكرارات المحتملة")}
      loading={loading} error={error || null} onRetry={() => void load()} initialSort={{ key: "score", direction: "desc" }}
      empty={<EmptyState title={t("No duplicates found", "لا توجد تكرارات")} text={t("No customers share a phone, a plate or a near-identical name.", "لا يوجد عملاء يشتركون في هاتف أو لوحة أو اسم متطابق تقريبا.")} />} />
    {merges.length > 0 && <section aria-label={t("Recent merges", "عمليات الدمج الأخيرة")}>
      <h3 className="merge-h">{t("Recent merges", "عمليات الدمج الأخيرة")}</h3>
      <ul className="cust-rows">{merges.map((m) => <li key={m.id} className="cust-row">
        <span className="cust-row-main">
          <span>{m.mergedName} → <RecordRef type="customer" id={m.survivorId} label={m.survivorName} /></span>
          <span className="cust-row-sub"><DateText value={m.mergedAt.slice(0, 10)} lang={lang} /> · {m.reason}{m.undoneAt ? ` · ${t("undone", "تم التراجع")}` : ""}</span>
        </span>
        {canWrite && m.canUndo && <button type="button" className="btn cust-nowrap" onClick={() => { setUndoing(m); setReason(""); setUndoError(""); }}>{t("Undo", "تراجع")}</button>}
      </li>)}</ul>
    </section>}
    <MergeDrawer lang={lang} pair={selected} notify={notify} onClose={() => setSelected(null)} onMerged={() => { setSelected(null); void load(); void store.refresh(); }} />
    <ConfirmDialog open={!!undoing} lang={lang} danger busy={busy} title={t("Undo this merge?", "التراجع عن هذا الدمج؟")}
      body={undoing ? t(`Moves records back to ${undoing.mergedName} if nothing newer conflicts.`, `يعيد السجلات إلى ${undoing.mergedName} إذا لم يحدث تعارض.`) : undefined}
      confirmLabel={t("Undo merge", "تراجع عن الدمج")} confirmDisabled={!reason.trim()} disabledReason={t("Enter a reason to continue.", "أدخل سببا للمتابعة.")}
      onCancel={() => setUndoing(null)} onConfirm={() => void confirmUndo()}>
      <label className="merge-reason"><span>{t("Reason", "السبب")}</span>
        <textarea className="field-textarea" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      {undoError && <p className="form-hint" role="alert">{undoError}</p>}
    </ConfirmDialog>
  </div>;
}
