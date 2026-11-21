import { useMemo } from "react";
import { X } from "lucide-react";
import type { Locale } from "@garage/domain";
import { PrintButton, PrintHost, type DocumentModel } from "../../shared/components";
import { tr, type Lookups } from "./lookups";
import { buildQuoteDocument, type QuoteDocument } from "./quote-document";
import { todayIso, type QuoteRow } from "./quote-logic";

/** Maps the quote content onto the shared, template-neutral DocumentModel so quotes and invoices print the same way. */
export function quoteToDocumentModel(doc: QuoteDocument, lang: Locale): DocumentModel {
  const t = tr(lang);
  return {
    lang,
    business: { name: "Go Stores", subtitle: t("Workshop services", "خدمات الورشة") },
    title: t("Quotation", "عرض سعر"),
    number: doc.number,
    statusLabel: doc.state === "draft" ? t("Draft - not yet offered", "مسودة - لم تُعرض بعد") : undefined,
    branch: doc.branch,
    issueDate: doc.issueDate,
    validUntil: doc.validThrough,
    customer: { label: t("Customer", "العميل"), name: doc.customer.name || "—", lines: doc.customer.phone ? [doc.customer.phone] : [] },
    vehicle: { label: t("Vehicle", "المركبة"), plate: doc.vehicle.plate || "—", description: doc.vehicle.model },
    lines: doc.lines.map((line) => ({
      description: line.description,
      detail: line.details.join(" · ") || undefined,
      quantity: line.quantity,
      unitMinor: line.unit,
      discountMinor: line.discount,
      taxMinor: line.tax,
      amountMinor: line.total,
      currency: line.currency,
    })),
    totals: doc.totals.map((block) => ({
      currency: block.currency, subtotalMinor: block.subtotal, discountMinor: block.discount, taxMinor: block.tax, totalMinor: block.total,
    })),
    terms: doc.terms.map((entry) => entry[lang]).join("\n"),
    notes: doc.notes.map((entry) => entry[lang]).join("\n") || undefined,
    disclaimer: t("Template and terms pending owner confirmation.", "القالب والشروط قيد اعتماد المالك."),
    signatures: [{ label: t("Customer", "العميل") }, { label: t("Authorized signature", "توقيع معتمد") }],
  };
}

/** Print button for one quote: mounts the shared print host and uses the browser's print dialog (Save as PDF works too). */
export function QuotePrintControls({ lang, quote, lookups }: { lang: Locale; quote: QuoteRow; lookups: Lookups }) {
  const model = useMemo(() => quoteToDocumentModel(buildQuoteDocument(quote, lookups, lang, todayIso()), lang), [quote, lookups, lang]);
  return <><PrintHost model={model} /><PrintButton lang={lang} /></>;
}

/** Kept for existing call sites: a small toolbar with print and close. */
export function QuotePrint({ lang, quote, lookups, onClose }: { lang: Locale; quote: QuoteRow; lookups: Lookups; onClose: () => void }) {
  const t = tr(lang);
  return <div className="no-print" role="group" aria-label={t("Quote print", "طباعة العرض")} style={{ display: "flex", gap: 8 }}>
    <QuotePrintControls lang={lang} quote={quote} lookups={lookups} />
    <button type="button" className="btn btn-sm" onClick={onClose}><X size={14} aria-hidden="true" />{t("Close", "إغلاق")}</button>
  </div>;
}
