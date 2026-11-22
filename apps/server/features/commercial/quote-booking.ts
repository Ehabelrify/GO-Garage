import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AcceptedQuoteSnapshot, BookingOfferContext, QuoteVersionRef, WorkComponent } from "@garage/domain";
import { pool, withTransaction } from "../../infrastructure/database/db";
import type { GarageActor } from "../auth/authz";
import type { BookingActor } from "../operations/booking-service";
import { commercialContext, type ExecutionContext } from "./policy-service";
import { QuoteError } from "./quote-service";
import { staffHasCapabilityForBranch } from "../auth/staff-capability";

type AcceptedRow = { branch_id: string; customer_id: string; vehicle_id: string; current_revision: number; accepted_revision: number | null; accepted_snapshot: AcceptedQuoteSnapshot };
export async function acceptedQuoteInTransaction(client: PoolClient, ref: QuoteVersionRef, branchId: string, customerId: string, vehicleId: string): Promise<AcceptedQuoteSnapshot> {
  const result = await client.query<AcceptedRow>(`SELECT h.branch_id,h.customer_id,h.vehicle_id,h.current_revision,h.accepted_revision,e.accepted_snapshot
    FROM quote_heads h JOIN quote_acceptance_events e ON e.quote_id=h.id AND e.revision=$2
    WHERE h.id=$1 AND h.environment_id=$3 AND e.environment_id=$3`, [ref.quoteId, ref.revision,commercialContext.environmentId]);
  const row = result.rows[0];
  if (!row || row.branch_id !== branchId || row.customer_id !== customerId || row.vehicle_id !== vehicleId ||
      row.current_revision !== ref.revision || row.accepted_revision !== ref.revision ||
      row.accepted_snapshot.ref.quoteId !== ref.quoteId || row.accepted_snapshot.ref.revision !== ref.revision)
    throw new QuoteError(409, "ACCEPTED_QUOTE_MISMATCH", "Accepted quote does not match this booking context.");
  return row.accepted_snapshot;
}

export async function prepareQuotedWork(context: ExecutionContext, actor: GarageActor, ref: QuoteVersionRef): Promise<{ quote: AcceptedQuoteSnapshot; components: WorkComponent[] }> {
  const result = await pool.query<AcceptedRow>(`SELECT h.branch_id,h.customer_id,h.vehicle_id,h.current_revision,h.accepted_revision,e.accepted_snapshot
    FROM quote_heads h JOIN quote_acceptance_events e ON e.quote_id=h.id AND e.revision=$2 WHERE h.id=$1 AND h.environment_id=$3 AND e.environment_id=$3`, [ref.quoteId, ref.revision,context.environmentId]);
  const row = result.rows[0];
  if (!row || !await staffHasCapabilityForBranch(pool, actor.userId, "bookings.manage", row.branch_id))
    throw new QuoteError(404, "QUOTE_NOT_FOUND", "Accepted quote not found.");
  const quote = await withTransaction(client => acceptedQuoteInTransaction(client, ref, row.branch_id, row.customer_id, row.vehicle_id));
  return { quote, components: quote.work };
}

