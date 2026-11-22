import type { Locale } from "@garage/domain";
import type { DocumentModel } from "../../shared/components";
import type { Invoice, InvoiceLine } from "./invoices-api";

const t = (lang: Locale, en: string, ar: string) => (lang === "ar" ? ar : en);

export const lineDescription = (line: Pick<InvoiceLine, "descriptionEn" | "descriptionAr">, lang: Locale) =>
  (lang === "ar" ? line.descriptionAr || line.descriptionEn : line.descriptionEn || line.descriptionAr);

export function statusLabel(status: Invoice["status"], lang: Locale) {
  const labels: Record<Invoice["status"], [string, string]> = {
    draft: ["Draft", "مسودة"], issued: ["Issued", "صادرة"], partial: ["Part paid", "مدفوعة جزئياً"], paid: ["Paid", "مدفوعة"], void: ["Void", "ملغاة"],
  };
  return t(lang, ...labels[status]);
}

/** Maps an invoice to the generic printable model. Pure; amounts stay in the invoice currency. */
export function buildInvoiceDocument(input: {
  invoice: Invoice; lines: InvoiceLine[]; lang: Locale; branchLabel: string; customerName: string; vehicleLabel?: string;
  business?: { name: string; subtitle?: string };
}): DocumentModel {
  const { invoice, lines, lang } = input;
  const draft = invoice.status === "draft";
  return {
    lang,
    business: input.business ?? { name: "Go Stores", subtitle: t(lang, "Workshop services", "خدمات الورشة") },
    title: t(lang, "Invoice", "فاتورة"),
    number: invoice.number,
    statusLabel: invoice.status === "issued" ? undefined : statusLabel(invoice.status, lang),
    branch: input.branchLabel,
    issueDate: invoice.issueDate,
    customer: { label: t(lang, "Customer", "العميل"), name: input.customerName },
    vehicle: invoice.plate ? { label: t(lang, "Vehicle", "المركبة"), plate: invoice.plate, description: input.vehicleLabel } : null,
    lines: lines.map((line) => ({
      description: lineDescription(line, lang), quantity: line.quantity, unitMinor: line.unitMinor, discountMinor: line.discountMinor,
      taxMinor: line.taxMinor ?? undefined, amountMinor: line.amountMinor, currency: invoice.currency,
    })),
    totals: [{
      currency: invoice.currency, subtotalMinor: invoice.subtotalMinor, discountMinor: invoice.discountMinor, taxMinor: invoice.taxMinor, totalMinor: invoice.totalMinor,
      paidMinor: draft ? undefined : invoice.paidMinor, balanceMinor: draft ? undefined : invoice.balanceMinor,
    }],
    notes: invoice.notes || undefined,
    terms: invoice.terms || undefined,
    disclaimer: draft || invoice.taxRatePercent === null
      ? t(lang, "Generic template. Tax treatment and the official invoice template are pending Owner confirmation; do not use as a tax invoice.",
        "قالب عام. المعاملة الضريبية وقالب الفاتورة الرسمي بانتظار تأكيد المالك؛ لا تستخدمها كفاتورة ضريبية.")
      : undefined,
    signatures: [{ label: t(lang, "Prepared by", "أعدها") }, { label: t(lang, "Customer signature", "توقيع العميل") }],
  };
}

/** What can still be taken back: reversed payments are already out, refunds reduce what is left. Never negative. */
export function refundableMinor(detail: { payments: Array<{ amountMinor: number; reversed?: boolean }>; refunds?: Array<{ amountMinor: number }> }): number {
  const paid = detail.payments.filter((payment) => !payment.reversed).reduce((sum, payment) => sum + payment.amountMinor, 0);
  const refunded = (detail.refunds ?? []).reduce((sum, refund) => sum + refund.amountMinor, 0);
  return Math.max(0, paid - refunded);
}

/** Reverse and refund apply to invoices that have received money and are not void. */
export const canTakeMoneyBack = (status: Invoice["status"]) => status === "partial" || status === "paid";

