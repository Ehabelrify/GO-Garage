import { describe, expect, it } from "vitest";
import type { QuoteRow } from "./quote-logic";
import { buildQuoteDocument, quoteNumber, totalsByCurrency } from "./quote-document";
import { sourceStep } from "./quote-generate-api";
import type { Lookups } from "./lookups";

const lookups = {
  customer: () => ({ id: "c", name: "Sara", phone: "0100" }), vehicle: () => ({ vehicle: { id: "v", plate: "ABC 123", makeModel: "Civic" }, customer: {} }),
  serviceName: (id?: string | null) => (id === "tint" ? "Tint" : "Full PPF"), branchName: () => "Maadi",
} as unknown as Lookups;
const money = (minor: number, currency = "EGP") => ({ minor, currency });
const quote = {
  ref: { quoteId: "qg-abcdef1234567890", revision: 2 }, state: "draft", digest: "d", total: null, validThrough: "2026-12-05",
  followup: {},
  input: {
    branchId: "b1", customerId: "c", vehicle: { vehicleId: "v", model: "Civic", categoryId: "sedan" },
    scope: [
      { id: "s1", serviceId: "full-ppf", gradeVersion: null, areas: [], roof: "included", addOnIds: ["tint"], exclusions: [], quantity: 1 },
      { id: "transport:t1", serviceId: "full-ppf", gradeVersion: null, areas: ["Transport: pickup / driver"], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1 },
    ],
    lines: [
      { id: "l1", scopeItemId: "s1", quantity: 1, unitPrice: money(1000000), discount: money(0), tax: money(140000) },
      { id: "l2", scopeItemId: "transport:t1", quantity: 1, unitPrice: money(35000), discount: money(0), tax: null },
    ],
  },
} as unknown as QuoteRow;

describe("quote document", () => {
  it("assembles number, parties, lines and totals", () => {
    const doc = buildQuoteDocument(quote, lookups, "en", "2026-11-21");
    expect(doc.number).toBe("QT-34567890-R2".replace("34567890", "34567890"));
    expect(doc.branch).toBe("Maadi");
    expect(doc.lines[0].details).toEqual(["Roof included", "+ Tint"]);
    expect(doc.lines[1]).toMatchObject({ kind: "transport", description: "Transport fee", details: ["pickup / driver"] });
    expect(doc.totals).toEqual([{ currency: "EGP", subtotal: 1035000, discount: 0, tax: 140000, total: 1175000 }]);
  });
  it("never sums different currencies together", () => {
    const totals = totalsByCurrency([
      { unit: 100, quantity: 2, discount: 0, tax: 10, currency: "EGP" }, { unit: 50, quantity: 1, discount: 5, tax: 0, currency: "SAR" },
    ]);
    expect(totals).toEqual([{ currency: "EGP", subtotal: 200, discount: 0, tax: 10, total: 210 }, { currency: "SAR", subtotal: 50, discount: 5, tax: 0, total: 45 }]);
  });
  it("makes a stable document number", () => {
    expect(quoteNumber("abc-123", 1)).toBe("QT-ABC123-R1");
  });
});

describe("create-quote source step", () => {
  it("opens blank with no source, generates directly with one, asks with several", () => {
    const one = { key: "k", kind: "booking", id: "1", date: "2026-01-01", vehicleId: "v", serviceId: "s", title: null, status: "x", quoteId: null } as const;
    expect(sourceStep([])).toBe("blank");
    expect(sourceStep([one])).toBe("single");
    expect(sourceStep([one, one])).toBe("pick");
  });
});
