import { describe, expect, it } from "vitest";
import {
  actionName, activeFilters, actorName, auditQuery, countTiles, emptyFilter, moneyTiles, parseAuditEvent, parseSummary, recordTarget, summaryAsText, type DailySummary,
} from "./audit-logic";

const base = { id: "job-event:1", occurredAt: "2026-11-22T10:00:00.000Z", kind: "job", action: "stage-delivered", actor: { id: "u1", name: "Mona", role: "owner" },
  entity: { type: "job", id: "j1", label: "ABC 123" }, branch: { id: "b1", nameEn: "Maadi", nameAr: "المعادي" }, detail: "", before: "ready", after: "delivered", extra: null };

describe("audit logic", () => {
  it("labels actions in both languages and humanises unknown ones", () => {
    expect(actionName("stage-delivered", "ar")).toBe("تم التسليم");
    expect(actionName("status-in-custody", "en")).toBe("In custody");
  });
  it("never shows a raw id for the person", () => {
    const event = parseAuditEvent({ ...base, actor: { id: "user_2abc", name: null, role: null } })!;
    expect(actorName(event, "en")).toBe("System");
    expect(actorName({ ...event, actor: { id: "user_2abc", name: null, role: "technician" } }, "ar")).toBe("فني");
  });
  it("links record types the app can open and skips those it cannot", () => {
    expect(recordTarget(base)).toMatchObject({ type: "job", id: "j1" });
    expect(recordTarget({ ...base, entity: { type: "setting", id: "tint-hours", label: null } })).toBeNull();
    expect(recordTarget({ ...base, entity: { type: "commercial-policy", id: "p1", label: null } })).toBeNull();
  });
  it("builds a query without empty values and keeps the same filters for the export", () => {
    expect(auditQuery({ ...emptyFilter, from: "2026-11-01", kind: "quote", q: " tint " }, "ar", { limit: "50" })).toBe("from=2026-11-01&kind=quote&q=tint&lang=ar&limit=50");
    expect(activeFilters(emptyFilter)).toBe(0);
    expect(activeFilters({ ...emptyFilter, actor: "u1", q: "x" })).toBe(2);
  });
  it("drops malformed rows instead of crashing", () => {
    expect(parseAuditEvent(null)).toBeNull();
    expect(parseAuditEvent({ id: "x" })).toBeNull();
    expect(parseAuditEvent({ ...base, extra: { amountMinor: 5 } })?.extra).toEqual({ amountMinor: 5 });
  });
});

describe("summary text", () => {
  const summary: DailySummary = {
    date: "2026-11-22", previousDate: "2026-11-21", branchId: null, timezone: "Africa/Cairo",
    counts: { bookingsCreated: { value: 7, previous: 5, delta: 2, basis: "exact" }, bookingsCancelled: { value: 1, previous: 3, delta: -2, basis: "approximate" }, pendingReviews: { value: 31, previous: null, delta: null, basis: "snapshot" } },
    money: { collections: [{ currency: "EGP", count: 2, amountMinor: 150050, previousAmountMinor: 0, deltaMinor: 150050 }, { currency: "USD", count: 1, amountMinor: 5000, previousAmountMinor: 0, deltaMinor: 5000 }], refunds: [] },
  };
  it("lists each currency on its own line and signs deltas with a real minus", () => {
    const text = summaryAsText(summary, "en", "All branches");
    expect(text).toContain("Bookings created: 7 (+2 vs yesterday)");
    expect(text).toContain(`Bookings cancelled: 1 (${String.fromCodePoint(0x2212)}2 vs yesterday) *`);
    expect(text).toContain("Bookings awaiting review (now): 31");
    expect(text).toContain("Collections (money events): EGP 1,500.50 (2)");
    expect(text).toContain("Collections (money events): USD 50.00 (1)");
    expect(text).toContain("Refunds (money events): 0");
    expect(text).toMatch(/never added across currencies/);
  });
  it("renders Arabic copy", () => {
    expect(summaryAsText(summary, "ar", "كل الفروع")).toContain("ملخص اليوم 2026-11-22");
  });
  it("parses a summary and refuses a malformed one; tiles cover every counted metric once", () => {
    expect(parseSummary({ date: "2026-11-22", counts: {}, money: {} })).not.toBeNull();
    expect(parseSummary({ date: "2026-11-22" })).toBeNull();
    expect(new Set(countTiles.map((tile) => tile.key)).size).toBe(countTiles.length);
    expect(moneyTiles.map((tile) => tile.key)).toContain("quotesAcceptedValue");
  });
});

