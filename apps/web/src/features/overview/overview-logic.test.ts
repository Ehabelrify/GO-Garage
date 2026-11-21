import { describe, expect, it } from "vitest";
import type { Booking, Job, QueueItem } from "@garage/domain";
import { queueTarget, sortQueue, summariseBranches, todayBookings } from "./overview-logic";

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
});
