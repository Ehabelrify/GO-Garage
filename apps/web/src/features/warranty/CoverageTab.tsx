import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Plus, ScanLine } from "lucide-react";
import type { WarrantyRecord, WarrantyStatus } from "@garage/domain";
import { filterWarrantyRecords } from "@garage/domain";
import {
  Collapsible, ConfirmDialog, DataTable, DetailDrawer, EmptyState, FilterBar, RecordRef, StatusBadge,
  resolveWarrantyCode, useUrlState, type Column, type ResolvedWarranty,
} from "../../shared/components";
import { stageNames } from "../../shared/labels";
import { WarrantyInvoicePanel } from "./WarrantyInvoicePanel";
import { claimIsActive, extractWarrantyCode, formatDate, formatDateTime, policyForWarranty } from "./warranty-logic";
import { qrActionLabel } from "./warranty-copy";
import { CustomerLink, JobLink, VehicleLink, type WarrantyScope } from "./warranty-scope";

type Lookup = { status: "idle" | "busy" | "none" | "error" } | { status: "found"; result: ResolvedWarranty };

export function CoverageTab({ scope, onOpenClaim, onIssue, onNewClaim }: {
  scope: WarrantyScope; onOpenClaim: (claimId: string) => void; onIssue: () => void; onNewClaim: (warrantyId: string) => void;
}) {
  const { t, lang, state, store, notify, warranties } = scope;
  const [recordId, setRecordId] = useUrlState("record", "");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<WarrantyStatus | "all">("all");
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
  const [voidId, setVoidId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState("");
  const [voiding, setVoiding] = useState(false);

  useEffect(() => { setVoidId(null); setVoidReason(""); }, [state.currentBranch, scope.userId]);

  const rows = useMemo(() => filterWarrantyRecords(warranties, query, status, (record) => {
    const vehicle = scope.vehicleOf(record.customerId, record.vehicleId);
    const customer = state.customers.find((item) => item.id === record.customerId);
    const invoice = state.warrantyInvoiceDrafts.find((item) => item.warrantyId === record.id);
    return `${record.id} ${record.policyName} ${record.jobId} ${customer?.name ?? ""} ${customer?.phone ?? ""} ${vehicle?.plate ?? ""} ${vehicle?.makeModel ?? ""} ${scope.serviceName(record.serviceId)} ${invoice?.id ?? ""}`;
  }), [warranties, query, status, state.customers, state.warrantyInvoiceDrafts, lang]);

  const open = warranties.find((item) => item.id === recordId) ?? null;
  const loading = store.status === "loading" && state.warranties.length === 0;
  const filtersActive = Boolean(query) || status !== "all";
  const clear = () => { setQuery(""); setStatus("all"); };

  const findCode = async () => {
    const value = extractWarrantyCode(code);
    if (!value) return;
    setLookup({ status: "busy" });
    try {
      const result = await resolveWarrantyCode(value);
      setLookup(result ? { status: "found", result } : { status: "none" });
      if (result?.warranty && warranties.some((item) => item.id === result.warranty?.id)) setRecordId(result.warranty.id);
    } catch { setLookup({ status: "error" }); }
  };

  const confirmVoid = async () => {
    if (!voidId || !voidReason.trim() || voiding) return;
    setVoiding(true); setVoidError("");
    const result = await store.voidWarranty(voidId, voidReason.trim());
    setVoiding(false);
    if (!result.ok) { setVoidError(scope.error(result.error)); return; }
    setVoidId(null); setVoidReason("");
    notify(t("Warranty voided.", "أُلغي الضمان."));
  };

  const columns: Column<WarrantyRecord>[] = [
    { key: "customer", header: t("Customer", "العميل"), primary: true, sortable: true,
      sortValue: (r) => scope.customerName(r.customerId), render: (r) => <CustomerLink scope={scope} customerId={r.customerId} /> },
    { key: "vehicle", header: t("Vehicle", "المركبة"), render: (r) => <VehicleLink scope={scope} customerId={r.customerId} vehicleId={r.vehicleId} /> },
    { key: "policy", header: t("Coverage", "التغطية"), sortable: true, sortValue: (r) => r.policyName,
      render: (r) => <><div>{r.policyName}</div><div className="secondary-cell">{scope.serviceName(r.serviceId)}</div></> },
    { key: "status", header: t("Status", "الحالة"), sortable: true, sortValue: (r) => r.status, render: (r) => <StatusBadge status={r.status} domain="warranty" lang={lang} /> },
    { key: "ends", header: t("Ends", "تنتهي"), sortable: true, sortValue: (r) => r.expiresOn ?? "9999",
      render: (r) => r.coverageKind === "lifetime" ? t("Lifetime", "مدى الحياة") : formatDate(r.expiresOn, lang) },
  ];

  return <>
    <FilterBar lang={lang} resultCount={rows.length}
      search={{ value: query, onChange: setQuery, placeholder: t("Customer, plate, policy or job…", "العميل أو اللوحة أو السياسة أو أمر الشغل…") }}
      filters={[{ key: "status", label: t("Status", "الحالة"), value: status, allValue: "all", onChange: (v) => setStatus(v as WarrantyStatus | "all"),
        options: [{ value: "all", label: t("All statuses", "كل الحالات") }, ...(["active", "expired", "terminated", "void"] as const).map((s) => ({ value: s, label: s === "active" ? t("Active", "ساري") : s === "expired" ? t("Expired", "منتهي") : s === "terminated" ? t("Terminated", "مُنهى") : t("Void", "ملغى") }))] }]}
      onClear={filtersActive ? clear : undefined}>
      <form className="w-lookup" onSubmit={(event) => { event.preventDefault(); void findCode(); }}>
        <label><span className="sr-only">{t("Scan or enter a warranty code", "امسح أو أدخل رمز الضمان")}</span>
          <input className="field-input" value={code} onChange={(event) => { setCode(event.target.value); setLookup({ status: "idle" }); }}
            placeholder={t("Scan or paste a QR code", "امسح أو الصق رمز QR")} /></label>
        <button className="btn" type="submit" disabled={!code.trim() || lookup.status === "busy"}><ScanLine size={15} />{lookup.status === "busy" ? t("Finding…", "جارٍ البحث…") : t("Find", "بحث")}</button>
      </form>
    </FilterBar>

    {lookup.status === "none" && <p className="form-hint" role="status">{t("No warranty matches this code.", "لا يوجد ضمان مطابق لهذا الرمز.")}</p>}
    {lookup.status === "error" && <p className="form-error" role="alert">{t("Lookup failed. Try again.", "فشل البحث. حاول مجدداً.")}</p>}
    {lookup.status === "found" && <div className="w-lookup-result" role="status">
      {lookup.result.warranty && <RecordRef type="warranty" id={lookup.result.warranty.id} label={lookup.result.warranty.title} />}
      {lookup.result.vehicle && <RecordRef type="vehicle" id={lookup.result.vehicle.id} label={lookup.result.vehicle.title} />}
      {lookup.result.customer && <RecordRef type="customer" id={lookup.result.customer.id} label={lookup.result.customer.title} />}
    </div>}

    <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} lang={lang} caption={t("Warranty coverage", "تغطيات الضمان")}
      loading={loading} selectedKey={recordId || null} onRowClick={(r) => setRecordId(r.id)}
      empty={filtersActive
        ? <EmptyState variant="no-results" title={t("No matching coverage", "لا توجد تغطية مطابقة")} action={<button className="btn" type="button" onClick={clear}>{t("Clear filters", "مسح التصفية")}</button>} />
        : <EmptyState title={t("No coverage yet", "لا توجد تغطيات بعد")}
          text={scope.canIssue ? t("Issue coverage once a job is delivered.", "أصدر التغطية بعد تسليم أمر الشغل.") : undefined}
          action={scope.canIssue ? <button className="btn btn-primary" type="button" onClick={onIssue}><Plus size={15} />{t("Issue coverage", "إصدار تغطية")}</button> : undefined} />} />

    {open && <CoverageDrawer scope={scope} record={open} onClose={() => setRecordId("")} onOpenClaim={onOpenClaim}
      onNewClaim={() => onNewClaim(open.id)} onVoid={() => { setVoidId(open.id); setVoidReason(""); setVoidError(""); }} />}

    <ConfirmDialog open={voidId !== null} lang={lang} danger busy={voiding}
      title={t("Void this warranty?", "إلغاء هذا الضمان؟")} body={t("Voiding cannot be undone.", "لا يمكن التراجع عن الإلغاء.")}
      confirmLabel={t("Void warranty", "إلغاء الضمان")} cancelLabel={t("Keep", "إبقاء")}
      confirmDisabled={!voidReason.trim()} disabledReason={t("Enter a reason.", "أدخل السبب.")}
      onConfirm={() => void confirmVoid()} onCancel={() => setVoidId(null)}>
      <label className="field-label" htmlFor="w-void-reason">{t("Reason", "السبب")} *</label>
      <textarea id="w-void-reason" className="field-textarea" maxLength={1000} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
      {voidError && <div className="form-error" role="alert">{voidError}</div>}
    </ConfirmDialog>
  </>;
}

