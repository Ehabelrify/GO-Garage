import { describe, expect, it } from "vitest";
import type { Booking, Job, QueueItem } from "@garage/domain";
import { describeQueueRecord, groupQueue, queueTarget, selectAttention, sortQueue, summariseBranches, todayBookings, type QueueLookup } from "./overview-logic";

const booking = (over: Partial<Booking>): Booking => ({ id: "b", customerId: "c", vehicleId: "v", serviceId: "s", branchId: "branch-a", dropoffDate: "2026-11-21", dropoffTime: "09:00", expectedPickup: "2026-11-22", status: "confirmed", ...over } as Booking);
const job = (over: Partial<Job>): Job => ({ id: "j", bookingId: "b", customerId: "c", vehicleId: "v", serviceId: "s", branchId: "branch-a", stage: "in-progress", updatedAt: "", ...over } as Job);

describe("overview logic", () => {
  it("deep links records and falls back to list pages", () => {
    expect(queueTarget({ kind: "booking-review", recordId: "a b" })).toBe("/workspace/bookings?record=a%20b");
    expect(queueTarget({ kind: "warranty-claim", recordId: "x" })).toBe("/workspace/warranties?tab=claims&record=x");
    expect(queueTarget({ kind: "transport", recordId: "x" })).toBe("/workspace/transport");
  });
  it("sorts by known kind order, unknown last", () => {
    const items = [{ kind: "zzz" }, { kind: "transport" }, { kind: "booking-review" }] as QueueItem[];
    expect(sortQueue(items).map((i) => i.kind)).toEqual(["booking-review", "transport", "zzz"]);
  });
  it("summarises branches", () => {
    const rows = summariseBranches(["branch-a", "branch-b"], [job({}), job({ id: "j2", stage: "delivered" }), job({ id: "j3", branchId: "branch-b" })], [booking({}), booking({ id: "b2", branchId: "branch-b", status: "cancelled" })], [{ kind: "x", branchId: "branch-b" } as QueueItem], "2026-11-21");
    expect(rows[0]).toMatchObject({ activeJobs: 1, confirmedBookings: 1, todayDropoffs: 1, attention: 0 });
    expect(rows[1]).toMatchObject({ activeJobs: 1, confirmedBookings: 0, todayDropoffs: 0, attention: 1 });
  });
  it("splits dropoffs and pickups for the day", () => {
    const r = todayBookings([booking({ dropoffTime: "11:00" }), booking({ id: "b2", dropoffTime: "08:00" }), booking({ id: "b3", dropoffDate: "2026-11-20", expectedPickup: "2026-11-21" })], "2026-11-21");
    expect(r.dropoffs.map((b) => b.id)).toEqual(["b2", "b"]);
    expect(r.pickups.map((b) => b.id)).toEqual(["b3"]);
  });

  const q = (kind: string, recordId: string, over: Partial<QueueItem> = {}) => ({ kind, recordId, branchId: "branch-a", stage: "x", nextAction: null, ...over }) as QueueItem;
  it("groups by kind with totals", () => {
    const groups = groupQueue([q("transport", "t1"), q("booking-review", "b1"), q("booking-review", "b2")]);
    expect(groups.map((g) => [g.kind, g.count])).toEqual([["booking-review", 2], ["transport", 1]]);
  });
  it("deals the top 10 round-robin across types and keeps full counts", () => {
    const items = [...Array.from({ length: 30 }, (_, i) => q("booking-review", `b${i}`)), ...Array.from({ length: 5 }, (_, i) => q("unassigned-job", `j${i}`)), q("transport", "t0")];
    const top = selectAttention(items, "all", 10);
    expect(top.shown).toBe(10);
    expect(top.total).toBe(36);
    expect(top.groups.map((g) => [g.kind, g.items.length, g.count])).toEqual([["booking-review", 5, 30], ["unassigned-job", 4, 5], ["transport", 1, 1]]);
  });
  it("shows the first N of a single selected kind", () => {
    const items = Array.from({ length: 14 }, (_, i) => q("booking-review", `b${i}`));
    const top = selectAttention(items, "booking-review", 10);
    expect(top.groups).toHaveLength(1);
    expect(top.groups[0].items.map((i) => i.recordId)).toEqual(items.slice(0, 10).map((i) => i.recordId));
    expect(top.groups[0].count).toBe(14);
    expect(selectAttention(items, "transport", 10).groups).toEqual([]);
  });
  const lookup: QueueLookup = {
    bookings: [{ id: "b1", customerId: "c1", vehicleId: "v1", dropoffDate: "2026-11-25" }],
    jobs: [{ id: "j1", customerId: "c1", vehicleId: "v1", updatedAt: "2026-11-20T10:00:00Z" }],
    claims: [{ id: "cl1", warrantyId: "w1", createdAt: "2026-11-18T08:00:00Z" }],
    warranties: [{ id: "w1", customerId: "c1", vehicleId: "v1" }],
    customers: [{ id: "c1", name: "Nour", vehicles: [{ id: "v1", plate: "1234 ABC" }] }],
  };
  it("describes records with customer, plate and date", () => {
    expect(describeQueueRecord(q("booking-review", "b1"), lookup)).toEqual({ type: "booking", customerId: "c1", customerName: "Nour", plate: "1234 ABC", date: "2026-11-25" });
    expect(describeQueueRecord(q("unassigned-job", "j1"), lookup)).toMatchObject({ type: "job", plate: "1234 ABC", date: "2026-11-20" });
    expect(describeQueueRecord(q("warranty-claim", "cl1"), lookup)).toMatchObject({ type: "claim", customerName: "Nour", date: "2026-11-18" });
  });
  it("falls back to the committed date when the record is not loaded", () => {
    const info = describeQueueRecord(q("pickup-commitment", "p9", { committedAt: "2026-11-23T09:00:00.000Z" }), lookup);
    expect(info).toMatchObject({ type: null, customerName: "", plate: "", date: "2026-11-23" });
    expect(describeQueueRecord(q("booking-review", "missing"), lookup).customerName).toBe("");
  });
});
