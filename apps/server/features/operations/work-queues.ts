import type { QueueContributor,QueueFilter,QueueItem } from "@garage/domain";
import { pool } from "../../infrastructure/database/db";
import type { GarageActor } from "../auth/authz";
import { commercialQueueContributor } from "../commercial/action-projections";

const wanted=(filter:QueueFilter,kind:string)=>!filter.kinds?.length||filter.kinds.includes(kind);
const branchSql=(index:number)=>`($${index}='all' OR branch_id=$${index})`;
export const operationalQueueContributor:QueueContributor=async(actor,filter)=>{
  const items:QueueItem[]=[];
  if(wanted(filter,"booking-review")&&actor.role!=="technician"){
    const rows=await pool.query<{id:string;branch_id:string;status:string}>(`SELECT id,branch_id,status FROM bookings WHERE status='pending' AND ($1='owner' OR branch_id=ANY($2::text[])) AND ${branchSql(3)} ORDER BY dropoff_date,dropoff_time,id`,[actor.role,actor.branchIds,filter.branchId]);
    items.push(...rows.rows.map(row=>({kind:"booking-review",recordId:row.id,branchId:row.branch_id,stage:row.status,nextAction:"review-booking"})));
  }
  const jobRows=await pool.query<{id:string;branch_id:string;stage:string;assigned_user_id:string|null}>(`SELECT id,branch_id,stage,assigned_user_id FROM jobs WHERE stage NOT IN ('delivered','cancelled','no-show') AND ($1='owner' OR branch_id=ANY($2::text[])) AND ${branchSql(3)} AND ($1<>'technician' OR assigned_user_id=$4) ORDER BY updated_at,id`,[actor.role,actor.branchIds,filter.branchId,actor.userId]);
  for(const row of jobRows.rows){if(row.assigned_user_id===null&&wanted(filter,"unassigned-job")&&actor.role!=="technician")items.push({kind:"unassigned-job",recordId:row.id,branchId:row.branch_id,stage:row.stage,nextAction:"assign-technician"});if(row.stage==="qc"&&wanted(filter,"quality-check"))items.push({kind:"quality-check",recordId:row.id,branchId:row.branch_id,stage:row.stage,nextAction:"complete-quality-check"});if(row.stage==="ready"&&wanted(filter,"ready-pickup")&&actor.role!=="technician")items.push({kind:"ready-pickup",recordId:row.id,branchId:row.branch_id,stage:row.stage,nextAction:"coordinate-pickup"});}
  return items;
};
export async function listWorkQueue(actor:GarageActor,filter:QueueFilter):Promise<QueueItem[]>{if(filter.branchId!=="all"&&actor.role!=="owner"&&!actor.branchIds.includes(filter.branchId))return[];const [operational,commercial]=await Promise.all([operationalQueueContributor(actor,filter),commercialQueueContributor(actor,filter)]);return [...operational,...commercial].sort((a,b)=>a.branchId.localeCompare(b.branchId)||a.kind.localeCompare(b.kind)||a.recordId.localeCompare(b.recordId));}
