import { describe, expect, it } from "vitest";
import type { Booking, Job } from "@garage/domain";
import { addDays, applyDraftChange, canManageBookings, draftReady, inDateRange, matchesBooking, matchesCustomer, noShowJob } from "./booking-logic";
import { checkCommitment, nextByStatus, reasonRequired } from "../transport/transport-logic";

const booking = (over: Partial<Booking> = {}): Booking => ({ id: "b1", customerId: "c1", vehicleId: "v1", serviceId: "tint", branchId: "branch-a", dropoffDate: "2026-11-21", dropoffTime: "10:00", expectedPickup: "2026-11-22", status: "confirmed", ...over } as Booking);

describe("date ranges", () => {
  it("adds days across month ends", () => expect(addDays("2026-11-30", 1)).toBe("2026-12-01"));
  it("classifies dates", () => {
    expect(inDateRange("2026-11-21", "today", "2026-11-21")).toBe(true);
    expect(inDateRange("2026-11-22", "tomorrow", "2026-11-21")).toBe(true);
    expect(inDateRange("2026-11-27", "week", "2026-11-21")).toBe(true);
    expect(inDateRange("2026-11-28", "week", "2026-11-21")).toBe(false);
    expect(inDateRange("2026-11-20", "past", "2026-11-21")).toBe(true);
    expect(inDateRange("2026-11-20", "upcoming", "2026-11-21")).toBe(false);
  });
});

describe("booking filter", () => {
  const parts = { customerName: "Mariam Hassan", phone: "+20 100 123 4567", plate: "ABC 123", makeModel: "Kia Cerato" };
  const base = { query: "", status: "all", range: "all" as const, branchId: "all" };
  it("matches search, status and branch", () => {
    expect(matchesBooking(booking(), parts, { ...base, query: "mariam" }, "2026-11-21")).toBe(true);
    expect(matchesBooking(booking(), parts, { ...base, query: "zzz" }, "2026-11-21")).toBe(false);
    expect(matchesBooking(booking(), parts, { ...base, status: "pending" }, "2026-11-21")).toBe(false);
    expect(matchesBooking(booking(), parts, { ...base, branchId: "branch-b" }, "2026-11-21")).toBe(false);
  });
});

describe("customer search", () => {
  const customer = { name: "Omar Fawzy", phone: "+20 111 222 3333", vehicles: [{ plate: "XYZ 987", makeModel: "Toyota" }] };
  it("matches name, phone digits and plate", () => {
    expect(matchesCustomer(customer, "omar")).toBe(true);
    expect(matchesCustomer(customer, "111222")).toBe(true);
    expect(matchesCustomer(customer, "xyz987")).toBe(true);
    expect(matchesCustomer(customer, "nobody")).toBe(false);
  });
});

describe("draft", () => {
  const draft = { customerId: "c1", vehicleId: "v1", serviceId: "tint", branchId: "branch-a" as const, dropoffDate: "2026-11-21", dropoffTime: "10:00" };
  it("clears vehicle when customer changes", () => expect(applyDraftChange(draft, { customerId: "c2" }).vehicleId).toBe(""));
  it("keeps vehicle when set with the customer", () => expect(applyDraftChange(draft, { customerId: "c2", vehicleId: "v9" }).vehicleId).toBe("v9"));
  it("clears slot when service, branch or date changes", () => {
    expect(applyDraftChange(draft, { serviceId: "ceramic" }).dropoffTime).toBe("");
    expect(applyDraftChange(draft, { dropoffDate: "2026-11-22" }).dropoffTime).toBe("");
    expect(applyDraftChange(draft, { dropoffTime: "11:00" }).dropoffTime).toBe("11:00");
  });
  it("reports readiness", () => { expect(draftReady(draft)).toBe(true); expect(draftReady({ ...draft, dropoffTime: "" })).toBe(false); });
});

describe("no-show and roles", () => {
  const job = { id: "j1", bookingId: "b1", stage: "booked" } as Job;
  it("allows no-show only for managers on a booked job", () => {
    expect(noShowJob(booking(), [job], "owner")?.id).toBe("j1");
    expect(noShowJob(booking(), [job], "receptionist")).toBeNull();
    expect(noShowJob(booking(), [{ ...job, stage: "received" } as Job], "owner")).toBeNull();
    expect(noShowJob(booking({ status: "pending" }), [job], "owner")).toBeNull();
  });
  it("hides management from technicians", () => expect(canManageBookings("technician")).toBe(false));
});

describe("transport logic", () => {
  it("has no exits from terminal states", () => { expect(nextByStatus.completed).toEqual([]); expect(nextByStatus.cancelled).toEqual([]); });
  it("requires reasons for cancel and exception", () => { expect(reasonRequired("cancelled")).toBe(true); expect(reasonRequired("confirmed")).toBe(false); });
  it("validates commitments", () => {
    expect(checkCommitment("", "", "private:x").ok).toBe(false);
    expect(checkCommitment("2026-11-21T10:00", "2026-11-21T09:00", "private:x")).toEqual({ ok: false, error: "order" });
    expect(checkCommitment("2026-11-21T10:00", "2026-11-21T11:00", "nope")).toEqual({ ok: false, error: "evidence" });
    expect(checkCommitment("2026-11-21T10:00", "2026-11-21T11:00", "private:transport/a1").ok).toBe(true);
  });
});
