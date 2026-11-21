import { describe, expect, it } from "vitest";
import { applyTaxRate, canTransition, computeTotals, draftUpdateSchema, formatInvoiceNumber, generateSchema, lineProblem, paymentStatus, type LineInput } from "./invoice-logic";

const line = (over: Partial<LineInput> = {}): LineInput => ({ kind: "service", descriptionEn: "Tint", descriptionAr: "", quantity: 1, unitMinor: 100000, discountMinor: 0, taxMinor: 0, ...over });

describe("invoice totals", () => {
  it("sums priced lines with discount and tax", () => {
    expect(computeTotals([line({ quantity: 2, unitMinor: 50000, discountMinor: 10000, taxMinor: 12600 }), line({ unitMinor: 20000, taxMinor: 2800 })]))
      .toEqual({ subtotalMinor: 120000, discountMinor: 10000, taxMinor: 15400, totalMinor: 125400 });
  });
  it("never guesses: unpriced lines or unconfirmed tax leave totals null", () => {
    expect(computeTotals([line({ unitMinor: null })]).totalMinor).toBeNull();
    expect(computeTotals([line({ taxMinor: null })])).toMatchObject({ subtotalMinor: 100000, taxMinor: null, totalMinor: null });
    expect(computeTotals([]).totalMinor).toBeNull();
  });
  it("a tax rate replaces per-line tax on the discounted amount", () => {
    const [l] = applyTaxRate([line({ discountMinor: 10000, taxMinor: null })], 14);
    expect(l.taxMinor).toBe(12600);
    expect(applyTaxRate([line({ taxMinor: 5 })], null)[0].taxMinor).toBe(5);
  });
  it("rejects a discount above the line amount", () => {
    expect(lineProblem(line({ discountMinor: 100001 }))).toMatch(/Discount/);
    expect(lineProblem(line({ unitMinor: null, discountMinor: 1 }))).toMatch(/price/);
    expect(lineProblem(line())).toBeNull();
  });
});

describe("invoice rules", () => {
  it("numbers per branch and year with zero padding", () => {
    expect(formatInvoiceNumber("branch-a", 2026, 7)).toBe("INV-A-2026-00007");
    expect(formatInvoiceNumber("seed-branch-b", 2027, 12345)).toBe("INV-SEEDBRANCHB-2027-12345");
  });
  it("derives payment status", () => {
    expect(paymentStatus(1000, 0)).toBe("issued");
    expect(paymentStatus(1000, 400)).toBe("partial");
    expect(paymentStatus(1000, 1000)).toBe("paid");
  });
  it("limits transitions", () => {
    expect(canTransition("edit", "draft")).toBe(true);
    expect(canTransition("edit", "issued")).toBe(false);
    expect(canTransition("issue", "issued")).toBe(false);
    expect(canTransition("payment", "partial")).toBe(true);
    expect(canTransition("payment", "void")).toBe(false);
    expect(canTransition("void", "paid")).toBe(false);
    expect(canTransition("void", "draft")).toBe(true);
  });
  it("validates inputs", () => {
    expect(generateSchema.safeParse({ jobId: "j1" }).success).toBe(true);
    expect(generateSchema.safeParse({}).success).toBe(false);
    expect(generateSchema.safeParse({ jobId: "j", bookingId: "b" }).success).toBe(false);
    const base = { expectedRevision: 1, taxRatePercent: null, notes: "", terms: "", lines: [{ kind: "service", descriptionEn: "x", quantity: 1, unitMinor: 5, discountMinor: 0, taxMinor: null }] };
    expect(draftUpdateSchema.safeParse(base).success).toBe(true);
    expect(draftUpdateSchema.safeParse({ ...base, currency: "EUR" }).success).toBe(false);
    expect(draftUpdateSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
    expect(draftUpdateSchema.safeParse({ ...base, lines: [{ ...base.lines[0], unitMinor: 1.5 }] }).success).toBe(false);
  });
});
