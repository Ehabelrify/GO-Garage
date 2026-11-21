import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { Locale } from "@garage/domain";
import { DataTable, DetailDrawer, EmptyState, FilterBar, Money, RecordRef, StatusBadge, useUrlState, type Column } from "../../shared/components";
import { hasCapability } from "../../shared/capabilities";
import { useGarageStore } from "../../shared/store";
import { dateLabel } from "../../shared/ui";
import { RequestDrawer } from "./RequestDrawer";
import { RequestForm } from "./RequestForm";
import { listRequests } from "./special-requests-api";
import { dateRange, filterRequests, requestStatuses, type SpecialRequest } from "./special-requests-logic";
import "./special-requests.css";

const statusAr: Record<string, string> = { new: "جديد", "under-review": "قيد المراجعة", "needs-info": "يحتاج معلومات", accepted: "مقبول", declined: "مرفوض", closed: "مغلق" };

/**
 * Requests tab of the Customers page: the owner review queue (and staff list). Rows open a drawer deep-linked with ?record=.
 * Reviewers (special-requests.review) see internal notes and the decision controls; staff with bookings.manage can create
 * requests and answer questions. Open requests are listed first by default.
 */
export function SpecialRequestsPanel({ lang, notify }: { lang: Locale; notify: (message: string) => void }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const store = useGarageStore();
  const canReview = hasCapability(store.actor, "special-requests.review");
  const canCreate = hasCapability(store.actor, "bookings.manage") && !store.actor?.isDemo;
  const [rows, setRows] = useState<SpecialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [record, setRecord] = useUrlState("record", "");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("open");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setRows((await listRequests()).requests);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = filterRequests(rows, { query, status });
  const clear = () => { setQuery(""); setStatus("open"); };
  const columns: Column<SpecialRequest>[] = [
    { key: "title", header: t("Request", "الطلب"), primary: true, sortable: true, sortValue: (row) => row.title, render: (row) => row.title },
    { key: "customer", header: t("Customer", "العميل"), sortable: true, sortValue: (row) => row.customerName, render: (row) => <RecordRef type="customer" id={row.customerId} label={row.customerName} /> },
    { key: "vehicle", header: t("Vehicle", "المركبة"), render: (row) => <RecordRef type="vehicle" id={row.vehicleId} label={row.plate} /> },
    { key: "date", header: t("Requested", "المطلوب"), sortable: true, sortValue: (row) => row.requestedFrom, render: (row) => <bdi>{dateRange(row.requestedFrom, row.requestedTo)}</bdi> },
    { key: "price", header: t("Offer", "العرض"), numeric: true, render: (row) => row.reply?.quotedPrice ? <Money minor={row.reply.quotedPrice.minor} currency={row.reply.quotedPrice.currency} lang={lang} /> : "—" },
    { key: "created", header: t("Created", "أُنشئ"), sortable: true, sortValue: (row) => row.createdAt, render: (row) => dateLabel(row.createdAt.slice(0, 10), lang) },
    { key: "status", header: t("Status", "الحالة"), sortable: true, sortValue: (row) => row.status, render: (row) => <StatusBadge status={row.status} lang={lang} domain="request" /> },
  ];

  return <div className="sr-stack">
    {canCreate && <div className="sr-row"><button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />{t("New special request", "طلب خاص جديد")}</button></div>}
    <FilterBar lang={lang} search={{ value: query, onChange: setQuery, placeholder: t("Search title, customer or plate", "ابحث بالعنوان أو العميل أو اللوحة") }}
      filters={[{ key: "status", label: t("Status", "الحالة"), value: status, onChange: setStatus, options: [
        { value: "open", label: t("Open (needs action)", "المفتوحة") }, { value: "all", label: t("All statuses", "كل الحالات") },
        ...requestStatuses.map((value) => ({ value, label: lang === "ar" ? statusAr[value] : value[0].toUpperCase() + value.slice(1).replace("-", " ") })),
      ] }]}
      onClear={clear} resultCount={shown.length} />
    <DataTable<SpecialRequest> columns={columns} rows={shown} rowKey={(row) => row.id} lang={lang} caption={t("Special requests", "الطلبات الخاصة")}
      loading={loading} error={error ? t("Special requests could not be loaded.", "تعذر تحميل الطلبات الخاصة.") : null} onRetry={() => void load()}
      onRowClick={(row) => setRecord(row.id)} selectedKey={record || null}
      empty={rows.length === 0
        ? <EmptyState title={t("No special requests yet", "لا توجد طلبات خاصة بعد")} action={canCreate ? <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>{t("New special request", "طلب خاص جديد")}</button> : undefined} />
        : <EmptyState variant="no-results" title={t("No matching requests", "لا توجد طلبات مطابقة")} action={<button type="button" className="btn" onClick={clear}>{t("Clear filters", "مسح التصفية")}</button>} />} />
    {record && <RequestDrawer lang={lang} id={record} canReview={canReview} canStaffAct={canCreate} onClose={() => setRecord("")} onChanged={() => void load()} />}
    <DetailDrawer open={creating} onClose={() => setCreating(false)} lang={lang} title={t("New special request", "طلب خاص جديد")}>
      <RequestForm lang={lang} onCancel={() => setCreating(false)} onCreated={(id) => { setCreating(false); notify(t("Request created.", "تم إنشاء الطلب.")); void load(); setRecord(id); }} />
    </DetailDrawer>
  </div>;
}
