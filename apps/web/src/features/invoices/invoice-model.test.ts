import { describe, expect, it } from "vitest";
import { buildInvoiceDocument, parseMajor, toMajorText } from "./invoice-model";
import type { Invoice, InvoiceLine } from "./invoices-api";

const invoice = { id: "i", number: "INV-A-2026-00001", status: "issued", currency: "SAR", plate: "ABC 123", subtotalMinor: 1000, discountMinor: 100, taxMinor: 126, totalMinor: 1026, paidMinor: 26, balanceMinor: 1000, issueDate: "2026-11-21", notes: "", terms: "", taxRatePercent: 14 } as Invoice;
const lines = [{ id: "l", position: 0, kind: "service", descriptionEn: "Tint", descriptionAr: "تظليل", quantity: 1, unitMinor: 1000, discountMinor: 100, taxMinor: 126, amountMinor: 1026 }] as InvoiceLine[];

describe("invoice document model", () => {
  it("keeps one currency and the invoice language", () => {
    const en = buildInvoiceDocument({ invoice, lines, lang: "en", branchLabel: "Nasr City", customerName: "N" });
    expect(en.totals).toHaveLength(1);
    expect(en.totals[0].currency).toBe("SAR");
    expect(en.lines[0].description).toBe("Tint");
    expect(en.lines.every((l) => l.currency === "SAR")).toBe(true);
    expect(en.disclaimer).toBeUndefined();
    const ar = buildInvoiceDocument({ invoice, lines, lang: "ar", branchLabel: "x", customerName: "N" });
    expect(ar.lines[0].description).toBe("تظليل");
  });
  it("marks drafts and hides payment rows", () => {
    const draft = buildInvoiceDocument({ invoice: { ...invoice, status: "draft", number: null }, lines, lang: "en", branchLabel: "x", customerName: "N" });
    expect(draft.statusLabel).toBe("Draft");
    expect(draft.totals[0].paidMinor).toBeUndefined();
    expect(draft.disclaimer).toBeTruthy();
  });
  it("parses major amounts", () => {
    expect(parseMajor("1,250.5")).toBe(125050);
    expect(parseMajor("")).toBeNull();
    expect(parseMajor("abc")).toBeNaN();
    expect(toMajorText(125050)).toBe("1250.5");
  });
});
