import { addDays, egp, json } from "./seed-core";
import { managerOf, receptionOf, type CustomerRec, type VehicleRec } from "./seed-people";
import type { PackageDef, PromoKey } from "./seed-reference";
import { makeQuote, makeVisit, packageProduct, type QuoteMode } from "./seed-orders";
import {
  demandOf, nextId, nextWorkingDay, tryPlace,
  type ChatSpec, type QuoteRec, type ReservationRec, type VisitRec, type World,
} from "./seed-world";

const evidence = (kind: string, n: string) => `private:seed/${kind}-${n}`;

export type PromoOutcome = "enquiry" | "reserved" | "scheduled" | "redeemed" | "cancelled" | "expired";
export interface PromoFlowOptions {
  key: PromoKey | "referral" | "threecars"; customer: CustomerRec; vehicle: VehicleRec; branchId: string; pkg: PackageDef; quoteDate: string;
  outcome: PromoOutcome; rich?: boolean; quoteMode?: QuoteMode; groupVehicleIds?: string[]; dropoffDate?: string; chat?: ChatSpec | null;
  discountMinor?: number; priceMinor?: number; evidenceKind?: "membership-verification" | "warranty-reference" | "grouped-vehicles";
  evidenceRefId?: string; leadDays?: number;
}

/**
 * Quote -> qualification -> allocation -> reservation (deposit reference only, never a payment) -> optional booking/job.
 * Returns null when the promotion's unit pool is already exhausted, so the pool invariants always hold.
 */
