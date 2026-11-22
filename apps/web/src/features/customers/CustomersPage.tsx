import { useMemo, useState, type FormEvent } from "react";
import { useLocation, useSearchParams } from "wouter";
import { Plus, ScanLine } from "lucide-react";
import { formatPlateDisplay, type BranchId } from "@garage/domain";
import {
  DataTable, DateText, DetailDrawer, EmptyState, FilterBar, PageHeader, RecordRef, TabBar, TabPanel, resolveWarrantyCode, useUrlState,
  type Column, type ResolvedWarranty,
} from "../../shared/components";
import { hasCapability } from "../../shared/capabilities";
import { DuplicatesPanel } from "./DuplicatesPanel";
import { SpecialRequestsPanel } from "../special-requests/SpecialRequestsPanel";
import { useGarageStore } from "../../shared/store";
import { customerDisplay, type PageProps } from "../../shared/ui";
import { CustomerForm, writeErrorMessage, type BranchOption } from "./CustomerForm";
import { customerStats, defaultFormBranch, filterCustomers, findByPlate, recordFromParams, scopeNote } from "./customers-logic";
import { CustomerDetail, VehicleDetail } from "./RecordDetail";
import { PhoneCell, PlateChips } from "./Record360View";
import "./customers.css";

type Row = ReturnType<typeof filterCustomers>[number];

interface CustomersPageProps extends PageProps {
  /** Kept for the shell's call site; the page reads the real branch from the store. */
  branchId?: BranchId | "all";
}

type LookupState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "none" }
  | { status: "error" }
  | { status: "found"; result: ResolvedWarranty };

