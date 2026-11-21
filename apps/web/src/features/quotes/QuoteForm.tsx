import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Locale, PackageVersion, PolicyRef, QuoteDraftInput, QuoteVersionRef, VehicleSelection } from "@garage/domain";
import { quoteApi, useGarageStore } from "../../shared/store";
import { Collapsible, EmptyState, Field, FormSection, Money, Notice, RequiredNote, Skeleton } from "../../shared/components";
import { commercialError } from "./commercial-errors";
import { loadAcceptanceTerms, loadCategories, loadPublishedPackages, resolveVehicle, type AcceptanceTerms, type CategoryInfo, type ResolvedVehicle } from "./commercial-data";
import { buildLookups, tr } from "./lookups";
import { CustomerVehiclePicker, type CustomerVehicleValue } from "./pickers";
import { blankItem, buildDraftInput, buildErrorLabels, itemsFromInput, missingLabel, type CustomItem } from "./quote-build";
import { approvedPrice, approvedTax, defaultValidThrough, roofLabels, summariseLines, todayIso, validThroughProblem } from "./quote-logic";
import "./commercial.css";

type Mode = "catalogue" | "manual" | "inspection";
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export interface QuoteFormProps {
  lang: Locale;
  /** Existing quote input when revising. */
  base?: QuoteDraftInput;
  /** Start with a customer/vehicle already chosen (e.g. from a customer page). */
  prefill?: Partial<CustomerVehicleValue>;
  onSaved: (ref: QuoteVersionRef) => void;
  onCancel: () => void;
  /** Rendered into the drawer footer by the parent so the buttons stay visible. */
  formId?: string;
}

export interface QuoteFormState { busy: boolean; save: (state: "draft" | "offered") => void }

