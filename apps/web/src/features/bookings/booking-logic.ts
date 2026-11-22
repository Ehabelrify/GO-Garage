import { plateMatchesQuery, type BranchId, type Booking, type Job, phoneDigits as canonicalPhoneDigits, toAsciiDigits } from "@garage/domain";

export type DateRange = "all" | "today" | "tomorrow" | "week" | "upcoming" | "past";
export const dateRanges: DateRange[] = ["all", "today", "tomorrow", "week", "upcoming", "past"];

/** Local calendar date as YYYY-MM-DD (not UTC, so late-evening staff see the right day). */
export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return isoDate(new Date(year, month - 1, day + days));
}

/** Whether a drop-off date (YYYY-MM-DD, extra time part ignored) falls inside the range relative to `today`. */
export function inDateRange(dropoffDate: string, range: DateRange, today: string): boolean {
  const date = dropoffDate.slice(0, 10);
  switch (range) {
    case "all": return true;
    case "today": return date === today;
    case "tomorrow": return date === addDays(today, 1);
    case "week": return date >= today && date <= addDays(today, 6);
    case "upcoming": return date >= today;
    case "past": return date < today;
  }
}

export interface BookingFilter { query: string; status: string; range: DateRange; branchId: string }

export interface SearchableParts { customerName: string; phone: string; plate: string; makeModel: string }

export function matchesBooking(booking: Booking, parts: SearchableParts, filter: BookingFilter, today: string): boolean {
  const needle = filter.query.trim().toLowerCase();
  const haystack = `${parts.customerName} ${parts.phone} ${parts.plate} ${parts.makeModel}`.toLowerCase();
  return (!needle || haystack.includes(needle))
    && (filter.status === "all" || booking.status === filter.status)
    && (filter.branchId === "all" || booking.branchId === filter.branchId)
    && inDateRange(booking.dropoffDate, filter.range, today);
}

export const sortKey = (booking: Pick<Booking, "dropoffDate" | "dropoffTime">) => `${booking.dropoffDate.slice(0, 10)} ${booking.dropoffTime}`;

/** Roles that hold bookings.manage by default. Server remains the authority. */
export function canManageBookings(role: string | undefined): boolean {
  return role === "owner" || role === "branch-manager" || role === "receptionist";
}

/** Roles that hold transport.coordinate by default. */
export function canCoordinateTransport(role: string | undefined): boolean {
  return canManageBookings(role);
}

/** No-show goes through the workshop job (booked -> no-show), which receptionists may not do. */
export function noShowJob(booking: Booking, jobs: Job[], role: string | undefined): Job | null {
  if (booking.status !== "confirmed") return null;
  if (role !== "owner" && role !== "branch-manager") return null;
  const job = jobs.find((item) => item.bookingId === booking.id);
  return job && job.stage === "booked" ? job : null;
}

export interface BookingDraft {
  customerId: string;
  vehicleId: string;
  serviceId: string;
  branchId: BranchId;
  dropoffDate: string;
  dropoffTime: string;
}

/** Applies a field change and clears dependent choices (vehicle after customer; slot after service/branch/date). */
export function applyDraftChange(draft: BookingDraft, update: Partial<BookingDraft>): BookingDraft {
  const next = { ...draft, ...update };
  if (update.customerId !== undefined && update.customerId !== draft.customerId && update.vehicleId === undefined) next.vehicleId = "";
  const slotInputsChanged = (["serviceId", "branchId", "dropoffDate"] as const).some((key) => update[key] !== undefined && update[key] !== draft[key]);
  if (slotInputsChanged && update.dropoffTime === undefined) next.dropoffTime = "";
  return next;
}

export function draftReady(draft: BookingDraft): boolean {
  return Boolean(draft.customerId && draft.vehicleId && draft.serviceId && draft.branchId && draft.dropoffDate && draft.dropoffTime);
}

export function matchesCustomer(customer: { name: string; phone: string; vehicles: Array<{ plate: string; makeModel: string }> }, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const digits = canonicalPhoneDigits(needle);
  const compact = needle.replace(/\s/g, "");
  return customer.name.toLowerCase().includes(needle)
    || (digits.length > 0 && canonicalPhoneDigits(customer.phone).includes(digits))
    || customer.vehicles.some((vehicle) => plateMatchesQuery(vehicle.plate, needle) || vehicle.plate.toLowerCase().replace(/\s/g, "").includes(compact) || vehicle.makeModel.toLowerCase().includes(needle));
}

/** The booking list opens on "today and upcoming" (inDateRange "upcoming" is date >= today). */
export const defaultRange: DateRange = "upcoming";

/** Upcoming-style ranges read soonest first; "all" and "past" read newest first. */
export function sortBookings<T extends Pick<Booking, "dropoffDate" | "dropoffTime">>(rows: T[], range: DateRange): T[] {
  const direction = range === "all" || range === "past" ? -1 : 1;
  return [...rows].sort((a, b) => direction * sortKey(a).localeCompare(sortKey(b)));
}

/** The Branch column only helps when the viewer can see more than one branch and has not narrowed to one. */
export function showBranchColumn(branchCount: number, currentBranch: string): boolean {
  return branchCount > 1 && currentBranch === "all";
}

const phoneDigits = (phone: string | null | undefined): string => {
  const raw = toAsciiDigits(phone ?? "").trim();
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d+]/g, "").replace(/^00/, "+");
  const local = /^0(1\d{9})$/.exec(cleaned);
  const digits = canonicalPhoneDigits(local ? `20${local[1]}` : cleaned);
  return digits.length >= 8 && digits.length <= 15 ? digits : "";
};

/** tel: link for a stored phone, or null when it is not dialable. */
export function telHref(phone: string | null | undefined): string | null {
  const digits = phoneDigits(phone);
  return digits ? `tel:+${digits}` : null;
}

/** wa.me link for a stored phone (international digits only), or null. */
export function whatsappHref(phone: string | null | undefined): string | null {
  const digits = phoneDigits(phone);
  return digits ? `https://wa.me/${digits}` : null;
}

