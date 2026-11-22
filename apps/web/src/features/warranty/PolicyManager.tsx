import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import type { WarrantyPolicy } from "@garage/domain";
import {
  Collapsible, ConfirmDialog, DataTable, DetailDrawer, EmptyState, StatusBadge, type Column,
} from "../../shared/components";
import type { PageProps } from "../../shared/ui";
import { PolicyForm } from "./PolicyForm";
import { VerificationSettings } from "./VerificationSettings";
import { policyDisplayName, policyTermsComplete } from "./warranty-logic";
import { useWarrantyScope, type WarrantyScope } from "./warranty-scope";
import "./warranty.css";

/**
 * Warranty policies (versions, publish, retire) and public verification settings.
 * Owner-only to change; other roles see an empty state. Settings embeds this: `<PolicyManager lang t state notify />`.
 */
export function PolicyManager(props: PageProps) {
  const scope = useWarrantyScope(props);
  if (!scope.canManagePolicies) return null;
  return <PolicyManagerView scope={scope} />;
}

export function PolicyManagerView({ scope }: { scope: WarrantyScope }) {
  const { t, lang, state, store, notify } = scope;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WarrantyPolicy | null>(null);
  const [template, setTemplate] = useState(false);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<WarrantyPolicy | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [retiring, setRetiring] = useState<WarrantyPolicy | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const key = (policy: WarrantyPolicy) => `${policy.policyId}:${policy.version}`;
  const policies = state.warrantyPolicies.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const detail = policies.find((policy) => key(policy) === detailKey) ?? null;
  const loading = store.status === "loading" && policies.length === 0;

  const startNew = (asTemplate: boolean) => { setEditing(null); setTemplate(asTemplate); setFormOpen(true); };
  const startEdit = (policy: WarrantyPolicy) => { setDetailKey(null); setEditing(policy); setTemplate(false); setFormOpen(true); };

  const duplicate = async (policy: WarrantyPolicy, target: "next-version" | "new-policy") => {
    setError("");
    const result = await store.duplicateWarrantyPolicy(policy.policyId, policy.version, target);
    if (!result.ok) { setError(scope.error(result.error)); return; }
    setDetailKey(null);
    notify(t("New draft created. Review its terms before publishing.", "أُنشئت مسودة جديدة. راجع شروطها قبل النشر."));
  };
  const publish = async () => {
    if (!publishing || !confirmed || busy) return;
    setBusy(true); setError("");
    const result = await store.publishWarrantyPolicy(publishing.policyId, publishing.version);
    setBusy(false);
    if (!result.ok) { setError(scope.error(result.error)); return; }
    setPublishing(null); setConfirmed(false); setDetailKey(null);
    notify(t("Policy published.", "نُشرت السياسة."));
  };
  const retire = async () => {
    if (!retiring || !reason.trim() || busy) return;
    setBusy(true); setError("");
    const result = await store.retireWarrantyPolicy(retiring.policyId, retiring.version, reason.trim());
    setBusy(false);
    if (!result.ok) { setError(scope.error(result.error)); return; }
    setRetiring(null); setReason(""); setDetailKey(null);
    notify(t("Version retired. Existing coverage stays valid.", "أُوقف الإصدار. التغطيات القائمة تبقى سارية."));
  };

  const columns: Column<WarrantyPolicy>[] = [
    { key: "name", header: t("Policy", "السياسة"), primary: true, sortable: true, sortValue: (p) => p.name, render: (p) => <span className="w-cov-name"><span>{policyDisplayName(p.name)}</span><span className="secondary-cell">v{p.version}</span></span> },
    { key: "kind", header: t("Term", "المدة"), render: (p) => p.coverageKind === "lifetime" ? t("Lifetime", "مدى الحياة") : `${p.durationMonths ?? "—"} ${t("months", "شهر")}` },
    { key: "services", header: t("Services", "الخدمات"), numeric: true, hideOnCard: true, render: (p) => p.eligibleServiceIds.length },
    { key: "issue", header: t("Issued", "الإصدار"), render: (p) => p.autoIssue ? t("Automatic", "تلقائي") : t("Manual", "يدوي") },
    { key: "status", header: t("Status", "الحالة"), sortable: true, sortValue: (p) => p.status, render: (p) => <StatusBadge status={p.status} domain="policy" lang={lang} /> },
  ];

  return <section className="w-policies">
    <div className="w-section-head">
      <h2>{t("Warranty policies", "سياسات الضمان")}</h2>
      <div className="w-section-actions">
        <button className="btn" type="button" onClick={() => startNew(true)}>{t("From template", "من قالب")}</button>
        <button className="btn btn-primary" type="button" onClick={() => startNew(false)}><Plus size={15} />{t("Add policy", "إضافة سياسة")}</button>
      </div>
    </div>
    {error && !publishing && !retiring && <div className="form-error" role="alert">{error}</div>}
    <DataTable rows={policies} columns={columns} rowKey={key} lang={lang} caption={t("Warranty policies", "سياسات الضمان")}
      loading={loading} selectedKey={detailKey} onRowClick={(p) => setDetailKey(key(p))}
      empty={<EmptyState title={t("No policies yet", "لا توجد سياسات بعد")}
        action={<button className="btn btn-primary" type="button" onClick={() => startNew(false)}><Plus size={15} />{t("Add policy", "إضافة سياسة")}</button>} />} />

    <VerificationSettings scope={scope} />

    <PolicyForm scope={scope} open={formOpen} editing={editing} template={template} onClose={() => setFormOpen(false)} />

    {detail && <DetailDrawer open onClose={() => setDetailKey(null)} lang={lang} wide title={policyDisplayName(detail.name)} subtitle={`v${detail.version}`}
      footer={<>
        {detail.status !== "draft" && <button className="btn" type="button" onClick={() => void duplicate(detail, "new-policy")}><Copy size={15} />{t("Copy as new policy", "نسخ كسياسة جديدة")}</button>}
        {detail.status === "published" && <button className="btn" type="button" onClick={() => void duplicate(detail, "next-version")}>{t("New version", "إصدار جديد")}</button>}
        {detail.status === "published" && <button className="btn btn-danger" type="button" onClick={() => { setRetiring(detail); setReason(""); setError(""); }}>{t("Retire", "إيقاف")}</button>}
        {detail.status === "draft" && <button className="btn" type="button" onClick={() => startEdit(detail)}>{t("Edit", "تعديل")}</button>}
        {detail.status === "draft" && <button className="btn btn-primary" type="button" disabled={!policyTermsComplete(detail)}
          title={policyTermsComplete(detail) ? undefined : t("Complete every term first.", "أكمل كل الشروط أولاً.")}
          onClick={() => { setPublishing(detail); setConfirmed(false); setError(""); }}>{t("Publish", "نشر")}</button>}
      </>}>
      <div className="w-drawer-status"><StatusBadge status={detail.status} domain="policy" lang={lang} /></div>
      {detail.status === "draft" && !policyTermsComplete(detail) && <p className="form-hint">{t("Complete every term to publish.", "أكمل كل الشروط للنشر.")}</p>}
      <dl className="kv-grid">
        <div><dt>{t("Term", "المدة")}</dt><dd>{detail.coverageKind === "lifetime" ? t("Lifetime", "مدى الحياة") : `${detail.durationMonths ?? "—"} ${t("months", "شهر")}`}</dd></div>
        <div><dt>{t("Starts", "تبدأ")}</dt><dd>{detail.startRule === "job-delivery" ? t("Job delivery", "تسليم الشغل") : t("Chosen at issue", "تحدد عند الإصدار")}</dd></div>
        <div><dt>{t("Issued", "الإصدار")}</dt><dd>{detail.autoIssue ? t("Automatic", "تلقائي") : t("Manual", "يدوي")}</dd></div>
        <div><dt>{t("Reviewer", "المراجع")}</dt><dd>{detail.reviewRole === "owner" ? t("Owner", "المالك") : t("Owner or manager", "المالك أو المدير")} · {detail.responseDays} {t("days", "يوم")}</dd></div>
        <div className="full"><dt>{t("Services", "الخدمات")}</dt><dd>{detail.eligibleServiceIds.map(scope.serviceName).join("، ") || "—"}</dd></div>
      </dl>
      <Collapsible title={t("Exclusions", "الاستثناءات")} defaultOpen><p>{detail.exclusions || "—"}</p></Collapsible>
      <Collapsible title={t("Evidence needed", "الأدلة المطلوبة")}><p>{detail.evidenceRequirements || "—"}</p></Collapsible>
      {detail.coverageKind === "lifetime" && detail.lifetimeDefinition?.state === "approved" && <Collapsible title={t("Public wording", "الصياغة العامة")}>
        <p>{detail.lifetimeDefinition.value.publicWording[lang]}</p></Collapsible>}
    </DetailDrawer>}

    <ConfirmDialog open={publishing !== null} lang={lang} busy={busy} title={t("Publish this version?", "نشر هذا الإصدار؟")}
      body={t("Published terms are locked. Create a new version to change them.", "الشروط المنشورة مقفلة. أنشئ إصداراً جديداً لتغييرها.")}
      confirmLabel={t("Publish", "نشر")} confirmDisabled={!confirmed} disabledReason={t("Tick the approval first.", "أكّد الاعتماد أولاً.")}
      onCancel={() => { setPublishing(null); setConfirmed(false); }} onConfirm={() => void publish()}>
      <label className="w-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>{t("I am the Owner and approve these terms.", "أنا المالك وأعتمد هذه الشروط.")}</span></label>
      {error && <div className="form-error" role="alert">{error}</div>}
    </ConfirmDialog>
    <ConfirmDialog open={retiring !== null} lang={lang} danger busy={busy} title={t("Retire this version?", "إيقاف هذا الإصدار؟")}
      body={t("Existing coverage and claims stay valid.", "التغطيات والمطالبات القائمة تبقى سارية.")}
      confirmLabel={t("Retire", "إيقاف")} confirmDisabled={!reason.trim()} disabledReason={t("Enter a reason.", "أدخل السبب.")}
      onCancel={() => setRetiring(null)} onConfirm={() => void retire()}>
      <label className="field-label" htmlFor="w-retire-reason">{t("Reason", "السبب")} *</label>
      <textarea id="w-retire-reason" className="field-textarea" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
      {error && <div className="form-error" role="alert">{error}</div>}
    </ConfirmDialog>
  </section>;
}
