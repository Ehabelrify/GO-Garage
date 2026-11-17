import { useEffect, useState } from "react";
import type { Configured } from "@garage/domain";

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
      metric,
      currency: "",
      minorUnitExponent: 2,
      reportingTimezone: "",
      recognitionRule: { ar: "", en: "" },
      taxTreatment: { ar: "", en: "" },
      sourceKinds: [],
      completenessRule: { ar: "", en: "" },
      emptyPeriod: "unavailable",
      requiredSourceKinds: [],
    };
  }
  if (id.startsWith("pickup-commitment:")) {
    return { authorizedRoles: ["owner", "branch-manager"], requiresCustomerAgreement: true };
  }
  return quoteEmpty;
}

function record(value: unknown): PolicyValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PolicyValue : {};
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function list(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function splitLines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function flattenPolicy(value: unknown, path: string[] = []): Array<{ path: string[]; value: string }> {
  if (Array.isArray(value)) return [{ path, value: value.map(String).join(", ") || "—" }];
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => flattenPolicy(item, [...path, key]));
  }
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
  minorUnitExponent: ["Minor unit digits", "خانات الوحدة الصغرى"],
  reportingTimezone: ["Reporting time zone", "المنطقة الزمنية للتقارير"],
  recognitionRule: ["Recognition rule", "قاعدة احتساب القيمة"],
  completenessRule: ["Completeness rule", "قاعدة اكتمال البيانات"],
  sourceKinds: ["Source types", "أنواع المصادر"],
  requiredSourceKinds: ["Required source types", "أنواع المصادر المطلوبة"],
  emptyPeriod: ["Empty period means", "الفترة الخالية تعني"],
  metric: ["Metric", "المؤشر"],
  ar: ["Arabic", "العربية"],
  en: ["English", "الإنجليزية"],
  id: ["Policy ID", "معرف السياسة"],
  version: ["Version", "الإصدار"],
};

