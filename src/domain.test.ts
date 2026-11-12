import { describe, expect, it } from "vitest";
import { branches, decisions, services } from "./demoData";
import { calculateWarrantyInvoiceTotals, canTransitionJob, checkBookingCapacity, estimatePickupDate, filterWarrantyRecords, suggestedDropoffTimes, warrantyExpiryDate } from "./domain";
import type { Booking } from "./types";

const branchA = branches[0]!;
const tint = services.find((service) => service.id === "tint")!;

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: "booking-1",
  customerId: "customer-1",
  vehicleId: "vehicle-1",
  serviceId: "tint",
  branchId: "branch-a",
  dropoffDate: "2026-11-12",
  dropoffTime: "09:00",
  expectedPickup: "2026-11-12",
  status: "confirmed",
  ...overrides,
});

function capacityIssue(bookings: Booking[], service = tint, date = "2026-11-12") {
  return checkBookingCapacity({
    branch: branchA,
    service,
    branchId: "branch-a",
    date,
    bookings,
    services,
    decisions,
  });
}

describe("operating-setting booking capacity", () => {
  it("suggests drop-off hours from the configured workday instead of a fixed list", () => {
    expect(suggestedDropoffTimes(8)).toEqual([
      "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00",
    ]);
    expect(suggestedDropoffTimes(10)).toHaveLength(10);
    expect(suggestedDropoffTimes(0)).toEqual([]);
  });

  it("rejects a branch weekly day off", () => {
    expect(capacityIssue([], tint, "2026-11-13")).toBe("closed");
  });

  it("checks the daily drop-off cap separately from bay capacity", () => {
    const fullDropoffList = Array.from({ length: 8 }, (_, index) =>
      booking({ id: `booking-${index}`, serviceId: "inspection" }),
    );
    expect(capacityIssue(fullDropoffList)).toBe("daily-cap");
  });

  it("counts only confirmed bookings when checking bay hours", () => {
    const pending = Array.from({ length: 8 }, (_, index) =>
      booking({ id: `pending-${index}`, serviceId: "tint", status: "pending" }),
    );
    expect(capacityIssue(pending)).toBeNull();
  });

  it("does not reserve capacity for cancelled or no-show bookings", () => {
    const inactive = Array.from({ length: 8 }, (_, index) =>
      booking({ id: `inactive-${index}`, status: index % 2 ? "cancelled" : "no-show" }),
    );
    expect(capacityIssue(inactive)).toBeNull();
  });

  it("uses the configured number of bays and rejects excess bay hours", () => {
    const configured = decisions.map((decision) =>
      decision.id === "general-bays"
        ? { ...decision, valueByScope: { "branch-a": "1", "branch-b": "1" } }
        : decision,
    );
    const fullDays = [
      booking({ id: "full-1", serviceId: "audio" }),
      booking({ id: "full-2", serviceId: "audio" }),
    ];
    expect(checkBookingCapacity({
      branch: branchA,
      service: tint,
      branchId: "branch-a",
      date: "2026-11-12",
      bookings: fullDays,
      services,
      decisions: configured,
    })).toBe("bay-capacity");
  });

  it("applies owner-set service-duration changes to capacity", () => {
    const configured = decisions.map((decision) =>
      decision.id === "tint-hours"
        ? { ...decision, valueByScope: { business: "6" } }
        : decision,
    );
    const sixTintBookings = Array.from({ length: 6 }, (_, index) =>
      booking({ id: `tint-${index}`, serviceId: "tint" }),
    );
    expect(checkBookingCapacity({
      branch: branchA,
      service: tint,
      branchId: "branch-a",
      date: "2026-11-12",
      bookings: sixTintBookings,
      services,
      decisions: configured,
    })).toBe("bay-capacity");
  });
});

describe("job lifecycle", () => {
  it("allows only the configured next stage", () => {
    expect(canTransitionJob("booked", "received")).toBe(true);
    expect(canTransitionJob("booked", "no-show")).toBe(true);
    expect(canTransitionJob("received", "qc")).toBe(false);
    expect(canTransitionJob("delivered", "in-service")).toBe(false);
  });
});

describe("conservative pickup estimates", () => {
  it("includes queued work and configured capacity in the estimate", () => {
    const base = {
      startDate: "2026-11-15",
      serviceHours: 3,
      bayCount: 1,
      workingHours: 10,
      weeklyDayOff: "Friday",
    };
    expect(estimatePickupDate({ ...base, queueHours: 0 })).toBe("2026-11-15");
    expect(estimatePickupDate({ ...base, queueHours: 8 })).toBe("2026-11-16");
  });

  it("moves an estimate off the configured weekly closure", () => {
    expect(estimatePickupDate({
      startDate: "2026-11-12",
      queueHours: 8,
      serviceHours: 3,
      bayCount: 1,
      workingHours: 10,
      weeklyDayOff: "Friday",
    })).toBe("2026-11-14");
  });
});

describe("warranty expiry dates", () => {
  it("calculates the last covered day before the anniversary", () => {
    expect(warrantyExpiryDate("2026-04-12", 12)).toBe("2027-04-11");
  });

  it("clamps month-end dates and handles leap years", () => {
    expect(warrantyExpiryDate("2026-01-31", 1)).toBe("2026-02-27");
    expect(warrantyExpiryDate("2024-02-29", 12)).toBe("2025-02-27");
  });

  it("rejects invalid dates and out-of-range terms", () => {
    expect(() => warrantyExpiryDate("2026-02-30", 1)).toThrow(RangeError);
    expect(() => warrantyExpiryDate("2026-01-01", 0)).toThrow(RangeError);
  });
});

describe("warranty draft invoice calculations", () => {
  it("keeps totals pending when Owner tax rules or line amounts are unknown", () => {
    expect(calculateWarrantyInvoiceTotals([
      { quantity: 1, unitAmount: 120 },
      { quantity: 2, unitAmount: null },
    ], 14, 0)).toMatchObject({
      subtotal: null,
      taxAmount: null,
      total: null,
      balance: null,
      paymentStatus: "unpriced",
    });
    expect(calculateWarrantyInvoiceTotals([{ quantity: 1, unitAmount: 120 }], null, 0)).toMatchObject({
      subtotal: 120,
      taxAmount: null,
      total: null,
      balance: null,
      paymentStatus: "unpriced",
    });
  });

  it("calculates a draft total and payment balance without marking it final", () => {
    expect(calculateWarrantyInvoiceTotals([
      { quantity: 1.5, unitAmount: 120 },
      { quantity: 2, unitAmount: 20.25 },
    ], 10, 100)).toEqual({
      subtotal: 220.5,
      taxAmount: 22.05,
      total: 242.55,
      balance: 142.55,
      paymentStatus: "partial",
    });
  });
});

describe("warranty ledger filters", () => {
  it("filters the branch-visible rows by status and searchable text", () => {
    const rows = [
      { id: "W-1", status: "active" as const, name: "Nadia" },
      { id: "W-2", status: "expired" as const, name: "Omar" },
      { id: "W-3", status: "void" as const, name: "Nadia" },
    ];
    expect(filterWarrantyRecords(rows, "nadia", "all")).toEqual([rows[0], rows[2]]);
    expect(filterWarrantyRecords(rows, "", "expired")).toEqual([rows[1]]);
  });
});
