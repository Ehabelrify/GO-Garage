import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { EligibilityResult, PromotionAllocation, PromotionRule, QualificationEvidence, PolicyRef, QuoteVersionRef } from "@garage/domain";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { canAccessBranch, canManageQuotes, canViewQuotes, type GarageActor } from "../auth/authz";
import { getCommercialPolicy, type ExecutionContext } from "./policy-service";

export class QualificationError extends Error { constructor(public status:number,public code:string,message:string){super(message);} }
const fail=(status:number,code:string,message:string):never=>{throw new QualificationError(status,code,message);};
const digest=(x:unknown)=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const protectedRef=(x:string)=>/^private:[A-Za-z0-9/_-]+$/.test(x);
const authorize=(actor:GarageActor,write=true)=>{if(!(write?canManageQuotes(actor):canViewQuotes(actor))) fail(403,"ROLE_FORBIDDEN","Commercial authority required.");};
type QualificationRow={id:string;environment_id:string;promotion_id:string;policy_version:number;branch_id:string;beneficiary_id:string;vehicle_ids:string[];state:string};
type AllocationRow={id:string;environment_id:string;promotion_id:string;policy_version:number;qualification_id:string;beneficiary_id:string;vehicle_id:string;discount_minor:string;currency:string;units:number;status:PromotionAllocation["status"]};
const projection=(x:AllocationRow):PromotionAllocation=>({id:x.id,promotion:{id:x.promotion_id,version:x.policy_version},qualificationId:x.qualification_id,beneficiaryId:x.beneficiary_id,vehicleId:x.vehicle_id,discount:{minor:Number(x.discount_minor),currency:x.currency},benefitVersion:null,units:x.units,status:x.status});
export async function verifyPromotionMembership(context:ExecutionContext,actor:GarageActor,input:{promotionRef:PolicyRef;beneficiaryId:string;branchId:string;sourceRef:string;expiresAt:string|null}){
  authorize(actor); const r=await activeRule(context,actor,input.promotionRef);
  if(r===null) return fail(422,"POLICY_UNCONFIGURED","Approved membership verification rule required.");
  if(!r.evidenceKinds.includes("membership-verification")) fail(422,"POLICY_UNCONFIGURED","Approved membership verification rule required.");
  if(!r.evidenceVerification.authorizedRoles.includes(actor.role as "owner"|"branch-manager")) fail(403,"VERIFIER_FORBIDDEN","Configured verifier role required.");
  if(!canAccessBranch(actor,input.branchId)) fail(404,"BENEFICIARY_NOT_FOUND","Beneficiary not found.");
  if(!protectedRef(input.sourceRef)||input.expiresAt!==null&&(!Number.isFinite(Date.parse(input.expiresAt))||Date.parse(input.expiresAt)<=Date.now())) fail(400,"INVALID_VERIFICATION","Protected source reference and valid expiry required.");
  return withTransaction(async client=>{
    const branch=await client.query("SELECT 1 FROM customer_branches WHERE customer_id=$1 AND branch_id=$2",[input.beneficiaryId,input.branchId]);
    if(!branch.rowCount) fail(404,"BENEFICIARY_NOT_FOUND","Beneficiary not found.");
    const id=randomUUID();
    await client.query("INSERT INTO promotion_membership_verifications(id,environment_id,promotion_id,policy_version,beneficiary_id,branch_id,source_ref,verified_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[id,context.environmentId,input.promotionRef.id,input.promotionRef.version,input.beneficiaryId,input.branchId,input.sourceRef,actor.userId,input.expiresAt]);
    await client.query("INSERT INTO promotion_membership_verification_events(verification_id,action,actor_id) VALUES($1,'verified',$2)",[id,actor.userId]);
    return {verificationId:id,state:"verified" as const};
  });
}
export async function revokePromotionMembership(context:ExecutionContext,actor:GarageActor,input:{verificationId:string}){
  authorize(actor);
  return withTransaction(async client=>{
    const fact=(await client.query<{promotion_id:string;policy_version:number;branch_id:string;revoked_at:Date|null}>("SELECT promotion_id,policy_version,branch_id,revoked_at FROM promotion_membership_verifications WHERE id=$1 AND environment_id=$2 FOR UPDATE",[input.verificationId,context.environmentId])).rows[0];
    if(!fact||!canAccessBranch(actor,fact.branch_id)) fail(404,"VERIFICATION_NOT_FOUND","Verification not found.");
    const r=await activeRule(context,actor,{id:fact.promotion_id,version:fact.policy_version});
    if(!r||!r.evidenceVerification.authorizedRoles.includes(actor.role as "owner"|"branch-manager")) fail(403,"VERIFIER_FORBIDDEN","Configured verifier role required.");
    if(fact.revoked_at) fail(409,"VERIFICATION_REVOKED","Verification already revoked.");
    await client.query("UPDATE promotion_membership_verifications SET revoked_at=now(),revoked_by=$2 WHERE id=$1",[input.verificationId,actor.userId]);
    await client.query("INSERT INTO promotion_membership_verification_events(verification_id,action,actor_id) VALUES($1,'revoked',$2)",[input.verificationId,actor.userId]);
    return {state:"revoked" as const};
  });
}
async function activeRule(context:ExecutionContext,actor:GarageActor,ref:PolicyRef):Promise<PromotionRule|null>{
  if(!ref.id.startsWith("promotion-qualification:")) fail(400,"INVALID_PROMOTION","Promotion policy reference required.");
  const policy=await getCommercialPolicy<PromotionRule>(context,actor,ref.id);
  if(policy.state!=="approved"||policy.policy.version!==ref.version) return null;
  const r=policy.value;
  return r.recipient?.transferWarranty===false&&r.stackability&&r.grouping&&Number.isInteger(r.grouping.timingWindowHours)&&r.grouping.timingWindowHours>0&&r.discountAllocation&&r.evidenceVerification&&r.exceptionAuthority&&r.grouping.maximumVehicles>=r.grouping.minimumVehicles?r:null;
}
export async function evaluateQualification(context:ExecutionContext,actor:GarageActor,input:{promotionRef:PolicyRef;beneficiaryId:string;vehicleIds:string[];evidence:QualificationEvidence[]}):Promise<EligibilityResult>{
  authorize(actor); const r=await activeRule(context,actor,input.promotionRef);
  if(!r) return {state:"unconfigured",reasons:["Complete approved promotion rules required."],criteria:[]};
  const criteria=[r.beneficiaryRule.en,`Evidence: ${r.evidenceKinds.join(", ")}`,`Vehicles: ${r.grouping.minimumVehicles}-${r.grouping.maximumVehicles}`,`Timing: ${r.grouping.timing}`];
  const rule=r;
  const review=(reason:string):EligibilityResult=>({state:"review-required",reasons:[reason],criteria});
  if(!input.beneficiaryId||new Set(input.vehicleIds).size!==input.vehicleIds.length||input.vehicleIds.length<r.grouping.minimumVehicles||input.vehicleIds.length>r.grouping.maximumVehicles) return review("Vehicle grouping requires review.");
  if(r.grouping.timing==="same-quote"&&input.vehicleIds.length>1) return review("A single accepted quote cannot prove multiple vehicles.");
  if(input.evidence.length!==1||!r.evidenceKinds.includes(input.evidence[0].kind)||!input.evidence[0].referenceIds.length) return review("Approved evidence is required.");
  const e=input.evidence[0];
  if(e.kind!=="membership-verification"&&(e.verifiedBy!==actor.userId||!e.verifiedAt||!r.evidenceVerification.authorizedRoles.includes(actor.role as "owner"|"branch-manager")||!Number.isFinite(Date.parse(e.verifiedAt))||Date.parse(e.verifiedAt)>Date.now())) return review("Authorized verification is required.");
  if(e.kind!=="membership-verification"&&r.evidenceVerification.expiresAfterDays!==null&&Date.now()-Date.parse(e.verifiedAt!)>r.evidenceVerification.expiresAfterDays*86400000) return review("Verification expired.");
  if(e.kind==="grouped-vehicles"&&(e.referenceIds.length!==input.vehicleIds.length||e.referenceIds.some(x=>!input.vehicleIds.includes(x)))) return review("Each grouped vehicle must be verified.");
  return withTransaction(async client=>{
    const vehicles=await client.query<{customer_id:string}>("SELECT customer_id FROM vehicles WHERE id=ANY($1::text[])",[input.vehicleIds]);
    if(vehicles.rowCount!==input.vehicleIds.length||vehicles.rows.some(x=>x.customer_id!==input.beneficiaryId)) return review("Vehicle ownership requires review.");
    const branches=await client.query<{branch_id:string}>("SELECT branch_id FROM customer_branches WHERE customer_id=$1",[input.beneficiaryId]);
    const branch=branches.rows.find(x=>canAccessBranch(actor,x.branch_id))?.branch_id;
    if(!branch) fail(404,"QUALIFICATION_NOT_FOUND","Qualification not found.");
    if(e.kind==="warranty-reference"){
      const warranties=await client.query<{customer_id:string;branch_id:string}>("SELECT customer_id,branch_id FROM warranties WHERE id=ANY($1::text[]) AND status='active' AND expires_on>=CURRENT_DATE",[e.referenceIds]);
      if(warranties.rowCount!==e.referenceIds.length||warranties.rows.some(x=>x.branch_id!==branch||(rule.recipient.kind==="customer"&&x.customer_id!==input.beneficiaryId)||(rule.recipient.kind==="referred-customer"&&x.customer_id===input.beneficiaryId))) return review("Warranty reference requires review.");
    }
    let verifiedBy=e.verifiedBy,verifiedAt=e.verifiedAt;
    if(e.kind==="membership-verification"){
      if(e.referenceIds.length!==1) return review("One membership verification fact is required.");
      const fact=(await client.query<{id:string;verified_by:string;verified_at:Date}>("SELECT id,verified_by,verified_at FROM promotion_membership_verifications WHERE id=$1 AND environment_id=$2 AND promotion_id=$3 AND policy_version=$4 AND beneficiary_id=$5 AND branch_id=$6 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())",[e.referenceIds[0],context.environmentId,input.promotionRef.id,input.promotionRef.version,input.beneficiaryId,branch])).rows[0];
      if(!fact||rule.evidenceVerification.expiresAfterDays!==null&&Date.now()-fact.verified_at.getTime()>rule.evidenceVerification.expiresAfterDays*86400000) return review("Current authorized membership verification is required.");
      verifiedBy=fact.verified_by;verifiedAt=fact.verified_at.toISOString();
    }
    const id=randomUUID();
    await client.query("INSERT INTO promotion_qualifications(id,environment_id,promotion_id,policy_version,branch_id,beneficiary_id,vehicle_ids,state,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'eligible',$8)",[id,context.environmentId,input.promotionRef.id,input.promotionRef.version,branch,input.beneficiaryId,input.vehicleIds,actor.userId]);
    for(const ref of e.referenceIds) await client.query("INSERT INTO promotion_evidence(qualification_id,kind,reference_id,verified_by,verified_at) VALUES($1,$2,$3,$4,$5)",[id,e.kind,ref,verifiedBy,verifiedAt]);
    return {state:"eligible" as const,qualificationId:id,criteria};
  });
}
async function replay(client:PoolClient,context:ExecutionContext,actor:GarageActor,action:string,entity:string,key:string,body:string):Promise<unknown|null>{
  const q=await client.query<{request_hash:string;result:unknown}>("SELECT request_hash,result FROM promotion_idempotency WHERE environment_id=$1 AND actor_id=$2 AND action=$3 AND entity_id=$4 AND idempotency_key=$5",[context.environmentId,actor.userId,action,entity,key]);
  if(!q.rowCount) return null; if(q.rows[0].request_hash!==body) fail(409,"IDEMPOTENCY_CONFLICT","Key belongs to a different request."); return q.rows[0].result;
}
async function saveReplay(client:PoolClient,context:ExecutionContext,actor:GarageActor,action:string,entity:string,key:string,body:string,result:unknown){await client.query("INSERT INTO promotion_idempotency(environment_id,actor_id,action,entity_id,idempotency_key,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)",[context.environmentId,actor.userId,action,entity,key,body,JSON.stringify(result)]);}
export async function allocatePromotionInTransaction(client:PoolClient,context:ExecutionContext,actor:GarageActor,input:{promotionRef:PolicyRef;qualificationId:string;quoteRef:QuoteVersionRef;quoteRefs?:QuoteVersionRef[];idempotencyKey:string}):Promise<PromotionAllocation[]>{
  authorize(actor); if(!input.idempotencyKey) fail(400,"INVALID_KEY","Idempotency key required.");
  const body=digest(input),entity=input.qualificationId;
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`promotion:${context.environmentId}:${input.promotionRef.id}:${input.promotionRef.version}`]);
  const prior=await replay(client,context,actor,"allocate",entity,input.idempotencyKey,body); if(prior) return prior as PromotionAllocation[];
  const r=await activeRule(context,actor,input.promotionRef); if(r===null)throw new QualificationError(422,"POLICY_UNCONFIGURED","Complete approved promotion policy required.");const rule=r;
  const poolRow=(await client.query<{maximum_units:number;reserved_units:number;consumed_units:number;branch_id:string|null}>("SELECT * FROM promotion_pools WHERE environment_id=$1 AND promotion_id=$2 AND policy_version=$3 FOR UPDATE",[context.environmentId,input.promotionRef.id,input.promotionRef.version])).rows[0];
  if(!poolRow) fail(422,"POLICY_UNCONFIGURED","Explicit promotion pool required.");
  const qual=(await client.query<QualificationRow>("SELECT * FROM promotion_qualifications WHERE id=$1",[input.qualificationId])).rows[0];
  if(!qual||qual.environment_id!==context.environmentId||qual.promotion_id!==input.promotionRef.id||qual.policy_version!==input.promotionRef.version||!canAccessBranch(actor,qual.branch_id)) fail(404,"QUALIFICATION_NOT_FOUND","Qualification not found.");
  if(qual.state!=="eligible"||(poolRow.branch_id&&poolRow.branch_id!==qual.branch_id)) fail(409,"QUALIFICATION_REVIEW_REQUIRED","Qualification requires review.");
  const evidence=await client.query<{kind:string;reference_id:string}>("SELECT kind,reference_id FROM promotion_evidence WHERE qualification_id=$1 ORDER BY kind,reference_id",[qual.id]);
  if(evidence.rows.some(x=>x.kind==="membership-verification")){
    const fact=(await client.query<{revoked_at:Date|null;expires_at:Date|null;verified_at:Date}>("SELECT revoked_at,expires_at,verified_at FROM promotion_membership_verifications WHERE id=$1 AND environment_id=$2 AND promotion_id=$3 AND policy_version=$4 AND beneficiary_id=$5 AND branch_id=$6 FOR UPDATE",[evidence.rows[0].reference_id,context.environmentId,qual.promotion_id,qual.policy_version,qual.beneficiary_id,qual.branch_id])).rows[0];
    if(!fact||fact.revoked_at||fact.expires_at&&fact.expires_at.getTime()<=Date.now()||rule.evidenceVerification.expiresAfterDays!==null&&Date.now()-fact.verified_at.getTime()>rule.evidenceVerification.expiresAfterDays*86400000) fail(409,"VERIFICATION_EXPIRED","Membership verification is no longer current.");
  }
  const owned=await client.query<{id:string;customer_id:string}>("SELECT id,customer_id FROM vehicles WHERE id=ANY($1::text[])",[qual.vehicle_ids]);
  if(owned.rowCount!==qual.vehicle_ids.length||owned.rows.some(x=>x.customer_id!==qual.beneficiary_id)) fail(409,"GROUP_SOURCE_MISMATCH","Vehicle ownership changed.");
  for(const e of evidence.rows){const used=await client.query("SELECT 1 FROM promotion_evidence_consumption WHERE environment_id=$1 AND kind=$2 AND reference_id=$3 FOR UPDATE",[context.environmentId,e.kind,e.reference_id]);if(used.rowCount) fail(409,"EVIDENCE_USED","Evidence already used.");}
  const refs=input.quoteRefs??[input.quoteRef];
  if(refs.length!==qual.vehicle_ids.length||new Set(refs.map(x=>`${x.quoteId}:${x.revision}`)).size!==refs.length||!refs.some(x=>x.quoteId===input.quoteRef.quoteId&&x.revision===input.quoteRef.revision)) fail(409,"GROUP_SOURCE_MISMATCH","Accepted quote references must cover every qualifying vehicle exactly once.");
  if(qual.vehicle_ids.length>1&&rule.grouping.timing==="same-quote") fail(422,"POLICY_UNCONFIGURED","The approved timing rule does not support multiple vehicles in one quote.");
  const quotes:Array<{ref:QuoteVersionRef;vehicleId:string;total:{minor:number;currency:string};acceptedAt:Date}>=[];
  for(const ref of refs){
    const quote=(await client.query<{branch_id:string;customer_id:string;accepted_snapshot:any;occurred_at:Date}>("SELECT h.branch_id,h.customer_id,a.accepted_snapshot,a.occurred_at FROM quote_heads h JOIN quote_acceptance_events a ON a.quote_id=h.id AND a.revision=$2 WHERE h.id=$1 AND h.environment_id=$3 AND a.environment_id=$3",[ref.quoteId,ref.revision,context.environmentId])).rows[0];
    if(!quote||quote.branch_id!==qual.branch_id||quote.customer_id!==qual.beneficiary_id) fail(404,"QUOTE_NOT_FOUND","Accepted quote not found.");
    const vehicleId=quote.accepted_snapshot?.vehicle?.vehicleId,total=quote.accepted_snapshot?.total;
    if(!qual.vehicle_ids.includes(vehicleId)||!total||total.currency!==rule.discountAllocation.total.currency||!Number.isSafeInteger(total.minor)) fail(409,"GROUP_SOURCE_MISMATCH","Accepted quote vehicle or currency does not match qualification.");
    quotes.push({ref,vehicleId,total,acceptedAt:quote.occurred_at});
  }
  quotes.sort((a,b)=>a.vehicleId.localeCompare(b.vehicleId));
  if(new Set(quotes.map(x=>x.vehicleId)).size!==qual.vehicle_ids.length) fail(409,"GROUP_SOURCE_MISMATCH","Each vehicle needs its own accepted quote.");
  const acceptedTimes=quotes.map(x=>x.acceptedAt.getTime());
  if(Math.max(...acceptedTimes)-Math.min(...acceptedTimes)>rule.grouping.timingWindowHours*3600000) fail(409,"GROUP_TIMING_MISMATCH","Accepted quotes fall outside the approved grouping window.");
  const amount=rule.discountAllocation.total.minor,n=quotes.length;
  if(!Number.isSafeInteger(amount)||amount<0) fail(422,"POLICY_UNCONFIGURED","An exact safe discount is required.");
  let discounts:number[];
  if(rule.discountAllocation.kind==="equal-remainder-by-vehicle") {const base=Math.floor(amount/n),remainder=amount%n;discounts=quotes.map((_,i)=>base+(i<remainder?1:0));}
  else {const fixed=rule.discountAllocation.perVehicle; if(fixed===null)throw new QualificationError(422,"POLICY_UNCONFIGURED","Fixed vehicle discounts must sum exactly.");if(fixed.currency!==rule.discountAllocation.total.currency||!Number.isSafeInteger(fixed.minor)||fixed.minor*n!==amount)fail(422,"POLICY_UNCONFIGURED","Fixed vehicle discounts must sum exactly.");discounts=quotes.map(()=>fixed.minor);}
  if(discounts.reduce((a,b)=>a+b,0)!==amount||quotes.some((x,i)=>discounts[i]>x.total.minor)) fail(409,"DISCOUNT_MISMATCH","Discount exceeds an accepted quote or does not sum exactly.");
  if(poolRow.reserved_units+poolRow.consumed_units+n>Math.min(poolRow.maximum_units,rule.maximumUnits)) fail(409,"PROMOTION_EXHAUSTED","No units remain.");
  for(const q of quotes){const stacked=await client.query<{promotion_id:string}>("SELECT promotion_id FROM promotion_allocations WHERE environment_id=$1 AND quote_id=$2 AND quote_revision=$3 AND status<>'reversed'",[context.environmentId,q.ref.quoteId,q.ref.revision]);if(stacked.rows.some(x=>!rule.stackability.allowed||!rule.stackability.permittedPromotionIds.includes(x.promotion_id))) fail(409,"STACKING_FORBIDDEN","Stacking is not approved.");}
  const result:PromotionAllocation[]=[];
  for(let i=0;i<n;i++){
    const q=quotes[i],id=randomUUID();
    await client.query("INSERT INTO promotion_allocations(id,environment_id,promotion_id,policy_version,qualification_id,quote_id,quote_revision,beneficiary_id,vehicle_id,discount_minor,currency,units,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,'reserved')",[id,context.environmentId,input.promotionRef.id,input.promotionRef.version,qual.id,q.ref.quoteId,q.ref.revision,qual.beneficiary_id,q.vehicleId,discounts[i],q.total.currency]);
    await client.query("INSERT INTO promotion_allocation_events(allocation_id,action,actor_id) VALUES($1,'reserved',$2)",[id,actor.userId]);
    result.push({id,promotion:input.promotionRef,qualificationId:qual.id,beneficiaryId:qual.beneficiary_id,vehicleId:q.vehicleId,discount:{minor:discounts[i],currency:q.total.currency},benefitVersion:null,units:1,status:"reserved"});
  }
  for(const e of evidence.rows){const allocation=result.find(x=>x.vehicleId===e.reference_id)??result[0];await client.query("INSERT INTO promotion_evidence_consumption(environment_id,promotion_id,kind,reference_id,qualification_id,allocation_id) VALUES($1,$2,$3,$4,$5,$6)",[context.environmentId,input.promotionRef.id,e.kind,e.reference_id,qual.id,allocation.id]);}
  await client.query("UPDATE promotion_pools SET reserved_units=reserved_units+$4 WHERE environment_id=$1 AND promotion_id=$2 AND policy_version=$3",[context.environmentId,input.promotionRef.id,input.promotionRef.version,n]);
  await saveReplay(client,context,actor,"allocate",entity,input.idempotencyKey,body,result); return result;
}
async function changeAllocation(client:PoolClient,context:ExecutionContext,actor:GarageActor,input:{allocationId:string;idempotencyKey:string;reason?:string;evidenceRef?:string},action:"consume"|"reverse"):Promise<PromotionAllocation>{
  authorize(actor); if(!input.idempotencyKey) fail(400,"INVALID_KEY","Idempotency key required.");
  const first=(await client.query<AllocationRow>("SELECT * FROM promotion_allocations WHERE id=$1",[input.allocationId])).rows[0];
  if(!first||first.environment_id!==context.environmentId) fail(404,"ALLOCATION_NOT_FOUND","Allocation not found.");
  const scope=(await client.query<{branch_id:string}>("SELECT branch_id FROM promotion_qualifications WHERE id=$1",[first.qualification_id])).rows[0];
  if(!scope||!canAccessBranch(actor,scope.branch_id)) fail(404,"ALLOCATION_NOT_FOUND","Allocation not found.");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`promotion:${context.environmentId}:${first.promotion_id}:${first.policy_version}`]);
  await client.query("SELECT 1 FROM promotion_pools WHERE environment_id=$1 AND promotion_id=$2 AND policy_version=$3 FOR UPDATE",[context.environmentId,first.promotion_id,first.policy_version]);
  const body=digest(input),prior=await replay(client,context,actor,action,first.id,input.idempotencyKey,body); if(prior) return prior as PromotionAllocation;
  await client.query("SELECT 1 FROM promotion_evidence_consumption WHERE allocation_id=$1 ORDER BY kind,reference_id FOR UPDATE",[input.allocationId]);
  if(action==="consume"){
    const membership=(await client.query<{reference_id:string}>("SELECT reference_id FROM promotion_evidence WHERE qualification_id=$1 AND kind='membership-verification'",[first.qualification_id])).rows[0];
    if(membership){
      const fact=(await client.query<{revoked_at:Date|null;expires_at:Date|null}>("SELECT revoked_at,expires_at FROM promotion_membership_verifications WHERE id=$1 FOR UPDATE",[membership.reference_id])).rows[0];
      if(!fact||fact.revoked_at||fact.expires_at&&fact.expires_at.getTime()<=Date.now()) fail(409,"VERIFICATION_EXPIRED","Membership verification is no longer current.");
    }
  }
  const row=(await client.query<AllocationRow>("SELECT * FROM promotion_allocations WHERE id=$1 FOR UPDATE",[input.allocationId])).rows[0];
  if(row.status==="reversed"||(action==="consume"&&row.status!=="reserved")) fail(409,"ALLOCATION_ALREADY_FINAL","Allocation already consumed or reversed.");
  if(action==="reverse"){
    const r=await activeRule(context,actor,{id:row.promotion_id,version:row.policy_version});
    if(!r||!r.exceptionAuthority.roles.includes(actor.role as "owner"|"branch-manager")) fail(403,"OVERRIDE_FORBIDDEN","Configured correction authority required.");
    if(!input.reason?.trim()||!input.evidenceRef||!protectedRef(input.evidenceRef)) fail(400,"CORRECTION_EVIDENCE_REQUIRED","Reason and protected evidence required.");
  }
  const next:PromotionAllocation["status"]=action==="consume"?"consumed":"reversed";
  await client.query("UPDATE promotion_allocations SET status=$2 WHERE id=$1",[row.id,next]);
  const poolUpdate=action==="consume"?"reserved_units=reserved_units-1, consumed_units=consumed_units+1":row.status==="consumed"?"consumed_units=consumed_units-1":"reserved_units=reserved_units-1";
  await client.query(`UPDATE promotion_pools SET ${poolUpdate} WHERE environment_id=$1 AND promotion_id=$2 AND policy_version=$3`,[context.environmentId,row.promotion_id,row.policy_version]);
  await client.query("INSERT INTO promotion_allocation_events(allocation_id,action,actor_id,reason,evidence_ref) VALUES($1,$2,$3,$4,$5)",[row.id,next,actor.userId,input.reason?.trim()??null,input.evidenceRef??null]);
  const result:PromotionAllocation={...projection(row),status:next}; await saveReplay(client,context,actor,action,row.id,input.idempotencyKey,body,result); return result;
}
export async function consumeAllocationInTransaction(client:PoolClient,context:ExecutionContext,actor:GarageActor,input:{allocationId:string;idempotencyKey:string}):Promise<PromotionAllocation>{return changeAllocation(client,context,actor,input,"consume");}
export async function reverseAllocation(context:ExecutionContext,actor:GarageActor,input:{allocationId:string;reason:string;evidenceRef:string;idempotencyKey:string}):Promise<PromotionAllocation>{return withTransaction(client=>changeAllocation(client,context,actor,input,"reverse"));}
export async function readPromotionAllocation(context:ExecutionContext,actor:GarageActor,id:string){
  authorize(actor,false);
  const row=(await pool.query<AllocationRow&{branch_id:string;maximum_units:number;reserved_units:number;consumed_units:number}>("SELECT a.*,q.branch_id,p.maximum_units,p.reserved_units,p.consumed_units FROM promotion_allocations a JOIN promotion_qualifications q ON q.id=a.qualification_id JOIN promotion_pools p ON (p.environment_id,p.promotion_id,p.policy_version)=(a.environment_id,a.promotion_id,a.policy_version) WHERE a.id=$1 AND a.environment_id=$2",[id,context.environmentId])).rows[0];
  if(!row||!canAccessBranch(actor,row.branch_id)) fail(404,"ALLOCATION_NOT_FOUND","Allocation not found.");
  const events=await pool.query<{action:string;occurred_at:Date}>("SELECT action,occurred_at FROM promotion_allocation_events WHERE allocation_id=$1 ORDER BY id",[id]);
  return {allocation:projection(row),pool:{maximumUnits:row.maximum_units,reservedUnits:row.reserved_units,consumedUnits:row.consumed_units},history:events.rows.map(e=>({action:e.action,at:e.occurred_at.toISOString()}))};
}
