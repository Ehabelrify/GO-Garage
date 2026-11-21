import { useState } from "react";
import type { WarrantyVerificationField } from "@garage/domain";
import { Notice } from "../../shared/components";
import { useWarrantyDraftState } from "./warranty-form-state";
import type { WarrantyScope } from "./warranty-scope";

const fields: { key: WarrantyVerificationField; en: string; ar: string }[] = [
  { key: "service", en: "Service", ar: "الخدمة" },
  { key: "status", en: "Coverage status", ar: "حالة التغطية" },
  { key: "startDate", en: "Start date", ar: "تاريخ البداية" },
  { key: "expiresOn", en: "Expiry date", ar: "تاريخ الانتهاء" },
  { key: "branch", en: "Branch", ar: "الفرع" },
  { key: "coverage", en: "Coverage wording", ar: "صياغة التغطية" },
];

/** Owner switch plus the fields a customer may see after scanning a QR code. Never exposes names, plates or job data. */
export function VerificationSettings({ scope }: { scope: WarrantyScope }) {
  const { t, lang, state, store, notify } = scope;
  const saved = state.warrantyVerificationSettings;
  const [draft, setDraft, discard] = useWarrantyDraftState(
    { userId: scope.userId, dataset: scope.dataset, task: "verification", entityId: "public-settings", version: 0 },
    () => ({ enabled: saved?.enabled ?? false, fields: saved?.approvedFields ?? ([] as WarrantyVerificationField[]) }),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const missing = draft.enabled && (!draft.fields.includes("service") || !draft.fields.includes("status"));
  const dirty = draft.enabled !== (saved?.enabled ?? false) ||
    [...draft.fields].sort().join() !== [...(saved?.approvedFields ?? [])].sort().join();

  const save = async () => {
    if (!scope.isOwner || saving || missing) return;
    setSaving(true); setError("");
    const result = await store.updateWarrantyVerificationSettings({ enabled: draft.enabled, approvedFields: draft.fields });
    setSaving(false);
    if (!result.ok) { setError(scope.error(result.error)); return; }
    discard();
    notify(t("Verification settings saved.", "حُفظت إعدادات التحقق."));
  };

  return <section className="w-settings" aria-label={t("Public verification", "التحقق العام")}>
    <div className="w-settings-head">
      <div><h3>{t("Public verification", "التحقق العام")}</h3>
        <p className="form-hint">{t("Customers see only the fields you tick. Never names, plates or job data.", "يرى العميل الحقول المحددة فقط. لا أسماء ولا لوحات ولا بيانات شغل.")}</p></div>
      <label className="w-switch"><input type="checkbox" checked={draft.enabled} disabled={!scope.isOwner}
        onChange={(event) => setDraft((c) => ({ ...c, enabled: event.target.checked }))} />
        <span>{draft.enabled ? t("On", "مفعّل") : t("Off", "متوقف")}</span></label>
    </div>
    <fieldset className="w-fields" disabled={!draft.enabled || !scope.isOwner}>
      <legend className="sr-only">{t("Fields customers may see", "الحقول الظاهرة للعميل")}</legend>
      {fields.map((field) => <label key={field.key}>
        <input type="checkbox" checked={draft.fields.includes(field.key)}
          onChange={(event) => setDraft((c) => ({ ...c, fields: event.target.checked ? [...c.fields, field.key] : c.fields.filter((k) => k !== field.key) }))} />
        <span>{lang === "ar" ? field.ar : field.en}</span></label>)}
    </fieldset>
    {missing && <Notice>{t("Service and coverage status are required.", "الخدمة وحالة التغطية مطلوبتان.")}</Notice>}
    {error && <div className="form-error" role="alert">{error}</div>}
    {scope.isOwner && <div className="form-actions">
      <button className="btn" type="button" disabled={saving || !dirty} onClick={discard}>{t("Reset", "إعادة ضبط")}</button>
      <button className="btn btn-primary" type="button" disabled={saving || missing || !dirty} onClick={() => void save()}>{saving ? t("Saving…", "جارٍ الحفظ…") : t("Save", "حفظ")}</button>
    </div>}
  </section>;
}
