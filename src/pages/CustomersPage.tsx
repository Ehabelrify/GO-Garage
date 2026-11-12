import { useState, type FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import type { BranchId, Locale } from "../types";
import { useGarageStore } from "../store";
import { customerDisplay, EmptyState, PageHeading, type PageProps } from "../ui";

interface CustomerForm {
  name: string;
  phone: string;
  plate: string;
  makeModel: string;
  language: Locale;
}

interface CustomersPageProps extends PageProps {
  branchId?: BranchId | "all";
}

const customerErrorCopy: Record<string, { en: string; ar: string }> = {
  INVALID_CUSTOMER: { en: "Complete the customer and vehicle fields.", ar: "كمّل بيانات العميل والعربية." },
  INVALID_PHONE: { en: "Enter a valid phone number with 8–15 digits.", ar: "اكتب رقم موبايل صحيح من ٨ لـ ١٥ رقم." },
  DUPLICATE_PHONE: { en: "A customer with this phone number already exists.", ar: "فيه عميل مسجل بنفس رقم الموبايل ده." },
};

export function CustomersPage({ lang, t, state, notify, branchId }: CustomersPageProps) {
  const store = useGarageStore();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CustomerForm>({ name: "", phone: "", plate: "", makeModel: "", language: lang });
  const rows = state.customers.filter((customer) =>
    `${customer.name} ${customer.phone} ${customer.vehicles.map((vehicle) => `${vehicle.plate} ${vehicle.makeModel}`).join(" ")}`.toLowerCase().includes(query.toLowerCase()));

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!branchId || branchId === "all") {
      setError(t("Choose a branch before adding a customer.", "اختار فرع قبل ما تضيف عميل."));
      return;
    }
    setSaving(true);
    const result = await store.createCustomer({ ...form, branchId });
    setSaving(false);
    if (result.ok) {
      setShowForm(false);
      setForm({ name: "", phone: "", plate: "", makeModel: "", language: lang });
      notify(t("Customer and vehicle saved.", "اتحفظت بيانات العميل والعربية."));
      return;
    }
    const copy = customerErrorCopy[result.error];
    setError(copy ? t(copy.en, copy.ar) : t("The customer record could not be saved.", "ماقدرناش نحفظ بيانات العميل."));
  };

  return <>
    <PageHeading
      eyebrow={t("Reception · Records", "الاستقبال · السجلات")}
      title={t("Customers & vehicles", "العملاء والمركبات")}
      subtitle={t("Search customer and vehicle records available to your assigned branches.", "دوّر في بيانات العملاء والعربيات المتاحة للفروع المسندة ليك.")}
      action={<button className="btn btn-primary" type="button" onClick={() => { setShowForm((value) => !value); setError(""); }} disabled={!branchId}><Plus size={16} />{t("Add customer", "إضافة عميل")}</button>}
    />

    {showForm && <form className="form-panel" onSubmit={(event) => void create(event)}>
      <div className="panel-title-row"><div><h2 className="panel-title">{t("Create customer record", "سجّل عميل جديد")}</h2><p className="panel-desc">{t("A customer and the first vehicle are stored together.", "بيانات العميل وأول عربية بتتحفظ مع بعض.")}</p></div></div>
      <div className="form-grid">
        <div className="form-field"><label className="field-label" htmlFor="customer-name">{t("Customer name", "اسم العميل")} *</label><input id="customer-name" className="field-input" required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
        <div className="form-field"><label className="field-label" htmlFor="customer-phone">{t("Phone", "رقم الهاتف")} *</label><input id="customer-phone" className="field-input mono" required type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+20…" /></div>
        <div className="form-field"><label className="field-label" htmlFor="customer-plate">{t("Vehicle plate", "لوحة المركبة")} *</label><input id="customer-plate" className="field-input mono" required maxLength={20} value={form.plate} onChange={(event) => setForm({ ...form, plate: event.target.value })} /></div>
        <div className="form-field"><label className="field-label" htmlFor="customer-model">{t("Make & model", "ماركة وموديل العربية")} *</label><input id="customer-model" className="field-input" required maxLength={100} value={form.makeModel} onChange={(event) => setForm({ ...form, makeModel: event.target.value })} placeholder={t("Toyota Corolla 2022", "تويوتا كورولا ٢٠٢٢")} /></div>
        <div className="form-field"><label className="field-label" htmlFor="customer-language">{t("Preferred language", "اللغة المفضلة")}</label><select id="customer-language" className="field-select" value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value as Locale })}><option value="ar">{t("Arabic", "العربية")}</option><option value="en">{t("English", "الإنجليزية")}</option></select></div>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-actions"><button type="button" className="btn" onClick={() => setShowForm(false)}>{t("Close", "اقفل")}</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? t("Saving…", "بنحفظ…") : t("Save customer", "احفظ بيانات العميل")}</button></div>
    </form>}

    <div className="toolbar"><div className="toolbar-start"><label className="search-wrap"><Search size={16} /><span className="sr-only">{t("Search customers", "دوّر على العملاء")}</span><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search name, phone, plate or model…", "دوّر بالاسم أو رقم الموبايل أو اللوحة أو الموديل…")} /></label></div><span className="top-meta">{rows.length} {t("customers", "عميل")}</span></div>

    <div className="table-wrap"><table><thead><tr><th>{t("Customer", "العميل")}</th><th>{t("Phone", "الهاتف")}</th><th>{t("Language", "اللغة")}</th><th>{t("Vehicle", "المركبة")}</th><th>{t("Plate", "اللوحة")}</th></tr></thead><tbody>
      {rows.flatMap((customer) => customer.vehicles.map((vehicle) => <tr key={`${customer.id}-${vehicle.id}`}>
        <td><div className="primary-cell">{customerDisplay(customer.name, lang)}</div></td><td className="mono">{customer.phone}</td>
        <td>{customer.language === "ar" ? t("Arabic", "العربية") : t("English", "الإنجليزية")}</td><td>{vehicle.makeModel}</td><td className="mono">{vehicle.plate}</td>
      </tr>))}
      {!rows.length && <tr><td colSpan={5}><EmptyState title={t("No matching customers", "مفيش عملاء مطابقين")} text={t("Adjust your search or add a customer to this branch.", "غيّر كلمة البحث أو ضيف عميل للفرع ده.")} /></td></tr>}
    </tbody></table></div>
  </>;
}
