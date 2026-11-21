import { useEffect, useMemo, useRef, useState } from "react";
import type { Branch, Locale, MoneyEventKind } from "@garage/domain";
import { financeApi } from "../../shared/store";
import { majorToMinor } from "../../shared/format";
import { Collapsible, Field, FormSection, Notice, RequiredNote } from "../../shared/components";
import { fetchActiveDefinition, type ActiveDefinition } from "./finance-api";
import {
  definitionLabel, errorText, kindLabels, kindMetric, moneyEventKinds, sourceMethodLabel, sourceMethodsFor, toEvidenceRef, validateMoneyEvent,
  type DraftErrors, type MoneyEventDraft,
} from "./finance-logic";
import { makeT, type FinanceLookups } from "./finance-ui";

const localNow = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

export interface MoneyEventFormProps {
  lang: Locale;
  branches: Branch[];
  defaultBranchId?: string;
  lookups: FinanceLookups;
  /** Form element id so a drawer footer button can submit it. */
  formId: string;
  onBusyChange?: (busy: boolean) => void;
  onSaved: () => void;
}

/** Short money-event form: type, amount, when, where, how, reference, reason, evidence. Links are optional pickers. */
export function MoneyEventForm({ lang, branches, defaultBranchId, lookups, formId, onBusyChange, onSaved }: MoneyEventFormProps) {
  const t = makeT(lang);
  const firstBranch = defaultBranchId && defaultBranchId !== "all" ? defaultBranchId : branches[0]?.id ?? "";
  const [draft, setDraft] = useState<MoneyEventDraft>({
    kind: "collection", amount: "", currency: "", effectiveAt: localNow(), branchId: firstBranch, sourceMethod: "cash",
    sourceReference: "", definitionVersion: null, reason: "", evidence: "",
  });
  const [quoteId, setQuoteId] = useState("");
  const [jobId, setJobId] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [definition, setDefinition] = useState<ActiveDefinition | null>(null);
  const [definitionError, setDefinitionError] = useState("");
  const [errors, setErrors] = useState<DraftErrors>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const set = <K extends keyof MoneyEventDraft>(key: K, value: MoneyEventDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    let current = true;
    setDefinition(null);
    setDefinitionError("");
    fetchActiveDefinition(kindMetric[draft.kind])
      .then((result) => { if (current) setDefinition(result); })
      .catch(() => { if (current) { setDefinition({ state: "unconfigured" }); setDefinitionError(t("Could not load the definition.", "تعذر تحميل التعريف.")); } });
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.kind]);

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      currency: definition?.state === "approved" ? definition.currency : "",
      definitionVersion: definition?.state === "approved" ? definition.ref.version : null,
    }));
  }, [definition]);

  useEffect(() => {
    const methods = sourceMethodsFor(draft.kind);
    if (!methods.some((method) => method.value === draft.sourceMethod)) set("sourceMethod", methods[0]?.value ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.kind]);

  const inBranch = <R extends { branchId: string }>(rows: R[]) => rows.filter((row) => row.branchId === draft.branchId);
  const quoteOptions = useMemo(() => inBranch(lookups.quotes), [lookups.quotes, draft.branchId]); // eslint-disable-line react-hooks/exhaustive-deps
  const jobOptions = useMemo(() => inBranch(lookups.jobs), [lookups.jobs, draft.branchId]); // eslint-disable-line react-hooks/exhaustive-deps
  const reservationOptions = useMemo(() => inBranch(lookups.reservations), [lookups.reservations, draft.branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  function changeBranch(branchId: string) {
    set("branchId", branchId);
    setQuoteId(""); setJobId(""); setReservationId("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found = validateMoneyEvent(draft, lang);
    setErrors(found);
    setMessage("");
    if (Object.keys(found).length || definition?.state !== "approved") return;
    const minor = majorToMinor(draft.amount, draft.currency);
    if (minor === null) return;
    setBusy(true);
    onBusyChange?.(true);
    try {
      await financeApi.record({
        kind: draft.kind,
        amount: { minor, currency: draft.currency },
        effectiveAt: new Date(draft.effectiveAt).toISOString(),
        branchId: draft.branchId,
        sourceMethod: draft.sourceMethod,
        sourceReference: draft.sourceReference.trim(),
        definition: definition.ref,
        quoteId: quoteId || null,
        jobId: jobId || null,
        reservationId: reservationId || null,
        reason: draft.reason.trim(),
        evidenceRef: toEvidenceRef(draft.evidence),
        idempotencyKey: idempotencyKey.current,
      });
      idempotencyKey.current = crypto.randomUUID();
      onSaved();
    } catch (failure) {
      setMessage(errorText(failure, lang));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  const noDefinition = definition?.state === "unconfigured";
  const methods = sourceMethodsFor(draft.kind);
  return <form id={formId} className="finance-form" onSubmit={(event) => void submit(event)} noValidate>
    <RequiredNote text={t("Required", "حقل مطلوب")} />
    {noDefinition && <Notice>{definitionError || t("No approved definition for this type yet. Approve one in Settings first.", "لا يوجد تعريف معتمد لهذا النوع بعد. اعتمد تعريفاً من الإعدادات أولاً.")}</Notice>}
    <FormSection title={t("What happened", "ما الذي حدث")}>
      <Field label={t("Type", "النوع")} required hint={definition?.state === "approved" ? definitionLabel(definition.ref, lang) : undefined}>
        <select className="field-select" value={draft.kind} onChange={(event) => set("kind", event.target.value as MoneyEventKind)}>
          {moneyEventKinds.map((kind) => <option key={kind} value={kind}>{kindLabels[kind][lang]}</option>)}
        </select>
      </Field>
      <Field label={draft.currency ? `${t("Amount", "المبلغ")} (${draft.currency})` : t("Amount", "المبلغ")} required error={errors.amount}>
        <input className="field-input mono" inputMode="decimal" value={draft.amount} placeholder="0.00" onChange={(event) => set("amount", event.target.value)} />
      </Field>
      <Field label={t("Branch", "الفرع")} required error={errors.branchId}>
        <select className="field-select" value={draft.branchId} onChange={(event) => changeBranch(event.target.value)}>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{lookups.branchName(branch.id)}</option>)}
        </select>
      </Field>
      <Field label={t("Date and time", "التاريخ والوقت")} required error={errors.effectiveAt}>
        <input className="field-input" type="datetime-local" value={draft.effectiveAt} onChange={(event) => set("effectiveAt", event.target.value)} />
      </Field>
    </FormSection>
    <FormSection title={t("Source and proof", "المصدر والدليل")}>
      <Field label={t("Method", "الطريقة")} required error={errors.sourceMethod}>
        <select className="field-select" value={draft.sourceMethod} onChange={(event) => set("sourceMethod", event.target.value)}>
          {methods.map((method) => <option key={method.value} value={method.value}>{sourceMethodLabel(method.value, lang)}</option>)}
        </select>
      </Field>
      <Field label={t("Receipt or reference no.", "رقم الإيصال أو المرجع")} required error={errors.sourceReference} hint={t("Must be unique for this method.", "يجب ألا يتكرر لنفس الطريقة.")}>
        <input className="field-input mono" value={draft.sourceReference} onChange={(event) => set("sourceReference", event.target.value)} />
      </Field>
      <Field label={t("Reason", "السبب")} required error={errors.reason} full>
        <input className="field-input" value={draft.reason} onChange={(event) => set("reason", event.target.value)} />
      </Field>
      <Field label={t("Evidence file or reference", "ملف أو مرجع الدليل")} required error={errors.evidence} full hint={t("Stored privately, never shown publicly.", "يُحفظ بشكل خاص ولا يُعرض علناً.")}>
        <input className="field-input mono" value={draft.evidence} placeholder="receipt-2026-0142" onChange={(event) => set("evidence", event.target.value)} />
      </Field>
    </FormSection>
    <Collapsible title={t("Link to a record (optional)", "ربط بسجل (اختياري)")} defaultOpen={false}>
      <FormSection title={t("Related records", "السجلات المرتبطة")} columns={1}>
        <Field label={t("Quote", "عرض السعر")}>
          <select className="field-select" value={quoteId} onChange={(event) => setQuoteId(event.target.value)}>
            <option value="">{t("None", "بدون")}</option>
            {quoteOptions.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
        </Field>
        <Field label={t("Job", "أمر الشغل")}>
          <select className="field-select" value={jobId} onChange={(event) => setJobId(event.target.value)}>
            <option value="">{t("None", "بدون")}</option>
            {jobOptions.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
        </Field>
        <Field label={t("Reservation", "الحجز المؤجل")}>
          <select className="field-select" value={reservationId} onChange={(event) => setReservationId(event.target.value)}>
            <option value="">{t("None", "بدون")}</option>
            {reservationOptions.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
        </Field>
      </FormSection>
    </Collapsible>
    {errors.definitionVersion && !noDefinition && <p className="field-error" role="alert">{errors.definitionVersion}</p>}
    {message && <p className="form-error" role="alert">{message}</p>}
  </form>;
}
