import { useMemo, useState } from "react";
import { calculateWarrantyInvoiceTotals } from "@garage/domain";
import type { WarrantyInvoiceDraft, WarrantyRecord } from "@garage/domain";
import {
  DataTable, DetailDrawer, EmptyState, FilterBar, RecordRef, StatusBadge, useUrlState, type Column,
} from "../../shared/components";
import { WarrantyInvoicePanel } from "./WarrantyInvoicePanel";
import { formatDateTime } from "./warranty-logic";
import { CustomerLink, VehicleLink, WarrantyLink, type WarrantyScope } from "./warranty-scope";

/** Draft invoices linked to coverage. Creating one starts from the coverage drawer; editing happens here. */
export function InvoicesTab({ scope }: { scope: WarrantyScope }) {
  const { t, lang, state, warranties } = scope;
  const [recordId, setRecordId] = useUrlState("record", "");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const byId = new Map(warranties.map((record) => [record.id, record]));
    return state.warrantyInvoiceDrafts.flatMap((invoice) => {
      const record = byId.get(invoice.warrantyId);
      return record ? [{ invoice, record }] : [];
    }).filter(({ record }) => !query.trim() || `${scope.customerName(record.customerId)} ${scope.vehicleOf(record.customerId, record.vehicleId)?.plate ?? ""} ${record.policyName}`.toLowerCase().includes(query.trim().toLowerCase()));
  }, [state.warrantyInvoiceDrafts, warranties, query, lang]);
  type Row = (typeof rows)[number];
  const open = rows.find((row) => row.invoice.id === recordId) ?? null;
  const status = (invoice: WarrantyInvoiceDraft) =>
    calculateWarrantyInvoiceTotals(invoice.items, invoice.taxRatePercent, invoice.paidAmount).paymentStatus;

  const columns: Column<Row>[] = [
    { key: "customer", header: t("Customer", "العميل"), primary: true, render: ({ record }) => <CustomerLink scope={scope} customerId={record.customerId} /> },
    { key: "vehicle", header: t("Vehicle", "المركبة"), render: ({ record }) => <VehicleLink scope={scope} customerId={record.customerId} vehicleId={record.vehicleId} /> },
    { key: "warranty", header: t("Warranty", "الضمان"), render: ({ record }) => <WarrantyLink scope={scope} record={record as WarrantyRecord} /> },
    { key: "status", header: t("Payment", "الدفع"), render: ({ invoice }) => <StatusBadge status={status(invoice)} domain="invoice" lang={lang} /> },
    { key: "updated", header: t("Updated", "حُدّثت"), sortable: true, sortValue: (row) => row.invoice.updatedAt, render: ({ invoice }) => formatDateTime(invoice.updatedAt, lang) },
  ];

  return <>
    <FilterBar lang={lang} resultCount={rows.length} search={{ value: query, onChange: setQuery, placeholder: t("Customer, plate or policy…", "العميل أو اللوحة أو السياسة…") }} onClear={query ? () => setQuery("") : undefined} />
    <DataTable rows={rows} columns={columns} rowKey={(row) => row.invoice.id} lang={lang} caption={t("Draft invoices", "مسودات الفواتير")}
      selectedKey={recordId || null} onRowClick={(row) => setRecordId(row.invoice.id)}
      empty={<EmptyState variant={query ? "no-results" : "no-data"} title={query ? t("No matches", "لا توجد نتائج") : t("No draft invoices", "لا توجد مسودات فواتير")}
        text={query ? undefined : t("Create one from a coverage record.", "أنشئ واحدة من سجل التغطية.")} />} />
    {open && <DetailDrawer open onClose={() => setRecordId("")} lang={lang} wide title={t("Draft invoice", "مسودة فاتورة")} subtitle={scope.customerName(open.record.customerId)}>
      <p className="form-hint"><RecordRef type="warranty" id={open.record.id} label={open.record.policyName} /></p>
      <WarrantyInvoicePanel warranty={open.record} locale={lang} customerName={scope.customerName(open.record.customerId)}
        vehicleLabel={(() => { const v = scope.vehicleOf(open.record.customerId, open.record.vehicleId); return v ? `${v.makeModel} · ${v.plate}` : "—"; })()}
        serviceLabel={scope.serviceName(open.record.serviceId)} branchLabel={scope.branchName(open.record.branchId)} />
    </DetailDrawer>}
  </>;
}
