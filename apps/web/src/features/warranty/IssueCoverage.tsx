import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { QuoteRevision } from "@garage/domain";
import { DetailDrawer, EmptyState, Field, FormSection, RequiredNote } from "../../shared/components";
import { quoteApi, warrantyAuthorityApi } from "../../shared/store";
import { reconcileWarrantyIssueDraft } from "../../shared/task-steps";
import { getWarrantyTaskPrerequisites, useWarrantyDraftState } from "./warranty-form-state";
import { branchAllowed, expiryPreview, policyDisplayName } from "./warranty-logic";
import type { WarrantyScope } from "./warranty-scope";

type RetiredOutcome = "approved" | "not-retired" | "missing-accepted-binding" | "owner-exception-required";

/** Drawer that issues coverage for a delivered job: policy, then job, then component/date. */
export function IssueCoverage({ scope, open, onClose }: { scope: WarrantyScope; open: boolean; onClose: () => void }) {
  const { t, lang, state, store, notify, canIssue, allowedBranches, warranties } = scope;
  const identity = { userId: scope.userId, dataset: scope.dataset };
  const [selection, setSelection, discardSelection] = useWarrantyDraftState(
    { ...identity, task: "issue", entityId: `selection:${state.currentBranch}`, version: 0 }, () => ({ policy: "" }),
  );
  const issuePolicy = selection.policy;
  const [fields, setFields, discardFields] = useWarrantyDraftState(
    { ...identity, task: "issue", entityId: `policy:${issuePolicy}:${state.currentBranch}`, version: Number(issuePolicy.split(":").at(-1)) || 0 },
    () => ({ job: "", component: "", date: "" }),
  );
  const issueJob = fields.job;
  const issueComponent = fields.component;
  const issueDate = fields.date;
  const [acceptedQuotes, setAcceptedQuotes] = useState<QuoteRevision[]>([]);
  const [quotesReady, setQuotesReady] = useState(false);
  const [retired, setRetired] = useState<{ key: string; outcome: RetiredOutcome } | null>(null);
  const [error, setError] = useState("");
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    if (!canIssue || !open) return;
    let active = true;
    setQuotesReady(false);
    void quoteApi.list().then((revisions) => {
      if (active) { setAcceptedQuotes(revisions.filter((revision) => revision.state === "accepted")); setQuotesReady(true); }
    }).catch(() => { if (active) { setAcceptedQuotes([]); setQuotesReady(false); } });
    return () => { active = false; };
  }, [canIssue, open, scope.userId, scope.dataset]);

  const bookingOf = (jobId: string) => {
    const job = state.jobs.find((item) => item.id === jobId);
    return state.bookings.find((booking) => booking.id === job?.bookingId);
  };
  const issuable = state.warrantyPolicies.filter((policy) => policy.status === "published" || policy.status === "retired");
  const deliveredEligibleJobs = useMemo(() => !canIssue ? [] : state.jobs.filter((job) =>
    job.stage === "delivered" && branchAllowed(state, job.branchId, allowedBranches) &&
    state.warrantyPolicies.some((policy) => {
      const sold = Boolean(bookingOf(job.id)?.acceptedQuoteRef);
      return (policy.status === "published" || (policy.status === "retired" && sold)) &&
        policy.eligibleServiceIds.includes(job.serviceId) &&
        (sold || !warranties.some((record) => record.jobId === job.id && record.policyId === policy.policyId));
    })), [canIssue, state.jobs, state.bookings, state.warrantyPolicies, state.currentBranch, warranties, allowedBranches]);

  const policy = state.warrantyPolicies.find((item) => `${item.policyId}:${item.version}` === issuePolicy);
  const job = state.jobs.find((item) => item.id === issueJob);
  const booking = bookingOf(issueJob);
  const quote = acceptedQuotes.find((item) => item.ref.quoteId === booking?.acceptedQuoteRef?.quoteId && item.ref.revision === booking?.acceptedQuoteRef?.revision);
  const bound = quote?.input.warrantyBindings.filter((binding) =>
    binding.policy.id === policy?.policyId && binding.policy.version === policy?.version &&
    quote.input.work.some((component) => component.id === binding.componentId && component.serviceId === job?.serviceId)) ?? [];
  const authorityKey = `${scope.userId}:${scope.dataset}:${issueJob}:${issueComponent}:${issuePolicy}`;
  useEffect(() => {
    if (policy?.status !== "retired" || !issueJob || !issueComponent) return;
    let active = true;
    void warrantyAuthorityApi.retired({ jobId: issueJob, componentId: issueComponent, policyId: policy.policyId, policyVersion: policy.version })
      .then((result) => { if (active) setRetired({ key: authorityKey, outcome: result.outcome }); })
      .catch(() => { if (active) setRetired({ key: authorityKey, outcome: "owner-exception-required" }); });
    return () => { active = false; };
  }, [authorityKey, policy?.status]);
  const retiredOutcome = retired?.key === authorityKey ? retired.outcome : null;
  const prerequisites = getWarrantyTaskPrerequisites({
    state, policy, jobId: issueJob, componentId: issueComponent || undefined, canIssue, allowedBranches, pending: issuing,
    componentIds: booking?.acceptedQuoteRef ? bound.map((binding) => binding.componentId) : undefined,
    retiredBinding: policy?.status === "retired" && bound.length > 0 && retiredOutcome === "approved",
  });
  const eligibleJobs = policy
    ? deliveredEligibleJobs.filter((item) => policy.eligibleServiceIds.includes(item.serviceId) &&
      (Boolean(bookingOf(item.id)?.acceptedQuoteRef) || !warranties.some((record) => record.jobId === item.id && record.policyId === policy.policyId)))
    : deliveredEligibleJobs;

  const sold = Boolean(booking?.acceptedQuoteRef);
  const blocked = issuing ? t("Issuing…", "جارٍ الإصدار…")
    : !issuable.length ? t("The Owner must publish a policy first.", "يجب أن ينشر المالك سياسة أولاً.")
    : !deliveredEligibleJobs.length ? t("No eligible delivered job in your branches.", "لا توجد أوامر شغل مسلّمة ومؤهلة في فروعك.")
    : !policy ? t("Choose a policy.", "اختر السياسة.")
    : !issueJob ? t("Choose a delivered job.", "اختر أمر شغل مسلّماً.")
    : !eligibleJobs.some((item) => item.id === issueJob) ? t("This job is not eligible or already has this coverage.", "أمر الشغل غير مؤهل أو لديه هذه التغطية.")
    : sold && !quotesReady ? t("Accepted quote data is unavailable. Reopen to refresh.", "بيانات العرض المقبول غير متاحة. أعد الفتح للتحديث.")
    : sold && !bound.length ? t("The accepted quote has no matching component for this policy version. Owner review is needed.", "العرض المقبول بلا مكوّن مطابق لهذا الإصدار. يلزم مراجعة المالك.")
    : sold && !issueComponent ? t("Choose the component.", "اختر المكوّن.")
    : sold && !bound.some((binding) => binding.componentId === issueComponent) ? t("Choose the component again.", "اختر المكوّن مجدداً.")
    : policy.status === "retired" && retiredOutcome === null ? t("Checking issuance authority…", "جارٍ التحقق من صلاحية الإصدار…")
    : policy.status === "retired" && retiredOutcome === "missing-accepted-binding" ? t("This retired version has no matching accepted component.", "هذا الإصدار المتقاعد بلا مكوّن مقبول مطابق.")
    : policy.status === "retired" && retiredOutcome !== "approved" ? t("Owner exception required for this retired version.", "يلزم استثناء من المالك لهذا الإصدار المتقاعد.")
    : prerequisites.reasons.includes("duplicate") ? t("Coverage already exists for this component and policy.", "توجد تغطية لهذا المكوّن والسياسة.")
    : policy.startRule === "owner-selected-date" && !issueDate ? t("Enter the coverage start date.", "أدخل تاريخ بداية التغطية.")
    : "";

  const policyLabel = (p: (typeof issuable)[number]) => `${policyDisplayName(p.name)} · v${p.version}${p.status === "retired" ? ` · ${t("Retired", "متقاعد")}` : ""}`;
  const jobLabel = (j: (typeof state.jobs)[number]) => `${scope.customerName(j.customerId)} · ${scope.vehicleOf(j.customerId, j.vehicleId)?.plate ?? "—"} · ${scope.serviceName(j.serviceId)}`;
  const componentLabel = (componentId: string, index: number) => {
    const work = quote?.input.work.find((component) => component.id === componentId);
    return `${work ? scope.serviceName(work.serviceId) : t("Component", "مكوّن")} ${index + 1}`;
  };

  const reset = () => { discardFields(); discardSelection(); setError(""); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!policy || !job || blocked || (policy.startRule === "owner-selected-date" && !issueDate)) {
      setError(t("Complete the required fields.", "أكمل الحقول المطلوبة."));
      return;
    }
    setIssuing(true); setError("");
    const result = await store.issueWarranty({
      policyId: policy.policyId, policyVersion: policy.version, jobId: job.id, componentId: issueComponent || null,
      ...(policy.startRule === "owner-selected-date" ? { startDate: issueDate } : {}),
    });
    setIssuing(false);
    if (!result.ok) { setError(scope.error(result.error)); return; }
    reset();
    onClose();
    notify(t("Coverage issued.", "صدرت التغطية."));
  };

  return <DetailDrawer open={open} onClose={onClose} lang={lang} title={t("Issue coverage", "إصدار تغطية")}
    subtitle={t("For a delivered job", "لأمر شغل تم تسليمه")}
    footer={<>
      <button className="btn" type="button" disabled={issuing} onClick={reset}>{t("Clear", "مسح")}</button>
      <button className="btn btn-primary" type="submit" form="w-issue-form" disabled={Boolean(blocked)} aria-describedby={blocked ? "w-issue-block" : undefined}>
        {issuing ? t("Issuing…", "جارٍ الإصدار…") : t("Issue coverage", "إصدار التغطية")}
      </button>
    </>}>
    {!issuable.length || !deliveredEligibleJobs.length
      ? <EmptyState title={blocked || t("Nothing to issue", "لا شيء للإصدار")} />
      : <form id="w-issue-form" onSubmit={(event) => void submit(event)}>
        <RequiredNote text={t("Required", "مطلوب")} />
        <FormSection title={t("1. Policy", "١. السياسة")} columns={1}>
          <Field label={t("Policy version", "إصدار السياسة")} required>
            <select className="field-select" value={issuePolicy} onChange={(event) => {
              setSelection({ policy: event.target.value }); setError("");
            }}>
              <option value="">{t("Choose…", "اختر…")}</option>
              {issuable.map((p) => <option key={`${p.policyId}:${p.version}`} value={`${p.policyId}:${p.version}`}>{policyLabel(p)}</option>)}
            </select>
          </Field>
        </FormSection>
        {policy && <FormSection title={t("2. Delivered job", "٢. أمر الشغل المسلّم")} columns={1}>
          <Field label={t("Job", "أمر الشغل")} required>
            <select className="field-select" value={issueJob} onChange={(event) => {
              const next = event.target.value;
              setFields((current) => reconcileWarrantyIssueDraft(current, { ...current, job: next })); setError("");
            }}>
              <option value="">{t("Choose…", "اختر…")}</option>
              {eligibleJobs.map((item) => <option key={item.id} value={item.id}>{jobLabel(item)}</option>)}
            </select>
          </Field>
        </FormSection>}
        {policy && job && (sold || policy.startRule === "owner-selected-date") && <FormSection title={t("3. Details", "٣. التفاصيل")} columns={1}>
          {sold && <Field label={t("Quoted component", "المكوّن المسعّر")} required>
            <select className="field-select" value={issueComponent} onChange={(event) => { setFields((current) => ({ ...current, component: event.target.value })); setError(""); }}>
              <option value="">{t("Choose…", "اختر…")}</option>
              {bound.map((binding, index) => <option key={binding.componentId} value={binding.componentId}>{componentLabel(binding.componentId, index)}</option>)}
            </select>
          </Field>}
          {policy.startRule === "owner-selected-date" && <Field label={t("Coverage start", "بداية التغطية")} required
            hint={issueDate ? (policy.coverageKind === "lifetime" ? t("Lifetime, no fixed end", "مدى الحياة بلا نهاية محددة")
              : `${t("Ends", "تنتهي")} ${policy.durationMonths ? expiryPreview(issueDate, policy.durationMonths) || "—" : "—"}`) : undefined}>
            <input className="field-input" type="date" value={issueDate} onChange={(event) => setFields((current) => ({ ...current, date: event.target.value }))} />
          </Field>}
        </FormSection>}
        {error && <div className="form-error" role="alert">{error}</div>}
        {blocked && policy && <p className="form-hint" id="w-issue-block" role="status">{blocked}</p>}
      </form>}
  </DetailDrawer>;
}
