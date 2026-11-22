import { useState } from "react";
import type { AcceptedQuoteSnapshot, Locale, PolicyRef, QuoteVersionRef } from "@garage/domain";
import { quoteApi } from "../../shared/store";
import { Amount, Collapsible, DateText, Field, RecordRef, StatusBadge } from "../../shared/components";
import { commercialError, errorCode } from "./commercial-errors";
import type { Lookups } from "./lookups";
import { tr } from "./lookups";
import { followupLabels, isExpired, isProtectedRef, policyLabel, priceOriginLabels, roofLabels, summariseLines, type QuoteRow } from "./quote-logic";

/** Read-only quote body (summary, lines, totals) shared by the drawer and previews. */
export function QuoteSummaryView({ lang, quote, lookups }: { lang: Locale; quote: QuoteRow; lookups: Lookups }) {
  const t = tr(lang);
  const { input } = quote;
  const summary = summariseLines(input.lines);
  const total = quote.total ?? { minor: summary.total, currency: summary.currency };
  const customer = lookups.customer(input.customerId);
  const vehicle = lookups.vehicle(input.vehicle.vehicleId);
  const itemName = (scopeId: string) => {
    const scope = input.scope.find((entry) => entry.id === scopeId);
    return scope ? lookups.serviceName(scope.serviceId) || t("Service", "خدمة") : "";
  };
  const componentName = (componentId: string) => {
    const work = input.work.find((entry) => entry.id === componentId);
    return work ? lookups.serviceName(work.serviceId) || t("Work item", "بند عمل") : t("Work item", "بند عمل");
  };
  const policyName = (ref: PolicyRef) => policyLabel(ref, null, lang);
  const expired = isExpired(quote);
  return <div className="qo-stack">
    <dl className="qo-kv">
      <dt>{t("Customer", "العميل")}</dt><dd>{customer ? <RecordRef type="customer" id={customer.id} label={customer.name} /> : "—"}</dd>
      <dt>{t("Vehicle", "المركبة")}</dt><dd>{vehicle ? <RecordRef type="vehicle" id={vehicle.vehicle.id} label={vehicle.vehicle.plate} subtitle={vehicle.vehicle.makeModel} /> : <bdi>{input.vehicle.model}</bdi>}</dd>
      <dt>{t("Branch", "الفرع")}</dt><dd>{lookups.branchName(input.branchId) || "—"}</dd>
      <dt>{t("Price", "السعر")}</dt><dd>{priceOriginLabels[input.priceOrigin.kind][lang]}</dd>
      <dt>{t("Valid through", "صالح حتى")}</dt><dd><DateText value={quote.validThrough} lang={lang} />{expired && <> <StatusBadge status="expired" lang={lang} domain="quote" /></>}</dd>
      <dt>{t("Follow-up", "المتابعة")}</dt><dd>{followupLabels[quote.followup.status][lang]}</dd>
    </dl>
    <table className="qo-lines">
      <thead><tr><th>{t("Item", "البند")}</th><th className="num">{t("Qty", "الكمية")}</th><th className="num">{t("Price", "السعر")}</th><th className="num">{t("Total", "الإجمالي")}</th></tr></thead>
      <tbody>{input.lines.map((line) => {
        const scope = input.scope.find((entry) => entry.id === line.scopeItemId);
        const addOns = (scope?.addOnIds ?? []).map((id) => lookups.serviceName(id)).filter(Boolean);
        return <tr key={line.id}>
          <td><strong>{itemName(line.scopeItemId)}</strong>
            <div className="qo-chips">
              {scope && scope.roof !== "not-applicable" && <span className="tag">{roofLabels[scope.roof][lang]}</span>}
              {addOns.map((name) => <span className="tag" key={name}>+ {name}</span>)}
            </div></td>
          <td className="num">{line.quantity}</td>
          <td className="num"><Amount minor={line.unitPrice.minor} currency={line.unitPrice.currency} lang={lang} variant="detail" /></td>
          <td className="num"><Amount minor={line.unitPrice.minor * line.quantity - line.discount.minor + (line.tax?.minor ?? 0)} currency={line.unitPrice.currency} lang={lang} variant="detail" /></td>
        </tr>;
      })}</tbody>
    </table>
    <div className="qo-totals">
      <div><span>{t("Subtotal", "المجموع")}</span><Amount minor={summary.subtotal} currency={summary.currency} lang={lang} variant="detail" /></div>
      {summary.discount > 0 && <div><span>{t("Discount", "الخصم")}</span><Amount minor={-summary.discount} currency={summary.currency} lang={lang} variant="detail" /></div>}
      {summary.tax > 0 && <div><span>{t("Tax", "الضريبة")}</span><Amount minor={summary.tax} currency={summary.currency} lang={lang} variant="detail" /></div>}
      <div className="grand"><span>{t("Total", "الإجمالي")}</span><Amount minor={total.minor} currency={total.currency} lang={lang} variant="detail" /></div>
    </div>
    {input.scope.some((entry) => entry.areas.length > 0 || entry.exclusions.length > 0) && <Collapsible title={t("Scope details", "تفاصيل النطاق")}>
      <dl className="qo-kv">{input.scope.filter((entry) => entry.areas.length > 0 || entry.exclusions.length > 0).map((entry) => [
        <dt key={`${entry.id}-t`}>{lookups.serviceName(entry.serviceId) || t("Service", "خدمة")}</dt>,
        <dd key={`${entry.id}-d`}>{entry.areas.length > 0 && <div>{t("Areas", "المناطق")}: {entry.areas.join("، ")}</div>}{entry.exclusions.length > 0 && <div>{t("Not included", "غير مشمول")}: {entry.exclusions.join("، ")}</div>}</dd>,
      ])}</dl>
    </Collapsible>}
    {(input.warrantyBindings.length > 0 || input.benefitBindings.length > 0) && <Collapsible title={t("Warranty and benefits included", "الضمان والمنافع المشمولة")} count={input.warrantyBindings.length + input.benefitBindings.length}>
      <ul className="qo-history">
        {input.warrantyBindings.map((binding) => <li key={binding.componentId}><span className="tag">{t("Warranty", "ضمان")}</span><span>{policyName(binding.policy)}</span><span className="qo-muted">{componentName(binding.componentId)}</span></li>)}
        {input.benefitBindings.map((binding) => <li key={`${binding.id}:${binding.version}`}><span className="tag">{t("Benefit", "منفعة")}</span><span>{policyName(binding)}</span></li>)}
      </ul>
    </Collapsible>}
  </div>;
}

