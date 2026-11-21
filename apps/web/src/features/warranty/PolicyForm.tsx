import { useState, type FormEvent } from "react";
import { DetailDrawer, Field, FormSection, RequiredNote } from "../../shared/components";
import type { WarrantyPolicy, LifetimeDefinition } from "@garage/domain";
import { useWarrantyDraftState } from "./warranty-form-state";
import { buildPolicyInput, freshPolicyForm, policyFormFrom, type PolicyFormState } from "./warranty-logic";
import type { WarrantyScope } from "./warranty-scope";

const lifetimeText: Array<[keyof PolicyFormState, string, string]> = [
  ["lifetimeSubjectDefinition", "Subject definition", "تعريف الموضوع"],
  ["lifetimeTerminationConditions", "Termination conditions", "شروط الانتهاء"],
  ["lifetimeTransferRule", "Transfer rule", "قاعدة النقل"],
  ["lifetimeMaintenanceConditions", "Maintenance conditions", "شروط الصيانة"],
  ["lifetimeIssuer", "Issuer", "جهة الإصدار"],
  ["lifetimeRemedy", "Remedy", "المعالجة"],
  ["lifetimePublicEn", "Public wording (English)", "الصياغة العامة (إنجليزي)"],
  ["lifetimePublicAr", "Public wording (Arabic)", "الصياغة العامة (عربي)"],
  ["lifetimeEvidenceRef", "Approval evidence reference", "مرجع إثبات الموافقة"],
  ["lifetimeApprovalReason", "Approval reason", "سبب الموافقة"],
];

