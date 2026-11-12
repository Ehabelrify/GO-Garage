import { useEffect, useMemo, useState } from "react";
import { FileText, Pencil, Plus, Printer, Save, Trash2, X } from "lucide-react";
import { calculateWarrantyInvoiceTotals } from "../domain";
import type {
  Locale,
  WarrantyInvoiceDraft,
  WarrantyInvoiceDraftInput,
  WarrantyInvoicePaymentMethod,
  WarrantyRecord,
} from "../types";
import { useGarageStore } from "../store";

interface WarrantyInvoicePanelProps {
  warranty: WarrantyRecord;
  locale: Locale;
  customerName: string;
  vehicleLabel: string;
  serviceLabel: string;
  branchLabel: string;
}

const emptyDraft = (): WarrantyInvoiceDraftInput => ({
  items: [{ description: "", quantity: 1, unitAmount: null }],
  taxRatePercent: null,
  paidAmount: 0,
  paymentMethod: null,
  notes: "",
});

function inputFromInvoice(invoice: WarrantyInvoiceDraft): WarrantyInvoiceDraftInput {
  return {
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

function money(value: number | null, locale: Locale) {
  return value === null
    ? "—"
    : new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
}

function text(locale: Locale, en: string, ar: string) {
  return locale === "ar" ? ar : en;
}

function invoiceErrorText(code: string, locale: Locale) {
  const messages: Record<string, { en: string; ar: string }> = {
    ROLE_FORBIDDEN: { en: "Your role or branch access does not allow this invoice action.", ar: "دورك أو صلاحية فرعك مش بيسمحوا بإجراء الفاتورة ده." },
    WARRANTY_NOT_FOUND: { en: "This warranty record is no longer available.", ar: "سجل الضمان ده مبقاش متاح." },
    INVOICE_DRAFT_NOT_FOUND: { en: "Create a draft invoice before editing it.", ar: "جهّز مسودة فاتورة قبل تعديلها." },
    INVALID_INVOICE_DRAFT: { en: "Check the draft items, amounts, tax and payment fields.", ar: "راجع بنود المسودة والمبالغ والضريبة وبيانات الدفع." },
    REQUEST_FAILED: { en: "The draft could not be saved. Check your connection and try again.", ar: "ماقدرناش نحفظ المسودة. راجع الاتصال وجرّب تاني." },
  };
  const message = messages[code];
  return message ? text(locale, message.en, message.ar) : text(locale, "The invoice draft could not be saved.", "ماقدرناش نحفظ مسودة الفاتورة.");
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
  const invoice = store.state?.warrantyInvoiceDrafts.find((item) => item.warrantyId === warranty.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WarrantyInvoiceDraftInput>(emptyDraft);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [printPending, setPrintPending] = useState(false);
  const totals = useMemo(
    () => calculateWarrantyInvoiceTotals(draft.items, draft.taxRatePercent, draft.paidAmount),
    [draft.items, draft.taxRatePercent, draft.paidAmount],
  );

  const startBrowserPrint = () => {
    document.body.classList.add("printing-warranty-invoice");
    const cleanup = () => document.body.classList.remove("printing-warranty-invoice");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 60_000);
  };

  useEffect(() => {
    if (!editing) setDraft(invoice ? inputFromInvoice(invoice) : emptyDraft());
  }, [invoice, editing]);

  useEffect(() => {
    if (!printPending || !expanded) return;
    const frame = window.requestAnimationFrame(() => {
      setPrintPending(false);
      startBrowserPrint();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [printPending, expanded]);

  const createDraft = async () => {
    setBusy(true);
    setError("");
    const result = await store.createWarrantyInvoiceDraft(warranty.id);
    setBusy(false);
    if (!result.ok) {
      setError(invoiceErrorText(result.error, locale));
      return;
    }
    setDraft({
      items: [{ description: serviceLabel, quantity: 1, unitAmount: null }],
      taxRatePercent: null,
      paidAmount: 0,
      paymentMethod: null,
      notes: "",
    });
    setExpanded(true);
    setEditing(true);
    setNotice(text(locale, "Draft saved. Add the Owner-approved amounts before printing.", "المسودة اتحفظت. أضف المبالغ المعتمدة من المالك قبل الطباعة."));
  };

  const saveDraft = async () => {
    if (!invoice || !draft.items.length || draft.items.some((item) => !item.description.trim())) return;
    setBusy(true);
    setError("");
    const result = await store.updateWarrantyInvoiceDraft(warranty.id, draft);
    setBusy(false);
    if (!result.ok) {
      setError(invoiceErrorText(result.error, locale));
      return;
    }
    setEditing(false);
    setNotice(text(locale, "Draft invoice saved. It has not been issued.", "مسودة الفاتورة اتحفظت. ما اتصدرتش."));
  };

  const printDraft = () => {
    setNotice("");
    setExpanded(true);
    setPrintPending(true);
  };

  const updateItem = (index: number, updates: Partial<WarrantyInvoiceDraftInput["items"][number]>) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item),
    }));
  };

  const paymentStatusLabel = {
    unpriced: text(locale, "Amounts or Owner tax settings pending", "المبالغ أو إعداد الضريبة لسه محتاجة اعتماد"),
    unpaid: text(locale, "Unpaid draft", "مسودة غير مدفوعة"),
    partial: text(locale, "Partially paid · draft", "مدفوع جزئياً · مسودة"),
    paid: text(locale, "Paid amount entered · draft", "تم إدخال مبلغ مدفوع · مسودة"),
  }[totals.paymentStatus];

  return <section className="w-invoice-panel">
    <div className="w-invoice-head">
      <div>
        <strong><FileText size={15} />{text(locale, "Draft invoice", "مسودة فاتورة")}</strong>
        <p>{text(locale, "Amounts, tax and currency still require Owner confirmation. This cannot be issued as a final invoice.", "المبالغ والضريبة والعملة لسه محتاجة تأكيد المالك. المسودة دي مش فاتورة نهائية.")}</p>
      </div>
      {invoice && <span className="w-badge draft">{text(locale, "Draft only", "مسودة فقط")}</span>}
    </div>

    {!invoice ? <div className="w-invoice-empty">
      <span>{text(locale, "No invoice draft is linked yet.", "لسه مفيش مسودة فاتورة مرتبطة.")}</span>
      <button className="btn btn-sm btn-primary" type="button" disabled={busy} onClick={() => void createDraft()}>
        <Plus size={14} />{busy ? text(locale, "Preparing…", "بنجهّز…") : text(locale, "Create draft invoice", "جهّز مسودة فاتورة")}
      </button>
    </div> : <>
      <div className="w-invoice-actions">
        {!editing && <button className="btn btn-sm" type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} aria-controls={`w-invoice-${invoice.id}`}>
          <FileText size={13} />{expanded ? text(locale, "Hide draft", "اخفِ المسودة") : text(locale, "View draft", "اعرض المسودة")}
        </button>}
        {!editing && <button className="btn btn-sm" type="button" onClick={() => { setDraft(inputFromInvoice(invoice)); setExpanded(true); setEditing(true); setError(""); }}>
          <Pencil size={13} />{text(locale, "Edit draft", "عدّل المسودة")}
        </button>}
        {!editing && <button className="btn btn-sm btn-primary" type="button" onClick={printDraft}>
          <Printer size={13} />{text(locale, "Print draft", "اطبع المسودة")}
        </button>}
      </div>
      {expanded && <>
      {invoice.paymentRecordedAt && <p className="w-invoice-payment-meta">
        {text(locale, "Payment entry recorded", "اتسجلت بيانات الدفع")}
        {` · ${new Date(invoice.paymentRecordedAt).toLocaleString(locale === "ar" ? "ar-EG" : "en-EG")}`}
        {invoice.paymentRecordedBy ? ` · ${invoice.paymentRecordedBy}` : ""}
      </p>}

      {editing && <div className="w-invoice-editor">
        <div className="w-invoice-editor-head"><strong>{text(locale, "Job items", "بنود الشغل")}</strong>
          <button className="btn btn-sm" type="button" onClick={() => setDraft((current) => ({
            ...current,
            items: [...current.items, { description: "", quantity: 1, unitAmount: null }],
          }))}><Plus size={13} />{text(locale, "Add item", "أضف بند")}</button>
        </div>
        {draft.items.map((item, index) => <div className="w-invoice-line-edit" key={index}>
          <label><span>{text(locale, "Description", "الوصف")}</span><input className="field-input" maxLength={240} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} /></label>
          <label><span>{text(locale, "Qty", "الكمية")}</span><input className="field-input" type="number" min="0.01" max="10000" step="0.01" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) || 0 })} /></label>
          <label><span>{text(locale, "Amount · currency pending", "المبلغ · العملة لسه مش معتمدة")}</span><input className="field-input" type="number" min="0" max="1000000000" step="0.01" placeholder={text(locale, "Not entered", "لسه ماتكتبش")} value={item.unitAmount ?? ""} onChange={(event) => updateItem(index, { unitAmount: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          <button className="btn btn-icon btn-sm" type="button" aria-label={text(locale, `Remove item ${index + 1}`, `احذف البند ${index + 1}`)} disabled={draft.items.length <= 1} onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={13} /></button>
        </div>)}
        <div className="w-invoice-edit-grid">
          <label><span>{text(locale, "Draft tax rate (%) · Owner approval pending", "نسبة الضريبة للمسودة (%) · موافقة المالك مطلوبة")}</span><input className="field-input" type="number" min="0" max="100" step="0.01" placeholder={text(locale, "Not configured", "مش متحددة")} value={draft.taxRatePercent ?? ""} onChange={(event) => setDraft((current) => ({ ...current, taxRatePercent: event.target.value === "" ? null : Number(event.target.value) }))} /></label>
          <label><span>{text(locale, "Amount paid · draft tracking only", "المبلغ المدفوع · متابعة مسودة فقط")}</span><input className="field-input" type="number" min="0" max="1000000000" step="0.01" value={draft.paidAmount} onChange={(event) => setDraft((current) => ({ ...current, paidAmount: Number(event.target.value) || 0 }))} /></label>
          <label><span>{text(locale, "Payment method", "طريقة الدفع")}</span><select className="field-select" value={draft.paymentMethod ?? ""} onChange={(event) => setDraft((current) => ({ ...current, paymentMethod: (event.target.value || null) as WarrantyInvoicePaymentMethod | null }))}>
            <option value="">{text(locale, "Not recorded", "غير مسجل")}</option>
            <option value="cash">{text(locale, "Cash", "نقدي")}</option>
            <option value="card">{text(locale, "Card", "بطاقة")}</option>
            <option value="transfer">{text(locale, "Transfer", "تحويل")}</option>
            <option value="other">{text(locale, "Other", "أخرى")}</option>
          </select></label>
        </div>
        <label className="w-invoice-notes"><span>{text(locale, "Internal draft note", "ملاحظة داخلية للمسودة")}</span><textarea className="field-textarea" maxLength={1000} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
        <div className="w-invoice-actions">
          <button className="btn btn-sm" type="button" disabled={busy} onClick={() => { setEditing(false); setError(""); }}><X size={13} />{text(locale, "Cancel", "إلغاء")}</button>
          <button className="btn btn-sm btn-primary" type="button" disabled={busy || !draft.items.length || draft.items.some((item) => !item.description.trim() || item.quantity <= 0)} onClick={() => void saveDraft()}><Save size={13} />{busy ? text(locale, "Saving…", "بنحفظ…") : text(locale, "Save draft", "احفظ المسودة")}</button>
        </div>
      </div>}

      <div className="w-invoice-print-area" id={`w-invoice-${invoice.id}`}>
        <div className="w-invoice-print-title">
          <div><span>{text(locale, "WORKSHOP INVOICE", "فاتورة ورشة")}</span><h3>{text(locale, "DRAFT · NOT A FINAL INVOICE", "مسودة · مش فاتورة نهائية")}</h3></div>
          <bdi>{invoice.id}</bdi>
        </div>
        <div className="w-invoice-party-grid">
          <div><small>{text(locale, "Customer", "العميل")}</small><strong>{customerName}</strong></div>
          <div><small>{text(locale, "Vehicle", "العربية")}</small><strong>{vehicleLabel}</strong></div>
          <div><small>{text(locale, "Service", "الخدمة")}</small><strong>{serviceLabel}</strong></div>
          <div><small>{text(locale, "Branch", "الفرع")}</small><strong>{branchLabel}</strong></div>
          <div><small>{text(locale, "Job reference", "رقم أمر الشغل")}</small><strong><bdi>{warranty.jobId}</bdi></strong></div>
          <div><small>{text(locale, "Prepared", "تاريخ التجهيز")}</small><strong>{new Date(invoice.updatedAt).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-EG")}</strong></div>
        </div>
        <table className="w-invoice-table">
          <thead><tr><th>{text(locale, "Item", "البند")}</th><th>{text(locale, "Qty", "الكمية")}</th><th>{text(locale, "Unit amount", "سعر الوحدة")}</th><th>{text(locale, "Line amount", "إجمالي البند")}</th></tr></thead>
          <tbody>{invoice.items.map((item) => <tr key={item.id}>
            <td>{item.description}</td><td>{money(item.quantity, locale)}</td>
            <td>{money(item.unitAmount, locale)}</td>
            <td>{item.unitAmount === null ? "—" : money(item.quantity * item.unitAmount, locale)}</td>
          </tr>)}</tbody>
        </table>
        <div className="w-invoice-totals">
          <div><span>{text(locale, "Subtotal", "الإجمالي قبل الضريبة")}</span><strong>{money(totals.subtotal, locale)}</strong></div>
          <div><span>{text(locale, "Draft tax", "ضريبة المسودة")}{invoice.taxRatePercent === null ? ` · ${text(locale, "pending Owner confirmation", "بانتظار تأكيد المالك")}` : ` · ${money(invoice.taxRatePercent, locale)}%`}</span><strong>{money(totals.taxAmount, locale)}</strong></div>
          <div className="w-invoice-total"><span>{text(locale, "Draft total", "إجمالي المسودة")}</span><strong>{money(totals.total, locale)}</strong></div>
          <div><span>{text(locale, "Payment status", "حالة الدفع")}</span><strong>{paymentStatusLabel}</strong></div>
          <div><span>{text(locale, "Amount paid", "المبلغ المدفوع")}{invoice.paymentMethod ? ` · ${invoice.paymentMethod}` : ""}</span><strong>{money(invoice.paidAmount, locale)}</strong></div>
          {invoice.paymentRecordedAt && <div><span>{text(locale, "Payment entry date", "تاريخ تسجيل الدفع")}</span><strong>{new Date(invoice.paymentRecordedAt).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-EG")}</strong></div>}
          <div className="w-invoice-total"><span>{text(locale, "Draft balance · negative means overpayment", "المتبقي في المسودة · السالب معناه دفعة زيادة")}</span><strong>{money(totals.balance, locale)}</strong></div>
        </div>
        <p className="w-invoice-disclaimer">{text(locale, "Draft for review only. Currency, tax treatment, official template, and final issuance are pending Owner approval. Do not use as a tax invoice or proof of payment.", "مسودة للمراجعة فقط. العملة والمعاملة الضريبية والقالب الرسمي والإصدار النهائي بانتظار موافقة المالك. لا تستخدمها كفاتورة ضريبية أو إثبات دفع.")}</p>
      </div>
      </>}
      {notice && <p className="w-inline-note" role="status">{notice}</p>}
      {error && <div className="w-error" role="alert">{error}</div>}
    </>}
  </section>;
}
