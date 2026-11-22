import { useEffect, useState, type FormEvent } from "react";
import { supportedCurrencies, isSupportedCurrency, type PackagePriceHistoryEntry, type PackageVersion } from "@garage/domain";
import { Collapsible, DateText, DetailDrawer, Field, FormSection, Money, Notice, RequiredNote, StatusBadge, formatMoney, majorToMinor } from "../../shared/components";
import { aggregationOptions, taxRuleOptions, type PriceFormState } from "./price-logic";
import "./catalogue.css";

type Lang = "ar" | "en";

export interface PriceEditorProps {
  lang: Lang;
  pkg: PackageVersion;
  form: PriceFormState;
  onChange: (next: PriceFormState) => void;
  allPackages: PackageVersion[];
  errors: Record<string, string>;
  busy: boolean;
  example: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

/** Owner price editor for one package/add-on. Saves a NEW draft version; nothing published is edited in place. */
export function PriceEditor({ lang, pkg, form, onChange, allPackages, errors, busy, example, onSubmit, onClose }: PriceEditorProps) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const taxRules = taxRuleOptions(allPackages);
  const aggregations = aggregationOptions(allPackages);
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit(); };
  const set = (patch: Partial<PriceFormState>) => onChange({ ...form, ...patch });
  const currentPrice = pkg.price.state === "approved" ? pkg.price.value : null;
  const entered = majorToMinor(form.price, form.currency);
  const modeLabel = (mode: "sum" | "max") => mode === "sum" ? t("Add durations together", "جمع المدد") : t("Longest duration", "أطول مدة");

  return <DetailDrawer
    open lang={lang} onClose={onClose}
    title={t("Edit price", "تعديل السعر")} subtitle={pkg.name[lang]}
    footer={<>
      <button type="button" className="btn" onClick={onClose}>{t("Cancel", "إلغاء")}</button>
      <button type="submit" form="price-form" className="btn btn-primary" disabled={busy}>{t("Save as draft", "حفظ كمسودة")}</button>
    </>}
  >
    <form id="price-form" onSubmit={submit} noValidate>
      {example && <Notice tone="warning">{t("Example data, not approved policy. Confirm the real price before publishing.", "بيانات مثال وليست سياسة معتمدة. أكّد السعر الفعلي قبل النشر.")}</Notice>}
      <p className="form-hint">{t("Saving creates a new draft version. The live price does not change until you publish it.", "الحفظ ينشئ إصدار مسودة جديداً. لا يتغير السعر الحالي حتى تنشره.")}</p>
      <RequiredNote text={t("* Required", "* مطلوب")} />
      <FormSection title={t("Price", "السعر")}>
        <Field label={t("Currency", "العملة")} required error={errors.currency}>
          <select className="field-select" value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
            {supportedCurrencies().map((c) => <option key={c.code} value={c.code}>{c.name[lang]} ({c.symbol[lang]})</option>)}
            {!isSupportedCurrency(form.currency) && <option value={form.currency}>{form.currency}</option>}
          </select>
        </Field>
        <Field label={t("Price", "السعر")} required error={errors.price}
          hint={currentPrice ? `${t("Current", "الحالي")}: ${formatMoney(currentPrice.minor, currentPrice.currency, lang)}` : t("No approved price yet.", "لا يوجد سعر معتمد بعد.")}>
          <input className="field-input" inputMode="decimal" dir="ltr" value={form.price} onChange={(e) => set({ price: e.target.value })} />
        </Field>
        <Field label={t("Tax amount", "مبلغ الضريبة")} required error={errors.tax} hint={t("Zero when tax is not added to this price.", "صفر إذا لم تُضف ضريبة على هذا السعر.")}>
          <input className="field-input" inputMode="decimal" dir="ltr" value={form.tax} onChange={(e) => set({ tax: e.target.value })} />
        </Field>
        <Field label={t("Effective from", "ساري من")} required error={errors.effectiveFrom}>
          <input className="field-input" type="date" value={form.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} />
        </Field>
        <Field label={t("Reason for the change", "سبب التغيير")} required full error={errors.reason}>
          <input className="field-input" maxLength={500} value={form.reason} onChange={(e) => set({ reason: e.target.value })} />
        </Field>
      </FormSection>
      <Collapsible title={t("Tax and work-time settings", "إعدادات الضريبة ووقت العمل")} defaultOpen={Boolean(errors.taxRule || errors.aggregation) || !form.taxRuleKey || !form.aggregationKey}>
        <FormSection title={t("Approved settings", "إعدادات معتمدة")} description={t("Pick settings the Owner already approved. They are kept from the previous version when available.", "اختر إعدادات اعتمدها المالك سابقاً. تُحفظ من الإصدار السابق عند توفرها.")}>
          <Field label={t("Tax rule", "قاعدة الضريبة")} required error={errors.taxRule}>
            <select className="field-select" value={form.taxRuleKey} onChange={(e) => set({ taxRuleKey: e.target.value })}>
              <option value="">{t("Choose a tax rule", "اختر قاعدة ضريبة")}</option>
              {taxRules.map((rule, index) => <option key={rule.key} value={rule.key}>{t("Approved tax rule", "قاعدة ضريبة معتمدة")} {index + 1}</option>)}
            </select>
          </Field>
          <Field label={t("Work time", "وقت العمل")} required error={errors.aggregation}>
            <select className="field-select" value={form.aggregationKey} onChange={(e) => set({ aggregationKey: e.target.value })}>
              <option value="">{t("Choose a setting", "اختر إعداداً")}</option>
              {aggregations.map((option, index) => <option key={option.key} value={option.key}>{t("Approved setting", "إعداد معتمد")} {index + 1} · {modeLabel(option.mode)}</option>)}
            </select>
          </Field>
        </FormSection>
      </Collapsible>
      {entered !== null && <p className="form-hint">{t("New price", "السعر الجديد")}: <Money minor={entered} currency={form.currency} lang={lang} /></p>}
    </form>
  </DetailDrawer>;
}

