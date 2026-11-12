import { useState, type FormEvent } from "react";
import { Plus, Search, ShieldAlert } from "lucide-react";
import { useGarageStore } from "../store";
import type { Locale } from "../types";
import { customerDisplay, EmptyState, PageHeading, type PageProps } from "../ui";

interface CustomerForm {
  name: string;
  phone: string;
  plate: string;
  makeModel: string;
  language: Locale;
}

export function CustomersPage({ lang, t, state, notify }: PageProps) {
  const store = useGarageStore();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CustomerForm>({ name: "", phone: "", plate: "", makeModel: "", language: lang });
  const rows = state.customers.filter((customer) =>
    `${customer.name} ${customer.phone} ${customer.vehicles.map((vehicle) => `${vehicle.plate} ${vehicle.makeModel}`).join(" ")}`.toLowerCase().includes(query.toLowerCase()));

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const result = store.createCustomer(form);
    if (result.ok) {
      setShowForm(false);
      setForm({ name: "", phone: "", plate: "", makeModel: "", language: lang });
      notify(t("Sample customer and vehicle added on this device.", "تمت إضافة عميل ومركبة تجريبيين على هذا الجهاز."));
      return;
    }
    const errors: Record<string, string> = {
      required: t("Complete all fields before saving.", "أكمل جميع الحقول قبل الحفظ."),
      phone: t("Enter a phone number with at least 8 digits.", "أدخل رقم هاتف يحتوي على ٨ أرقام على الأقل."),
      duplicate: t("That phone number already exists in the sample records.", "رقم الهاتف موجود بالفعل في السجلات التجريبية."),
    };
    setError(errors[result.error] ?? t("Could not save the record.", "تعذر حفظ السجل."));
  };

  return <>
    <PageHeading eyebrow={t("Reception · Records", "الاستقبال · السجلات")} title={t("Customers & vehicles", "العملاء والمركبات")} subtitle={t("Search and maintain sample customer and vehicle records used in this local operations demo.", "ابحث وأدر سجلات العملاء والمركبات التجريبية المستخدمة في هذا العرض التشغيلي المحلي.")} action={<button className="btn btn-primary" onClick={() => { setShowForm((value) => !value); setError(""); }}><Plus size={16} />{t("Add customer", "إضافة عميل")}</button>} />
    <div className="warning-banner"><ShieldAlert size={17} /><div>{t("All people, phone numbers and plates shown here are fictional sample data stored only in this device's browser. No customer communication is sent.", "جميع الأشخاص وأرقام الهواتف واللوحات المعروضة بيانات تجريبية خيالية محفوظة في متصفح هذا الجهاز فقط. لا يتم إرسال أي تواصل للعملاء.")}</div></div>
    {showForm && <form className="form-panel" onSubmit={create}>
      <div className="panel-title-row"><div><h2 className="panel-title">{t("Create sample record", "إنشاء سجل تجريبي")}</h2><p className="panel-desc">{t("One customer and one vehicle will be created together.", "سيتم إنشاء عميل واحد ومركبة واحدة معاً.")}</p></div></div>
      <div className="form-grid">
        <div className="form-field"><label className="field-label">{t("Customer name", "اسم العميل")} *</label><input className="field-input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
        <div className="form-field"><label className="field-label">{t("Phone", "رقم الهاتف")} *</label><input className="field-input mono" required type="tel" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+20…" /></div>
        <div className="form-field"><label className="field-label">{t("Vehicle plate", "لوحة المركبة")} *</label><input className="field-input mono" required value={form.plate} onChange={(event) => setForm({ ...form, plate: event.target.value })} /></div>
        <div className="form-field"><label className="field-label">{t("Make & model", "الشركة والطراز")} *</label><input className="field-input" required value={form.makeModel} onChange={(event) => setForm({ ...form, makeModel: event.target.value })} /></div>
        <div className="form-field"><label className="field-label">{t("Preferred language", "اللغة المفضلة")}</label><select className="field-select" value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value as Locale })}><option value="ar">{t("Arabic", "العربية")}</option><option value="en">{t("English", "الإنجليزية")}</option></select></div>
      </div>
      <div className="form-hint">{t("Use fictional contact details only. This demo does not contact customers.", "استخدم بيانات اتصال خيالية فقط. هذا العرض لا يتواصل مع العملاء.")}</div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-actions"><button type="button" className="btn" onClick={() => setShowForm(false)}>{t("Close", "إغلاق")}</button><button className="btn btn-primary" type="submit">{t("Save sample record", "حفظ السجل التجريبي")}</button></div>
    </form>}
    <div className="toolbar"><div className="toolbar-start"><label className="search-wrap"><Search size={16} /><span className="sr-only">{t("Search customers", "البحث عن العملاء")}</span><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search name, normalized phone, plate or model…", "ابحث بالاسم أو الهاتف أو اللوحة أو الطراز…")} /></label></div><span className="top-meta">{rows.length} {t("customers", "عملاء")}</span></div>
    <div className="table-wrap"><table><thead><tr><th>{t("Customer", "العميل")}</th><th>{t("Phone", "الهاتف")}</th><th>{t("Language", "اللغة")}</th><th>{t("Vehicle", "المركبة")}</th><th>{t("Plate", "اللوحة")}</th></tr></thead><tbody>
      {rows.flatMap((customer) => customer.vehicles.map((vehicle) => <tr key={`${customer.id}-${vehicle.id}`}><td><div className="primary-cell">{customerDisplay(customer.name, lang)}</div><div className="secondary-cell mono">{customer.id}</div></td><td className="mono">{customer.phone}</td><td>{customer.language === "ar" ? t("Arabic", "العربية") : t("English", "الإنجليزية")}</td><td>{vehicle.makeModel}</td><td className="mono">{vehicle.plate}</td></tr>))}
      {!rows.length && <tr><td colSpan={5}><EmptyState title={t("No matching records", "لا توجد سجلات مطابقة")} text={t("Adjust your search or add a sample customer and vehicle.", "غيّر البحث أو أضف عميلاً ومركبة تجريبيين.")} /></td></tr>}
    </tbody></table></div>
    <div className="form-hint" style={{ marginTop: 10 }}>{t("Sample contact data is saved in localStorage on this device, not a production database.", "تُحفظ بيانات الاتصال التجريبية في التخزين المحلي على هذا الجهاز، وليس في قاعدة بيانات إنتاجية.")}</div>
  </>;
}
