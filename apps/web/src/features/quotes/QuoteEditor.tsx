import { useState } from "react";
import type { QuoteDraftInput, QuoteVersionRef, ScopeItem, WorkComponent, QuoteLine } from "@garage/domain";
import { quoteApi, useGarageStore } from "../../shared/store";

const lines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
const blankScope = (id: string, serviceId = ""): ScopeItem => ({
  id,
  serviceId,
  gradeVersion: null,
  areas: [],
  roof: "not-applicable",
  addOnIds: [],
  exclusions: [],
  quantity: 1,
});
const blankWork = (id: string, serviceId = "", scopeItemIds: string[] = []): WorkComponent => ({
  id,
  serviceId,
  scopeItemIds,
  occupancyRule: { id: "", version: 1 },
});
const blankLine = (id: string, scopeItemId: string, quantity = 1): QuoteLine => ({
  id,
  scopeItemId,
  quantity,
  unitPrice: { minor: 0, currency: "" },
  discount: { minor: 0, currency: "" },
  tax: null,
});

function createDraft(state: ReturnType<typeof useGarageStore>["state"]): QuoteDraftInput {
  const branchId = state?.currentBranch !== "all" ? state?.currentBranch : "";
  const scope = [blankScope(`scope-${crypto.randomUUID()}`)];
  return {
    branchId: branchId ?? "",
    customerId: "",
    vehicle: { vehicleId: "", model: "", categoryId: null },
    packageVersion: null,
    scope,
    work: [blankWork(`work-${crypto.randomUUID()}`, "", [scope[0].id])],
    lines: [blankLine(`line-${crypto.randomUUID()}`, scope[0].id)],
    priceOrigin: { kind: "catalogue" },
    taxTreatment: null,
    acceptancePolicy: null,
    validThrough: null,
    warrantyBindings: [],
    benefitBindings: [],
    state: "draft",
  };
}

function errorCopy(error: unknown, t: (en: string, ar: string) => string) {
  const raw = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const messages: Array<[string, string, string]> = [
    ["QUOTE_CONTEXT_NOT_FOUND", "Choose a customer, vehicle, and branch that belong together.", "اختر عميلاً ومركبة وفرعاً مرتبطين ببعضهم."],
    ["QUOTE_CONTEXT_CHANGED", "Refresh the customer and vehicle choices, then try again.", "حدّث اختيارات العميل والمركبة ثم حاول مرة أخرى."],
    ["VEHICLE_SELECTION_STALE", "Refresh the vehicle choice and try again.", "حدّث اختيار المركبة وحاول مرة أخرى."],
    ["UNKNOWN_SERVICE", "Choose an active service for every scope and work item.", "اختر خدمة نشطة لكل بند نطاق ومكون عمل."],
    ["INVALID_SCOPE", "Match each quote line and work component to a scope item.", "اربط كل بند سعر ومكون عمل ببند نطاق."],
    ["POLICY_UNCONFIGURED", "An approved pricing, tax, or acceptance policy is missing.", "سياسة التسعير أو الضريبة أو القبول المعتمدة غير متاحة."],
    ["INVALID_AMOUNT", "Check each amount and make sure discounts do not exceed the price.", "راجع المبالغ وتأكد من أن الخصم لا يتجاوز السعر."],
    ["INVALID_QUOTE", "Some quote fields are incomplete or invalid. Review the highlighted sections.", "بعض حقول العرض غير مكتملة أو غير صحيحة. راجع الأقسام الموضحة."],
    ["STALE_QUOTE_REVISION", "This quote changed. Refresh it before saving another revision.", "تغير العرض. حدّثه قبل حفظ مراجعة أخرى."],
    ["ROLE_FORBIDDEN", "Your account does not have permission to edit quotes.", "حسابك لا يملك صلاحية تعديل عروض الأسعار."],
    ["PRICING_AUTHORITY_REQUIRED", "Your role cannot record this manual price without an approved pricing rule.", "لا يملك دورك صلاحية تسجيل هذا السعر اليدوي دون قاعدة تسعير معتمدة."],
    ["CATALOGUE_SCOPE_STALE", "The selected catalogue scope is no longer current.", "نطاق الكتالوج المحدد لم يعد سارياً."],
    ["CATALOGUE_PRICE_STALE", "The quote amount does not match the approved catalogue price.", "قيمة العرض لا تطابق سعر الكتالوج المعتمد."],
    ["QUOTE_EXPIRED", "Choose a valid-through date in the future.", "اختر تاريخ صلاحية قادماً."],
    ["WRITE_OUTCOME_UNKNOWN", "The save result is not confirmed. Refresh the quote list before retrying.", "لم يتم تأكيد نتيجة الحفظ. حدّث قائمة العروض قبل إعادة المحاولة."],
  ];
  const match = messages.find(([candidate]) => candidate === code || raw.includes(candidate));
  return match ? t(match[1], match[2]) : raw;
}