export function CustomersPage({ lang, t, state, notify }: CustomersPageProps) {
  const store = useGarageStore();
  const actor = store.actor;
  const [, navigate] = useLocation();
  const [params] = useSearchParams();
  const open = recordFromParams(params);
  const canAdd = !!actor && actor.role !== "technician";

  const branchOptions: BranchOption[] = useMemo(() => {
    if (!actor) return [];
    const allowed = actor.role === "owner" ? state.branches : state.branches.filter((branch) => actor.branchIds.includes(branch.id));
    return allowed.map((branch) => ({ id: branch.id, label: lang === "ar" && branch.nameAr ? branch.nameAr : branch.name }));
  }, [actor, state.branches, lang]);

  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("all");
  const [adding, setAdding] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [tabValue, setTab] = useUrlState("tab", "customers");
  const canSeeRequests = hasCapability(actor, "bookings.manage");
  const canSeeDuplicates = hasCapability(actor, "settings.manage");
  const tab = tabValue === "requests" && canSeeRequests ? "requests" : tabValue === "duplicates" && canSeeDuplicates ? "duplicates" : "customers";

  const all = state.customers;
  const rows = useMemo(() => filterCustomers(all, query).filter((customer) => language === "all" || customer.language === language), [all, query, language]);
  const stats = useMemo(() => customerStats(state.bookings, state.jobs, new Date().toISOString().slice(0, 10)), [state.bookings, state.jobs]);
  const currentBranch = state.branches.find((item) => item.id === state.currentBranch);
  const scope = scopeNote({
    lang, role: actor?.role, currentBranch: state.currentBranch,
    currentBranchName: currentBranch ? (lang === "ar" && currentBranch.nameAr ? currentBranch.nameAr : currentBranch.name) : undefined,
    branchNames: branchOptions.map((branch) => branch.label),
  });
  const loading = store.status === "loading" && all.length === 0;
  const clear = () => { setQuery(""); setLanguage("all"); };

  const openCustomer = (id: string) => navigate(`/workspace/customers?customer=${encodeURIComponent(id)}`);

  if (open?.kind === "customer") return <CustomerDetail lang={lang} state={state} id={open.id} canEdit={canAdd} notify={notify} />;
  if (open?.kind === "vehicle") return <VehicleDetail lang={lang} state={state} id={open.id} canEdit={false} notify={notify} />;

  const create = async (values: { name: string; phone: string; plate: string; makeModel: string; language: "ar" | "en"; branchId: string }) => {
    const result = await store.createCustomer({ ...values, name: values.name.trim(), phone: values.phone.trim(), plate: values.plate.trim(), makeModel: values.makeModel.trim(), branchId: values.branchId as BranchId });
    if (!result.ok) return writeErrorMessage(result.error, lang);
    setAdding(false);
    notify(t("Customer and vehicle saved.", "تم حفظ العميل والمركبة."));
    return null;
  };

  // Plate first (store), then warranty code / QR through the server resolver.
  const scan = async (event: FormEvent) => {
    event.preventDefault();
    const value = code.trim();
    if (!value) return;
    const byPlate = findByPlate(all, value);
    if (byPlate) { navigate(`/workspace/customers?vehicle=${encodeURIComponent(byPlate.vehicle.id)}`); return; }
    setLookup({ status: "busy" });
    try {
      const result = await resolveWarrantyCode(value);
      setLookup(result ? { status: "found", result } : { status: "none" });
    } catch {
      setLookup({ status: "error" });
    }
  };

  const columns: Column<Row>[] = [
    { key: "name", header: t("Customer", "العميل"), sortable: true, primary: true, sortValue: (row) => row.name, csv: (row) => row.name, render: (row) => customerDisplay(row.name, lang) },
    { key: "phone", header: t("Phone", "الهاتف"), mono: true, csv: (row) => row.phone, render: (row) => <PhoneCell phone={row.phone} lang={lang} /> },
    { key: "vehicles", header: t("Vehicles", "المركبات"), csv: (row) => row.vehicles.map((vehicle) => formatPlateDisplay(vehicle.plate)).join(" | "), sortable: true, sortValue: (row) => row.vehicles.length, render: (row) => <PlateChips vehicles={row.vehicles.map((vehicle) => ({ id: vehicle.id, plate: vehicle.plate }))} lang={lang} /> },
    { key: "lastVisit", header: t("Last visit", "آخر زيارة"), sortable: true, sortValue: (row) => stats.get(row.id)?.lastVisit ?? "", render: (row) => <DateText value={stats.get(row.id)?.lastVisit} lang={lang} /> },
    { key: "openJobs", header: t("Open jobs", "أوامر مفتوحة"), numeric: true, sortable: true, sortValue: (row) => stats.get(row.id)?.openJobs ?? 0, render: (row) => stats.get(row.id)?.openJobs ?? 0 },
  ];

  const lookupNote = lookup.status === "busy" ? t("Looking up…", "جارٍ البحث…")
    : lookup.status === "none" ? t("No vehicle or warranty matches this code.", "لا توجد مركبة أو ضمان بهذا الرمز.")
    : lookup.status === "error" ? t("Lookup failed. Try again.", "تعذر البحث. حاول مرة أخرى.")
    : "";

  const addButton = canAdd ? <button type="button" className="btn btn-primary cust-nowrap" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" />{t("Add customer", "إضافة عميل")}</button> : undefined;
  const lookupLabel = t("Plate or QR lookup", "بحث باللوحة أو QR");

  return <>
    <PageHeader
      title={t("Customers", "العملاء")}
      meta={tab === "customers" ? <span>{all.length} {t("customers", "عميل")} · {scope}</span> : undefined}
      actions={tab === "customers" ? <>
        <button type="button" className="btn cust-nowrap" aria-expanded={scanOpen} aria-label={lookupLabel} title={lookupLabel} onClick={() => setScanOpen((value) => !value)}><ScanLine size={18} aria-hidden="true" /></button>
        {addButton}
      </> : undefined}
      tabs={canSeeRequests || canSeeDuplicates ? <TabBar ariaLabel={t("Customers", "العملاء")} idPrefix="cust" value={tab} onChange={setTab}
        tabs={[{ id: "customers", label: t("Customers", "العملاء") },
          ...(canSeeRequests ? [{ id: "requests", label: t("Special requests", "الطلبات الخاصة") }] : []),
          ...(canSeeDuplicates ? [{ id: "duplicates", label: t("Duplicates", "التكرارات") }] : [])]} /> : undefined}
    />
    <TabPanel idPrefix="cust" id="requests" active={tab === "requests"}><SpecialRequestsPanel lang={lang} notify={notify} /></TabPanel>
    {tab === "duplicates" && <TabPanel idPrefix="cust" id="duplicates" active><DuplicatesPanel lang={lang} notify={notify} /></TabPanel>}
    {tab === "customers" && <TabPanel idPrefix="cust" id="customers" active>
    {scanOpen && <form className="cust-lookup" onSubmit={(event) => void scan(event)} role="search" aria-label={lookupLabel}>
      <input className="field-input mono" dir="ltr" autoFocus value={code} onChange={(event) => { setCode(event.target.value); if (lookup.status !== "idle") setLookup({ status: "idle" }); }}
        placeholder={t("Plate or warranty QR", "اللوحة أو QR الضمان")} aria-label={t("Plate or warranty QR code", "اللوحة أو رمز QR للضمان")} />
      {code.trim() && <button type="submit" className="btn cust-nowrap" disabled={lookup.status === "busy"}>{t("Find", "بحث")}</button>}
      {lookupNote && <p className="cust-lookup-note" role="status" data-tone={lookup.status === "error" ? "error" : undefined}>{lookupNote}</p>}
      {lookup.status === "found" && <div className="cust-lookup-note" role="status">
        <span className="plate-chips">
          {lookup.result.customer && <RecordRef type="customer" id={lookup.result.customer.id} label={lookup.result.customer.title} mode="link" />}
          {lookup.result.vehicle && <RecordRef type="vehicle" id={lookup.result.vehicle.id} label={lookup.result.vehicle.title} mode="link" />}
          {lookup.result.warranty && <RecordRef type="warranty" id={lookup.result.warranty.id} label={lookup.result.warranty.title || undefined} badge={lookup.result.warranty.badge} />}
        </span>
      </div>}
    </form>}
    <FilterBar
      lang={lang}
      search={{ value: query, onChange: setQuery, placeholder: t("Name, phone or plate", "الاسم أو الهاتف أو اللوحة") }}
      filters={[{ key: "language", label: t("Language", "اللغة"), value: language, onChange: setLanguage, options: [{ value: "all", label: t("All languages", "كل اللغات") }, { value: "ar", label: t("Arabic", "العربية") }, { value: "en", label: t("English", "الإنجليزية") }] }]}
      onClear={clear}
      resultCount={rows.length}
      viewsId="customers"
    />
    <DataTable
      listId="customers"
      exportName="customers"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      lang={lang}
      caption={t("Customers", "العملاء")}
      loading={loading}
      error={store.status === "error" && all.length === 0 ? t("Customers could not be loaded.", "تعذر تحميل العملاء.") : null}
      onRetry={() => void store.refresh()}
      onRowClick={(row) => openCustomer(row.id)}
      initialSort={{ key: "name", direction: "asc" }}
      empty={all.length === 0
        ? <EmptyState title={t("No customers yet", "لا يوجد عملاء بعد")} text={scope} action={addButton} />
        : <EmptyState variant="no-results" title={t("No matching customers", "لا يوجد عملاء مطابقون")} action={<button type="button" className="btn" onClick={clear}>{t("Clear filters", "مسح التصفية")}</button>} />}
    />
    <DetailDrawer open={adding} onClose={() => setAdding(false)} lang={lang} title={t("Add customer", "إضافة عميل")}>
      <CustomerForm lang={lang} mode="create" branches={branchOptions}
        defaultBranchId={defaultFormBranch(branchOptions.map((branch) => branch.id), state.currentBranch)}
        onCancel={() => setAdding(false)} onSubmit={create} />
    </DetailDrawer>
    </TabPanel>}
  </>;
}
