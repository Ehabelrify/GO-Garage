import { useMemo, useState } from "react";
import { formatPlateDisplay, type Locale } from "@garage/domain";
import { Amount, DataTable, DateText, EmptyState, FilterBar, RecordRef, useUrlState, type Column } from "../../shared/components";
import { useGarageStore } from "../../shared/store";
import { branchDisplay, customerDisplay } from "../../shared/ui";
import { useLoad } from "../finance/use-load";
import { InvoiceDrawer } from "./InvoiceDrawer";
import { errorCopy, statusLabel } from "./invoice-model";
import { invoicesApi, type Invoice } from "./invoices-api";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import "./invoices.css";

export interface InvoicesPanelProps {
  lang: Locale;
  /** Scope the list to one customer / vehicle / job (embedded use). */
  scope?: { customerId?: string; vehicleId?: string; jobId?: string };
}

/** Invoice list with a detail drawer (?record=<id>). Lives in the Bookings page as the Invoices tab. */
export function InvoicesPanel({ lang, scope }: InvoicesPanelProps) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const { state } = useGarageStore();
  const [record, setRecord] = useUrlState("record", "");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const list = useLoad(() => invoicesApi.list(scope ?? {}), [scope?.customerId, scope?.vehicleId, scope?.jobId], ["invoices", "finance", "jobs"]);
  const branchName = (id: string) => { const found = state?.branches.find((branch) => branch.id === id); return found ? branchDisplay(found.name, lang) : ""; };
  const rows = useMemo(() => (list.data?.invoices ?? []).filter((invoice) => {
    if (status !== "all" && invoice.status !== status) return false;
    const text = query.trim().toLowerCase();
    return !text || [invoice.number, invoice.customerName, invoice.plate].some((value) => value?.toLowerCase().includes(text));
  }), [list.data, status, query]);
  const filtered = Boolean(query.trim()) || status !== "all";
  const clear = () => { setQuery(""); setStatus("all"); };

  const columns: Column<Invoice>[] = [
    { key: "number", header: t("Invoice", "الفاتورة"), primary: true, mono: true, sortable: true, sortValue: (row) => row.number ?? "", csv: (row) => row.number ?? "", render: (row) => row.number ? <bdi dir="ltr">{row.number}</bdi> : t("Draft", "مسودة") },
    { key: "customer", header: t("Customer", "العميل"), csv: (row) => row.customerName ?? "", render: (row) => <RecordRef type="customer" id={row.customerId} label={row.customerName ? customerDisplay(row.customerName, lang) : undefined} /> },
    { key: "vehicle", header: t("Vehicle", "المركبة"), csv: (row) => (row.plate ? formatPlateDisplay(row.plate) : ""), render: (row) => <RecordRef type="vehicle" id={row.vehicleId} label={row.plate ? formatPlateDisplay(row.plate) : undefined} /> },
    { key: "branch", header: t("Branch", "الفرع"), csv: (row) => branchName(row.branchId), render: (row) => branchName(row.branchId) },
    { key: "date", header: t("Date", "التاريخ"), csv: (row) => (row.issueDate ?? row.createdAt).slice(0, 10), sortable: true, sortValue: (row) => row.issueDate ?? row.createdAt, render: (row) => <DateText value={row.issueDate ?? row.createdAt} lang={lang} /> },
    { key: "total", header: t("Total", "الإجمالي"), numeric: true, csvMoney: (row) => (row.totalMinor === null ? null : { minor: row.totalMinor, currency: row.currency }), render: (row) => <Amount minor={row.totalMinor} currency={row.currency} lang={lang} /> },
    { key: "balance", header: t("Balance", "المتبقي"), numeric: true, csvMoney: (row) => (row.status === "draft" || row.status === "void" || row.balanceMinor === null ? null : { minor: row.balanceMinor, currency: row.currency }), render: (row) => row.status === "draft" || row.status === "void" ? "—" : <Amount minor={row.balanceMinor} currency={row.currency} lang={lang} /> },
    { key: "status", header: t("Status", "الحالة"), csv: (row) => row.status, sortable: true, sortValue: (row) => row.status, render: (row) => <InvoiceStatusBadge status={row.status} lang={lang} /> },
  ];
  const statusOptions = ["draft", "issued", "partial", "paid", "void"] as const;
  const error = list.error ? errorCopy(list.error.replace(/^.*: /, ""), lang) : null;

  return <>
    <FilterBar lang={lang}
      search={{ value: query, onChange: setQuery, placeholder: t("Search number, customer or plate", "ابحث برقم الفاتورة أو العميل أو اللوحة") }}
      filters={[{ key: "status", label: t("Status", "الحالة"), value: status, onChange: setStatus,
        options: [{ value: "all", label: t("All statuses", "كل الحالات") }, ...statusOptions.map((value) => ({ value, label: statusLabel(value, lang) }))] }]}
      onClear={clear} resultCount={list.data ? rows.length : undefined} viewsId={scope ? undefined : "invoices"} />
    <DataTable listId={scope ? undefined : "invoices"} exportName="invoices" columns={columns} rows={rows} rowKey={(row) => row.id} lang={lang} caption={t("Invoices", "الفواتير")}
      loading={list.loading} error={error ? t("Invoices could not be loaded.", "تعذر تحميل الفواتير.") : null} onRetry={list.reload}
      onRowClick={(row) => setRecord(row.id)} selectedKey={record || null} initialSort={{ key: "date", direction: "desc" }}
      empty={filtered
        ? <EmptyState variant="no-results" title={t("No invoices match", "لا توجد فواتير مطابقة")} action={<button type="button" className="btn" onClick={clear}>{t("Clear filters", "مسح التصفية")}</button>} />
        : <EmptyState title={t("No invoices yet", "لا توجد فواتير بعد")} text={t("A draft invoice is created automatically when a job is delivered.", "تُنشأ مسودة الفاتورة تلقائياً عند تسليم العمل.")} />} />
    <InvoiceDrawer lang={lang} invoiceId={record || null} onClose={() => setRecord("")} onChanged={list.reload} />
  </>;
}

