import { useState, type FormEvent } from "react";
import type { Locale } from "@garage/domain";
import { Field, FormSection, RequiredNote } from "../../shared/components";
import { unknownWriteOutcomeCopy } from "../../shared/store";
import { formatPlateDisplay, validateCustomerForm, type CustomerFormErrors } from "./customers-logic";
import "./customers.css";

export interface CustomerFormValues {
  name: string;
  phone: string;
  plate: string;
  makeModel: string;
  language: Locale;
  branchId: string;
}

export interface BranchOption { id: string; label: string }

const errorCopy: Record<string, { en: string; ar: string }> = {
  INVALID_CUSTOMER: { en: "Check the customer and vehicle details.", ar: "راجع بيانات العميل والمركبة." },
  INVALID_PHONE: { en: "Enter a phone number with 8 to 15 digits.", ar: "أدخل رقم هاتف من 8 إلى 15 رقماً." },
  DUPLICATE_PHONE: { en: "A customer with this phone number already exists.", ar: "يوجد عميل مسجل بهذا الرقم." },
  DUPLICATE_PLATE: { en: "A vehicle with this plate already exists.", ar: "توجد مركبة مسجلة بنفس اللوحة." },
  FORBIDDEN: { en: "You cannot add customers to this branch.", ar: "لا يمكنك إضافة عملاء لهذا الفرع." },
  ROLE_FORBIDDEN: { en: "Your role cannot make this change.", ar: "صلاحيتك لا تسمح بهذا التغيير." },
};

/** Maps a server/store error code to a short bilingual message (never the raw code). */
export function writeErrorMessage(code: string, lang: Locale, unsupported = false): string {
  if (unsupported) return lang === "ar" ? "هذا الإجراء غير متاح على الخادم بعد." : "This action is not available on the server yet.";
  const unknown = unknownWriteOutcomeCopy(code, lang);
  if (unknown) return unknown;
  const copy = errorCopy[code];
  if (copy) return lang === "ar" ? copy.ar : copy.en;
  return lang === "ar" ? "تعذر حفظ السجل." : "The record could not be saved.";
}

const fieldCopy = {
  en: { required: "Required", phone: "Use 8 to 15 digits", plate: "Use 1 to 4 letters and 1 to 6 digits" },
  ar: { required: "مطلوب", phone: "استخدم من 8 إلى 15 رقماً", plate: "استخدم من 1 إلى 4 حروف ومن 1 إلى 6 أرقام" },
};

interface CustomerFormProps {
  lang: Locale;
  /** create: customer + first vehicle (+ branch). edit: customer only. vehicle: plate + model only. */
  mode: "create" | "edit" | "vehicle";
  initial?: Partial<CustomerFormValues>;
  /** Branches the actor may use; the select is shown when more than one is available. */
  branches?: BranchOption[];
  defaultBranchId?: string;
  submitLabel?: string;
  onSubmit: (values: CustomerFormValues) => Promise<string | null>;
  onCancel: () => void;
}

export function CustomerForm({ lang, mode, initial, branches = [], defaultBranchId, submitLabel, onSubmit, onCancel }: CustomerFormProps) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [values, setValues] = useState<CustomerFormValues>({
    name: initial?.name ?? "", phone: initial?.phone ?? "", plate: initial?.plate ?? "", makeModel: initial?.makeModel ?? "",
    language: initial?.language ?? lang, branchId: initial?.branchId ?? defaultBranchId ?? branches[0]?.id ?? "",
  });
  const [errors, setErrors] = useState<CustomerFormErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) => setValues((previous) => ({ ...previous, [key]: value }));
  const withCustomer = mode !== "vehicle";
  const withVehicle = mode !== "edit";
  const message = (key: keyof CustomerFormErrors) => (errors[key] ? fieldCopy[lang][errors[key]!] : undefined);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation(); // the form may render in a portal under another module's form
    setFormError("");
    const found = validateCustomerForm(
      withCustomer ? values : { ...values, name: "x", phone: "00000000" },
      { vehicle: withVehicle },
    );
    setErrors(found);
    if (Object.keys(found).length) return;
    if (mode === "create" && !values.branchId) { setFormError(t("Choose a branch.", "اختر الفرع.")); return; }
    setSaving(true);
    const failure = await onSubmit(values);
    setSaving(false);
    if (failure) setFormError(failure);
  };

  return <form onSubmit={(event) => void submit(event)} noValidate>
    {withCustomer && <FormSection title={t("Customer", "العميل")} columns={2}>
      <Field label={t("Name", "الاسم")} required error={message("name")}>
        <input className="field-input" maxLength={120} autoComplete="name" value={values.name} onChange={(event) => set("name", event.target.value)} data-autofocus />
      </Field>
      <Field label={t("Phone", "الهاتف")} required error={message("phone")}>
        <input className="field-input mono" dir="ltr" type="tel" inputMode="tel" autoComplete="tel" placeholder="+20…" value={values.phone} onChange={(event) => set("phone", event.target.value)} />
      </Field>
      <Field label={t("Language", "اللغة")}>
        <select className="field-select" value={values.language} onChange={(event) => set("language", event.target.value as Locale)}>
          <option value="ar">{t("Arabic", "العربية")}</option><option value="en">{t("English", "الإنجليزية")}</option>
        </select>
      </Field>
      {mode === "create" && branches.length > 0 && <Field label={t("Branch", "الفرع")} required>
        <select className="field-select" value={values.branchId} onChange={(event) => set("branchId", event.target.value)} disabled={branches.length === 1}>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}</option>)}
        </select>
      </Field>}
    </FormSection>}
    {withVehicle && <FormSection title={mode === "vehicle" ? t("Vehicle", "المركبة") : t("First vehicle", "المركبة الأولى")} columns={2}>
      <Field label={t("Plate", "اللوحة")} required error={message("plate")} hint={values.plate.trim() ? `${t("Saved as", "ستُحفظ كـ")} ${formatPlateDisplay(values.plate, { isolate: true })}` : t("Arabic or Latin letters, any digits", "حروف عربية أو لاتينية وأي أرقام")}>
        <input className="field-input mono" dir="auto" maxLength={20} autoCapitalize="characters" autoComplete="off" value={values.plate} onChange={(event) => set("plate", event.target.value)} data-autofocus={mode === "vehicle" ? true : undefined} />
      </Field>
      <Field label={t("Make and model", "الماركة والموديل")} required error={message("makeModel")}>
        <input className="field-input" maxLength={100} placeholder={t("Toyota Corolla 2022", "تويوتا كورولا 2022")} value={values.makeModel} onChange={(event) => set("makeModel", event.target.value)} />
      </Field>
    </FormSection>}
    <RequiredNote text={t("Required", "مطلوب")} />
    {formError && <p className="cust-form-error" role="alert">{formError}</p>}
    <div className="cust-form-actions">
      <button type="button" className="btn" onClick={onCancel}>{t("Cancel", "إلغاء")}</button>
      <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t("Saving…", "جارٍ الحفظ…") : submitLabel ?? t("Save", "حفظ")}</button>
    </div>
  </form>;
}
