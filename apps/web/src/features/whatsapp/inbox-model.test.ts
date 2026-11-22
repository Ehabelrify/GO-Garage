import { describe, expect, it } from "vitest";
import { consentView, eventTitle, filterConversations, inboxFiltersActive, resolveRelatedRecords } from "./inbox-model";

const items = [
  { customerLabel: "Mona", preview: "tint price", status: "open" as const, assignedUserId: "u1", unreadCount: 2 },
  { customerLabel: "Karim", preview: "ceramic", status: "pending" as const, assignedUserId: null, unreadCount: 0 },
  { customerLabel: "Salma", preview: "pickup time", status: "resolved" as const, assignedUserId: "u2", unreadCount: 0 },
];

describe("filterConversations", () => {
  const base = { status: "all" as const, scope: "all" as const, query: "" };
  it("returns everything with no filters", () => expect(filterConversations(items, base)).toHaveLength(3));
  it("filters by status", () => expect(filterConversations(items, { ...base, status: "pending" }).map((i) => i.customerLabel)).toEqual(["Karim"]));
  it("filters mine, unassigned and unread", () => {
    expect(filterConversations(items, { ...base, scope: "mine" }, "u1")).toHaveLength(1);
    expect(filterConversations(items, { ...base, scope: "mine" }, null)).toHaveLength(0);
    expect(filterConversations(items, { ...base, scope: "unassigned" })).toHaveLength(1);
    expect(filterConversations(items, { ...base, scope: "unread" })).toHaveLength(1);
  });
  it("searches label and preview", () => {
    expect(filterConversations(items, { ...base, query: " PICKUP " })).toHaveLength(1);
    expect(filterConversations(items, { ...base, query: "mon" })).toHaveLength(1);
  });
  it("detects active filters", () => {
    expect(inboxFiltersActive(base)).toBe(false);
    expect(inboxFiltersActive({ ...base, query: "x" })).toBe(true);
  });
});

describe("resolveRelatedRecords", () => {
  const state = {
    customers: [{ id: "c1", name: "Mona", phone: "", language: "en", vehicles: [{ id: "v1", plate: "ABC 123", makeModel: "Kia" }] }],
    bookings: [{ id: "b1", customerId: "c1", vehicleId: "v1", serviceId: "s", branchId: "branch-a", dropoffDate: "2026-11-12", dropoffTime: "10:00", expectedPickup: "", status: "confirmed", acceptedQuoteRef: { quoteId: "q1", revision: 2 } }],
  } as never;
  it("links booking to customer, vehicle and quote", () => {
    const related = resolveRelatedRecords(state, "b1");
    expect(related?.customer?.name).toBe("Mona");
    expect(related?.vehicle?.plate).toBe("ABC 123");
    expect(related?.quote).toEqual({ id: "q1", revision: 2 });
  });
  it("returns null for no or unknown booking", () => {
    expect(resolveRelatedRecords(state, null)).toBeNull();
    expect(resolveRelatedRecords(state, "nope")).toBeNull();
  });
});

describe("consentView", () => {
  it("maps statuses", () => {
    expect(consentView(null)).toBe("unknown");
    expect(consentView({ status: "missing" })).toBe("missing");
    expect(consentView({ status: "revoked" })).toBe("revoked");
    expect(consentView({ status: "granted", expiresAt: null })).toBe("granted");
    expect(consentView({ status: "granted", expiresAt: "2020-01-01T00:00:00Z" })).toBe("expired");
  });
});

describe("eventTitle", () => {
  it("translates known events and humanises unknown ones", () => {
    expect(eventTitle("handoff", "en")).toBe("Handed off to staff");
    expect(eventTitle("handoff", "ar")).toBe("تم التحويل لموظف");
    expect(eventTitle("booking_linked", "en")).toBe("Booking linked");
  });
});

import { groupMessagesByDay, localStamp, quickReplies } from "./inbox-model";
describe("inbox stamps and grouping", () => {
  it("formats a local stamp with Latin digits", () => {
    const d = new Date(2026, 10, 5, 9, 7);
    expect(localStamp(d.toISOString())).toBe("2026-11-05T09:07");
    expect(localStamp("not a date")).toBe("not a date");
  });
  it("groups consecutive messages by day", () => {
    const groups = groupMessagesByDay([{ s: "2026-11-05T09:00" }, { s: "2026-11-05T10:00" }, { s: "2026-11-06T08:00" }], (m) => m.s);
    expect(groups.map((g) => [g.day, g.items.length])).toEqual([["2026-11-05", 2], ["2026-11-06", 1]]);
  });
  it("has bilingual quick replies", () => {
    for (const reply of quickReplies) { expect(reply.en).toBeTruthy(); expect(reply.ar).toBeTruthy(); }
  });
});
