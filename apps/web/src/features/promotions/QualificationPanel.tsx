import { useEffect, useMemo, useState } from "react";
import type { EligibilityResult, Locale, PromotionAllocation, QuoteVersionRef } from "@garage/domain";
import { promotionApi, useGarageStore } from "../../shared/store";
import { EmptyState, Field, FormSection, Notice, Select, Skeleton, StatusBadge } from "../../shared/components";
import { commercialError } from "../quotes/commercial-errors";
import { loadPromotions, useLoader, type PromotionInfo } from "../quotes/commercial-data";
import { buildLookups, tr } from "../quotes/lookups";
import { QuotePicker, type AcceptedChoice } from "../quotes/pickers";
import { isProtectedRef } from "../quotes/quote-logic";
import { PromotionAllocationDetail } from "./PromotionAllocationDetail";
import { evidenceLabels } from "./promotion-logic";

type EvidenceKind = "warranty-reference" | "membership-verification" | "grouped-vehicles";
const sameRef = (a: QuoteVersionRef, b: QuoteVersionRef) => a.quoteId === b.quoteId && a.revision === b.revision;

export interface QualificationPanelProps {
  lang: Locale;
  /** The accepted quote this check starts from. */
  quote: AcceptedChoice;
  /** All accepted quotes (used for multi-vehicle promotions). */
  acceptedQuotes: AcceptedChoice[];
  /** "allocate" shows the reserve-units step; "check" stops at eligibility and reports the qualification. */
  mode?: "allocate" | "check";
  onEligible?: (result: { qualificationId: string; promotion: PromotionInfo; quotes: QuoteVersionRef[] }) => void;
  onAllocated?: (allocations: PromotionAllocation[]) => void;
  /** Reports the promotion currently chosen (null when none), so a parent can act without a qualification. */
  onPromotion?: (promotion: PromotionInfo | null) => void;
  /** When set, the promotion is already chosen by the parent and the picker is hidden. */
  fixedPromotion?: PromotionInfo | null;
}

