import type { PolicyRef } from "./commercial-policy";

export type MoneyEventKind = "collection" | "refund" | "direct-cost" | "overhead" | "recognized-revenue";
export type FinancialMetricId = "quoted-value" | "draft-value" | "collections" | "outstanding" | "direct-cost" | "recognized-revenue" | "gross-profit" | "net-profit";
export type ReportFilter = { branchId: string | "all"; from: string; to: string; groupBy: "day" | "week" | "month" };
export type SignedMoney = { minor: number; currency: string; minorUnitExponent: number };
export type MetricValue =
  | { state: "available"; amount: SignedMoney; definition: PolicyRef; sourceCount: number }
  | { state: "incomplete"; amount: SignedMoney; definition: PolicyRef; sourceCount: number; reasons: string[]; excludedSourceCount: number }
  | { state: "unavailable"; reasons: string[]; definition: PolicyRef | null };
export type FinancialSourceRow = { id: string; metricId: FinancialMetricId; sourceKind: string; sourceId: string; relatedQuoteId: string | null; effectiveAt: string; branchId: string; amount: SignedMoney; detailPath: string | null; provenance: "recorded" | "accepted" | "calculated" };
export type MetricComparison =
  | { state:"available"; delta:SignedMoney; percent:number|null; basis:"previous-equal-period"; definition:PolicyRef }
  | { state:"unavailable"; reasons:string[]; basis:"previous-equal-period" };
export type FinancialReport = { filter: ReportFilter; generatedAt: string; metrics: Record<FinancialMetricId,MetricValue>; comparisons:Record<FinancialMetricId,MetricComparison>; trends: Array<{ bucket: string; metrics: Partial<Record<FinancialMetricId,MetricValue>> }> };
export type MoneyEvent = { id:string;kind:MoneyEventKind;amount:SignedMoney;effectiveAt:string;branchId:string;customerId:string|null;jobId:string|null;quoteId:string|null;reservationId:string|null;sourceMethod:string;sourceReference:string;definition:PolicyRef;reason:string;reversed:boolean;createdAt:string };
