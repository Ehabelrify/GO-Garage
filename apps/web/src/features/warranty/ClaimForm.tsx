import { useEffect, useState, type FormEvent } from "react";
import { DetailDrawer, Field, FormSection, RequiredNote } from "../../shared/components";
import { useWarrantyDraftState } from "./warranty-form-state";
import { branchAllowed, policyDisplayName, policyForWarranty } from "./warranty-logic";
import type { WarrantyScope } from "./warranty-scope";

/** Drawer to open a claim. `warrantyId` preselects the coverage; otherwise staff pick one by customer and plate. */
export function ClaimForm({ scope, open, warrantyId, onClose, onDone }: {
  scope: WarrantyScope; open: boolean; warrantyId: string; onClose: () => void; onDone: () => void;
}) {
  const { t, lang, state, store, notify } = scope;
  const identity = { userId: scope.userId, dataset: scope.dataset };
  const [selection, setSelection] = useWarrantyDraftState(
    { ...identity, task: "claim", entityId: `selection:${state.currentBranch}`, version: 0 }, () => ({ warrantyId: "" }),
  );
  useEffect(() => { if (open && warrantyId) setSelection({ warrantyId }); }, [open, warrantyId]);
  const chosenId = selection.warrantyId;
  const record = state.warranties.find((item) => item.id === chosenId);
  const [fields, setFields, discard] = useWarrantyDraftState(
    { ...identity, task: "claim", entityId: chosenId || "none", version: record?.policyVersion ?? 0 },
    () => ({ summary: "", evidence: "" }),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const policy = record ? policyForWarranty(state, record) : undefined;
  const choices = scope.warranties.filter((item) => item.status !== "void");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!record || !fields.summary.trim() || saving) return;
    if (record.status === "void" || !branchAllowed(state, record.branchId, scope.allowedBranches)) {
      setError(t("This coverage is no longer available in your branches.", "هذه التغطية لم تعد متاحة في فروعك."));
      return;
    }
    setSaving(true); setError("");
    const result = await store.openWarrantyClaim({ warrantyId: record.id, summary: fields.summary.trim(), evidence: fields.evidence.trim() });
    setSaving(false);
    if (!result.ok) { setError(scope.error(result.error)); return; }
    discard(); setSelection({ warrantyId: "" });
    onDone();
    notify(t("Claim sent for review.", "أُرسلت المطالبة للمراجعة."));
  };
  const cancel = () => { discard(); setError(""); onClose(); };

  return <DetailDrawer open={open} onClose={onClose} lang={lang} title={t("Open claim", "فتح مطالبة")}
    footer={<>
      <button className="btn" type="button" onClick={cancel}>{t("Cancel", "إلغاء")}</button>
      <button className="btn btn-primary" type="submit" form="w-claim-form" disabled={saving || !record || fields.summary.trim().length < 5 || fields.evidence.trim().length < 5}>
        {saving ? t("Sending…", "جارٍ الإرسال…") : t("Submit claim", "إرسال المطالبة")}
      </button>
    </>}>
    <form id="w-claim-form" onSubmit={(event) => void submit(event)}>
      <RequiredNote text={t("Required", "مطلوب")} />
      <FormSection title={t("Coverage", "التغطية")} columns={1}>
        <Field label={t("Warranty", "الضمان")} required>
          <select className="field-select" value={chosenId} onChange={(event) => { setSelection({ warrantyId: event.target.value }); setError(""); }}>
            <option value="">{t("Choose…", "اختر…")}</option>
            {choices.map((item) => <option key={item.id} value={item.id}>
              {scope.customerName(item.customerId)} · {scope.vehicleOf(item.customerId, item.vehicleId)?.plate ?? "—"} · {policyDisplayName(item.policyName)}
            </option>)}
          </select>
        </Field>
      </FormSection>
      <FormSection title={t("Issue", "المشكلة")} columns={1}>
        <Field label={t("What is the issue?", "ما المشكلة؟")} required>
          <textarea className="field-textarea" minLength={5} maxLength={2000} value={fields.summary} onChange={(event) => setFields((c) => ({ ...c, summary: event.target.value }))} />
        </Field>
        <Field label={t("Supporting details", "تفاصيل داعمة")} required hint={policy ? `${t("Policy asks for", "السياسة تطلب")}: ${policy.evidenceRequirements}` : undefined}>
          <textarea className="field-textarea" minLength={5} maxLength={3000} value={fields.evidence} onChange={(event) => setFields((c) => ({ ...c, evidence: event.target.value }))} />
        </Field>
      </FormSection>
      <p className="form-hint">{t("Files can be attached once the claim is open.", "يمكن إرفاق الملفات بعد فتح المطالبة.")}</p>
      {error && <div className="form-error" role="alert">{error}</div>}
    </form>
  </DetailDrawer>;
}
