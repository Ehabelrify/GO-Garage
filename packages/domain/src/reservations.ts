import type { PolicyRef } from "./commercial-policy";
import type { QuoteVersionRef } from "./quotes";

/** A reservation contains no workshop capacity. Dates are local YYYY-MM-DD values. */
export type PromotionReservation = {
  id: string;
  acceptedQuote: QuoteVersionRef;
  promotion: PolicyRef;
  qualificationId: string | null;
  status: "reserved" | "scheduled" | "redeemed" | "cancelled" | "expired";
  effectiveOn: string;
  expiresOn: string | null;
  expiryBasis: "approved-date" | "approved-no-expiry";
  deposit: { state: "not-required" | "unrecorded" | "reference-only" | "recorded"; reference: string | null };
  bookingId: string | null;
  revision: number;
};
