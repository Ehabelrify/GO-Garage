import type { PromotionReservation } from "@garage/domain";

export interface ReservationRow {
  id: string;
  state: "enquiry" | "firm";
  reservation: PromotionReservation | null;
  branchId: string;
  beneficiaryId: string;
  vehicleId: string;
}

/** Display status: enquiries have no reservation record. */
export const reservationStatus = (row: Pick<ReservationRow, "state" | "reservation">) =>
  row.state === "enquiry" || !row.reservation ? "enquiry" : row.reservation.status;

export type Correction = "cancel" | "expire" | "restore";

/** Corrections the actor may request for a reservation (mirrors the server rule; the server stays the authority). */
export function availableCorrections(reservation: Pick<PromotionReservation, "status" | "bookingId">): Correction[] {
  if (reservation.status === "reserved") return ["cancel", "expire"];
  if (reservation.bookingId && (reservation.status === "scheduled" || reservation.status === "redeemed")) return ["cancel"];
  return ["restore"];
}

export const correctionLabels: Record<Correction, { en: string; ar: string; confirmEn: string; confirmAr: string }> = {
  cancel: { en: "Cancel reservation", ar: "إلغاء الحجز", confirmEn: "Cancel this reservation?", confirmAr: "إلغاء هذا الحجز؟" },
  expire: { en: "Mark as expired", ar: "تحديد كمنتهٍ", confirmEn: "Mark this reservation as expired?", confirmAr: "تحديد هذا الحجز كمنتهٍ؟" },
  restore: { en: "Restore reservation", ar: "استعادة الحجز", confirmEn: "Restore this reservation?", confirmAr: "استعادة هذا الحجز؟" },
};

export interface Slot { dropoffDate: string; dropoffTime: string; expectedPickupDate: string }

/** Groups slots by day, preserving order. */
export function groupSlotsByDay(slots: Slot[]): Array<{ date: string; slots: Slot[] }> {
  const days = new Map<string, Slot[]>();
  for (const slot of slots) days.set(slot.dropoffDate, [...(days.get(slot.dropoffDate) ?? []), slot]);
  return [...days.entries()].map(([date, list]) => ({ date, slots: list }));
}

/** Reserved reservations that share a qualification, grouped (only groups of two or more can be scheduled together). */
export function schedulableGroups(rows: ReservationRow[]): Array<{ qualificationId: string; rows: ReservationRow[] }> {
  const groups = new Map<string, ReservationRow[]>();
  for (const row of rows) {
    const id = row.reservation?.qualificationId;
    if (row.reservation?.status !== "reserved" || !id) continue;
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  return [...groups.entries()].filter(([, list]) => list.length >= 2).map(([qualificationId, list]) => ({ qualificationId, rows: list }));
}

export interface ReservationFilter { query: string; status: string }

export function filterReservations(rows: ReservationRow[], filter: ReservationFilter, haystack: (row: ReservationRow) => string): ReservationRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter((row) => (filter.status === "all" || reservationStatus(row) === filter.status) && (!query || haystack(row).toLowerCase().includes(query)));
}

/** Whole days from `from` to `to` (YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