/** Promotion qualification as a guided action from a quote: promotion, proof, check, reserve units. */
export function QualificationPanel({ lang, quote, acceptedQuotes, mode = "allocate", onEligible, onAllocated, onPromotion, fixedPromotion }: QualificationPanelProps) {
  const t = tr(lang);
  const store = useGarageStore();
  const actor = store.actor;
  const lookups = useMemo(() => buildLookups(store.state, lang), [store.state, lang]);
  const promos = useLoader(() => loadPromotions(lang), [] as PromotionInfo[], (error) => commercialError(error, lang));
  const [promoKey, setPromoKey] = useState("");
  const [kind, setKind] = useState<EvidenceKind | "">("");
  const [warrantyId, setWarrantyId] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [expiry, setExpiry] = useState("");
  const [group, setGroup] = useState<QuoteVersionRef[]>([quote.ref]);
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [allocations, setAllocations] = useState<PromotionAllocation[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const promo = fixedPromotion ?? promos.data.find((item) => `${item.ref.id}:${item.ref.version}` === promoKey) ?? null;
  useEffect(() => { onPromotion?.(promo); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promoKey, promos.data]);
  useEffect(() => { if (!promoKey && promos.data.length === 1) setPromoKey(`${promos.data[0].ref.id}:${promos.data[0].ref.version}`); }, [promos.data, promoKey]);
  const activeKey = promo ? `${promo.ref.id}:${promo.ref.version}` : "";
  useEffect(() => { setKind(promo && promo.evidenceKinds.length === 1 ? promo.evidenceKinds[0] : ""); setResult(null); setAllocations([]); setVerificationId(""); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const customerWarranties = (store.state?.warranties ?? []).filter((warranty) => warranty.customerId === quote.input.customerId && warranty.status === "active");
  const canVerify = !!promo && !!actor && promo.verifierRoles.includes(actor.role);
  const sameCustomerQuotes = acceptedQuotes.filter((item) => item.input.customerId === quote.input.customerId);
  const multi = !!promo && promo.maxVehicles > 1;
  const chosen = multi ? sameCustomerQuotes.filter((item) => group.some((ref) => sameRef(ref, item.ref))) : [quote];
  const vehicleIds = [...new Set(chosen.map((item) => item.input.vehicle.vehicleId))];
  const effectiveKind: EvidenceKind | "" = multi && promo?.evidenceKinds.includes("grouped-vehicles") ? "grouped-vehicles" : kind;

  async function verify() {
    if (!promo || !actor) return;
    setBusy(true); setMessage("");
    try {
      const fact = await promotionApi.verifyMembership({ promotionRef: promo.ref, beneficiaryId: quote.input.customerId, branchId: quote.input.branchId, sourceRef: sourceRef.trim(), expiresAt: expiry ? new Date(`${expiry}T23:59:59`).toISOString() : null });
      setVerificationId(fact.verificationId);
      setMessage(t("Membership verified.", "تم التحقق من العضوية."));
    } catch (error) { setMessage(commercialError(error, lang)); } finally { setBusy(false); }
  }

  const referenceIds = effectiveKind === "warranty-reference" ? (warrantyId ? [warrantyId] : []) : effectiveKind === "membership-verification" ? (verificationId ? [verificationId] : []) : vehicleIds;
  const ready = !!promo && !!effectiveKind && referenceIds.length > 0 && (!multi || vehicleIds.length >= promo.minVehicles);

  async function check() {
    if (!promo || !effectiveKind || !actor) return;
    setBusy(true); setMessage(""); setAllocations([]);
    try {
      const verified = effectiveKind !== "membership-verification";
      const next = await promotionApi.evaluate({ promotionRef: promo.ref, beneficiaryId: quote.input.customerId, vehicleIds, evidence: [{ kind: effectiveKind, referenceIds, verifiedBy: verified ? actor.userId : null, verifiedAt: verified ? new Date().toISOString() : null }] });
      setResult(next);
      if (next.state === "eligible") onEligible?.({ qualificationId: next.qualificationId, promotion: promo, quotes: chosen.map((item) => item.ref) });
    } catch (error) { setMessage(commercialError(error, lang)); } finally { setBusy(false); }
  }

  async function allocate() {
    if (!promo || result?.state !== "eligible") return;
    setBusy(true); setMessage("");
    try {
      const refs = chosen.map((item) => item.ref);
      const next = await promotionApi.allocate({ promotionRef: promo.ref, qualificationId: result.qualificationId, quoteRef: refs[0], quoteRefs: refs, idempotencyKey: crypto.randomUUID() });
      setAllocations(next);
      onAllocated?.(next);
    } catch (error) { setMessage(commercialError(error, lang)); } finally { setBusy(false); }
  }

  if (!fixedPromotion && promos.loading && promos.data.length === 0) return <Skeleton rows={3} label={t("Loading promotions", "جارٍ تحميل العروض")} />;
  if (!fixedPromotion && promos.error) return <EmptyState variant="error" title={t("Could not load promotions", "تعذر تحميل العروض")} text={promos.error} action={<button type="button" className="btn" onClick={promos.reload}>{t("Retry", "إعادة المحاولة")}</button>} />;
  if (!fixedPromotion && promos.data.length === 0) return <EmptyState title={t("No promotions available", "لا توجد عروض ترويجية متاحة")} text={t("An approved promotion rule is needed. Ask the Owner.", "يلزم قاعدة عرض معتمدة. اطلب من المالك.")} />;

  return <div className="qo-stack">
    {!fixedPromotion && <FormSection title={t("Promotion", "العرض الترويجي")} columns={1}>
      <Field label={t("Promotion", "العرض الترويجي")} required hint={promo?.rule ? promo.rule[lang] : undefined}>
        <Select className="field-select" label={t("Promotion", "العرض الترويجي")} value={promoKey} onChange={(event) => setPromoKey(event.target.value)}
          options={[{ value: "", label: t("Choose a promotion", "اختر عرضاً ترويجياً") }, ...promos.data.map((item) => ({ value: `${item.ref.id}:${item.ref.version}`, label: item.name }))]} />
      </Field>
    </FormSection>}

    {promo && <FormSection title={t("Proof", "الإثبات")} columns={1}>
      {promo.evidenceKinds.length > 1 && !multi && <Field label={t("Proof type", "نوع الإثبات")} required>
        <Select className="field-select" label={t("Proof type", "نوع الإثبات")} value={kind} onChange={(event) => setKind(event.target.value as EvidenceKind)}
          options={[{ value: "", label: t("Choose", "اختر") }, ...promo.evidenceKinds.map((item) => ({ value: item, label: evidenceLabels[item][lang] }))]} />
      </Field>}
      {effectiveKind === "warranty-reference" && <Field label={t("Customer warranty", "ضمان العميل")} required>
        {customerWarranties.length === 0
          ? <p className="qo-muted">{t("This customer has no active warranty.", "لا يوجد ضمان ساري لهذا العميل.")}</p>
          : <Select className="field-select" label={t("Customer warranty", "ضمان العميل")} value={warrantyId} onChange={(event) => setWarrantyId(event.target.value)}
              options={[{ value: "", label: t("Choose a warranty", "اختر ضماناً") }, ...customerWarranties.map((warranty) => ({ value: warranty.id, label: `${warranty.policyName} · ${lookups.plate(warranty.vehicleId)}` }))]} />}
      </Field>}
      {effectiveKind === "membership-verification" && (verificationId
        ? <p><StatusBadge status="eligible" lang={lang} domain="benefit" label={t("Membership verified", "تم التحقق من العضوية")} /></p>
        : canVerify
          ? <div className="form-grid">
              <Field label={t("Membership proof reference", "مرجع إثبات العضوية")} required hint="private:…"><input className="field-input" value={sourceRef} onChange={(event) => setSourceRef(event.target.value)} /></Field>
              <Field label={t("Valid until (optional)", "ساري حتى (اختياري)")}><input className="field-input" type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} /></Field>
              <div><button type="button" className="btn" disabled={busy || !isProtectedRef(sourceRef)} onClick={() => void verify()}>{t("Verify membership", "تحقق من العضوية")}</button></div>
            </div>
          : <Notice tone="info">{t("A manager must verify this membership first.", "يجب أن يتحقق مدير من هذه العضوية أولاً.")}</Notice>)}
      {multi && <Field label={t(`Quotes together (${promo.minVehicles} to ${promo.maxVehicles} vehicles)`, `العروض معاً (من ${promo.minVehicles} إلى ${promo.maxVehicles} مركبات)`)} required full>
        <QuotePicker lang={lang} quotes={sameCustomerQuotes} lookups={lookups} selected={group} onChange={(next) => setGroup(next.length ? next : [quote.ref])} multiple />
      </Field>}
    </FormSection>}

    <div className="qo-row"><button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={() => void check()}>{t("Check qualification", "افحص الأهلية")}</button></div>
    {message && <p role="status" className="qo-muted">{message}</p>}

    {result && <div className="qo-inline-result" aria-live="polite">
      <StatusBadge status={result.state} lang={lang} domain="benefit" />
      {result.criteria.length > 0 && <ul>{result.criteria.map((item, index) => <li key={index}>{item}</li>)}</ul>}
      {result.state !== "eligible" && result.reasons.length > 0 && <ul>{result.reasons.map((item, index) => <li key={index}>{item}</li>)}</ul>}
      {result.state === "eligible" && mode === "allocate" && allocations.length === 0 && <div><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void allocate()}>{t("Reserve promotion units", "احجز وحدات العرض")}</button></div>}
    </div>}
    {allocations.map((item) => <PromotionAllocationDetail key={item.id} lang={lang} id={item.id} />)}
  </div>;
}