/** Who changed what and when, with the old to new price. Loads when first opened. */
export function PriceHistory({ lang, packageId, version }: { lang: Lang; packageId: string; version: number }) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const [rows, setRows] = useState<PackagePriceHistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setRows(null); setFailed(false);
    fetch(`/api/catalogue/price-history/${encodeURIComponent(packageId)}`)
      .then((r) => { if (!r.ok) throw new Error("history"); return r.json() as Promise<PackagePriceHistoryEntry[]>; })
      .then((data) => { if (live) setRows(data); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [packageId, version]);
  return <Collapsible title={t("Price history", "سجل الأسعار")} count={rows?.length}>
    {failed ? <p className="cat-muted">{t("History unavailable. Try again later.", "السجل غير متاح. حاول لاحقاً.")}</p>
      : rows === null ? <p className="cat-muted">{t("Loading", "جارٍ التحميل")}</p>
      : rows.length === 0 ? <p className="cat-muted">{t("No history yet.", "لا يوجد سجل بعد.")}</p>
      : <ul className="cat-list">{rows.map((row) => <li key={row.version} className="cat-history">
        <strong>{t("Version", "الإصدار")} {row.version}</strong>
        <StatusBadge status={row.state} domain="policy" lang={lang} />
        {row.isPriceEdit && <span className="tag">{t("Price edit", "تعديل سعر")}</span>}
        <span className="cat-diff">
          {row.previousPrice && row.price ? <><Money minor={row.previousPrice.minor} currency={row.previousPrice.currency} lang={lang} /> <span aria-hidden="true">{lang === "ar" ? "←" : "→"}</span><span className="sr-only">{t("to", "إلى")}</span> <Money minor={row.price.minor} currency={row.price.currency} lang={lang} /></>
            : row.price ? <Money minor={row.price.minor} currency={row.price.currency} lang={lang} /> : <span className="cat-muted">{t("No price", "بدون سعر")}</span>}
        </span>
        <span className="cat-muted">
          {[row.createdByName, row.createdAt && <DateText key="c" value={row.createdAt} lang={lang} />, row.effectiveFrom && <span key="e">{t("effective", "سارٍ")} <DateText value={row.effectiveFrom} lang={lang} /></span>, row.approvedByName && `${t("published by", "نشره")} ${row.approvedByName}`, row.reason]
            .filter(Boolean).flatMap((part, index) => index === 0 ? [part] : [" · ", part])}
        </span>
      </li>)}</ul>}
  </Collapsible>;
}
