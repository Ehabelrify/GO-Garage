import { useMemo, useState } from "react";
import type { Locale } from "@garage/domain";
import { bookingAvailabilityApi, reservationApi, useGarageStore, type SlotAvailability } from "../../shared/store";
import { Collapsible, ConfirmDialog, EmptyState, Field, Money, RecordRef, Skeleton, StatusBadge } from "../../shared/components";
import { dateLabel } from "../../shared/ui";
import { commercialError } from "../quotes/commercial-errors";
import { useLoader } from "../quotes/commercial-data";
import { buildLookups, tr } from "../quotes/lookups";
import { addDays, isProtectedRef, policyLabel, todayIso } from "../quotes/quote-logic";
import { availableCorrections, correctionLabels, groupSlotsByDay, type Correction } from "./reservation-logic";

const eventLabels: Record<string, { en: string; ar: string }> = {
  reserved: { en: "Reserved", ar: "تم الحجز" },
  scheduled: { en: "Installation booked", ar: "تم حجز موعد التركيب" },
  "deposit-reference": { en: "Deposit reference added", ar: "تمت إضافة مرجع العربون" },
  cancelled: { en: "Cancelled", ar: "تم الإلغاء" },
  expired: { en: "Expired", ar: "انتهى" },
  restored: { en: "Restored", ar: "تمت الاستعادة" },
  redeemed: { en: "Redeemed", ar: "تم الاستخدام" },
  consumed: { en: "Used", ar: "تم الاستخدام" },
};
const depositLabels: Record<string, { en: string; ar: string }> = {
  "not-required": { en: "No deposit needed", ar: "لا يلزم عربون" },
  unrecorded: { en: "No deposit reference yet", ar: "لا يوجد مرجع عربون بعد" },
  "reference-only": { en: "Reference on file (payment not checked)", ar: "المرجع مسجل (لم يتم التحقق من الدفع)" },
  recorded: { en: "Deposit recorded", ar: "تم تسجيل العربون" },
};

