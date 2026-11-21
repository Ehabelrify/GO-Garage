import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Eye } from "lucide-react";
import type { Locale, TransportStatus } from "@garage/domain";
import { transportApi, type TransportDetailData } from "../../shared/store";
import { Collapsible, ConfirmDialog, EmptyState, Field, Money, RecordRef, Skeleton, StatusBadge } from "../../shared/components";
import { dateLabel, timeLabel } from "../../shared/ui";
import { checkCommitment, directionLabels, isDestructive, modeLabels, needsCommitment, nextByStatus, reasonRequired, transitionVerbs, transportErrorCopy } from "./transport-logic";
import "../bookings/bookings.css";

export interface TransportDetailProps {
  id: string;
  lang: Locale;
  onChanged: () => void;
  /** Hide actions the actor cannot use (server remains the authority). */
  canCoordinate?: boolean;
  canReadContact?: boolean;
  customerLabel?: string;
  vehicleLabel?: string;
}

const fmtDateTime = (iso: string, lang: Locale) => {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return iso;
  const day = iso.slice(0, 10);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${dateLabel(day, lang)} ${timeLabel(time, lang)}`;
};

/** Transport request detail: embeddable (booking tab) or inside a drawer. */
export function TransportDetail({ id, lang, onChanged, canCoordinate = true, canReadContact = true, customerLabel, vehicleLabel }: TransportDetailProps) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [detail, setDetail] = useState<TransportDetailData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [contact, setContact] = useState<{ contact: string; location: string; instructions: string } | null>(null);
  const [next, setNext] = useState<TransportStatus | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dialogError, setDialogError] = useState("");

  const describe = useCallback((error: unknown, fallback: string) => {
    const copy = transportErrorCopy((error as { code?: string } | null)?.code);
    return copy ? (lang === "ar" ? copy.ar : copy.en) : fallback;
  }, [lang]);

  const load = useCallback(async (notify = false) => {
    setLoadError("");
    try {
      setDetail(await transportApi.detail(id));
      if (notify) onChanged();
    } catch (error) {
      setLoadError(describe(error, t("Could not load this request.", "تعذر تحميل هذا الطلب.")));
    }
  }, [id, onChanged, describe, lang]);
  useEffect(() => { setDetail(null); setContact(null); void load(); }, [id]);

  const item = detail?.request;
  const closeDialog = () => { setNext(null); setReason(""); setStartsAt(""); setEndsAt(""); setEvidenceRef(""); setDialogError(""); };

  const commitment = next && needsCommitment(next) ? checkCommitment(startsAt, endsAt, evidenceRef) : null;
  const commitmentMessage = commitment && !commitment.ok
    ? commitment.error === "order" ? t("The end must be after the start.", "يجب أن تكون النهاية بعد البداية.")
      : commitment.error === "evidence" ? t("Enter the custody evidence reference (starts with private:).", "أدخل مرجع دليل العهدة (يبدأ بـ private:).")
      : t("Choose the committed start and end.", "اختر بداية ونهاية الالتزام.")
    : "";
  const reasonMissing = next !== null && reasonRequired(next) && !reason.trim();
  const blocked = next === null || reasonMissing || (commitment !== null && !commitment.ok);
  const disabledReason = reasonMissing ? t("Enter a reason.", "أدخل السبب.") : commitmentMessage;

  async function transition() {
    if (!item || !next || blocked) return;
    setBusy(true); setDialogError("");
    try {
      await transportApi.transition({
        id, expectedRevision: item.revision, nextStatus: next,
        committedWindow: commitment && commitment.ok ? { startsAt: commitment.startsAt, endsAt: commitment.endsAt } : undefined,
        evidenceRef: evidenceRef.trim() || undefined,
        reason: reason.trim() || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      closeDialog();
      setMessage(t("Transport updated. Workshop delivery and warranty are unchanged.", "تم تحديث النقل. لم يتغير تسليم الورشة ولا الضمان."));
      await load(true);
    } catch (error) {
      setDialogError(describe(error, t("The update was not saved. Refresh and try again.", "لم يُحفظ التحديث. حدّث الصفحة وحاول مجدداً.")));
    } finally { setBusy(false); }
  }

  async function reveal() {
    try { setContact(await transportApi.contact(id)); }
    catch (error) { setMessage(describe(error, t("Contact details are not available.", "بيانات الاتصال غير متاحة."))); }
  }

  if (loadError) return <EmptyState variant="error" title={loadError} action={<button type="button" className="btn" onClick={() => void load()}>{t("Retry", "إعادة المحاولة")}</button>} />;
  if (!item || !detail) return <Skeleton rows={5} label={t("Loading", "جارٍ التحميل")} />;

  const nextSteps = canCoordinate ? nextByStatus[item.status] : [];
  return <div className="bk-stack">
    <div className="action-row">
      <StatusBadge status={item.status} domain="transport" lang={lang} />
      <span className="tag">{directionLabels[item.direction][lang]}</span>
      <span className="tag">{modeLabels[item.mode][lang]}</span>
    </div>
    <dl className="kv-grid">
      <div><dt>{t("Booking", "الحجز")}</dt><dd><RecordRef type="booking" id={item.bookingId} label={[customerLabel, vehicleLabel].filter(Boolean).join(" · ") || undefined} /></dd></div>
      <div><dt>{t("Fee", "الرسوم")}</dt><dd>{item.fee ? <Money minor={item.fee.minor} currency={item.fee.currency} lang={lang} /> : t("Not set", "غير محددة")}</dd></div>
      <div><dt>{t("Provider", "مقدم الخدمة")}</dt><dd>{item.providerId ? t("Assigned", "معيّن") : t("Not assigned", "غير معيّن")}</dd></div>
      <div><dt>{t("Policy", "السياسة")}</dt><dd>{item.policy ? t("Approved", "معتمدة") : t("Not configured", "غير مهيأة")}</dd></div>
      <div className="full"><dt>{t("Committed window", "النافذة الملتزم بها")}</dt><dd>{item.committedWindow ? <><bdi>{fmtDateTime(item.committedWindow.startsAt, lang)}</bdi> – <bdi>{fmtDateTime(item.committedWindow.endsAt, lang)}</bdi></> : t("Estimate only, no commitment yet", "تقدير فقط، لا التزام بعد")}</dd></div>
    </dl>
    {item.missing.length > 0 && <Collapsible title={t("Missing before commitment", "نواقص قبل الالتزام")} count={item.missing.length}><ul className="bk-history">{item.missing.map((entry) => <li key={entry}>{entry}</li>)}</ul></Collapsible>}

    {canReadContact && <Collapsible title={t("Private contact", "بيانات الاتصال الخاصة")}>
      {contact
        ? <dl className="kv-grid"><div><dt>{t("Contact", "الاتصال")}</dt><dd><bdi dir="ltr">{contact.contact}</bdi></dd></div><div><dt>{t("Location", "الموقع")}</dt><dd>{contact.location}</dd></div>{contact.instructions && <div className="full"><dt>{t("Instructions", "التعليمات")}</dt><dd>{contact.instructions}</dd></div>}</dl>
        : <button type="button" className="btn btn-sm" onClick={() => void reveal()}><Eye size={14} aria-hidden="true" />{t("Show contact details", "إظهار بيانات الاتصال")}</button>}
    </Collapsible>}

    {nextSteps.length > 0 && <div className="action-row" aria-label={t("Next step", "الخطوة التالية")}>
      {nextSteps.map((step) => <button key={step} type="button" className={`btn btn-sm ${isDestructive(step) ? "btn-danger" : step === nextSteps[0] ? "btn-primary" : ""}`} onClick={() => { setNext(step); setDialogError(""); }}>{transitionVerbs[step][lang]}</button>)}
    </div>}
    {message && <p className="bk-muted" role="status">{message}</p>}

    <Collapsible title={t("History", "السجل")} count={detail.events.length}>
      <ul className="bk-history">{detail.events.map((event) => <li key={event.revision}>
        <span className="bk-arrow">{event.from_status ? <StatusBadge status={event.from_status} domain="transport" lang={lang} /> : <span className="tag">{t("New", "جديد")}</span>}<ArrowRight size={13} className="bk-arrow-icon" aria-hidden="true" /><StatusBadge status={event.to_status} domain="transport" lang={lang} /></span>
        <span className="bk-muted"><bdi>{fmtDateTime(event.occurred_at, lang)}</bdi>{event.reason ? ` · ${event.reason}` : ""}{event.has_evidence ? ` · ${t("evidence recorded", "تم تسجيل الدليل")}` : ""}</span>
      </li>)}</ul>
    </Collapsible>

    <ConfirmDialog
      open={next !== null}
      lang={lang}
      danger={next !== null && isDestructive(next)}
      title={next ? transitionVerbs[next][lang] : ""}
      body={next && isDestructive(next) ? t("History is kept. The customer is not messaged.", "يُحفظ السجل. لا تُرسل رسالة للعميل.") : undefined}
      confirmLabel={next ? transitionVerbs[next][lang] : undefined}
      onConfirm={() => void transition()}
      onCancel={closeDialog}
      confirmDisabled={blocked}
      disabledReason={disabledReason || undefined}
      busy={busy}
    >
      {next && needsCommitment(next) && <div className="bk-stack">
        <Field label={t("Committed start", "بداية الالتزام")} required><input className="field-input" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></Field>
        <Field label={t("Committed end", "نهاية الالتزام")} required><input className="field-input" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></Field>
        <Field label={t("Custody evidence reference", "مرجع دليل العهدة")} required><input className="field-input" dir="ltr" placeholder="private:transport/…" value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} /></Field>
      </div>}
      {next && next === "in-custody" && <Field label={t("Custody evidence reference", "مرجع دليل العهدة")}><input className="field-input" dir="ltr" placeholder="private:transport/…" value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} /></Field>}
      {next && <Field label={t("Reason", "السبب")} required={reasonRequired(next)}><input className="field-input" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>}
      {dialogError && <div className="form-error" role="alert">{dialogError}</div>}
    </ConfirmDialog>
  </div>;
}
