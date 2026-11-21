import { useState } from "react";
import type { Locale, MoneyEvent } from "@garage/domain";
import { financeApi } from "../../shared/store";
import { Collapsible, ConfirmDialog, Field, Money, Notice, RecordRef } from "../../shared/components";
import { definitionLabel, errorText, kindLabels, signedMinor, sourceMethodLabel, toEvidenceRef } from "./finance-logic";
import { dateTimeLabel, makeT, Pill, type FinanceLookups } from "./finance-ui";

export interface FinanceRecordDetailProps {
  event: MoneyEvent;
  lang: Locale;
  lookups: FinanceLookups;
  /** Owner-only on the server; hides the reverse action for everyone else. */
  canWrite: boolean;
  onChanged: () => void;
}

/** Body of the money-event drawer: facts, linked records, and an append-only reversal. */
export function FinanceRecordDetail({ event, lang, lookups, canWrite, onChanged }: FinanceRecordDetailProps) {
  const t = makeT(lang);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const idempotencyKey = useState(() => crypto.randomUUID())[0];

  async function reverse() {
    setBusy(true);
    setMessage("");
    try {
      await financeApi.reverse({ eventId: event.id, reason: reason.trim(), evidenceRef: toEvidenceRef(evidence), idempotencyKey });
      setConfirming(false);
      onChanged();
    } catch (failure) {
      setMessage(errorText(failure, lang));
    } finally {
      setBusy(false);
    }
  }

  const customer = event.customerId ? lookups.customerName(event.customerId) : undefined;
  return <div className="finance-detail">
    <div className="finance-detail-head">
      <strong className="finance-detail-amount"><Money minor={signedMinor(event.kind, event.amount.minor)} currency={event.amount.currency} lang={lang} /></strong>
      <Pill tone={event.reversed ? "neutral" : "success"}>{event.reversed ? t("Reversed", "معكوس") : t("Recorded", "مسجل")}</Pill>
    </div>
    <dl className="kv-grid">
      <div><dt>{t("Type", "النوع")}</dt><dd>{kindLabels[event.kind][lang]}</dd></div>
      <div><dt>{t("Date", "التاريخ")}</dt><dd>{dateTimeLabel(event.effectiveAt, lang)}</dd></div>
      <div><dt>{t("Branch", "الفرع")}</dt><dd>{lookups.branchName(event.branchId)}</dd></div>
      <div><dt>{t("Method", "الطريقة")}</dt><dd>{sourceMethodLabel(event.sourceMethod, lang)}</dd></div>
      <div><dt>{t("Reference", "المرجع")}</dt><dd className="mono">{event.sourceReference}</dd></div>
      <div><dt>{t("Rule", "القاعدة")}</dt><dd>{definitionLabel(event.definition, lang)}</dd></div>
      <div className="full"><dt>{t("Reason", "السبب")}</dt><dd>{event.reason}</dd></div>
    </dl>
    <Collapsible title={t("Related records", "السجلات المرتبطة")} defaultOpen={Boolean(event.quoteId || event.jobId || event.reservationId || customer)}>
      <ul className="record-ref-list">
        {event.customerId && <li className="record-ref-row"><RecordRef type="customer" id={event.customerId} label={customer} /></li>}
        {event.quoteId && <li className="record-ref-row"><RecordRef type="quote" id={event.quoteId} label={lookups.quoteLabel(event.quoteId)} /></li>}
        {event.jobId && <li className="record-ref-row"><RecordRef type="job" id={event.jobId} label={lookups.plateForJob(event.jobId)} /></li>}
        {event.reservationId && <li className="record-ref-row"><RecordRef type="reservation" id={event.reservationId} label={lookups.reservationLabel(event.reservationId)} /></li>}
        {!event.customerId && !event.quoteId && !event.jobId && !event.reservationId && <li className="form-hint">{t("Not linked to a record.", "غير مرتبط بسجل.")}</li>}
      </ul>
    </Collapsible>
    {event.reversed
      ? <Notice tone="info">{t("Reversed. The original stays on record for audit.", "تم عكسه. يبقى السجل الأصلي للمراجعة.")}</Notice>
      : canWrite && <div className="form-actions"><button type="button" className="btn btn-danger" onClick={() => { setMessage(""); setConfirming(true); }}>{t("Reverse this record", "عكس هذا السجل")}</button></div>}
    <ConfirmDialog
      open={confirming}
      danger
      lang={lang}
      title={t("Reverse this record?", "عكس هذا السجل؟")}
      body={t("A reversal is added. The original is kept and cannot be edited.", "تتم إضافة عكس. يبقى الأصل محفوظاً ولا يمكن تعديله.")}
      confirmLabel={t("Reverse", "عكس")}
      cancelLabel={t("Keep it", "إبقاء")}
      busy={busy}
      confirmDisabled={!reason.trim() || !toEvidenceRef(evidence)}
      disabledReason={t("Enter a reason and evidence.", "أدخل السبب والدليل.")}
      onCancel={() => setConfirming(false)}
      onConfirm={() => void reverse()}
    >
      <Field label={t("Reason", "السبب")} required><input className="field-input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <Field label={t("Evidence file or reference", "ملف أو مرجع الدليل")} required><input className="field-input mono" value={evidence} onChange={(e) => setEvidence(e.target.value)} /></Field>
      {message && <p className="form-error" role="alert">{message}</p>}
    </ConfirmDialog>
    {message && !confirming && <p className="form-error" role="alert">{message}</p>}
  </div>;
}
