import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { currencyDefinition, currencyExponent, formatPlateDisplay, supportedCurrencies, type Locale } from "@garage/domain";
import {
  Amount, ConfirmDialog, DateText, DetailDrawer, Field, FormSection, Notice, PrintButton, PrintHost, RecordRef, Skeleton, type DocumentModel,
} from "../../shared/components";
import { useGarageStore } from "../../shared/store";
import { branchDisplay, customerDisplay } from "../../shared/ui";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { buildInvoiceDocument, errorCopy, lineDescription, parseMajor, toMajorText } from "./invoice-model";
import { InvoiceApiError, invoicesApi, type DraftLineInput, type InvoiceDetail } from "./invoices-api";

interface Props { lang: Locale; invoiceId: string | null; onClose: () => void; onChanged: () => void }

const kinds: DraftLineInput["kind"][] = ["package", "service", "add-on", "transport", "fee", "other"];
const kindLabel: Record<DraftLineInput["kind"], [string, string]> = {
  package: ["Package", "باقة"], service: ["Service", "خدمة"], "add-on": ["Add-on", "إضافة"], transport: ["Transport", "نقل"], fee: ["Fee", "رسوم"], other: ["Other", "أخرى"],
};
const methods = ["cash", "card", "transfer", "instapay", "other"] as const;
const methodLabel: Record<(typeof methods)[number], [string, string]> = { cash: ["Cash", "نقدي"], card: ["Card", "بطاقة"], transfer: ["Transfer", "تحويل"], instapay: ["InstaPay", "إنستا باي"], other: ["Other", "أخرى"] };

interface EditLine { kind: DraftLineInput["kind"]; descriptionEn: string; descriptionAr: string; quantity: string; unit: string; discount: string; tax: string }

