import type { Locale, QuoteLine } from "@garage/domain";
import type { Lookups } from "./lookups";
import { lineTotal, roofLabels, type Bilingual, type QuoteRow } from "./quote-logic";

/**
 * Content of a printed quote, assembled separately from layout so a confirmed template can replace the layout (QuotePrint)
 * without touching this. Pure: all names come from the lookups passed in; amounts stay in minor units.
 */
export interface QuoteDocumentConfig {
  /** Placeholder wording until the Owner confirms a template. */
  terms: Bilingual[];
  notes: Bilingual[];
  showRevision: boolean;
}

export const defaultQuoteDocumentConfig: QuoteDocumentConfig = {
  terms: [
    { en: "Prices and tax are as approved at the time of issue.", ar: "الأسعار والضريبة وفق المعتمد وقت الإصدار." },
    { en: "This quote is valid until the date shown above (terms to be confirmed).", ar: "هذا العرض صالح حتى التاريخ الموضح أعلاه (الشروط قيد الاعتماد)." },
  ],
  notes: [],
  showRevision: true,
};

export type QuoteDocLine = { id: string; kind: "item" | "transport"; description: string; details: string[]; quantity: number; unit: number; discount: number; tax: number; total: number; currency: string };
export interface QuoteDocument {
  number: string;
  state: QuoteRow["state"];
  branch: string;
  issueDate: string;
  validThrough: string | null;
  customer: { name: string; phone: string };
  vehicle: { plate: string; model: string };
  lines: QuoteDocLine[];
  /** One block per currency (a quote normally has one; mixed currencies are never summed together). */
  totals: Array<{ currency: string; subtotal: number; discount: number; tax: number; total: number }>;
  terms: Bilingual[];
  notes: Bilingual[];
}

export const TRANSPORT_PREFIX = "transport:";

/** Stable human document number from the quote id and revision, e.g. QT-1A2B3C4D-R2. */
export function quoteNumber(quoteId: string, revision: number): string {
  const core = quoteId.replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase() || "00000000";
  return `QT-${core}-R${revision}`;
}

export function totalsByCurrency(lines: Array<Pick<QuoteDocLine, "unit" | "quantity" | "discount" | "tax" | "currency">>): QuoteDocument["totals"] {
  const map = new Map<string, QuoteDocument["totals"][number]>();
  for (const line of lines) {
    const row = map.get(line.currency) ?? { currency: line.currency, subtotal: 0, discount: 0, tax: 0, total: 0 };
    row.subtotal += line.unit * line.quantity;
    row.discount += line.discount;
    row.tax += line.tax;
    row.total = row.subtotal - row.discount + row.tax;
    map.set(line.currency, row);
  }
  return [...map.values()];
}

export function buildQuoteDocument(quote: QuoteRow, lookups: Lookups, lang: Locale, issueDate: string, config: QuoteDocumentConfig = defaultQuoteDocumentConfig): QuoteDocument {
  const { input } = quote;
  const customer = lookups.customer(input.customerId);
  const vehicle = lookups.vehicle(input.vehicle.vehicleId);
  const lines: QuoteDocLine[] = input.lines.map((line: QuoteLine) => {
    const scope = input.scope.find((item) => item.id === line.scopeItemId);
    const transport = line.scopeItemId.startsWith(TRANSPORT_PREFIX);
    const service = scope ? lookups.serviceName(scope.serviceId) : "";
    const details: string[] = [];
    if (scope) {
      for (const area of scope.areas) details.push(area);
      if (!transport && scope.roof !== "not-applicable") details.push(roofLabels[scope.roof][lang]);
      for (const id of scope.addOnIds) { const name = lookups.serviceName(id); if (name) details.push(`+ ${name}`); }
      if (scope.exclusions.length) details.push(`${lang === "ar" ? "غير مشمول" : "Not included"}: ${scope.exclusions.join(lang === "ar" ? "، " : ", ")}`);
    }
    return {
      id: line.id, kind: transport ? "transport" : "item",
      description: transport ? (lang === "ar" ? "رسوم النقل" : "Transport fee") : service || (lang === "ar" ? "خدمة" : "Service"),
      details: transport ? details.map((entry) => entry.replace(/^Transport:\s*/, "")) : details,
      quantity: line.quantity, unit: line.unitPrice.minor, discount: line.discount.minor, tax: line.tax?.minor ?? 0, total: lineTotal(line), currency: line.unitPrice.currency,
    };
  });
  return {
    number: quoteNumber(quote.ref.quoteId, quote.ref.revision), state: quote.state, branch: lookups.branchName(input.branchId), issueDate, validThrough: quote.validThrough,
    customer: { name: customer?.name ?? "", phone: customer?.phone ?? "" },
    vehicle: { plate: vehicle?.vehicle.plate ?? "", model: vehicle?.vehicle.makeModel ?? input.vehicle.model },
    lines, totals: totalsByCurrency(lines), terms: config.terms, notes: config.notes,
  };
}
