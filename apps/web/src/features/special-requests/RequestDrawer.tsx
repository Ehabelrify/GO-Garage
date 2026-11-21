import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@garage/domain";
import { ConfirmDialog, DetailDrawer, EmptyState, Field, Money, RecordRef, Skeleton, StatusBadge } from "../../shared/components";
import { dateLabel } from "../../shared/ui";
import { addInfo, closeRequest, decide, readRequest, requestErrorMessage, startReview } from "./special-requests-api";
import {
  actionLabel, dateRange, decisionPayload, emptyReplyForm, validateReply,
  type Decision, type HistoryEvent, type ReplyField, type ReplyForm, type SpecialRequest,
} from "./special-requests-logic";
import "./special-requests.css";

interface Props {
  lang: Locale;
  id: string;
  canReview: boolean;
  canStaffAct: boolean;
  onClose: () => void;
  onChanged: () => void;
  /** Hook for quote auto-generation (W2.6): receives the accepted request. */
  onCreateQuote?: (request: SpecialRequest) => void;
}

const decisionCopy: Record<Decision, { en: string; ar: string; confirmEn: string; confirmAr: string }> = {
  accepted: { en: "Accept with offer", ar: "قبول مع عرض", confirmEn: "Send the offer to the customer?", confirmAr: "إرسال العرض إلى العميل؟" },
  declined: { en: "Decline", ar: "رفض", confirmEn: "Decline this request?", confirmAr: "رفض هذا الطلب؟" },
  "needs-info": { en: "Ask for information", ar: "طلب معلومات", confirmEn: "Ask for more information?", confirmAr: "طلب معلومات إضافية؟" },
};

