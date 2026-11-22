import { useEffect, useMemo, useState } from "react";
import type { Locale } from "@garage/domain";
import { benefitApi, useGarageStore } from "../../shared/store";
import { Collapsible, ConfirmDialog, DateText, EmptyState, Field, FormSection, RecordRef, Skeleton, StatusBadge } from "../../shared/components";
import { dateLabel } from "../../shared/ui";
import { ReadOnlyNote } from "../quotes/access";
import { commercialError } from "../quotes/commercial-errors";
import { useLoader } from "../quotes/commercial-data";
import { buildLookups, tr } from "../quotes/lookups";
import { isProtectedRef, todayIso } from "../quotes/quote-logic";
import { activationLabels, benefitName, cancellationLabels, expiryText, limitText, reasonText, totalUses, transferLabels, usageText } from "./benefit-logic";

type Check = { state: string; reasons: string[] } | null;

/** Benefit drawer body: terms in plain words, check eligibility, record use, reverse a use. */
export function BenefitDetail({ id, lang, onChanged, canManage = false }: { id: string; lang: Locale; onChanged: () => void; canManage?: boolean }) {
  const t = tr(lang);
  const store = useGarageStore();
  const lookups = useMemo(() => buildLookups(store.state, lang), [store.state, lang]);
  const state = useLoader(() => benefitApi.detail(id), null as Awaited<ReturnType<typeof benefitApi.detail>> | null, (error) => commercialError(error, lang));
  const detail = state.data;
  const item = detail?.entitlement;
  const [on, setOn] = useState(todayIso());
  const [branchId, setBranchId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [fulfillmentRef, setFulfillmentRef] = useState("");
  const [check, setCheck] = useState<Check>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const canReverse = canManage && (store.actor?.role === "owner" || store.actor?.role === "branch-manager");

  useEffect(() => { if (item && !branchId) setBranchId(item.branchIds[0] ?? ""); }, [item, branchId]);

  async function refresh() { state.reload(); onChanged(); }

  async function evaluate() {
    setBusy(true); setMessage("");
    try {
      const result = await benefitApi.evaluate({ entitlementId: id, on, branchId });
      setCheck({ state: result.state, reasons: "reasons" in result ? result.reasons : [] });
    } catch (error) { setCheck(null); setMessage(commercialError(error, lang)); } finally { setBusy(false); }
  }
  async function redeem() {
    if (!item) return;
    setBusy(true); setMessage("");
    try {
      const result = await benefitApi.redeem({ entitlementId: id, quantity, on, branchId, fulfillmentRef: fulfillmentRef.trim(), expectedRevision: item.revision, idempotencyKey: crypto.randomUUID() });
      setFulfillmentRef(""); setCheck(null);
      setMessage(result.remaining === null ? t("Use recorded.", "تم تسجيل الاستخدام.") : t(`Use recorded. ${result.remaining} left.`, `تم تسجيل الاستخدام. المتبقي ${result.remaining}.`));
      await refresh();
    } catch (error) { setMessage(commercialError(error, lang)); } finally { setBusy(false); }
  }
  async function reverse() {
    if (!reversing) return;
    setBusy(true); setMessage("");
    try {
      await benefitApi.reverse({ redemptionId: reversing, reason: reason.trim(), evidenceRef: evidence.trim(), idempotencyKey: crypto.randomUUID() });
      setReversing(null); setReason(""); setEvidence("");
      setMessage(t("Use reversed. History is kept.", "تم عكس الاستخدام. يبقى السجل محفوظاً."));
      await refresh();
    } catch (error) { setMessage(commercialError(error, lang)); } finally { setBusy(false); }
  }

  if (state.loading && !detail) return <Skeleton rows={5} label={t("Loading", "جارٍ التحميل")} />;
  if (state.error && !detail) return <EmptyState variant="error" title={t("Could not load this benefit", "تعذر تحميل هذه المنفعة")} text={state.error} action={<button type="button" className="btn" onClick={state.reload}>{t("Retry", "إعادة المحاولة")}</button>} />;
  if (!detail || !item) return null;

  const customer = lookups.customer(item.customerId);
  const vehicle = lookups.vehicle(item.vehicleId);
  const used = detail.history.filter((entry) => !entry.reversed).reduce((sum, entry) => sum + entry.quantity, 0);
  const total = totalUses(item.limit);
  const date = (iso: string) => dateLabel(iso, lang);
  const active = item.status === "active" && canManage;
  const usage = usageText(item.limit, used, lang);

  return <div className="qo-stack qo-drawer-pad">
    <div className="qo-row between"><StatusBadge status={item.status} lang={lang} domain="benefit" /><span className="qo-muted">{usage ?? limitText(item.limit, lang)}</span></div>
    {total !== null && <span className="qo-meter" role="img" aria-label={usage ?? ""}><span style={{ inlineSize: `${Math.min(100, Math.round((used / Math.max(1, total)) * 100))}%` }} /></span>}
    {!canManage && <ReadOnlyNote lang={lang} />}
    <dl className="qo-kv">
      <dt>{t("Customer", "العميل")}</dt><dd>{customer ? <RecordRef type="customer" id={customer.id} label={customer.name} /> : "—"}</dd>
      <dt>{t("Vehicle", "المركبة")}</dt><dd>{vehicle ? <RecordRef type="vehicle" id={vehicle.vehicle.id} label={vehicle.vehicle.plate} subtitle={vehicle.vehicle.makeModel} /> : "—"}</dd>
      <dt>{t("From quote", "من عرض السعر")}</dt><dd><RecordRef type="quote" id={item.sourceQuote.quoteId} label={`${t("Quote", "عرض سعر")} · ${customer?.name ?? ""}`} mode="link" /></dd>
    </dl>
    <p>{detail.promise.eligibilityRule[lang]}</p>

    {active && <FormSection title={t("Use this benefit", "استخدام المنفعة")}>
      <Field label={t("Date", "التاريخ")} required><input className="field-input" type="date" value={on} onChange={(event) => { setOn(event.target.value); setCheck(null); }} /></Field>
      <Field label={t("Branch", "الفرع")} required>
        <select className="field-select" value={branchId} onChange={(event) => { setBranchId(event.target.value); setCheck(null); }}>
          {item.branchIds.map((branch) => <option key={branch} value={branch}>{lookups.branchName(branch) || t("Branch", "فرع")}</option>)}
        </select>
      </Field>
      <Field label={t("Quantity", "الكمية")} required><input className="field-input" type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.floor(Number(event.target.value) || 1)))} /></Field>
      <Field label={t("Job or visit note", "ملاحظة الزيارة أو العمل")} required hint={t("What was provided, e.g. wash on 12 Nov", "ما الذي تم تقديمه، مثل غسيل في 12 نوفمبر")}><input className="field-input" value={fulfillmentRef} onChange={(event) => setFulfillmentRef(event.target.value)} /></Field>
      <div className="qo-row" style={{ gridColumn: "1 / -1" }}>
        <button type="button" className="btn" disabled={busy || !branchId} onClick={() => void evaluate()}>{t("Check eligibility", "افحص الأهلية")}</button>
        <button type="button" className="btn btn-primary" disabled={busy || !branchId || !fulfillmentRef.trim()} onClick={() => void redeem()}>{t("Record use", "سجّل الاستخدام")}</button>
      </div>
    </FormSection>}
    {check && <div className="qo-inline-result" aria-live="polite"><StatusBadge status={check.state} lang={lang} domain="benefit" />{check.reasons.length > 0 && <ul>{check.reasons.map((reasonItem, index) => <li key={index}>{reasonText(reasonItem, lang)}</li>)}</ul>}</div>}
    {message && <p role="status" className="qo-muted">{message}</p>}

    <Collapsible title={t("Terms", "الشروط")}>
      <dl className="qo-kv">
        <dt>{t("Starts", "يبدأ")}</dt><dd>{(activationLabels[detail.promise.activationTrigger] ?? activationLabels.accepted)[lang]}</dd>
        <dt>{t("Expiry", "الانتهاء")}</dt><dd>{expiryText(detail.promise.expiryRule, lang, date)}</dd>
        <dt>{t("Transfer", "النقل")}</dt><dd>{(transferLabels[detail.promise.transferRule] ?? transferLabels["review-required"])[lang]}</dd>
        <dt>{t("If cancelled", "عند الإلغاء")}</dt><dd>{(cancellationLabels[detail.promise.cancellationRule] ?? cancellationLabels["review-required"])[lang]}</dd>
      </dl>
    </Collapsible>

    <Collapsible title={t("Use history", "سجل الاستخدام")} count={detail.history.length} defaultOpen={detail.history.length > 0}>
      {detail.history.length === 0 ? <p className="qo-muted">{t("Not used yet.", "لم تُستخدم بعد.")}</p>
        : <ul className="qo-history">{detail.history.map((entry) => <li key={entry.id}>
            <strong><DateText value={entry.on_date} lang={lang} /></strong>
            <span>× {entry.quantity}</span>
            <span className="qo-muted">{lookups.branchName(entry.branch_id)}</span>
            <span>{entry.fulfillment_ref}</span>
            {entry.reversed ? <StatusBadge status="cancelled" lang={lang} domain="benefit" label={t("Reversed", "معكوس")} />
              : canReverse && <button type="button" className="btn btn-sm btn-danger" onClick={() => setReversing(entry.id)}>{t("Reverse", "عكس")}</button>}
          </li>)}</ul>}
    </Collapsible>

    <ConfirmDialog open={reversing !== null} danger lang={lang} title={t("Reverse this use?", "عكس هذا الاستخدام؟")} body={t("The use stays in the history marked as reversed.", "يبقى الاستخدام في السجل مع علامة معكوس.")}
      confirmLabel={t("Reverse", "عكس")} onCancel={() => setReversing(null)} onConfirm={() => void reverse()} busy={busy}
      confirmDisabled={!reason.trim() || !isProtectedRef(evidence)} disabledReason={t("Add a reason and a proof reference starting with private:", "أضف السبب ومرجع إثبات يبدأ بـ private:")}>
      <Field label={t("Reason", "السبب")} required><input className="field-input" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      <Field label={t("Proof reference", "مرجع الإثبات")} required hint="private:…"><input className="field-input" value={evidence} onChange={(event) => setEvidence(event.target.value)} /></Field>
    </ConfirmDialog>
  </div>;
}

export { benefitName };
