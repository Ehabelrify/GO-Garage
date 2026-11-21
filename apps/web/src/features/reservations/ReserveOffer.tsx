import { useMemo, useState } from "react";
import type { Locale, QuoteVersionRef } from "@garage/domain";
import { reservationApi, useGarageStore } from "../../shared/store";
import { Collapsible, EmptyState, Field, FormSection, Notice, RequiredNote, Skeleton } from "../../shared/components";
import { commercialError } from "../quotes/commercial-errors";
import { loadAcceptedQuotes, useLoader, type PromotionInfo } from "../quotes/commercial-data";
import { buildLookups, tr } from "../quotes/lookups";
import { QuotePicker, type AcceptedChoice } from "../quotes/pickers";
import { todayIso } from "../quotes/quote-logic";
import { QualificationPanel } from "../promotions/QualificationPanel";

export interface ReserveOfferProps {
  lang: Locale;
  /** Accepted quote chosen by the caller (e.g. the quote drawer). When omitted a picker is shown. */
  quote?: AcceptedChoice;
  onReserved: (reservationId: string) => void;
}

/** Reserve an accepted quote against a promotion: pick quote, check qualification, choose start date, reserve. */
export function ReserveOffer({ lang, quote: fixed, onReserved }: ReserveOfferProps) {
  const t = tr(lang);
  const store = useGarageStore();
  const lookups = useMemo(() => buildLookups(store.state, lang), [store.state, lang]);
  const accepted = useLoader(loadAcceptedQuotes, [] as AcceptedChoice[], (error) => commercialError(error, lang));
  const [picked, setPicked] = useState<QuoteVersionRef[]>([]);
  const [promotion, setPromotion] = useState<PromotionInfo | null>(null);
  const [qualificationId, setQualificationId] = useState<string | null>(null);
  const [effectiveOn, setEffectiveOn] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const choices = accepted.data;
  const quote = fixed ?? choices.find((item) => picked.some((ref) => ref.quoteId === item.ref.quoteId && ref.revision === item.ref.revision)) ?? null;

  async function reserve() {
    if (!quote || !promotion || !effectiveOn) return;
    setBusy(true); setMessage("");
    try {
      const result = await reservationApi.reserve({ quoteRef: quote.ref, promotionRef: promotion.ref, qualificationId, effectiveOn, idempotencyKey: crypto.randomUUID() });
      onReserved(result.id);
    } catch (error) { setMessage(commercialError(error, lang)); } finally { setBusy(false); }
  }

  if (!fixed && accepted.loading && choices.length === 0) return <Skeleton rows={3} label={t("Loading", "جارٍ التحميل")} />;
  if (!fixed && accepted.error) return <EmptyState variant="error" title={t("Could not load quotes", "تعذر تحميل العروض")} text={accepted.error} action={<button type="button" className="btn" onClick={accepted.reload}>{t("Retry", "إعادة المحاولة")}</button>} />;

  return <div className="qo-stack">
    <RequiredNote text={t("Required", "حقل مطلوب")} />
    {!fixed && <FormSection title={t("Accepted quote", "العرض المقبول")} columns={1}>
      <Field label={t("Quote", "عرض السعر")} required full>
        <QuotePicker lang={lang} quotes={choices} lookups={lookups} selected={picked} onChange={(next) => { setPicked(next); setQualificationId(null); }} />
      </Field>
    </FormSection>}
    {quote && <>
      <QualificationPanel key={`${quote.ref.quoteId}:${quote.ref.revision}`} lang={lang} quote={quote} acceptedQuotes={fixed ? [fixed] : choices} mode="check"
        onPromotion={setPromotion} onEligible={(result) => setQualificationId(result.qualificationId)} />
      {promotion && <FormSection title={t("Reservation", "الحجز")} columns={1}>
        <Field label={t("Starts on", "يبدأ في")} required>
          <input className="field-input" type="date" min={todayIso()} value={effectiveOn} onChange={(event) => setEffectiveOn(event.target.value)} />
        </Field>
      </FormSection>}
      {promotion && !qualificationId && <Collapsible title={t("Reserve without a qualification check", "الحجز دون فحص الأهلية")}>
        <Notice tone="info">{t("This is recorded as an enquiry. It becomes a firm reservation only when approved terms and a matching qualification exist.", "يُسجل كاستفسار. لا يصبح حجزاً مؤكداً إلا بوجود شروط معتمدة وإثبات أهلية مطابق.")}</Notice>
      </Collapsible>}
      {message && <p className="form-error" role="alert">{message}</p>}
      <div className="qo-row">
        <button type="button" className="btn btn-primary" disabled={busy || !promotion || !effectiveOn} onClick={() => void reserve()}>
          {qualificationId ? t("Reserve offer", "احجز العرض") : t("Record enquiry", "سجّل استفساراً")}
        </button>
      </div>
    </>}
  </div>;
}
