import { describe, expect, it } from "vitest";
import { branches, decisions, services } from "./demoData";
import { canTransitionJob, checkBookingCapacity } from "./domain";
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

describe("demo booking capacity", () => {
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

  it("applies approved sample service-duration changes to capacity", () => {
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

describe("demo job lifecycle", () => {
  it("allows only the configured next stage", () => {
    expect(canTransitionJob("booked", "received")).toBe(true);
    expect(canTransitionJob("received", "qc")).toBe(false);
    expect(canTransitionJob("delivered", "in-service")).toBe(false);
  });
});
