import { useEffect, useState } from "react";
import type { Locale } from "@garage/domain";
import { ConfirmDialog, DetailDrawer, Notice, Phone, Plate } from "../../shared/components";
import { customerDisplay } from "../../shared/ui";
import { mergeErrorMessage, previewMerge, runMerge, type DupPair, type MergePlan } from "./merge-api";

interface Props { lang: Locale; pair: DupPair | null; onClose: () => void; onMerged: () => void; notify: (message: string) => void }

/** Choose the surviving customer, review counts per table, then confirm with a reason. */
export function MergeDrawer({ lang, pair, onClose, onMerged, notify }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [survivorId, setSurvivorId] = useState("");
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (pair) { setSurvivorId(pair.suggestedSurvivorId); setReason(""); setError(""); } }, [pair]);

  const mergedId = pair ? (survivorId === pair.a.id ? pair.b.id : pair.a.id) : "";
  useEffect(() => {
    if (!pair || !survivorId) return;
    let live = true;
    setLoading(true); setPlan(null); setError("");
    previewMerge(survivorId, mergedId)
      .then((value) => { if (live) setPlan(value); })
      .catch((e) => { if (live) setError(mergeErrorMessage(e, lang)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [pair, survivorId, mergedId, lang]);

  const submit = async () => {
    setBusy(true);
    try {
      const result = await runMerge(survivorId, mergedId, reason.trim());
      setConfirming(false);
      notify(t(`Merged. ${result.total} records moved. You can undo for 30 days.`, `تم الدمج. نُقل ${result.total} سجل. يمكن التراجع لمدة 30 يوما.`));
      onMerged();
    } catch (e) {
      setConfirming(false);
      setError(mergeErrorMessage(e, lang));
    } finally { setBusy(false); }
  };

  const shown = plan?.counts.filter((row) => row.count > 0) ?? [];
  const folded = plan?.vehicles.collided.length ?? 0;
  return <>
    <DetailDrawer open={!!pair} onClose={onClose} lang={lang} title={t("Merge customers", "دمج العملاء")}
      footer={<button type="button" className="btn btn-primary" disabled={!plan || loading} onClick={() => setConfirming(true)}>{t("Merge…", "دمج…")}</button>}>
      {pair && <div className="merge-stack">
        <fieldset className="merge-choice">
          <legend>{t("Keep this customer", "الاحتفاظ بهذا العميل")}</legend>
          {[pair.a, pair.b].map((customer) => <label key={customer.id} className="merge-option" data-selected={survivorId === customer.id || undefined}>
            <input type="radio" name="survivor" checked={survivorId === customer.id} onChange={() => setSurvivorId(customer.id)} />
            <span className="merge-option-main">
              <strong>{customerDisplay(customer.name, lang)}</strong>
              <Phone value={customer.phone} />
              <span className="plate-chips">{customer.vehicles.map((v, i) => <Plate key={i} value={v.plate} />)}</span>
              <span className="cust-muted">{t(`${customer.bookings} bookings`, `${customer.bookings} حجز`)}</span>
            </span>
          </label>)}
        </fieldset>
        {loading && <p className="cust-section-note" role="status">{t("Checking records…", "جارٍ فحص السجلات…")}</p>}
        {error && <Notice>{error}</Notice>}
        {plan && <section aria-label={t("What will move", "ما سيتم نقله")}>
          <h3 className="merge-h">{t(`Moves to ${plan.survivor.name}`, `ينتقل إلى ${plan.survivor.name}`)}</h3>
          {shown.length === 0 ? <p className="cust-muted">{t("Nothing else is linked to the other customer.", "لا توجد سجلات مرتبطة بالعميل الآخر.")}</p>
            : <ul className="cust-rows">{shown.map((row) => <li key={row.key} className="cust-row"><span>{lang === "ar" ? row.labelAr : row.labelEn}</span><strong className="mono">{row.count}</strong></li>)}</ul>}
          {folded > 0 && <p className="cust-section-note">{t(`${folded} vehicle(s) have the same plate and will be merged into the kept vehicle.`, `${folded} مركبة بنفس اللوحة سيتم دمجها في المركبة المحتفظ بها.`)}</p>}
          {plan.leftInPlace.some((row) => row.count > 0) && <p className="cust-section-note">{t("Audit history stays on the archived record and is never rewritten.", "يبقى سجل التدقيق في السجل المؤرشف ولا يُعاد كتابته.")}</p>}
          <p className="cust-section-note">{t("The other customer is kept as an archived record that points here.", "يُحفظ العميل الآخر كسجل مؤرشف يشير إلى هنا.")}</p>
        </section>}
      </div>}
    </DetailDrawer>
    <ConfirmDialog open={confirming} lang={lang} danger busy={busy}
      title={t("Merge these customers?", "دمج هذين العميلين؟")}
      body={t("Records move to the kept customer. You can undo within 30 days if nothing newer conflicts.", "تنتقل السجلات إلى العميل المحتفظ به. يمكن التراجع خلال 30 يوما إذا لم يحدث تعارض.")}
      confirmLabel={t("Merge", "دمج")} confirmDisabled={!reason.trim()} disabledReason={t("Enter a reason to continue.", "أدخل سببا للمتابعة.")}
      onCancel={() => setConfirming(false)} onConfirm={() => void submit()}>
      <label className="merge-reason">
        <span>{t("Reason", "السبب")}</span>
        <textarea className="field-textarea" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
    </ConfirmDialog>
  </>;
}
