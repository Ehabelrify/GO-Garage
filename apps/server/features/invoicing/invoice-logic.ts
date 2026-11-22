import { z } from "zod";
import { isSupportedCurrency } from "@garage/domain";

export const invoiceStatuses = ["draft", "issued", "partial", "paid", "void"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];
export const lineKinds = ["package", "service", "add-on", "transport", "fee", "other"] as const;
export type LineKind = (typeof lineKinds)[number];
export const paymentMethods = ["cash", "card", "transfer", "instapay", "other"] as const;

export interface LineInput {
  kind: LineKind;
  descriptionEn: string;
  descriptionAr: string;
  quantity: number;
  /** null = not priced yet. */
  unitMinor: number | null;
  discountMinor: number;
  /** null = tax not confirmed yet. */
  taxMinor: number | null;
}

export interface Totals {
  subtotalMinor: number | null;
  discountMinor: number;
  taxMinor: number | null;
  totalMinor: number | null;
}

export const grossMinor = (line: Pick<LineInput, "quantity" | "unitMinor">) =>
  line.unitMinor === null ? null : Math.round(line.quantity * line.unitMinor);

/** First line problem (discount larger than the line, unsafe amount) or null. */
export function lineProblem(line: LineInput): string | null {
  const gross = grossMinor(line);
  if (gross === null) return line.discountMinor > 0 ? "A discount needs a price on the line." : null;
  if (!Number.isSafeInteger(gross)) return "Line amount exceeds safe limits.";
  if (line.discountMinor > gross) return "Discount cannot exceed the line amount.";
  return null;
}

/** When the invoice has a tax rate it replaces per-line tax (tax = rate of the discounted line); otherwise per-line tax is kept. */
export function applyTaxRate(lines: LineInput[], ratePercent: number | null): LineInput[] {
  if (ratePercent === null) return lines;
  return lines.map((line) => {
    const gross = grossMinor(line);
    return { ...line, taxMinor: gross === null ? null : Math.round(((gross - line.discountMinor) * ratePercent) / 100) };
  });
}

/** Totals in ONE currency. Any unpriced line or unconfirmed tax makes the dependent total null (never guessed). */
export function computeTotals(lines: LineInput[]): Totals {
  const discountMinor = lines.reduce((sum, line) => sum + line.discountMinor, 0);
  const grosses = lines.map(grossMinor);
  const subtotalMinor = lines.length > 0 && grosses.every((g) => g !== null) ? (grosses as number[]).reduce((a, b) => a + b, 0) : null;
  const taxMinor = lines.length > 0 && lines.every((line) => line.taxMinor !== null) ? lines.reduce((sum, line) => sum + (line.taxMinor ?? 0), 0) : null;
  const totalMinor = subtotalMinor !== null && taxMinor !== null ? subtotalMinor - discountMinor + taxMinor : null;
  return { subtotalMinor, discountMinor, taxMinor, totalMinor };
}

export const lineAmountMinor = (line: LineInput): number | null => {
  const gross = grossMinor(line);
  return gross === null ? null : gross - line.discountMinor + (line.taxMinor ?? 0);
};

export function paymentStatus(totalMinor: number, paidMinor: number): "issued" | "partial" | "paid" {
  if (paidMinor >= totalMinor && totalMinor > 0) return "paid";
  return paidMinor > 0 ? "partial" : "issued";
}

const transitions: Record<string, readonly InvoiceStatus[]> = {
  issue: ["draft"],
  edit: ["draft"],
  payment: ["issued", "partial"],
  void: ["draft", "issued"],
  reverse: ["issued", "partial", "paid"],
  refund: ["partial", "paid"],
};
export const canTransition = (action: keyof typeof transitions, from: string) => (transitions[action] as readonly string[]).includes(from);

