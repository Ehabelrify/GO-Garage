import { useCallback, useEffect, useState } from "react";
import type { Configured, Locale } from "@garage/domain";
import { Collapsible, ConfirmDialog, DataTable, EmptyState, Field, FormSection, RequiredNote, Skeleton, StatusBadge } from "../../shared/components";
import { fmtDateTime } from "./settings-format";
import "./settings.css";

type Review = {
  activeVersion: number | null;
  versions: Array<{
    version: number;
    state: string;
    value: unknown;
    approvedBy: string | null;
    approvedAt: string | null;
    reason: string | null;
    hasProtectedEvidence: boolean;
  }>;
};
type Version = Review["versions"][number];
type PolicyValue = Record<string, unknown>;

const quoteEmpty: PolicyValue = {
  validityDays: 7,
  acceptanceMethods: ["staff-recorded"],
  evidenceRequired: true,
  overrideRole: null,
  taxTreatment: { id: "", version: 0 },
};

function defaultValue(id: string, metric: string): PolicyValue {
  if (id.startsWith("finance-definition:")) {
    return {
      metric, currency: "", minorUnitExponent: 2, reportingTimezone: "",
      recognitionRule: { ar: "", en: "" }, taxTreatment: { ar: "", en: "" }, sourceKinds: [],
      completenessRule: { ar: "", en: "" }, emptyPeriod: "unavailable", requiredSourceKinds: [],
    };
  }
  if (id.startsWith("pickup-commitment:")) return { authorizedRoles: ["owner", "branch-manager"], requiresCustomerAgreement: true };
  return quoteEmpty;
}

const record = (value: unknown): PolicyValue => value && typeof value === "object" && !Array.isArray(value) ? value as PolicyValue : {};
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const splitLines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);

function flattenPolicy(value: unknown, path: string[] = []): Array<{ path: string[]; value: string }> {
  if (Array.isArray(value)) return [{ path, value: value.map(String).join(", ") || "—" }];
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => flattenPolicy(item, [...path, key]));
  return [{ path, value: value === null || value === undefined ? "—" : String(value) }];
}

const policyLabels: Record<string, [string, string]> = {
  validityDays: ["Validity days", "أيام الصلاحية"],
  acceptanceMethods: ["Acceptance methods", "طرق القبول"],
  evidenceRequired: ["Evidence required", "دليل القبول مطلوب"],
  overrideRole: ["Override role", "صلاحية الاستثناء"],
  taxTreatment: ["Tax treatment", "معالجة الضريبة"],
  authorizedRoles: ["Authorized roles", "الأدوار المصرح لها"],
  requiresCustomerAgreement: ["Customer agreement required", "موافقة العميل مطلوبة"],
  currency: ["Currency", "العملة"],
  minorUnitExponent: ["Decimal places", "الخانات العشرية"],
  reportingTimezone: ["Reporting time zone", "المنطقة الزمنية للتقارير"],
  recognitionRule: ["Recognition rule", "قاعدة احتساب القيمة"],
  completenessRule: ["Completeness rule", "قاعدة اكتمال البيانات"],
  sourceKinds: ["Source types", "أنواع المصادر"],
  requiredSourceKinds: ["Required source types", "أنواع المصادر المطلوبة"],
  emptyPeriod: ["Empty period means", "الفترة الخالية تعني"],
  metric: ["Metric", "المؤشر"],
  ar: ["Arabic", "العربية"],
  en: ["English", "الإنجليزية"],
  id: ["Policy", "السياسة"],
  version: ["Version", "الإصدار"],
};

