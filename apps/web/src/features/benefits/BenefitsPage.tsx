import { useMemo, useState } from "react";
import type { BenefitEntitlement, Locale } from "@garage/domain";
import { benefitApi, useGarageStore } from "../../shared/store";
import { DataTable, DetailDrawer, EmptyState, FilterBar, PageHeader, Plate, RecordRef, StatusBadge, useUrlState, type Column } from "../../shared/components";
import { ReadOnlyNote, useCanManageQuotes } from "../quotes/access";
import { commercialError } from "../quotes/commercial-errors";
import { useLoader } from "../quotes/commercial-data";
import { buildLookups, tr } from "../quotes/lookups";
import { BenefitDetail } from "./BenefitDetail";
import { benefitName, filterBenefits, groupBenefits, groupStatus, shortLimitText, type BenefitGroup } from "./benefit-logic";
import "../quotes/commercial.css";

/** Benefits tab of Quotes & offers: what customers are entitled to after accepting a quote, one row per customer and vehicle. */
export function BenefitsPage({ lang, embedded = false }: { lang: Locale; embedded?: boolean }) {
  const t = tr(lang);
  const store = useGarageStore();
  const canManage = useCanManageQuotes();
  const lookups = useMemo(() => buildLookups(store.state, lang), [store.state, lang]);
  const list = useLoader(() => benefitApi.list(), [] as BenefitEntitlement[], (error) => commercialError(error, lang));
  const [record, setRecord] = useUrlState("record", "");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const rows = list.data;
  const shown = filterBenefits(rows, { query, status }, (row) => `${benefitName(row.benefit, lang)} ${lookups.customerName(row.customerId)} ${lookups.plate(row.vehicleId)}`);
  const groups = useMemo(() => groupBenefits(shown), [shown]);
  const clear = () => { setQuery(""); setStatus("all"); };
  const open = rows.find((row) => row.id === record);

  const columns: Column<BenefitGroup>[] = [
    { key: "customer", header: t("Customer", "العميل"), primary: true, sortable: true, sortValue: (group) => lookups.customerName(group.customerId), render: (group) => <RecordRef type="customer" id={group.customerId} label={lookups.customerName(group.customerId)} /> },
    { key: "vehicle", header: t("Vehicle", "المركبة"), sortable: true, sortValue: (group) => lookups.plate(group.vehicleId), render: (group) => {
      const plate = lookups.plate(group.vehicleId);
      const model = lookups.vehicleModel(group.vehicleId);
      return <span>{plate ? <Plate value={plate} /> : "—"}{model && <span className="qo-cell-sub"><bdi>{model}</bdi></span>}</span>;
    } },
    { key: "benefits", header: t("Benefits", "المنافع"), render: (group) => <span className="qo-chip-row">
      {group.items.map((item) => <button key={item.id} type="button" className="qo-chip" data-state={item.status} onClick={() => setRecord(item.id)} title={`${benefitName(item.benefit, lang)} · ${shortLimitText(item.limit, lang)}`}>
        <bdi>{benefitName(item.benefit, lang)}</bdi><span className="qo-muted">{item.status === "active" ? shortLimitText(item.limit, lang) : ""}</span>
      </button>)}
    </span> },
    { key: "status", header: t("Status", "الحالة"), sortable: true, sortValue: (group) => groupStatus(group), render: (group) => <StatusBadge status={groupStatus(group)} lang={lang} domain="benefit" /> },
  ];

  return <div className="qo-page">
    {!embedded && <PageHeader title={t("Benefits", "المنافع")} subtitle={t("Created when a quote with benefits is accepted.", "تُنشأ عند قبول عرض سعر يتضمن منافع.")} meta={!canManage ? <ReadOnlyNote lang={lang} /> : undefined} />}
    <FilterBar lang={lang} search={{ value: query, onChange: setQuery, placeholder: t("Search benefit, customer or plate", "ابحث بالمنفعة أو العميل أو اللوحة") }}
      filters={[{ key: "status", label: t("Status", "الحالة"), value: status, onChange: setStatus, options: [{ value: "all", label: t("All statuses", "كل الحالات") }, { value: "active", label: t("Active", "ساري") }, { value: "exhausted", label: t("Used up", "مستنفد") }, { value: "cancelled", label: t("Cancelled", "ملغي") }] }]}
      onClear={clear} resultCount={groups.length} />
    <DataTable<BenefitGroup> columns={columns} rows={groups} rowKey={(group) => group.key} lang={lang} caption={t("Benefits", "المنافع")}
      loading={list.loading && rows.length === 0} error={list.error} onRetry={list.reload}
      empty={rows.length === 0
        ? <EmptyState title={t("No benefits yet", "لا توجد منافع بعد")} text={t("They appear after a quote with benefits is accepted.", "تظهر بعد قبول عرض سعر يتضمن منافع.")} />
        : <EmptyState variant="no-results" title={t("No matching benefits", "لا توجد منافع مطابقة")} action={<button type="button" className="btn" onClick={clear}>{t("Clear filters", "مسح التصفية")}</button>} />} />
    <DetailDrawer open={!!record} onClose={() => setRecord("")} lang={lang} wide
      title={open ? benefitName(open.benefit, lang) : t("Benefit", "منفعة")} subtitle={open ? lookups.customerName(open.customerId) || undefined : undefined}>
      {record && <BenefitDetail key={record} id={record} lang={lang} onChanged={list.reload} canManage={canManage} />}
    </DetailDrawer>
  </div>;
}

export default BenefitsPage;
