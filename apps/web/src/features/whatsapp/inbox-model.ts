import type { GarageState } from "@garage/domain";

export type ConversationStatus = "open" | "pending" | "resolved";
export type InboxStatusFilter = "all" | ConversationStatus;
export type InboxScope = "all" | "mine" | "unassigned" | "unread";

export interface InboxListItem {
  customerLabel: string;
  preview?: string;
  status: ConversationStatus;
  assignedUserId?: string | null;
  unreadCount: number;
}

export interface InboxFilters { status: InboxStatusFilter; scope: InboxScope; query: string }

export function filterConversations<T extends InboxListItem>(items: T[], filters: InboxFilters, currentUserId?: string | null): T[] {
  const query = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.status !== "all" && item.status !== filters.status) return false;
    if (filters.scope === "mine" && (!currentUserId || item.assignedUserId !== currentUserId)) return false;
    if (filters.scope === "unassigned" && item.assignedUserId) return false;
    if (filters.scope === "unread" && item.unreadCount <= 0) return false;
    if (query && !`${item.customerLabel} ${item.preview ?? ""}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

export function inboxFiltersActive(filters: InboxFilters): boolean {
  return filters.status !== "all" || filters.scope !== "all" || filters.query.trim() !== "";
}

export interface RelatedRecords {
  bookingId: string;
  bookingLabel: string;
  customer?: { id: string; name: string };
  vehicle?: { id: string; plate: string; makeModel: string };
  quote?: { id: string; revision: number };
}

/** Resolve the records linked to a conversation through its booking, using data already in the store. */
export function resolveRelatedRecords(state: Pick<GarageState, "bookings" | "customers">, bookingId?: string | null): RelatedRecords | null {
  if (!bookingId) return null;
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!booking) return null;
  const customer = state.customers.find((item) => item.id === booking.customerId);
  const vehicle = customer?.vehicles.find((item) => item.id === booking.vehicleId);
  return {
    bookingId: booking.id,
    bookingLabel: `${booking.dropoffDate} ${booking.dropoffTime}`,
    customer: customer ? { id: customer.id, name: customer.name } : undefined,
    vehicle: vehicle ? { id: vehicle.id, plate: vehicle.plate, makeModel: vehicle.makeModel } : undefined,
    quote: booking.acceptedQuoteRef ? { id: booking.acceptedQuoteRef.quoteId, revision: booking.acceptedQuoteRef.revision } : undefined,
  };
}

export type ConsentView = "granted" | "revoked" | "expired" | "missing" | "unknown";

export function consentView(consent: { status?: string; expiresAt?: string | null } | null | undefined, now = Date.now()): ConsentView {
  if (!consent) return "unknown";
  if (consent.status === "revoked") return "revoked";
  if (consent.status === "granted") {
    if (consent.expiresAt && new Date(consent.expiresAt).valueOf() <= now) return "expired";
    return "granted";
  }
  if (consent.status === "missing") return "missing";
  return "unknown";
}

const eventLabels: Record<string, { en: string; ar: string }> = {
  claim: { en: "Claimed", ar: "تم الاستلام" },
  claimed: { en: "Claimed", ar: "تم الاستلام" },
  assign: { en: "Assigned", ar: "تم الإسناد" },
  assigned: { en: "Assigned", ar: "تم الإسناد" },
  release: { en: "Released", ar: "تم إلغاء الإسناد" },
  released: { en: "Released", ar: "تم إلغاء الإسناد" },
  handoff: { en: "Handed off to staff", ar: "تم التحويل لموظف" },
  resolve: { en: "Resolved", ar: "تم الحل" },
  resolved: { en: "Resolved", ar: "تم الحل" },
  reopen: { en: "Reopened", ar: "أعيد الفتح" },
  reopened: { en: "Reopened", ar: "أعيد الفتح" },
  pending: { en: "Set to pending", ar: "تم التعليق" },
  "mark-read": { en: "Marked read", ar: "حُددت كمقروءة" },
};

/** Never show a raw enum: known events are translated, unknown ones are humanised. */
export function eventTitle(eventType: string, lang: "en" | "ar"): string {
  const known = eventLabels[eventType];
  if (known) return known[lang];
  const spaced = eventType.replace(/[-_.]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : eventType;
}

/** ISO instant to a local "YYYY-MM-DDTHH:MM" string (Latin digits) that DateText can render; unparseable input is returned unchanged. */
export function localStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  const two = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** Group an ordered message list by calendar day (the first 10 characters of the stamp). */
export function groupMessagesByDay<T>(items: T[], stampOf: (item: T) => string): Array<{ day: string; items: T[] }> {
  const groups: Array<{ day: string; items: T[] }> = [];
  for (const item of items) {
    const day = stampOf(item).slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

/** Canned replies the agent can insert into the composer (saved here only; delivery is off). */
export const quickReplies: Array<{ id: string; short: { en: string; ar: string }; en: string; ar: string }> = [
  { id: "thanks", short: { en: "Thanks", ar: "شكراً" }, en: "Thank you for contacting us.", ar: "شكراً لتواصلك معنا." },
  { id: "confirm", short: { en: "Booking confirmed", ar: "تأكيد الحجز" }, en: "Your booking is confirmed. We look forward to seeing you.", ar: "تم تأكيد حجزك. في انتظارك." },
  { id: "checking", short: { en: "Checking", ar: "جارٍ التحقق" }, en: "We are checking and will get back to you shortly.", ar: "نراجع طلبك وسنرد عليك قريباً." },
  { id: "ready", short: { en: "Car ready", ar: "السيارة جاهزة" }, en: "Your car is ready for pickup.", ar: "سيارتك جاهزة للاستلام." },
];
