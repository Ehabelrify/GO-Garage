import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale, QuoteDraftInput, QuoteVersionRef } from "@garage/domain";
import { quoteApi, useGarageStore } from "../../shared/store";
import { DateText, DetailDrawer, EmptyState, Notice, Plate, Skeleton } from "../../shared/components";
import { commercialError } from "./commercial-errors";
import { buildLookups, tr } from "./lookups";
import { CustomerVehiclePicker, type CustomerVehicleValue } from "./pickers";
import { QuoteForm, type QuoteFormState } from "./QuoteForm";
import { generateQuote, listQuoteSources, sourceRef, sourceStep, warningText, type QuoteSourceOption, type QuoteSourceRef } from "./quote-generate-api";
import "./commercial.css";

export interface CreateQuoteProps {
  lang: Locale;
  /** Known context. Without a customer the staff member picks a vehicle first. */
  customerId?: string;
  vehicleId?: string;
  /** Generate straight from this accepted special request. */
  requestId?: string;
  onClose: () => void;
  onSaved: (ref: QuoteVersionRef) => void;
}

type Phase =
  | { name: "choose" }
  | { name: "loading" }
  | { name: "pick"; sources: QuoteSourceOption[] }
  | { name: "edit"; base?: QuoteDraftInput; prefill?: Partial<CustomerVehicleValue>; warnings: string[] }
  | { name: "error"; message: string };

/**
 * The shared "Create quote" action. Finds the customer's recent service work (or the accepted special-request reply), pre-generates
 * a DRAFT from it and opens it in the editor; with several candidates it asks which service first; with none it opens a blank quote.
 */
export function CreateQuote({ lang, customerId, vehicleId, requestId, onClose, onSaved }: CreateQuoteProps) {
  const t = tr(lang);
  const store = useGarageStore();
  const lookups = useMemo(() => buildLookups(store.state, lang), [store.state, lang]);
  const [who, setWho] = useState<CustomerVehicleValue>({ customerId: customerId ?? "", vehicleId: vehicleId ?? "" });
  const [phase, setPhase] = useState<Phase>(customerId || requestId ? { name: "loading" } : { name: "choose" });
  const formApi = useRef<QuoteFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function open(source: QuoteSourceRef) {
    setPhase({ name: "loading" });
    try {
      const generated = await generateQuote(source);
      const revision = await quoteApi.readRevision(generated.quote);
      if (revision.state !== "draft") { onSaved(generated.quote); return; }
      setPhase({ name: "edit", warnings: generated.warnings, base: { ...revision.input, quoteId: generated.quote.quoteId, priorRevision: generated.quote, state: "draft" } });
    } catch (error) {
      setPhase({ name: "error", message: commercialError(error, lang) });
    }
  }
  async function start(customer: string, vehicle?: string) {
    setPhase({ name: "loading" });
    try {
      const sources = await listQuoteSources(customer, vehicle);
      const step = sourceStep(sources);
      if (step === "blank") setPhase({ name: "edit", prefill: { customerId: customer, vehicleId: vehicle ?? "" }, warnings: [] });
      else if (step === "single") await open(sourceRef(sources[0]));
      else setPhase({ name: "pick", sources });
    } catch (error) {
      setPhase({ name: "error", message: commercialError(error, lang) });
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (requestId) void open({ kind: "special-request", requestId });
    else if (customerId) void start(customerId, vehicleId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sourceLabel = (source: QuoteSourceOption) => source.kind === "special-request"
    ? `${t("Special request", "طلب خاص")}: ${source.title ?? ""}`
    : lookups.serviceName(source.serviceId) || t("Service", "خدمة");
  const blank = () => setPhase({ name: "edit", prefill: { customerId: customerId ?? who.customerId, vehicleId: vehicleId ?? who.vehicleId }, warnings: [] });
  return <DetailDrawer open onClose={onClose} lang={lang} wide title={t("Create quote", "إنشاء عرض سعر")}
    footer={phase.name === "edit" ? <>
      <button type="button" className="btn" onClick={onClose}>{t("Cancel", "إلغاء")}</button>
      <button type="button" className="btn" disabled={busy} onClick={() => formApi.current?.save("draft")}>{t("Save draft", "حفظ كمسودة")}</button>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => formApi.current?.save("offered")}>{t("Send offer", "إرسال العرض")}</button>
    </> : undefined}>
    {phase.name === "choose" && <div className="qo-stack">
      <p className="qo-muted">{t("Choose the customer's vehicle. The quote is pre-filled from their most recent service.", "اختر مركبة العميل. يُعبّأ العرض من آخر خدمة له.")}</p>
      <CustomerVehiclePicker lang={lang} customers={store.state?.customers ?? []} value={who} onChange={(next) => { setWho(next); if (next.customerId) void start(next.customerId, next.vehicleId || undefined); }} />
    </div>}
    {phase.name === "loading" && <Skeleton rows={4} label={t("Preparing the quote", "جارٍ تجهيز العرض")} />}
    {phase.name === "error" && <EmptyState variant="error" title={t("Could not prepare the quote", "تعذر تجهيز العرض")} text={phase.message}
      action={<button type="button" className="btn" onClick={blank}>{t("Start a blank quote", "ابدأ عرضاً فارغاً")}</button>} />}
    {phase.name === "pick" && <div className="qo-stack">
      <p className="qo-muted">{t("Which service is this quote for?", "لأي خدمة هذا العرض؟")}</p>
      <ul className="qo-picker-list">{phase.sources.map((source) => <li key={source.key}>
        <button type="button" className="qo-picker-item" onClick={() => void open(sourceRef(source))}>
          <span><bdi>{sourceLabel(source)}</bdi> <Plate value={lookups.plate(source.vehicleId)} /></span><small><DateText value={source.date} lang={lang} /></small>
        </button></li>)}</ul>
      <div><button type="button" className="btn" onClick={blank}>{t("Blank quote instead", "عرض فارغ بدلاً من ذلك")}</button></div>
    </div>}
    {phase.name === "edit" && <div className="qo-stack">
      {phase.warnings.map((key) => warningText[key] && <Notice key={key}>{warningText[key][lang]}</Notice>)}
      <QuoteForm lang={lang} base={phase.base} prefill={phase.prefill} onSaved={onSaved} onCancel={onClose}
        register={(api) => { formApi.current = api; if (api.busy !== busy) setBusy(api.busy); }} />
    </div>}
  </DetailDrawer>;
}