/** Quote form body. The parent drawer footer calls the exposed save handlers through `register`. */
export function QuoteForm({ lang, base, prefill, onSaved, formId = "quote-form", register }: QuoteFormProps & { register: (api: QuoteFormState) => void }) {
  const t = tr(lang);
  const store = useGarageStore();
  const lookups = useMemo(() => buildLookups(store.state, lang), [store.state, lang]);
  const customers = store.state?.customers ?? [];
  const services = store.state?.services ?? [];
  const branches = store.state?.branches ?? [];
  const currentBranch = store.state?.currentBranch ?? "all";
  const actor = store.actor;

  const [branchId, setBranchId] = useState(base?.branchId ?? (currentBranch !== "all" ? currentBranch : ""));
  const [who, setWho] = useState<CustomerVehicleValue>({ customerId: base?.customerId ?? prefill?.customerId ?? "", vehicleId: base?.vehicle.vehicleId ?? prefill?.vehicleId ?? "" });
  const [serviceId, setServiceId] = useState(base?.scope[0]?.serviceId ?? "");
  const [mode, setMode] = useState<Mode>(base ? base.priceOrigin.kind : "catalogue");
  const [items, setItems] = useState<CustomItem[]>(() => base && base.priceOrigin.kind !== "catalogue" ? itemsFromInput(base) : [blankItem(uid("scope"), base?.scope[0]?.serviceId ?? "")]);
  const [reason, setReason] = useState(base && base.priceOrigin.kind !== "catalogue" ? base.priceOrigin.reason : "");
  const [packageKey, setPackageKey] = useState(base?.packageVersion ? `${base.packageVersion.id}:${base.packageVersion.version}` : "");
  const [validThrough, setValidThrough] = useState<string | null>(base?.validThrough ?? null);
  const [terms, setTerms] = useState<AcceptanceTerms | null>(null);
  const [termsLoaded, setTermsLoaded] = useState(false);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [published, setPublished] = useState<PackageVersion[]>([]);
  const [resolved, setResolved] = useState<ResolvedVehicle | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([loadAcceptanceTerms().catch(() => null), loadCategories().catch(() => []), loadPublishedPackages().catch(() => [])]).then(([nextTerms, nextCategories, nextPublished]) => {
      if (!live) return;
      setTerms(nextTerms);
      setTermsLoaded(true);
      setCategories(nextCategories);
      setPublished(nextPublished);
      setValidThrough((current) => current ?? defaultValidThrough(todayIso(), nextTerms?.validityDays ?? null));
    });
    return () => { live = false; };
  }, []);

  const vehicleRecord = lookups.vehicle(who.vehicleId);
  const categoryName = (id: string | null) => { const found = categories.find((entry) => entry.id === id); return found ? found.name[lang] || found.name.en : ""; };

  // Match the catalogue to the chosen vehicle + service (sedan/SUV, roof option and add-ons come from the packages).
  useEffect(() => {
    setResolved(null);
    setMatchError("");
    if (mode !== "catalogue" || !vehicleRecord || !serviceId || !branchId) return;
    let live = true;
    setMatching(true);
    resolveVehicle({ branchId, vehicleId: who.vehicleId, serviceId })
      .then((result) => { if (live) setResolved(result); })
      .catch((error) => { if (live) setMatchError(commercialError(error, lang)); })
      .finally(() => { if (live) setMatching(false); });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, who.vehicleId, serviceId, branchId, categories.length]);

  const packages = resolved?.packages ?? [];
  const chosenPackage = packages.find((pkg) => `${pkg.ref.id}:${pkg.ref.version}` === packageKey) ?? null;

  const customAllowed = actor?.role === "owner" || (!!terms?.overrideRole && actor?.role === terms.overrideRole) || (base ? base.priceOrigin.kind !== "catalogue" : false);

  const occupancyFor = (service: string): PolicyRef | null => {
    const fromBase = base?.work.find((work) => work.serviceId === service)?.occupancyRule;
    if (fromBase) return fromBase;
    for (const pkg of [...packages, ...published]) {
      const hit = pkg.work.find((work) => work.serviceId === service);
      if (hit) return hit.occupancyRule;
    }
    return null;
  };

  const vehicleSelection: VehicleSelection | null = resolved?.selection
    ?? (base && base.vehicle.vehicleId === who.vehicleId ? base.vehicle : vehicleRecord ? { vehicleId: who.vehicleId, model: vehicleRecord.vehicle.makeModel, categoryId: null } : null);

  const params = (state: "draft" | "offered") => ({
    base: base ?? null, branchId, customerId: who.customerId, vehicle: vehicleSelection, mode, pkg: chosenPackage, items,
    terms: terms ? { acceptancePolicy: terms.acceptancePolicy, taxTreatment: terms.taxTreatment } : null,
    validThrough, reason, actorId: actor?.userId ?? "", occupancyFor, state, newId: uid,
  });
  const preview = useMemo(() => {
    const built = buildDraftInput(params("draft"));
    return "input" in built ? summariseLines(built.input.lines) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, chosenPackage, items, branchId, who.customerId, vehicleSelection?.model, validThrough, reason, terms]);

  async function save(state: "draft" | "offered") {
    setMessage("");
    const built = buildDraftInput(params(state));
    if ("error" in built) { setMessage(buildErrorLabels[built.error][lang]); return; }
    if (state === "offered") {
      const problem = validThroughProblem(validThrough, todayIso(), terms?.validityDays ?? null);
      if (problem) { setMessage(problem === "too-far" ? t(`Choose a date within ${terms?.validityDays} days.`, `اختر تاريخاً خلال ${terms?.validityDays} يوماً.`) : t("Choose a future valid-through date.", "اختر تاريخ صلاحية قادماً.")); return; }
    }
    setBusy(true);
    try {
      onSaved(await quoteApi.createRevision(built.input));
    } catch (error) {
      setMessage(commercialError(error, lang));
    } finally {
      setBusy(false);
    }
  }
  const saveRef = { busy, save: (state: "draft" | "offered") => void save(state) };
  useEffect(() => { register(saveRef); });

  const updateItem = (id: string, patch: Partial<CustomItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const serviceLabel = (id: string) => lookups.serviceName(id);
  const revising = !!base?.quoteId;

  return <form id={formId} className="qo-stack" onSubmit={(event) => { event.preventDefault(); void save("draft"); }} noValidate>
    <RequiredNote text={t("Required", "حقل مطلوب")} />
    {termsLoaded && !terms && <Notice>{t("Quote terms are not set up yet, so you can save drafts but not send offers. Ask the Owner in Settings.", "شروط العرض غير معدّة بعد، يمكنك حفظ المسودات لكن لا يمكن إرسال عروض. اطلب من المالك ذلك من الإعدادات.")}</Notice>}

    <FormSection title={t("Customer and vehicle", "العميل والمركبة")} columns={1}>
      <Field label={t("Vehicle", "المركبة")} required full>
        <CustomerVehiclePicker lang={lang} customers={customers} value={who} onChange={(next) => { setWho(next); setPackageKey(""); }} disabled={revising} />
      </Field>
      {(currentBranch === "all" || !branchId) && !revising && <Field label={t("Branch", "الفرع")} required>
        <select className="field-select" value={branchId} onChange={(event) => { setBranchId(event.target.value); setPackageKey(""); }}>
          <option value="">{t("Choose a branch", "اختر الفرع")}</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{lookups.branchName(branch.id)}</option>)}
        </select>
      </Field>}
      <Field label={t("Service", "الخدمة")} required>
        <select className="field-select" value={serviceId} onChange={(event) => { setServiceId(event.target.value); setPackageKey(""); setItems((current) => current.map((item, index) => index === 0 && !item.serviceId ? { ...item, serviceId: event.target.value } : item)); }}>
          <option value="">{t("Choose a service", "اختر الخدمة")}</option>
          {services.map((service) => <option key={service.id} value={service.id}>{serviceLabel(service.id)}</option>)}
        </select>
      </Field>
    </FormSection>

    <FormSection title={t("Price", "السعر")} columns={1}>
      <div className="qo-segment" role="radiogroup" aria-label={t("Price source", "مصدر السعر")}>
        {(["catalogue", ...(customAllowed ? ["manual", "inspection"] : [])] as Mode[]).map((option) => <label key={option}>
          <input type="radio" name={`${formId}-mode`} value={option} checked={mode === option} onChange={() => setMode(option)} />
          {option === "catalogue" ? t("Catalogue package", "باقة الكتالوج") : option === "manual" ? t("Custom price", "سعر مخصص") : t("After inspection", "بعد الفحص")}
        </label>)}
      </div>

      {mode === "catalogue" && <div className="qo-stack">
        {(!vehicleRecord || !serviceId) && <p className="qo-muted">{t("Choose a vehicle and a service to see matching packages.", "اختر المركبة والخدمة لعرض الباقات المطابقة.")}</p>}
        {matching && <Skeleton rows={3} label={t("Finding packages", "جارٍ البحث عن الباقات")} />}
        {matchError && <EmptyState variant="error" title={t("Could not load packages", "تعذر تحميل الباقات")} text={matchError} />}
        {resolved && !matching && <>
          {resolved.selection.categoryId && categoryName(resolved.selection.categoryId) && <p className="qo-muted">{t("Vehicle type", "نوع المركبة")}: <strong>{categoryName(resolved.selection.categoryId)}</strong></p>}
          {packages.length === 0
            ? <EmptyState title={t("No matching package", "لا توجد باقة مطابقة")} text={resolved.missing.length ? missingLabel(resolved.missing[0], lang) : undefined}
                action={customAllowed ? <button type="button" className="btn" onClick={() => setMode("manual")}>{t("Use a custom price", "استخدم سعراً مخصصاً")}</button> : undefined} />
            : <div className="qo-stack" role="radiogroup" aria-label={t("Packages", "الباقات")}>
                {packages.map((pkg) => {
                  const key = `${pkg.ref.id}:${pkg.ref.version}`;
                  const price = approvedPrice(pkg);
                  const tax = approvedTax(pkg);
                  const roof = pkg.scope[0]?.roof;
                  const addOns = [...new Set(pkg.scope.flatMap((item) => item.addOnIds))];
                  return <label className="qo-option" key={key}>
                    <input type="radio" name={`${formId}-pkg`} checked={packageKey === key} onChange={() => setPackageKey(key)} disabled={!price} />
                    <span><strong>{pkg.name[lang] || pkg.name.en}</strong>
                      <span className="qo-chips">
                        {roof && roof !== "not-applicable" && <span className="tag">{roofLabels[roof][lang]}</span>}
                        {addOns.map((id) => <span className="tag" key={id}>+ {serviceLabel(id) || t("Add-on", "إضافة")}</span>)}
                        {!price && <span className="tag">{t("No approved price", "لا يوجد سعر معتمد")}</span>}
                        {price && !tax && <span className="tag">{t("Draft only: no approved tax", "مسودة فقط: لا توجد ضريبة معتمدة")}</span>}
                      </span>
                    </span>
                    <span className="qo-option-price">{price ? <Money minor={price.minor + (tax?.minor ?? 0)} currency={price.currency} lang={lang} /> : "—"}</span>
                  </label>;
                })}
              </div>}
        </>}
      </div>}

      {mode !== "catalogue" && <div className="qo-stack">
        <Field label={mode === "manual" ? t("Why a custom price?", "لماذا سعر مخصص؟") : t("Why price after inspection?", "لماذا السعر بعد الفحص؟")} required>
          <input className="field-input" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        {items.map((item, index) => <div className="qo-item" key={item.id}>
          <div className="qo-item-head">
            <strong>{t("Work item", "بند العمل")} {index + 1}</strong>
            {items.length > 1 && <button type="button" className="btn btn-sm btn-quiet" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} aria-label={t("Remove item", "حذف البند")}><Trash2 size={14} aria-hidden="true" />{t("Remove", "حذف")}</button>}
          </div>
          <div className="form-grid">
            <Field label={t("Service", "الخدمة")} required>
              <select className="field-select" value={item.serviceId} onChange={(event) => updateItem(item.id, { serviceId: event.target.value })}>
                <option value="">{t("Choose a service", "اختر الخدمة")}</option>
                {services.map((service) => <option key={service.id} value={service.id}>{serviceLabel(service.id)}</option>)}
              </select>
            </Field>
            <Field label={t("Quantity", "الكمية")} required>
              <input className="field-input" type="number" min={1} step={1} value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} />
            </Field>
            <Field label={t("Price each (EGP)", "السعر للوحدة (جنيه)")} required>
              <input className="field-input" inputMode="decimal" value={item.unitPrice} onChange={(event) => updateItem(item.id, { unitPrice: event.target.value })} placeholder={mode === "inspection" ? t("After inspection", "بعد الفحص") : "0"} />
            </Field>
            <Field label={t("Tax (EGP)", "الضريبة (جنيه)")}>
              <input className="field-input" inputMode="decimal" value={item.tax} onChange={(event) => updateItem(item.id, { tax: event.target.value })} />
            </Field>
          </div>
          <Collapsible title={t("Roof, add-ons and notes", "السقف والإضافات والملاحظات")}>
            <div className="form-grid">
              <Field label={t("Roof", "السقف")}>
                <select className="field-select" value={item.roof} onChange={(event) => updateItem(item.id, { roof: event.target.value as CustomItem["roof"] })}>
                  {(Object.keys(roofLabels) as Array<CustomItem["roof"]>).map((roof) => <option key={roof} value={roof}>{roofLabels[roof][lang]}</option>)}
                </select>
              </Field>
              <Field label={t("Areas", "المناطق")}><input className="field-input" value={item.areas} onChange={(event) => updateItem(item.id, { areas: event.target.value })} placeholder={t("e.g. front, rear", "مثال: أمامي، خلفي")} /></Field>
              <Field label={t("Not included", "غير مشمول")} full><input className="field-input" value={item.exclusions} onChange={(event) => updateItem(item.id, { exclusions: event.target.value })} /></Field>
              <fieldset className="cat-checks" style={{ gridColumn: "1 / -1" }}>
                <legend>{t("Add-ons", "الإضافات")}</legend>
                {services.filter((service) => service.id !== item.serviceId).map((service) => <label className="cat-check" key={service.id}>
                  <input type="checkbox" checked={item.addOnIds.includes(service.id)} onChange={(event) => updateItem(item.id, { addOnIds: event.target.checked ? [...item.addOnIds, service.id] : item.addOnIds.filter((id) => id !== service.id) })} />
                  {serviceLabel(service.id)}
                </label>)}
              </fieldset>
            </div>
          </Collapsible>
        </div>)}
        <div><button type="button" className="btn btn-sm" onClick={() => setItems((current) => [...current, blankItem(uid("scope"), serviceId)])}><Plus size={14} aria-hidden="true" />{t("Add item", "إضافة بند")}</button></div>
      </div>}
    </FormSection>

    <FormSection title={t("Offer", "العرض")}>
      <Field label={t("Valid through", "صالح حتى")} required hint={terms ? t(`Up to ${terms.validityDays} days`, `حتى ${terms.validityDays} يوماً`) : undefined}>
        <input className="field-input" type="date" min={todayIso()} value={validThrough ?? ""} onChange={(event) => setValidThrough(event.target.value || null)} />
      </Field>
      {preview && <div className="qo-totals" aria-live="polite">
        <div><span>{t("Subtotal", "المجموع")}</span><Money minor={preview.subtotal} currency={preview.currency} lang={lang} /></div>
        {preview.tax > 0 && <div><span>{t("Tax", "الضريبة")}</span><Money minor={preview.tax} currency={preview.currency} lang={lang} /></div>}
        <div className="grand"><span>{t("Total", "الإجمالي")}</span><Money minor={preview.total} currency={preview.currency} lang={lang} /></div>
      </div>}
    </FormSection>

    {message && <p className="form-error" role="alert">{message}</p>}
  </form>;
}
