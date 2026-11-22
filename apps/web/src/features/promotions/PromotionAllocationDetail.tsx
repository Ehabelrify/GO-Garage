import { useState } from "react";
import type { Locale } from "@garage/domain";
import { promotionApi } from "../../shared/store";
import { Amount, ConfirmDialog, DateText, EmptyState, Field, Skeleton, StatusBadge } from "../../shared/components";
import { commercialError } from "../quotes/commercial-errors";
import { useLoader } from "../quotes/commercial-data";
import { tr } from "../quotes/lookups";
import { isProtectedRef } from "../quotes/quote-logic";

const actionLabels: Record<string, { en: string; ar: string }> = {
  reserved: { en: "Reserved", ar: "تم الحجز" },
  consumed: { en: "Used", ar: "تم الاستخدام" },
  reversed: { en: "Reversed", ar: "تم العكس" },
  allocated: { en: "Allocated", ar: "تم التخصيص" },
};

/** Promotion allocation: status, discount, pool usage, history, and an authorised reversal. */
export function PromotionAllocationDetail({ lang, id, onChanged }: { lang: Locale; id: string; onChanged?: () => void }) {
  const t = tr(lang);
  const state = useLoader(() => promotionApi.detail(id), null as Awaited<ReturnType<typeof promotionApi.detail>> | null, (error) => commercialError(error, lang));
  const [reversing, setReversing] = useState(false);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const detail = state.data;
  async function reverse() {
    setBusy(true);
    try {
      await promotionApi.reverse({ allocationId: id, reason: reason.trim(), evidenceRef: evidence.trim(), idempotencyKey: crypto.randomUUID() });
      setReversing(false); setReason(""); setEvidence("");
      setMessage(t("Promotion reversed. History is kept.", "تم عكس العرض. يبقى السجل محفوظاً."));
      state.reload();
      onChanged?.();
    } catch (error) {
      setMessage(commercialError(error, lang));
    } finally { setBusy(false); }
  }
  if (state.loading && !detail) return <Skeleton rows={3} label={t("Loading", "جارٍ التحميل")} />;
  if (state.error && !detail) return <EmptyState variant="error" title={t("Could not load the promotion", "تعذر تحميل العرض")} text={state.error} action={<button type="button" className="btn" onClick={state.reload}>{t("Retry", "إعادة المحاولة")}</button>} />;
  if (!detail) return null;
  const { allocation, pool, history } = detail;
  const used = pool.consumedUnits + pool.reservedUnits;
  return <div className="qo-inline-result">
    <div className="qo-row between">
      <strong>{t("Promotion allocation", "تخصيص العرض الترويجي")}</strong>
      <StatusBadge status={allocation.status} lang={lang} domain="reservation" label={actionLabels[allocation.status]?.[lang]} />
    </div>
    <dl className="qo-kv">
      <dt>{t("Discount", "الخصم")}</dt><dd>{allocation.discount ? <Amount minor={allocation.discount.minor} currency={allocation.discount.currency} lang={lang} variant="detail" /> : "—"}</dd>
      <dt>{t("Units used", "الوحدات المستخدمة")}</dt><dd>{used} / {pool.maximumUnits}</dd>
    </dl>
    {history.length > 0 && <ul className="qo-history">{history.map((entry, index) => <li key={index}><strong>{actionLabels[entry.action]?.[lang] ?? entry.action.replace(/[-_]+/g, " ")}</strong><span className="qo-muted"><DateText value={entry.at} lang={lang} /></span></li>)}</ul>}
    {allocation.status === "reserved" && <div><button type="button" className="btn btn-danger btn-sm" onClick={() => setReversing(true)}>{t("Reverse promotion", "عكس العرض")}</button></div>}
    {message && <p role="status" className="qo-muted">{message}</p>}
    <ConfirmDialog open={reversing} danger lang={lang} title={t("Reverse this promotion?", "عكس هذا العرض؟")} body={t("The units return to the pool. The history stays.", "تعود الوحدات إلى المخزون ويبقى السجل.")}
      confirmLabel={t("Reverse", "عكس")} onCancel={() => setReversing(false)} onConfirm={() => void reverse()} busy={busy}
      confirmDisabled={!reason.trim() || !isProtectedRef(evidence)} disabledReason={t("Add a reason and a proof reference starting with private:", "أضف السبب ومرجع إثبات يبدأ بـ private:")}>
      <Field label={t("Reason", "السبب")} required><input className="field-input" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      <Field label={t("Proof reference", "مرجع الإثبات")} required hint="private:…"><input className="field-input" value={evidence} onChange={(event) => setEvidence(event.target.value)} /></Field>
    </ConfirmDialog>
  </div>;
}
