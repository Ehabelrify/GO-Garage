import { describe, expect, it } from "vitest";
import { canTransition, createSchema, customerView, decisionSchema, toRequest, validateDecision, type RequestRow } from "./special-requests-logic";

const base = { customerId: "c1", vehicleId: "v1", title: "Roof film", description: "Matte film", requestedFrom: "2026-12-01" };
const row: RequestRow = {
  id: "sr-1", customer_id: "c1", vehicle_id: "v1", branch_id: "branch-a", source: "staff", title: "T", description: "D", requested_from: "2026-12-01", requested_to: null,
  preferred_time_note: "", budget_note: "", status: "accepted", reply_decision: "accepted", reply_message: "ok", quoted_price_minor: "480000", quoted_currency: "EGP",
  duration_days: 3, duration_note: "", available_from: "2026-12-05", offer_valid_until: null, owner_notes: "secret margin", decided_by: "owner-1", decided_at: new Date("2026-11-20T10:00:00Z"),
  quote_id: null, created_by: "rec-1", revision: 4, created_at: new Date("2026-11-19T10:00:00Z"), updated_at: new Date("2026-11-20T10:00:00Z"),
};

describe("create schema", () => {
  it("requires vehicle, description and a date, and rejects unknown keys", () => {
    expect(createSchema.safeParse(base).success).toBe(true);
    expect(createSchema.safeParse({ ...base, vehicleId: "" }).success).toBe(false);
    expect(createSchema.safeParse({ ...base, description: "  " }).success).toBe(false);
    expect(createSchema.safeParse({ ...base, requestedFrom: undefined }).success).toBe(false);
    expect(createSchema.safeParse({ ...base, source: "customer-app" }).success).toBe(false);
  });
  it("rejects an inverted date range and malformed dates", () => {
    expect(createSchema.safeParse({ ...base, requestedTo: "2026-11-01" }).success).toBe(false);
    expect(createSchema.safeParse({ ...base, requestedTo: "2026-12-05" }).success).toBe(true);
    expect(createSchema.safeParse({ ...base, requestedFrom: "tomorrow" }).success).toBe(false);
  });
});

describe("decision rules", () => {
  const decision = (extra: Record<string, unknown>) => decisionSchema.parse({ expectedRevision: 1, ...extra });
  it("accept needs price, currency, duration and availability", () => {
    expect(validateDecision(decision({ decision: "accepted" }))).toEqual(["quotedPriceMinor", "quotedCurrency", "durationDays", "availableFrom"]);
    expect(validateDecision(decision({ decision: "accepted", quotedPriceMinor: 100, quotedCurrency: "SAR", durationDays: 2, availableFrom: "2026-12-01" }))).toEqual([]);
    expect(validateDecision(decision({ decision: "accepted", quotedPriceMinor: 100, quotedCurrency: "EGP", durationDays: 2, availableFrom: "2026-12-05", offerValidUntil: "2026-12-01" }))).toEqual(["offerValidUntil"]);
  });
  it("decline and needs-info need a message", () => {
    expect(validateDecision(decision({ decision: "declined" }))).toEqual(["message"]);
    expect(validateDecision(decision({ decision: "needs-info", message: "Which colour?" }))).toEqual([]);
  });
  it("rejects bad currency codes and negative prices", () => {
    expect(decisionSchema.safeParse({ expectedRevision: 1, decision: "accepted", quotedCurrency: "egp" }).success).toBe(false);
    expect(decisionSchema.safeParse({ expectedRevision: 1, decision: "accepted", quotedPriceMinor: -1 }).success).toBe(false);
  });
  it("limits transitions by status", () => {
    expect(canTransition("review-start", "new")).toBe(true);
    expect(canTransition("review-start", "accepted")).toBe(false);
    expect(canTransition("decide", "declined")).toBe(false);
    expect(canTransition("info", "needs-info")).toBe(true);
    expect(canTransition("close", "closed")).toBe(false);
  });
});

describe("projections", () => {
  it("shows owner notes only to reviewers", () => {
    expect(toRequest(row, true)).toMatchObject({ ownerNotes: "secret margin", decidedBy: "owner-1" });
    expect(toRequest(row, false)).not.toHaveProperty("ownerNotes");
    expect(toRequest(row, false).reply?.quotedPrice).toEqual({ minor: 480000, currency: "EGP" });
  });
  it("customer view never carries internal fields", () => {
    const view = customerView(row) as Record<string, unknown>;
    for (const key of ["ownerNotes", "decidedBy", "createdBy", "revision", "branchId", "customerId"]) expect(view).not.toHaveProperty(key);
    expect(JSON.stringify(view)).not.toContain("secret");
  });
});
