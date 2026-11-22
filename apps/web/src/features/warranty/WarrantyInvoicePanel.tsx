import { useEffect, useMemo, useState } from "react";
import { FileText, Pencil, Plus, Printer, Save, Trash2, X } from "lucide-react";
import {
  calculateWarrantyInvoiceTotals, currencyDefinition, isSupportedCurrency, resolveCurrency, supportedCurrencies,
} from "@garage/domain";
import type {
  Locale,
  WarrantyInvoiceDraft,
  WarrantyInvoiceDraftInput,
  WarrantyInvoicePaymentMethod,
  WarrantyRecord,
} from "@garage/domain";
import { Amount as MoneyAmount, Collapsible, ConfirmDialog, DateText, Field, FormSection, Notice, PrintHost, RequiredNote, StatusBadge, type DocumentModel } from "../../shared/components";
import { usePrintRequest } from "./warranty-print-request";
import { unknownWriteOutcomeCopy, useGarageStore } from "../../shared/store";
import { dateLabel } from "../../shared/ui";
import { useWarrantyDraftState } from "./warranty-form-state";

interface WarrantyInvoicePanelProps {
  warranty: WarrantyRecord;
  locale: Locale;
  customerName: string;
  vehicleLabel: string;
  serviceLabel: string;
  branchLabel: string;
}

const emptyDraft = (currency: string): WarrantyInvoiceDraftInput => ({
  currency,
  items: [{ description: "", quantity: 1, unitAmount: null }],
  taxRatePercent: null,
  paidAmount: 0,
  paymentMethod: null,
  notes: "",
});

function inputFromInvoice(invoice: WarrantyInvoiceDraft): WarrantyInvoiceDraftInput {
  return {
    currency: invoice.currency,
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitAmount: item.unitAmount,
    })),
    taxRatePercent: invoice.taxRatePercent,
    paidAmount: invoice.paidAmount,
    paymentMethod: invoice.paymentMethod,
    notes: invoice.notes,
  };
}

function text(locale: Locale, en: string, ar: string) {
  return locale === "ar" ? ar : en;
}

/** Amount in the invoice currency through the shared Amount (LTR isolate, tabular, real minus). Stored values are major units. */
function Amount({ value, currency, locale }: { value: number | null; currency: string; locale: Locale }) {
  const exponent = currencyDefinition(currency)?.minorUnitExponent ?? 2;
  return <MoneyAmount minor={value === null ? null : Math.round(value * 10 ** exponent)} currency={currency} lang={locale} variant="detail" />;
}
const plain = (value: number, locale: Locale) => new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { maximumFractionDigits: 2 }).format(value);

function invoiceErrorText(code: string, locale: Locale) {
  const messages: Record<string, { en: string; ar: string }> = {
    ROLE_FORBIDDEN: { en: "Your role or branch access does not allow this invoice action.", ar: "دورك أو صلاحية فرعك مش بيسمحوا بإجراء الفاتورة ده." },
    WARRANTY_NOT_FOUND: { en: "This warranty record is no longer available.", ar: "لم يعد سجل الضمان هذا متاحًا." },
    INVOICE_DRAFT_NOT_FOUND: { en: "Create a draft invoice before editing it.", ar: "جهّز مسودة فاتورة قبل تعديلها." },
    INVALID_INVOICE_DRAFT: { en: "Check the draft items, amounts, tax and payment fields.", ar: "راجع بنود المسودة والمبالغ والضريبة وبيانات الدفع." },
    UNSUPPORTED_CURRENCY: { en: "Choose a currency from the supported list.", ar: "اختر عملة من القائمة المدعومة." },
    MIXED_CURRENCY: { en: "Every line must use the invoice currency. Totals never mix currencies.", ar: "يجب أن تستخدم كل البنود عملة الفاتورة. لا تُجمع عملات مختلفة." },
    CURRENCY_LOCKED: { en: "The currency cannot change once a payment amount has been entered.", ar: "لا يمكن تغيير العملة بعد إدخال مبلغ مدفوع." },
    REQUEST_FAILED: { en: "The draft could not be saved. Check your connection and try again.", ar: "تعذر حفظ المسودة. راجع الاتصال وحاول مرة أخرى." },
  };
  const message = messages[code];
  return message ? text(locale, message.en, message.ar) : text(locale, "The invoice draft could not be saved.", "تعذر حفظ مسودة الفاتورة.");
}