export function QuoteEditor({ lang, onSaved, initial }: { lang: "ar" | "en"; onSaved: (ref: QuoteVersionRef) => void; initial?: QuoteDraftInput }) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const store = useGarageStore();
  const [form, setForm] = useState<QuoteDraftInput>(() => initial ? structuredClone(initial) : createDraft(store.state));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [enteredUnitPriceIds, setEnteredUnitPriceIds] = useState<string[]>(() => initial?.lines.filter((item) => item.unitPrice.currency.trim() !== "").map((item) => item.id) ?? []);
  const [packageId, setPackageId] = useState(initial?.packageVersion?.id ?? "");
  const [packageVersion, setPackageVersion] = useState(initial?.packageVersion?.version ? String(initial.packageVersion.version) : "");
  const [priceReason, setPriceReason] = useState(initial?.priceOrigin.kind === "catalogue" ? "" : initial?.priceOrigin.reason ?? "");
  const [taxId, setTaxId] = useState(initial?.taxTreatment?.id ?? "");
  const [taxVersion, setTaxVersion] = useState(initial?.taxTreatment?.version ? String(initial.taxTreatment.version) : "");
  const [acceptanceId, setAcceptanceId] = useState(initial?.acceptancePolicy?.id ?? "");
  const [acceptanceVersion, setAcceptanceVersion] = useState(initial?.acceptancePolicy?.version ? String(initial.acceptancePolicy.version) : "");

  const customers = store.state?.customers ?? [];
  const branches = store.state?.branches ?? [];
  const services = store.state?.services ?? [];
  const selectedCustomer = customers.find((customer) => customer.id === form.customerId);
  const availableVehicles = selectedCustomer?.vehicles ?? [];

  function updateScope(index: number, patch: Partial<ScopeItem>) {
    setForm((current) => {
      const priorId = current.scope[index]?.id;
      const nextId = patch.id ?? priorId;
      return {
        ...current,
        scope: current.scope.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
        work: priorId === nextId ? current.work : current.work.map((item) => ({ ...item, scopeItemIds: item.scopeItemIds.map((id) => id === priorId ? nextId : id) })),
        lines: priorId === nextId ? current.lines : current.lines.map((item) => item.scopeItemId === priorId ? { ...item, scopeItemId: nextId } : item),
      };
    });
  }

  function updateWork(index: number, patch: Partial<WorkComponent>) {
    setForm((current) => ({ ...current, work: current.work.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  }

  function updateLine(index: number, patch: Partial<QuoteLine>) {
    setForm((current) => ({ ...current, lines: current.lines.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  }

  function changeCustomer(customerId: string) {
    setForm((current) => ({
      ...current,
      customerId,
      vehicle: { vehicleId: "", model: "", categoryId: null },
    }));
  }

  function addScope() {
    const id = `scope-${crypto.randomUUID()}`;
    setForm((current) => ({
      ...current,
      scope: [...current.scope, blankScope(id)],
      work: [...current.work, blankWork(`work-${crypto.randomUUID()}`, "", [id])],
      lines: [...current.lines, blankLine(`line-${crypto.randomUUID()}`, id)],
    }));
  }

  function removeScope(index: number) {
    if (form.scope.length <= 1) return;
    const removed = form.scope[index];
    setForm((current) => ({
      ...current,
      scope: current.scope.filter((_, itemIndex) => itemIndex !== index),
      work: current.work.map((item) => ({ ...item, scopeItemIds: item.scopeItemIds.filter((id) => id !== removed.id) })).filter((item) => item.scopeItemIds.length > 0),
      lines: current.lines.filter((item) => item.scopeItemId !== removed.id),
    }));
  }

  async function save(state: "draft" | "offered") {
    setMessage("");
    if (!form.branchId || !form.customerId || !form.vehicle.vehicleId || !form.vehicle.model) {
      setMessage(t("Choose a branch, customer, and vehicle first.", "اختر الفرع والعميل والمركبة أولاً."));
      return;
    }
    const scopeIds = form.scope.map((item) => item.id.trim());
    const workIds = form.work.map((item) => item.id.trim());
    const lineIds = form.lines.map((item) => item.id.trim());
    if (new Set(scopeIds).size !== scopeIds.length || new Set(workIds).size !== workIds.length || new Set(lineIds).size !== lineIds.length) {
      setMessage(t("Each scope, work, and price line needs a different ID.", "يجب أن يكون لكل بند نطاق ومكون عمل وبند سعر معرف مختلف."));
      return;
    }
    if (!form.scope.every((item) => item.id.trim() && item.serviceId.trim() && Number.isInteger(item.quantity) && item.quantity > 0) || !form.work.length || form.work.some((item) => !item.id.trim() || !item.serviceId.trim() || !item.scopeItemIds.length) || !form.lines.length) {
      setMessage(t("Complete each scope item, work component, and price line.", "أكمل كل بند نطاق ومكون عمل وبند سعر."));
      return;
    }
    if (form.lines.some((item) => !/^[A-Z]{3}$/.test(item.unitPrice.currency) || !Number.isSafeInteger(item.unitPrice.minor) || item.unitPrice.minor < 0 || item.discount.currency !== item.unitPrice.currency || !Number.isSafeInteger(item.discount.minor) || item.discount.minor < 0)) {
      setMessage(t("Enter a three-letter currency code and valid amounts for every price line.", "أدخل رمز عملة من ثلاثة أحرف ومبالغ صحيحة لكل بند سعر."));
      return;
    }
    if (form.work.some((item) => !item.occupancyRule.id.trim() || !Number.isInteger(item.occupancyRule.version) || item.occupancyRule.version < 1)) {
      setMessage(t("Enter an occupancy policy ID and version for each work component.", "أدخل معرف سياسة الإشغال وإصدارها لكل مكون عمل."));
      return;
    }
    if (form.priceOrigin.kind !== "catalogue" && !priceReason.trim()) {
      setMessage(t("Explain why this quote uses manual or inspection pricing.", "وضح سبب استخدام تسعير يدوي أو بعد الفحص."));
      return;
    }
    if (state === "offered") {
      if (form.lines.some((item) => !enteredUnitPriceIds.includes(item.id))) {
        setMessage(t("Enter the unit amount for every offered line. A blank field is not a price.", "أدخل قيمة الوحدة لكل بند معروض. الحقل الفارغ ليس سعراً."));
        return;
      }
      if (form.priceOrigin.kind === "catalogue" && (!packageId.trim() || Number(packageVersion) < 1)) {
        setMessage(t("Choose a published package and version for a catalogue-priced offer.", "اختر باقة منشورة وإصدارها لعرض بسعر الكتالوج."));
        return;
      }
      if (!taxId.trim() || Number(taxVersion) < 1 || !acceptanceId.trim() || Number(acceptanceVersion) < 1 || !form.validThrough) {
        setMessage(t("An offer needs tax and acceptance policy references and a valid-through date.", "يحتاج العرض إلى مرجعي سياسة الضريبة والقبول وتاريخ انتهاء الصلاحية."));
        return;
      }
      if (form.lines.some((item) => item.tax === null || !item.unitPrice.currency.trim() || item.discount.currency !== item.unitPrice.currency || item.tax.currency !== item.unitPrice.currency)) {
        setMessage(t("Add matching currency and tax details to every offered line.", "أضف العملة والضريبة المتطابقتين لكل بند في العرض."));
        return;
      }
    }
    setBusy(true);
    try {
      const priceOrigin = form.priceOrigin.kind === "catalogue"
        ? { kind: "catalogue" as const }
        : { kind: form.priceOrigin.kind, actorId: store.actor?.userId ?? form.priceOrigin.actorId, reason: priceReason.trim() };
      const ref = await quoteApi.createRevision({
        ...form,
        state,
        packageVersion: packageId.trim() && Number(packageVersion) > 0 ? { id: packageId.trim(), version: Number(packageVersion) } : null,
        priceOrigin,
        taxTreatment: taxId.trim() && Number(taxVersion) > 0 ? { id: taxId.trim(), version: Number(taxVersion) } : null,
        acceptancePolicy: acceptanceId.trim() && Number(acceptanceVersion) > 0 ? { id: acceptanceId.trim(), version: Number(acceptanceVersion) } : null,
      });
      onSaved(ref);
      setMessage(t("Revision saved. Review its exact terms before acceptance.", "تم حفظ المراجعة. راجع الشروط والمبالغ قبل القبول."));
    } catch (error) {
      setMessage(errorCopy(error, t));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel section-gap quote-editor" dir={lang === "ar" ? "rtl" : "ltr"}>
    <h2>{t("Quote editor", "محرر عرض السعر")}</h2>
    <p>{t("Choose the records and work first. Amounts and approved policy references are never guessed; an offer cannot be recorded until the required approved terms are supplied.", "اختر السجلات ونطاق العمل أولاً. لا يتم تخمين المبالغ أو مراجع السياسات المعتمدة؛ ولا يمكن تسجيل العرض قبل إدخال الشروط المعتمدة المطلوبة.")}</p>

    <div className="form-grid">
      <label className="form-field">{t("Branch", "الفرع")}<select className="field-select" required value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })}><option value="">{t("Choose a branch", "اختر الفرع")}</option>{form.branchId && !branches.some((item) => item.id === form.branchId) && <option value={form.branchId}>{form.branchId}</option>}{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <label className="form-field">{t("Customer", "العميل")}<select className="field-select" required value={form.customerId} onChange={(event) => changeCustomer(event.target.value)}><option value="">{t("Choose a customer", "اختر عميلاً")}</option>{form.customerId && !customers.some((item) => item.id === form.customerId) && <option value={form.customerId}>{form.customerId}</option>}{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      <label className="form-field">{t("Vehicle", "المركبة")}<select className="field-select" required value={form.vehicle.vehicleId} onChange={(event) => { const selected = availableVehicles.find((item) => item.id === event.target.value); setForm({ ...form, vehicle: { vehicleId: event.target.value, model: selected?.makeModel ?? "", categoryId: null } }); }}><option value="">{t("Choose a vehicle", "اختر مركبة")}</option>{form.vehicle.vehicleId && !availableVehicles.some((item) => item.id === form.vehicle.vehicleId) && <option value={form.vehicle.vehicleId}>{form.vehicle.vehicleId}</option>}{availableVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.makeModel}</option>)}</select></label>
      <div className="form-field"><span className="field-label">{t("Vehicle model", "طراز المركبة")}</span><input className="field-input" required value={form.vehicle.model} onChange={(event) => setForm({ ...form, vehicle: { ...form.vehicle, model: event.target.value } })} /></div>
       <details className="form-field full"><summary>{t("Optional vehicle classification","تصنيف المركبة الاختياري")}</summary><label className="form-field">{t("Vehicle category reference","مرجع فئة المركبة")}<input className="field-input" value={form.vehicle.categoryId ?? ""} onChange={(event) => setForm({ ...form, vehicle: { ...form.vehicle, categoryId: event.target.value || null } })} /></label></details>
      <label className="form-field">{t("Pricing source", "مصدر التسعير")}<select className="field-select" value={form.priceOrigin.kind} onChange={(event) => { const kind = event.target.value as "catalogue" | "manual" | "inspection"; setForm({ ...form, priceOrigin: kind === "catalogue" ? { kind } : { kind, actorId: store.actor?.userId ?? "", reason: priceReason } }); }}><option value="catalogue">{t("Approved catalogue", "الكتالوج المعتمد")}</option><option value="manual">{t("Manual price", "سعر يدوي")}</option><option value="inspection">{t("Price after inspection", "سعر بعد الفحص")}</option></select></label>
      {form.priceOrigin.kind !== "catalogue" && <label className="form-field full">{t("Pricing reason", "سبب التسعير")}<textarea className="field-textarea" required value={priceReason} onChange={(event) => setPriceReason(event.target.value)} /></label>}
      <label className="form-field">{t("Valid through", "صالح حتى")}<input className="field-input" type="date" value={form.validThrough ?? ""} onChange={(event) => setForm({ ...form, validThrough: event.target.value || null })} /></label>
       <details className="form-field full"><summary>{t("Approved policy references","مراجع السياسات المعتمدة")}</summary><p className="form-hint">{t("Enter the exact approved references. They are intentionally not filled from sample or unrelated records.","أدخل المراجع المعتمدة كما هي. لا تُملأ تلقائياً من بيانات تجريبية أو سجلات غير مرتبطة.")}</p><div className="form-grid">
         {form.priceOrigin.kind === "catalogue" && <><label className="form-field">{t("Published package reference","مرجع الباقة المنشورة")}<input className="field-input" value={packageId} onChange={(event) => setPackageId(event.target.value)} /></label><label className="form-field">{t("Package version","إصدار الباقة")}<input className="field-input" type="number" min={1} value={packageVersion} onChange={(event) => setPackageVersion(event.target.value)} /></label></>}
         <label className="form-field">{t("Tax policy reference","مرجع سياسة الضريبة")}<input className="field-input" value={taxId} onChange={(event) => setTaxId(event.target.value)} /></label>
         <label className="form-field">{t("Tax policy version","إصدار سياسة الضريبة")}<input className="field-input" type="number" min={1} value={taxVersion} onChange={(event) => setTaxVersion(event.target.value)} /></label>
         <label className="form-field">{t("Acceptance policy reference","مرجع سياسة القبول")}<input className="field-input" value={acceptanceId} onChange={(event) => setAcceptanceId(event.target.value)} /></label>
         <label className="form-field">{t("Acceptance policy version","إصدار سياسة القبول")}<input className="field-input" type="number" min={1} value={acceptanceVersion} onChange={(event) => setAcceptanceVersion(event.target.value)} /></label>
       </div></details>
    </div>

    <div className="panel-title-row quote-section-heading"><div><h3 className="panel-title">{t("Work scope", "نطاق العمل")}</h3><p className="panel-desc">{t("Add one row for each distinct service or work area.", "أضف بنداً لكل خدمة أو منطقة عمل مختلفة.")}</p></div><button className="btn" type="button" onClick={addScope}>{t("Add work item", "إضافة بند عمل")}</button></div>
    {form.scope.map((item, index) => <div className="form-subsection" key={`${item.id}-${index}`}>
      <div className="form-grid">
         <label className="form-field">{t("Service", "الخدمة")}<select className="field-select" required value={item.serviceId} onChange={(event) => updateScope(index, { serviceId: event.target.value })}><option value="">{t("Choose a service", "اختر خدمة")}</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}{item.serviceId && !services.some((service) => service.id === item.serviceId) && <option value={item.serviceId}>{item.serviceId}</option>}</select></label>
         <details className="form-field"><summary>{t("Optional grade reference","مرجع الدرجة الاختياري")}</summary><label className="form-field">{t("Grade reference","مرجع الدرجة")}<input className="field-input" value={item.gradeVersion?.id ?? ""} onChange={(event) => updateScope(index, { gradeVersion: event.target.value ? { id: event.target.value, version: item.gradeVersion?.version ?? 1 } : null })} /></label><label className="form-field">{t("Grade version","إصدار الدرجة")}<input className="field-input" type="number" min={1} value={item.gradeVersion?.version ?? ""} onChange={(event) => updateScope(index, { gradeVersion: event.target.value ? { id: item.gradeVersion?.id ?? "", version: Number(event.target.value) } : null })} /></label></details>
        <label className="form-field">{t("Areas", "المناطق")}<textarea className="field-textarea" value={item.areas.join("\n")} onChange={(event) => updateScope(index, { areas: lines(event.target.value) })} placeholder={t("One area per line", "منطقة واحدة في كل سطر")} /></label>
        <fieldset className="form-field policy-options"><legend className="field-label">{t("Add-on services", "الخدمات الإضافية")}</legend>{services.map((service) => <label className="policy-check" key={service.id}><input type="checkbox" checked={item.addOnIds.includes(service.id)} onChange={(event) => updateScope(index, { addOnIds: event.target.checked ? [...item.addOnIds, service.id] : item.addOnIds.filter((id) => id !== service.id) })} />{service.name}</label>)}{item.addOnIds.filter((id) => !services.some((service) => service.id === id)).map((id) => <label className="policy-check" key={id}><input type="checkbox" checked onChange={() => updateScope(index, { addOnIds: item.addOnIds.filter((value) => value !== id) })} />{id}</label>)}</fieldset>
        <label className="form-field">{t("Exclusions", "الاستثناءات")}<textarea className="field-textarea" value={item.exclusions.join("\n")} onChange={(event) => updateScope(index, { exclusions: lines(event.target.value) })} /></label>
        <label className="form-field">{t("Roof", "السقف")}<select className="field-select" value={item.roof} onChange={(event) => updateScope(index, { roof: event.target.value as ScopeItem["roof"] })}><option value="not-applicable">{t("Not applicable", "لا ينطبق")}</option><option value="included">{t("Included", "مشمول")}</option><option value="excluded">{t("Excluded", "مستثنى")}</option></select></label>
        <label className="form-field">{t("Quantity", "الكمية")}<input className="field-input" type="number" min={1} step={1} value={item.quantity} onChange={(event) => updateScope(index, { quantity: Number(event.target.value) })} /></label>
      </div>
      {form.scope.length > 1 && <button className="btn btn-danger" type="button" onClick={() => removeScope(index)}>{t("Remove item", "حذف البند")}</button>}
    </div>)}

    <h3>{t("Work components", "مكونات العمل")}</h3>
    {form.work.map((item, index) => <div className="form-subsection" key={`${item.id}-${index}`}>
      <div className="form-grid">
        <label className="form-field">{t("Service", "الخدمة")}<select className="field-select" required value={item.serviceId} onChange={(event) => updateWork(index, { serviceId: event.target.value })}><option value="">{t("Choose a service", "اختر الخدمة")}</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}{item.serviceId && !services.some((service) => service.id === item.serviceId) && <option value={item.serviceId}>{item.serviceId}</option>}</select></label>
         <label className="form-field">{t("Approved occupancy policy reference", "مرجع سياسة الإشغال المعتمدة")}<input className="field-input" required value={item.occupancyRule.id} onChange={(event) => updateWork(index, { occupancyRule: { ...item.occupancyRule, id: event.target.value } })} /><span className="form-hint">{t("Required for capacity validation; no reference is available from the selected service.","مطلوب للتحقق من السعة؛ لا يتوفر مرجع من الخدمة المختارة.")}</span></label>
         <label className="form-field">{t("Policy version", "إصدار السياسة")}<input className="field-input" type="number" min={1} required value={item.occupancyRule.version || ""} onChange={(event) => updateWork(index, { occupancyRule: { ...item.occupancyRule, version: Number(event.target.value) } })} /></label>
        <fieldset className="form-field full policy-options"><legend className="field-label">{t("Scope items covered", "بنود النطاق المشمولة")}</legend>{form.scope.map((scopeItem, scopeIndex) => <label className="policy-check" key={scopeItem.id}><input type="checkbox" checked={item.scopeItemIds.includes(scopeItem.id)} onChange={(event) => updateWork(index, { scopeItemIds: event.target.checked ? [...item.scopeItemIds, scopeItem.id] : item.scopeItemIds.filter((id) => id !== scopeItem.id) })} />{scopeItem.serviceId ? services.find(service=>service.id===scopeItem.serviceId)?.name??scopeItem.serviceId : `${t("Work item","بند العمل")} ${scopeIndex+1}`}</label>)}</fieldset>
      </div>
    </div>)}

    <h3>{t("Price lines", "بنود الأسعار")}</h3>
    {form.lines.map((item, index) => <div className="form-subsection" key={`${item.id}-${index}`}>
      <div className="form-grid">
         <label className="form-field">{t("Scope item", "بند النطاق")}<select className="field-select" value={item.scopeItemId} onChange={(event) => updateLine(index, { scopeItemId: event.target.value })}>{form.scope.map((scopeItem, scopeIndex) => <option key={scopeItem.id} value={scopeItem.id}>{t("Work item","بند العمل")} {scopeIndex + 1}{scopeItem.serviceId ? ` · ${services.find(service=>service.id===scopeItem.serviceId)?.name??scopeItem.serviceId}`:""}</option>)}</select></label>
        <label className="form-field">{t("Quantity", "الكمية")}<input className="field-input" type="number" min={1} step={1} value={item.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></label>
         <label className="form-field">{t("Unit amount (minor units)", "قيمة الوحدة (وحدات صغرى)")}<input className="field-input" type="number" min={0} step={1} value={item.unitPrice.minor === 0 && !enteredUnitPriceIds.includes(item.id) ? "" : item.unitPrice.minor} onChange={(event) => { const value=event.target.value;setEnteredUnitPriceIds(current=>value===""?current.filter(id=>id!==item.id):current.includes(item.id)?current:[...current,item.id]);updateLine(index, { unitPrice: { ...item.unitPrice, minor: value === "" ? 0 : Number(value) } }); }} /></label>
         <label className="form-field">{t("Discount (minor units)", "الخصم (وحدات صغرى)")}<input className="field-input" type="number" min={0} step={1} value={item.discount.minor || ""} onChange={(event) => updateLine(index, { discount: { ...item.discount, minor: event.target.value === "" ? 0 : Number(event.target.value) } })} /></label>
         <label className="form-field">{t("Currency code", "رمز العملة")}<input className="field-input" maxLength={3} value={item.unitPrice.currency} onChange={(event) => updateLine(index, { unitPrice: { ...item.unitPrice, currency: event.target.value.toUpperCase() }, discount: { ...item.discount, currency: event.target.value.toUpperCase() }, tax: item.tax ? { ...item.tax, currency: event.target.value.toUpperCase() } : null })} /></label>
         <label className="form-field">{t("Tax (minor units)", "الضريبة (وحدات صغرى)")}<input className="field-input" type="number" min={0} step={1} value={item.tax?.minor ?? ""} onChange={(event) => updateLine(index, { tax: event.target.value === "" ? null : { minor: Number(event.target.value), currency: item.unitPrice.currency } })} /></label>
      </div>
    </div>)}
    <details className="form-subsection"><summary>{t("Optional enquiry details","تفاصيل الاستفسار الاختيارية")}</summary><div className="form-grid">
      <label className="form-field">{t("Enquiry reference (optional)", "مرجع الاستفسار (اختياري)")}<input className="field-input" value={form.enquiryRef ?? ""} onChange={(event) => setForm({ ...form, enquiryRef: event.target.value || null })} /></label>
      <label className="form-field">{t("Source channel reference (optional)", "مرجع قناة المصدر (اختياري)")}<input className="field-input" value={form.sourceChannelRef ?? ""} onChange={(event) => setForm({ ...form, sourceChannelRef: event.target.value || null })} /></label>
    </div></details>
    <div className="form-actions">
      <button className="btn" type="button" disabled={busy} onClick={() => void save("draft")}>{t("Save draft revision", "حفظ مسودة")}</button>
      <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void save("offered")}>{t("Record offered revision", "تسجيل عرض السعر")}</button>
    </div>
    {message && <p className="form-error" role="alert">{message}</p>}
  </section>;
}
