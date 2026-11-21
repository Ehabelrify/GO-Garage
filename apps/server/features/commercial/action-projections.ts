import type { QueueActor,QueueContributor,QueueFilter,QueueItem } from "@garage/domain";
import { pool } from "../../infrastructure/database/db";
import { hasCapability, type GarageActor } from "../auth/authz";
import { listBenefitQueueItems } from "./benefit-service";
import { commercialContext } from "./policy-service";
import { listTransportQueueItems } from "./transport-service";

export type CommercialActionFact=QueueItem&{sourceUpdatedAt:string|null};
type CapableQueueActor=QueueActor&Partial<Pick<GarageActor,"isDemo"|"permissions">>;
const operationalActor=(actor:CapableQueueActor):GarageActor=>({userId:actor.userId,role:actor.role,branchIds:actor.branchIds,email:"",name:"",isDemo:actor.isDemo,permissions:actor.permissions});
const permittedBranch=(actor:CapableQueueActor,filter:QueueFilter,branchId:string)=>actor.role==="owner"?(filter.branchId==="all"||filter.branchId===branchId):actor.branchIds.includes(branchId)&&(filter.branchId==="all"||filter.branchId===branchId);
const wanted=(filter:QueueFilter,kind:string)=>!filter.kinds?.length||filter.kinds.includes(kind);

export async function listCommercialActionFacts(actor:CapableQueueActor,filter:QueueFilter):Promise<CommercialActionFact[]>{
  const capable=operationalActor(actor);
  if(!hasCapability(capable,"bookings.manage"))return[];
  const facts:CommercialActionFact[]=[];
  if(wanted(filter,"quote-followup")){
    const rows=await pool.query<{quote_id:string;branch_id:string;status:string;promised_response_at:Date|null;requested_at:Date}>("SELECT f.quote_id,h.branch_id,f.status,f.promised_response_at,f.requested_at FROM quote_followups f JOIN quote_heads h ON h.id=f.quote_id WHERE h.environment_id=$1 AND f.status IN ('requested','preparing') AND ($2='owner' OR h.branch_id=ANY($3::text[])) AND ($4='all' OR h.branch_id=$4) ORDER BY f.requested_at,f.quote_id",[commercialContext.environmentId,actor.role,actor.branchIds,filter.branchId]);
    for(const row of rows.rows)facts.push({kind:"quote-followup",recordId:row.quote_id,branchId:row.branch_id,stage:row.status,nextAction:"open-quote-followup",committedAt:row.promised_response_at?.toISOString()??null,sourceUpdatedAt:row.requested_at.toISOString()});
  }
  if(wanted(filter,"pickup-commitment")&&["owner","branch-manager"].includes(actor.role)){
    const rows=await pool.query<{id:string;branch_id:string;promised_at:Date;recorded_at:Date;missed:boolean}>("SELECT p.id,b.branch_id,p.promised_at,p.recorded_at,(p.promised_at<now() AND j.stage<>'delivered' AND NOT EXISTS(SELECT 1 FROM job_events e WHERE e.job_id=p.job_id AND e.to_stage='delivered')) AS missed FROM active_pickup_commitments p JOIN bookings b ON b.id=p.booking_id JOIN jobs j ON j.id=p.job_id WHERE ($1='owner' OR b.branch_id=ANY($2::text[])) AND ($3='all' OR b.branch_id=$3) ORDER BY p.promised_at,p.id",[actor.role,actor.branchIds,filter.branchId]);
    for(const row of rows.rows)facts.push({kind:"pickup-commitment",recordId:row.id,branchId:row.branch_id,stage:row.missed?"missed":"upcoming",nextAction:row.missed?"resolve-missed-pickup":"open-pickup-commitment",committedAt:row.promised_at.toISOString(),sourceUpdatedAt:row.recorded_at.toISOString()});
  }
  if(wanted(filter,"benefit-fulfillment"))for(const item of await listBenefitQueueItems(commercialContext,operationalActor(actor)))if(permittedBranch(actor,filter,item.branchId))facts.push({...item,sourceUpdatedAt:null});
  if(wanted(filter,"transport"))for(const item of await listTransportQueueItems(commercialContext,operationalActor(actor)))if(permittedBranch(actor,filter,item.branchId))facts.push({...item,sourceUpdatedAt:null});
  if(wanted(filter,"warranty-claim")&&hasCapability(capable,"warranty.review")){
    const rows=await pool.query<{id:string;branch_id:string;status:string;updated_at:Date}>("SELECT c.id,w.branch_id,c.status,c.updated_at FROM warranty_claims c JOIN warranties w ON w.id=c.warranty_id WHERE c.status IN ('open','under-review') AND ($1='owner' OR w.branch_id=ANY($2::text[])) AND ($3='all' OR w.branch_id=$3) ORDER BY c.updated_at,c.id",[actor.role,actor.branchIds,filter.branchId]);
    for(const row of rows.rows)facts.push({kind:"warranty-claim",recordId:row.id,branchId:row.branch_id,stage:row.status,nextAction:"review-claim",sourceUpdatedAt:row.updated_at.toISOString()});
  }
  return facts;
}

export const commercialQueueContributor:QueueContributor=async(actor,filter)=>(await listCommercialActionFacts(actor,filter)).map(({sourceUpdatedAt:_,...item})=>item);
