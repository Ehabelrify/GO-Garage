import type { FinancialSourceRow } from "@garage/domain";

/** True when two amounts share a currency and minor-unit exponent, so their minor units can be added or subtracted. */
export const sameDenomination = (a: FinancialSourceRow["amount"], b: FinancialSourceRow["amount"]): boolean =>
  a.currency === b.currency && a.minorUnitExponent === b.minorUnitExponent;

/**
 * Outstanding per accepted quote (P2T-019). Collections and refunds reduce a quote only when they use the quote's own
 * currency and exponent; any other event is left out of the arithmetic and returned in `unreconciled` so it stays visible
 * instead of silently altering the balance.
 */
export function computeOutstanding(quoted: FinancialSourceRow[], events: FinancialSourceRow[], metricId: FinancialSourceRow["metricId"]) {
  const unreconciled: FinancialSourceRow[] = [];
  const rows = quoted.map((quote) => {
    let applied = 0;
    for (const event of events) {
      if (event.relatedQuoteId !== quote.relatedQuoteId) continue;
      if (!sameDenomination(quote.amount, event.amount)) { unreconciled.push(event); continue; }
      applied += event.amount.minor;
    }
    return {
      ...quote,
      id: `outstanding:${quote.sourceId}`,
      metricId,
      sourceKind: "calculated-outstanding",
      amount: { ...quote.amount, minor: Math.max(0, quote.amount.minor - applied) },
      provenance: "calculated" as const,
    };
  }).filter((row) => row.amount.minor > 0);
  return { rows, unreconciled };
}
