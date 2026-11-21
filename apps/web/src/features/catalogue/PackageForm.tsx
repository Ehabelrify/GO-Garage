import type { FormEvent } from "react";
import type { Branch, GradeVersion, PackageVersion, ScopeItem, Service } from "@garage/domain";
import { Collapsible, DetailDrawer, Field, FormSection, RequiredNote } from "../../shared/components";
import { gradeLabel, splitLines, toggleId, type Category, type OccupancyOption } from "./catalogue-logic";
import "./catalogue.css";

type Lang = "ar" | "en";

export function CheckGroup({ legend, options, value, onChange }: {
  legend: string;
  options: Array<{ id: string; label: string }>;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return <fieldset className="cat-checks">
    <legend>{legend}</legend>
    {options.map((option) => <label className="cat-check" key={option.id}>
      <input type="checkbox" checked={value.includes(option.id)} onChange={(event) => onChange(toggleId(value, option.id, event.target.checked))} />
      {option.label}
    </label>)}
  </fieldset>;
}

export interface PackageFormProps {
  lang: Lang;
  draft: PackageVersion;
  isNew: boolean;
  onChange: (next: PackageVersion) => void;
  categories: Category[];
  branches: Branch[];
  services: Service[];
  grades: GradeVersion[];
  occupancy: OccupancyOption[];
  errors: Record<string, string>;
  busy: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

export function PackageForm({ lang, draft, isNew, onChange, categories, branches, services, grades, occupancy, errors, busy, onSubmit, onClose }: PackageFormProps) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const serviceLabel = (service: Service) => lang === "ar" && service.nameAr ? service.nameAr : service.name;
  const serviceName = (id: string) => { const s = services.find((item) => item.id === id); return s ? serviceLabel(s) : t("Choose a service", "اختر خدمة"); };
  const serviceOptions = services.map((service) => ({ id: service.id, label: serviceLabel(service) }));
  const published = grades.filter((grade) => grade.state === "published");

  const setScope = (index: number, patch: Partial<ScopeItem>) => {
    const prior = draft.scope[index];
    const next = { ...prior, ...patch };
    onChange({
      ...draft,
      scope: draft.scope.map((item, i) => i === index ? next : item),
      work: next.id === prior.id ? draft.work : draft.work.map((w) => ({ ...w, scopeItemIds: w.scopeItemIds.map((id) => id === prior.id ? next.id : id) })),
    });
  };
  const removeScope = (index: number) => {
    if (draft.scope.length <= 1) return;
    const removed = draft.scope[index].id;
    onChange({
      ...draft,
      scope: draft.scope.filter((_, i) => i !== index),
      work: draft.work.map((w) => ({ ...w, scopeItemIds: w.scopeItemIds.filter((id) => id !== removed) })),
    });
  };
  const setWork = (index: number, patch: Partial<PackageVersion["work"][number]>) =>
    onChange({ ...draft, work: draft.work.map((w, i) => i === index ? { ...w, ...patch } : w) });

  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit(); };

  return <DetailDrawer
    open
    wide
    lang={lang}
    onClose={onClose}
    title={isNew ? t("Add package", "إضافة باقة") : t("Edit package", "تعديل الباقة")}
    subtitle={isNew ? undefined : draft.name[lang] || undefined}
    footer={<>
      <button type="button" className="btn" onClick={onClose}>{t("Cancel", "إلغاء")}</button>
      <button type="submit" form="package-form" className="btn btn-primary" disabled={busy}>{t("Save draft", "حفظ المسودة")}</button>
    </>}
  >
    <form id="package-form" onSubmit={submit} noValidate>
      <RequiredNote text={t("* Required", "* مطلوب")} />
      <FormSection title={t("Basics", "الأساسيات")}>
        <Field label={t("Name (English)", "الاسم (إنجليزي)")} required error={errors.nameEn}>
          <input className="field-input" value={draft.name.en} onChange={(e) => onChange({ ...draft, name: { ...draft.name, en: e.target.value } })} />
        </Field>
        <Field label={t("Name (Arabic)", "الاسم (عربي)")} required error={errors.nameAr}>
          <input className="field-input" dir="rtl" value={draft.name.ar} onChange={(e) => onChange({ ...draft, name: { ...draft.name, ar: e.target.value } })} />
        </Field>
        <Field label={t("Type", "النوع")}>
          <select className="field-select" value={draft.kind} onChange={(e) => onChange({ ...draft, kind: e.target.value as PackageVersion["kind"] })}>
            <option value="package">{t("Package", "باقة")}</option>
            <option value="standalone">{t("Standalone service", "خدمة منفردة")}</option>
          </select>
        </Field>
        <Field label={t("Source note", "ملاحظة المصدر")}>
          <input className="field-input" value={draft.provenance} onChange={(e) => onChange({ ...draft, provenance: e.target.value })} />
        </Field>
        <Field label={t("Vehicle categories", "فئات المركبات")} required full error={errors.categories}>
          <CheckGroup legend={t("Vehicle categories", "فئات المركبات")} value={draft.vehicleCategoryIds} onChange={(next) => onChange({ ...draft, vehicleCategoryIds: next })}
            options={categories.map((c) => ({ id: c.id, label: c.name[lang] }))} />
        </Field>
        <Field label={t("Branches", "الفروع")} required full error={errors.branches}>
          <CheckGroup legend={t("Branches", "الفروع")} value={draft.branchIds} onChange={(next) => onChange({ ...draft, branchIds: next })}
            options={branches.map((b) => ({ id: b.id, label: lang === "ar" && b.nameAr ? b.nameAr : b.name }))} />
        </Field>
      </FormSection>

      <Collapsible title={t("Availability", "التوفر")} defaultOpen={!isNew}>
        <FormSection title={t("Dates and models", "التواريخ والطرازات")}>
          <Field label={t("Effective from", "ساري من")}>
            <input className="field-input" type="date" value={draft.effectiveFrom ?? ""} onChange={(e) => onChange({ ...draft, effectiveFrom: e.target.value || null })} />
          </Field>
          <Field label={t("Effective until", "ساري حتى")}>
            <input className="field-input" type="date" value={draft.effectiveThrough ?? ""} onChange={(e) => onChange({ ...draft, effectiveThrough: e.target.value || null })} />
          </Field>
          <Field label={t("Specific models", "طرازات محددة")} hint={t("One per line. Empty means all models.", "طراز في كل سطر. الفارغ يعني كل الطرازات.")} full>
            <textarea className="field-textarea" value={draft.vehicleModels.join("\n")} onChange={(e) => onChange({ ...draft, vehicleModels: splitLines(e.target.value) })} />
          </Field>
        </FormSection>
      </Collapsible>

      <FormSection title={t("What is included", "ما يشمله")} columns={1}>
        {draft.scope.map((item, index) => <div className="cat-block" key={item.id}>
          <div className="cat-block-head">
            <strong>{serviceName(item.serviceId)}</strong>
            {draft.scope.length > 1 && <button type="button" className="btn btn-danger btn-sm" onClick={() => removeScope(index)}>{t("Remove", "حذف")}</button>}
          </div>
          <div className="form-grid">
            <Field label={t("Service", "الخدمة")} required error={errors[`scope${index}`]}>
              <select className="field-select" value={item.serviceId} onChange={(e) => setScope(index, { serviceId: e.target.value })}>
                <option value="">{t("Choose a service", "اختر خدمة")}</option>
                {serviceOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label={t("Quantity", "الكمية")}>
              <input className="field-input" type="number" min={1} step={1} value={item.quantity} onChange={(e) => setScope(index, { quantity: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} />
            </Field>
            <Field label={t("Roof", "السقف")}>
              <select className="field-select" value={item.roof} onChange={(e) => setScope(index, { roof: e.target.value as ScopeItem["roof"] })}>
                <option value="not-applicable">{t("Not applicable", "لا ينطبق")}</option>
                <option value="included">{t("Included", "مشمول")}</option>
                <option value="excluded">{t("Excluded", "مستثنى")}</option>
              </select>
            </Field>
            <Field label={t("Grade", "الدرجة")}>
              <select className="field-select" value={item.gradeVersion ? `${item.gradeVersion.id}:${item.gradeVersion.version}` : ""}
                onChange={(e) => { const [id, version] = e.target.value.split(":"); setScope(index, { gradeVersion: id ? { id, version: Number(version) } : null }); }}>
                <option value="">{t("No grade", "بدون درجة")}</option>
                {published.map((g) => <option key={`${g.ref.id}:${g.ref.version}`} value={`${g.ref.id}:${g.ref.version}`}>{gradeLabel(g, lang)}</option>)}
                {item.gradeVersion && !published.some((g) => g.ref.id === item.gradeVersion?.id && g.ref.version === item.gradeVersion?.version) &&
                  <option value={`${item.gradeVersion.id}:${item.gradeVersion.version}`}>{(() => { const g = grades.find((x) => x.ref.id === item.gradeVersion?.id); return g ? gradeLabel(g, lang) : t("Current grade", "الدرجة الحالية"); })()}</option>}
              </select>
            </Field>
            <Field label={t("Add-on services", "خدمات إضافية")} full>
              <CheckGroup legend={t("Add-on services", "خدمات إضافية")} value={item.addOnIds} onChange={(next) => setScope(index, { addOnIds: next })} options={serviceOptions.filter((s) => s.id !== item.serviceId)} />
            </Field>
            <Field label={t("Areas", "المناطق")} hint={t("One per line.", "منطقة في كل سطر.")}>
              <textarea className="field-textarea" value={item.areas.join("\n")} onChange={(e) => setScope(index, { areas: splitLines(e.target.value) })} />
            </Field>
            <Field label={t("Exclusions", "الاستثناءات")} hint={t("One per line.", "استثناء في كل سطر.")}>
              <textarea className="field-textarea" value={item.exclusions.join("\n")} onChange={(e) => setScope(index, { exclusions: splitLines(e.target.value) })} />
            </Field>
          </div>
        </div>)}
        <div><button type="button" className="btn btn-sm" onClick={() => onChange({ ...draft, scope: [...draft.scope, { id: `scope-${crypto.randomUUID()}`, serviceId: "", gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1 }] })}>{t("Add item", "إضافة بند")}</button></div>
      </FormSection>

      <FormSection title={t("Workshop time", "وقت الورشة")} description={t("Pick a duration rule already in use.", "اختر قاعدة مدة مستخدمة.")} columns={1}>
        {draft.work.map((item, index) => {
          const key = item.occupancyRule.id ? `${item.occupancyRule.id}:${item.occupancyRule.version}` : "";
          const known = occupancy.some((o) => o.key === key);
          return <div className="cat-block" key={item.id}>
            <div className="cat-block-head">
              <strong>{serviceName(item.serviceId || draft.scope[0]?.serviceId)}</strong>
              {draft.work.length > 1 && <button type="button" className="btn btn-danger btn-sm" onClick={() => onChange({ ...draft, work: draft.work.filter((_, i) => i !== index) })}>{t("Remove", "حذف")}</button>}
            </div>
            <div className="form-grid">
              <Field label={t("Service", "الخدمة")} required>
                <select className="field-select" value={item.serviceId} onChange={(e) => setWork(index, { serviceId: e.target.value })}>
                  <option value="">{t("Choose a service", "اختر خدمة")}</option>
                  {serviceOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>
              <Field label={t("Duration rule", "قاعدة المدة")} required error={errors[`work${index}`]}>
                <select className="field-select" value={known ? key : item.occupancyRule.id ? "custom" : ""}
                  onChange={(e) => { const found = occupancy.find((o) => o.key === e.target.value); if (found) setWork(index, { occupancyRule: found.ref }); else if (e.target.value === "") setWork(index, { occupancyRule: { id: "", version: 1 } }); }}>
                  <option value="">{t("Choose a rule", "اختر قاعدة")}</option>
                  {occupancy.map((o) => <option key={o.key} value={o.key}>{o.services.map(serviceName).join(", ")} · v{o.ref.version}</option>)}
                  {!known && item.occupancyRule.id && <option value="custom">{t("Custom rule", "قاعدة مخصصة")}</option>}
                </select>
              </Field>
              <Field label={t("Covers", "يغطي")} full>
                <CheckGroup legend={t("Covers", "يغطي")} value={item.scopeItemIds} onChange={(next) => setWork(index, { scopeItemIds: next })}
                  options={draft.scope.map((s) => ({ id: s.id, label: serviceName(s.serviceId) }))} />
              </Field>
            </div>
            {!known && <Collapsible title={t("Enter rule reference", "إدخال مرجع القاعدة")}>
              <div className="form-grid">
                <Field label={t("Rule reference", "مرجع القاعدة")}><input className="field-input" value={item.occupancyRule.id} onChange={(e) => setWork(index, { occupancyRule: { ...item.occupancyRule, id: e.target.value } })} /></Field>
                <Field label={t("Version", "الإصدار")}><input className="field-input" type="number" min={1} value={item.occupancyRule.version} onChange={(e) => setWork(index, { occupancyRule: { ...item.occupancyRule, version: Math.max(1, Number(e.target.value) || 1) } })} /></Field>
              </div>
            </Collapsible>}
          </div>;
        })}
        <div><button type="button" className="btn btn-sm" onClick={() => onChange({ ...draft, work: [...draft.work, { id: `work-${crypto.randomUUID()}`, serviceId: "", scopeItemIds: [], occupancyRule: { id: "", version: 1 } }] })}>{t("Add work step", "إضافة خطوة عمل")}</button></div>
      </FormSection>
    </form>
  </DetailDrawer>;
}
