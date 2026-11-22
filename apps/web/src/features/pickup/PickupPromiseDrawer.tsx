import { useEffect, useState } from "react";
import type { Locale } from "@garage/domain";
import { DetailDrawer, Field } from "../../shared/components";
import { pickupApi, readPickupHead } from "./pickup-api";
import { PickupApiError, cancelReady, pickupErrorCopy, promiseProblem, toIso, withCurrentRevision } from "./pickup-logic";

export type PromiseTarget = { mode: "record"; bookingId: string; subtitle?: string } | { mode: "cancel"; commitmentId: string; subtitle?: string };

interface Props { lang: Locale; target: PromiseTarget | null; onClose: () => void; onDone: (message: string) => void }

/** Side drawer to record, revise or cancel the pickup promise. Owner and branch manager only (callers gate it). */
export function PickupPromiseDrawer({ lang, target, onClose, onDone }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [promised, setPromised] = useState("");
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => { setPromised(""); setEvidence(""); setReason(""); setError(""); setTouched(false); setBusy(false); }, [target]);
  if (!target) return null;
  const cancelling = target.mode === "cancel";
  const problem = cancelling ? (cancelReady(reason) ? null : "reason") : promiseProblem({ promisedLocal: promised, evidenceRef: evidence, reason });
  const problemText = { date: t("Choose a future date and time.", "اختر تاريخاً ووقتاً في المستقبل."), evidence: t("Use a private reference such as private:agreements/2026-11-abc.", "استخدم مرجعاً خاصاً مثل private:agreements/2026-11-abc."), reason: t("Enter the reason.", "اكتب السبب.") };

  async function submit() {
    setTouched(true);
    if (problem || !target) return;
    setBusy(true); setError("");
    const key = crypto.randomUUID();
    try {
      if (target.mode === "record") {
        await withCurrentRevision(() => readPickupHead({ bookingId: target.bookingId }).then((head) => head.revision), (expectedRevision) => pickupApi.record({ bookingId: target.bookingId, promisedAt: toIso(promised), evidenceRef: evidence.trim(), reason: reason.trim(), expectedRevision }, key));
      } else {
        await withCurrentRevision(() => readPickupHead({ commitmentId: target.commitmentId }).then((head) => head.revision), (expectedRevision) => pickupApi.cancel(target.commitmentId, { reason: reason.trim(), expectedRevision }, key));
      }
      onDone(cancelling ? t("Pickup promise cancelled.", "تم إلغاء وعد التسليم.") : t("Pickup promise saved.", "تم حفظ وعد التسليم."));
    } catch (failure) {
      setError(pickupErrorCopy(failure instanceof PickupApiError ? failure.code : "REQUEST_FAILED", lang));
    } finally { setBusy(false); }
  }

  return <DetailDrawer open lang={lang} onClose={onClose}
    title={cancelling ? t("Cancel pickup promise", "إلغاء وعد التسليم") : t("Record or revise promise", "تسجيل أو تعديل وعد التسليم")}
    subtitle={target.subtitle}
    footer={<>
      <button type="button" className={cancelling ? "btn btn-danger" : "btn btn-primary"} disabled={busy} onClick={() => void submit()}>
        {busy ? t("Saving…", "جارٍ الحفظ…") : cancelling ? t("Cancel promise", "إلغاء الوعد") : t("Save promise", "حفظ الوعد")}</button>
      <button type="button" className="btn" disabled={busy} onClick={onClose}>{t("Close", "إغلاق")}</button>
    </>}>
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {!cancelling && <>
        <Field label={t("Promised pickup date and time", "تاريخ ووقت التسليم الموعود")} required error={touched && problem === "date" ? problemText.date : undefined}>
          <input className="field-input" type="datetime-local" value={promised} onChange={(event) => setPromised(event.target.value)} />
        </Field>
        <Field label={t("Customer agreement evidence reference", "مرجع إثبات موافقة العميل")} required hint={t("A private reference to the saved agreement, for example private:agreements/2026-11-abc.", "مرجع خاص للاتفاق المحفوظ، مثل private:agreements/2026-11-abc.")} error={touched && problem === "evidence" ? problemText.evidence : undefined}>
          <input className="field-input" dir="ltr" value={evidence} onChange={(event) => setEvidence(event.target.value)} />
        </Field>
      </>}
      <Field label={cancelling ? t("Cancellation reason", "سبب الإلغاء") : t("Reason", "السبب")} required error={touched && problem === "reason" ? problemText.reason : undefined}>
        <textarea className="field-input" rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      {error && <div className="form-error" role="alert">{error}</div>}
    </form>
  </DetailDrawer>;
}
