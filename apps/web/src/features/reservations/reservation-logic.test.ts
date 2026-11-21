import { describe, expect, it } from "vitest";
import type { PromotionReservation } from "@garage/domain";
import { availableCorrections, daysBetween, filterReservations, groupSlotsByDay, reservationStatus, schedulableGroups, type ReservationRow } from "./reservation-logic";

const reservation = (patch: Partial<PromotionReservation> = {}): PromotionReservation => ({
  id: "r", acceptedQuote: { quoteId: "q", revision: 1 }, promotion: { id: "promotion-qualification:p", version: 1 }, qualificationId: "qual", status: "reserved", effectiveOn: "2026-11-21",
  expiresOn: null, expiryBasis: "approved-no-expiry", deposit: { state: "unrecorded", reference: null }, bookingId: null, revision: 1, ...patch,
});
const row = (id: string, patch: Partial<PromotionReservation> | null): ReservationRow => ({ id, state: patch ? "firm" : "enquiry", reservation: patch ? reservation({ id, ...patch }) : null, branchId: "b", beneficiaryId: "c", vehicleId: `v-${id}` });

describe("reservation logic", () => {
  it("shows enquiries distinctly", () => {
    expect(reservationStatus(row("a", null))).toBe("enquiry");
    expect(reservationStatus(row("a", { status: "scheduled" }))).toBe("scheduled");
  });
  it("offers only the corrections the status allows", () => {
    expect(availableCorrections(reservation())).toEqual(["cancel", "expire"]);
    expect(availableCorrections(reservation({ status: "scheduled", bookingId: "b" }))).toEqual(["cancel"]);
    expect(availableCorrections(reservation({ status: "cancelled" }))).toEqual(["restore"]);
  });
  it("groups slots by day in order", () => {
    const slot = (d: string, t: string) => ({ dropoffDate: d, dropoffTime: t, expectedPickupDate: d });
    expect(groupSlotsByDay([slot("2026-11-22", "09:00"), slot("2026-11-22", "10:00"), slot("2026-11-23", "09:00")]).map((day) => day.slots.length)).toEqual([2, 1]);
  });
  it("only offers group scheduling for two or more reserved vehicles in one qualification", () => {
    const groups = schedulableGroups([row("a", { qualificationId: "q1" }), row("b", { qualificationId: "q1" }), row("c", { qualificationId: "q2" }), row("d", { qualificationId: "q1", status: "scheduled" }), row("e", null)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((item) => item.id)).toEqual(["a", "b"]);
  });
  it("filters by status and text", () => {
    const rows = [row("a", {}), row("b", { status: "cancelled" })];
    const text = (item: ReservationRow) => (item.id === "a" ? "Mariam" : "Omar");
    expect(filterReservations(rows, { query: "", status: "cancelled" }, text)).toHaveLength(1);
    expect(filterReservations(rows, { query: "mar", status: "all" }, text)).toHaveLength(2);
    expect(filterReservations(rows, { query: "mariam", status: "all" }, text)).toHaveLength(1);
  });
  it("counts days", () => {
    expect(daysBetween("2026-11-21", "2026-11-28")).toBe(7);
    expect(daysBetween("2026-11-21", "2026-11-20")).toBe(-1);
  });
});