/** One policy record: current rules, edit form, approval, activation and version history. */
export function CommercialPolicyEditor({ lang, policyId = "quote-acceptance:default", notify }: { lang: Locale; policyId?: string; notify?: (message: string) => void }) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const finance = policyId.startsWith("finance-definition:");
  const pickup = policyId.startsWith("pickup-commitment:");
  const metric = finance ? policyId.slice("finance-definition:".length) : "";
  const [review, setReview] = useState<Review | null>(null);
  const [active, setActive] = useState<Configured<unknown> | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading");
  const [value, setValue] = useState<PolicyValue>(() => defaultValue(policyId, metric));
  const [evidenceRef, setEvidenceRef] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null);
  const valueRecord = (key: string) => record(value[key]);

  const read = useCallback(async (forceLatest: boolean, isDirty: boolean) => {
    const [versions, current] = await Promise.all([
      fetch(`/api/commercial-policies/${policyId}/review`),
      fetch(`/api/commercial-policies/${policyId}`),
    ]);
    if (!versions.ok || !current.ok) throw new Error("load");
    const result = await versions.json() as Review;
    setReview(result);
    setActive(await current.json() as Configured<unknown>);
    const latestValue = result.versions[0]?.value;
    if ((forceLatest || !isDirty) && latestValue && typeof latestValue === "object") setValue(latestValue as PolicyValue);
  }, [policyId]);

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoadState("loading");
    setValue(defaultValue(policyId, metric));
    setMessage("");
    setConfirmVersion(null);
    setEvidenceRef("");
    setReason("");
    read(true, false).then(() => { if (alive) setLoadState("ready"); }).catch(() => { if (alive) setLoadState("error"); });
    return () => { alive = false; };
  }, [policyId, metric, read, reloadKey]);

  const change = (key: string, next: unknown) => { setValue((current) => ({ ...current, [key]: next })); };
  const changeNested = (key: string, nestedKey: string, next: unknown) => {
    setValue((current) => ({ ...current, [key]: { ...record(current[key]), [nestedKey]: next } }));
  };

  function buildPolicyValue(): PolicyValue | null {
    if (finance) {
      const currency = text(value.currency).trim().toUpperCase();
      const timezone = text(value.reportingTimezone).trim();
      const sourceKinds = list(value.sourceKinds);
      const exponent = Number(value.minorUnitExponent);
      const missingText = ["recognitionRule", "taxTreatment", "completenessRule"].some((key) => {
        const label = record(value[key]);
        return !text(label.en).trim() || !text(label.ar).trim();
      });
      if (!/^[A-Z]{3}$/.test(currency)) { setMessage(t("Enter a three-letter currency code.", "أدخل رمز عملة من ثلاثة أحرف.")); return null; }
      if (!Number.isInteger(exponent) || exponent < 0 || exponent > 6) { setMessage(t("Decimal places must be a whole number from 0 to 6.", "الخانات العشرية رقم صحيح من 0 إلى 6.")); return null; }
      if (!timezone || !sourceKinds.length || missingText) { setMessage(t("Complete the time zone, source types, and English and Arabic rules.", "أكمل المنطقة الزمنية وأنواع المصادر والقواعد بالإنجليزية والعربية.")); return null; }
      return { ...value, metric, currency, minorUnitExponent: exponent, reportingTimezone: timezone, sourceKinds, requiredSourceKinds: list(value.requiredSourceKinds) };
    }
    if (pickup) {
      const authorizedRoles = list(value.authorizedRoles);
      if (!authorizedRoles.length) { setMessage(t("Choose at least one role.", "اختر دوراً واحداً على الأقل.")); return null; }
      return { authorizedRoles, requiresCustomerAgreement: true };
    }
    const methods = list(value.acceptanceMethods);
    const taxTreatment = record(value.taxTreatment);
    const validity = Number(value.validityDays);
    const taxVersion = Number(taxTreatment.version);
    if (!methods.length || !text(taxTreatment.id).trim() || !Number.isInteger(taxVersion) || taxVersion < 1 || !Number.isInteger(validity) || validity < 1) {
      setMessage(t("Complete validity, one acceptance method and the tax policy.", "أكمل مدة الصلاحية وطريقة قبول والسياسة الضريبية."));
      return null;
    }
    return {
      validityDays: validity, acceptanceMethods: methods, evidenceRequired: Boolean(value.evidenceRequired),
      overrideRole: value.overrideRole || null, taxTreatment: { id: text(taxTreatment.id).trim(), version: taxVersion },
    };
  }

  const latest = review?.versions[0];
  const approved = review?.versions.find((item) => item.state === "approved" && item.version !== review.activeVersion);

  async function post(path: string, body: object, done: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/commercial-policies/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { code?: string };
      if (!response.ok) {
        const copy: Record<string, string> = {
          INVALID_POLICY_VALUE: t("Check the required fields and values.", "راجع الحقول المطلوبة والقيم."),
          STALE_POLICY_VERSION: t("This policy changed. Reload it and try again.", "تغيّرت السياسة. حدّثها وحاول مرة أخرى."),
          INVALID_APPROVAL_EVIDENCE: t("Enter the evidence reference and an approval reason.", "أدخل مرجع الدليل وسبب الموافقة."),
        };
        throw new Error(copy[result.code ?? ""] ?? t("The policy could not be saved.", "تعذر حفظ السياسة."));
      }
      await read(true, false);
      setConfirmVersion(null);
      setEvidenceRef("");
      setReason("");
      notify?.(done);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setConfirmVersion(null);
    } finally {
      setBusy(false);
    }
  }

  function approve() {
    const next = buildPolicyValue();
    if (!next) return;
    if (!/^private:[A-Za-z0-9/_-]+$/.test(evidenceRef.trim()) || !reason.trim()) {
      setMessage(t("Evidence reference must start with private: and a reason is required.", "مرجع الدليل لازم يبدأ بـ private: والسبب مطلوب."));
      return;
    }
    void post("approvals", { id: policyId, expectedVersion: latest?.version ?? 0, value: next, evidenceRef, reason }, t("Version approved. Activate it when ready.", "اتعمد الإصدار. فعّله لما تكون جاهز."));
  }
  const saveProposal = () => {
    const next = buildPolicyValue();
    if (next) void post("proposals", { id: policyId, expectedVersion: latest?.version ?? 0, value: next }, t("Draft saved.", "اتحفظت المسودة."));
  };

  const effect = finance
    ? t("After activation only approved source types count toward this figure.", "بعد التفعيل بتتحسب أنواع المصادر المعتمدة بس.")
    : pickup
      ? t("After activation these roles can record agreed pickup times.", "بعد التفعيل تستطيع هذه الأدوار تسجيل مواعيد التسليم المتفق عليها.")
      : t("New quotes use these rules after activation. Accepted quotes stay unchanged.", "تستخدم العروض الجديدة هذه القواعد بعد التفعيل. العروض المقبولة ماتتغيرش.");

  const roleLabel = (role: string) => role === "owner" ? t("Owner", "المالك") : t("Branch manager", "مدير الفرع");
  const labelFor = (key: string) => policyLabels[key] ? t(policyLabels[key][0], policyLabels[key][1]) : key.replace(/([A-Z])/g, " $1");

  if (loadState === "loading") return <Skeleton rows={6} label={t("Loading", "جارٍ التحميل")} />;
  if (loadState === "error") return <EmptyState variant="error" title={t("Could not load this policy", "تعذر تحميل السياسة")}
    action={<button type="button" className="btn" onClick={() => setReloadKey((key) => key + 1)}>{t("Retry", "إعادة المحاولة")}</button>} />;

  return <div className="st-policy">
    <div className="st-policy-status">
      {review?.activeVersion != null
        ? <><StatusBadge status="active" domain="decision" lang={lang} /><span>{t("Version", "الإصدار")} {review.activeVersion}</span></>
        : <StatusBadge status="draft" domain="policy" lang={lang} label={t("Not set up", "غير مهيأ")} />}
      {approved && <StatusBadge status="proposed" domain="decision" lang={lang} label={t(`Version ${approved.version} awaiting activation`, `الإصدار ${approved.version} بانتظار التفعيل`)} />}
    </div>

    {active?.state === "approved" && <Collapsible title={t("Active rules", "القواعد السارية")}>
      <dl className="st-kv">{flattenPolicy(active.value).map((entry, index) => {
        const key = entry.path.at(-1) ?? "";
        const parent = entry.path.length > 1 ? `${labelFor(entry.path.at(-2) ?? "")} · ` : "";
        return <div key={`${entry.path.join(".")}-${index}`}><dt>{parent}{labelFor(key)}</dt><dd>{entry.value}</dd></div>;
      })}</dl>
    </Collapsible>}

    <form className="st-form" onSubmit={(event) => { event.preventDefault(); saveProposal(); }}>
      {finance ? <>
        <FormSection title={t("Basics", "الأساسيات")} columns={3}>
          <Field label={t("Currency", "العملة")} required><input className="field-input" maxLength={3} value={text(value.currency)} onChange={(event) => change("currency", event.target.value.toUpperCase())} placeholder="EGP" dir="ltr" /></Field>
          <Field label={t("Decimal places", "الخانات العشرية")} required><input className="field-input" type="number" min={0} max={6} value={text(value.minorUnitExponent)} onChange={(event) => change("minorUnitExponent", event.target.value)} /></Field>
          <Field label={t("Reporting time zone", "المنطقة الزمنية للتقارير")} required><input className="field-input" value={text(value.reportingTimezone)} onChange={(event) => change("reportingTimezone", event.target.value)} placeholder="Africa/Cairo" dir="ltr" /></Field>
          <Field label={t("Empty period means", "الفترة الخالية تعني")}>
            <select className="field-select" value={text(value.emptyPeriod)} onChange={(event) => change("emptyPeriod", event.target.value)}>
              <option value="unavailable">{t("Unavailable", "غير متاحة")}</option><option value="complete">{t("Complete", "مكتملة")}</option>
            </select>
          </Field>
          <Field label={t("Allowed source types", "أنواع المصادر المسموحة")} required hint={t("One per line", "واحد في كل سطر")}><textarea className="field-textarea" value={list(value.sourceKinds).join("\n")} onChange={(event) => change("sourceKinds", splitLines(event.target.value))} /></Field>
          <Field label={t("Required source types", "أنواع المصادر المطلوبة")} hint={t("One per line", "واحد في كل سطر")}><textarea className="field-textarea" value={list(value.requiredSourceKinds).join("\n")} onChange={(event) => change("requiredSourceKinds", splitLines(event.target.value))} /></Field>
        </FormSection>
        {(["recognitionRule", "taxTreatment", "completenessRule"] as const).map((key) => {
          const nested = valueRecord(key);
          return <FormSection key={key} title={labelFor(key)}>
            <Field label={t("English", "الإنجليزية")} required><textarea className="field-textarea" value={text(nested.en)} onChange={(event) => changeNested(key, "en", event.target.value)} /></Field>
            <Field label={t("Arabic", "العربية")} required><textarea className="field-textarea" dir="rtl" value={text(nested.ar)} onChange={(event) => changeNested(key, "ar", event.target.value)} /></Field>
          </FormSection>;
        })}
      </> : pickup ? <FormSection title={t("Who can record a pickup time", "مين يسجل موعد التسليم")} columns={1}>
        <div className="st-checks">
          {(["owner", "branch-manager"] as const).map((role) => <label className="st-check" key={role}>
            <input type="checkbox" checked={list(value.authorizedRoles).includes(role)} onChange={(event) => change("authorizedRoles", event.target.checked ? [...list(value.authorizedRoles), role] : list(value.authorizedRoles).filter((item) => item !== role))} />
            {roleLabel(role)}
          </label>)}
        </div>
        <p className="form-hint">{t("Customer agreement is always required.", "موافقة العميل مطلوبة دايماً.")}</p>
      </FormSection> : <>
        <FormSection title={t("Rules", "القواعد")}>
          <Field label={t("Quote valid for (days)", "صلاحية العرض (أيام)")} required><input className="field-input" type="number" min={1} step={1} value={text(value.validityDays)} onChange={(event) => change("validityDays", event.target.value)} /></Field>
          <Field label={t("Override role", "صلاحية الاستثناء")}>
            <select className="field-select" value={text(value.overrideRole)} onChange={(event) => change("overrideRole", event.target.value || null)}>
              <option value="">{t("None", "بدون")}</option><option value="owner">{t("Owner", "المالك")}</option><option value="branch-manager">{t("Branch manager", "مدير الفرع")}</option>
            </select>
          </Field>
          <Field label={t("How acceptance is confirmed", "طريقة تأكيد القبول")} full required>
            <div className="st-checks">
              {(["staff-recorded", "customer-confirmed"] as const).map((method) => <label className="st-check" key={method}>
                <input type="checkbox" checked={list(value.acceptanceMethods).includes(method)} onChange={(event) => change("acceptanceMethods", event.target.checked ? [...list(value.acceptanceMethods), method] : list(value.acceptanceMethods).filter((item) => item !== method))} />
                {method === "staff-recorded" ? t("Recorded by staff", "يسجله الموظف") : t("Confirmed by customer", "يؤكده العميل")}
              </label>)}
              <label className="st-check"><input type="checkbox" checked={Boolean(value.evidenceRequired)} onChange={(event) => change("evidenceRequired", event.target.checked)} />{t("Require evidence", "اطلب دليل القبول")}</label>
            </div>
          </Field>
        </FormSection>
        <FormSection title={t("Tax policy", "السياسة الضريبية")}>
          <Field label={t("Tax policy reference", "مرجع السياسة الضريبية")} required><input className="field-input" value={text(valueRecord("taxTreatment").id)} onChange={(event) => changeNested("taxTreatment", "id", event.target.value)} dir="ltr" /></Field>
          <Field label={t("Tax policy version", "إصدار السياسة الضريبية")} required><input className="field-input" type="number" min={1} value={text(valueRecord("taxTreatment").version)} onChange={(event) => changeNested("taxTreatment", "version", event.target.value)} /></Field>
        </FormSection>
      </>}

      <FormSection title={t("Approval", "الموافقة")} description={t("Needed only to approve. Approving does not activate.", "مطلوبة للموافقة بس. الموافقة لا تفعّل.")}>
        <Field label={t("Evidence reference", "مرجع الدليل")} hint="private:…"><input className="field-input" value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} placeholder="private:" dir="ltr" /></Field>
        <Field label={t("Reason", "السبب")}><input className="field-input" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      </FormSection>
      <RequiredNote text={t("Required", "مطلوب")} />
      {message && <div className="form-error" role="alert">{message}</div>}
      <div className="form-actions">
        {approved && <button className="btn" type="button" disabled={busy} onClick={() => setConfirmVersion(approved.version)}>{t("Activate approved version", "فعّل الإصدار المعتمد")}</button>}
        <button className="btn" type="submit" disabled={busy || !review}>{t("Save draft", "احفظ مسودة")}</button>
        <button className="btn btn-primary" type="button" disabled={busy || !review} onClick={approve}>{t("Approve version", "اعتمد الإصدار")}</button>
      </div>
    </form>

    <Collapsible title={t("Version history", "سجل الإصدارات")} count={review?.versions.length ?? 0}>
      <DataTable<Version>
        lang={lang}
        caption={t("Version history", "سجل الإصدارات")}
        rows={review?.versions ?? []}
        rowKey={(row) => String(row.version)}
        columns={[
          { key: "version", header: t("Version", "الإصدار"), render: (row) => `v${row.version}`, primary: true, numeric: true },
          { key: "state", header: t("State", "الحالة"), render: (row) => <StatusBadge status={row.version === review?.activeVersion ? "active" : row.state} domain={row.version === review?.activeVersion ? "decision" : undefined} lang={lang} /> },
          { key: "approvedAt", header: t("Approved", "اعتمد"), render: (row) => row.approvedAt ? fmtDateTime(row.approvedAt, lang) : "—" },
          { key: "reason", header: t("Reason", "السبب"), render: (row) => row.reason || "—" },
        ]}
        empty={<EmptyState title={t("No versions yet", "لا توجد إصدارات")} text={t("Save a draft to create version 1.", "احفظ مسودة لإنشاء الإصدار 1.")} />}
      />
    </Collapsible>

    <ConfirmDialog
      open={confirmVersion !== null}
      lang={lang}
      title={t("Activate this version?", "تفعّل الإصدار ده؟")}
      body={effect}
      confirmLabel={t("Activate", "تفعيل")}
      busy={busy}
      onCancel={() => setConfirmVersion(null)}
      onConfirm={() => void post("activations", { id: policyId, version: confirmVersion, expectedActiveVersion: review?.activeVersion ?? null }, t("Version activated.", "اتفعّل الإصدار."))}
    />
  </div>;
}
