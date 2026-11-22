import { describe, expect, it } from "vitest";
import type { FinancialSourceRow } from "@garage/domain";
import { computeOutstanding } from "./outstanding";

const row = (over: Partial<FinancialSourceRow> & { minor: number; currency?: string; exp?: number }): FinancialSourceRow => ({
  id: over.id ?? "r", metricId: "outstanding", sourceKind: "x", sourceId: over.sourceId ?? "s", relatedQuoteId: over.relatedQuoteId ?? "q1",
  effectiveAt: "2026-11-01", branchId: "b1", detailPath: null, provenance: "recorded",
  amount: { minor: over.minor, currency: over.currency ?? "EGP", minorUnitExponent: over.exp ?? 2 },
});

describe("computeOutstanding (P2T-019)", () => {
  const quote = row({ sourceId: "quote-1", minor: 100_000 });
  it("subtracts same-currency collections and refunds", () => {
    const { rows } = computeOutstanding([quote], [row({ minor: 30_000 }), row({ minor: -5_000 })], "outstanding");
    expect(rows).toHaveLength(1);
    expect(rows[0].amount.minor).toBe(75_000);
    expect(rows[0].amount.currency).toBe("EGP");
  });
  it("does not let a USD collection reduce an EGP receivable and reports it as unreconciled", () => {
    const usd = row({ id: "usd", minor: 90_000, currency: "USD" });
    const { rows, unreconciled } = computeOutstanding([quote], [usd], "outstanding");
    expect(rows[0].amount.minor).toBe(100_000);
    expect(unreconciled.map((event) => event.id)).toEqual(["usd"]);
  });
  it("does not mix minor-unit exponents of the same currency", () => {
    const wrongExponent = row({ id: "exp", minor: 500, exp: 0 });
    expect(computeOutstanding([quote], [wrongExponent], "outstanding").rows[0].amount.minor).toBe(100_000);
  });
  it("drops fully paid quotes, never goes negative, and ignores other quotes' events", () => {
    expect(computeOutstanding([quote], [row({ minor: 150_000 })], "outstanding").rows).toHaveLength(0);
    expect(computeOutstanding([quote], [row({ minor: 10_000, relatedQuoteId: "other" })], "outstanding").rows[0].amount.minor).toBe(100_000);
  });
});