/** A fresh idempotency key per user action. */
export const newActionKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/** Parses a typed major-unit amount to minor units; null for blank, NaN for invalid. */
export function parseMajor(value: string, exponent = 2): number | null {
  const cleaned = value.replace(/[,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return Number.NaN;
  return Math.round(Number(cleaned) * 10 ** exponent);
}
export const toMajorText = (minor: number | null, exponent = 2) => (minor === null ? "" : String(minor / 10 ** exponent));

export function errorCopy(code: string, lang: Locale): string {
  const messages: Record<string, [string, string]> = {
    ROLE_FORBIDDEN: ["Your role does not allow this invoice action.", "دورك لا يسمح بهذا الإجراء على الفاتورة."],
    DEMO_ACTION_DISABLED: ["Invoices cannot be changed in a role preview session.", "لا يمكن تعديل الفواتير في جلسة معاينة الدور."],
    REVISION_CONFLICT: ["This invoice changed. Reload and try again.", "تغيرت هذه الفاتورة. أعد التحميل وحاول مجدداً."],
    INVALID_STATE: ["This invoice is no longer in a state that allows that action.", "لم تعد حالة الفاتورة تسمح بهذا الإجراء."],
    INVOICE_UNPRICED: ["Every line needs a price and a tax amount (or a tax rate) before issuing.", "كل بند يحتاج سعراً وضريبة (أو نسبة ضريبة) قبل الإصدار."],
    INVOICE_EMPTY: ["Add at least one line before issuing.", "أضف بنداً واحداً على الأقل قبل الإصدار."],
    INVALID_LINE: ["Check the line amounts: a discount cannot exceed the line.", "راجع مبالغ البنود: الخصم لا يتجاوز قيمة البند."],
    UNSUPPORTED_CURRENCY: ["Choose a currency from the supported list.", "اختر عملة من القائمة المدعومة."],
    OVERPAYMENT: ["The payment is larger than the remaining balance.", "الدفعة أكبر من المتبقي."],
    DUPLICATE_REFERENCE: ["This payment reference was already recorded.", "تم تسجيل مرجع الدفع هذا من قبل."],
    HAS_PAYMENTS: ["An invoice with recorded payments cannot be voided.", "لا يمكن إلغاء فاتورة عليها مدفوعات."],
    JOB_NOT_COMPLETE: ["An invoice can be generated once the job is ready or delivered.", "يمكن إنشاء الفاتورة عندما يكون العمل جاهزاً أو مسلّماً."],
    JOB_NOT_FOUND: ["No job exists for that record yet.", "لا يوجد عمل لهذا السجل بعد."],
    ALREADY_REVERSED: ["This payment was already reversed.", "تم عكس هذه الدفعة من قبل."],
    OVER_REVERSAL: ["The reversal is larger than what was paid.", "العكس أكبر من المبلغ المدفوع."],
    OVER_REFUND: ["The refund is larger than what was paid and not yet refunded.", "الاسترداد أكبر من المدفوع الذي لم يُسترد بعد."],
    PAYMENT_NOT_FOUND: ["This payment is no longer available.", "لم تعد هذه الدفعة متاحة."],
    IDEMPOTENCY_CONFLICT: ["That request was already used with different details. Reload and try again.", "استُخدم هذا الطلب سابقاً بتفاصيل مختلفة. أعد التحميل وحاول مجدداً."],
    FINANCE_DEFINITION_REQUIRED: ["No approved finance definition covers this currency and action yet. Ask the owner to approve one.", "لا يوجد تعريف مالي معتمد لهذه العملة والإجراء بعد. اطلب من المالك اعتماد واحد."],
    INVOICE_NOT_FOUND: ["This invoice is no longer available.", "لم تعد هذه الفاتورة متاحة."],
    WRITE_OUTCOME_UNKNOWN: ["We could not confirm whether the change was saved. Reload and check before retrying.", "لم نتمكن من تأكيد حفظ التغيير. أعد التحميل وراجع قبل إعادة المحاولة."],
  };
  const found = messages[code];
  return found ? t(lang, ...found) : t(lang, "The invoice action could not be completed.", "تعذر إكمال إجراء الفاتورة.");
}