/** Reservation drawer body: summary, schedule installation, deposit reference, authorised corrections, history. */
export function ReservationDetail({ lang, id, onChanged }: { lang: Locale; id: string; onChanged: () => void }) {
  const t = tr(lang);
  const store = useGarageStore();
  const lookups = useMemo(() => buildLookups(store.state, lang), [store.state, lang]);
  const canCorrect = store.actor?.role === "owner" || store.actor?.role === "branch-manager";
  const state = useLoader(() => reservationApi.detail(id), null as Awaited<ReturnType<typeof reservationApi.detail>> | null, (error) => commercialError(error, lang));
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(addDays(todayIso(), 14));
  const [slots, setSlots] = useState<SlotAvailability | null>(null);
  const [finding, setFinding] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deposit, setDeposit] = useState("");
  const [depositReason, setDepositReason] = useState("");
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");

  const detail = state.data;
  const reservation = detail?.reservation ?? null;
  const quote = detail?.acceptedQuote;

  async function reload() { state.reload(); onChanged(); }

  async function findSlots() {
    if (!reservation || !quote) return;
    setFinding(true); setMessage("");
    try {
      setSlots(await bookingAvailabilityApi.slots({ branchId: quote.branchId, fromDate: from, toDate: to, quoteId: reservation.acceptedQuote.quoteId, quoteRevision: reservation.acceptedQuote.revision }));
    } catch (error) { setMessage(commercialError(error, lang)); } finally { setFinding(false); }
  }
  async function schedule(slot: { dropoffDate: string; dropoffTime: string }) {
    if (!reservation) return;
    setBusy(true); setMessage("");
    try {
      await reservationApi.schedule({ reservationId: id, expectedRevision: reservation.revision, slot: { ...slot, configurationVersion: slots?.status === "available" ? slots.configurationVersion : undefined }, idempotencyKey: crypto.randomUUID() });
      setMessage(t("Installation booked.", "تم حجز موعد التركيب."));
      setSlots(null);
      await reload();
    } catch (error) { setMessage(commercialError(error, lang)); void findSlots(); } finally { setBusy(false); }
  }
  async function saveDeposit() {
    if (!reservation) return;
    setBusy(true); setMessage("");
    try {
      await reservationApi.depositReference({ id, expectedRevision: reservation.revision, reference: deposit.trim(), reason: depositReason.trim() });
      setDeposit(""); setDepositReason("");
      setMessage(t("Deposit reference saved. Payment is not checked here.", "تم حفظ مرجع العربون. لا يتم التحقق من الدفع هنا."));
      await reload();
    } catch (error) { setMessage(commercialError(error, lang)); } finally { setBusy(false); }
  }
  async function applyCorrection() {
    if (!reservation || !correction) return;
    setBusy(true); setMessage("");
    try {
      await reservationApi.correct({ id, expectedRevision: reservation.revision, action: correction, reason: reason.trim(), evidenceRef: evidence.trim() });
      setCorrection(null); setReason(""); setEvidence("");
      setMessage(t("Change saved.", "تم حفظ التغيير."));
      await reload();
    } catch (error) { setMessage(commercialError(error, lang)); } finally { setBusy(false); }
  }

  if (state.loading && !detail) return <Skeleton rows={5} label={t("Loading", "جارٍ التحميل")} />;
  if (state.error && !detail) return <EmptyState variant="error" title={t("Could not load this reservation", "تعذر تحميل هذا الحجز")} text={state.error} action={<button type="button" className="btn" onClick={state.reload}>{t("Retry", "إعادة المحاولة")}</button>} />;
  if (!detail || !quote) return null;

  const customer = lookups.customer(quote.customerId);
  const vehicle = lookups.vehicle(quote.vehicle.vehicleId);
  const confirmed = !!reservation?.bookingId && (reservation.status === "scheduled" || reservation.status === "redeemed");
  const corrections = reservation ? availableCorrections(reservation) : [];

  return <div className="qo-stack">
    <div className="qo-row between">
      <StatusBadge status={reservation ? reservation.status : "enquiry"} lang={lang} domain="reservation" label={reservation ? undefined : t("Enquiry", "استفسار")} />
      <strong>{confirmed ? t("Installation confirmed", "التركيب مؤكد") : reservation?.status === "reserved" ? t("Reserved, installation not booked", "محجوز، لم يُحجز موعد التركيب") : reservation ? t("Closed", "مغلق") : t("No reservation yet", "لا يوجد حجز بعد")}</strong>
    </div>
    {detail.state === "enquiry" && <p className="qo-muted">{t("Only an enquiry so far. Nothing is promised until approved reservation terms are in place.", "استفسار فقط حتى الآن. لا يوجد التزام قبل اعتماد شروط الحجز.")}</p>}

    <dl className="qo-kv">
      <dt>{t("Customer", "العميل")}</dt><dd>{customer ? <RecordRef type="customer" id={customer.id} label={customer.name} /> : "—"}</dd>
      <dt>{t("Vehicle", "المركبة")}</dt><dd>{vehicle ? <RecordRef type="vehicle" id={vehicle.vehicle.id} label={vehicle.vehicle.plate} subtitle={vehicle.vehicle.makeModel} /> : <bdi>{quote.vehicle.model}</bdi>}</dd>
      <dt>{t("Quote", "عرض السعر")}</dt><dd><RecordRef type="quote" id={quote.ref.quoteId} label={`${t("Quote", "عرض سعر")} · ${customer?.name ?? ""}`} mode="link" /> · <Money minor={quote.total.minor} currency={quote.total.currency} lang={lang} /></dd>
      {reservation && <><dt>{t("Promotion", "العرض الترويجي")}</dt><dd>{policyLabel(reservation.promotion, null, lang)}</dd>
        <dt>{t("Valid", "الصلاحية")}</dt><dd>{dateLabel(reservation.effectiveOn, lang)} {t("to", "إلى")} {reservation.expiresOn ? dateLabel(reservation.expiresOn, lang) : t("no end date", "بدون تاريخ انتهاء")}</dd>
        <dt>{t("Deposit", "العربون")}</dt><dd>{(depositLabels[reservation.deposit.state] ?? depositLabels.unrecorded)[lang]}</dd>
        {reservation.bookingId && <><dt>{t("Booking", "الحجز")}</dt><dd><RecordRef type="booking" id={reservation.bookingId} label={t("Installation booking", "حجز التركيب")} mode="link" /></dd></>}</>}
    </dl>

    {message && <p role="status" className="qo-muted">{message}</p>}

    {reservation?.status === "reserved" && <Collapsible title={t("Book installation", "حجز موعد التركيب")} defaultOpen>
      <div className="qo-stack">
        <div className="form-grid">
          <Field label={t("From", "من")}><input className="field-input" type="date" min={todayIso()} value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field label={t("To", "إلى")}><input className="field-input" type="date" min={from} value={to} onChange={(event) => setTo(event.target.value)} /></Field>
        </div>
        <div><button type="button" className="btn" disabled={finding || !from || !to || to < from} onClick={() => void findSlots()}>{t("Find free slots", "اعرض المواعيد المتاحة")}</button></div>
        {finding && <Skeleton rows={2} label={t("Finding slots", "جارٍ البحث عن المواعيد")} />}
        {slots?.status === "unconfigured" && <EmptyState title={t("Availability is not set up", "المواعيد غير مهيأة")} text={t("Ask the Owner to finish branch capacity in Settings.", "اطلب من المالك إكمال سعة الفرع من الإعدادات.")} />}
        {slots?.status === "available" && (slots.slots.length === 0
          ? <EmptyState variant="no-results" title={t("No free slots in this range", "لا توجد مواعيد متاحة في هذه الفترة")} />
          : groupSlotsByDay(slots.slots).map((day) => <div className="qo-day" key={day.date}>
              <strong>{dateLabel(day.date, lang)}</strong>
              <div className="qo-slots">{day.slots.map((slot) => <button key={`${slot.dropoffDate}:${slot.dropoffTime}`} type="button" className="btn btn-sm" disabled={busy} onClick={() => void schedule(slot)}><bdi className="mono">{slot.dropoffTime}</bdi></button>)}</div>
            </div>))}
      </div>
    </Collapsible>}

    {reservation?.deposit.state === "unrecorded" && <Collapsible title={t("Deposit reference", "مرجع العربون")}>
      <div className="qo-stack">
        <div className="form-grid">
          <Field label={t("Reference", "المرجع")} required hint="private:…"><input className="field-input" value={deposit} onChange={(event) => setDeposit(event.target.value)} /></Field>
          <Field label={t("Reason", "السبب")} required><input className="field-input" value={depositReason} onChange={(event) => setDepositReason(event.target.value)} /></Field>
        </div>
        <div><button type="button" className="btn" disabled={busy || !deposit.trim() || !depositReason.trim()} onClick={() => void saveDeposit()}>{t("Save reference", "حفظ المرجع")}</button></div>
      </div>
    </Collapsible>}

    {reservation && canCorrect && <Collapsible title={t("Corrections", "التصحيحات")}>
      <div className="qo-row">{corrections.map((action) => <button key={action} type="button" className={`btn btn-sm${action === "restore" ? "" : " btn-danger"}`} onClick={() => setCorrection(action)}>{correctionLabels[action][lang]}</button>)}</div>
    </Collapsible>}

    <Collapsible title={t("History", "السجل")} count={detail.events.length}>
      {detail.events.length === 0 ? <p className="qo-muted">{t("No history yet.", "لا يوجد سجل بعد.")}</p>
        : <ul className="qo-history">{detail.events.map((event) => <li key={event.revision}>
            <strong>{eventLabels[event.action]?.[lang] ?? event.action.replace(/[-_]+/g, " ")}</strong>
            <span className="qo-muted">{dateLabel(event.occurred_at, lang)}</span>
            {event.reason && <span>{event.reason}</span>}
          </li>)}</ul>}
    </Collapsible>

    <ConfirmDialog open={correction !== null} danger={correction !== "restore"} lang={lang}
      title={correction ? (lang === "ar" ? correctionLabels[correction].confirmAr : correctionLabels[correction].confirmEn) : ""}
      body={t("A reason and a proof reference are kept in the history. No refund or deposit is implied.", "يُحفظ السبب ومرجع الإثبات في السجل. لا يعني ذلك أي استرداد أو عربون.")}
      confirmLabel={correction ? correctionLabels[correction][lang] : undefined} onCancel={() => setCorrection(null)} onConfirm={() => void applyCorrection()} busy={busy}
      confirmDisabled={!reason.trim() || !isProtectedRef(evidence)} disabledReason={t("Add a reason and a proof reference starting with private:", "أضف السبب ومرجع إثبات يبدأ بـ private:")}>
      <Field label={t("Reason", "السبب")} required><input className="field-input" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      <Field label={t("Proof reference", "مرجع الإثبات")} required hint="private:…"><input className="field-input" value={evidence} onChange={(event) => setEvidence(event.target.value)} /></Field>
    </ConfirmDialog>
  </div>;
}
