import { describe, expect, it, vi } from "vitest";

const queries: { sql: string; params: unknown[] }[] = [];
const value = (metric: string) => ({ metric, currency: "EGP", minorUnitExponent: 2, reportingTimezone: "UTC", sourceKinds: [], requiredSourceKinds: [], emptyPeriod: "complete" });
const client = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.includes("v.value->>'metric'=$1")) return { rows: [{ policy_id: `p-${params[0]}`, version: 1 }], rowCount: 1 };
    if (sql.includes("v.policy_id=$1 AND v.version=$2")) return { rows: [{ policy_id: params[0], version: 1, value: value(String(params[0]).slice(2)) }], rowCount: 1 };
    if (sql.includes("finance_definition_attestations") && sql.includes("SELECT 1")) return { rows: [{}], rowCount: 1 };
    if (sql.includes("DISTINCT")) return { rows: [], rowCount: 0 };
    return { rows: [{}], rowCount: 1 };
  }),
};
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query: vi.fn() },
  withTransaction: async (fn: (c: typeof client) => unknown) => fn(client),
}));
vi.mock("./finance-source-adapters", () => ({
  acceptedQuoteSources: async () => [],
  acceptedQuoteSourcesAsOf: async () => [],
  moneyEventSources: async () => [],
  moneyEventSourcesAsOf: async () => [],
}));
import { getFinancialReport } from "./finance-service";

describe("finance report definition lookups (P2T-025)", () => {
  it("looks up each metric definition at most once for a multi-day daily report", async () => {
    const actor = { userId: "u", role: "owner", branchIds: [] } as never;
    const report = await getFinancialReport(actor, { from: "2026-01-01", to: "2026-03-31", branchId: "all", groupBy: "day" } as never);
    expect(report.trends).toHaveLength(90);
    const lookups = queries.filter((q) => q.sql.includes("v.value->>'metric'=$1")).map((q) => q.params[0]);
    expect(new Set(lookups).size).toBe(lookups.length);
    expect(lookups.length).toBeLessThanOrEqual(8);
  });
});