export function CommercialPolicyEditor({ lang, policyId = "quote-acceptance:default" }: { lang: "ar" | "en"; policyId?: string }) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const finance = policyId.startsWith("finance-definition:");
  const pickup = policyId.startsWith("pickup-commitment:");
  const metric = finance ? policyId.slice("finance-definition:".length) : "";
  const initial = defaultValue(policyId, metric);
  const [review, setReview] = useState<Review | null>(null);
  const [active, setActive] = useState<Configured<unknown> | null>(null);
  const [value, setValue] = useState<PolicyValue>(initial);
  const [dirty, setDirty] = useState(false);
  const [evidenceRef, setEvidenceRef] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null);
  const valueRecord = (key: string) => record(value[key]);

  async function read(forceLatest = false) {
    const [versions, current] = await Promise.all([
      fetch(`/api/commercial-policies/${policyId}/review`),
      fetch(`/api/commercial-policies/${policyId}`),
    ]);
    if (!versions.ok || !current.ok) throw new Error(t("Unable to load this policy.", "تعذر تحميل السياسة."));
    const result = await versions.json() as Review;
    setReview(result);
    setActive(await current.json() as Configured<unknown>);
    const latestValue = result.versions[0]?.value;
    if ((forceLatest || !dirty) && latestValue && typeof latestValue === "object") setValue(latestValue as PolicyValue);
  }

  useEffect(() => {
    void read().catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    // The policy ID determines which record is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyId]);

  function change(key: string, next: unknown) {
    setDirty(true);
    setValue((current) => ({ ...current, [key]: next }));
  }

  function changeNested(key: string, nestedKey: string, next: unknown) {
    setDirty(true);
    setValue((current) => ({ ...current, [key]: { ...record(current[key]), [nestedKey]: next } }));
  }

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
      if (!/^[A-Z]{3}$/.test(currency)) {
        setMessage(t("Enter a three-letter currency code.", "أدخل رمز عملة من ثلاثة أحرف."));
        return null;
      }
      if (!Number.isInteger(exponent) || exponent < 0 || exponent > 6) {
        setMessage(t("Choose a whole number from 0 to 6 for minor unit digits.", "اختر رقماً صحيحاً من 0 إلى 6 لخانات الوحدة الصغرى."));
        return null;
      }
      if (!timezone || !sourceKinds.length || missingText) {
        setMessage(t("Complete the time zone, source types, and English and Arabic rule descriptions.", "أكمل المنطقة الزمنية وأنواع المصادر ووصف القواعد بالإنجليزية والعربية."));
        return null;
      }
      return {
        ...value,
        metric,
        currency,
        minorUnitExponent: exponent,
        reportingTimezone: timezone,
        sourceKinds,
        requiredSourceKinds: list(value.requiredSourceKinds),
      };
    }
    if (pickup) {
      const authorizedRoles = list(value.authorizedRoles);
      if (!authorizedRoles.length) {
        setMessage(t("Choose at least one authorized role.", "اختر صلاحية واحدة على الأقل."));
        return null;
      }
      return { authorizedRoles, requiresCustomerAgreement: true };
    }
    const methods = list(value.acceptanceMethods);
    const taxTreatment = record(value.taxTreatment);
    const validity = Number(value.validityDays);
    const taxVersion = Number(taxTreatment.version);
    if (!methods.length || !text(taxTreatment.id).trim() || !Number.isInteger(taxVersion) || taxVersion < 1 || !Number.isInteger(validity) || validity < 1) {
      setMessage(t("Complete validity, at least one acceptance method, and the tax policy reference.", "أكمل مدة الصلاحية وطريقة قبول واحدة على الأقل ومرجع سياسة الضريبة."));
      return null;
    }
    return {
      validityDays: validity,
      acceptanceMethods: methods,
      evidenceRequired: Boolean(value.evidenceRequired),
      overrideRole: value.overrideRole || null,
      taxTreatment: { id: text(taxTreatment.id).trim(), version: taxVersion },
    };
  }

  function approve() {
    const next = buildPolicyValue();
    if (!next) return;
    if (!/^private:[A-Za-z0-9/_-]+$/.test(evidenceRef.trim()) || !reason.trim()) {
      setMessage(t("Use a protected evidence reference starting with private: and enter an approval reason.", "استخدم مرجع دليل محمياً يبدأ بـ private: وأدخل سبب الموافقة."));
      return;
    }
    void post("approvals", { id: policyId, expectedVersion: latest?.version ?? 0, value: next, evidenceRef, reason });
  }

  async function post(path: string, body: object) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/commercial-policies/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as { code?: string; message?: string };
      if (!response.ok) {
        const copy: Record<string, { en: string; ar: string }> = {
          INVALID_POLICY_VALUE: { en: "Check the required fields and policy values.", ar: "راجع الحقول المطلوبة وقيم السياسة." },
          STALE_POLICY_VERSION: { en: "This policy changed. Refresh it and try again.", ar: "تغيرت السياسة. حدّثها ثم حاول مرة أخرى." },
          INVALID_APPROVAL_EVIDENCE: { en: "Enter the protected evidence reference and an approval reason.", ar: "أدخل مرجع الدليل المحمي وسبب الموافقة." },
        };
        throw new Error(copy[result.code ?? ""] ? t(copy[result.code!].en, copy[result.code!].ar) : result.message ?? t("The policy could not be saved.", "تعذر حفظ السياسة."));
      }
      setDirty(false);
      await read(true);
      setConfirmVersion(null);
      setMessage(t("Saved. Review the active value before activation.", "تم الحفظ. راجع القيمة السارية قبل التفعيل."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const latest = review?.versions[0];
  const approved = review?.versions.find((item) => item.state === "approved" && item.version !== review.activeVersion);
  const title = finance
    ? `${t("Finance definition", "تعريف مالي")} · ${metric}`
    : pickup
      ? `${t("Pickup commitment authority", "صلاحية الالتزام بموعد التسليم")} · ${policyId.slice("pickup-commitment:".length)}`
      : t("Quote acceptance policy", "سياسة قبول عرض السعر");
  const effect = finance
    ? t("Only approved source types can contribute after activation and a separate completeness review.", "بعد التفعيل ومراجعة الاكتمال بشكل منفصل، لا تساهم إلا أنواع المصادر المعتمدة.")
    : pickup
      ? t("Authorized roles can record a pickup time agreed with the customer after activation.", "يمكن للأدوار المصرح لها تسجيل موعد تسليم وافق عليه العميل بعد التفعيل.")
      : t("New quotes use these rules after activation; accepted quote history stays unchanged.", "تستخدم عروض الأسعار الجديدة هذه القواعد بعد التفعيل، ويظل سجل العروض المقبولة كما هو.");

  return <section className="panel section-gap policy-editor" dir={lang === "ar" ? "rtl" : "ltr"}>
    <h2>{title}</h2>
    <p>{t("An Owner records protected approval evidence. Saving or approving does not activate a rule.", "يسجل المالك دليل الموافقة المحمي. الحفظ أو الموافقة لا يفعّلان القاعدة.")}</p>
    <p className="form-hint">{t("Current active version", "الإصدار الساري")}: {review?.activeVersion ?? t("Unconfigured", "غير مهيأ")}</p>
    {active?.state === "unconfigured" && <p className="form-hint">{active.missing.join(", ")}</p>}
    {active?.state === "approved" && <details className="policy-current-values">
      <summary>{t("View active values", "عرض القيم السارية")}</summary>
      <dl>{flattenPolicy(active.value).map((entry, index) => {
        const key = entry.path.at(-1) ?? "";
        const label = policyLabels[key] ? t(policyLabels[key][0], policyLabels[key][1]) : key.replace(/([A-Z])/g, " $1");
        const parent = entry.path.length > 1 ? entry.path.slice(0, -1).map((part) => policyLabels[part] ? t(policyLabels[part][0], policyLabels[part][1]) : part).join(" · ") : "";
        return <div key={`${entry.path.join(".")}-${index}`}><dt>{parent ? `${parent} · ` : ""}{label}</dt><dd>{entry.value}</dd></div>;
      })}</dl>
    </details>}

    <div className="form-grid">
      {finance ? <>
        <label className="form-field">{t("Currency code", "رمز العملة")}<input className="field-input" required maxLength={3} value={text(value.currency)} onChange={(event) => change("currency", event.target.value.toUpperCase())} placeholder="EGP" /></label>
        <label className="form-field">{t("Minor unit digits", "خانات الوحدة الصغرى")}<input className="field-input" required type="number" min={0} max={6} value={text(value.minorUnitExponent)} onChange={(event) => change("minorUnitExponent", event.target.value)} /></label>
        <label className="form-field full">{t("Reporting time zone", "المنطقة الزمنية للتقارير")}<input className="field-input" required value={text(value.reportingTimezone)} onChange={(event) => change("reportingTimezone", event.target.value)} placeholder="Africa/Cairo" /></label>
        {(["recognitionRule", "taxTreatment", "completenessRule"] as const).map((key) => {
          const label = key === "recognitionRule" ? t("Recognition rule", "قاعدة احتساب القيمة") : key === "taxTreatment" ? t("Tax treatment", "معالجة الضريبة") : t("Completeness rule", "قاعدة اكتمال البيانات");
          const nested = valueRecord(key);
          return <div className="form-field full policy-bilingual" key={key}>
            <strong className="field-label">{label}</strong>
            <div className="form-grid">
              <label>{t("English", "الإنجليزية")}<textarea className="field-textarea" required value={text(nested.en)} onChange={(event) => changeNested(key, "en", event.target.value)} /></label>
              <label>{t("Arabic", "العربية")}<textarea className="field-textarea" required value={text(nested.ar)} onChange={(event) => changeNested(key, "ar", event.target.value)} /></label>
            </div>
          </div>;
        })}
        <label className="form-field">{t("Allowed source types", "أنواع المصادر المسموح بها")}<textarea className="field-textarea" required value={list(value.sourceKinds).join("\n")} onChange={(event) => change("sourceKinds", splitLines(event.target.value))} placeholder={t("One source type per line", "نوع مصدر واحد في كل سطر")} /></label>
        <label className="form-field">{t("Required source types", "أنواع المصادر المطلوبة")}<textarea className="field-textarea" value={list(value.requiredSourceKinds).join("\n")} onChange={(event) => change("requiredSourceKinds", splitLines(event.target.value))} placeholder={t("One source type per line", "نوع مصدر واحد في كل سطر")} /></label>
        <label className="form-field">{t("Empty period means", "الفترة الخالية تعني")}<select className="field-select" value={text(value.emptyPeriod)} onChange={(event) => change("emptyPeriod", event.target.value)}><option value="unavailable">{t("Unavailable", "غير متاحة")}</option><option value="complete">{t("Complete", "مكتملة")}</option></select></label>
      </> : pickup ? <fieldset className="form-field full policy-options">
        <legend className="field-label">{t("Roles allowed to record a pickup commitment", "الأدوار المسموح لها بتسجيل موعد التسليم")}</legend>
        {(["owner", "branch-manager"] as const).map((role) => <label className="policy-check" key={role}><input type="checkbox" checked={list(value.authorizedRoles).includes(role)} onChange={(event) => change("authorizedRoles", event.target.checked ? [...list(value.authorizedRoles), role] : list(value.authorizedRoles).filter((item) => item !== role))} />{role === "owner" ? t("Owner", "المالك") : t("Branch manager", "مدير الفرع")}</label>)}
        <p className="form-hint">{t("Customer agreement is always required.", "موافقة العميل مطلوبة دائماً.")}</p>
      </fieldset> : <>
        <label className="form-field">{t("Quote validity in days", "مدة صلاحية العرض بالأيام")}<input className="field-input" required type="number" min={1} step={1} value={text(value.validityDays)} onChange={(event) => change("validityDays", event.target.value)} /></label>
        <label className="form-field">{t("Override role", "صلاحية الاستثناء")}<select className="field-select" value={text(value.overrideRole)} onChange={(event) => change("overrideRole", event.target.value || null)}><option value="">{t("No override role", "بدون صلاحية استثناء")}</option><option value="owner">{t("Owner", "المالك")}</option><option value="branch-manager">{t("Branch manager", "مدير الفرع")}</option></select></label>
        <fieldset className="form-field full policy-options">
          <legend className="field-label">{t("Accepted confirmation methods", "طرق تأكيد القبول")}</legend>
          {(["staff-recorded", "customer-confirmed"] as const).map((method) => <label className="policy-check" key={method}><input type="checkbox" checked={list(value.acceptanceMethods).includes(method)} onChange={(event) => change("acceptanceMethods", event.target.checked ? [...list(value.acceptanceMethods), method] : list(value.acceptanceMethods).filter((item) => item !== method))} />{method === "staff-recorded" ? t("Recorded by staff", "يسجله الموظف") : t("Confirmed by customer", "يؤكده العميل")}</label>)}
        </fieldset>
        <label className="form-field policy-check"><input type="checkbox" checked={Boolean(value.evidenceRequired)} onChange={(event) => change("evidenceRequired", event.target.checked)} />{t("Require acceptance evidence", "طلب دليل القبول")}</label>
        <label className="form-field">{t("Tax policy ID", "معرف سياسة الضريبة")}<input className="field-input" required value={text(valueRecord("taxTreatment").id)} onChange={(event) => changeNested("taxTreatment", "id", event.target.value)} /></label>
        <label className="form-field">{t("Tax policy version", "إصدار سياسة الضريبة")}<input className="field-input" required type="number" min={1} value={text(valueRecord("taxTreatment").version)} onChange={(event) => changeNested("taxTreatment", "version", event.target.value)} /></label>
      </>}
    </div>
    <div className="form-actions">
      <button className="btn" type="button" disabled={busy || !review} onClick={() => { const next = buildPolicyValue(); if (next) void post("proposals", { id: policyId, expectedVersion: latest?.version ?? 0, value: next }); }}>{t("Save proposal", "حفظ المقترح")}</button>
      <button className="btn btn-primary" type="button" disabled={busy || !review} onClick={approve}>{t("Approve version", "اعتماد الإصدار")}</button>
    </div>
    <div className="form-grid policy-approval">
      <label className="form-field">{t("Protected evidence reference", "مرجع الدليل المحمي")}<input className="field-input" value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} placeholder="private:..." /></label>
      <label className="form-field">{t("Approval reason", "سبب الموافقة")}<input className="field-input" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    </div>
    {approved && <div className="policy-activation">
      <h3>{t("Approved version awaiting activation", "إصدار معتمد ينتظر التفعيل")} {approved.version}</h3>
      <p>{effect}</p>
      <p className="form-hint">{t("Approved by", "اعتمد بواسطة")}: {approved.approvedBy} · {approved.approvedAt} · {approved.reason}</p>
      <button className="btn" type="button" disabled={busy} onClick={() => setConfirmVersion(approved.version)}>{t("Review activation", "مراجعة التفعيل")}</button>
    </div>}
    {confirmVersion !== null && <div className="form-error" role="alert">
      <p>{t("Confirm activation of the approved values shown above.", "أكد تفعيل القيم المعتمدة الموضحة أعلاه.")}</p>
      <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void post("activations", { id: policyId, version: confirmVersion, expectedActiveVersion: review?.activeVersion ?? null })}>{t("Activate approved version", "تفعيل الإصدار المعتمد")}</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
