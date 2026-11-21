import { describe, expect, it } from "vitest";
import type { MoneyEvent } from "@garage/domain";
import {
  canViewFinance, canWriteFinance, definitionMetric, emptyEventFilter, filterEvents, metricGroups, periodRange, reasonLabel, reportBranchOptions,
  signedMinor, toEvidenceRef, validateMoneyEvent, type MoneyEventDraft,
} from "./finance-logic";

const event = (over: Partial<MoneyEvent>): MoneyEvent => ({
  id: "e1", kind: "collection", amount: { minor: 100, currency: "EGP", minorUnitExponent: 2 }, effectiveAt: "2026-11-10T10:00:00Z", branchId: "b1",
  customerId: null, jobId: null, quoteId: null, reservationId: null, sourceMethod: "cash", sourceReference: "R-1", definition: { id: "finance-definition:collections", version: 1 },
  reason: "Deposit", reversed: false, createdAt: "2026-11-10T10:00:00Z", ...over,
});

describe("finance capabilities", () => {
  it("owner and branch manager can view; receptionist cannot unless overridden", () => {
    expect(canViewFinance({ role: "owner", branchIds: [] })).toBe(true);
    expect(canViewFinance({ role: "branch-manager", branchIds: ["b1"] })).toBe(true);
    expect(canViewFinance({ role: "branch-manager", branchIds: ["b1"], permissions: { "finance.view": false } })).toBe(false);
    expect(canViewFinance({ role: "receptionist", branchIds: ["b1"] })).toBe(false);
    expect(canViewFinance({ role: "receptionist", branchIds: ["b1"], permissions: { "finance.view": true } })).toBe(true);
    expect(canViewFinance({ role: "branch-manager", branchIds: [], isDemo: true, permissions: { "finance.view": false } })).toBe(true);
    expect(canViewFinance(null)).toBe(false);
  });
  it("only the owner writes", () => {
    expect(canWriteFinance({ role: "owner", branchIds: [] })).toBe(true);
    expect(canWriteFinance({ role: "branch-manager", branchIds: [] })).toBe(false);
  });
  it("non-owners never get the all-branches option", () => {
    const branches = [{ id: "b1" }, { id: "b2" }];
    expect(reportBranchOptions({ role: "owner", branchIds: [] }, branches)).toEqual({ all: true, branches });
    expect(reportBranchOptions({ role: "branch-manager", branchIds: ["b2"] }, branches)).toEqual({ all: false, branches: [{ id: "b2" }] });
  });
});

describe("finance definitions of truth", () => {
  it("keeps quotes and drafts in a separate pipeline group, not result", () => {
    const pipeline = metricGroups.find((g) => g.id === "pipeline")!;
    expect(pipeline.metrics).toEqual(["quoted-value", "draft-value"]);
    expect(metricGroups.filter((g) => g.id !== "pipeline").flatMap((g) => g.metrics)).not.toContain("quoted-value");
  });
  it("maps policy ids to metrics", () => {
    expect(definitionMetric("finance-definition:collections")).toBe("collections");
    expect(definitionMetric("quote-policy")).toBeNull();
  });
  it("signs outflows negative", () => {
    expect(signedMinor("refund", 500)).toBe(-500);
    expect(signedMinor("collection", 500)).toBe(500);
  });
  it("translates known reasons and passes unknown ones through", () => {
    expect(reasonLabel("Approved and attested finance definition is not configured.", "en")).toMatch(/No approved/);
    expect(reasonLabel("Missing required sources: accepted-quote, collection", "en")).toBe("Missing sources: accepted quote, collection");
    expect(reasonLabel("Something else", "ar")).toBe("Something else");
  });
});

describe("evidence and validation", () => {
  it("normalises evidence into the private: format the server requires", () => {
    expect(toEvidenceRef(" receipt 142 ")).toBe("private:receipt-142");
    expect(toEvidenceRef("private:finance/a_b")).toBe("private:finance/a_b");
    expect(toEvidenceRef("  ")).toBe("");
    expect(toEvidenceRef("***")).toBe("");
  });
  const valid: MoneyEventDraft = { kind: "collection", amount: "1,250.50", currency: "EGP", effectiveAt: "2026-11-10T10:00", branchId: "b1", sourceMethod: "cash", sourceReference: "R-1", definitionVersion: 2, reason: "Deposit", evidence: "receipt-1" };
  it("accepts a complete draft", () => expect(validateMoneyEvent(valid, "en")).toEqual({}));
  it("flags every missing field", () => {
    const errors = validateMoneyEvent({ ...valid, amount: "0", branchId: "", sourceReference: " ", definitionVersion: null, reason: "", evidence: "" }, "en");
    expect(Object.keys(errors).sort()).toEqual(["amount", "branchId", "definitionVersion", "evidence", "reason", "sourceReference"]);
  });
});

describe("filters and periods", () => {
  const list = [event({}), event({ id: "e2", kind: "refund", branchId: "b2", reversed: true, effectiveAt: "2026-10-01T00:00:00Z", sourceReference: "X-9" })];
  it("filters by branch, kind, status, dates and text", () => {
    expect(filterEvents(list, { ...emptyEventFilter, branchId: "b2" }).map((e) => e.id)).toEqual(["e2"]);
    expect(filterEvents(list, { ...emptyEventFilter, kind: "collection" }).map((e) => e.id)).toEqual(["e1"]);
    expect(filterEvents(list, { ...emptyEventFilter, status: "reversed" }).map((e) => e.id)).toEqual(["e2"]);
    expect(filterEvents(list, { ...emptyEventFilter, from: "2026-11-01" }).map((e) => e.id)).toEqual(["e1"]);
    expect(filterEvents(list, { ...emptyEventFilter, to: "2026-10-31" }).map((e) => e.id)).toEqual(["e2"]);
    expect(filterEvents(list, { ...emptyEventFilter, query: "x-9" }).map((e) => e.id)).toEqual(["e2"]);
  });
  it("computes period ranges", () => {
    const now = new Date(2026, 10, 21);
    expect(periodRange("month", now)).toEqual({ from: "2026-11-01", to: "2026-11-21", groupBy: "day" });
    expect(periodRange("last-month", now)).toEqual({ from: "2026-10-01", to: "2026-10-31", groupBy: "day" });
    expect(periodRange("ytd", now)).toEqual({ from: "2026-01-01", to: "2026-11-21", groupBy: "month" });
  });
});
