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