export async function attachAcceptedQuoteInTransaction(client: PoolClient, _context: ExecutionContext, actor: GarageActor, input: { bookingId: string; ref: QuoteVersionRef }): Promise<void> {
  const booking = await client.query<{branch_id:string;customer_id:string;vehicle_id:string}>("SELECT branch_id,customer_id,vehicle_id FROM bookings WHERE id=$1", [input.bookingId]);
  const row = booking.rows[0];
  if (!row) throw new QuoteError(404, "BOOKING_NOT_FOUND", "Booking not found.");
  if (!await staffHasCapabilityForBranch(client, actor.userId, "bookings.manage", row.branch_id)) throw new QuoteError(404,"BOOKING_NOT_FOUND","Booking not found.");
  await attachConfirmedQuoteSnapshot(client,input,row);
}
export async function attachConfirmedQuoteSnapshot(client:PoolClient,input:{bookingId:string;ref:QuoteVersionRef},row?:{branch_id:string;customer_id:string;vehicle_id:string}):Promise<void> {
  if(!row) {
    const found=await client.query<{branch_id:string;customer_id:string;vehicle_id:string}>("SELECT branch_id,customer_id,vehicle_id FROM bookings WHERE id=$1",[input.bookingId]);
    row=found.rows[0];
  }
  if(!row) throw new QuoteError(404,"BOOKING_NOT_FOUND","Booking not found.");
  const quote = await acceptedQuoteInTransaction(client,input.ref,row.branch_id,row.customer_id,row.vehicle_id);
  const linked = await client.query("UPDATE bookings SET accepted_quote_id=$2,accepted_quote_revision=$3 WHERE id=$1 AND (accepted_quote_id IS NULL OR (accepted_quote_id=$2 AND accepted_quote_revision=$3)) RETURNING id",[input.bookingId,input.ref.quoteId,input.ref.revision]);
  if (!linked.rowCount) throw new QuoteError(409,"BOOKING_QUOTE_MISMATCH","Booking is linked to another accepted revision.");
  const job = await client.query<{id:string}>("SELECT id FROM jobs WHERE booking_id=$1",[input.bookingId]);
  if (!job.rows[0]) throw new QuoteError(409,"JOB_MISSING","Booking job is required.");
  for (const [position, component] of quote.work.entries()) {
    const values = [position,component.id,component.serviceId,component.scopeItemIds,component.occupancyRule.id,component.occupancyRule.version];
    await client.query("INSERT INTO booking_work_components(booking_id,position,component_id,service_id,scope_item_ids,occupancy_rule_id,occupancy_rule_version) VALUES($1,$2,$3,$4,$5,$6,$7)",[input.bookingId,...values]);
    await client.query("INSERT INTO job_work_components(job_id,position,component_id,service_id,scope_item_ids,occupancy_rule_id,occupancy_rule_version) VALUES($1,$2,$3,$4,$5,$6,$7)",[job.rows[0].id,...values]);
  }
}

export async function getBookingOfferContext(actor: BookingActor, input: { branchId: string; customerId: string; vehicleId: string; quoteRef?: QuoteVersionRef; reservationId?: string }): Promise<BookingOfferContext> {
  const fallback: BookingOfferContext = { state:"requires-human", reasons:["Accepted quote and configured work are required."], quoteRef:input.quoteRef ?? null, reservationId:input.reservationId ?? null };
  if (!input.quoteRef || input.reservationId) return fallback;
  if (actor.kind === "staff") {
    const member = await pool.query<{role:string;branch_ids:string[]}>("SELECT role,branch_ids FROM staff_memberships WHERE clerk_user_id=$1 AND status='active'",[actor.userId]);
    const row=member.rows[0];
    if (!row || !["owner","branch-manager","receptionist"].includes(row.role) || (row.role!=="owner" && !row.branch_ids.includes(input.branchId))) return { ...fallback, reasons:["Booking authority is required."] };
  } else {
    const association = await pool.query("SELECT 1 FROM whatsapp_booking_drafts d JOIN whatsapp_conversations c ON c.id=d.conversation_id WHERE d.id=$1 AND c.branch_id=$2 AND c.customer_id=$3 AND c.vehicle_id=$4 AND d.status='pending'",[actor.confirmationId,input.branchId,input.customerId,input.vehicleId]);
    if (actor.channelId!=="whatsapp-simulation" || !association.rowCount) return { ...fallback, reasons:["Customer confirmation is unavailable."] };
  }
  try {
    const quote = await withTransaction(client => acceptedQuoteInTransaction(client,input.quoteRef!,input.branchId,input.customerId,input.vehicleId));
    if (!quote.work.length || new Set(quote.work.map(w=>w.id)).size!==quote.work.length) return fallback;
    // Product lines are not workshop services: they have no service row and no bay time.
    const serviceScope = quote.scope.filter(s=>!s.productId);
    const names = await pool.query<{id:string;name_ar:string;name_en:string}>("SELECT id,name_ar,name_en FROM services WHERE id=ANY($1::text[])",[...new Set(serviceScope.map(s=>s.serviceId))]);
    const byId = new Map(names.rows.map(r=>[r.id,r]));
    if (serviceScope.some(s=>!byId.has(s.serviceId))) return fallback;
    const unique = [...new Set(serviceScope.map(s=>s.serviceId))];
    return { state:"ready", quoteRef:quote.ref, reservationId:null, vehicle:quote.vehicle, scope:quote.scope, work:quote.work,
      summary:{ ar:unique.map(id=>byId.get(id)!.name_ar).join("، "), en:unique.map(id=>byId.get(id)!.name_en).join(", ") } };
  } catch { return fallback; }
}