export function makePromoFlow(world: World, o: PromoFlowOptions): { quote: QuoteRec; reservation: ReservationRec; visit: VisitRec | null } | null {
  const { ds, ctx, ref } = world;
  const policy = ref.promoPolicies[o.key as keyof typeof ref.promoPolicies];
  const used = world.promoUse.get(policy.id) ?? { reserved: 0, consumed: 0 };
  let outcome: PromoOutcome = o.outcome;
  if (outcome === "scheduled" || outcome === "redeemed") {
    let probe = nextWorkingDay(o.dropoffDate ?? o.quoteDate);
    let placed = false;
    for (let attempt = 0; attempt < 5 && !placed; attempt++) {
      placed = Boolean(tryPlace(world, o.branchId, probe, demandOf(packageProduct(o.pkg))));
      if (!placed) probe = nextWorkingDay(addDays(probe, 1));
    }
    if (!placed) outcome = "reserved";
  }
  const firm = outcome !== "enquiry";
  if (firm && used.reserved + used.consumed + 1 > ref.promoCaps[o.key as keyof typeof ref.promoCaps]) return null;

  const quote = makeQuote(world, {
    customer: o.customer, vehicle: o.vehicle, branchId: o.branchId, pkg: o.pkg, quoteDate: o.quoteDate, mode: o.quoteMode ?? "direct",
    chat: o.chat, discountMinor: o.discountMinor, priceMinor: o.priceMinor,
  });
  const reception = receptionOf(o.branchId);
  const manager = managerOf(o.branchId);
  const resId = nextId(world, "res");
  const resAt = new Date((quote.acceptedAt ?? ctx.past(o.quoteDate, "12:00")).getTime() + 3_600_000);
  const expiresOn = addDays(o.quoteDate, 29);
  const expiredNow = outcome === "reserved" && expiresOn < ctx.today;
  let qualificationId: string | null = null;
  let allocationId: string | null = null;

  if (firm) {
    const evidenceKind = o.evidenceKind ?? "membership-verification";
    qualificationId = nextId(world, "qual");
    let evidenceId = o.evidenceRefId ?? "";
    if (evidenceKind === "membership-verification") {
      evidenceId = nextId(world, "mv");
      const verifiedAt = new Date(resAt.getTime() - 2 * 86_400_000);
      ds.add("promotion_membership_verifications", {
        id: evidenceId, environment_id: ctx.environmentId, promotion_id: policy.id, policy_version: 1, beneficiary_id: o.customer.id, branch_id: o.branchId,
        source_ref: evidence("membership", evidenceId.slice(-4)), verified_by: manager, verified_at: verifiedAt,
        expires_at: new Date(verifiedAt.getTime() + 90 * 86_400_000), revoked_at: null, revoked_by: null,
      });
      ds.add("promotion_membership_verification_events", { verification_id: evidenceId, action: "verified", actor_id: manager, occurred_at: verifiedAt });
    }
    ds.add("promotion_qualifications", {
      id: qualificationId, environment_id: ctx.environmentId, promotion_id: policy.id, policy_version: 1, branch_id: o.branchId, beneficiary_id: o.customer.id,
      vehicle_ids: o.groupVehicleIds ?? [o.vehicle.id], state: "eligible", decision_reasons: [`${evidenceKind} verified (example)`], created_by: manager,
      created_at: new Date(resAt.getTime() - 3_600_000),
    });
    ds.add("promotion_evidence", { qualification_id: qualificationId, kind: evidenceKind, reference_id: evidenceId, verified_by: manager, verified_at: new Date(resAt.getTime() - 3_600_000) });
    allocationId = `seed-alloc-${resId.slice(-4)}`;
    const status = outcome === "redeemed" ? "consumed" : outcome === "cancelled" || outcome === "expired" || expiredNow ? "reversed" : "reserved";
    ds.add("promotion_allocations", {
      id: allocationId, environment_id: ctx.environmentId, promotion_id: policy.id, policy_version: 1, qualification_id: qualificationId, quote_id: quote.id, quote_revision: quote.revision,
      beneficiary_id: o.customer.id, vehicle_id: o.vehicle.id, discount_minor: o.discountMinor ?? 0, currency: "EGP", units: 1, status, created_at: resAt,
    });
    ds.add("promotion_evidence_consumption", {
      environment_id: ctx.environmentId, promotion_id: policy.id, kind: evidenceKind, reference_id: evidenceId, qualification_id: qualificationId, allocation_id: allocationId,
    });
    ds.add("promotion_allocation_events", { allocation_id: allocationId, action: "reserved", actor_id: reception, reason: null, evidence_ref: null, occurred_at: resAt });
    if (status === "consumed") {
      ds.add("promotion_allocation_events", { allocation_id: allocationId, action: "consumed", actor_id: reception, reason: null, evidence_ref: null, occurred_at: ctx.past(addDays(o.quoteDate, 14), "16:00") });
    }
    if (status === "reversed") {
      ds.add("promotion_allocation_events", {
        allocation_id: allocationId, action: "reversed", actor_id: manager, reason: outcome === "expired" || expiredNow ? "Reservation expired unused (example)" : "Cancelled by customer (example)",
        evidence_ref: evidence("reversal", resId.slice(-4)), occurred_at: ctx.past(addDays(o.quoteDate, 20), "12:00"),
      });
    }
    if (status === "consumed") used.consumed += 1;
    else if (status === "reserved") used.reserved += 1;
    world.promoUse.set(policy.id, used);
  }

  const depositRef = firm ? evidence("deposit-reference", resId.slice(-4)) : null;
  let visit: VisitRec | null = null;
  const bookable = outcome === "scheduled" || outcome === "redeemed" || outcome === "cancelled";
  if (bookable && o.dropoffDate) {
    visit = makeVisit(world, {
      customer: o.customer, vehicle: o.vehicle, branchId: o.branchId, date: o.dropoffDate, product: packageProduct(o.pkg), quote,
      status: outcome === "cancelled" ? "cancelled" : "confirmed", leadDays: o.leadDays ?? 5, chat: o.chat, rich: o.rich,
    });
  }
  const status = expiredNow ? "expired" : outcome;
  const terms = {
    validityDays: 30,
    deposit: { required: true, amount: egp(5000), refundRule: { ar: "يُراجع الاسترداد مع المالك (نص تجريبي)", en: "Refund is reviewed by the Owner (example wording)" } },
    cancellationRule: { ar: "يتم مراجعة الإلغاء يدويًا (نص تجريبي)", en: "Cancellation is reviewed manually (example wording)" }, cancellationDisposition: "review-required",
    priceLock: true, redemptionTiming: "installation", restoreAllowed: true, expiryAction: "review-required",
  };
  const events: Array<[string, string | null, string | null]> = [[firm ? "reserved" : "enquired", null, null]];
  if (firm) events.push(["deposit-reference", "Deposit reference noted; no payment recorded in Garage OS (example)", depositRef]);
  if (visit && outcome !== "cancelled") events.push(["scheduled", null, null]);
  if (outcome === "redeemed") events.push(["redeemed", null, null]);
  if (outcome === "cancelled") events.push(["cancelled", "Customer cancelled after scheduling (example)", null]);
  if (status === "expired") events.push(["expired", "Reservation window ended without booking (example)", null]);
  ds.add("promotion_reservations", {
    id: resId, environment_id: ctx.environmentId, quote_id: quote.id, quote_revision: quote.revision, promotion_id: policy.id, promotion_version: 1,
    qualification_id: qualificationId, allocation_id: allocationId, branch_id: o.branchId, beneficiary_id: o.customer.id, vehicle_id: o.vehicle.id,
    accepted_snapshot: json(quote.accepted), policy_id: firm ? `reservation-deposit:${o.branchId}` : null, policy_version: firm ? 1 : null,
    policy_snapshot: firm ? json(terms) : null, effective_on: o.quoteDate, expires_on: firm ? expiresOn : null, expiry_basis: firm ? "approved-date" : null,
    deposit_state: firm ? "reference-only" : "unrecorded", deposit_reference: depositRef, deposit_money_event_id: null, status,
    booking_id: bookable && visit ? visit.id : null, revision: events.length, created_by: reception, created_at: resAt,
  });
  events.forEach(([action, reason, evidenceRef], index) => {
    ds.add("promotion_reservation_events", {
      reservation_id: resId, revision: index + 1, action, actor_id: reception, reason, evidence_ref: evidenceRef,
      booking_id: action === "scheduled" || action === "redeemed" ? visit?.id ?? null : null, occurred_at: new Date(resAt.getTime() + index * 3_600_000),
    });
  });
  if (firm) {
    ds.add("promotion_reservation_deposit_events", {
      reservation_id: resId, state: "reference-only", reference: depositRef, actor_id: reception, reason: "Deposit reference noted; no payment recorded (example)",
      occurred_at: new Date(resAt.getTime() + 3_600_000),
    });
    if (status === "cancelled" || status === "expired") {
      ds.add("promotion_reservation_allocation_events", {
        reservation_id: resId, allocation_id: allocationId, action: "released", actor_id: manager, reason: "Allocation released (example)",
        evidence_ref: evidence("release", resId.slice(-4)), occurred_at: ctx.past(addDays(o.quoteDate, 21), "12:00"),
      });
    }
  }
  const rec: ReservationRec = {
    id: resId, quote, promoKey: o.key as ReservationRec["promoKey"], status, depositMinor: firm ? 500_000 : 0, depositRecorded: false,
    depositMoneyEventId: null, allocationId,
  };
  world.reservations.push(rec);
  if (visit) { visit.reservation = rec; visit.depositMinor = rec.depositMinor; }
  return { quote, reservation: rec, visit };
}
