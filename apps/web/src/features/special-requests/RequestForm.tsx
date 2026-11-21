import { useState, type FormEvent } from "react";
import type { Locale } from "@garage/domain";
import { Field, FormSection, RequiredNote } from "../../shared/components";
import { useGarageStore } from "../../shared/store";
import { CustomerVehiclePicker } from "../customers/CustomerVehiclePicker";
import { createRequest, requestErrorMessage } from "./special-requests-api";
import { createPayload, emptyCreateForm, validateCreate, type CreateErrors, type CreateForm } from "./special-requests-logic";
import "./special-requests.css";

interface Props {
  lang: Locale;
  /** Preselect (and lock) the customer, e.g. when opened from Customer 360. */
  customerId?: string;
  vehicleId?: string;
  onCancel: () => void;
  onCreated: (id: string) => void;
}

/** Staff create a free-text special request on a customer's behalf. Vehicle, description and date are required. */
export function RequestForm({ lang, customerId, vehicleId, onCancel, onCreated }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const store = useGarageStore();
  const branches = store.state?.branches ?? [];
  const actor = store.actor;
  const allowed = actor?.role === "owner" ? branches : branches.filter((branch) => actor?.branchIds.includes(branch.id));
  const [form, setForm] = useState<CreateForm>({ ...emptyCreateForm(), customerId: customerId ?? "", vehicleId: vehicleId ?? "" });
  const [errors, setErrors] = useState<CreateErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) => setForm((previous) => ({ ...previous, [key]: value }));
  const message = (key: keyof CreateErrors) => (errors[key] === "required" ? t("Required", "مطلوب") : errors[key] === "range" ? t("End date is before the start date", "تاريخ النهاية قبل البداية") : undefined);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setFormError("");
    const found = validateCreate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const created = await createRequest(createPayload(form));
      onCreated(created.id);
    } catch (error) {
      setFormError(requestErrorMessage(error, lang));
    } finally {
      setSaving(false);
    }
  };

  return <form onSubmit={(event) => void submit(event)} noValidate>
    <FormSection title={t("Customer and vehicle", "العميل والمركبة")} columns={1}>
      {customerId && vehicleId
        ? null
        : <CustomerVehiclePicker lang={lang} required value={{ customerId: form.customerId, vehicleId: form.vehicleId }}
            onChange={(value) => setForm((previous) => ({ ...previous, ...value }))} allowAdd={false} />}
      {customerId && !vehicleId && <p className="form-hint">{t("Choose the vehicle the request is for.", "اختر المركبة المعنية بالطلب.")}</p>}
      {(errors.customerId || errors.vehicleId) && <p className="cust-form-error" role="alert">{t("Choose a customer and a vehicle.", "اختر العميل والمركبة.")}</p>}
    </FormSection>
    <FormSection title={t("Request", "الطلب")} columns={1}>
      <Field label={t("Title", "العنوان")} required error={message("title")}>
        <input className="field-input" maxLength={120} value={form.title} onChange={(event) => set("title", event.target.value)} data-autofocus />
      </Field>
      <Field label={t("What is requested", "تفاصيل الطلب")} required error={message("description")} hint={t("Describe the custom work in the customer's own words.", "اشرح العمل المطلوب بكلمات العميل.")}>
        <textarea className="field-textarea" rows={5} maxLength={4000} value={form.description} onChange={(event) => set("description", event.target.value)} />
      </Field>
    </FormSection>
    <FormSection title={t("When", "الموعد")} columns={2}>
      <Field label={t("Requested date", "التاريخ المطلوب")} required error={message("requestedFrom")}>
        <input className="field-input" type="date" dir="ltr" value={form.requestedFrom} onChange={(event) => set("requestedFrom", event.target.value)} />
      </Field>
      <Field label={t("Until (optional date range)", "حتى (نطاق تاريخ اختياري)")} error={message("requestedTo")}>
        <input className="field-input" type="date" dir="ltr" value={form.requestedTo} min={form.requestedFrom || undefined} onChange={(event) => set("requestedTo", event.target.value)} />
      </Field>
      <Field label={t("Preferred time or flexibility", "الوقت المفضل أو المرونة")} full>
        <input className="field-input" maxLength={300} value={form.preferredTimeNote} onChange={(event) => set("preferredTimeNote", event.target.value)} />
      </Field>
    </FormSection>
    <FormSection title={t("Optional", "اختياري")} columns={2}>
      {allowed.length > 0 && <Field label={t("Branch", "الفرع")}>
        <select className="field-select" value={form.branchId} onChange={(event) => set("branchId", event.target.value)}>
          <option value="">{t("Any branch", "أي فرع")}</option>
          {allowed.map((branch) => <option key={branch.id} value={branch.id}>{lang === "ar" && branch.nameAr ? branch.nameAr : branch.name}</option>)}
        </select>
      </Field>}
      <Field label={t("Budget note", "ملاحظة الميزانية")}>
        <input className="field-input" maxLength={300} value={form.budgetNote} onChange={(event) => set("budgetNote", event.target.value)} />
      </Field>
    </FormSection>
    <RequiredNote text={t("Required", "مطلوب")} />
    {formError && <p className="cust-form-error" role="alert">{formError}</p>}
    <div className="cust-form-actions">
      <button type="button" className="btn" onClick={onCancel}>{t("Cancel", "إلغاء")}</button>
      <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t("Saving…", "جارٍ الحفظ…") : t("Create request", "إنشاء الطلب")}</button>
    </div>
  </form>;
}
