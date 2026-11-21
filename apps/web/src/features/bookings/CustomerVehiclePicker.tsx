import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import type { BranchId, CreateCustomerInput, Locale } from "@garage/domain";
import { Field, FormSection } from "../../shared/components";
import { customerDisplay } from "../../shared/ui";
import { matchesCustomer } from "./booking-logic";
import "./bookings.css";

export interface PickerCustomer {
  id: string;
  name: string;
  phone: string;
  vehicles: Array<{ id: string; plate: string; makeModel: string }>;
}

export interface PickerValue { customerId: string; vehicleId: string }

export interface CustomerVehiclePickerProps {
  lang: Locale;
  customers: PickerCustomer[];
  value: PickerValue;
  onChange: (value: PickerValue) => void;
  /** Creates a customer + first vehicle; resolves to the new customer id or an error code. */
  onCreate?: (input: CreateCustomerInput) => Promise<{ ok: true; customerId: string } | { ok: false; error: string }>;
  branchId: BranchId;
  /** Maps an error code to a message. */
  errorCopy?: (code: string) => string;
}

const MAX_RESULTS = 6;

/** Search-first customer + vehicle picker with inline "new customer". No typed ids. */
export function CustomerVehiclePicker({ lang, customers, value, onChange, onCreate, branchId, errorCopy }: CustomerVehiclePickerProps) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<CreateCustomerInput>({ name: "", phone: "", plate: "", makeModel: "", language: lang, branchId });

  const selected = customers.find((customer) => customer.id === value.customerId);
  const results = useMemo(() => customers.filter((customer) => matchesCustomer(customer, query)).slice(0, MAX_RESULTS), [customers, query]);
  const totalMatches = useMemo(() => customers.filter((customer) => matchesCustomer(customer, query)).length, [customers, query]);

  // One vehicle: choose it automatically (also covers a customer that was just created).
  useEffect(() => {
    if (selected && !value.vehicleId && selected.vehicles.length === 1) onChange({ customerId: selected.id, vehicleId: selected.vehicles[0].id });
  }, [selected, value.vehicleId, onChange]);

  const vehicle = selected?.vehicles.find((item) => item.id === value.vehicleId);

  const create = async () => {
    if (!onCreate) return;
    setBusy(true); setError("");
    const result = await onCreate({ ...fresh, name: fresh.name.trim(), phone: fresh.phone.trim(), plate: fresh.plate.trim(), makeModel: fresh.makeModel.trim(), language: fresh.language, branchId });
    setBusy(false);
    if (result.ok) {
      onChange({ customerId: result.customerId, vehicleId: "" });
      setCreating(false);
      setFresh({ name: "", phone: "", plate: "", makeModel: "", language: lang, branchId });
    } else setError(errorCopy ? errorCopy(result.error) : t("The customer could not be saved.", "تعذر حفظ العميل."));
  };
  const freshValid = fresh.name.trim() && fresh.phone.trim() && fresh.plate.trim() && fresh.makeModel.trim();

  if (creating) {
    return <div className="bk-inline-form" role="group" aria-label={t("New customer", "عميل جديد")}>
      <FormSection title={t("New customer and vehicle", "عميل ومركبة جديدان")}>
        <Field label={t("Name", "الاسم")} required><input className="field-input" autoComplete="off" value={fresh.name} onChange={(event) => setFresh({ ...fresh, name: event.target.value })} /></Field>
        <Field label={t("Phone", "الهاتف")} required><input className="field-input" type="tel" dir="ltr" autoComplete="off" value={fresh.phone} onChange={(event) => setFresh({ ...fresh, phone: event.target.value })} /></Field>
        <Field label={t("Plate", "اللوحة")} required><input className="field-input" dir="ltr" autoComplete="off" value={fresh.plate} onChange={(event) => setFresh({ ...fresh, plate: event.target.value })} /></Field>
        <Field label={t("Make and model", "الماركة والموديل")} required><input className="field-input" autoComplete="off" value={fresh.makeModel} onChange={(event) => setFresh({ ...fresh, makeModel: event.target.value })} /></Field>
        <Field label={t("Language", "اللغة")}><select className="field-select" value={fresh.language} onChange={(event) => setFresh({ ...fresh, language: event.target.value as Locale })}><option value="en">English</option><option value="ar">العربية</option></select></Field>
      </FormSection>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="action-row">
        <button type="button" className="btn btn-primary btn-sm" disabled={!freshValid || busy} onClick={() => void create()}>{busy ? t("Saving…", "جارٍ الحفظ…") : t("Save customer", "حفظ العميل")}</button>
        <button type="button" className="btn btn-sm" onClick={() => { setCreating(false); setError(""); }}>{t("Back to search", "رجوع للبحث")}</button>
      </div>
    </div>;
  }

  return <div className="bk-pick">
    {selected
      ? <div className="bk-pick-selected">
          <div><strong><bdi>{customerDisplay(selected.name, lang)}</bdi></strong><small><bdi dir="ltr">{selected.phone}</bdi></small></div>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => onChange({ customerId: "", vehicleId: "" })}><X size={14} aria-hidden="true" />{t("Change", "تغيير")}</button>
        </div>
      : <>
          <input className="field-input" type="search" value={query} autoComplete="off" placeholder={t("Search name, phone or plate", "ابحث بالاسم أو الهاتف أو اللوحة")} aria-label={t("Search customers", "بحث العملاء")} onChange={(event) => setQuery(event.target.value)} />
          <div className="bk-pick-list" role="radiogroup" aria-label={t("Customers", "العملاء")}>
            {results.map((customer) => <button key={customer.id} type="button" role="radio" aria-checked="false" className="bk-pick-item" onClick={() => onChange({ customerId: customer.id, vehicleId: "" })}>
              <span><bdi>{customerDisplay(customer.name, lang)}</bdi></span>
              <small><bdi dir="ltr">{customer.phone}</bdi>{customer.vehicles.length > 0 && <> · <bdi dir="ltr">{customer.vehicles.map((item) => item.plate).join(", ")}</bdi></>}</small>
            </button>)}
          </div>
          {results.length === 0 && <p className="bk-muted" role="status">{t("No matching customer.", "لا يوجد عميل مطابق.")}</p>}
          {totalMatches > MAX_RESULTS && <p className="bk-muted">{t(`Showing ${MAX_RESULTS} of ${totalMatches}. Type more to narrow.`, `يظهر ${MAX_RESULTS} من ${totalMatches}. اكتب أكثر للتضييق.`)}</p>}
          {onCreate && <button type="button" className="btn btn-sm" onClick={() => setCreating(true)}><Plus size={14} aria-hidden="true" />{t("New customer", "عميل جديد")}</button>}
        </>}
    {selected && selected.vehicles.length > 1 && <div className="bk-pick-list" role="radiogroup" aria-label={t("Vehicle", "المركبة")}>
      {selected.vehicles.map((item) => <button key={item.id} type="button" role="radio" aria-checked={item.id === value.vehicleId} className="bk-pick-item" onClick={() => onChange({ customerId: selected.id, vehicleId: item.id })}>
        <span><bdi dir="ltr">{item.plate}</bdi></span><small><bdi>{item.makeModel}</bdi></small>
      </button>)}
    </div>}
    {selected && selected.vehicles.length === 1 && vehicle && <p className="bk-muted"><bdi dir="ltr">{vehicle.plate}</bdi> · <bdi>{vehicle.makeModel}</bdi></p>}
    {selected && selected.vehicles.length === 0 && <p className="bk-muted" role="status">{t("This customer has no vehicle yet.", "لا توجد مركبة لهذا العميل بعد.")}</p>}
  </div>;
}
