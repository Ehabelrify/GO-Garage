import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { hasCapability } from "../../shared/capabilities";
import { DEFAULT_CURRENCY, isSupportedCurrency, resolveCurrency, type GradeVersion, type PackageVersion } from "@garage/domain";
import { useGarageStore } from "../../shared/store";
import {
  Collapsible, ConfirmDialog, DataTable, DetailDrawer, EmptyState, Field, FilterBar, FormSection, Money, Notice, PageHeader,
  RequiredNote, StatusBadge, TabBar, TabPanel, formatMoney, majorToMinor, minorToMajor, useUrlState, type Column,
} from "../../shared/components";
import {
  addOnUsage, approvalGap, confirmation, gradeLabel, historyOf, latestById, normaliseDraft, occupancyOptions,
  priceMatrix, priceMinor, roofState, validateDraft, type Category, type MatrixRow, type RoofState,
} from "./catalogue-logic";
import { PackageForm } from "./PackageForm";
import { PriceEditor, PriceHistory } from "./PriceEditor";
import { aggregationOptions, canPublish, isExampleData, priceDiff, priceFormFrom, taxRuleOptions, validatePriceForm, type PriceFormState } from "./price-logic";
import "./catalogue.css";

type Lang = "ar" | "en";
type Action = { kind: "publish" | "retire" | "archive"; entity: "package" | "grade"; id: string; version: number; revision: number; name: string };

function blankPackage(): PackageVersion {
  const scopeId = `scope-${crypto.randomUUID()}`;
  const unconfigured = { state: "unconfigured" as const, missing: ["Owner configuration required"] };
  return {
    ref: { id: `pkg-${crypto.randomUUID()}`, version: 1 }, revision: 1, kind: "package", name: { ar: "", en: "" },
    vehicleCategoryIds: [], vehicleModels: [], branchIds: [], effectiveFrom: null, effectiveThrough: null,
    scope: [{ id: scopeId, serviceId: "", gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1 }],
    work: [{ id: `work-${crypto.randomUUID()}`, serviceId: "", scopeItemIds: [scopeId], occupancyRule: { id: "", version: 1 } }],
    price: unconfigured, tax: unconfigured, workAggregation: unconfigured, provenance: "", approval: null, state: "draft",
  };
}

const errorCopy: Record<string, [string, string]> = {
  INVALID_CATALOGUE: ["Review the required catalogue fields.", "راجع حقول الكتالوج المطلوبة."],
  INVALID_DRAFT: ["Review the draft fields and try again.", "راجع حقول المسودة ثم حاول مرة أخرى."],
  UNKNOWN_REFERENCE: ["Check that each branch, service, and category exists.", "تأكد من وجود كل فرع وخدمة وفئة."],
  CATEGORY_REQUIRED: ["Add or select at least one vehicle category.", "أضف فئة مركبة واحدة على الأقل أو اخترها."],
  INVALID_COMPONENT: ["Check the work items and the scope items they refer to.", "راجع عناصر العمل ونطاق العناصر المرتبطة بها."],
  UNKNOWN_POLICY: ["Use an existing approved work policy.", "استخدم سياسة عمل معتمدة موجودة."],
  APPROVAL_REQUIRED: ["Use a protected evidence reference starting with private: and enter a reason.", "استخدم مرجع دليل محمياً يبدأ بـ private: وأدخل السبب."],
  CONFIGURATION_MISSING: ["Approve price, tax, and work settings before publishing this package.", "اعتمد إعدادات السعر والضريبة والعمل قبل نشر هذه الباقة."],
  REASON_REQUIRED: ["Enter a reason first.", "أدخل السبب أولاً."],
  VEHICLE_NOT_FOUND: ["That vehicle could not be found. Pick it again.", "تعذر العثور على المركبة. اخترها مرة أخرى."],
  STALE_CATALOGUE: ["The catalogue changed. Refresh and edit the latest version.", "تغير الكتالوج. حدّث الصفحة وعدّل أحدث إصدار."],
  STALE_GRADE: ["The grade changed. Refresh and edit the latest version.", "تغيرت الدرجة. حدّث الصفحة وعدّل أحدث إصدار."],
  ROLE_FORBIDDEN: ["You do not have permission to manage the catalogue.", "ليس لديك صلاحية إدارة الكتالوج."],
  UNSUPPORTED_CURRENCY: ["Choose a currency from the supported list.", "اختر عملة من القائمة المدعومة."],
  MIXED_CURRENCY: ["Price and tax must use the same currency.", "يجب أن يستخدم السعر والضريبة العملة نفسها."],
  EFFECTIVE_DATE_INVALID: ["Check the effective date. It cannot be in the future or after the package end date.", "راجع تاريخ السريان. لا يمكن أن يكون في المستقبل أو بعد نهاية الباقة."],
  PACKAGE_RETIRED: ["A retired package cannot be repriced.", "لا يمكن إعادة تسعير باقة متوقفة."],
};