function CoverageDrawer({ scope, record, onClose, onOpenClaim, onNewClaim, onVoid }: {
  scope: WarrantyScope; record: WarrantyRecord; onClose: () => void; onOpenClaim: (claimId: string) => void; onNewClaim: () => void; onVoid: () => void;
}) {
  const { t, lang, state } = scope;
  const vehicle = scope.vehicleOf(record.customerId, record.vehicleId);
  const policy = policyForWarranty(state, record);
  const job = state.jobs.find((item) => item.id === record.jobId);
  const jobEvents = state.jobEvents.filter((event) => event.jobId === record.jobId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const qrEvents = state.warrantyQrPrintEvents.filter((event) => event.warrantyId === record.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const claims = scope.claims.filter((claim) => claim.warrantyId === record.id);
  const stage = (value: string) => { const names = stageNames[value as keyof typeof stageNames]; return names ? names[lang] : value; };
  const customer = state.customers.find((item) => item.id === record.customerId);

  return <DetailDrawer open onClose={onClose} lang={lang} wide
    title={record.policyName} subtitle={customer ? scope.customerName(customer.id) : undefined}
    footer={<>
      {scope.canVoid && record.status !== "void" && <button className="btn btn-danger" type="button" onClick={onVoid}>{t("Void", "إلغاء الضمان")}</button>}
      {record.status !== "void" && <button className="btn btn-primary" type="button" onClick={onNewClaim}><ClipboardCheck size={15} />{t("Open claim", "فتح مطالبة")}</button>}
    </>}>
    <div className="w-drawer-status"><StatusBadge status={record.status} domain="warranty" lang={lang} /><span>v{record.policyVersion}</span></div>
    <dl className="kv-grid">
      <div><dt>{t("Customer", "العميل")}</dt><dd><CustomerLink scope={scope} customerId={record.customerId} /></dd></div>
      <div><dt>{t("Vehicle", "المركبة")}</dt><dd><VehicleLink scope={scope} customerId={record.customerId} vehicleId={record.vehicleId} />{vehicle && <div className="secondary-cell">{vehicle.makeModel}</div>}</dd></div>
      <div><dt>{t("Job", "أمر الشغل")}</dt><dd><JobLink scope={scope} jobId={record.jobId} /></dd></div>
      <div><dt>{t("Branch", "الفرع")}</dt><dd>{scope.branchName(record.branchId)}</dd></div>
      <div><dt>{t("Starts", "البداية")}</dt><dd>{formatDate(record.startDate, lang)}</dd></div>
      <div><dt>{t("Ends", "النهاية")}</dt><dd>{record.coverageKind === "lifetime"
        ? (record.terminatedOn ? `${t("Ended", "انتهت")} ${formatDate(record.terminatedOn, lang)}` : t("Lifetime", "مدى الحياة")) : formatDate(record.expiresOn, lang)}</dd></div>
    </dl>
    {record.status === "void" && record.voidReason && <p className="w-note"><strong>{t("Void reason", "سبب الإلغاء")}:</strong> {record.voidReason}</p>}

    <Collapsible title={t("Claims", "المطالبات")} count={claims.length} defaultOpen={claims.some((claim) => claimIsActive(claim.status))}>
      {claims.length ? <ul className="record-ref-list">{claims.map((claim) => <li className="record-ref-row" key={claim.id}>
        <button type="button" className="text-link" onClick={() => onOpenClaim(claim.id)}>{claim.summary.length > 60 ? `${claim.summary.slice(0, 60)}…` : claim.summary}</button>
        <StatusBadge status={claim.status} domain="claim" lang={lang} />
      </li>)}</ul> : <p className="form-hint">{t("No claims.", "لا توجد مطالبات.")}</p>}
    </Collapsible>
    <Collapsible title={t("Work history", "سجل الشغل")} count={jobEvents.length}>
      {job && <p className="form-hint">{stage(job.stage)} · {formatDateTime(job.updatedAt, lang)}</p>}
      <ul className="w-timeline">{jobEvents.slice(0, 8).map((event) => <li key={event.id}><strong>{stage(event.nextStage)}</strong><span>{event.actorLabel} · {formatDateTime(event.occurredAt, lang)}</span></li>)}</ul>
      {!job && !jobEvents.length && <p className="form-hint">{t("No job record.", "لا يوجد سجل للشغل.")}</p>}
    </Collapsible>
    <Collapsible title={t("Customer QR", "رمز QR للعميل")} count={qrEvents.length}>
      <p className="form-hint">{record.verificationTokenActive ? t("A code is active.", "الرمز فعال.") : t("No active code.", "لا يوجد رمز فعال.")}</p>
      <ul className="w-timeline">{qrEvents.slice(0, 6).map((event) => <li key={event.id}><strong>{qrActionLabel(event.action, lang)}</strong><span>{event.actorLabel} · {formatDateTime(event.createdAt, lang)}</span></li>)}</ul>
    </Collapsible>
    <Collapsible title={t("Draft invoice", "مسودة الفاتورة")}>
      <WarrantyInvoicePanel warranty={record} locale={lang} customerName={scope.customerName(record.customerId)}
        vehicleLabel={vehicle ? `${vehicle.makeModel} · ${vehicle.plate}` : "—"} serviceLabel={scope.serviceName(record.serviceId)} branchLabel={scope.branchName(record.branchId)} />
    </Collapsible>
    {policy && <Collapsible title={t("Policy terms", "شروط السياسة")}>
      <dl className="kv-grid">
        <div><dt>{t("Exclusions", "الاستثناءات")}</dt><dd>{policy.exclusions || "—"}</dd></div>
        <div><dt>{t("Evidence for claims", "أدلة المطالبة")}</dt><dd>{policy.evidenceRequirements || "—"}</dd></div>
      </dl>
    </Collapsible>}
  </DetailDrawer>;
}