/** `INV-<branch code>-<year>-<5 digit sequence>`; branch code = branch id without a "branch-" prefix, alphanumerics only. */
export function formatInvoiceNumber(branchId: string, year: number, sequence: number): string {
  const code = branchId.replace(/^branch-/i, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "X";
  return `INV-${code}-${year}-${String(sequence).padStart(5, "0")}`;
}

const text = (max: number) => z.string().trim().max(max);
export const lineSchema = z.object({
  kind: z.enum(lineKinds),
  descriptionEn: z.string().trim().min(1).max(240),
  descriptionAr: text(240).default(""),
  quantity: z.number().positive().max(100000),
  unitMinor: z.number().int().min(0).max(1_000_000_000_000).nullable(),
  discountMinor: z.number().int().min(0).max(1_000_000_000_000).default(0),
  taxMinor: z.number().int().min(0).max(1_000_000_000_000).nullable().default(null),
}).strict();

export const draftUpdateSchema = z.object({
  expectedRevision: z.number().int().positive(),
  currency: z.string().refine(isSupportedCurrency, "Unsupported currency").optional(),
  taxRatePercent: z.number().min(0).max(100).nullable(),
  notes: text(2000).default(""),
  terms: text(2000).default(""),
  lines: z.array(lineSchema).min(1).max(60),
}).strict();

export const generateSchema = z.object({ jobId: z.string().min(1).max(120).optional(), bookingId: z.string().min(1).max(120).optional() })
  .strict().refine((value) => Boolean(value.jobId) !== Boolean(value.bookingId), "Provide exactly one of jobId or bookingId.");
export const issueSchema = z.object({ expectedRevision: z.number().int().positive() }).strict();
export const voidSchema = z.object({ expectedRevision: z.number().int().positive(), reason: z.string().trim().min(3).max(500) }).strict();
export const paymentSchema = z.object({
  expectedRevision: z.number().int().positive(),
  amountMinor: z.number().int().positive().max(1_000_000_000_000),
  method: z.enum(paymentMethods),
  reference: z.string().trim().min(1).max(120),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

const evidenceRef = z.string().trim().regex(/^private:[A-Za-z0-9/_-]+$/, "Evidence must be a protected reference").max(200).optional();
const idempotencyKey = z.string().trim().min(1).max(120);
export const reverseSchema = z.object({ reason: z.string().trim().min(3).max(500), evidenceRef, idempotencyKey }).strict();
export const refundSchema = z.object({
  amountMinor: z.number().int().positive().max(1_000_000_000_000),
  reason: z.string().trim().min(3).max(500), evidenceRef, idempotencyKey,
}).strict();
export type ReverseInput = z.infer<typeof reverseSchema>;
export type RefundInput = z.infer<typeof refundSchema>;

export type DraftUpdate = z.infer<typeof draftUpdateSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;

export interface InvoiceRow {
  id: string; branch_id: string; customer_id: string; vehicle_id: string; booking_id: string | null; job_id: string | null; quote_id: string | null; warranty_id: string | null;
  source: string; number: string | null; status: InvoiceStatus; currency: string; tax_rate_percent: string | null;
  subtotal_minor: string | null; discount_minor: string; tax_minor: string | null; total_minor: string | null; paid_minor: string;
  issue_date: string | null; notes: string; terms: string; revision: number; created_at: Date; updated_at: Date; issued_at: Date | null; void_reason: string | null;
  customer_name?: string; plate?: string; kind?: string; parent_invoice_id?: string | null;
}
export interface LineRow {
  id: string; position: number; kind: LineKind; description_en: string; description_ar: string; quantity: string;
  unit_minor: string | null; discount_minor: string; tax_minor: string | null;
}

const num = (value: string | null): number | null => (value === null || value === undefined ? null : Number(value));

export function toLine(row: LineRow) {
  const input: LineInput = {
    kind: row.kind, descriptionEn: row.description_en, descriptionAr: row.description_ar, quantity: Number(row.quantity),
    unitMinor: num(row.unit_minor), discountMinor: Number(row.discount_minor), taxMinor: num(row.tax_minor),
  };
  return { id: row.id, position: row.position, ...input, amountMinor: lineAmountMinor(input) };
}

export function toInvoice(row: InvoiceRow) {
  const total = num(row.total_minor);
  const paid = Number(row.paid_minor);
  return {
    id: row.id, number: row.number, status: row.status, source: row.source, currency: row.currency, branchId: row.branch_id,
    customerId: row.customer_id, customerName: row.customer_name ?? null, vehicleId: row.vehicle_id, plate: row.plate ?? null,
    bookingId: row.booking_id, jobId: row.job_id, quoteId: row.quote_id, warrantyId: row.warranty_id,
    taxRatePercent: row.tax_rate_percent === null ? null : Number(row.tax_rate_percent),
    subtotalMinor: num(row.subtotal_minor), discountMinor: Number(row.discount_minor), taxMinor: num(row.tax_minor), totalMinor: total,
    paidMinor: paid, balanceMinor: total === null ? null : total - paid,
    issueDate: row.issue_date, notes: row.notes, terms: row.terms, revision: row.revision,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), issuedAt: row.issued_at ? row.issued_at.toISOString() : null,
    voidReason: row.void_reason, kind: row.kind ?? "standard", parentInvoiceId: row.parent_invoice_id ?? null,
  };
}
