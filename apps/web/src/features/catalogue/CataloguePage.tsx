import { useEffect, useState, type FormEvent } from "react";
import type { GradeVersion, PackageVersion, ScopeItem, WorkComponent } from "@garage/domain";

const lines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
const unconfigured = { state: "unconfigured" as const, missing: ["Owner configuration required"] };

function blankPackage(): PackageVersion {
  return {
    ref: { id: "", version: 1 },
    revision: 1,
    kind: "package",
    name: { ar: "", en: "" },
    vehicleCategoryIds: [],
    vehicleModels: [],
    branchIds: [],
    effectiveFrom: null,
    effectiveThrough: null,
    scope: [{ id: "scope-1", serviceId: "", gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1 }],
    work: [{ id: "work-1", serviceId: "", scopeItemIds: ["scope-1"], occupancyRule: { id: "", version: 1 } }],
    price: unconfigured,
    tax: unconfigured,
    workAggregation: unconfigured,
    provenance: "",
    approval: null,
    state: "draft",
  };
}

function friendlyError(code: string | undefined, fallback: string, t: (en: string, ar: string) => string) {
  const messages: Record<string, [string, string]> = {
    INVALID_CATALOGUE: ["Review the required catalogue fields.", "راجع حقول الكتالوج المطلوبة."],
    INVALID_DRAFT: ["Review the draft fields and try again.", "راجع حقول المسودة ثم حاول مرة أخرى."],
    UNKNOWN_REFERENCE: ["Check that each branch, service, and category exists.", "تأكد من وجود كل فرع وخدمة وفئة."],
    CATEGORY_REQUIRED: ["Add or select at least one vehicle category.", "أضف فئة مركبة واحدة على الأقل أو اخترها."],
    INVALID_COMPONENT: ["Check the work items and the scope items they refer to.", "راجع عناصر العمل ونطاق العناصر المرتبطة بها."],
    UNKNOWN_POLICY: ["Use an existing approved work policy reference.", "استخدم مرجع سياسة عمل معتمدة موجودة."],
    APPROVAL_REQUIRED: ["Use a protected evidence reference starting with private: and enter a reason.", "استخدم مرجع دليل محمياً يبدأ بـ private: وأدخل السبب."],
    CONFIGURATION_MISSING: ["Approve price, tax, and work settings before publishing this package.", "اعتمد إعدادات السعر والضريبة والعمل قبل نشر هذه الباقة."],
    REASON_REQUIRED: ["Enter a reason before retiring this record.", "أدخل سبباً قبل إيقاف هذا السجل."],
    VEHICLE_NOT_FOUND: ["Check the vehicle ID and try again.", "راجع معرف المركبة وحاول مرة أخرى."],
    STALE_CATALOGUE: ["The catalogue changed. Refresh and edit the latest version.", "تغير الكتالوج. حدّث الصفحة وعدّل أحدث إصدار."],
    STALE_GRADE: ["The grade changed. Refresh and edit the latest version.", "تغيرت الدرجة. حدّث الصفحة وعدّل أحدث إصدار."],
  };
  const copy = messages[code ?? ""];
  return copy ? t(copy[0], copy[1]) : fallback;
}

