import { useMemo, useState } from "react";
import type { Locale } from "@garage/domain";
import { quoteApi, useGarageStore } from "../../shared/store";
import { EmptyState, Field, PageHeader, Skeleton } from "../../shared/components";
import { commercialError } from "../quotes/commercial-errors";
import { useLoader, loadAcceptedQuotes } from "../quotes/commercial-data";
import { buildLookups, tr } from "../quotes/lookups";
import { QuotePicker, type AcceptedChoice } from "../quotes/pickers";
import { QualificationPanel } from "./QualificationPanel";
import "../quotes/commercial.css";

void quoteApi;

/**
 * Standalone promotions page (kept for the existing route until the shell folds it into Quotes & offers).
 * Pick an accepted quote, then run the guided qualification. `actorId` / `actorRole` are accepted for compatibility;
 * the panel reads the signed-in actor from the store.
 */
export function QualificationForm({ lang, embedded = false }: { lang: Locale; embedded?: boolean; actorId?: string; actorRole?: string }) {
  const t = tr(lang);
  const store = useGarageStore();
  const lookups = useMemo(() => buildLookups(store.state, lang), [store.state, lang]);
  const accepted = useLoader(loadAcceptedQuotes, [] as AcceptedChoice[], (error) => commercialError(error, lang));
  const [picked, setPicked] = useState<AcceptedChoice["ref"][]>([]);
  const quote = accepted.data.find((item) => picked.some((ref) => ref.quoteId === item.ref.quoteId && ref.revision === item.ref.revision)) ?? null;
  return <div className="qo-page">
    {!embedded && <PageHeader title={t("Promotions", "العروض الترويجية")} subtitle={t("Start from an accepted quote.", "ابدأ من عرض سعر مقبول.")} />}
    {accepted.loading && accepted.data.length === 0 ? <Skeleton rows={3} label={t("Loading", "جارٍ التحميل")} />
      : accepted.error ? <EmptyState variant="error" title={t("Could not load quotes", "تعذر تحميل العروض")} text={accepted.error} action={<button type="button" className="btn" onClick={accepted.reload}>{t("Retry", "إعادة المحاولة")}</button>} />
      : <div className="qo-stack">
          <Field label={t("Accepted quote", "العرض المقبول")} required full><QuotePicker lang={lang} quotes={accepted.data} lookups={lookups} selected={picked} onChange={setPicked} /></Field>
          {quote && <QualificationPanel key={`${quote.ref.quoteId}:${quote.ref.revision}`} lang={lang} quote={quote} acceptedQuotes={accepted.data} />}
        </div>}
  </div>;
}

export default QualificationForm;
