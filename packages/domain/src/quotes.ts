import type { PolicyRef } from "./commercial-policy";
import type { Money, ScopeItem, VehicleSelection, WorkComponent } from "./catalogue";

export type QuoteVersionRef = { quoteId: string; revision: number };
export type QuoteLine = { id: string; scopeItemId: string; quantity: number; unitPrice: Money; discount: Money; tax: Money | null };
export type WarrantyBinding = { componentId: string; policy: PolicyRef; issuanceAuthority: PolicyRef };
export type QuotePriceOrigin = { kind: "catalogue" } | { kind: "manual" | "inspection"; actorId: string; reason: string };
export type QuoteDraftInput = {
  quoteId?: string; priorRevision?: QuoteVersionRef; branchId: string; customerId: string;
  vehicle: VehicleSelection; enquiryRef?: string | null; sourceChannelRef?: string | null;
  packageVersion: PolicyRef | null; scope: ScopeItem[]; work: WorkComponent[];
  lines: QuoteLine[]; priceOrigin: QuotePriceOrigin; taxTreatment: PolicyRef | null;
  acceptancePolicy: PolicyRef | null; validThrough: string | null;
  warrantyBindings: WarrantyBinding[]; benefitBindings: PolicyRef[];
  state: "draft" | "offered";
};
export type QuoteRevision = { ref: QuoteVersionRef; state: "draft" | "offered" | "accepted" | "superseded" | "cancelled"; input: QuoteDraftInput; total: Money | null; digest: string; validThrough: string | null };
export type QuoteFollowup = { requestedAt: string; responsibleUserId: string | null; status: "requested" | "preparing" | "answered" | "cancelled"; answeredAt: string | null; promisedResponseAt: string | null };
export type AcceptedQuoteSnapshot = {
  ref: QuoteVersionRef; branchId: string; customerId: string; vehicle: VehicleSelection;
  packageVersion: PolicyRef | null; scope: ScopeItem[]; lines: QuoteLine[];
  total: Money; taxTreatment: PolicyRef; work: WorkComponent[];
  warrantyBindings: WarrantyBinding[]; benefitBindings: PolicyRef[];
  acceptance: { method: "staff-recorded" | "customer-confirmed"; actorId: string; evidenceRef: string; at: string };
  digest: string;
};
export type BookingOfferContext =
  | { state: "ready"; quoteRef: QuoteVersionRef | null; reservationId: string | null; vehicle: VehicleSelection; scope: ScopeItem[]; work: WorkComponent[]; summary: { ar: string; en: string } }
  | { state: "requires-human"; reasons: string[]; quoteRef: QuoteVersionRef | null; reservationId: string | null };
