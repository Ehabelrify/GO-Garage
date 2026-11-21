import { useEffect, useMemo, useState } from "react";
import { Check, Download, Paperclip, Upload } from "lucide-react";
import type { WarrantyClaim, WarrantyClaimStatus } from "@garage/domain";
import {
  Collapsible, ConfirmDialog, DataTable, DetailDrawer, EmptyState, FilterBar, RecordRef, StatusBadge, useUrlState, type Column,
} from "../../shared/components";
import { useWarrantyDraftState, warrantyDraftKey } from "./warranty-form-state";
import {
  claimIsActive, claimIsFinal, evidenceFileProblem, EVIDENCE_ACCEPT, fileSizeLabel, formatDateTime, MAX_EVIDENCE_ATTACHMENTS,
  policyForWarranty, reviewerAssigned,
} from "./warranty-logic";
import { uploadErrorCopy } from "./warranty-copy";
import { CustomerLink, VehicleLink, WarrantyLink, type WarrantyScope } from "./warranty-scope";

export function ClaimsTab({ scope, onNewClaim }: { scope: WarrantyScope; onNewClaim: () => void }) {
  const { t, lang, state, store, notify, claims } = scope;
  const [recordId, setRecordId] = useUrlState("record", "");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("open");
  const [storageReady, setStorageReady] = useState<boolean | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ claim: WarrantyClaim; status: WarrantyClaimStatus } | null>(null);
  const identity = { userId: scope.userId, dataset: scope.dataset };
  const [drafts, setDrafts] = useWarrantyDraftState<Record<string, string>>(
    { ...identity, task: "review", entityId: `scope:${state.currentBranch}`, version: 0 }, () => ({}),
  );
  const draftKey = (claim: WarrantyClaim) => warrantyDraftKey({ ...identity, task: "review", entityId: claim.id, version: Date.parse(claim.updatedAt) || 0 });

  useEffect(() => {
    let active = true;
    void store.getWarrantyEvidenceStorageStatus().then((ready) => { if (active) setStorageReady(ready); });
    return () => { active = false; };
  }, [store.getWarrantyEvidenceStorageStatus]);
  useEffect(() => { setDrafts({}); setPending(null); }, [state.currentBranch, scope.userId]);

  const warrantyOf = (claim: WarrantyClaim) => state.warranties.find((item) => item.id === claim.warrantyId);
  const rows = useMemo(() => claims.filter((claim) => {
    if (status === "open" && !claimIsActive(claim.status)) return false;
    if (status !== "open" && status !== "all" && claim.status !== status) return false;
    const record = warrantyOf(claim);
    const hay = `${claim.summary} ${claim.evidence} ${record ? scope.customerName(record.customerId) : ""} ${record?.policyName ?? ""} ${record ? scope.vehicleOf(record.customerId, record.vehicleId)?.plate ?? "" : ""}`;
    return !query.trim() || hay.toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [claims, query, status, state.warranties, state.customers, lang]);

  const open = claims.find((claim) => claim.id === recordId) ?? null;
  const loading = store.status === "loading" && state.warrantyClaims.length === 0;
  const filtersActive = Boolean(query) || status !== "open";
  const clear = () => { setQuery(""); setStatus("open"); };

  const canDecide = (claim: WarrantyClaim) => {
    const record = warrantyOf(claim);
    const terms = record ? policyForWarranty(state, record) : undefined;
    return scope.canReview && reviewerAssigned(store.actor?.role, terms?.reviewRole) && claimIsActive(claim.status);
  };

  const apply = async (claim: WarrantyClaim, next: WarrantyClaimStatus) => {
    const resolution = (drafts[draftKey(claim)] ?? claim.resolution ?? "").trim();
    if (!canDecide(claim) || (claimIsFinal(next) && !resolution)) {
      setReviewErrors((c) => ({ ...c, [claim.id]: t("Write a resolution first.", "اكتب نتيجة المراجعة أولاً.") }));
      return false;
    }
    setReviewingId(claim.id);
    setReviewErrors((c) => ({ ...c, [claim.id]: "" }));
    const result = await store.updateWarrantyClaim(claim.id, next, resolution || undefined);
    setReviewingId(null);
    if (!result.ok) { setReviewErrors((c) => ({ ...c, [claim.id]: scope.error(result.error) })); return false; }
    setDrafts((current) => { const copy = { ...current }; delete copy[draftKey(claim)]; return copy; });
    notify(t("Claim updated.", "حُدّثت المطالبة."));
    return true;
  };

  const upload = async (claim: WarrantyClaim, file: File) => {
    if (!storageReady || uploadingId) return;
    setUploadErrors((c) => ({ ...c, [claim.id]: "" }));
    const problem = evidenceFileProblem(file, claim.attachments?.length ?? 0);
    if (problem) {
      setUploadErrors((c) => ({ ...c, [claim.id]: uploadErrorCopy(problem === "too-large" ? "EVIDENCE_FILE_TOO_LARGE" : "CLAIM_EVIDENCE_LIMIT", lang) }));
      return;
    }
    setUploadingId(claim.id);
    const result = await store.uploadWarrantyClaimEvidence(claim.id, file);
    setUploadingId(null);
    if (!result.ok) { setUploadErrors((c) => ({ ...c, [claim.id]: uploadErrorCopy(result.error, lang) })); return; }
    notify(t("File attached.", "أُرفق الملف."));
  };

  const columns: Column<WarrantyClaim>[] = [
    { key: "summary", header: t("Claim", "المطالبة"), primary: true, render: (c) => <span>{c.summary.length > 70 ? `${c.summary.slice(0, 70)}…` : c.summary}</span> },
    { key: "customer", header: t("Customer", "العميل"), render: (c) => { const r = warrantyOf(c); return r ? <CustomerLink scope={scope} customerId={r.customerId} /> : "—"; } },
    { key: "vehicle", header: t("Vehicle", "المركبة"), render: (c) => { const r = warrantyOf(c); return r ? <VehicleLink scope={scope} customerId={r.customerId} vehicleId={r.vehicleId} /> : "—"; } },
    { key: "status", header: t("Status", "الحالة"), sortable: true, sortValue: (c) => c.status, render: (c) => <StatusBadge status={c.status} domain="claim" lang={lang} /> },
    { key: "opened", header: t("Opened", "فُتحت"), sortable: true, sortValue: (c) => c.createdAt, render: (c) => formatDateTime(c.createdAt, lang) },
    { key: "files", header: t("Files", "الملفات"), numeric: true, hideOnCard: true, render: (c) => c.attachments?.length ?? 0 },
  ];

  return <>
    <FilterBar lang={lang} resultCount={rows.length}
      search={{ value: query, onChange: setQuery, placeholder: t("Claim, customer, plate or policy…", "مطالبة أو عميل أو لوحة أو سياسة…") }}
      filters={[{ key: "status", label: t("Status", "الحالة"), value: status, allValue: "open", onChange: setStatus,
        options: [{ value: "open", label: t("Needs review", "بحاجة لمراجعة") }, { value: "all", label: t("All", "الكل") },
          ...(["approved", "denied", "closed"] as const).map((s) => ({ value: s, label: s === "approved" ? t("Approved", "موافق عليها") : s === "denied" ? t("Denied", "مرفوضة") : t("Closed", "مغلقة") }))] }]}
      onClear={filtersActive ? clear : undefined} />
    <DataTable rows={rows} columns={columns} rowKey={(c) => c.id} lang={lang} caption={t("Warranty claims", "مطالبات الضمان")}
      loading={loading} selectedKey={recordId || null} onRowClick={(c) => setRecordId(c.id)}
      empty={filtersActive
        ? <EmptyState variant="no-results" title={t("No matching claims", "لا توجد مطالبات مطابقة")} action={<button className="btn" type="button" onClick={clear}>{t("Clear filters", "مسح التصفية")}</button>} />
        : <EmptyState title={t("No claims", "لا توجد مطالبات")} action={<button className="btn btn-primary" type="button" onClick={onNewClaim}>{t("Open claim", "فتح مطالبة")}</button>} />} />

    {open && (() => {
      const record = warrantyOf(open);
      const terms = record ? policyForWarranty(state, record) : undefined;
      const decide = canDecide(open);
      const active = claimIsActive(open.status);
      const count = open.attachments?.length ?? 0;
      const busy = reviewingId === open.id;
      return <DetailDrawer open onClose={() => setRecordId("")} lang={lang} wide
        title={open.summary.length > 60 ? `${open.summary.slice(0, 60)}…` : open.summary}
        subtitle={`${t("Opened", "فُتحت")} ${formatDateTime(open.createdAt, lang)} · ${open.openedBy}`}
        footer={decide ? <>
          {open.status === "open" && <button className="btn" type="button" disabled={busy} onClick={() => void apply(open, "under-review")}>{t("Start review", "بدء المراجعة")}</button>}
          <button className="btn btn-danger" type="button" disabled={busy} onClick={() => setPending({ claim: open, status: "denied" })}>{t("Deny", "رفض")}</button>
          <button className="btn" type="button" disabled={busy} onClick={() => setPending({ claim: open, status: "closed" })}>{t("Close", "إغلاق")}</button>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => setPending({ claim: open, status: "approved" })}><Check size={15} />{t("Approve", "موافقة")}</button>
        </> : undefined}>
        <div className="w-drawer-status"><StatusBadge status={open.status} domain="claim" lang={lang} />{record && <span>v{record.policyVersion}</span>}</div>
        <dl className="kv-grid">
          {record && <>
            <div><dt>{t("Warranty", "الضمان")}</dt><dd><WarrantyLink scope={scope} record={record} /></dd></div>
            <div><dt>{t("Customer", "العميل")}</dt><dd><CustomerLink scope={scope} customerId={record.customerId} /></dd></div>
            <div><dt>{t("Vehicle", "المركبة")}</dt><dd><VehicleLink scope={scope} customerId={record.customerId} vehicleId={record.vehicleId} /></dd></div>
            <div><dt>{t("Job", "أمر الشغل")}</dt><dd><RecordRef type="job" id={record.jobId} label={scope.serviceName(record.serviceId)} /></dd></div>
          </>}
          <div className="full"><dt>{t("Details", "التفاصيل")}</dt><dd>{open.evidence || "—"}</dd></div>
        </dl>
        {terms && <p className="form-hint">{t("Policy asks for", "السياسة تطلب")}: {terms.evidenceRequirements}</p>}

        <Collapsible title={t("Evidence files", "ملفات الأدلة")} count={count} defaultOpen>
          {count ? <ul className="w-files">{open.attachments.map((file) => <li key={file.id}>
            <a href={`/api/warranties/claims/${encodeURIComponent(open.id)}/attachments/${encodeURIComponent(file.id)}/download`} download={file.fileName}>
              <Download size={14} /><span>{file.fileName}</span></a>
            <small>{fileSizeLabel(file.byteSize)} · {file.uploadedBy} · {formatDateTime(file.uploadedAt, lang)}</small>
          </li>)}</ul> : <p className="form-hint">{t("No files yet.", "لا توجد ملفات بعد.")}</p>}
          {active && storageReady === true && count < MAX_EVIDENCE_ATTACHMENTS && <>
            <label className={`btn w-upload${uploadingId ? " busy" : ""}`}>
              {uploadingId === open.id ? <><Upload size={15} />{t("Uploading…", "جارٍ الرفع…")}</> : <><Paperclip size={15} />{t("Attach file", "إرفاق ملف")}</>}
              <input type="file" accept={EVIDENCE_ACCEPT} disabled={uploadingId !== null}
                aria-label={t("Attach evidence file", "إرفاق ملف دليل")}
                onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void upload(open, file); }} />
            </label>
            <p className="form-hint">{t("JPG, PNG, WebP or PDF, up to 8 MB. Private.", "JPG أو PNG أو WebP أو PDF حتى ٨ ميجابايت. خاصة.")} {count}/{MAX_EVIDENCE_ATTACHMENTS}</p>
          </>}
          {active && storageReady === false && <p className="form-hint">{t("File storage is not set up yet.", "تخزين الملفات غير مهيأ بعد.")}</p>}
          {!active && <p className="form-hint">{t("Finalized claims accept no new files.", "المطالبات المنتهية لا تقبل ملفات جديدة.")}</p>}
          {uploadErrors[open.id] && <div className="form-error" role="alert">{uploadErrors[open.id]}</div>}
        </Collapsible>

        {open.resolution && !decide && <p className="w-note"><strong>{t("Resolution", "النتيجة")}:</strong> {open.resolution}{open.reviewedBy ? ` · ${open.reviewedBy}` : ""}</p>}
        {reviewErrors[open.id] && <div className="form-error" role="alert">{reviewErrors[open.id]}</div>}
      </DetailDrawer>;
    })()}

    <ConfirmDialog open={pending !== null} lang={lang} danger={pending?.status === "denied"} busy={pending ? reviewingId === pending.claim.id : false}
      title={pending?.status === "approved" ? t("Approve this claim?", "الموافقة على المطالبة؟") : pending?.status === "denied" ? t("Deny this claim?", "رفض المطالبة؟") : t("Close this claim?", "إغلاق المطالبة؟")}
      body={t("This final decision cannot be reopened.", "هذا قرار نهائي لا يمكن إعادة فتحه.")}
      confirmLabel={pending?.status === "approved" ? t("Approve", "موافقة") : pending?.status === "denied" ? t("Deny", "رفض") : t("Close", "إغلاق")}
      confirmDisabled={pending ? !(drafts[draftKey(pending.claim)] ?? pending.claim.resolution ?? "").trim() : true}
      disabledReason={t("Write a resolution first.", "اكتب نتيجة المراجعة أولاً.")}
      onCancel={() => setPending(null)}
      onConfirm={() => { if (pending) void apply(pending.claim, pending.status).then(() => setPending(null)); }}>
      {pending && <>
        <label className="field-label" htmlFor="w-resolution">{t("Resolution", "النتيجة")} *</label>
        <textarea id="w-resolution" className="field-textarea" maxLength={2000}
          value={drafts[draftKey(pending.claim)] ?? pending.claim.resolution ?? ""}
          onChange={(event) => setDrafts((current) => ({ ...current, [draftKey(pending.claim)]: event.target.value }))} />
      </>}
    </ConfirmDialog>
  </>;
}
