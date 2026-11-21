import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import type { Customer, Locale } from "@garage/domain";
import { DetailDrawer } from "../../shared/components";
import { useGarageStore } from "../../shared/store";
import { customerDisplay } from "../../shared/ui";
import { CustomerForm, writeErrorMessage, type BranchOption } from "./CustomerForm";
import { defaultFormBranch, filterCustomers } from "./customers-logic";
import "./customers.css";

export interface CustomerVehicleValue { customerId: string; vehicleId: string }
export const emptyCustomerVehicle: CustomerVehicleValue = { customerId: "", vehicleId: "" };

export interface CustomerVehiclePickerProps {
  lang: Locale;
  value: CustomerVehicleValue;
  onChange: (value: CustomerVehicleValue) => void;
  /** Also ask which vehicle (default true). With false only the customer is chosen. */
  withVehicle?: boolean;
  /** Show the inline "Add customer" action (default true; hidden when the actor cannot create customers). */
  allowAdd?: boolean;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  /** Restrict choices, e.g. to customers that have a vehicle with an open warranty. */
  filter?: (customer: Customer) => boolean;
  /** Called once a customer was created inline and selected. */
  onCreated?: (customerId: string) => void;
}

const MAX_RESULTS = 8;

/**
 * Search by name, phone or plate, pick the customer, then one of their vehicles (auto-selected when there is only one).
 * Reads customers from the shared store; an inline form adds a customer + first vehicle without leaving the page.
 */
export function CustomerVehiclePicker({ lang, value, onChange, withVehicle = true, allowAdd = true, label, required, disabled, filter, onCreated }: CustomerVehiclePickerProps) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const store = useGarageStore();
  const customers = store.state?.customers;
  const actor = store.actor;
  const branches = store.state?.branches;
  const pool = useMemo(() => (customers ?? []).filter((customer) => !filter || filter(customer)), [customers, filter]);
  const selected = pool.find((customer) => customer.id === value.customerId) ?? customers?.find((customer) => customer.id === value.customerId);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState(false);
  const listId = useId();
  const labelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => filterCustomers(pool, query).slice(0, MAX_RESULTS), [pool, query]);
  const canAdd = allowAdd && !!actor && actor.role !== "technician";

  // Single vehicle: choose it automatically, also right after an inline add once the store refreshed.
  useEffect(() => {
    if (!withVehicle || !selected || value.vehicleId) return;
    if (selected.vehicles.length === 1) onChange({ customerId: selected.id, vehicleId: selected.vehicles[0].id });
  }, [withVehicle, selected, value.vehicleId, onChange]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const branchOptions: BranchOption[] = useMemo(() => {
    if (!actor || !branches) return [];
    const allowed = actor.role === "owner" ? branches : branches.filter((branch) => actor.branchIds.includes(branch.id));
    return allowed.map((branch) => ({ id: branch.id, label: lang === "ar" && branch.nameAr ? branch.nameAr : branch.name }));
  }, [actor, branches, lang]);

  const choose = (customer: Customer) => {
    setOpen(false);
    setQuery("");
    onChange({ customerId: customer.id, vehicleId: withVehicle && customer.vehicles.length === 1 ? customer.vehicles[0].id : "" });
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, Math.max(matches.length - 1, 0))); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
    else if (event.key === "Enter" && open && matches[active]) { event.preventDefault(); choose(matches[active]); }
    else if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); }
  };

  const create = async (values: { name: string; phone: string; plate: string; makeModel: string; language: Locale; branchId: string }) => {
    const result = await store.createCustomer({ name: values.name, phone: values.phone, plate: values.plate, makeModel: values.makeModel, language: values.language, branchId: values.branchId as never });
    if (!result.ok) return writeErrorMessage(result.error, lang);
    setAdding(false);
    onChange({ customerId: result.customerId, vehicleId: "" });
    onCreated?.(result.customerId);
    return null;
  };

  return <div className="cvp" ref={root}>
    <span className="field-label" id={labelId}>{label ?? t("Customer", "العميل")}{required && <span className="field-required" aria-hidden="true"> *</span>}</span>
    {selected
      ? <div className="cvp-selected">
          <span className="cvp-selected-main"><strong>{customerDisplay(selected.name, lang)}</strong><bdi className="cvp-option-sub mono">{selected.phone}</bdi></span>
          {!disabled && <button type="button" className="btn btn-quiet btn-sm" onClick={() => onChange(emptyCustomerVehicle)} aria-label={t("Change customer", "تغيير العميل")}><X size={15} /></button>}
        </div>
      : <div className="cvp-search">
          <input
            className="field-input" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-labelledby={labelId}
            aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].id}` : undefined}
            value={query} disabled={disabled} required={required && !value.customerId} autoComplete="off"
            placeholder={t("Name, phone or plate", "الاسم أو الهاتف أو اللوحة")}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          />
          {open && <ul className="cvp-list" id={listId} role="listbox" aria-labelledby={labelId}>
            {matches.map((customer, index) => <li key={customer.id} role="presentation">
              <button type="button" role="option" id={`${listId}-${customer.id}`} aria-selected={index === active} data-active={index === active} className="cvp-option" onClick={() => choose(customer)} onMouseEnter={() => setActive(index)}>
                <span className="cvp-option-main"><strong>{customerDisplay(customer.name, lang)}</strong><bdi className="cvp-option-sub mono">{customer.phone}</bdi></span>
                <span className="plate-chips">{customer.vehicles.slice(0, 3).map((vehicle) => <bdi className="plate-chip mono" key={vehicle.id}>{vehicle.plate}</bdi>)}</span>
              </button>
            </li>)}
            {matches.length === 0 && <li className="cvp-empty" role="presentation">{store.status === "loading" ? t("Loading…", "جارٍ التحميل…") : t("No match", "لا توجد نتيجة")}</li>}
          </ul>}
        </div>}
    {withVehicle && selected && (selected.vehicles.length > 1 || (selected.vehicles.length === 1 && !value.vehicleId)) && <div className="plate-chips" role="radiogroup" aria-label={t("Vehicle", "المركبة")}>
      {selected.vehicles.map((vehicle) => <button type="button" role="radio" aria-checked={value.vehicleId === vehicle.id} key={vehicle.id} disabled={disabled}
        className={`btn btn-sm${value.vehicleId === vehicle.id ? " btn-primary" : ""}`} onClick={() => onChange({ customerId: selected.id, vehicleId: vehicle.id })}>
        <bdi className="mono">{vehicle.plate}</bdi><small>{vehicle.makeModel}</small>
      </button>)}
    </div>}
    {withVehicle && selected && selected.vehicles.length === 1 && value.vehicleId && <div className="plate-chips"><bdi className="plate-chip mono">{selected.vehicles[0].plate}<small>{selected.vehicles[0].makeModel}</small></bdi></div>}
    {canAdd && !selected && !disabled && !adding && <button type="button" className="btn btn-quiet btn-sm" style={{ justifySelf: "start" }} onClick={() => { setOpen(false); setAdding(true); }}><Plus size={15} />{t("New customer", "عميل جديد")}</button>}
    {/* Drawer is portalled, so the add form is never nested inside the host form. */}
    <DetailDrawer open={adding} onClose={() => setAdding(false)} lang={lang} title={t("New customer", "عميل جديد")}>
      <CustomerForm lang={lang} mode="create" branches={branchOptions}
        defaultBranchId={defaultFormBranch(branchOptions.map((branch) => branch.id), store.state?.currentBranch ?? "all")}
        onSubmit={create} onCancel={() => setAdding(false)} />
    </DetailDrawer>
  </div>;
}