export async function recordPickupCommitment(_context: ExecutionContext, actor: GarageActor, input: { bookingId: string; promisedAt: string; evidenceRef: string; reason: string; expectedRevision: number }): Promise<{ commitmentId: string }> {
  return withTransaction(async client => {
    const booking = await client.query<{branch_id:string;job_id:string}>("SELECT b.branch_id,j.id AS job_id FROM bookings b JOIN jobs j ON j.booking_id=b.id WHERE b.id=$1 FOR UPDATE OF b,j",[input.bookingId]);
    const row=booking.rows[0];
    if (!row) throw new QuoteError(404,"BOOKING_NOT_FOUND","Booking not found.");
    const member=await client.query<{role:string;branch_ids:string[]}>("SELECT role,branch_ids FROM staff_memberships WHERE clerk_user_id=$1 AND status='active'",[actor.userId]);
    const staff=member.rows[0];
    if (!staff || !["owner","branch-manager"].includes(staff.role) || (staff.role!=="owner" && !staff.branch_ids.includes(row.branch_id))) throw new QuoteError(403,"ROLE_FORBIDDEN","Pickup commitment authority is required.");
    const authority=await client.query<{value:{authorizedRoles?:string[];requiresCustomerAgreement?:boolean}}>("SELECT v.value FROM commercial_policy_active a JOIN commercial_policy_versions v USING(policy_id,version) WHERE v.policy_id=$1 AND v.family='pickup-commitment' AND v.state='approved' AND (v.effective_from IS NULL OR v.effective_from<=CURRENT_DATE) AND (v.effective_through IS NULL OR v.effective_through>=CURRENT_DATE)",[`pickup-commitment:${row.branch_id}`]);
    if (!authority.rows[0]?.value.authorizedRoles?.includes(staff.role) || authority.rows[0]?.value.requiresCustomerAgreement!==true) throw new QuoteError(422,"POLICY_UNCONFIGURED","Pickup commitment authority is not configured.");
    const timezone=await client.query<{timezone:string}>("SELECT v.timezone FROM branch_availability_active a JOIN branch_availability_versions v USING(branch_id,version) WHERE a.branch_id=$1 AND v.effective_from<=CURRENT_DATE",[row.branch_id]);
    const zone=timezone.rows[0]?.timezone;
    if (!zone) throw new QuoteError(422,"POLICY_UNCONFIGURED","Branch timezone is required.");
    try { new Intl.DateTimeFormat("en",{timeZone:zone}); } catch { throw new QuoteError(422,"POLICY_UNCONFIGURED","Branch timezone is invalid."); }
    const prior=await client.query<{id:string;revision:number}>("SELECT id,revision FROM pickup_commitments WHERE booking_id=$1 ORDER BY revision DESC LIMIT 1",[input.bookingId]);
    const current=prior.rows[0];
    if ((current?.revision??0)!==input.expectedRevision) throw new QuoteError(409,"STALE_COMMITMENT","Refresh pickup commitment.");
    const cancelled=input.promisedAt==="";
    if (!input.reason?.trim() || (!cancelled && (!/^private:[A-Za-z0-9/_-]+$/.test(input.evidenceRef) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(input.promisedAt) || !Number.isFinite(Date.parse(input.promisedAt))))) throw new QuoteError(400,"INVALID_COMMITMENT","UTC promise, agreement evidence and reason are required.");
    const id=randomUUID();
    await client.query("INSERT INTO pickup_commitments(id,booking_id,job_id,revision,supersedes_id,promised_at,branch_timezone,recorded_by,customer_agreement_evidence_ref,reason,cancellation_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[id,input.bookingId,row.job_id,input.expectedRevision+1,current?.id??null,cancelled?null:input.promisedAt,zone,actor.userId,cancelled?null:input.evidenceRef,input.reason,cancelled?input.reason:null]);
    return {commitmentId:id};
  });
}
export const bookingCommercialContext = commercialContext;