export function RequestDrawer({ lang, id, canReview, canStaffAct, onClose, onChanged, onCreateQuote }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [data, setData] = useState<{ request: SpecialRequest; history: HistoryEvent[] } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [reply, setReply] = useState<ReplyForm | null>(null);
  const [bad, setBad] = useState<ReplyField[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await readRequest(id);
      setData(result);
      setState(result ? "ready" : "missing");
    } catch (failure) {
      setState((failure as { status?: number }).status === 404 ? "missing" : "error");
    }
  }, [id]);
  useEffect(() => { setState("loading"); setReply(null); void load(); }, [load]);

  const request = data?.request ?? null;
  const open = request ? request.status === "new" || request.status === "under-review" || request.status === "needs-info" : false;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setReply(null); setConfirm(false); setClosing(false); setCloseReason(""); setInfo("");
      await load();
      onChanged();
    } catch (failure) {
      setError(requestErrorMessage(failure, lang));
      setConfirm(false);
      if ((failure as { code?: string }).code === "REVISION_CONFLICT") await load();
    } finally {
      setBusy(false);
    }
  }

  const setField = <K extends keyof ReplyForm>(key: K, value: ReplyForm[K]) => setReply((previous) => (previous ? { ...previous, [key]: value } : previous));
  const err = (field: ReplyField) => (bad.includes(field) ? t("Check this field", "راجع هذا الحقل") : undefined);
  const submitReply = () => {
    if (!reply) return;
    const found = validateReply(reply);
    setBad(found);
    if (found.length === 0) setConfirm(true);
  };

  return <DetailDrawer open onClose={onClose} lang={lang} wide title={request?.title ?? t("Special request", "طلب خاص")} subtitle={request ? [request.customerName, request.plate].filter(Boolean).join(" · ") : undefined}>
    {state === "loading" && <Skeleton rows={5} label={t("Loading", "جارٍ التحميل")} />}
    {state === "missing" && <EmptyState title={t("Request not found", "الطلب غير موجود")} />}
    {state === "error" && <EmptyState variant="error" title={t("Could not load this request", "تعذر تحميل الطلب")} action={<button type="button" className="btn" onClick={() => void load()}>{t("Retry", "إعادة المحاولة")}</button>} />}
    {request && state === "ready" && <div className="sr-stack">
      <div className="sr-row"><StatusBadge status={request.status} lang={lang} domain="request" />
        {request.source === "customer-app" && <span className="tag">{t("From customer app", "من تطبيق العميل")}</span>}</div>
      <dl className="sr-facts">
        <dt>{t("Customer", "العميل")}</dt><dd><RecordRef type="customer" id={request.customerId} label={request.customerName} mode="link" /></dd>
        <dt>{t("Vehicle", "المركبة")}</dt><dd><RecordRef type="vehicle" id={request.vehicleId} label={request.plate} mode="link" /></dd>
        <dt>{t("Requested date", "التاريخ المطلوب")}</dt><dd><bdi>{dateRange(request.requestedFrom, request.requestedTo)}</bdi></dd>
        {request.preferredTimeNote && <><dt>{t("Time note", "ملاحظة الوقت")}</dt><dd>{request.preferredTimeNote}</dd></>}
        {request.budgetNote && <><dt>{t("Budget note", "ملاحظة الميزانية")}</dt><dd>{request.budgetNote}</dd></>}
        {request.branchId && <><dt>{t("Branch", "الفرع")}</dt><dd>{request.branchId}</dd></>}
      </dl>
      <div className="sr-box"><h3>{t("What is requested", "تفاصيل الطلب")}</h3><p className="sr-text">{request.description}</p></div>

      {request.reply && <div className="sr-box">
        <h3>{t("Reply to the customer", "الرد على العميل")}</h3>
        {request.reply.message && <p className="sr-text">{request.reply.message}</p>}
        {request.reply.decision === "accepted" && <dl className="sr-facts">
          {request.reply.quotedPrice && <><dt>{t("Quoted price", "السعر المعروض")}</dt><dd><Money minor={request.reply.quotedPrice.minor} currency={request.reply.quotedPrice.currency} lang={lang} /></dd></>}
          {request.reply.durationDays && <><dt>{t("Time frame", "المدة")}</dt><dd>{t(`${request.reply.durationDays} day(s)`, `${request.reply.durationDays} يوم`)}{request.reply.durationNote ? ` · ${request.reply.durationNote}` : ""}</dd></>}
          {request.reply.availableFrom && <><dt>{t("Available from", "متاح من")}</dt><dd>{dateLabel(request.reply.availableFrom, lang)}</dd></>}
          {request.reply.offerValidUntil && <><dt>{t("Offer valid until", "العرض صالح حتى")}</dt><dd>{dateLabel(request.reply.offerValidUntil, lang)}</dd></>}
        </dl>}
      </div>}
      {request.ownerNotes && <div className="sr-box internal"><h3>{t("Internal notes (not shown to the customer)", "ملاحظات داخلية (لا تظهر للعميل)")}</h3><p className="sr-text">{request.ownerNotes}</p></div>}

      {request.status === "accepted" && <div className="sr-row">
        {request.quoteId
          ? <span>{t("Quote:", "عرض السعر:")} <RecordRef type="quote" id={request.quoteId} mode="link" /></span>
          : canReview && onCreateQuote && <button type="button" className="btn btn-primary" onClick={() => onCreateQuote(request)}>{t("Create quote", "إنشاء عرض سعر")}</button>}
      </div>}

      {error && <p className="cust-form-error" role="alert">{error}</p>}

      {canReview && open && !reply && <div className="sr-decision-actions">
        {request.status === "new" && <button type="button" className="btn" disabled={busy} onClick={() => void run(() => startReview(request.id, request.revision))}>{t("Start review", "بدء المراجعة")}</button>}
        {(["accepted", "declined", "needs-info"] as Decision[]).map((decision) => <button key={decision} type="button" className={`btn${decision === "accepted" ? " btn-primary" : ""}`} disabled={busy}
          onClick={() => { setBad([]); setReply(emptyReplyForm(decision)); }}>{lang === "ar" ? decisionCopy[decision].ar : decisionCopy[decision].en}</button>)}
      </div>}

      {reply && <form className="sr-box" onSubmit={(event) => { event.preventDefault(); submitReply(); }} noValidate>
        <h3>{lang === "ar" ? decisionCopy[reply.decision].ar : decisionCopy[reply.decision].en}</h3>
        <div className="sr-reply-grid">
          {reply.decision === "accepted" && <>
            <Field label={t("Quoted price", "السعر المعروض")} required error={err("price")}>
              <input className="field-input mono" dir="ltr" inputMode="decimal" value={reply.price} onChange={(event) => setField("price", event.target.value)} data-autofocus />
            </Field>
            <Field label={t("Currency", "العملة")} required error={err("currency")}>
              <input className="field-input mono" dir="ltr" maxLength={3} value={reply.currency} onChange={(event) => setField("currency", event.target.value.toUpperCase())} />
            </Field>
            <Field label={t("Duration (days)", "المدة (أيام)")} required error={err("durationDays")}>
              <input className="field-input" type="number" min={1} dir="ltr" value={reply.durationDays} onChange={(event) => setField("durationDays", event.target.value)} />
            </Field>
            <Field label={t("Duration note", "ملاحظة المدة")}>
              <input className="field-input" maxLength={300} value={reply.durationNote} onChange={(event) => setField("durationNote", event.target.value)} />
            </Field>
            <Field label={t("Available from", "متاح من")} required error={err("availableFrom")}>
              <input className="field-input" type="date" dir="ltr" value={reply.availableFrom} onChange={(event) => setField("availableFrom", event.target.value)} />
            </Field>
            <Field label={t("Offer valid until", "العرض صالح حتى")} error={err("offerValidUntil")}>
              <input className="field-input" type="date" dir="ltr" value={reply.offerValidUntil} onChange={(event) => setField("offerValidUntil", event.target.value)} />
            </Field>
          </>}
          <div className="full">
            <Field label={reply.decision === "needs-info" ? t("Question for the customer", "سؤال للعميل") : reply.decision === "declined" ? t("Reason for the customer", "السبب للعميل") : t("Message to the customer (optional)", "رسالة للعميل (اختياري)")}
              required={reply.decision !== "accepted"} error={err("message")}>
              <textarea className="field-textarea" rows={3} maxLength={1500} value={reply.message} onChange={(event) => setField("message", event.target.value)} />
            </Field>
          </div>
          <div className="full">
            <Field label={t("Internal notes (never shown to the customer)", "ملاحظات داخلية (لا تظهر للعميل)")}>
              <textarea className="field-textarea" rows={2} maxLength={2000} value={reply.ownerNotes} onChange={(event) => setField("ownerNotes", event.target.value)} />
            </Field>
          </div>
        </div>
        <div className="cust-form-actions">
          <button type="button" className="btn" onClick={() => setReply(null)}>{t("Cancel", "إلغاء")}</button>
          <button type="submit" className="btn btn-primary">{t("Review and send", "مراجعة وإرسال")}</button>
        </div>
      </form>}

      {canStaffAct && request.status === "needs-info" && <div className="sr-box">
        <h3>{t("Answer the owner's question", "الرد على سؤال المالك")}</h3>
        <textarea className="field-textarea" rows={3} maxLength={1000} value={info} onChange={(event) => setInfo(event.target.value)} aria-label={t("Answer", "الإجابة")} />
        <div className="cust-form-actions"><button type="button" className="btn btn-primary" disabled={busy || !info.trim()} onClick={() => void run(() => addInfo(request.id, request.revision, info.trim()))}>{t("Send answer", "إرسال الإجابة")}</button></div>
      </div>}

      {canReview && request.status !== "closed" && <div><button type="button" className="btn btn-quiet" onClick={() => { setClosing(true); setError(""); }}>{t("Close request", "إغلاق الطلب")}</button></div>}

      <div className="sr-box"><h3>{t("History", "السجل")}</h3>
        <ol className="sr-history">{data!.history.map((event) => <li key={event.seq}>
          <strong>{actionLabel(event.action, lang)}</strong>
          <span className="sr-muted">{[event.actorName, event.occurredAt ? dateLabel(event.occurredAt.slice(0, 10), lang) : ""].filter(Boolean).join(" · ")}</span>
          {event.reason && event.action !== "quote-linked" && <span className="sr-text">{event.reason}</span>}
        </li>)}</ol>
      </div>
    </div>}

    <ConfirmDialog open={confirm && reply !== null} lang={lang} busy={busy} danger={reply?.decision === "declined"}
      title={reply ? (lang === "ar" ? decisionCopy[reply.decision].confirmAr : decisionCopy[reply.decision].confirmEn) : ""}
      body={reply?.decision === "accepted" ? t("The customer will see the price, time frame and dates. Internal notes stay private.", "سيرى العميل السعر والمدة والتواريخ. تبقى الملاحظات الداخلية خاصة.") : reply?.message}
      confirmLabel={t("Send", "إرسال")} onCancel={() => setConfirm(false)}
      onConfirm={() => { if (request && reply) void run(() => decide(request.id, decisionPayload(reply, request.revision))); }} />
    <ConfirmDialog open={closing} lang={lang} busy={busy} danger title={t("Close this request?", "إغلاق هذا الطلب؟")} confirmLabel={t("Close request", "إغلاق الطلب")}
      confirmDisabled={!closeReason.trim()} disabledReason={t("Enter a reason to close.", "أدخل سبب الإغلاق.")}
      onCancel={() => setClosing(false)} onConfirm={() => { if (request) void run(() => closeRequest(request.id, request.revision, closeReason.trim())); }}>
      <textarea className="field-textarea" rows={3} maxLength={500} value={closeReason} onChange={(event) => setCloseReason(event.target.value)} aria-label={t("Reason", "السبب")} />
    </ConfirmDialog>
  </DetailDrawer>;
}