/** Invoice detail: summary, draft line editor, issue / void / payment reference, print. */
export function InvoiceDrawer({ lang, invoiceId, onClose, onChanged }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const { state } = useGarageStore();
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [currency, setCurrency] = useState("EGP");
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [confirm, setConfirm] = useState<"issue" | "void" | "pay" | null>(null);
  const [reason, setReason] = useState("");
  const [pay, setPay] = useState({ amount: "", method: "cash" as (typeof methods)[number], reference: "", receivedOn: new Date().toISOString().slice(0, 10) });

  const load = async (id: string) => {
    setLoading(true); setError("");
    try { setDetail(await invoicesApi.get(id)); } catch (failure) { setDetail(null); setError(errorCopy(failure instanceof InvoiceApiError ? failure.code : "", lang)); } finally { setLoading(false); }
  };
  useEffect(() => { setEditing(false); setConfirm(null); if (invoiceId) void load(invoiceId); else setDetail(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [invoiceId]);

  const invoice = detail?.invoice;
  const exponent = currencyExponent(editing ? currency : invoice?.currency);
  const branch = invoice ? state?.branches.find((item) => item.id === invoice.branchId) : undefined;
  const customerName = invoice?.customerName ? customerDisplay(invoice.customerName, lang) : "";
  const doc: DocumentModel | null = useMemo(() => invoice && detail
    ? buildInvoiceDocument({ invoice, lines: detail.lines, lang, branchLabel: branch ? branchDisplay(branch.name, lang) : "", customerName })
    : null, [invoice, detail, lang, branch, customerName]);

  const startEdit = () => {
    if (!detail) return;
    const exp = currencyExponent(detail.invoice.currency);
    setCurrency(detail.invoice.currency); setRate(detail.invoice.taxRatePercent === null ? "" : String(detail.invoice.taxRatePercent));
    setNotes(detail.invoice.notes); setTerms(detail.invoice.terms);
    setLines(detail.lines.map((line) => ({ kind: line.kind, descriptionEn: line.descriptionEn, descriptionAr: line.descriptionAr, quantity: String(line.quantity),
      unit: toMajorText(line.unitMinor, exp), discount: toMajorText(line.discountMinor || null, exp), tax: toMajorText(line.taxMinor, exp) })));
    setEditing(true); setError("");
  };
  const patch = (index: number, change: Partial<EditLine>) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...change } : line)));

  const parsed = useMemo(() => {
    const rateValue = rate.trim() === "" ? null : Number(rate);
    const rateBad = rateValue !== null && !(rateValue >= 0 && rateValue <= 100);
    const out = lines.map((line): DraftLineInput | null => {
      const unit = parseMajor(line.unit, exponent), discount = parseMajor(line.discount, exponent), tax = parseMajor(line.tax, exponent), quantity = Number(line.quantity);
      if (!line.descriptionEn.trim() || !(quantity > 0) || Number.isNaN(unit) || Number.isNaN(discount) || Number.isNaN(tax)) return null;
      return { kind: line.kind, descriptionEn: line.descriptionEn.trim(), descriptionAr: line.descriptionAr.trim(), quantity, unitMinor: unit, discountMinor: discount ?? 0, taxMinor: tax };
    });
    return { rateValue, valid: !rateBad && out.length > 0 && out.every(Boolean), lines: out.filter(Boolean) as DraftLineInput[] };
  }, [lines, rate, exponent]);

  const run = async (action: () => Promise<InvoiceDetail>, after?: () => void) => {
    setBusy(true); setError("");
    try { setDetail(await action()); onChanged(); after?.(); } catch (failure) { setError(errorCopy(failure instanceof InvoiceApiError ? failure.code : "", lang)); } finally { setBusy(false); }
  };
  const save = () => invoice && run(() => invoicesApi.save(invoice.id, { expectedRevision: invoice.revision, currency, taxRatePercent: parsed.rateValue, notes, terms, lines: parsed.lines }), () => setEditing(false));
  const payMinor = parseMajor(pay.amount, exponent);
  const payValid = payMinor !== null && !Number.isNaN(payMinor) && payMinor > 0 && pay.reference.trim().length > 0;

  const footer = invoice && doc ? <>
    <span data-testid="print-invoice" className="invoice-print"><PrintButton lang={lang} label={t("Print", "طباعة")} /></span>
    {detail?.canWrite && invoice.status === "draft" && !editing && <button type="button" className="btn" onClick={startEdit}>{t("Edit lines", "تعديل البنود")}</button>}
    {editing && <button type="button" className="btn btn-primary" disabled={busy || !parsed.valid} onClick={() => void save()}><Save size={14} aria-hidden="true" />{busy ? t("Saving…", "جارٍ الحفظ…") : t("Save draft", "حفظ المسودة")}</button>}
    {editing && <button type="button" className="btn" disabled={busy} onClick={() => setEditing(false)}>{t("Cancel", "إلغاء")}</button>}
    {detail?.canWrite && invoice.status === "draft" && !editing && <button type="button" className="btn btn-primary" onClick={() => setConfirm("issue")}>{t("Issue invoice", "إصدار الفاتورة")}</button>}
    {detail?.canWrite && (invoice.status === "issued" || invoice.status === "partial") && <button type="button" className="btn btn-primary" onClick={() => setConfirm("pay")}>{t("Record payment", "تسجيل دفعة")}</button>}
    {detail?.canVoid && (invoice.status === "draft" || invoice.status === "issued") && <button type="button" className="btn btn-danger" onClick={() => { setReason(""); setConfirm("void"); }}>{t("Void", "إلغاء الفاتورة")}</button>}
  </> : undefined;

  return <>
    <DetailDrawer open={Boolean(invoiceId)} onClose={onClose} lang={lang} wide footer={footer}
      title={invoice ? (invoice.number ?? t("Draft invoice", "مسودة فاتورة")) : t("Invoice", "فاتورة")}
      subtitle={invoice ? `${customerName}${invoice.plate ? ` · ${formatPlateDisplay(invoice.plate)}` : ""}` : undefined}>
      {loading && <Skeleton rows={4} label={t("Loading invoice", "جارٍ تحميل الفاتورة")} />}
      {error && <div className="w-error" role="alert">{error}</div>}
      {invoice && detail && <div className="invoice-detail">
        <div className="invoice-summary">
          <InvoiceStatusBadge status={invoice.status} lang={lang} />
          <span className="tag">{invoice.currency}</span>
          {invoice.issueDate && <span className="form-hint">{t("Issued", "صدرت")} <DateText value={invoice.issueDate} lang={lang} /></span>}
          <span className="invoice-links">
            <RecordRef type="customer" id={invoice.customerId} label={customerName || undefined} />
            <RecordRef type="vehicle" id={invoice.vehicleId} label={invoice.plate ? formatPlateDisplay(invoice.plate) : undefined} />
            {invoice.jobId && <RecordRef type="job" id={invoice.jobId} label={invoice.plate ? formatPlateDisplay(invoice.plate) : undefined} />}
            {invoice.quoteId && <RecordRef type="quote" id={invoice.quoteId} label={t("Accepted quote", "عرض السعر المقبول")} />}
            {invoice.warrantyId && <RecordRef type="warranty" id={invoice.warrantyId} />}
          </span>
        </div>
        {invoice.status === "void" && <Notice tone="info">{t("Void", "ملغاة")}: {invoice.voidReason}</Notice>}
        {invoice.status === "draft" && !editing && invoice.totalMinor === null && <Notice tone="info">{t("This draft is not priced yet. Edit the lines to add prices and tax before issuing.", "هذه المسودة بلا أسعار بعد. عدّل البنود لإضافة الأسعار والضريبة قبل الإصدار.")}</Notice>}

        {editing ? <form className="invoice-editor" noValidate onSubmit={(event) => { event.preventDefault(); if (parsed.valid) void save(); }}>
          <FormSection title={t("Currency and tax", "العملة والضريبة")} description={t("One currency per invoice. Amounts are not converted if you change it. A tax rate, when set, replaces per-line tax.", "عملة واحدة لكل فاتورة. لا تُحوَّل المبالغ عند تغييرها. نسبة الضريبة، إن وُجدت، تحل محل ضريبة البنود.")}>
            <Field label={t("Currency", "العملة")} required>
              <select className="field-select" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {supportedCurrencies().map((item) => <option key={item.code} value={item.code}>{item.name[lang]} ({item.symbol[lang]})</option>)}
              </select>
            </Field>
            <Field label={t("Tax rate (%)", "نسبة الضريبة (%)")} hint={t("Not approved policy. Leave blank to enter tax per line.", "ليست سياسة معتمدة. اتركها فارغة لإدخال الضريبة لكل بند.")}>
              <input className="field-input" inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} />
            </Field>
          </FormSection>
          <FormSection title={t("Lines", "البنود")} columns={1}>
            {lines.map((line, index) => <div className="invoice-line-edit" key={index}>
              <Field label={t("Type", "النوع")}>
                <select className="field-select" value={line.kind} onChange={(event) => patch(index, { kind: event.target.value as EditLine["kind"] })}>
                  {kinds.map((kind) => <option key={kind} value={kind}>{kindLabel[kind][lang === "ar" ? 1 : 0]}</option>)}
                </select>
              </Field>
              <Field label={t("Description (English)", "الوصف (إنجليزي)")} required><input className="field-input" maxLength={240} value={line.descriptionEn} onChange={(event) => patch(index, { descriptionEn: event.target.value })} /></Field>
              <Field label={t("Description (Arabic)", "الوصف (عربي)")}><input className="field-input" maxLength={240} dir="rtl" value={line.descriptionAr} onChange={(event) => patch(index, { descriptionAr: event.target.value })} /></Field>
              <Field label={t("Qty", "الكمية")}><input className="field-input" inputMode="decimal" value={line.quantity} onChange={(event) => patch(index, { quantity: event.target.value })} /></Field>
              <Field label={`${t("Unit price", "سعر الوحدة")} (${currencyDefinition(currency)?.symbol[lang] ?? currency})`}><input className="field-input" inputMode="decimal" placeholder={t("Not priced", "بلا سعر")} value={line.unit} onChange={(event) => patch(index, { unit: event.target.value })} /></Field>
              <Field label={t("Discount", "الخصم")}><input className="field-input" inputMode="decimal" value={line.discount} onChange={(event) => patch(index, { discount: event.target.value })} /></Field>
              {parsed.rateValue === null && <Field label={t("Tax", "الضريبة")}><input className="field-input" inputMode="decimal" value={line.tax} onChange={(event) => patch(index, { tax: event.target.value })} /></Field>}
              <button type="button" className="btn btn-icon btn-sm" aria-label={t(`Remove line ${index + 1}`, `احذف البند ${index + 1}`)} disabled={lines.length <= 1}
                onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><Trash2 size={13} /></button>
            </div>)}
            <div><button type="button" className="btn btn-sm" onClick={() => setLines((current) => [...current, { kind: "service", descriptionEn: "", descriptionAr: "", quantity: "1", unit: "", discount: "", tax: "" }])}><Plus size={13} />{t("Add line", "أضف بنداً")}</button></div>
          </FormSection>
          <FormSection title={t("Notes and terms", "الملاحظات والشروط")}>
            <Field label={t("Notes", "ملاحظات")} full><textarea className="field-textarea" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
            <Field label={t("Terms", "الشروط")} full><textarea className="field-textarea" maxLength={2000} value={terms} onChange={(event) => setTerms(event.target.value)} /></Field>
          </FormSection>
        </form> : <>
          <table className="invoice-lines">
            <thead><tr><th>{t("Item", "البند")}</th><th>{t("Qty", "الكمية")}</th><th>{t("Unit", "الوحدة")}</th><th>{t("Amount", "المبلغ")}</th></tr></thead>
            <tbody>{detail.lines.map((line) => <tr key={line.id}>
              <td>{lineDescription(line, lang)}<small>{kindLabel[line.kind][lang === "ar" ? 1 : 0]}</small></td>
              <td>{line.quantity}</td>
              <td><Amount variant="detail"minor={line.unitMinor} currency={invoice.currency} lang={lang} /></td>
              <td><Amount variant="detail"minor={line.amountMinor} currency={invoice.currency} lang={lang} /></td>
            </tr>)}</tbody>
          </table>
          <dl className="invoice-totals">
            <div><dt>{t("Subtotal", "الإجمالي قبل الضريبة")}</dt><dd><Amount variant="detail"minor={invoice.subtotalMinor} currency={invoice.currency} lang={lang} /></dd></div>
            {invoice.discountMinor > 0 && <div><dt>{t("Discount", "الخصم")}</dt><dd><Amount variant="detail"minor={-invoice.discountMinor} currency={invoice.currency} lang={lang} /></dd></div>}
            <div><dt>{t("Tax", "الضريبة")}</dt><dd><Amount variant="detail"minor={invoice.taxMinor} currency={invoice.currency} lang={lang} /></dd></div>
            <div className="invoice-grand"><dt>{t("Total", "الإجمالي")}</dt><dd><Amount variant="detail"minor={invoice.totalMinor} currency={invoice.currency} lang={lang} /></dd></div>
            {invoice.status !== "draft" && <div><dt>{t("Paid", "المدفوع")}</dt><dd><Amount variant="detail"minor={invoice.paidMinor} currency={invoice.currency} lang={lang} /></dd></div>}
            {invoice.status !== "draft" && invoice.status !== "void" && <div><dt>{t("Balance", "المتبقي")}</dt><dd><Amount variant="detail"minor={invoice.balanceMinor} currency={invoice.currency} lang={lang} /></dd></div>}
          </dl>
          {detail.payments.length > 0 && <section><h3>{t("Payment references", "مراجع الدفع")}</h3>
            <ul className="invoice-payments">{detail.payments.map((payment) => <li key={payment.id}>
              <Amount variant="detail"minor={payment.amountMinor} currency={payment.currency} lang={lang} /> · {methodLabel[payment.method as (typeof methods)[number]]?.[lang === "ar" ? 1 : 0] ?? payment.method} · <bdi className="mono">{payment.reference}</bdi> · <DateText value={payment.receivedOn} lang={lang} />
            </li>)}</ul>
            <p className="form-hint">{t("References only. No payment is processed here.", "مراجع فقط. لا تتم معالجة أي دفعة هنا.")}</p></section>}
          {detail.history.length > 0 && <section><h3>{t("History", "السجل")}</h3>
            <ol className="invoice-history">{detail.history.map((event) => <li key={event.seq}>{historyLabel(event.action, lang)} · <DateText value={event.occurredAt} lang={lang} />{event.actorName ? ` · ${event.actorName}` : ""}{event.reason ? ` · ${event.reason}` : ""}</li>)}</ol></section>}
        </>}
      </div>}
    </DetailDrawer>
    {doc && invoiceId && <PrintHost model={doc} />}

    <ConfirmDialog open={confirm === "issue"} lang={lang} busy={busy}
      title={t("Issue this invoice?", "إصدار هذه الفاتورة؟")}
      body={t("It receives its number and can no longer be edited. You can still void it.", "ستحصل على رقمها ولن يمكن تعديلها. يمكنك إلغاؤها لاحقاً.")}
      confirmLabel={t("Issue", "إصدار")} onCancel={() => setConfirm(null)}
      onConfirm={() => { if (invoice) void run(() => invoicesApi.issue(invoice.id, invoice.revision), () => setConfirm(null)); }} />
    <ConfirmDialog open={confirm === "void"} lang={lang} danger busy={busy}
      title={t("Void this invoice?", "إلغاء هذه الفاتورة؟")}
      body={t("A void invoice stays on record and its number is not reused.", "تبقى الفاتورة الملغاة في السجل ولا يُعاد استخدام رقمها.")}
      confirmLabel={t("Void invoice", "إلغاء الفاتورة")} confirmDisabled={reason.trim().length < 3} disabledReason={t("Enter a reason (at least 3 characters).", "اكتب سبباً (3 أحرف على الأقل).")}
      onCancel={() => setConfirm(null)}
      onConfirm={() => { if (invoice) void run(() => invoicesApi.void(invoice.id, invoice.revision, reason.trim()), () => setConfirm(null)); }}>
      <Field label={t("Reason", "السبب")} required><textarea className="field-textarea" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
    </ConfirmDialog>
    <ConfirmDialog open={confirm === "pay"} lang={lang} busy={busy}
      title={t("Record a payment reference", "تسجيل مرجع دفعة")}
      body={t("This only records what was received. It does not charge anyone.", "هذا يسجل ما تم استلامه فقط ولا يخصم من أحد.")}
      confirmLabel={t("Record", "تسجيل")} confirmDisabled={!payValid} disabledReason={t("Enter an amount and a reference.", "أدخل المبلغ والمرجع.")}
      onCancel={() => setConfirm(null)}
      onConfirm={() => { if (invoice && payValid && payMinor) void run(() => invoicesApi.pay(invoice.id, { expectedRevision: invoice.revision, amountMinor: payMinor, method: pay.method, reference: pay.reference.trim(), receivedOn: pay.receivedOn }), () => { setConfirm(null); setPay((p) => ({ ...p, amount: "", reference: "" })); }); }}>
      <Field label={`${t("Amount", "المبلغ")} (${invoice?.currency ?? ""})`} required><input className="field-input" inputMode="decimal" value={pay.amount} onChange={(event) => setPay({ ...pay, amount: event.target.value })} /></Field>
      <Field label={t("Method", "الطريقة")}><select className="field-select" value={pay.method} onChange={(event) => setPay({ ...pay, method: event.target.value as (typeof methods)[number] })}>{methods.map((m) => <option key={m} value={m}>{methodLabel[m][lang === "ar" ? 1 : 0]}</option>)}</select></Field>
      <Field label={t("Reference", "المرجع")} required hint={t("Receipt or transfer number", "رقم الإيصال أو التحويل")}><input className="field-input" maxLength={120} value={pay.reference} onChange={(event) => setPay({ ...pay, reference: event.target.value })} /></Field>
      <Field label={t("Received on", "تاريخ الاستلام")} required><input className="field-input" type="date" value={pay.receivedOn} onChange={(event) => setPay({ ...pay, receivedOn: event.target.value })} /></Field>
    </ConfirmDialog>
  </>;
}

function historyLabel(action: string, lang: Locale) {
  const labels: Record<string, [string, string]> = {
    generated: ["Generated", "أُنشئت تلقائياً"], created: ["Created", "أُنشئت"], edited: ["Edited", "عُدّلت"], issued: ["Issued", "صدرت"],
    "payment-recorded": ["Payment recorded", "سُجّلت دفعة"], voided: ["Voided", "أُلغيت"],
  };
  const found = labels[action];
  return found ? found[lang === "ar" ? 1 : 0] : action;
}