/** Drawer to create or edit a draft policy. `editing` null starts a new one; `source` copies terms into a new draft. */
export function PolicyForm({ scope, open, editing, template, onClose }: {
  scope: WarrantyScope; open: boolean; editing: WarrantyPolicy | null; template: boolean; onClose: () => void;
}) {
  const { t, lang, state, store, notify } = scope;
  const [form, setForm, discard] = useWarrantyDraftState<PolicyFormState>(
    { userId: scope.userId, dataset: scope.dataset, task: "policy", entityId: editing?.policyId ?? "new", version: editing?.version ?? 0 },
    () => editing ? policyFormFrom(editing) : freshPolicyForm(),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<PolicyFormState>) => setForm({ ...form, ...patch });
  const lifetime = form.coverageKind === "lifetime";
  const hold = template ? t("Not set", "غير محدد") : "";
  const canSave = !saving && form.name.trim() && form.eligibleServiceIds.length > 0 && (!form.autoIssue || form.startRule === "job-delivery");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!scope.isOwner || saving) return;
    if (editing && !state.warrantyPolicies.some((p) => p.policyId === editing.policyId && p.version === editing.version && p.status === "draft")) {
      setError(t("This draft changed or is locked. Reopen it.", "تغيّرت المسودة أو أُغلقت. أعد فتحها."));
      return;
    }
    setSaving(true); setError("");
    const input = buildPolicyInput(form, editing?.version);
    const result = editing
      ? await store.updateWarrantyPolicy(editing.policyId, editing.version, {
        name: input.name, eligibleServiceIds: input.eligibleServiceIds, autoIssue: input.autoIssue, startRule: input.startRule,
        durationMonths: input.durationMonths, coverageKind: input.coverageKind, lifetimeDefinition: input.lifetimeDefinition,
        exclusions: input.exclusions, evidenceRequirements: input.evidenceRequirements, reviewRole: input.reviewRole, responseDays: input.responseDays,
      })
      : await store.createWarrantyPolicy(input);
    setSaving(false);
    if (!result.ok) { setError(scope.error(result.error)); return; }
    discard();
    onClose();
    notify(t("Draft saved.", "حُفظت المسودة."));
  };
  const cancel = () => { discard(); setError(""); onClose(); };

  const title = editing ? t("Edit draft", "تعديل المسودة") : form.policyId ? t("New policy version", "إصدار جديد للسياسة") : t("New policy", "سياسة جديدة");
  return <DetailDrawer open={open} onClose={onClose} lang={lang} wide title={title}
    subtitle={template ? t("Outline only. Nothing is approved.", "مخطط فقط. لا شيء معتمد.") : undefined}
    footer={<>
      <button className="btn" type="button" onClick={cancel}>{t("Discard", "تجاهل")}</button>
      <button className="btn btn-primary" type="submit" form="w-policy-form" disabled={!canSave}>{saving ? t("Saving…", "جارٍ الحفظ…") : t("Save draft", "حفظ المسودة")}</button>
    </>}>
    <form id="w-policy-form" onSubmit={(event) => void save(event)}>
      <RequiredNote text={t("Required", "مطلوب")} />
      <FormSection title={t("Basics", "الأساسيات")}>
        <Field label={t("Name", "الاسم")} required full><input className="field-input" maxLength={120} value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label={t("Coverage", "نوع التغطية")}>
          <select className="field-select" value={form.coverageKind} onChange={(e) => set({ coverageKind: e.target.value as "fixed" | "lifetime", lifetimeApproved: false })}>
            <option value="fixed">{t("Fixed term", "مدة محددة")}</option><option value="lifetime">{t("Lifetime", "مدى الحياة")}</option>
          </select>
        </Field>
        {!lifetime && <Field label={t("Months", "الأشهر")} required><input className="field-input" type="number" min="1" max="120" placeholder={hold} value={form.durationMonths} onChange={(e) => set({ durationMonths: e.target.value })} /></Field>}
        <Field label={t("Starts", "تبدأ")} required>
          <select className="field-select" value={form.startRule} onChange={(e) => set({ startRule: e.target.value as PolicyFormState["startRule"] })}>
            <option value="">{t("Choose…", "اختر…")}</option>
            <option value="job-delivery">{t("Job delivery date", "تاريخ تسليم الشغل")}</option>
            <option value="owner-selected-date">{t("Date chosen at issue", "تاريخ يحدد عند الإصدار")}</option>
          </select>
        </Field>
        <Field label={t("Reply within (days)", "الرد خلال (أيام)")} required><input className="field-input" type="number" min="1" max="365" placeholder={hold} value={form.responseDays} onChange={(e) => set({ responseDays: e.target.value })} /></Field>
        <Field label={t("Claims reviewed by", "يراجع المطالبات")} required>
          <select className="field-select" value={form.reviewRole} onChange={(e) => set({ reviewRole: e.target.value as PolicyFormState["reviewRole"] })}>
            <option value="">{t("Choose…", "اختر…")}</option>
            <option value="owner">{t("Owner only", "المالك فقط")}</option><option value="branch-manager">{t("Owner or branch manager", "المالك أو مدير الفرع")}</option>
          </select>
        </Field>
      </FormSection>
      <FormSection title={t("Eligible services", "الخدمات المؤهلة")} columns={1}>
        {state.services.length ? <div className="w-checklist" role="group" aria-label={t("Eligible services", "الخدمات المؤهلة")}>{state.services.map((service) => <label key={service.id}>
          <input type="checkbox" checked={form.eligibleServiceIds.includes(service.id)} onChange={(e) => set({
            eligibleServiceIds: e.target.checked ? [...form.eligibleServiceIds, service.id] : form.eligibleServiceIds.filter((id) => id !== service.id) })} />
          <span>{scope.serviceName(service.id)}</span></label>)}</div>
          : <p className="form-hint">{t("No services configured yet.", "لم تُضبط خدمات بعد.")}</p>}
        <label className="w-check"><input type="checkbox" checked={form.autoIssue} onChange={(e) => set({ autoIssue: e.target.checked })} />
          <span>{t("Issue automatically on delivery", "إصدار تلقائي عند التسليم")}</span></label>
        {form.autoIssue && form.startRule !== "job-delivery" && <div className="field-error" role="alert">{t("Automatic issue needs the delivery date start.", "الإصدار التلقائي يتطلب البدء من تاريخ التسليم.")}</div>}
      </FormSection>
      <FormSection title={t("Terms", "الشروط")} columns={1}>
        <Field label={t("Exclusions", "الاستثناءات")} required><textarea className="field-textarea" maxLength={3000} placeholder={hold} value={form.exclusions} onChange={(e) => set({ exclusions: e.target.value })} /></Field>
        <Field label={t("Evidence needed for a claim", "الأدلة المطلوبة للمطالبة")} required><textarea className="field-textarea" maxLength={3000} placeholder={hold} value={form.evidenceRequirements} onChange={(e) => set({ evidenceRequirements: e.target.value })} /></Field>
      </FormSection>
      {lifetime && <FormSection title={t("Lifetime definition", "تعريف مدى الحياة")} columns={1}>
        <Field label={t("Subject", "الموضوع")}>
          <select className="field-select" value={form.lifetimeSubject} onChange={(e) => set({ lifetimeSubject: e.target.value as LifetimeDefinition["subject"], lifetimeApproved: false })}>
            {([["purchaser", "Purchaser", "المشتري"], ["vehicle", "Vehicle", "المركبة"], ["ownership", "Ownership", "الملكية"], ["product", "Product", "المنتج"], ["other", "Other", "أخرى"]] as const)
              .map(([value, en, ar]) => <option key={value} value={value}>{t(en, ar)}</option>)}
          </select>
        </Field>
        {lifetimeText.map(([key, en, ar]) => <Field key={key} label={t(en, ar)}>
          <textarea className="field-textarea" value={String(form[key])} onChange={(e) => set({ [key]: e.target.value, lifetimeApproved: false } as Partial<PolicyFormState>)} /></Field>)}
        <label className="w-check"><input type="checkbox" checked={form.lifetimeApproved} onChange={(e) => set({ lifetimeApproved: e.target.checked })} />
          <span>{t("I am the Owner and approve this definition.", "أنا المالك وأعتمد هذا التعريف.")}</span></label>
      </FormSection>}
      {error && <div className="form-error" role="alert">{error}</div>}
    </form>
  </DetailDrawer>;
}