export function CataloguePage({ lang }: { lang: Lang }) {
  const store = useGarageStore();
  const t = useCallback((en: string, ar: string) => lang === "ar" ? ar : en, [lang]);
  const [versions, setVersions] = useState<PackageVersion[]>([]);
  const [grades, setGrades] = useState<GradeVersion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "info" | "warning" } | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useUrlState("tab", "packages");
  const [view, setView] = useUrlState("view", "list");
  const [openId, setOpenId] = useUrlState("record", "");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [priceTarget, setPriceTarget] = useState<PackageVersion | null>(null);
  const [priceForm, setPriceForm] = useState<PriceFormState | null>(null);
  const [priceErrors, setPriceErrors] = useState<Record<string, string>>({});
  const [packageDraft, setPackageDraft] = useState<PackageVersion | null>(null);
  const [draftIsNew, setDraftIsNew] = useState(false);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [gradeOpen, setGradeOpen] = useState(false);
  const [gradeDraft, setGradeDraft] = useState({ en: "", ar: "", thickness: "", provenance: "" });
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState({ en: "", ar: "" });
  const [classify, setClassify] = useState({ vehicleId: "", categoryId: "" });
  const [action, setAction] = useState<Action | null>(null);
  const [evidenceRef, setEvidenceRef] = useState("");
  const [reason, setReason] = useState("");

  const services = store.state?.services ?? [];
  const branches = store.state?.branches ?? [];
  const vehicles = (store.state?.customers ?? []).flatMap((customer) => customer.vehicles.map((vehicle) => ({ ...vehicle, customerName: customer.name })));
  const canManage = !forbidden && hasCapability(store.actor, "catalogue.manage");

  const read = useCallback(async () => {
    const [response, gradeResponse, categoryResponse] = await Promise.all([
      fetch("/api/catalogue/versions"), fetch("/api/catalogue/grades"), fetch("/api/catalogue/categories"),
    ]);
    if ([response, gradeResponse, categoryResponse].some((r) => r.status === 403)) { setForbidden(true); return; }
    if (!response.ok || !gradeResponse.ok || !categoryResponse.ok) throw new Error(t("Catalogue unavailable. Try again.", "الكتالوج غير متاح. حاول مرة أخرى."));
    setVersions(await response.json() as PackageVersion[]);
    setGrades(await gradeResponse.json() as GradeVersion[]);
    setCategories(await categoryResponse.json() as Category[]);
  }, [t]);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    read().catch((error) => setLoadError(error instanceof Error ? error.message : String(error))).finally(() => setLoading(false));
  }, [read]);
  useEffect(load, [load]);

  async function send(url: string, body: object): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { message?: string; code?: string };
      if (!response.ok) {
        const copy = errorCopy[result.code ?? ""];
        throw new Error(copy ? t(copy[0], copy[1]) : result.message ?? t("The change could not be saved.", "تعذر حفظ التغيير."));
      }
      await read();
      setMessage({ text: t("Saved.", "تم الحفظ."), tone: "info" });
      return true;
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), tone: "warning" });
      return false;
    } finally {
      setBusy(false);
    }
  }
  const post = (path: string, body: object) => send(`/api/catalogue/${path}`, body);

  const latestPackages = useMemo(() => [...latestById(versions).values()], [versions]);
  const latestGrades = useMemo(() => [...latestById(grades).values()], [grades]);
  const occupancy = useMemo(() => occupancyOptions(versions), [versions]);
  const serviceName = (id: string) => { const s = services.find((item) => item.id === id); return s ? (lang === "ar" && s.nameAr ? s.nameAr : s.name) : t("Unknown service", "خدمة غير معروفة"); };
  const branchName = (id: string) => { const b = branches.find((item) => item.id === id); return b ? (lang === "ar" && b.nameAr ? b.nameAr : b.name) : t("Unknown branch", "فرع غير معروف"); };
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name[lang] ?? t("Unknown category", "فئة غير معروفة");
  const roofLabel = (state: RoofState) => ({
    included: t("Roof included", "السقف مشمول"), excluded: t("Roof extra", "السقف إضافي"),
    mixed: t("Roof varies", "السقف يختلف"), "not-applicable": t("No roof option", "بدون خيار سقف"),
  })[state];

  const priceBadge = (p: PackageVersion) => confirmation(p) === "confirmed"
    ? <span className="status" data-tone="success">{t("Confirmed", "مؤكد")}</span>
    : <span className="status" data-tone="warning" title={t("Example price, not yet confirmed by the owner", "سعر مثال لم يؤكده المالك بعد")}>{t("Advertised", "معلن")}</span>;
  const priceCell = (p: PackageVersion) => {
    const price = priceMinor(p);
    return price ? <Money minor={price.minor} currency={price.currency} lang={lang} /> : <span className="cat-muted">{t("Price pending", "السعر قيد التحديد")}</span>;
  };

  const filteredPackages = latestPackages.filter((p) => {
    if (stateFilter !== "all" && p.state !== stateFilter) return false;
    if (categoryFilter !== "all" && !p.vehicleCategoryIds.includes(categoryFilter)) return false;
    const q = search.trim().toLowerCase();
    return !q || `${p.name.en} ${p.name.ar}`.toLowerCase().includes(q);
  });
  const clearFilters = () => { setSearch(""); setStateFilter("all"); setCategoryFilter("all"); };
  const filtersActive = Boolean(search.trim()) || stateFilter !== "all" || categoryFilter !== "all";

  function startPackage(source?: PackageVersion) {
    setDraftErrors({});
    if (!source) { setDraftIsNew(true); setPackageDraft({ ...blankPackage(), branchIds: branches.length === 1 ? [branches[0].id] : [] }); return; }
    setDraftIsNew(false);
    setPackageDraft({ ...source, ref: { id: source.ref.id, version: source.ref.version + 1 }, revision: source.revision + 1, approval: null, state: "draft" });
  }

  async function savePackage() {
    if (!packageDraft) return;
    const normalised = normaliseDraft(packageDraft);
    const found = validateDraft(normalised);
    const mapped = Object.fromEntries(Object.entries(found).map(([key, [en, ar]]) => [key, t(en, ar)]));
    setDraftErrors(mapped);
    if (Object.keys(mapped).length) return;
    const prior = latestById(versions).get(normalised.ref.id);
    if (await post("drafts", { package: normalised, expectedRevision: prior?.revision ?? 0 })) {
      setPackageDraft(null);
      setOpenId(normalised.ref.id);
    }
  }

  const today = () => new Date().toISOString().slice(0, 10);
  function startPrice(source: PackageVersion) {
    setPriceErrors({});
    setPriceTarget(source);
    setPriceForm(priceFormFrom(source, resolveCurrency(source.price.state === "approved" ? source.price.value.currency : null, DEFAULT_CURRENCY), today(), minorToMajor));
  }

  async function savePrice() {
    if (!priceTarget || !priceForm) return;
    const found = validatePriceForm(priceForm, majorToMinor, today(), isSupportedCurrency);
    const mapped = Object.fromEntries(Object.entries(found).map(([key, [en, ar]]) => [key, t(en, ar)]));
    setPriceErrors(mapped);
    if (Object.keys(mapped).length) return;
    const taxRule = taxRuleOptions(versions).find((rule) => rule.key === priceForm.taxRuleKey)?.ref;
    const aggregation = aggregationOptions(versions).find((option) => option.key === priceForm.aggregationKey);
    const ok = await post("price-drafts", {
      packageId: priceTarget.ref.id, expectedVersion: priceTarget.ref.version, expectedRevision: priceTarget.revision,
      price: { minor: majorToMinor(priceForm.price, priceForm.currency), currency: priceForm.currency },
      tax: { minor: majorToMinor(priceForm.tax || "0", priceForm.currency), currency: priceForm.currency },
      effectiveFrom: priceForm.effectiveFrom, reason: priceForm.reason.trim(),
      ...(taxRule ? { taxRule } : {}), ...(aggregation ? { aggregation: { rule: aggregation.rule, mode: aggregation.mode } } : {}),
    });
    if (ok) { setPriceTarget(null); setPriceForm(null); setOpenId(priceTarget.ref.id); }
  }

  async function saveGrade(event: FormEvent) {
    event.preventDefault();
    const id = `grade-${crypto.randomUUID()}`;
    const grade: GradeVersion = {
      ref: { id, version: 1 }, revision: 1, name: { en: gradeDraft.en.trim(), ar: gradeDraft.ar.trim() },
      thicknessMicrometres: gradeDraft.thickness.trim() ? Number(gradeDraft.thickness) : null,
      provenance: gradeDraft.provenance.trim(), approval: null, state: "draft",
    };
    if (await post("grades/drafts", { grade, expectedRevision: 0 })) { setGradeDraft({ en: "", ar: "", thickness: "", provenance: "" }); setGradeOpen(false); }
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    if (await post("categories", { id: `category-${crypto.randomUUID()}`, name: { en: categoryDraft.en.trim(), ar: categoryDraft.ar.trim() } })) { setCategoryDraft({ en: "", ar: "" }); setCategoryOpen(false); }
  }

  async function saveClassification(event: FormEvent) {
    event.preventDefault();
    if (await post("vehicle-classifications", classify)) setClassify({ vehicleId: "", categoryId: "" });
  }

  const needsEvidence = action?.kind === "publish";
  const actionGap = action ? (needsEvidence ? approvalGap(evidenceRef, reason) : reason.trim() ? null : "reason") : null;
  const publishing = action?.kind === "publish" && action.entity === "package" ? latestById(versions).get(action.id) : undefined;
  const diff = publishing?.priceChange ? priceDiff(publishing.priceChange.previous.price, publishing.priceChange.price) : null;
  const actionCopy = action && ({
    publish: { title: t("Publish this version?", "نشر هذا الإصدار؟"), confirm: t("Publish", "نشر") },
    retire: { title: t("Retire this record?", "إيقاف هذا السجل؟"), confirm: t("Retire", "إيقاف") },
    archive: { title: t("Archive this record?", "أرشفة هذا السجل؟"), confirm: t("Archive", "أرشفة") },
  })[action.kind];

  async function runAction() {
    if (!action) return;
    const base = action.entity === "package" ? { packageId: action.id } : { gradeId: action.id };
    const prefix = action.entity === "package" ? "" : "grades/";
    let ok = false;
    if (action.kind === "publish") ok = await post(`${prefix}publications`, { ...base, expectedRevision: action.revision, evidenceRef: evidenceRef.trim(), reason: reason.trim() });
    else if (action.kind === "retire") ok = await post(`${prefix}retirements`, { ...base, expectedVersion: action.version, expectedRevision: action.revision, reason: reason.trim() });
    else ok = await send(`/api/owner/records/${action.entity === "package" ? "catalogue-package" : "catalogue-grade"}/${encodeURIComponent(action.id)}/archive`, { reason: reason.trim() });
    if (ok) { setAction(null); setEvidenceRef(""); setReason(""); if (action.kind === "archive") setOpenId(""); }
  }
  const startAction = (next: Action) => { setEvidenceRef(""); setReason(""); setAction(next); };

  const packageColumns: Column<PackageVersion>[] = [
    { key: "name", header: t("Package", "الباقة"), primary: true, sortable: true, sortValue: (p) => p.name[lang], render: (p) => <>{p.name[lang]}{p.kind === "standalone" && <span className="tag">{t("Service", "خدمة")}</span>}</> },
    { key: "categories", header: t("Vehicles", "المركبات"), render: (p) => p.vehicleCategoryIds.map(categoryName).join(", ") || <span className="cat-muted">{t("Not set", "غير محدد")}</span> },
    { key: "price", header: t("Price", "السعر"), numeric: true, sortable: true, sortValue: (p) => priceMinor(p)?.minor ?? null, render: priceCell },
    { key: "basis", header: t("Price status", "حالة السعر"), render: priceBadge },
    { key: "state", header: t("State", "الحالة"), sortable: true, sortValue: (p) => p.state, render: (p) => <StatusBadge status={p.state} domain="policy" lang={lang} /> },
    { key: "actions", header: "", hideOnCard: true, render: (p) => canManage && p.state !== "retired"
      ? <button type="button" className="btn btn-sm" onClick={(e) => { e.stopPropagation(); startPrice(p); }}>{t("Edit price", "تعديل السعر")}</button> : null },
  ];

  const matrixColumns: Column<MatrixRow>[] = [
    { key: "name", header: t("Package", "الباقة"), primary: true, sortable: true, sortValue: (r) => r.pkg.name[lang], render: (r) => r.pkg.name[lang] },
    ...categories.map((category): Column<MatrixRow> => ({
      key: `c-${category.id}`, header: category.name[lang], numeric: true,
      render: (r) => !r.appliesTo[category.id] ? <span className="cat-muted">—</span>
        : r.cells[category.id] ? <Money minor={r.cells[category.id]!.minor} currency={r.cells[category.id]!.currency} lang={lang} />
        : <span className="cat-muted">{t("Pending", "قيد التحديد")}</span>,
    })),
    { key: "roof", header: t("Roof", "السقف"), render: (r) => roofLabel(r.roof) },
    { key: "basis", header: t("Price status", "حالة السعر"), render: (r) => priceBadge(r.pkg) },
  ];

  const addOns = addOnUsage(latestPackages);
  const addOnColumns: Column<(typeof addOns)[number]>[] = [
    { key: "name", header: t("Add-on", "الإضافة"), primary: true, sortable: true, sortValue: (a) => serviceName(a.serviceId), render: (a) => serviceName(a.serviceId) },
    { key: "used", header: t("Offered with", "متاحة مع"), render: (a) => a.packageIds.map((id) => latestById(versions).get(id)?.name[lang] ?? "").filter(Boolean).join(", ") },
  ];

  const gradeColumns: Column<GradeVersion>[] = [
    { key: "name", header: t("Grade", "الدرجة"), primary: true, sortable: true, sortValue: (g) => gradeLabel(g, lang), render: (g) => gradeLabel(g, lang) },
    { key: "thickness", header: t("Thickness", "السُمك"), numeric: true, render: (g) => g.thicknessMicrometres === null ? <span className="cat-muted">{t("Not confirmed", "غير مؤكد")}</span> : `${g.thicknessMicrometres} μm` },
    { key: "state", header: t("State", "الحالة"), sortable: true, sortValue: (g) => g.state, render: (g) => <StatusBadge status={g.state} domain="policy" lang={lang} /> },
    { key: "actions", header: "", hideOnCard: true, render: (g) => canManage && g.state === "draft"
      ? <button type="button" className="btn btn-sm" onClick={(e) => { e.stopPropagation(); startAction({ kind: "publish", entity: "grade", id: g.ref.id, version: g.ref.version, revision: g.revision, name: gradeLabel(g, lang) }); }}>{t("Publish", "نشر")}</button>
      : g.state === "published" && canManage
        ? <button type="button" className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); startAction({ kind: "retire", entity: "grade", id: g.ref.id, version: g.ref.version, revision: g.revision, name: gradeLabel(g, lang) }); }}>{t("Retire", "إيقاف")}</button>
        : null },
  ];

  const current = openId ? latestById(versions).get(openId) : undefined;
  const gradeNameOf = (ref: { id: string }) => { const g = latestGrades.find((x) => x.ref.id === ref.id); return g ? gradeLabel(g, lang) : t("Unknown grade", "درجة غير معروفة"); };

  const detailFooter = current && canManage && <>
    {current.state !== "retired" && <button type="button" className="btn" disabled={busy} onClick={() => startPrice(current)}>{t("Edit price", "تعديل السعر")}</button>}
    {current.state !== "retired" && <button type="button" className="btn" disabled={busy} onClick={() => startPackage(current)}>{current.state === "draft" ? t("Edit draft", "تعديل المسودة") : t("New draft version", "مسودة إصدار جديد")}</button>}
    {current.state === "draft" && <button type="button" className="btn btn-primary" disabled={busy || !canPublish(current)} title={!canPublish(current) ? t("Approve price, tax and work settings first", "اعتمد السعر والضريبة والعمل أولاً") : undefined}
      onClick={() => startAction({ kind: "publish", entity: "package", id: current.ref.id, version: current.ref.version, revision: current.revision, name: current.name[lang] })}>{t("Publish", "نشر")}</button>}
    {current.state === "published" && <button type="button" className="btn btn-danger" disabled={busy}
      onClick={() => startAction({ kind: "retire", entity: "package", id: current.ref.id, version: current.ref.version, revision: current.revision, name: current.name[lang] })}>{t("Retire", "إيقاف")}</button>}
    <button type="button" className="btn btn-danger" disabled={busy}
      onClick={() => startAction({ kind: "archive", entity: "package", id: current.ref.id, version: current.ref.version, revision: current.revision, name: current.name[lang] })}>{t("Archive", "أرشفة")}</button>
  </>;

  const addLabel = tab === "grades" ? t("Add grade", "إضافة درجة") : tab === "categories" ? t("Add category", "إضافة فئة") : t("Add package", "إضافة باقة");
  const onAdd = () => tab === "grades" ? setGradeOpen(true) : tab === "categories" ? setCategoryOpen(true) : startPackage();
  const hasAdvertised = latestPackages.some((p) => confirmation(p) === "advertised");

  const tabs = [
    { id: "packages", label: t("Packages", "الباقات"), count: latestPackages.length },
    { id: "grades", label: t("Grades", "الدرجات"), count: latestGrades.length },
    { id: "categories", label: t("Categories", "الفئات"), count: categories.length },
  ];
  const activeTab = tabs.some((x) => x.id === tab) ? tab : "packages";

  return <div dir={lang === "ar" ? "rtl" : "ltr"}>
    <PageHeader
      title={t("Catalogue", "الكتالوج")}
      actions={canManage ? <button type="button" className="btn btn-primary" onClick={onAdd}>{addLabel}</button> : undefined}
    />
    {message ? <Notice tone={message.tone}>{message.text}</Notice>
      : hasAdvertised && <Notice tone="info">{t("Advertised prices are examples until the owner confirms them.", "الأسعار المعلنة أمثلة حتى يؤكدها المالك.")}</Notice>}

    {forbidden ? <EmptyState variant="error" title={t("No access", "لا يوجد وصول")} text={t("Managing the catalogue needs owner permission.", "إدارة الكتالوج تحتاج صلاحية المالك.")} /> : <>
      <TabBar tabs={tabs} value={activeTab} onChange={setTab} ariaLabel={t("Catalogue sections", "أقسام الكتالوج")} idPrefix="cat" />

      <TabPanel idPrefix="cat" id="packages" active={activeTab === "packages"}>
        <FilterBar lang={lang} onClear={clearFilters} resultCount={filteredPackages.length}
          search={{ value: search, onChange: setSearch, placeholder: t("Search packages", "ابحث في الباقات") }}
          filters={[
            { key: "state", label: t("State", "الحالة"), value: stateFilter, onChange: setStateFilter, options: [{ value: "all", label: t("All states", "كل الحالات") }, { value: "draft", label: t("Draft", "مسودة") }, { value: "published", label: t("Published", "منشورة") }, { value: "retired", label: t("Retired", "متقاعدة") }] },
            { key: "category", label: t("Vehicle", "المركبة"), value: categoryFilter, onChange: setCategoryFilter, options: [{ value: "all", label: t("All vehicles", "كل المركبات") }, ...categories.map((c) => ({ value: c.id, label: c.name[lang] }))] },
          ]}>
          <div className="cat-actions" role="group" aria-label={t("View", "العرض")}>
            <button type="button" className={`btn btn-sm${view !== "matrix" ? " btn-primary" : ""}`} aria-pressed={view !== "matrix"} onClick={() => setView("list")}>{t("List", "قائمة")}</button>
            <button type="button" className={`btn btn-sm${view === "matrix" ? " btn-primary" : ""}`} aria-pressed={view === "matrix"} onClick={() => setView("matrix")}>{t("Price matrix", "جدول الأسعار")}</button>
          </div>
        </FilterBar>
        {view !== "matrix"
          ? <DataTable<PackageVersion> columns={packageColumns} rows={filteredPackages} rowKey={(p) => p.ref.id} lang={lang} caption={t("Packages", "الباقات")}
              loading={loading} error={loadError} onRetry={load} onRowClick={(p) => setOpenId(p.ref.id)} selectedKey={openId || null} initialSort={{ key: "name", direction: "asc" }}
              empty={filtersActive
                ? <EmptyState variant="no-results" title={t("No packages match", "لا توجد باقات مطابقة")} action={<button type="button" className="btn" onClick={clearFilters}>{t("Clear filters", "مسح التصفية")}</button>} />
                : <EmptyState title={t("No packages yet", "لا توجد باقات بعد")} action={canManage ? <button type="button" className="btn btn-primary" onClick={() => startPackage()}>{t("Add package", "إضافة باقة")}</button> : undefined} />} />
          : <>
              <DataTable<MatrixRow> columns={matrixColumns} rows={priceMatrix(filteredPackages, categories)} rowKey={(r) => r.id} lang={lang} caption={t("Price matrix", "جدول الأسعار")}
                loading={loading} error={loadError} onRetry={load} onRowClick={(r) => setOpenId(r.id)} selectedKey={openId || null}
                empty={<EmptyState variant={filtersActive ? "no-results" : "no-data"} title={t("Nothing to show", "لا يوجد ما يعرض")} />} />
              {addOns.length > 0 && <>
                <h2 className="cat-matrix-note">{t("Add-ons", "الإضافات")}</h2>
                <DataTable<(typeof addOns)[number]> columns={addOnColumns} rows={addOns} rowKey={(a) => a.serviceId} lang={lang} caption={t("Add-ons", "الإضافات")} />
              </>}
            </>}
      </TabPanel>

      <TabPanel idPrefix="cat" id="grades" active={activeTab === "grades"}>
        <DataTable<GradeVersion> columns={gradeColumns} rows={latestGrades} rowKey={(g) => g.ref.id} lang={lang} caption={t("Grades", "الدرجات")} loading={loading} error={loadError} onRetry={load}
          empty={<EmptyState title={t("No grades yet", "لا توجد درجات بعد")} action={canManage ? <button type="button" className="btn btn-primary" onClick={() => setGradeOpen(true)}>{t("Add grade", "إضافة درجة")}</button> : undefined} />} />
      </TabPanel>

      <TabPanel idPrefix="cat" id="categories" active={activeTab === "categories"}>
        {loading ? <p className="cat-muted">{t("Loading", "جارٍ التحميل")}</p> : loadError ? <EmptyState variant="error" title={loadError} action={<button type="button" className="btn" onClick={load}>{t("Retry", "إعادة المحاولة")}</button>} />
          : categories.length === 0 ? <EmptyState title={t("No categories yet", "لا توجد فئات بعد")} action={canManage ? <button type="button" className="btn btn-primary" onClick={() => setCategoryOpen(true)}>{t("Add category", "إضافة فئة")}</button> : undefined} />
          : <ul className="cat-list">{categories.map((c) => <li key={c.id}><strong>{c.name[lang]}</strong><span className="cat-muted">{c.name[lang === "ar" ? "en" : "ar"]}</span></li>)}</ul>}
        {canManage && categories.length > 0 && <Collapsible title={t("Classify a vehicle", "تصنيف مركبة")}>
          <form onSubmit={(e) => void saveClassification(e)}>
            <FormSection title={t("Vehicle category", "فئة المركبة")}>
              <Field label={t("Vehicle", "المركبة")} required>
                <select className="field-select" value={classify.vehicleId} onChange={(e) => setClassify({ ...classify, vehicleId: e.target.value })}>
                  <option value="">{t("Choose a vehicle", "اختر مركبة")}</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} · {v.makeModel} · {v.customerName}</option>)}
                </select>
              </Field>
              <Field label={t("Category", "الفئة")} required>
                <select className="field-select" value={classify.categoryId} onChange={(e) => setClassify({ ...classify, categoryId: e.target.value })}>
                  <option value="">{t("Choose a category", "اختر فئة")}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name[lang]}</option>)}
                </select>
              </Field>
            </FormSection>
            <button type="submit" className="btn btn-primary" disabled={busy || !classify.vehicleId || !classify.categoryId}>{t("Save", "حفظ")}</button>
          </form>
        </Collapsible>}
      </TabPanel>
    </>}

    <DetailDrawer open={Boolean(current) && !packageDraft} onClose={() => setOpenId("")} lang={lang} wide title={current?.name[lang] ?? ""}
      subtitle={current ? `${t("Version", "الإصدار")} ${current.ref.version}` : undefined} footer={detailFooter || undefined}>
      {current && <>
        <dl className="cat-kv">
          <dt>{t("State", "الحالة")}</dt><dd><StatusBadge status={current.state} domain="policy" lang={lang} /></dd>
          <dt>{t("Price", "السعر")}</dt><dd>{priceCell(current)} {priceBadge(current)}{isExampleData(current) && <span className="tag" title={t("Example data, not approved policy", "بيانات مثال وليست سياسة معتمدة")}>{t("Example data, not approved policy", "بيانات مثال وليست سياسة معتمدة")}</span>}</dd>
          {current.priceChange && <><dt>{t("Pending price", "السعر المقترح")}</dt><dd><Money minor={current.priceChange.price.minor} currency={current.priceChange.price.currency} lang={lang} /> · {t("effective", "سارٍ")} {current.priceChange.effectiveFrom}</dd></>}
          <dt>{t("Tax", "الضريبة")}</dt><dd>{current.tax.state === "approved" ? (current.tax.value.amount ? <Money minor={current.tax.value.amount.minor} currency={current.tax.value.amount.currency} lang={lang} /> : t("Rule applied", "قاعدة مطبقة")) : <span className="cat-muted">{t("Not set", "غير محدد")}</span>}</dd>
          <dt>{t("Vehicles", "المركبات")}</dt><dd>{current.vehicleCategoryIds.map(categoryName).join(", ") || "—"}</dd>
          <dt>{t("Branches", "الفروع")}</dt><dd>{current.branchIds.map(branchName).join(", ") || "—"}</dd>
          <dt>{t("Roof", "السقف")}</dt><dd>{roofLabel(roofState(current.scope))}</dd>
          <dt>{t("Valid", "الصلاحية")}</dt><dd>{current.effectiveFrom ?? t("Now", "الآن")} – {current.effectiveThrough ?? t("No end date", "بلا نهاية")}</dd>
          {current.provenance && <><dt>{t("Source", "المصدر")}</dt><dd>{current.provenance}</dd></>}
        </dl>
        <Collapsible title={t("Included work", "العمل المشمول")} count={current.scope.length} defaultOpen>
          <ul className="cat-list">{current.scope.map((item) => <li key={item.id}>
            <strong>{serviceName(item.serviceId)}</strong>
            {item.quantity > 1 && <span className="tag">×{item.quantity}</span>}
            {item.gradeVersion && <span className="tag">{gradeNameOf(item.gradeVersion)}</span>}
            {item.addOnIds.map((id) => <span className="tag" key={id}>+ {serviceName(id)}</span>)}
            {item.areas.length > 0 && <span className="cat-muted">{item.areas.join(", ")}</span>}
            {item.exclusions.length > 0 && <span className="cat-muted">{t("Excludes", "يستثني")}: {item.exclusions.join(", ")}</span>}
          </li>)}</ul>
        </Collapsible>
        {canManage && <PriceHistory lang={lang} packageId={current.ref.id} version={current.ref.version} />}
        <Collapsible title={t("Versions", "الإصدارات")} count={historyOf(versions, current.ref.id).length}>
          <ul className="cat-list">{historyOf(versions, current.ref.id).map((v) => <li key={v.ref.version}>
            <strong>{t("Version", "الإصدار")} {v.ref.version}</strong>
            <StatusBadge status={v.state} domain="policy" lang={lang} />
            {v.approval && <span className="cat-muted">{new Date(v.approval.approvedAt).toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB")} · {v.approval.reason}</span>}
          </li>)}</ul>
        </Collapsible>
      </>}
    </DetailDrawer>

    {priceTarget && priceForm && <PriceEditor lang={lang} pkg={priceTarget} form={priceForm} onChange={setPriceForm} allPackages={versions} errors={priceErrors} busy={busy}
      example={isExampleData(priceTarget)} onSubmit={() => void savePrice()} onClose={() => { setPriceTarget(null); setPriceForm(null); }} />}

    {packageDraft && <PackageForm lang={lang} draft={packageDraft} isNew={draftIsNew} onChange={setPackageDraft} categories={categories} branches={branches} services={services}
      grades={grades} occupancy={occupancy} errors={draftErrors} busy={busy} onSubmit={() => void savePackage()} onClose={() => setPackageDraft(null)} />}

    <DetailDrawer open={gradeOpen} onClose={() => setGradeOpen(false)} lang={lang} title={t("Add grade", "إضافة درجة")}
      footer={<><button type="button" className="btn" onClick={() => setGradeOpen(false)}>{t("Cancel", "إلغاء")}</button><button type="submit" form="grade-form" className="btn btn-primary" disabled={busy}>{t("Save draft", "حفظ المسودة")}</button></>}>
      <form id="grade-form" onSubmit={(e) => void saveGrade(e)}>
        <RequiredNote text={t("* Required", "* مطلوب")} />
        <FormSection title={t("Grade", "الدرجة")}>
          <Field label={t("Name (English)", "الاسم (إنجليزي)")} required><input className="field-input" value={gradeDraft.en} onChange={(e) => setGradeDraft({ ...gradeDraft, en: e.target.value })} /></Field>
          <Field label={t("Name (Arabic)", "الاسم (عربي)")} required><input className="field-input" dir="rtl" value={gradeDraft.ar} onChange={(e) => setGradeDraft({ ...gradeDraft, ar: e.target.value })} /></Field>
          <Field label={t("Thickness (μm)", "السُمك (ميكرومتر)")} hint={t("Leave empty until confirmed.", "اتركه فارغاً حتى التأكيد.")}><input className="field-input" type="number" min={1} step={1} value={gradeDraft.thickness} onChange={(e) => setGradeDraft({ ...gradeDraft, thickness: e.target.value })} /></Field>
          <Field label={t("Source note", "ملاحظة المصدر")}><input className="field-input" value={gradeDraft.provenance} onChange={(e) => setGradeDraft({ ...gradeDraft, provenance: e.target.value })} /></Field>
        </FormSection>
      </form>
    </DetailDrawer>

    <DetailDrawer open={categoryOpen} onClose={() => setCategoryOpen(false)} lang={lang} title={t("Add category", "إضافة فئة")}
      footer={<><button type="button" className="btn" onClick={() => setCategoryOpen(false)}>{t("Cancel", "إلغاء")}</button><button type="submit" form="category-form" className="btn btn-primary" disabled={busy}>{t("Save", "حفظ")}</button></>}>
      <form id="category-form" onSubmit={(e) => void saveCategory(e)}>
        <RequiredNote text={t("* Required", "* مطلوب")} />
        <FormSection title={t("Category", "الفئة")}>
          <Field label={t("Name (English)", "الاسم (إنجليزي)")} required><input className="field-input" value={categoryDraft.en} onChange={(e) => setCategoryDraft({ ...categoryDraft, en: e.target.value })} /></Field>
          <Field label={t("Name (Arabic)", "الاسم (عربي)")} required><input className="field-input" dir="rtl" value={categoryDraft.ar} onChange={(e) => setCategoryDraft({ ...categoryDraft, ar: e.target.value })} /></Field>
        </FormSection>
      </form>
    </DetailDrawer>

    <ConfirmDialog
      open={Boolean(action)} lang={lang} danger={action?.kind !== "publish"} busy={busy}
      title={actionCopy?.title ?? ""} body={action?.name} confirmLabel={actionCopy?.confirm}
      confirmDisabled={actionGap !== null}
      disabledReason={actionGap === "evidence" ? t("Enter a protected reference starting with private:", "أدخل مرجعاً محمياً يبدأ بـ private:") : actionGap === "reason" ? t("Enter a reason", "أدخل السبب") : undefined}
      onCancel={() => setAction(null)} onConfirm={() => void runAction()}
    >
      {diff && publishing?.priceChange && <dl className="cat-kv cat-diff-summary">
        <dt>{t("Price", "السعر")}</dt>
        <dd>{diff.before ? <><Money minor={diff.before.minor} currency={diff.before.currency} lang={lang} /> <span aria-hidden="true">{lang === "ar" ? "←" : "→"}</span><span className="sr-only">{t("to", "إلى")}</span> </> : <span className="cat-muted">{t("No approved price", "بدون سعر معتمد")} </span>}<Money minor={diff.after.minor} currency={diff.after.currency} lang={lang} /></dd>
        {diff.delta !== null && <><dt>{t("Change", "الفرق")}</dt><dd>{diff.delta > 0 ? "+" : ""}{formatMoney(diff.delta, diff.after.currency, lang)}</dd></>}
        {!diff.sameCurrency && <><dt>{t("Currency", "العملة")}</dt><dd>{t("Currency changes. Prices are not compared.", "تتغير العملة. لا تتم مقارنة الأسعار.")}</dd></>}
        <dt>{t("Tax", "الضريبة")}</dt><dd><Money minor={publishing.priceChange.tax.minor} currency={publishing.priceChange.tax.currency} lang={lang} /></dd>
        <dt>{t("Effective", "ساري من")}</dt><dd>{publishing.priceChange.effectiveFrom}</dd>
        <dt>{t("Reason", "السبب")}</dt><dd>{publishing.priceChange.reason}</dd>
      </dl>}
      {needsEvidence && <Field label={t("Approval evidence", "دليل الموافقة")} required><input className="field-input" dir="ltr" placeholder="private:..." value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} /></Field>}
      <Field label={t("Reason", "السبب")} required><input className="field-input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </ConfirmDialog>
  </div>;
}
