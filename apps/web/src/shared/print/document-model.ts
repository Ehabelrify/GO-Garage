import type { Locale } from "@garage/domain";

/**
 * Pure, template-neutral description of a printable business document (quote, invoice, ...).
 * Amounts are integer minor units in ONE currency per total; DocumentSheet never mixes currencies.
 * When the owner's confirmed template arrives, build a new renderer from this same model.
 */
export interface DocumentParty {
  /** Heading, e.g. "Customer". */
  label: string;
  name: string;
  /** Extra lines (phone, address). */
  lines?: string[];
}

export interface DocumentVehicle {
  label: string;
  plate: string;
  description?: string;
}

export interface DocumentLine {
  description: string;
  /** Optional second-language or detail line shown beneath. */
  detail?: string;
  quantity: number;
  /** null = not priced yet; shown as an em dash. */
  unitMinor: number | null;
  discountMinor?: number;
  taxMinor?: number;
  /** Line amount after discount and tax; computed by the caller so rules stay in one place. */
  amountMinor: number | null;
  currency: string;
}

export interface DocumentTotal {
  currency: string;
  subtotalMinor: number | null;
  discountMinor: number;
  taxMinor: number | null;
  totalMinor: number | null;
  /** Optional paid / balance rows for invoices. */
  paidMinor?: number;
  balanceMinor?: number | null;
}

export interface DocumentModel {
  /** Language the sheet is rendered in (sets dir and labels). */
  lang: Locale;
  business: { name: string; subtitle?: string; logoUrl?: string | null };
  title: string;
  number: string | null;
  /** Shown as a stamp, e.g. "Draft". */
  statusLabel?: string;
  branch: string;
  issueDate: string | null;
  validUntil?: string | null;
  customer: DocumentParty;
  vehicle?: DocumentVehicle | null;
  lines: DocumentLine[];
  /** One entry per currency. Never summed across currencies. */
  totals: DocumentTotal[];
  notes?: string;
  terms?: string;
  /** Draft/unconfirmed disclaimer printed above the signatures. */
  disclaimer?: string;
  signatures?: Array<{ label: string }>;
  footer?: string;
}

/** Fixed labels for the generic template. Templates may replace this table. */
export const documentLabels = {
  en: {
    number: "No.", branch: "Branch", issued: "Issue date", validUntil: "Valid until", item: "Item", qty: "Qty", unit: "Unit price",
    discount: "Discount", tax: "Tax", amount: "Amount", subtotal: "Subtotal", total: "Total", paid: "Paid", balance: "Balance",
    notes: "Notes", terms: "Terms", print: "Print / save as PDF", plate: "Plate", signature: "Signature",
  },
  ar: {
    number: "رقم", branch: "الفرع", issued: "تاريخ الإصدار", validUntil: "صالح حتى", item: "البند", qty: "الكمية", unit: "سعر الوحدة",
    discount: "الخصم", tax: "الضريبة", amount: "المبلغ", subtotal: "الإجمالي قبل الضريبة", total: "الإجمالي", paid: "المدفوع", balance: "المتبقي",
    notes: "ملاحظات", terms: "الشروط", print: "طباعة / حفظ PDF", plate: "اللوحة", signature: "التوقيع",
  },
} as const;
