import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Customer, Locale, QuoteRevision, QuoteVersionRef, Vehicle } from "@garage/domain";
import { Money, StatusBadge } from "../../shared/components";
import type { Lookups } from "./lookups";
import { tr } from "./lookups";

export interface CustomerVehicleValue { customerId: string; vehicleId: string }
const empty: CustomerVehicleValue = { customerId: "", vehicleId: "" };

const match = (text: string, query: string) => !query || text.toLowerCase().includes(query.trim().toLowerCase());

/**
 * Search one box for a customer name, phone or plate; pick a vehicle. Replaces typed customer/vehicle ids.
 * `customers` is the already branch-scoped workspace list.
 */
export function CustomerVehiclePicker({ lang, customers, value, onChange, disabled, label }: {
  lang: Locale; customers: Customer[]; value: CustomerVehicleValue; onChange: (value: CustomerVehicleValue) => void; disabled?: boolean; label?: string;
}) {
  const t = tr(lang);
  const [query, setQuery] = useState("");
  const options = useMemo(() => customers.flatMap((customer) => customer.vehicles.map((vehicle) => ({ customer, vehicle }))), [customers]);
  const shown = useMemo(() => options.filter(({ customer, vehicle }) => match(`${customer.name} ${customer.phone} ${vehicle.plate} ${vehicle.makeModel}`, query)).slice(0, 8), [options, query]);
  const picked = options.find((option) => option.vehicle.id === value.vehicleId);
  const noVehicleCustomers = customers.length > 0 && options.length === 0;
  if (picked) {
    return <div className="qo-picked">
      <span><bdi className="mono">{picked.vehicle.plate}</bdi> · <bdi>{picked.vehicle.makeModel}</bdi><br /><small className="qo-muted"><bdi>{picked.customer.name}</bdi></small></span>
      {!disabled && <button type="button" className="btn btn-sm btn-quiet" onClick={() => onChange(empty)} aria-label={t("Change vehicle", "تغيير المركبة")}><X size={14} aria-hidden="true" />{t("Change", "تغيير")}</button>}
    </div>;
  }
  return <div className="qo-picker">
    <input className="field-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={label ?? t("Search name, phone or plate", "ابحث بالاسم أو الهاتف أو اللوحة")} aria-label={label ?? t("Search customer or vehicle", "ابحث عن عميل أو مركبة")} disabled={disabled} />
    {shown.length > 0
      ? <ul className="qo-picker-list">{shown.map(({ customer, vehicle }) => <li key={vehicle.id}>
          <button type="button" className="qo-picker-item" onClick={() => { onChange({ customerId: customer.id, vehicleId: vehicle.id }); setQuery(""); }}>
            <span><bdi className="mono">{vehicle.plate}</bdi> · <bdi>{vehicle.makeModel}</bdi></span><small><bdi>{customer.name}</bdi></small>
          </button>
        </li>)}</ul>
      : <p className="qo-muted">{noVehicleCustomers ? t("Customers have no vehicles yet. Add a vehicle in Customers first.", "لا توجد مركبات للعملاء بعد. أضف مركبة من صفحة العملاء أولاً.") : t("No match. Add the customer in Customers first.", "لا توجد نتيجة. أضف العميل من صفحة العملاء أولاً.")}</p>}
  </div>;
}

export type AcceptedChoice = Pick<QuoteRevision, "ref" | "total" | "input">;

/** Pick one or several accepted quotes by customer, plate and total. */
export function QuotePicker({ lang, quotes, lookups, selected, onChange, multiple, emptyText }: {
  lang: Locale; quotes: AcceptedChoice[]; lookups: Lookups; selected: QuoteVersionRef[]; onChange: (next: QuoteVersionRef[]) => void; multiple?: boolean; emptyText?: string;
}) {
  const t = tr(lang);
  const [query, setQuery] = useState("");
  const same = (a: QuoteVersionRef, b: QuoteVersionRef) => a.quoteId === b.quoteId && a.revision === b.revision;
  const describe = (quote: AcceptedChoice) => `${lookups.customerName(quote.input.customerId)} ${lookups.plate(quote.input.vehicle.vehicleId)}`;
  const shown = quotes.filter((quote) => match(describe(quote), query)).slice(0, 12);
  if (quotes.length === 0) return <p className="qo-muted">{emptyText ?? t("No accepted quotes yet. Accept a quote first.", "لا توجد عروض مقبولة بعد. اقبل عرضاً أولاً.")}</p>;
  const toggle = (quote: AcceptedChoice) => {
    const isOn = selected.some((ref) => same(ref, quote.ref));
    if (!multiple) return onChange(isOn ? [] : [quote.ref]);
    onChange(isOn ? selected.filter((ref) => !same(ref, quote.ref)) : [...selected, quote.ref]);
  };
  return <div className="qo-picker">
    {quotes.length > 5 && <input className="field-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search customer or plate", "ابحث بالعميل أو اللوحة")} aria-label={t("Search accepted quotes", "ابحث في العروض المقبولة")} />}
    <ul className="qo-picker-list" role={multiple ? "group" : "radiogroup"} aria-label={t("Accepted quotes", "العروض المقبولة")}>
      {shown.map((quote) => {
        const on = selected.some((ref) => same(ref, quote.ref));
        return <li key={`${quote.ref.quoteId}:${quote.ref.revision}`}>
          <button type="button" className="qo-picker-item" role={multiple ? "checkbox" : "radio"} aria-checked={on} onClick={() => toggle(quote)} style={on ? { background: "var(--teal-soft)", fontWeight: 600 } : undefined}>
            <span><bdi>{lookups.customerName(quote.input.customerId) || t("Customer", "عميل")}</bdi> · <bdi className="mono">{lookups.plate(quote.input.vehicle.vehicleId) || quote.input.vehicle.model}</bdi></span>
            <small>{quote.total && <Money minor={quote.total.minor} currency={quote.total.currency} lang={lang} />}{on ? ` · ${t("Selected", "محدد")}` : ""}</small>
          </button>
        </li>;
      })}
    </ul>
  </div>;
}

export function vehicleLabel(vehicle: Vehicle | undefined, fallback: string) {
  return vehicle ? `${vehicle.plate} · ${vehicle.makeModel}` : fallback;
}

/** Small status line used by pickers and detail drawers. */
export function QuoteStateBadge({ quote, lang, expired }: { quote: Pick<QuoteRevision, "state">; lang: Locale; expired?: boolean }) {
  return <StatusBadge status={expired ? "expired" : quote.state} lang={lang} domain="quote" />;
}
