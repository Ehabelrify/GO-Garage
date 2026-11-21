import { Fragment, type ReactNode } from "react";
import type { GarageState, Locale } from "@garage/domain";
import type { RecordRegistry, RecordSummary } from "../shared/components/RecordRef";
import { StatusBadge, type StatusDomain } from "../shared/components/StatusBadge";
import { branchDisplay, customerDisplay, dateLabel, serviceDisplay } from "../shared/ui";

type Row = [label: string, value: ReactNode];

function Facts({ rows, badge }: { rows: Row[]; badge?: ReactNode }) {
  return <div className="record-preview">
    {badge && <div>{badge}</div>}
    <dl className="record-preview-facts">
      {rows.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => <Fragment key={label}><dt>{label}</dt><dd><bdi>{value}</bdi></dd></Fragment>)}
    </dl>
  </div>;
}

/**
 * Labels, routes and preview drawers for linkable records, resolved from the workspace store.
 * Records the store does not carry (quotes, reservations, conversations, benefits, transport, packages)
 * keep their type name as the label unless the caller passes one, and open a default preview.
 * Deep links use the ?record= / ?tab= conventions the module pages read.
 */
export function buildRecordRegistry(state: GarageState, lang: Locale): RecordRegistry {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const customer = (id: string) => state.customers.find((item) => item.id === id);
  const vehicle = (id: string) => {
    for (const owner of state.customers) {
      const found = owner.vehicles.find((item) => item.id === id);
      if (found) return { vehicle: found, customer: owner };
    }
    return undefined;
  };
  const service = (id: string) => { const found = state.services.find((item) => item.id === id); return found ? serviceDisplay(found.name, lang) : ""; };
  const branch = (id: string) => { const found = state.branches.find((item) => item.id === id); return found ? branchDisplay(found.name, lang) : ""; };
  const plateOf = (customerId: string, vehicleId: string) => customer(customerId)?.vehicles.find((item) => item.id === vehicleId)?.plate ?? "";
  const badge = (status: string, domain: StatusDomain) => <StatusBadge status={status} domain={domain} lang={lang} />;
  const booking = (id: string) => state.bookings.find((item) => item.id === id);
  const job = (id: string) => state.jobs.find((item) => item.id === id);
  const warranty = (id: string) => state.warranties.find((item) => item.id === id);
  const claim = (id: string) => state.warrantyClaims.find((item) => item.id === id);
  const invoice = (id: string) => state.warrantyInvoiceDrafts.find((item) => item.id === id);
  const preview = (render: (record: RecordSummary) => ReactNode | null) => (record: RecordSummary): ReactNode =>
    render(record) ?? <div className="record-preview"><p className="form-hint">{t("No preview available for this record.", "لا توجد معاينة لهذا السجل.")}</p></div>;

  return {
    customer: {
      label: (id) => { const found = customer(id); return found ? customerDisplay(found.name, lang) : undefined; },
      preview: preview((record) => { const found = customer(record.id); return found ? <Facts rows={[
        [t("Phone", "الهاتف"), found.phone],
        [t("Language", "اللغة"), found.language === "ar" ? "العربية" : "English"],
        [t("Vehicles", "المركبات"), found.vehicles.map((item) => item.plate).join(" · ")],
      ]} /> : null; }),
    },
    vehicle: {
      label: (id) => vehicle(id)?.vehicle.plate,
      preview: preview((record) => { const found = vehicle(record.id); return found ? <Facts rows={[
        [t("Plate", "اللوحة"), found.vehicle.plate],
        [t("Model", "الطراز"), found.vehicle.makeModel],
        [t("Owner", "المالك"), customerDisplay(found.customer.name, lang)],
      ]} /> : null; }),
    },
    booking: {
      label: (id) => { const found = booking(id); return found ? `${service(found.serviceId)} · ${dateLabel(found.dropoffDate, lang)}` : undefined; },
      preview: preview((record) => { const found = booking(record.id); return found ? <Facts badge={badge(found.status, "booking")} rows={[
        [t("Customer", "العميل"), customerDisplay(customer(found.customerId)?.name ?? "", lang)],
        [t("Vehicle", "المركبة"), plateOf(found.customerId, found.vehicleId)],
        [t("Service", "الخدمة"), service(found.serviceId)],
        [t("Branch", "الفرع"), branch(found.branchId)],
        [t("Drop-off", "الاستلام"), `${dateLabel(found.dropoffDate, lang)} ${found.dropoffTime}`],
        [t("Expected pickup", "التسليم المتوقع"), dateLabel(found.expectedPickup, lang)],
      ]} /> : null; }),
    },
    job: {
      label: (id) => { const found = job(id); return found ? `${plateOf(found.customerId, found.vehicleId)} · ${service(found.serviceId)}` : undefined; },
      preview: preview((record) => { const found = job(record.id); return found ? <Facts badge={badge(found.stage, "job")} rows={[
        [t("Customer", "العميل"), customerDisplay(customer(found.customerId)?.name ?? "", lang)],
        [t("Vehicle", "المركبة"), plateOf(found.customerId, found.vehicleId)],
        [t("Service", "الخدمة"), service(found.serviceId)],
        [t("Branch", "الفرع"), branch(found.branchId)],
      ]} /> : null; }),
    },
    warranty: {
      label: (id) => { const found = warranty(id); return found ? `${found.policyName} · ${plateOf(found.customerId, found.vehicleId)}` : undefined; },
      preview: preview((record) => { const found = warranty(record.id); return found ? <Facts badge={badge(found.status, "warranty")} rows={[
        [t("Customer", "العميل"), customerDisplay(customer(found.customerId)?.name ?? "", lang)],
        [t("Vehicle", "المركبة"), plateOf(found.customerId, found.vehicleId)],
        [t("Service", "الخدمة"), service(found.serviceId)],
        [t("Starts", "البداية"), dateLabel(found.startDate, lang)],
        [t("Expires", "الانتهاء"), found.expiresOn ? dateLabel(found.expiresOn, lang) : t("Lifetime", "مدى الحياة")],
      ]} /> : null; }),
    },
    claim: {
      label: (id) => claim(id)?.summary.slice(0, 48),
      preview: preview((record) => { const found = claim(record.id); const linked = found ? warranty(found.warrantyId) : undefined; return found ? <Facts badge={badge(found.status, "claim")} rows={[
        [t("Summary", "الملخص"), found.summary],
        [t("Warranty", "الضمان"), linked ? linked.policyName : ""],
        [t("Vehicle", "المركبة"), linked ? plateOf(linked.customerId, linked.vehicleId) : ""],
        [t("Opened", "تاريخ الفتح"), dateLabel(found.createdAt, lang)],
      ]} /> : null; }),
    },
    invoice: {
      label: (id) => { const found = invoice(id); const linked = found ? warranty(found.warrantyId) : undefined; return linked ? `${t("Invoice", "فاتورة")} · ${plateOf(linked.customerId, linked.vehicleId)}` : undefined; },
      preview: preview((record) => { const found = invoice(record.id); const linked = found ? warranty(found.warrantyId) : undefined; return found ? <Facts badge={badge("draft", "invoice")} rows={[
        [t("Warranty", "الضمان"), linked ? linked.policyName : ""],
        [t("Customer", "العميل"), linked ? customerDisplay(customer(linked.customerId)?.name ?? "", lang) : ""],
        [t("Vehicle", "المركبة"), linked ? plateOf(linked.customerId, linked.vehicleId) : ""],
        [t("Items", "البنود"), String(found.items.length)],
      ]} /> : null; }),
    },
    // Not carried by the workspace store: routes only; callers pass labels (RecordRef label prop).
    quote: { route: (id) => `/workspace/quotes?record=${encodeURIComponent(id)}` },
    reservation: { route: (id) => `/workspace/quotes?tab=reservations&record=${encodeURIComponent(id)}` },
    conversation: { route: (id) => `/workspace/whatsapp?record=${encodeURIComponent(id)}` },
    benefit: { route: (id) => `/workspace/quotes?tab=benefits&record=${encodeURIComponent(id)}` },
    transport: { route: (id) => `/workspace/bookings?tab=transport&record=${encodeURIComponent(id)}` },
    "special-request": { route: (id) => `/workspace/customers?tab=requests&record=${encodeURIComponent(id)}` },
    "catalogue-package": { route: (id) => `/workspace/catalogue?record=${encodeURIComponent(id)}` },
  };
}
