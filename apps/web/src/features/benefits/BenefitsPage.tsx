import { useMemo, useState } from "react";
import type { BenefitEntitlement, Locale } from "@garage/domain";
import { benefitApi, useGarageStore } from "../../shared/store";
import { DataTable, DetailDrawer, EmptyState, FilterBar, PageHeader, RecordRef, StatusBadge, useUrlState, type Column } from "../../shared/components";
import { commercialError } from "../quotes/commercial-errors";
import { useLoader } from "../quotes/commercial-data";
import { buildLookups, tr } from "../quotes/lookups";
import { BenefitDetail } from "./BenefitDetail";
import { benefitName, filterBenefits, limitText } from "./benefit-logic";
import "../quotes/commercial.css";

/** Benefits tab of Quotes & offers: what customers are entitled to after accepting a quote. */
export function BenefitsPage({ lang, embedded = false }: { lang: Locale; embedded?: boolean }) {
  const t = tr(lang);
  const store = useGarageStore();
  const lookups = useMemo(() => buildLookups(store.state, lang), [store.state, lang]);
  const list = useLoader(() => benefitApi.list(), [] as BenefitEntitlement[], (error) => commercialError(error, lang));
  const [record, setRecord] = useUrlState("record", "");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const rows = list.data;
  const shown = filterBenefits(rows, { query, status }, (row) => `${benefitName(row.benefit, lang)} ${lookups.customerName(row.customerId)} ${lookups.plate(row.vehicleId)}`);
  const clear = () => { setQuery(""); setStatus("all"); };

  const columns: Column<BenefitEntitlement>[] = [
    { key: "benefit", header: t("Benefit", "المنفعة"), primary: true, sortable: true, sortValue: (row) => benefitName(row.benefit, lang), render: (row) => benefitName(row.benefit, lang) },
    { key: "customer", header: t("Customer", "العميل"), sortable: true, sortValue: (row) => lookups.customerName(row.customerId), render: (row) => <RecordRef type="customer" id={row.customerId} label={lookups.customerName(row.customerId)} /> },
    { key: "vehicle", header: t("Vehicle", "المركبة"), sortable: true, sortValue: (row) => lookups.plate(row.vehicleId), render: (row) => <RecordRef type="vehicle" id={row.vehicleId} label={lookups.plate(row.vehicleId)} subtitle={lookups.vehicleModel(row.vehicleId)} /> },
    { key: "limit", header: t("Allowance", "المسموح"), hideOnCard: false, render: (row) => limitText(row.limit, lang) },
    { key: "status", header: t("Status", "الحالة"), sortable: true, sortValue: (row) => row.status, render: (row) => <StatusBadge status={row.status} lang={lang} domain="benefit" /> },
  ];
  const open = rows.find((row) => row.id === record);

  return <div className="qo-page">
    {!embedded && <PageHeader title={t("Benefits", "المنافع")} subtitle={t("Created when a quote with benefits is accepted.", "تُنشأ عند قبول عرض سعر يتضمن منافع.")} />}
    <FilterBar lang={lang} search={{ value: query, onChange: setQuery, placeholder: t("Search benefit, customer or plate", "ابحث بالمنفعة أو العميل أو اللوحة") }}
      filters={[{ key: "status", label: t("Status", "الحالة"), value: status, onChange: setStatus, options: [{ value: "all", label: t("All statuses", "كل الحالات") }, { value: "active", label: t("Active", "ساري") }, { value: "exhausted", label: t("Used up", "مستنفد") }, { value: "cancelled", label: t("Cancelled", "ملغي") }] }]}
      onClear={clear} resultCount={shown.length} />
    <DataTable<BenefitEntitlement> columns={columns} rows={shown} rowKey={(row) => row.id} lang={lang} caption={t("Benefits", "المنافع")}
      onRowClick={(row) => setRecord(row.id)} selectedKey={record || null} loading={list.loading && rows.length === 0} error={list.error} onRetry={list.reload}
      empty={rows.length === 0
        ? <EmptyState title={t("No benefits yet", "لا توجد منافع بعد")} text={t("They appear after a quote with benefits is accepted.", "تظهر بعد قبول عرض سعر يتضمن منافع.")} />
        : <EmptyState variant="no-results" title={t("No matching benefits", "لا توجد منافع مطابقة")} action={<button type="button" className="btn" onClick={clear}>{t("Clear filters", "مسح التصفية")}</button>} />} />
    <DetailDrawer open={!!record} onClose={() => setRecord("")} lang={lang} wide
      title={open ? benefitName(open.benefit, lang) : t("Benefit", "منفعة")} subtitle={open ? lookups.customerName(open.customerId) || undefined : undefined}>
      {record && <BenefitDetail key={record} id={record} lang={lang} onChanged={list.reload} />}
    </DetailDrawer>
  </div>;
}

export default BenefitsPage;