export function WarrantyInvoicePanel({
  warranty,
  locale,
  customerName,
  vehicleLabel,
  serviceLabel,
  branchLabel,
}: WarrantyInvoicePanelProps) {
  const store = useGarageStore();
  const t = (en: string, ar: string) => text(locale, en, ar);
  const invoice = store.state?.warrantyInvoiceDrafts.find((item) => item.warrantyId === warranty.id);
  const storedCurrency = resolveCurrency(invoice?.currency);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft, discardInvoiceDraft] = useWarrantyDraftState<WarrantyInvoiceDraftInput>(
    { userId: store.actor?.userId ?? "anonymous", dataset: store.actor?.isDemo ? "demo" : "live",
      task: "invoice", entityId: `${warranty.id}:${invoice?.id ?? "new"}`,
      version: invoice ? Date.parse(invoice.updatedAt) || 0 : 0 },
    () => invoice ? inputFromInvoice(invoice) : emptyDraft(storedCurrency),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null);
  const draftCurrency = resolveCurrency(draft.currency, storedCurrency);
  const totals = useMemo(
    () => calculateWarrantyInvoiceTotals(draft.items, draft.taxRatePercent, draft.paidAmount),
    [draft.items, draft.taxRatePercent, draft.paidAmount],
  );
  const savedTotals = useMemo(
    () => invoice ? calculateWarrantyInvoiceTotals(invoice.items, invoice.taxRatePercent, invoice.paidAmount) : totals,
    [invoice, totals],
  );
  const currencyLocked = Boolean(invoice && invoice.paidAmount > 0);
  const hasAmounts = draft.items.some((item) => item.unitAmount !== null);
  const dateText = (value: string) => dateLabel(value, locale);
  const [printing, requestPrint] = usePrintRequest();

  useEffect(() => {
    setEditing(false); setExpanded(false); setError(""); setNotice("");
  }, [store.actor?.userId, store.actor?.isDemo, warranty.id]);

  useEffect(() => {
    if (!editing) setDraft(invoice ? inputFromInvoice(invoice) : emptyDraft(storedCurrency));
  }, [invoice, editing]);

  const createDraft = async () => {
    setBusy(true);
    setError("");
    const result = await store.createWarrantyInvoiceDraft(warranty.id);
    setBusy(false);
    if (!result.ok) {
      setError(unknownWriteOutcomeCopy(result.error, locale) ?? invoiceErrorText(result.error, locale));
      return;
    }
    setDraft({ ...emptyDraft(storedCurrency), items: [{ description: serviceLabel, quantity: 1, unitAmount: null }] });
    setExpanded(true);
    setEditing(true);
    setNotice(t("Draft saved. Add the Owner-approved amounts before printing.", "المسودة اتحفظت. أضف المبالغ المعتمدة من المالك قبل الطباعة."));
  };

  const saveDraft = async () => {
    if (!invoice || !draft.items.length || draft.items.some((item) => !item.description.trim())) return;
    setBusy(true);
    setError("");
    const result = await store.updateWarrantyInvoiceDraft(warranty.id, { ...draft, currency: draftCurrency });
    setBusy(false);
    if (!result.ok) {
      setError(unknownWriteOutcomeCopy(result.error, locale) ?? invoiceErrorText(result.error, locale));
      return;
    }
    setEditing(false);
    setNotice(t("Draft invoice saved. It has not been issued.", "مسودة الفاتورة اتحفظت. ما اتصدرتش."));
  };

  // Generic printable A4 document (shared DocumentSheet). Warranty drafts are never tax invoices; the disclaimer says so.
  const printModel = useMemo<DocumentModel | null>(() => {
    if (!invoice) return null;
    const exponent = currencyDefinition(storedCurrency)?.minorUnitExponent ?? 2;
    const minor = (value: number | null) => (value === null ? null : Math.round(value * 10 ** exponent));
    const lines = invoice.items.map((item) => ({
      description: item.description, quantity: item.quantity, unitMinor: minor(item.unitAmount),
      amountMinor: item.unitAmount === null ? null : minor(item.quantity * item.unitAmount), currency: storedCurrency,
    }));
    return {
      lang: locale,
      business: { name: "Go Stores", subtitle: text(locale, "Workshop services", "خدمات الورشة") },
      title: text(locale, "Warranty work invoice", "فاتورة شغل الضمان"),
      number: null,
      statusLabel: text(locale, "Draft", "مسودة"),
      branch: branchLabel,
      issueDate: dateText(invoice.updatedAt),
      customer: { label: text(locale, "Customer", "العميل"), name: customerName },
      vehicle: { label: text(locale, "Vehicle", "المركبة"), plate: vehicleLabel, description: serviceLabel },
      lines,
      totals: [{
        currency: storedCurrency, subtotalMinor: minor(savedTotals.subtotal), discountMinor: 0, taxMinor: minor(savedTotals.taxAmount), totalMinor: minor(savedTotals.total),
        paidMinor: minor(invoice.paidAmount) ?? 0, balanceMinor: minor(savedTotals.balance),
      }],
      notes: undefined,
      disclaimer: text(locale, "Draft for review only. Tax treatment, official template, and final issuance are pending Owner approval. Do not use as a tax invoice or proof of payment.",
        "مسودة للمراجعة فقط. المعاملة الضريبية والقالب الرسمي والإصدار النهائي بانتظار موافقة المالك. لا تستخدمها كفاتورة ضريبية أو إثبات دفع."),
      signatures: [{ label: text(locale, "Prepared by", "أعدها") }, { label: text(locale, "Customer signature", "توقيع العميل") }],
    };
  }, [invoice, storedCurrency, savedTotals, locale, branchLabel, customerName, vehicleLabel, serviceLabel]);
  const printDraft = () => { setNotice(""); requestPrint(); };

  const updateItem = (index: number, updates: Partial<WarrantyInvoiceDraftInput["items"][number]>) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item),
    }));
  };

  const chooseCurrency = (code: string) => {
    if (code === draftCurrency) return;
    // Amounts are never converted; confirm before keeping numbers under a different currency.
    if (hasAmounts) setPendingCurrency(code);
    else setDraft((current) => ({ ...current, currency: code }));
  };

  const currencyOptions = supportedCurrencies();
  const currencyLabel = (code: string) => {
    const definition = currencyDefinition(code);
    return definition ? `${definition.name[locale]} (${definition.symbol[locale]})` : code;
  };
  const invalid = !draft.items.length || draft.items.some((item) => !item.description.trim() || item.quantity <= 0) || !isSupportedCurrency(draftCurrency);
  const owner = store.actor?.role === "owner";

  return <section className="w-invoice-panel">
    <div className="w-invoice-head">
      <div>
        <strong><FileText size={15} />{t("Draft invoice", "مسودة فاتورة")}</strong>
        <p>{t("Amounts and tax still require Owner confirmation. This cannot be issued as a final invoice.", "المبالغ والضريبة بانتظار تأكيد المالك. المسودة دي مش فاتورة نهائية.")}</p>
      </div>
      {invoice && <div className="w-invoice-badges">
        <StatusBadge status="draft" domain="invoice" lang={locale} />
        <span className="tag" title={currencyLabel(storedCurrency)}>{storedCurrency}</span>
      </div>}
    </div>

    {!invoice ? <div className="w-invoice-empty">
      <span>{t("No invoice draft is linked yet.", "لا توجد مسودة فاتورة مرتبطة بعد.")}</span>
      <button className="btn btn-sm btn-primary" type="button" disabled={busy} onClick={() => void createDraft()}>
        <Plus size={14} />{busy ? t("Preparing…", "بنجهّز…") : t("Create draft invoice", "جهّز مسودة فاتورة")}
      </button>
    </div> : <>
      <div className="w-invoice-actions">
        {!editing && <button className="btn btn-sm" type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} aria-controls={`w-invoice-${invoice.id}`}>
          <FileText size={13} />{expanded ? t("Hide draft", "اخفِ المسودة") : t("View draft", "اعرض المسودة")}
        </button>}
        {!editing && <button className="btn btn-sm" type="button" onClick={() => { setDraft(inputFromInvoice(invoice)); setExpanded(true); setEditing(true); setError(""); }}>
          <Pencil size={13} />{t("Edit draft", "عدّل المسودة")}
        </button>}
        {!editing && <button className="btn btn-sm btn-primary" type="button" onClick={printDraft}>
          <Printer size={13} aria-hidden="true" />{t("Print", "طباعة")}
        </button>}
        {owner && <a className="btn btn-sm" href="/workspace/finance">{t("Open audited money ledger", "فتح سجل الأموال الخاضع للمراجعة")}</a>}
      </div>
      {owner && <p className="w-invoice-payment-meta">{t("Draft payment fields are legacy notes only. Record verified money events separately in Operational finance.", "حقول الدفع في المسودة ملاحظات قديمة فقط. سجّل أحداث الأموال المؤكدة بشكل منفصل في المالية التشغيلية.")}</p>}
      {expanded && <>
      {invoice.paymentRecordedAt && <p className="w-invoice-payment-meta">
        {t("Payment entry recorded", "اتسجلت بيانات الدفع")}
        {" · "}<DateText value={invoice.paymentRecordedAt} lang={locale} />
        {invoice.paymentRecordedBy ? ` · ${invoice.paymentRecordedBy}` : ""}
      </p>}

      {editing && <form className="w-invoice-editor" noValidate onSubmit={(event) => { event.preventDefault(); if (!invalid) void saveDraft(); }}>
        <RequiredNote text={t("* Required", "* مطلوب")} />
        <FormSection title={t("Currency", "العملة")} description={t("Every amount on this invoice is in one currency. Amounts are not converted if you change it.", "كل مبالغ الفاتورة بعملة واحدة. لا يتم تحويل المبالغ إذا غيّرت العملة.")}>
          <Field label={t("Invoice currency", "عملة الفاتورة")} required
            hint={currencyLocked ? t("Locked because a payment amount was entered.", "مقفلة لأنه تم إدخال مبلغ مدفوع.") : undefined}>
            <select className="field-select" value={draftCurrency} disabled={currencyLocked} onChange={(event) => chooseCurrency(event.target.value)}>
              {currencyOptions.map((currency) => <option key={currency.code} value={currency.code}>{currencyLabel(currency.code)}</option>)}
            </select>
          </Field>
        </FormSection>

        <FormSection title={t("Job items", "بنود الشغل")} columns={1}>
          {draft.items.map((item, index) => <div className="w-invoice-line-edit" key={index}>
            <Field label={t("Description", "الوصف")} required>
              <input className="field-input" maxLength={240} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} />
            </Field>
            <Field label={t("Qty", "الكمية")}>
              <input className="field-input" type="number" min="0.01" max="10000" step="0.01" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) || 0 })} />
            </Field>
            <Field label={`${t("Unit amount", "سعر الوحدة")} (${currencyDefinition(draftCurrency)?.symbol[locale] ?? draftCurrency})`}>
              <input className="field-input" type="number" min="0" max="1000000000" step="0.01" placeholder={t("Not entered", "لسه ماتكتبش")} value={item.unitAmount ?? ""} onChange={(event) => updateItem(index, { unitAmount: event.target.value === "" ? null : Number(event.target.value) })} />
            </Field>
            <button className="btn btn-icon btn-sm" type="button" aria-label={t(`Remove item ${index + 1}`, `احذف البند ${index + 1}`)} disabled={draft.items.length <= 1} onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={13} /></button>
          </div>)}
          <div><button className="btn btn-sm" type="button" onClick={() => setDraft((current) => ({
            ...current,
            items: [...current.items, { description: "", quantity: 1, unitAmount: null }],
          }))}><Plus size={13} />{t("Add item", "أضف بند")}</button></div>
        </FormSection>

        <Collapsible title={t("Tax and payment notes", "الضريبة وملاحظات الدفع")} defaultOpen={draft.taxRatePercent !== null || draft.paidAmount > 0}>
          <FormSection title={t("Draft tracking", "متابعة المسودة")} description={t("Tax is a draft rate pending Owner approval. Payment fields are draft tracking only.", "الضريبة نسبة للمسودة بانتظار موافقة المالك. حقول الدفع للمتابعة فقط.")}>
            <Field label={t("Draft tax rate (%)", "نسبة الضريبة للمسودة (%)")}>
              <input className="field-input" type="number" min="0" max="100" step="0.01" placeholder={t("Not configured", "مش متحددة")} value={draft.taxRatePercent ?? ""} onChange={(event) => setDraft((current) => ({ ...current, taxRatePercent: event.target.value === "" ? null : Number(event.target.value) }))} />
            </Field>
            <Field label={t("Amount paid", "المبلغ المدفوع")}>
              <input className="field-input" type="number" min="0" max="1000000000" step="0.01" value={draft.paidAmount} onChange={(event) => setDraft((current) => ({ ...current, paidAmount: Number(event.target.value) || 0 }))} />
            </Field>
            <Field label={t("Payment method", "طريقة الدفع")}>
              <select className="field-select" value={draft.paymentMethod ?? ""} onChange={(event) => setDraft((current) => ({ ...current, paymentMethod: (event.target.value || null) as WarrantyInvoicePaymentMethod | null }))}>
                <option value="">{t("Not recorded", "غير مسجل")}</option>
                <option value="cash">{t("Cash", "نقدي")}</option>
                <option value="card">{t("Card", "بطاقة")}</option>
                <option value="transfer">{t("Transfer", "تحويل")}</option>
                <option value="other">{t("Other", "أخرى")}</option>
              </select>
            </Field>
            <Field label={t("Internal draft note", "ملاحظة داخلية للمسودة")} full>
              <textarea className="field-textarea" maxLength={1000} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
            </Field>
          </FormSection>
        </Collapsible>

        <p className="w-invoice-live-total">
          {t("Draft total", "إجمالي المسودة")}: <Amount value={totals.total} currency={draftCurrency} locale={locale} />
          {totals.total === null && <span className="form-hint"> · {t("add every amount and a tax rate", "أضف كل المبالغ ونسبة الضريبة")}</span>}
        </p>
        <div className="w-invoice-actions">
          <button className="btn btn-sm" type="button" disabled={busy} onClick={() => { discardInvoiceDraft(); setEditing(false); setError(""); }}><X size={13} />{t("Cancel", "إلغاء")}</button>
          <button className="btn btn-sm btn-primary" type="submit" disabled={busy || invalid}><Save size={13} />{busy ? t("Saving…", "بنحفظ…") : t("Save draft", "احفظ المسودة")}</button>
        </div>
      </form>}

      <div className="w-invoice-print-area" id={`w-invoice-${invoice.id}`} dir={locale === "ar" ? "rtl" : "ltr"}>
        <div className="w-invoice-print-title">
          <div><span>{t("WORKSHOP INVOICE", "فاتورة ورشة")}</span><h3>{t("DRAFT · NOT A FINAL INVOICE", "مسودة · مش فاتورة نهائية")}</h3></div>
          <bdi>{currencyLabel(storedCurrency)}</bdi>
        </div>
        <div className="w-invoice-party-grid">
          <div><small>{t("Customer", "العميل")}</small><strong>{customerName}</strong></div>
          <div><small>{t("Vehicle", "العربية")}</small><strong>{vehicleLabel}</strong></div>
          <div><small>{t("Service", "الخدمة")}</small><strong>{serviceLabel}</strong></div>
          <div><small>{t("Branch", "الفرع")}</small><strong>{branchLabel}</strong></div>
          <div><small>{t("Prepared", "تاريخ التجهيز")}</small><strong><DateText value={invoice.updatedAt} lang={locale} /></strong></div>
        </div>
        <table className="w-invoice-table">
          <thead><tr><th>{t("Item", "البند")}</th><th>{t("Qty", "الكمية")}</th><th>{t("Unit amount", "سعر الوحدة")}</th><th>{t("Line amount", "إجمالي البند")}</th></tr></thead>
          <tbody>{invoice.items.map((item) => <tr key={item.id}>
            <td>{item.description}</td><td>{plain(item.quantity, locale)}</td>
            <td>{item.unitAmount === null ? "—" : <Amount value={item.unitAmount} currency={storedCurrency} locale={locale} />}</td>
            <td>{item.unitAmount === null ? "—" : <Amount value={item.quantity * item.unitAmount} currency={storedCurrency} locale={locale} />}</td>
          </tr>)}</tbody>
        </table>
        <div className="w-invoice-totals">
          <div><span>{t("Subtotal", "الإجمالي قبل الضريبة")}</span><strong><Amount value={savedTotals.subtotal} currency={storedCurrency} locale={locale} /></strong></div>
          <div><span>{t("Draft tax", "ضريبة المسودة")}{invoice.taxRatePercent === null ? ` · ${t("pending Owner confirmation", "بانتظار تأكيد المالك")}` : ` · ${plain(invoice.taxRatePercent, locale)}%`}</span><strong><Amount value={savedTotals.taxAmount} currency={storedCurrency} locale={locale} /></strong></div>
          <div className="w-invoice-total"><span>{t("Draft total", "إجمالي المسودة")}</span><strong><Amount value={savedTotals.total} currency={storedCurrency} locale={locale} /></strong></div>
          <div><span>{t("Payment status", "حالة الدفع")}</span><strong>{savedTotals.paymentStatus === "unpriced" ? <span title={t("Amounts or Owner tax settings pending", "المبالغ أو إعداد الضريبة بانتظار الاعتماد")}><StatusBadge status="unpriced" domain="invoice" lang={locale} /></span> : <StatusBadge status={savedTotals.paymentStatus} domain="invoice" lang={locale} />}</strong></div>
          <div><span>{t("Amount paid", "المبلغ المدفوع")}</span><strong><Amount value={invoice.paidAmount} currency={storedCurrency} locale={locale} /></strong></div>
          {invoice.paymentRecordedAt && <div><span>{t("Payment entry date", "تاريخ تسجيل الدفع")}</span><strong><DateText value={invoice.paymentRecordedAt} lang={locale} /></strong></div>}
          <div className="w-invoice-total"><span>{t("Draft balance · negative means overpayment", "المتبقي في المسودة · السالب معناه دفعة زيادة")}</span><strong><Amount value={savedTotals.balance} currency={storedCurrency} locale={locale} /></strong></div>
        </div>
        <p className="w-invoice-disclaimer">{t("Draft for review only. Tax treatment, official template, and final issuance are pending Owner approval. Do not use as a tax invoice or proof of payment.", "مسودة للمراجعة فقط. المعاملة الضريبية والقالب الرسمي والإصدار النهائي بانتظار موافقة المالك. لا تستخدمها كفاتورة ضريبية أو إثبات دفع.")}</p>
      </div>
      </>}
      {notice && <Notice tone="info">{notice}</Notice>}
      {error && <div className="w-error" role="alert">{error}</div>}
    </>}

    {printing && printModel && <PrintHost model={printModel} />}
    <ConfirmDialog
      open={pendingCurrency !== null} lang={locale}
      title={t("Change the invoice currency?", "تغيير عملة الفاتورة؟")}
      body={pendingCurrency ? t(`Amounts already entered stay the same numbers and will be read as ${currencyLabel(pendingCurrency)}. They are not converted.`, `تبقى المبالغ المدخلة بنفس الأرقام وستُقرأ بعملة ${currencyLabel(pendingCurrency)}. لا يتم تحويلها.`) : undefined}
      confirmLabel={t("Change currency", "تغيير العملة")}
      onCancel={() => setPendingCurrency(null)}
      onConfirm={() => { if (pendingCurrency) setDraft((current) => ({ ...current, currency: pendingCurrency })); setPendingCurrency(null); }}
    />
  </section>;
}