/** Record customer acceptance on an offered quote (proof reference required). Preserves the outcome-check flow. */
export function QuoteAcceptance({ lang, quote, onAccepted }: { lang: Locale; quote: QuoteRow; onAccepted: (snapshot: AcceptedQuoteSnapshot) => void }) {
  const t = tr(lang);
  const [evidence, setEvidence] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const expired = isExpired(quote);
  const ready = quote.state === "offered" && quote.total !== null && !expired;
  if (!ready) return expired ? <p className="qo-muted">{t("This quote has expired. Revise it to offer again.", "انتهت صلاحية العرض. أنشئ مراجعة لعرضه مجدداً.")}</p> : null;

  async function confirmOutcome(stableKey: string) {
    onAccepted(await quoteApi.outcome(quote.ref.quoteId, stableKey));
    setMessage(t("Acceptance confirmed.", "تم تأكيد القبول."));
  }
  async function accept() {
    if (!isProtectedRef(evidence)) return;
    const stableKey = key ?? crypto.randomUUID();
    setKey(stableKey); setBusy(true); setMessage("");
    try {
      onAccepted(await quoteApi.accept({ ref: quote.ref, expectedDigest: quote.digest, acceptanceEvidenceRef: evidence.trim(), idempotencyKey: stableKey }));
      setMessage(t("Acceptance recorded.", "تم تسجيل القبول."));
    } catch (error) {
      if (errorCode(error) === "WRITE_OUTCOME_UNKNOWN") {
        try { await confirmOutcome(stableKey); } catch { setMessage(t("We could not confirm the result. Check again before retrying; your proof is kept.", "لم نتمكن من تأكيد النتيجة. تحقق مجدداً قبل إعادة المحاولة؛ تم الاحتفاظ بالإثبات.")); }
      } else setMessage(commercialError(error, lang));
    } finally { setBusy(false); }
  }
  async function check() {
    if (!key) return;
    try { await confirmOutcome(key); } catch (error) { setMessage(commercialError(error, lang)); }
  }
  return <div className="qo-section">
    <Field label={t("Customer acceptance proof", "إثبات قبول العميل")} required hint="private:…">
      <input className="field-input" value={evidence} onChange={(event) => { setEvidence(event.target.value); setKey(null); }} />
    </Field>
    <div className="qo-row">
      <button type="button" className="btn btn-primary" disabled={busy || !isProtectedRef(evidence)} onClick={() => void accept()}>{t("Record acceptance", "تسجيل القبول")}</button>
      {key && <button type="button" className="btn" disabled={busy} onClick={() => void check()}>{t("Check result", "تحقق من النتيجة")}</button>}
    </div>
    {message && <p role="status" className="qo-muted">{message}</p>}
  </div>;
}

export type { QuoteVersionRef };
