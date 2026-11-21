import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Locale } from "@garage/domain";
import { reservationApi, useGarageStore } from "../../shared/store";
import { Collapsible, DataTable, DetailDrawer, EmptyState, FilterBar, PageHeader, RecordRef, StatusBadge, useUrlState, type Column } from "../../shared/components";
import { dateLabel } from "../../shared/ui";
import { commercialError } from "../quotes/commercial-errors";
import { useLoader } from "../quotes/commercial-data";
import { buildLookups, tr } from "../quotes/lookups";
import { daysBetween, filterReservations, reservationStatus, schedulableGroups, type ReservationRow } from "./reservation-logic";
import { policyLabel, todayIso } from "../quotes/quote-logic";
import { GroupScheduler } from "./GroupScheduler";
import { ReservationDetail } from "./ReservationDetail";
import { ReserveOffer } from "./ReserveOffer";
import "../quotes/commercial.css";

const statusOptions = ["reserved", "scheduled", "redeemed", "cancelled", "expired"] as const;
const statusNames: Record<(typeof statusOptions)[number], { en: string; ar: string }> = {
  reserved: { en: "Reserved", ar: "محجوز" }, scheduled: { en: "Scheduled", ar: "مجدول" }, redeemed: { en: "Redeemed", ar: "مستخدم" }, cancelled: { en: "Cancelled", ar: "ملغي" }, expired: { en: "Expired", ar: "منتهي" },
};

/** Reservations tab of Quotes & offers. `embedded` hides the page title when a parent shell provides it. */
export function ReservationsPage({ lang, embedded = false }: { lang: Locale; embedded?: boolean }) {
  const t = tr(lang);
  const store = useGarageStore();
  const lookups = useMemo(() => buildLookups(store.state, lang), [store.state, lang]);
  const list = useLoader(() => reservationApi.list(), [] as ReservationRow[], (error) => commercialError(error, lang));
  const [record, setRecord] = useUrlState("record", "");
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const rows = list.data;
  const shown = filterReservations(rows, { query, status }, (row) => `${lookups.customerName(row.beneficiaryId)} ${lookups.plate(row.vehicleId)}`);
  const groups = schedulableGroups(rows);
  const canCreate = store.actor?.role !== "technician";
  const clear = () => { setQuery(""); setStatus("all"); };
  const openRow = rows.find((item) => item.id === record);
  const drawerTitle = openRow ? [lookups.customerName(openRow.beneficiaryId), lookups.plate(openRow.vehicleId)].filter(Boolean).join(" · ") || t("Reservation", "حجز") : t("Reservation", "حجز");

  const columns: Column<ReservationRow>[] = [
    { key: "customer", header: t("Customer", "العميل"), primary: true, sortable: true, sortValue: (row) => lookups.customerName(row.beneficiaryId), render: (row) => <RecordRef type="customer" id={row.beneficiaryId} label={lookups.customerName(row.beneficiaryId)} /> },
    { key: "vehicle", header: t("Vehicle", "المركبة"), sortable: true, sortValue: (row) => lookups.plate(row.vehicleId), render: (row) => <RecordRef type="vehicle" id={row.vehicleId} label={lookups.plate(row.vehicleId)} subtitle={lookups.vehicleModel(row.vehicleId)} /> },
    { key: "promotion", header: t("Promotion", "العرض الترويجي"), render: (row) => row.reservation ? policyLabel(row.reservation.promotion, null, lang) : "—" },
    { key: "valid", header: t("Valid until", "صالح حتى"), sortable: true, sortValue: (row) => row.reservation?.expiresOn ?? "9999", render: (row) => {
      const end = row.reservation?.expiresOn;
      if (!end) return row.reservation ? t("No end date", "بدون تاريخ انتهاء") : "—";
      const left = daysBetween(todayIso(), end);
      return <span>{dateLabel(end, lang)}{row.reservation?.status === "reserved" && left >= 0 && left <= 7 && <> <span className="tag">{t(`${left} days left`, `باقٍ ${left} أيام`)}</span></>}</span>;
    } },
    { key: "status", header: t("Status", "الحالة"), sortable: true, sortValue: (row) => reservationStatus(row), render: (row) => <StatusBadge status={reservationStatus(row)} lang={lang} domain="reservation" label={row.state === "enquiry" ? t("Enquiry", "استفسار") : undefined} /> },
  ];

  return <div className="qo-page">
    {!embedded && <PageHeader title={t("Reservations", "الحجوزات المؤجلة")} actions={canCreate && <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" />{t("Reserve an offer", "احجز عرضاً")}</button>} />}
    {embedded && canCreate && <div className="qo-row"><button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" />{t("Reserve an offer", "احجز عرضاً")}</button></div>}
    <FilterBar lang={lang} search={{ value: query, onChange: setQuery, placeholder: t("Search customer or plate", "ابحث بالعميل أو اللوحة") }}
      filters={[{ key: "status", label: t("Status", "الحالة"), value: status, onChange: setStatus, options: [{ value: "all", label: t("All statuses", "كل الحالات") }, ...statusOptions.map((value) => ({ value, label: statusNames[value][lang] }))] }]}
      onClear={clear} resultCount={shown.length} />
    <DataTable<ReservationRow> columns={columns} rows={shown} rowKey={(row) => row.id} lang={lang} caption={t("Reservations", "الحجوزات المؤجلة")}
      onRowClick={(row) => setRecord(row.id)} selectedKey={record || null} loading={list.loading && rows.length === 0} error={list.error} onRetry={list.reload}
      initialSort={{ key: "valid", direction: "asc" }}
      empty={rows.length === 0
        ? <EmptyState title={t("No reservations yet", "لا توجد حجوزات بعد")} action={canCreate ? <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>{t("Reserve an offer", "احجز عرضاً")}</button> : undefined} />
        : <EmptyState variant="no-results" title={t("No matching reservations", "لا توجد حجوزات مطابقة")} action={<button type="button" className="btn" onClick={clear}>{t("Clear filters", "مسح التصفية")}</button>} />} />

    {groups.length > 0 && <Collapsible title={t("Book vehicles together", "حجز عدة مركبات معاً")} count={groups.length}>
      <div className="qo-stack">{groups.map((group) => <GroupScheduler key={group.qualificationId} lang={lang} rows={group.rows} onDone={list.reload} />)}</div>
    </Collapsible>}

    <DetailDrawer open={!!record} onClose={() => setRecord("")} lang={lang} title={drawerTitle} subtitle={t("Reservation", "حجز")} wide>
      {record && <ReservationDetail key={record} lang={lang} id={record} onChanged={list.reload} />}
    </DetailDrawer>
    <DetailDrawer open={adding} onClose={() => setAdding(false)} lang={lang} title={t("Reserve an offer", "احجز عرضاً")} wide>
      {adding && <ReserveOffer lang={lang} onReserved={(id) => { setAdding(false); list.reload(); setRecord(id); }} />}
    </DetailDrawer>
  </div>;
}

export default ReservationsPage;
