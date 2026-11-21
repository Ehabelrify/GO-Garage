import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AcceptedQuoteSnapshot, PolicyRef, PromotionReservation, QuoteVersionRef } from "@garage/domain";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { dateOnlyFromSql } from "../../infrastructure/database/date-only";
import { canAccessBranch, canManageBookings, type GarageActor } from "../auth/authz";
import { reserveConfirmedBooking, cancelConfirmedBooking } from "../operations/booking-service";
import { demandFromWork, occupancyByDay } from "../operations/availability-service";
import { allocatePromotionInTransaction } from "./qualification-service";
import { commercialContext, type ExecutionContext } from "./policy-service";

export class ReservationError extends Error { constructor(public status:number, public code:string, message:string){super(message);} }
const fail=(status:number,code:string,message:string):never=>{throw new ReservationError(status,code,message);};
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const inputDate=(value:string)=>{try{return dateOnlyFromSql(value);}catch{return fail(400,"INVALID_DATE","Choose a valid local date.");}};
type Terms={validityDays:number;deposit:{required:boolean;amount:unknown;refundRule:{ar:string;en:string}};cancellationRule:{ar:string;en:string};cancellationDisposition:"retain"|"release"|"review-required";priceLock:true;redemptionTiming:"booking"|"installation";restoreAllowed:boolean;expiryAction:"release"|"review-required"};
type Row={id:string;environment_id:string;quote_id:string;quote_revision:number;promotion_id:string;promotion_version:number;qualification_id:string|null;allocation_id:string|null;branch_id:string;beneficiary_id:string;vehicle_id:string;accepted_snapshot:AcceptedQuoteSnapshot;policy_snapshot:Terms|null;effective_on:string;expires_on:string|null;expiry_basis:"approved-date"|"approved-no-expiry"|null;deposit_state:PromotionReservation["deposit"]["state"];deposit_reference:string|null;booking_id:string|null;status:PromotionReservation["status"]|"enquiry";revision:number};
function project(row:Row):PromotionReservation {if(row.status==="enquiry")throw new ReservationError(422,"POLICY_UNCONFIGURED","This enquiry has no firm reservation or expiry promise.");if(row.expiry_basis===null)throw new ReservationError(422,"POLICY_UNCONFIGURED","This enquiry has no firm reservation or expiry promise.");return {id:row.id,acceptedQuote:{quoteId:row.quote_id,revision:row.quote_revision},promotion:{id:row.promotion_id,version:row.promotion_version},qualificationId:row.qualification_id,status:row.status,effectiveOn:dateOnlyFromSql(row.effective_on),expiresOn:row.expires_on?dateOnlyFromSql(row.expires_on):null,expiryBasis:row.expiry_basis,deposit:{state:row.deposit_state,reference:row.deposit_reference},bookingId:row.booking_id,revision:row.revision};}
function access(actor:GarageActor,branch:string){if(!canManageBookings(actor)||!canAccessBranch(actor,branch)) fail(404,"RESERVATION_NOT_FOUND","Reservation not found.");}
async function idempotent(client:PoolClient,context:ExecutionContext,actor:GarageActor,action:string,entity:string,key:string,body:unknown){const requestHash=hash(body);const prior=await client.query<{request_hash:string;result:unknown}>("SELECT request_hash,result FROM promotion_reservation_idempotency WHERE environment_id=$1 AND actor_id=$2 AND action=$3 AND entity_id=$4 AND idempotency_key=$5",[context.environmentId,actor.userId,action,entity,key]);if(prior.rowCount){if(prior.rows[0].request_hash!==requestHash)fail(409,"IDEMPOTENCY_CONFLICT","This key belongs to a different request.");return prior.rows[0].result;}return null;}
async function record(client:PoolClient,context:ExecutionContext,actor:GarageActor,action:string,entity:string,key:string,body:unknown,result:unknown){await client.query("INSERT INTO promotion_reservation_idempotency(environment_id,actor_id,action,entity_id,idempotency_key,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)",[context.environmentId,actor.userId,action,entity,key,hash(body),JSON.stringify(result)]);}
async function policy(client:PoolClient,branchId:string):Promise<{id:string;version:number;value:Terms}|null>{const q=await client.query<{policy_id:string;version:number;value:Terms}>("SELECT v.policy_id,v.version,v.value FROM commercial_policy_active a JOIN commercial_policy_versions v USING(policy_id,version) WHERE v.policy_id=$1 AND v.family='reservation-deposit' AND v.state='approved' AND (v.effective_from IS NULL OR v.effective_from<=CURRENT_DATE) AND (v.effective_through IS NULL OR v.effective_through>=CURRENT_DATE) AND v.approved_by IS NOT NULL AND v.evidence_ref IS NOT NULL",[`reservation-deposit:${branchId}`]);const r=q.rows[0];if(!r||!Number.isInteger(r.value?.validityDays)||r.value.validityDays<=0||r.value.priceLock!==true||!r.value.deposit||!r.value.cancellationRule?.ar||!r.value.cancellationRule?.en||!r.value.deposit.refundRule?.ar||!r.value.deposit.refundRule?.en||!["retain","release","review-required"].includes(r.value.cancellationDisposition)||!["booking","installation"].includes(r.value.redemptionTiming)||typeof r.value.restoreAllowed!=="boolean"||!["release","review-required"].includes(r.value.expiryAction))return null;return{id:r.policy_id,version:r.version,value:r.value};}
async function source(client:PoolClient,context:ExecutionContext,ref:QuoteVersionRef,promotion:PolicyRef,requireActive=true){const q=await client.query<{branch_id:string;customer_id:string;vehicle_id:string;current_revision:number;accepted_revision:number;accepted_snapshot:AcceptedQuoteSnapshot}>("SELECT h.branch_id,h.customer_id,h.vehicle_id,h.current_revision,h.accepted_revision,a.accepted_snapshot FROM quote_heads h JOIN quote_acceptance_events a ON a.quote_id=h.id AND a.revision=$2 WHERE h.id=$1 AND h.environment_id=$3 AND a.environment_id=$3",[ref.quoteId,ref.revision,context.environmentId]);const row=q.rows[0];if(!row||row.current_revision!==ref.revision||row.accepted_revision!==ref.revision||row.accepted_snapshot.vehicle.vehicleId!==row.vehicle_id||row.accepted_snapshot.branchId!==row.branch_id||row.accepted_snapshot.customerId!==row.customer_id)fail(409,"ACCEPTED_QUOTE_MISMATCH","A current accepted quote is required.");const p=await client.query("SELECT 1 FROM commercial_policy_active a JOIN commercial_policy_versions v USING(policy_id,version) WHERE a.policy_id=$1 AND a.version=$2 AND v.family='promotion-qualification' AND v.state='approved'",[promotion.id,promotion.version]);if(requireActive&&!p.rowCount)fail(422,"POLICY_UNCONFIGURED","An active approved promotion version is required.");return row;}
async function lockEvidence(client:PoolClient,context:ExecutionContext,qualificationId:string,promotionId:string,version:number){
  const evidence=await client.query<{kind:string;reference_id:string}>("SELECT kind,reference_id FROM promotion_evidence WHERE qualification_id=$1 ORDER BY kind,reference_id FOR UPDATE",[qualificationId]);
  const rule=await client.query<{value:{evidenceVerification?:{expiresAfterDays:number|null}}}>("SELECT value FROM commercial_policy_versions WHERE policy_id=$1 AND version=$2",[promotionId,version]);
  for(const fact of evidence.rows.filter(x=>x.kind==="membership-verification")){
    const verified=(await client.query<{revoked_at:Date|null;expires_at:Date|null;verified_at:Date}>("SELECT revoked_at,expires_at,verified_at FROM promotion_membership_verifications WHERE id=$1 AND environment_id=$2 FOR UPDATE",[fact.reference_id,context.environmentId])).rows[0];
    const days=rule.rows[0]?.value.evidenceVerification?.expiresAfterDays;
    if(!verified||verified.revoked_at||verified.expires_at&&verified.expires_at.getTime()<=Date.now()||days!==null&&days!==undefined&&Date.now()-verified.verified_at.getTime()>days*86400000)fail(409,"VERIFICATION_EXPIRED","Current qualification evidence is required.");
  }
}
async function lockChain(client:PoolClient,context:ExecutionContext,row:Pick<Row,"promotion_id"|"promotion_version"|"qualification_id"|"allocation_id"|"id">){await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`promotion:${context.environmentId}:${row.promotion_id}:${row.promotion_version}`]);await client.query("SELECT 1 FROM promotion_pools WHERE environment_id=$1 AND promotion_id=$2 AND policy_version=$3 FOR UPDATE",[context.environmentId,row.promotion_id,row.promotion_version]);if(row.qualification_id){await client.query("SELECT 1 FROM promotion_qualifications WHERE id=$1 FOR UPDATE",[row.qualification_id]);await lockEvidence(client,context,row.qualification_id,row.promotion_id,row.promotion_version);}if(row.allocation_id)await client.query("SELECT 1 FROM promotion_allocations WHERE id=$1 FOR UPDATE",[row.allocation_id]);await client.query("SELECT 1 FROM promotion_reservations WHERE id=$1 FOR UPDATE",[row.id]);}
async function fetch(client:PoolClient,context:ExecutionContext,id:string):Promise<Row>{const row=(await client.query<Row>("SELECT *,effective_on::text AS effective_on,expires_on::text AS expires_on FROM promotion_reservations WHERE id=$1 AND environment_id=$2",[id,context.environmentId])).rows[0];if(!row)fail(404,"RESERVATION_NOT_FOUND","Reservation not found.");return row;}
export async function reserveOffer(context:ExecutionContext,actor:GarageActor,input:{quoteRef:QuoteVersionRef;promotionRef:PolicyRef;qualificationId:string|null;effectiveOn:string;idempotencyKey:string}):Promise<PromotionReservation>{
  if(!input.idempotencyKey||!input.quoteRef?.quoteId||!input.promotionRef?.id)fail(400,"INVALID_RESERVATION","Quote, promotion and idempotency key are required.");
  const effective=inputDate(input.effectiveOn);if(effective<new Date().toISOString().slice(0,10))fail(400,"INVALID_EFFECTIVE_DATE","Choose a current or future effective date.");
  return withTransaction(async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`promotion:${context.environmentId}:${input.promotionRef.id}:${input.promotionRef.version}`]);
    await client.query("SELECT 1 FROM promotion_pools WHERE environment_id=$1 AND promotion_id=$2 AND policy_version=$3 FOR UPDATE",[context.environmentId,input.promotionRef.id,input.promotionRef.version]);
    const prior=await idempotent(client,context,actor,"reserve",input.quoteRef.quoteId,input.idempotencyKey,input);if(prior)return "enquiryId" in (prior as object)?null:prior as PromotionReservation;
    const quote=await source(client,context,input.quoteRef,input.promotionRef);access(actor,quote.branch_id);
    const booked=await client.query("SELECT 1 FROM bookings WHERE accepted_quote_id=$1 AND accepted_quote_revision=$2 AND status='confirmed' LIMIT 1",[input.quoteRef.quoteId,input.quoteRef.revision]);
    if(booked.rowCount)fail(409,"QUOTE_ALREADY_SCHEDULED","This accepted quote already has a confirmed installation.");
    const approved=await policy(client,quote.branch_id);
    if(input.qualificationId)await client.query("SELECT 1 FROM promotion_qualifications WHERE id=$1 FOR UPDATE",[input.qualificationId]);
    const existing=input.qualificationId&&approved?await client.query<{id:string;vehicle_id:string;beneficiary_id:string;status:string}>("SELECT id,vehicle_id,beneficiary_id,status FROM promotion_allocations WHERE environment_id=$1 AND promotion_id=$2 AND policy_version=$3 AND qualification_id=$4 AND quote_id=$5 AND quote_revision=$6 FOR UPDATE",[context.environmentId,input.promotionRef.id,input.promotionRef.version,input.qualificationId,input.quoteRef.quoteId,input.quoteRef.revision]):null;
    const allocation=existing?.rows[0]?null:input.qualificationId&&approved?await allocatePromotionInTransaction(client,context,actor,{promotionRef:input.promotionRef,qualificationId:input.qualificationId,quoteRef:input.quoteRef,idempotencyKey:`reservation:${input.idempotencyKey}`}):null;
    const matched=existing?.rows[0]??allocation?.find(x=>x.vehicleId===quote.vehicle_id&&x.beneficiaryId===quote.customer_id);
    if(existing?.rows[0]&&(existing.rows[0].vehicle_id!==quote.vehicle_id||existing.rows[0].beneficiary_id!==quote.customer_id||existing.rows[0].status!=="reserved")||allocation&&!matched)fail(409,"ALLOCATION_MISMATCH","Qualification does not cover this quote and vehicle.");
    const firm=!!approved&&!!matched;
    const expiry=firm?new Date(Date.parse(`${effective}T12:00:00Z`)+(approved!.value.validityDays-1)*86400000).toISOString().slice(0,10):null;
    const id=randomUUID();
    await client.query("INSERT INTO promotion_reservations(id,environment_id,quote_id,quote_revision,promotion_id,promotion_version,qualification_id,allocation_id,branch_id,beneficiary_id,vehicle_id,accepted_snapshot,policy_id,policy_version,policy_snapshot,effective_on,expires_on,expiry_basis,deposit_state,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)",[id,context.environmentId,input.quoteRef.quoteId,input.quoteRef.revision,input.promotionRef.id,input.promotionRef.version,firm?input.qualificationId:null,firm?matched!.id:null,quote.branch_id,quote.customer_id,quote.vehicle_id,JSON.stringify(quote.accepted_snapshot),firm?approved!.id:null,firm?approved!.version:null,firm?JSON.stringify(approved!.value):null,effective,expiry,firm?"approved-date":null,firm?(approved!.value.deposit.required?"unrecorded":"not-required"):"unrecorded",firm?"reserved":"enquiry",actor.userId]);
    await client.query("INSERT INTO promotion_reservation_events(reservation_id,revision,action,actor_id) VALUES($1,1,$2,$3)",[id,firm?"reserved":"enquired",actor.userId]);
    if(!firm){await record(client,context,actor,"reserve",input.quoteRef.quoteId,input.idempotencyKey,input,{enquiryId:id});return null;}
    const result:PromotionReservation={id,acceptedQuote:input.quoteRef,promotion:input.promotionRef,qualificationId:input.qualificationId,status:"reserved",effectiveOn:effective,expiresOn:expiry,expiryBasis:"approved-date",deposit:{state:approved!.value.deposit.required?"unrecorded":"not-required",reference:null},bookingId:null,revision:1};
    await record(client,context,actor,"reserve",input.quoteRef.quoteId,input.idempotencyKey,input,result);return result;
  }).then(result=>result??fail(422,"POLICY_UNCONFIGURED","Enquiry saved; complete approved reservation policy and qualification/allocation are required before a firm reservation."));
}
export async function scheduleReservation(context:ExecutionContext,actor:GarageActor,input:{reservationId:string;expectedRevision:number;slot:{dropoffDate:string;dropoffTime:string;configurationVersion?:string};idempotencyKey:string}):Promise<{reservation:PromotionReservation;bookingId:string}>{
  if(!input.idempotencyKey)fail(400,"INVALID_KEY","Idempotency key required.");
  return withTransaction(async client=>{
    const initial=await fetch(client,context,input.reservationId);access(actor,initial.branch_id);await lockChain(client,context,initial);
    const prior=await idempotent(client,context,actor,"schedule",initial.id,input.idempotencyKey,input);if(prior)return prior as {reservation:PromotionReservation;bookingId:string};
    const row=await fetch(client,context,initial.id);if(row.revision!==input.expectedRevision||row.status!=="reserved"||row.booking_id)fail(409,"STALE_RESERVATION","Refresh this reservation.");
    const grouping=await client.query<{value:{grouping?:{timing:string}}}>("SELECT value FROM commercial_policy_versions WHERE policy_id=$1 AND version=$2 AND family='promotion-qualification' AND state='approved'",[row.promotion_id,row.promotion_version]);
    const group=await client.query<{vehicle_ids:string[]}>("SELECT vehicle_ids FROM promotion_qualifications WHERE id=$1",[row.qualification_id]);
    if(grouping.rows[0]?.value.grouping?.timing==="same-booking"&&(group.rows[0]?.vehicle_ids.length??0)>1)fail(409,"GROUP_SCHEDULING_REQUIRED","Schedule the qualified vehicle group together.");
    const day=inputDate(input.slot.dropoffDate);if(day<row.effective_on||row.expires_on&&day>dateOnlyFromSql(row.expires_on))fail(409,"RESERVATION_OUTSIDE_VALIDITY","Choose a date within approved reservation validity.");
    const quote=await source(client,context,{quoteId:row.quote_id,revision:row.quote_revision},{id:row.promotion_id,version:row.promotion_version},false);
    if(quote.branch_id!==row.branch_id||quote.customer_id!==row.beneficiary_id||quote.vehicle_id!==row.vehicle_id||hash(quote.accepted_snapshot)!==hash(row.accepted_snapshot))fail(409,"RESERVATION_SOURCE_CHANGED","A new eligible quote and acceptance are required.");
    const allocation=await client.query<{status:string;qualification_id:string;vehicle_id:string;beneficiary_id:string}>("SELECT status,qualification_id,vehicle_id,beneficiary_id FROM promotion_allocations WHERE id=$1",[row.allocation_id]);
    if(allocation.rows[0]?.status!=="reserved"||allocation.rows[0].qualification_id!==row.qualification_id||allocation.rows[0].vehicle_id!==row.vehicle_id||allocation.rows[0].beneficiary_id!==row.beneficiary_id)fail(409,"ALLOCATION_CHANGED","Promotion allocation changed.");
    const qualification=await client.query<{state:string;beneficiary_id:string;branch_id:string;vehicle_ids:string[]}>("SELECT state,beneficiary_id,branch_id,vehicle_ids FROM promotion_qualifications WHERE id=$1",[row.qualification_id]);
    if(qualification.rows[0]?.state!=="eligible"||qualification.rows[0].beneficiary_id!==row.beneficiary_id||qualification.rows[0].branch_id!==row.branch_id||!qualification.rows[0].vehicle_ids.includes(row.vehicle_id))fail(409,"QUALIFICATION_CHANGED","Promotion qualification requires review.");
    const work=row.accepted_snapshot.work;if(!work.length)fail(422,"POLICY_UNCONFIGURED","Accepted work components are required.");
    const result=await reserveConfirmedBooking(client,{kind:"staff",userId:actor.userId},{branchId:row.branch_id,customerId:row.beneficiary_id,vehicleId:row.vehicle_id,serviceId:work[0].serviceId,dropoffDate:day,dropoffTime:input.slot.dropoffTime,idempotencyKey:`reservation:${row.id}:${input.idempotencyKey}`,quoteRef:{quoteId:row.quote_id,revision:row.quote_revision},configurationVersion:input.slot.configurationVersion},row.id);
    if(!("bookingId" in result)){if(result.status==="capacity-conflict")throw new ReservationError(409,"CAPACITY_CONFLICT",`Slot unavailable (${result.reason}); choose another available slot.`);throw new ReservationError(422,"BOOKING_UNAVAILABLE",result.status==="requires-human"?result.reasons.join(", "):"Booking could not be confirmed.");}
    const bookingId=result.bookingId;
    if(row.policy_snapshot?.redemptionTiming==="booking"){
      await client.query("UPDATE promotion_allocations SET status='consumed' WHERE id=$1 AND status='reserved'",[row.allocation_id]);
      await client.query("UPDATE promotion_pools SET reserved_units=reserved_units-1,consumed_units=consumed_units+1 WHERE environment_id=$1 AND promotion_id=$2 AND policy_version=$3",[context.environmentId,row.promotion_id,row.promotion_version]);
      await client.query("INSERT INTO promotion_allocation_events(allocation_id,action,actor_id) VALUES($1,'consumed',$2)",[row.allocation_id,actor.userId]);
    }
    const status=row.policy_snapshot?.redemptionTiming==="booking"?"redeemed":"scheduled";
    await client.query("UPDATE promotion_reservations SET status=$2,booking_id=$3,revision=revision+1 WHERE id=$1",[row.id,status,bookingId]);
    await client.query("INSERT INTO promotion_reservation_events(reservation_id,revision,action,actor_id,booking_id) VALUES($1,$2,$3,$4,$5)",[row.id,row.revision+1,status==="redeemed"?"redeemed":"scheduled",actor.userId,bookingId]);
    const updated=await fetch(client,context,row.id),out={reservation:project(updated),bookingId};await record(client,context,actor,"schedule",row.id,input.idempotencyKey,input,out);return out;
  });
}
export async function scheduleReservationGroup(context:ExecutionContext,actor:GarageActor,input:{qualificationId:string;items:Array<{reservationId:string;expectedRevision:number;slot:{dropoffDate:string;dropoffTime:string;configurationVersion?:string}}>;idempotencyKey:string}):Promise<Array<{reservation:PromotionReservation;bookingId:string}>>{
  if(!input.idempotencyKey||!input.qualificationId||input.items.length<2||new Set(input.items.map(x=>x.reservationId)).size!==input.items.length)fail(400,"INVALID_GROUP","Distinct reservations and an idempotency key are required.");
  return withTransaction(async client=>{
    const initial:Row[]=[];for(const item of input.items)initial.push(await fetch(client,context,item.reservationId));
    for(const row of initial)access(actor,row.branch_id);
    if(new Set(initial.map(x=>`${x.promotion_id}:${x.promotion_version}:${x.qualification_id}:${x.beneficiary_id}:${x.branch_id}`)).size!==1||initial[0].qualification_id!==input.qualificationId)fail(409,"GROUP_SOURCE_MISMATCH","Reservations must share one qualification, beneficiary, branch and promotion version.");
    const first=initial[0];
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`promotion:${context.environmentId}:${first.promotion_id}:${first.promotion_version}`]);
    await client.query("SELECT 1 FROM promotion_pools WHERE environment_id=$1 AND promotion_id=$2 AND policy_version=$3 FOR UPDATE",[context.environmentId,first.promotion_id,first.promotion_version]);
    await client.query("SELECT 1 FROM promotion_qualifications WHERE id=$1 FOR UPDATE",[input.qualificationId]);
    await lockEvidence(client,context,input.qualificationId,first.promotion_id,first.promotion_version);
    for(const id of initial.map(x=>x.allocation_id).filter((x):x is string=>!!x).sort())await client.query("SELECT 1 FROM promotion_allocations WHERE id=$1 FOR UPDATE",[id]);
    for(const id of initial.map(x=>x.id).sort())await client.query("SELECT 1 FROM promotion_reservations WHERE id=$1 FOR UPDATE",[id]);
    const prior=await idempotent(client,context,actor,"schedule-group",input.qualificationId,input.idempotencyKey,input);if(prior)return prior as Array<{reservation:PromotionReservation;bookingId:string}>;
    const qualification=(await client.query<{state:string;vehicle_ids:string[];beneficiary_id:string;branch_id:string}>("SELECT state,vehicle_ids,beneficiary_id,branch_id FROM promotion_qualifications WHERE id=$1",[input.qualificationId])).rows[0];
    const rule=(await client.query<{value:{grouping?:{timing:string;timingWindowHours:number}}}>("SELECT value FROM commercial_policy_versions WHERE policy_id=$1 AND version=$2 AND family='promotion-qualification' AND state='approved'",[first.promotion_id,first.promotion_version])).rows[0]?.value;
    const grouping=rule?.grouping;
    if(!qualification||qualification.state!=="eligible"||qualification.beneficiary_id!==first.beneficiary_id||qualification.branch_id!==first.branch_id||!grouping||!qualification.vehicle_ids||qualification.vehicle_ids.length!==input.items.length)fail(409,"GROUP_SOURCE_MISMATCH","The approved qualification does not cover this whole group.");
    const rows:Row[]=[];const capacityKeys:string[]=[];const legacyKeys:string[]=[];
    for(const item of input.items){
      const row=await fetch(client,context,item.reservationId),day=inputDate(item.slot.dropoffDate);
      if(row.status!=="reserved"||row.revision!==item.expectedRevision||row.booking_id||row.vehicle_id===undefined||!qualification.vehicle_ids.includes(row.vehicle_id)||day<dateOnlyFromSql(row.effective_on)||row.expires_on&&day>dateOnlyFromSql(row.expires_on))fail(409,"STALE_RESERVATION","Refresh group reservation validity and revisions.");
      const quote=await source(client,context,{quoteId:row.quote_id,revision:row.quote_revision},{id:row.promotion_id,version:row.promotion_version},false);
      if(quote.branch_id!==row.branch_id||quote.customer_id!==row.beneficiary_id||quote.vehicle_id!==row.vehicle_id||hash(quote.accepted_snapshot)!==hash(row.accepted_snapshot))fail(409,"GROUP_SOURCE_MISMATCH","A new eligible accepted quote is required.");
      const allocation=(await client.query<{status:string;vehicle_id:string;beneficiary_id:string;qualification_id:string}>("SELECT status,vehicle_id,beneficiary_id,qualification_id FROM promotion_allocations WHERE id=$1",[row.allocation_id])).rows[0];
      if(allocation?.status!=="reserved"||allocation.vehicle_id!==row.vehicle_id||allocation.beneficiary_id!==row.beneficiary_id||allocation.qualification_id!==input.qualificationId)fail(409,"ALLOCATION_CHANGED","Group allocation changed.");
      const demand=await demandFromWork(client,row.accepted_snapshot.work),occupancyDemand=demand.demand;if(!occupancyDemand)throw new ReservationError(422,"POLICY_UNCONFIGURED",demand.missing.join(", "));
      legacyKeys.push(`${row.branch_id}:${day}`);
      for(const [date,bays] of occupancyByDay(day,occupancyDemand))for(const bay of ["intake",...bays.keys()])capacityKeys.push(`${row.branch_id}:${date}:${bay}`);
      rows.push(row);
    }
    if(new Set(rows.map(x=>x.vehicle_id)).size!==qualification.vehicle_ids.length)fail(409,"GROUP_SOURCE_MISMATCH","One reservation per qualified vehicle is required.");
    if(grouping?.timing==="same-booking"){
      const instants=input.items.map(x=>Date.parse(`${x.slot.dropoffDate}T${x.slot.dropoffTime}:00Z`));
      if(instants.some(x=>!Number.isFinite(x))||Math.max(...instants)-Math.min(...instants)>grouping.timingWindowHours*3600000)fail(409,"GROUP_TIMING_MISMATCH","Selected slots exceed the approved same-booking timing window.");
    }
    await client.query("SELECT pg_advisory_xact_lock_shared(hashtext('booking-capacity-settings'))");
    for(const key of [...new Set([...legacyKeys,...capacityKeys])].sort())await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[key]);
    const output:Array<{reservation:PromotionReservation;bookingId:string}>=[];
    for(const [index,item] of input.items.entries()){
      const row=rows[index];const work=row.accepted_snapshot.work;
      if(!work.length)fail(422,"POLICY_UNCONFIGURED","Accepted work components are required.");
      const booked=await reserveConfirmedBooking(client,{kind:"staff",userId:actor.userId},{branchId:row.branch_id,customerId:row.beneficiary_id,vehicleId:row.vehicle_id,serviceId:work[0].serviceId,dropoffDate:item.slot.dropoffDate,dropoffTime:item.slot.dropoffTime,idempotencyKey:`reservation-group:${input.qualificationId}:${input.idempotencyKey}:${row.id}`,quoteRef:{quoteId:row.quote_id,revision:row.quote_revision},configurationVersion:item.slot.configurationVersion},row.id);
      if(!("bookingId" in booked)){if(booked.status==="capacity-conflict")throw new ReservationError(409,"CAPACITY_CONFLICT",`Slot unavailable (${booked.reason}); choose other group slots.`);throw new ReservationError(422,"BOOKING_UNAVAILABLE","Group booking could not be confirmed.");}
      const bookingId=booked.bookingId;
      const redeem=row.policy_snapshot?.redemptionTiming==="booking";
      if(redeem){await client.query("UPDATE promotion_allocations SET status='consumed' WHERE id=$1 AND status='reserved'",[row.allocation_id]);await client.query("UPDATE promotion_pools SET reserved_units=reserved_units-1,consumed_units=consumed_units+1 WHERE environment_id=$1 AND promotion_id=$2 AND policy_version=$3",[context.environmentId,row.promotion_id,row.promotion_version]);await client.query("INSERT INTO promotion_allocation_events(allocation_id,action,actor_id) VALUES($1,'consumed',$2)",[row.allocation_id,actor.userId]);}
      await client.query("UPDATE promotion_reservations SET status=$2,booking_id=$3,revision=revision+1 WHERE id=$1",[row.id,redeem?"redeemed":"scheduled",bookingId]);
      await client.query("INSERT INTO promotion_reservation_events(reservation_id,revision,action,actor_id,booking_id) VALUES($1,$2,$3,$4,$5)",[row.id,row.revision+1,redeem?"redeemed":"scheduled",actor.userId,bookingId]);
      output.push({reservation:project(await fetch(client,context,row.id)),bookingId});
    }
    await record(client,context,actor,"schedule-group",input.qualificationId,input.idempotencyKey,input,output);return output;
  });
}
export async function recordReservationDepositReference(context:ExecutionContext,actor:GarageActor,input:{id:string;expectedRevision:number;reference:string;reason:string}):Promise<PromotionReservation>{
  if(!/^private:[A-Za-z0-9/_-]+$/.test(input.reference)||!input.reason?.trim())fail(400,"INVALID_DEPOSIT_REFERENCE","A protected reference and reason are required.");
  return withTransaction(async client=>{const initial=await fetch(client,context,input.id);access(actor,initial.branch_id);await lockChain(client,context,initial);const row=await fetch(client,context,input.id);
    if(row.revision!==input.expectedRevision||row.status==="enquiry"||row.deposit_state!=="unrecorded"||row.policy_snapshot?.deposit.required!==true)fail(409,"DEPOSIT_STATE_CHANGED","Refresh deposit state and policy.");
    await client.query("UPDATE promotion_reservations SET deposit_state='reference-only',deposit_reference=$2,revision=revision+1 WHERE id=$1",[row.id,input.reference]);
    await client.query("INSERT INTO promotion_reservation_deposit_events(reservation_id,state,reference,actor_id,reason) VALUES($1,'reference-only',$2,$3,$4)",[row.id,input.reference,actor.userId,input.reason.trim()]);
    await client.query("INSERT INTO promotion_reservation_events(reservation_id,revision,action,actor_id,reason,evidence_ref) VALUES($1,$2,'deposit-reference',$3,$4,$5)",[row.id,row.revision+1,actor.userId,input.reason.trim(),input.reference]);
    return project(await fetch(client,context,row.id));});
}
/** Called before the job row is locked, preserving commercial → booking/job order. */
export async function lockReservationForJobDelivery(client:PoolClient,context:ExecutionContext,jobId:string):Promise<string|null>{
  const discovered=(await client.query<{id:string}>("SELECT r.id FROM promotion_reservations r JOIN jobs j ON j.booking_id=r.booking_id WHERE j.id=$1 AND r.environment_id=$2",[jobId,context.environmentId])).rows[0];
  if(!discovered)return null;
  const row=await fetch(client,context,discovered.id);await lockChain(client,context,row);return row.id;
}
/** The caller has already recorded a successful delivered job in this transaction. */
export async function redeemReservationOnJobDelivery(client:PoolClient,context:ExecutionContext,actor:GarageActor,reservationId:string|null,jobId:string):Promise<void>{
  if(!reservationId)return;
  const row=await fetch(client,context,reservationId);
  const job=(await client.query<{booking_id:string;stage:string;branch_id:string}>("SELECT booking_id,stage,branch_id FROM jobs WHERE id=$1",[jobId])).rows[0];
  if(!job||job.booking_id!==row.booking_id||job.branch_id!==row.branch_id||job.stage!=="delivered")fail(409,"DELIVERY_LINK_CHANGED","Linked job delivery must succeed before redemption.");
  if(row.status==="redeemed")return;
  if(row.status!=="scheduled"||row.policy_snapshot?.redemptionTiming!=="installation"||!row.allocation_id)fail(409,"REDEMPTION_UNAVAILABLE","Reservation is not awaiting installation redemption.");
  const allocation=await client.query("UPDATE promotion_allocations SET status='consumed' WHERE id=$1 AND status='reserved' RETURNING id",[row.allocation_id]);
  if(!allocation.rowCount)fail(409,"ALLOCATION_CHANGED","Reserved promotion allocation is unavailable.");
  await client.query("UPDATE promotion_pools SET reserved_units=reserved_units-1,consumed_units=consumed_units+1 WHERE environment_id=$1 AND promotion_id=$2 AND policy_version=$3",[context.environmentId,row.promotion_id,row.promotion_version]);
  await client.query("INSERT INTO promotion_allocation_events(allocation_id,action,actor_id) VALUES($1,'consumed',$2)",[row.allocation_id,actor.userId]);
  await client.query("UPDATE promotion_reservations SET status='redeemed',revision=revision+1 WHERE id=$1",[row.id]);
  await client.query("INSERT INTO promotion_reservation_events(reservation_id,revision,action,actor_id,booking_id) VALUES($1,$2,'redeemed',$3,$4)",[row.id,row.revision+1,actor.userId,row.booking_id]);
}
export async function correctReservation(context:ExecutionContext,actor:GarageActor,input:{id:string;expectedRevision:number;action:"cancel"|"restore"|"expire";reason:string;evidenceRef:string}):Promise<PromotionReservation>{
  if(!input.reason?.trim()||!/^private:[A-Za-z0-9/_-]+$/.test(input.evidenceRef))fail(400,"CORRECTION_EVIDENCE_REQUIRED","Reason and protected evidence are required.");
  return withTransaction(async client=>{const initial=await fetch(client,context,input.id);access(actor,initial.branch_id);if(!["owner","branch-manager"].includes(actor.role))fail(403,"ROLE_FORBIDDEN","Correction authority required.");await lockChain(client,context,initial);const row=await fetch(client,context,input.id);
    if(row.revision!==input.expectedRevision)fail(409,"STALE_RESERVATION","Refresh correction history.");
    if(row.booking_id&&input.action!=="cancel"&&input.action!=="restore")fail(409,"BOOKING_CORRECTION_REQUIRED","A confirmed installation must be changed through the booking service.");
    if(input.action==="restore"&&(!row.policy_snapshot?.restoreAllowed||!["cancelled","expired"].includes(row.status)))fail(409,"RESTORE_UNAVAILABLE","Approved policy does not allow restoration.");
    if(input.action!=="restore"&&row.status!=="reserved"&&!(input.action==="cancel"&&row.booking_id&&["scheduled","redeemed"].includes(row.status)))fail(409,"CORRECTION_UNAVAILABLE","This reservation cannot be corrected in its current state.");
    if(input.action==="expire"&&(!row.expires_on||dateOnlyFromSql(row.expires_on)>=new Date().toISOString().slice(0,10)))fail(409,"NOT_EXPIRED","Approved validity has not ended.");
    if(input.action==="cancel"&&row.policy_snapshot?.cancellationDisposition==="review-required")fail(409,"CANCELLATION_REVIEW_REQUIRED","Approved policy requires human review before changing entitlement.");
    if(input.action==="cancel"&&row.booking_id){
      const outcome=await cancelConfirmedBooking(client,{kind:"staff",userId:actor.userId},{bookingId:row.booking_id,idempotencyKey:`reservation-cancel:${row.id}:${row.revision}`,reason:input.reason.trim()});
      if(outcome.status!=="cancelled"&&outcome.status!=="replayed")fail(409,"BOOKING_NOT_CANCELLABLE","The linked installation cannot be cancelled through booking service.");
    }
    const status=input.action==="cancel"?"cancelled":input.action==="expire"?"expired":"reserved";
    if(row.allocation_id&&(input.action==="restore"||input.action==="expire"||row.policy_snapshot?.cancellationDisposition==="release")){
      if(input.action==="restore"){
        if(row.expires_on&&dateOnlyFromSql(row.expires_on)<new Date().toISOString().slice(0,10))fail(409,"RESERVATION_EXPIRED","A new eligible quote and acceptance are required.");
        const current=(await client.query<{status:string}>("SELECT status FROM promotion_allocations WHERE id=$1",[row.allocation_id])).rows[0];if(!current||current.status==="consumed")fail(409,"RESTORE_UNAVAILABLE","Consumed entitlement requires a new commercial decision.");
        if(current.status==="reserved"&&row.policy_snapshot?.cancellationDisposition!=="retain")fail(409,"RESTORE_UNAVAILABLE","Allocation state does not match approved restoration policy.");
        if(current.status==="reversed"){
          const cap=await client.query<{maximum_units:number;reserved_units:number;consumed_units:number}>("SELECT maximum_units,reserved_units,consumed_units FROM promotion_pools WHERE environment_id=$1 AND promotion_id=$2 AND policy_version=$3",[context.environmentId,row.promotion_id,row.promotion_version]);
          const p=cap.rows[0];if(!p||p.reserved_units+p.consumed_units>=p.maximum_units)fail(409,"PROMOTION_EXHAUSTED","No promotion units remain for restoration.");
          await client.query("UPDATE promotion_allocations SET status='reserved' WHERE id=$1 AND status='reversed'",[row.allocation_id]);
          await client.query("UPDATE promotion_pools SET reserved_units=reserved_units+1 WHERE environment_id=$1 AND promotion_id=$2 AND policy_version=$3",[context.environmentId,row.promotion_id,row.promotion_version]);
        }
      }else{
        if(input.action==="expire"&&row.policy_snapshot?.expiryAction!=="release")fail(409,"EXPIRY_REVIEW_REQUIRED","Approved policy requires human review before releasing allocation.");
        const allocation=(await client.query<{status:string}>("SELECT status FROM promotion_allocations WHERE id=$1",[row.allocation_id])).rows[0];
        if(!allocation||!["reserved","consumed"].includes(allocation.status))fail(409,"ALLOCATION_CHANGED","Allocation cannot be released again.");
        await client.query("UPDATE promotion_allocations SET status='reversed' WHERE id=$1",[row.allocation_id]);
        await client.query(`UPDATE promotion_pools SET ${allocation.status==="consumed"?"consumed_units=consumed_units-1":"reserved_units=reserved_units-1"} WHERE environment_id=$1 AND promotion_id=$2 AND policy_version=$3`,[context.environmentId,row.promotion_id,row.promotion_version]);
      }
      await client.query("INSERT INTO promotion_reservation_allocation_events(reservation_id,allocation_id,action,actor_id,reason,evidence_ref) VALUES($1,$2,$3,$4,$5,$6)",[row.id,row.allocation_id,input.action==="restore"?"restored":"released",actor.userId,input.reason.trim(),input.evidenceRef]);
    }
    await client.query("UPDATE promotion_reservations SET status=$2,booking_id=CASE WHEN $3 THEN NULL ELSE booking_id END,revision=revision+1 WHERE id=$1",[row.id,status,input.action==="restore"]);
    await client.query("INSERT INTO promotion_reservation_events(reservation_id,revision,action,actor_id,reason,evidence_ref,booking_id) VALUES($1,$2,$3,$4,$5,$6,$7)",[row.id,row.revision+1,input.action==="restore"?"restored":input.action==="expire"?"expired":"cancelled",actor.userId,input.reason.trim(),input.evidenceRef,row.booking_id]);return project(await fetch(client,context,row.id));});
}
export async function readReservation(context:ExecutionContext,actor:GarageActor,id:string){const row=await pool.query<Row>("SELECT *,effective_on::text AS effective_on,expires_on::text AS expires_on FROM promotion_reservations WHERE id=$1 AND environment_id=$2",[id,context.environmentId]);if(!row.rows[0])fail(404,"RESERVATION_NOT_FOUND","Reservation not found.");access(actor,row.rows[0].branch_id);const events=await pool.query("SELECT revision,action,reason,occurred_at,booking_id FROM promotion_reservation_events WHERE reservation_id=$1 ORDER BY revision",[id]);return {state:row.rows[0].status==="enquiry"?"enquiry":"firm",reservation:row.rows[0].status==="enquiry"?null:project(row.rows[0]),acceptedQuote:row.rows[0].accepted_snapshot,events:events.rows,missing:row.rows[0].status==="enquiry"?["approved reservation terms and matching qualification/allocation"]:[]};}
export async function listReservations(context:ExecutionContext,actor:GarageActor){if(!canManageBookings(actor))fail(403,"ROLE_FORBIDDEN","Commercial authority required.");const q=await pool.query<Row>("SELECT *,effective_on::text AS effective_on,expires_on::text AS expires_on FROM promotion_reservations WHERE environment_id=$1 AND NOT EXISTS(SELECT 1 FROM record_archives ra WHERE ra.entity_kind='reservation' AND ra.entity_id=promotion_reservations.id) AND ($2='owner' OR branch_id=ANY($3::text[])) ORDER BY created_at DESC",[context.environmentId,actor.role,actor.branchIds]);return q.rows.map(r=>({id:r.id,state:r.status==="enquiry"?"enquiry":"firm",reservation:r.status==="enquiry"?null:project(r),branchId:r.branch_id,beneficiaryId:r.beneficiary_id,vehicleId:r.vehicle_id}));}
export const reservationContext=commercialContext;