export function CataloguePage({ lang }: { lang: "ar" | "en" }) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const [versions, setVersions] = useState<PackageVersion[]>([]);
  const [grades, setGrades] = useState<GradeVersion[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: { ar: string; en: string } }>>([]);
  const [categoryId, setCategoryId] = useState("");
  const [categoryEn, setCategoryEn] = useState("");
  const [categoryAr, setCategoryAr] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleCategoryId, setVehicleCategoryId] = useState("");
  const [packageDraft, setPackageDraft] = useState<PackageVersion | null>(null);
  const [gradeDraft, setGradeDraft] = useState({ id: "", en: "", ar: "", thickness: "", provenance: "" });
  const [evidenceRef, setEvidenceRef] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function read() {
    const [response, gradeResponse, categoryResponse] = await Promise.all([
      fetch("/api/catalogue/versions"),
      fetch("/api/catalogue/grades"),
      fetch("/api/catalogue/categories"),
    ]);
    if (!response.ok || !gradeResponse.ok || !categoryResponse.ok) throw new Error(t("Catalogue unavailable. Refresh and try again.", "الكتالوج غير متاح. حدّث الصفحة وحاول مرة أخرى."));
    setVersions(await response.json() as PackageVersion[]);
    setGrades(await gradeResponse.json() as GradeVersion[]);
    setCategories(await categoryResponse.json() as typeof categories);
  }

  useEffect(() => { void read().catch((error) => setMessage(error instanceof Error ? error.message : String(error))); }, []);

  async function post(path: string, body: object): Promise<boolean> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/catalogue/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as { message?: string; code?: string };
      if (!response.ok) throw new Error(friendlyError(result.code, result.message ?? t("The change could not be saved.", "تعذر حفظ التغيير."), t));
      await read();
      setMessage(t("Saved. Review the version history.", "تم الحفظ. راجع سجل الإصدارات."));
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function publish(path: string, body: object) {
    if (!/^private:[A-Za-z0-9/_-]+$/.test(evidenceRef.trim()) || !reason.trim()) {
      setMessage(t("Use a protected evidence reference starting with private: and enter a reason before publishing.", "استخدم مرجع دليل محمياً يبدأ بـ private: وأدخل السبب قبل النشر."));
      return;
    }
    void post(path, body);
  }

  const latest = new Map<string, PackageVersion>();
  for (const version of versions) if (!latest.has(version.ref.id)) latest.set(version.ref.id, version);
  const latestGrade = new Map<string, GradeVersion>();
  for (const grade of grades) if (!latestGrade.has(grade.ref.id)) latestGrade.set(grade.ref.id, grade);

  function editPackage(source?: PackageVersion) {
    if (!source) {
      setPackageDraft(blankPackage());
      return;
    }
    setPackageDraft({
      ...source,
      ref: { id: source.ref.id, version: source.ref.version + 1 },
      revision: source.revision + 1,
      approval: null,
      state: "draft",
    });
  }

  function updateScope(index: number, patch: Partial<ScopeItem>) {
    setPackageDraft((current) => {
      if (!current) return current;
      const priorId = current.scope[index]?.id;
      const nextId = patch.id ?? priorId;
      return {
        ...current,
        scope: current.scope.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
        work: priorId === nextId ? current.work : current.work.map((item) => ({ ...item, scopeItemIds: item.scopeItemIds.map((id) => id === priorId ? nextId : id) })),
      };
    });
  }

  function removeScope(index: number) {
    setPackageDraft((current) => {
      if (!current || current.scope.length <= 1) return current;
      const removedId = current.scope[index].id;
      const work = current.work.map((item) => ({ ...item, scopeItemIds: item.scopeItemIds.filter((id) => id !== removedId) })).filter((item) => item.scopeItemIds.length > 0);
      return { ...current, scope: current.scope.filter((_, itemIndex) => itemIndex !== index), work };
    });
  }

  function updateWork(index: number, patch: Partial<WorkComponent>) {
    setPackageDraft((current) => current ? { ...current, work: current.work.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) } : current);
  }

  function savePackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!packageDraft) return;
    const prior = latest.get(packageDraft.ref.id);
    if (!packageDraft.ref.id.trim()) {
      setMessage(t("Enter a package ID.", "أدخل معرف الباقة."));
      return;
    }
    void (async () => {
      if (await post("drafts", { package: packageDraft, expectedRevision: prior?.revision ?? 0 })) setPackageDraft(null);
    })();
  }

  function saveGrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = gradeDraft.id.trim();
    if (!id) {
      setMessage(t("Enter a grade ID.", "أدخل معرف الدرجة."));
      return;
    }
    const latestValue = latestGrade.get(id);
    const grade: GradeVersion = {
      ref: { id, version: (latestValue?.ref.version ?? 0) + 1 },
      revision: (latestValue?.revision ?? 0) + 1,
      name: { en: gradeDraft.en.trim(), ar: gradeDraft.ar.trim() },
      thicknessMicrometres: gradeDraft.thickness.trim() ? Number(gradeDraft.thickness) : null,
      provenance: gradeDraft.provenance.trim(),
      approval: null,
      state: "draft",
    };
    void (async () => {
      if (await post("grades/drafts", { grade, expectedRevision: latestValue?.revision ?? 0 })) {
        setGradeDraft({ id: "", en: "", ar: "", thickness: "", provenance: "" });
      }
    })();
  }

  return <div dir={lang === "ar" ? "rtl" : "ltr"}>
    <h1>{t("Catalogue and packages", "الكتالوج والباقات")}</h1>
    <p>{t("Manage named package and grade records. Prices stay unconfigured until their approved policy is available.", "أدر الباقات والدرجات بالحقول الواضحة. تظل الأسعار غير مهيأة حتى تتوفر السياسة المعتمدة.")}</p>
    {message && <p role="status">{message}</p>}

    <section className="panel section-gap">
      <div className="panel-title-row">
        <div><h2 className="panel-title">{t("Packages", "الباقات")}</h2><p className="panel-desc">{t("Each version keeps its scope and approval history.", "يحتفظ كل إصدار بالنطاق وسجل الموافقات.")}</p></div>
        <button className="btn btn-primary" type="button" onClick={() => editPackage()}>{t("New package", "باقة جديدة")}</button>
      </div>
      {versions.map((p) => <article className="catalogue-record" key={`${p.ref.id}:${p.ref.version}`}>
        <h3>{p.name[lang]} · {p.ref.id} · v{p.ref.version}</h3>
        <p>{p.state} · {p.kind} · {p.branchIds.join(", ")}</p>
        <p>{t("Categories", "الفئات")}: {p.vehicleCategoryIds.join(", ") || t("Not set", "غير محددة")} · {t("Price", "السعر")}: {p.price.state === "approved" ? `${p.price.value.minor} ${p.price.value.currency}` : t("Not configured", "غير مهيأ")} · {t("Tax", "الضريبة")}: {p.tax.state === "approved" ? p.tax.value.amount ? `${p.tax.value.amount.minor} ${p.tax.value.amount.currency}` : `${t("Rule", "قاعدة")}: ${p.tax.value.rule.id}` : t("Not configured", "غير مهيأ")} · {t("Work aggregation", "تجميع العمل")}: {p.workAggregation.state === "approved" ? p.workAggregation.value.mode : t("Not configured", "غير مهيأ")}</p>
        <p>{t("Models", "الطرازات")}: {p.vehicleModels.join(", ") || t("All listed categories", "كل الفئات المحددة")} · {t("Branches", "الفروع")}: {p.branchIds.join(", ") || t("Not set", "غير محددة")} · {t("Effective", "السريان")}: {p.effectiveFrom ?? t("Not set", "غير محدد")} — {p.effectiveThrough ?? t("No end date", "بلا تاريخ انتهاء")}</p>
        <ul>{p.scope.map((item) => <li key={item.id}>{item.serviceId} — {item.areas.join(", ") || t("No areas listed", "لم تُحدد مناطق")} · {t("Quantity", "الكمية")}: {item.quantity} · {t("Roof", "السقف")}: {item.roof} · {t("Add-ons", "الإضافات")}: {item.addOnIds.join(", ") || "—"} · {t("Exclusions", "الاستثناءات")}: {item.exclusions.join(", ") || "—"}</li>)}</ul>
        {p.work.length > 0 && <ul>{p.work.map((item) => <li key={item.id}>{item.serviceId} · {t("Includes scope", "يشمل النطاق")}: {item.scopeItemIds.join(", ")} · {t("Occupancy policy", "سياسة الإشغال")}: {item.occupancyRule.id} v{item.occupancyRule.version}</li>)}</ul>}
        {p.state === "draft" && latest.get(p.ref.id)?.ref.version === p.ref.version && <button className="btn" type="button" disabled={busy} onClick={() => editPackage(p)}>{t("Edit draft", "تعديل المسودة")}</button>}
        {p.state === "draft" && latest.get(p.ref.id)?.ref.version === p.ref.version && <button className="btn" type="button" disabled={busy} onClick={() => publish("publications", { packageId: p.ref.id, expectedRevision: p.revision, evidenceRef, reason })}>{t("Publish approved draft", "نشر المسودة المعتمدة")}</button>}
        {p.state === "published" && latest.get(p.ref.id)?.ref.version === p.ref.version && <button className="btn btn-danger" type="button" disabled={busy || !reason.trim()} onClick={() => void post("retirements", { packageId: p.ref.id, expectedVersion: p.ref.version, expectedRevision: p.revision, reason })}>{t("Retire package", "إيقاف الباقة")}</button>}
      </article>)}
      {!versions.length && <p className="form-hint">{t("No package versions have been added yet.", "لم تتم إضافة إصدارات باقات بعد.")}</p>}
    </section>

    {packageDraft && <form className="form-panel section-gap" onSubmit={savePackage}>
      <h2>{t("Package draft", "مسودة باقة")}</h2>
      <p className="form-hint">{t("Use one line per category, model, branch, area, add-on, or exclusion. Price and tax remain unconfigured until approved policies are available.", "اكتب كل فئة أو طراز أو فرع أو منطقة أو إضافة أو استثناء في سطر. يظل السعر والضريبة غير مهيأين حتى تتوفر السياسات المعتمدة.")}</p>
      <div className="form-grid">
        <label className="form-field">{t("Package ID", "معرف الباقة")}<input className="field-input" required value={packageDraft.ref.id} onChange={(event) => setPackageDraft({ ...packageDraft, ref: { ...packageDraft.ref, id: event.target.value } })} /></label>
        <label className="form-field">{t("Package type", "نوع الباقة")}<select className="field-select" value={packageDraft.kind} onChange={(event) => setPackageDraft({ ...packageDraft, kind: event.target.value as PackageVersion["kind"] })}><option value="package">{t("Package", "باقة")}</option><option value="standalone">{t("Standalone service", "خدمة منفردة")}</option></select></label>
        <label className="form-field">{t("Name in English", "الاسم بالإنجليزية")}<input className="field-input" required value={packageDraft.name.en} onChange={(event) => setPackageDraft({ ...packageDraft, name: { ...packageDraft.name, en: event.target.value } })} /></label>
        <label className="form-field">{t("Name in Arabic", "الاسم بالعربية")}<input className="field-input" required value={packageDraft.name.ar} onChange={(event) => setPackageDraft({ ...packageDraft, name: { ...packageDraft.name, ar: event.target.value } })} /></label>
        <label className="form-field">{t("Vehicle category IDs", "معرفات فئات المركبة")}<textarea className="field-textarea" required value={packageDraft.vehicleCategoryIds.join("\n")} onChange={(event) => setPackageDraft({ ...packageDraft, vehicleCategoryIds: lines(event.target.value) })} /></label>
        <label className="form-field">{t("Vehicle models", "طرازات المركبات")}<textarea className="field-textarea" value={packageDraft.vehicleModels.join("\n")} onChange={(event) => setPackageDraft({ ...packageDraft, vehicleModels: lines(event.target.value) })} /></label>
        <label className="form-field">{t("Branch IDs", "معرفات الفروع")}<textarea className="field-textarea" required value={packageDraft.branchIds.join("\n")} onChange={(event) => setPackageDraft({ ...packageDraft, branchIds: lines(event.target.value) })} /></label>
        <label className="form-field">{t("Source / provenance", "المصدر") }<textarea className="field-textarea" value={packageDraft.provenance} onChange={(event) => setPackageDraft({ ...packageDraft, provenance: event.target.value })} /></label>
        <label className="form-field">{t("Effective from", "ساري من")}<input className="field-input" type="date" value={packageDraft.effectiveFrom ?? ""} onChange={(event) => setPackageDraft({ ...packageDraft, effectiveFrom: event.target.value || null })} /></label>
        <label className="form-field">{t("Effective through", "ساري حتى")}<input className="field-input" type="date" value={packageDraft.effectiveThrough ?? ""} onChange={(event) => setPackageDraft({ ...packageDraft, effectiveThrough: event.target.value || null })} /></label>
      </div>
      <h3>{t("Included work scope", "نطاق العمل المشمول")}</h3>
      {packageDraft.scope.map((item, index) => <div className="form-subsection" key={item.id}>
        <div className="form-grid">
          <label className="form-field">{t("Scope item ID", "معرف بند النطاق")}<input className="field-input" required value={item.id} onChange={(event) => updateScope(index, { id: event.target.value })} /></label>
          <label className="form-field">{t("Service ID", "معرف الخدمة")}<input className="field-input" required value={item.serviceId} onChange={(event) => updateScope(index, { serviceId: event.target.value })} /></label>
          <label className="form-field">{t("Grade ID", "معرف الدرجة")}<input className="field-input" value={item.gradeVersion?.id ?? ""} onChange={(event) => updateScope(index, { gradeVersion: event.target.value ? { id: event.target.value, version: item.gradeVersion?.version ?? 1 } : null })} /></label>
          <label className="form-field">{t("Grade version", "إصدار الدرجة")}<input className="field-input" type="number" min={1} value={item.gradeVersion?.version ?? ""} onChange={(event) => updateScope(index, { gradeVersion: event.target.value ? { id: item.gradeVersion?.id ?? "", version: Number(event.target.value) } : null })} /></label>
          <label className="form-field">{t("Areas included", "المناطق المشمولة")}<textarea className="field-textarea" value={item.areas.join("\n")} onChange={(event) => updateScope(index, { areas: lines(event.target.value) })} /></label>
          <label className="form-field">{t("Add-on service IDs", "معرفات الخدمات الإضافية")}<textarea className="field-textarea" value={item.addOnIds.join("\n")} onChange={(event) => updateScope(index, { addOnIds: lines(event.target.value) })} /></label>
          <label className="form-field">{t("Exclusions", "الاستثناءات")}<textarea className="field-textarea" value={item.exclusions.join("\n")} onChange={(event) => updateScope(index, { exclusions: lines(event.target.value) })} /></label>
          <label className="form-field">{t("Roof", "السقف")}<select className="field-select" value={item.roof} onChange={(event) => updateScope(index, { roof: event.target.value as ScopeItem["roof"] })}><option value="not-applicable">{t("Not applicable", "لا ينطبق")}</option><option value="included">{t("Included", "مشمول")}</option><option value="excluded">{t("Excluded", "مستثنى")}</option></select></label>
          <label className="form-field">{t("Quantity", "الكمية")}<input className="field-input" type="number" min={1} step={1} required value={item.quantity} onChange={(event) => updateScope(index, { quantity: Number(event.target.value) })} /></label>
        </div>
        {packageDraft.scope.length > 1 && <button className="btn btn-danger" type="button" onClick={() => removeScope(index)}>{t("Remove scope item", "حذف بند النطاق")}</button>}
      </div>)}
      <button className="btn" type="button" onClick={() => {
        const id = `scope-${packageDraft.scope.length + 1}`;
        setPackageDraft({ ...packageDraft, scope: [...packageDraft.scope, { id, serviceId: "", gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1 }] });
      }}>{t("Add scope item", "إضافة بند نطاق")}</button>
      <h3>{t("Work components", "مكونات العمل")}</h3>
      {packageDraft.work.map((item, index) => <div className="form-subsection" key={`${item.id}-${index}`}>
        <div className="form-grid">
          <label className="form-field">{t("Component ID", "معرف المكون")}<input className="field-input" required value={item.id} onChange={(event) => updateWork(index, { id: event.target.value })} /></label>
          <label className="form-field">{t("Service ID", "معرف الخدمة")}<input className="field-input" required value={item.serviceId} onChange={(event) => updateWork(index, { serviceId: event.target.value })} /></label>
          <label className="form-field">{t("Scope item IDs", "معرفات بنود النطاق")}<textarea className="field-textarea" required value={item.scopeItemIds.join("\n")} onChange={(event) => updateWork(index, { scopeItemIds: lines(event.target.value) })} /></label>
          <label className="form-field">{t("Approved occupancy policy ID", "معرف سياسة إشغال معتمدة")}<input className="field-input" required value={item.occupancyRule.id} onChange={(event) => updateWork(index, { occupancyRule: { ...item.occupancyRule, id: event.target.value } })} /></label>
          <label className="form-field">{t("Policy version", "إصدار السياسة")}<input className="field-input" type="number" min={1} required value={item.occupancyRule.version} onChange={(event) => updateWork(index, { occupancyRule: { ...item.occupancyRule, version: Number(event.target.value) } })} /></label>
        </div>
        {packageDraft.work.length > 1 && <button className="btn btn-danger" type="button" onClick={() => setPackageDraft({ ...packageDraft, work: packageDraft.work.filter((_, itemIndex) => itemIndex !== index) })}>{t("Remove work component", "حذف مكون العمل")}</button>}
      </div>)}
      <button className="btn" type="button" onClick={() => setPackageDraft({ ...packageDraft, work: [...packageDraft.work, { id: `work-${packageDraft.work.length + 1}`, serviceId: "", scopeItemIds: [], occupancyRule: { id: "", version: 1 } }] })}>{t("Add work component", "إضافة مكون عمل")}</button>
      <p className="form-hint">{t("This draft keeps existing price, tax, and work-aggregation settings. New drafts leave them unconfigured until Owner-approved policies exist.", "تحتفظ المسودة بإعدادات السعر والضريبة وتجميع العمل الحالية. تترك المسودات الجديدة هذه القيم غير مهيأة حتى تتوفر سياسات معتمدة من المالك.")}</p>
      <div className="form-actions">
        <button className="btn" type="button" onClick={() => setPackageDraft(null)}>{t("Close", "إغلاق")}</button>
        <button className="btn btn-primary" type="submit" disabled={busy}>{t("Save package draft", "حفظ مسودة الباقة")}</button>
      </div>
    </form>}

    <section className="panel section-gap">
      <h2>{t("Grades", "الدرجات")}</h2>
      <p className="panel-desc">{t("A grade describes a material option; thickness remains empty when it has not been confirmed.", "توضح الدرجة خيار المادة؛ ويظل السُمك فارغاً إذا لم يتم تأكيده.")}</p>
      {grades.map((grade) => <article className="catalogue-record" key={`${grade.ref.id}:${grade.ref.version}`}>
        <strong>{grade.name[lang]} · {grade.ref.id} v{grade.ref.version}</strong>
        <p>{grade.state} · {grade.thicknessMicrometres === null ? t("Thickness not set", "السُمك غير محدد") : `${grade.thicknessMicrometres} μm`}</p>
        {grade.state === "draft" && latestGrade.get(grade.ref.id)?.ref.version === grade.ref.version && <button className="btn" type="button" disabled={busy} onClick={() => publish("grades/publications", { gradeId: grade.ref.id, expectedRevision: grade.revision, evidenceRef, reason })}>{t("Publish grade", "نشر الدرجة")}</button>}
        {grade.state === "published" && latestGrade.get(grade.ref.id)?.ref.version === grade.ref.version && <button className="btn btn-danger" type="button" disabled={busy || !reason.trim()} onClick={() => void post("grades/retirements", { gradeId: grade.ref.id, expectedVersion: grade.ref.version, expectedRevision: grade.revision, reason })}>{t("Retire grade", "إيقاف الدرجة")}</button>}
      </article>)}
      <form className="form-subsection" onSubmit={saveGrade}>
        <h3>{t("Create grade draft", "إنشاء مسودة درجة")}</h3>
        <div className="form-grid">
          <label className="form-field">{t("Grade ID", "معرف الدرجة")}<input className="field-input" required value={gradeDraft.id} onChange={(event) => setGradeDraft({ ...gradeDraft, id: event.target.value })} /></label>
          <label className="form-field">{t("Name in English", "الاسم بالإنجليزية")}<input className="field-input" required value={gradeDraft.en} onChange={(event) => setGradeDraft({ ...gradeDraft, en: event.target.value })} /></label>
          <label className="form-field">{t("Name in Arabic", "الاسم بالعربية")}<input className="field-input" required value={gradeDraft.ar} onChange={(event) => setGradeDraft({ ...gradeDraft, ar: event.target.value })} /></label>
          <label className="form-field">{t("Thickness in micrometres", "السُمك بالميكرومتر")}<input className="field-input" type="number" min={1} step={1} value={gradeDraft.thickness} onChange={(event) => setGradeDraft({ ...gradeDraft, thickness: event.target.value })} /></label>
          <label className="form-field full">{t("Source / provenance", "المصدر")}<textarea className="field-textarea" value={gradeDraft.provenance} onChange={(event) => setGradeDraft({ ...gradeDraft, provenance: event.target.value })} /></label>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>{t("Save grade draft", "حفظ مسودة الدرجة")}</button>
      </form>
    </section>

    <section className="panel section-gap">
      <h2>{t("Vehicle categories", "فئات المركبات")}</h2>
      <p>{t("Assign a category only after review. Existing vehicles remain unclassified until then.", "حدد الفئة بعد المراجعة فقط. تظل المركبات الحالية بلا تصنيف حتى ذلك الحين.")}</p>
      <div className="catalogue-record-list">{categories.map((category) => <p key={category.id}>{category.id} · {category.name[lang]}</p>)}</div>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void (async () => { if (await post("categories", { id: categoryId, name: { en: categoryEn, ar: categoryAr } })) { setCategoryId(""); setCategoryEn(""); setCategoryAr(""); } })(); }}>
        <label className="form-field">{t("Category ID", "معرف الفئة")}<input className="field-input" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} /></label>
        <label className="form-field">{t("Name in English", "الاسم بالإنجليزية")}<input className="field-input" required value={categoryEn} onChange={(event) => setCategoryEn(event.target.value)} /></label>
        <label className="form-field">{t("Name in Arabic", "الاسم بالعربية")}<input className="field-input" required value={categoryAr} onChange={(event) => setCategoryAr(event.target.value)} /></label>
        <button className="btn" type="submit" disabled={busy}>{t("Add category", "إضافة فئة")}</button>
      </form>
      <form className="form-grid section-gap" onSubmit={(event) => { event.preventDefault(); void (async () => { if (await post("vehicle-classifications", { vehicleId, categoryId: vehicleCategoryId })) { setVehicleId(""); setVehicleCategoryId(""); } })(); }}>
        <label className="form-field">{t("Vehicle ID", "معرف المركبة")}<input className="field-input" required value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} /></label>
        <label className="form-field">{t("Reviewed category", "الفئة التي تمت مراجعتها")}<select className="field-select" required value={vehicleCategoryId} onChange={(event) => setVehicleCategoryId(event.target.value)}><option value="">{t("Choose a category", "اختر فئة")}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name[lang]}</option>)}</select></label>
        <button className="btn" type="submit" disabled={busy}>{t("Save vehicle category", "حفظ فئة المركبة")}</button>
      </form>
    </section>

    <section className="panel section-gap">
      <h2>{t("Approval details", "تفاصيل الموافقة")}</h2>
      <p className="panel-desc">{t("These details are required when publishing or retiring a record.", "هذه البيانات مطلوبة عند نشر سجل أو إيقافه.")}</p>
      <div className="form-grid">
        <label className="form-field">{t("Protected evidence reference", "مرجع الدليل المحمي")}<input className="field-input" value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} placeholder="private:..." /></label>
        <label className="form-field">{t("Reason", "السبب")}<input className="field-input" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      </div>
    </section>
  </div>;
}
