import type { PoolClient } from "pg";
import type { WorkComponent } from "@garage/domain";
import { dateOnlyFromSql } from "../../infrastructure/database/date-only";
import type { BookingActor } from "./booking-service";

export type CapacityComponent = { serviceId: string; bayType: string; requiredMinutes: number };
export type AvailableSlot = { dropoffDate: string; dropoffTime: string; expectedPickupDate: string };
export type OccupancyDemand = CapacityComponent & { componentId: string; durationDays: number; aggregation: "sum" | "max" };
type Configuration = { branch_id: string; version: number; timezone: string; opens_at: string; closes_at: string; working_weekdays: number[]; slot_minutes: number; daily_intake_limit: number; bay_counts: Record<string, number> };
const minutes = (time: string) => { const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(time); return match ? Number(match[1]) * 60 + Number(match[2]) : NaN; };
const dayNumber = (date: string) => Math.floor(Date.UTC(Number(date.slice(0,4)), Number(date.slice(5,7))-1, Number(date.slice(8,10))) / 86400000);
const dateAt = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10);
export const addLocalDays = (date: string, days: number) => dateAt(dayNumber(dateOnlyFromSql(date)) + days);
export function validLocalTime(date: string, time: string, timezone: string): boolean {
  const target = `${date} ${time}`;
  const noon = dayNumber(date) * 86400000 + minutes(time) * 60000;
  const formatter = new Intl.DateTimeFormat("en-CA", {timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  for (let offset=-14*60; offset<=14*60; offset+=15) {
    const parts=Object.fromEntries(formatter.formatToParts(noon-offset*60000).map(p=>[p.type,p.value]));
    if (`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`===target) return true;
  }
  return false;
}

export async function bookingAuthority(client: PoolClient, actor: BookingActor, branchId: string): Promise<boolean> {
  if (actor.kind !== "staff") return false;
  const result = await client.query<{role:string;branch_ids:string[]}>("SELECT role,branch_ids FROM staff_memberships WHERE clerk_user_id=$1 AND status='active'", [actor.userId]);
  const row = result.rows[0];
  return !!row && ["owner","branch-manager","receptionist"].includes(row.role) && (row.role === "owner" || row.branch_ids.includes(branchId));
}

export async function lockAvailability(client: PoolClient, branchId: string, dates: string[], bayTypes: string[]): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock_shared(hashtext('booking-capacity-settings'))");
  const keys = [...new Set(dates.flatMap(date => ["intake", ...bayTypes].map(bay => `${branchId}:${date}:${bay}`)))].sort();
  for (const key of keys) await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
}

export async function configuredAvailability(client: PoolClient, branchId: string): Promise<{ configuration?: Configuration; missing: string[] }> {
  const result = await client.query<Configuration>(`SELECT v.* FROM branch_availability_active a JOIN branch_availability_versions v USING(branch_id,version) WHERE a.branch_id=$1 AND v.effective_from<=CURRENT_DATE`, [branchId]);
  const c = result.rows[0];
  const missing: string[] = [];
  if (!c) return { missing: ["approved branch availability configuration"] };
  try { new Intl.DateTimeFormat("en", { timeZone: c.timezone }); } catch { missing.push("valid branch timezone"); }
  if (!Array.isArray(c.working_weekdays) || !c.working_weekdays.length || c.working_weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) missing.push("working calendar");
  if (!Number.isInteger(c.slot_minutes) || c.slot_minutes <= 0 || !Number.isFinite(minutes(c.opens_at)) || !Number.isFinite(minutes(c.closes_at)) || minutes(c.opens_at) >= minutes(c.closes_at) || (minutes(c.closes_at)-minutes(c.opens_at)) % c.slot_minutes) missing.push("opening hours and slot grid");
  if (!Number.isInteger(c.daily_intake_limit) || c.daily_intake_limit <= 0) missing.push("daily intake limit");
  if (!c.bay_counts || !Object.keys(c.bay_counts).length || Object.values(c.bay_counts).some(n => !Number.isInteger(n) || n < 0)) missing.push("bay counts");
  return { configuration: missing.length ? undefined : c, missing };
}

export async function demandFromWork(client: PoolClient, work: WorkComponent[]): Promise<{ demand?: OccupancyDemand[]; missing: string[] }> {
  if (!work.length || new Set(work.map(w => w.id)).size !== work.length) return { missing: ["stable work components"] };
  const demand: OccupancyDemand[] = [];
  for (const item of work) {
    const policy = await client.query<{value:unknown}>(`SELECT v.value FROM commercial_policy_versions v JOIN commercial_policy_active a USING(policy_id,version) WHERE v.policy_id=$1 AND v.version=$2 AND v.family='work-occupancy' AND v.state='approved' AND (v.effective_from IS NULL OR v.effective_from<=CURRENT_DATE) AND (v.effective_through IS NULL OR v.effective_through>=CURRENT_DATE)`, [item.occupancyRule.id, item.occupancyRule.version]);
    const value = policy.rows[0]?.value as {bayType?:unknown;requiredMinutes?:unknown;durationDays?:unknown;aggregation?:unknown} | undefined;
    if (!value || typeof value.bayType !== "string" || !Number.isInteger(value.requiredMinutes) || Number(value.requiredMinutes) <= 0 || !Number.isInteger(value.durationDays) || Number(value.durationDays)<1 || Number(value.durationDays)>31 || !["sum","max"].includes(String(value.aggregation))) return { missing: ["approved occupancy rules"] };
    demand.push({ componentId:item.id, serviceId: item.serviceId, bayType: value.bayType, requiredMinutes: Number(value.requiredMinutes), durationDays:Number(value.durationDays), aggregation:value.aggregation as "sum"|"max" });
  }
  return { demand, missing: [] };
}
export async function componentsFromWork(client: PoolClient, work: WorkComponent[]): Promise<{components?:CapacityComponent[];missing:string[]}> {
  const result=await demandFromWork(client,work);
  return {components:result.demand?.map(({serviceId,bayType,requiredMinutes})=>({serviceId,bayType,requiredMinutes})),missing:result.missing};
}
export async function demandFromBookedComponents(client:PoolClient,bookingId:string):Promise<{demand?:OccupancyDemand[];missing:string[]}> {
  const rows=await client.query<{component_id:string;service_id:string;value:unknown}>(`SELECT w.component_id,w.service_id,p.value FROM booking_work_components w JOIN commercial_policy_versions p ON p.policy_id=w.occupancy_rule_id AND p.version=w.occupancy_rule_version WHERE w.booking_id=$1 AND p.family='work-occupancy' AND p.state='approved' ORDER BY w.position`,[bookingId]);
  if(!rows.rows.length)return {missing:["persisted approved work components"]};
  const demand:OccupancyDemand[]=[];
  for(const row of rows.rows){
    const value=row.value as {bayType?:unknown;requiredMinutes?:unknown;durationDays?:unknown;aggregation?:unknown};
    if(typeof value?.bayType!=="string"||!Number.isInteger(value.requiredMinutes)||Number(value.requiredMinutes)<=0||!Number.isInteger(value.durationDays)||Number(value.durationDays)<1||!["sum","max"].includes(String(value.aggregation)))return {missing:["valid booked occupancy snapshot"]};
    demand.push({componentId:row.component_id,serviceId:row.service_id,bayType:value.bayType,requiredMinutes:Number(value.requiredMinutes),durationDays:Number(value.durationDays),aggregation:value.aggregation as "sum"|"max"});
  }
  return {demand,missing:[]};
}

export function occupancyByDay(date: string, demand: OccupancyDemand[]): Map<string,Map<string,number>> {
  const result=new Map<string,Map<string,number>>();
  const grouped=new Map<string,{sum:number;max:number}>();
  for (const item of demand) for(let offset=0;offset<item.durationDays;offset++) {
    const day=addLocalDays(date,offset);
    const key=`${day}:${item.bayType}`,prior=grouped.get(key)??{sum:0,max:0};
    if(item.aggregation==="max") prior.max=Math.max(prior.max,item.requiredMinutes);
    else prior.sum+=item.requiredMinutes;
    grouped.set(key,prior);
  }
  for(const [key,total] of grouped) {
    const day=key.slice(0,10),bay=key.slice(11),bays=result.get(day)??new Map<string,number>();
    bays.set(bay,total.sum+total.max);result.set(day,bays);
  }
  return result;
}

export async function hasIntervalCapacity(client:PoolClient,input:{branchId:string;day:string;bayType:string;excludeBookingId?:string;openMinute:number;candidateStart:number;candidateEnd:number;bayCount:number}):Promise<boolean>{
  if(input.bayCount<=0||input.candidateEnd<=input.candidateStart)return false;
  const rows=await client.query<{start_minute:number;required_minutes:number}>(`SELECT CASE WHEN o.occupied_date=b.dropoff_date THEN extract(hour from b.dropoff_time)::int*60+extract(minute from b.dropoff_time)::int ELSE $5 END AS start_minute,o.required_minutes FROM booking_occupancy o JOIN bookings b ON b.id=o.booking_id WHERE b.branch_id=$1 AND b.status='confirmed' AND o.occupied_date=$2 AND o.bay_type=$3 AND b.id<>coalesce($4,'')`,[input.branchId,input.day,input.bayType,input.excludeBookingId??null,input.openMinute]);
  const events:Array<{minute:number;delta:number}>=[];
  for(const row of rows.rows){const start=Math.max(Number(row.start_minute),input.candidateStart),end=Math.min(Number(row.start_minute)+Number(row.required_minutes),input.candidateEnd);if(start<end)events.push({minute:start,delta:1},{minute:end,delta:-1});}
  events.sort((a,b)=>a.minute-b.minute||a.delta-b.delta);
  let active=0;
  for(const event of events){active+=event.delta;if(active>=input.bayCount)return false;}
  return true;
}

export async function assessConfiguredSlot(client:PoolClient, branchId:string, date:string, time:string, demand:OccupancyDemand[], excludeBookingId?:string):Promise<{status:"available";expectedPickupDate:string;configurationVersion:number;occupancy:Map<string,Map<string,number>>}|{status:"unconfigured";missing:string[]}|{status:"conflict";reason:"closed"|"daily-cap"|"bay-capacity"}> {
  const setting=await configuredAvailability(client,branchId);
  if (!setting.configuration) return {status:"unconfigured",missing:setting.missing};
  const c=setting.configuration;
  if (!demand.length || demand.some(d=>!Number.isInteger(d.requiredMinutes)||d.requiredMinutes<=0||!Number.isInteger(d.durationDays)||d.durationDays<1||d.durationDays>31||!(d.bayType in c.bay_counts)||c.bay_counts[d.bayType]<=0)) return {status:"unconfigured",missing:["approved bay occupancy"]};
  const start=minutes(c.opens_at),close=minutes(c.closes_at),chosen=minutes(time);
  if (!Number.isFinite(chosen)||chosen<start||chosen>=close||(chosen-start)%c.slot_minutes||!validLocalTime(date,time,c.timezone)) return {status:"conflict",reason:"closed"};
  const occupied=occupancyByDay(date,demand);
  const dates=[...occupied.keys()];
  const closures=await client.query<{closed_date:string}>("SELECT closed_date::text AS closed_date FROM branch_availability_closures WHERE branch_id=$1 AND version=$2 AND closed_date=ANY($3::date[])",[branchId,c.version,dates]);
  const closed=new Set(closures.rows.map(r=>r.closed_date));
  for(const day of dates) if(closed.has(day)||!c.working_weekdays.includes(new Date(`${day}T12:00:00Z`).getUTCDay())) return {status:"conflict",reason:"closed"};
  const intake=await client.query<{count:string}>("SELECT count(*)::text AS count FROM bookings WHERE branch_id=$1 AND dropoff_date=$2 AND status='confirmed' AND id<>coalesce($3,'')",[branchId,date,excludeBookingId??null]);
  if(Number(intake.rows[0].count)>=c.daily_intake_limit) return {status:"conflict",reason:"daily-cap"};
  for(const [day,bays] of occupied) {
    const untracked=await client.query("SELECT 1 FROM bookings b WHERE b.branch_id=$1 AND b.status='confirmed' AND b.dropoff_date<=$2 AND b.expected_pickup>=$2 AND b.id<>coalesce($3,'') AND NOT EXISTS(SELECT 1 FROM booking_occupancy o WHERE o.booking_id=b.id) LIMIT 1",[branchId,day,excludeBookingId??null]);
    if(untracked.rowCount) return {status:"unconfigured",missing:[`persisted historical occupancy for ${day}`]};
    for(const [bay,required] of bays) {
      const candidateStart=day===date?chosen:start,candidateEnd=candidateStart+required;
      if(candidateEnd>close)return {status:"conflict",reason:"closed"};
      const used=await client.query<{minutes:string}>("SELECT coalesce(sum(o.required_minutes),0)::text AS minutes FROM booking_occupancy o JOIN bookings b ON b.id=o.booking_id WHERE b.branch_id=$1 AND b.status='confirmed' AND o.occupied_date=$2 AND o.bay_type=$3 AND b.id<>coalesce($4,'')",[branchId,day,bay,excludeBookingId??null]);
      if(Number(used.rows[0].minutes)+required>c.bay_counts[bay]*(close-start)) return {status:"conflict",reason:"bay-capacity"};
      if(!await hasIntervalCapacity(client,{branchId,day,bayType:bay,excludeBookingId,openMinute:start,candidateStart,candidateEnd,bayCount:c.bay_counts[bay]}))return {status:"conflict",reason:"bay-capacity"};
    }
  }
  return {status:"available",expectedPickupDate:addLocalDays(date,Math.max(...demand.map(d=>d.durationDays))-1),configurationVersion:c.version,occupancy:occupied};
}

export async function listAvailableSlots(client: PoolClient, actor: BookingActor, input: {branchId:string;serviceComponents:CapacityComponent[];fromDate:string;toDate:string}): Promise<{status:"available";slots:AvailableSlot[];configurationVersion:string}|{status:"unconfigured";missing:string[]}|{status:"forbidden"|"invalid";code:string}> {
  const demand=input.serviceComponents.map((c,i)=>({...c,componentId:`component-${i}`,durationDays:1,aggregation:"sum" as const}));
  return listAvailableSlotsForDemand(client,actor,{branchId:input.branchId,demand,fromDate:input.fromDate,toDate:input.toDate});
}
export async function listAvailableSlotsForDemand(client:PoolClient,actor:BookingActor,input:{branchId:string;demand:OccupancyDemand[];fromDate:string;toDate:string;excludeBookingId?:string}):Promise<{status:"available";slots:AvailableSlot[];configurationVersion:string}|{status:"unconfigured";missing:string[]}|{status:"forbidden"|"invalid";code:string}> {
  let start: number, end: number;
  try { start = dayNumber(dateOnlyFromSql(input.fromDate)); end = dayNumber(dateOnlyFromSql(input.toDate)); } catch { return {status:"invalid",code:"INVALID_DATE"}; }
  if (end < start || end-start > 31 || !input.branchId) return {status:"invalid",code:"INVALID_RANGE"};
  if (!await bookingAuthority(client, actor, input.branchId)) return {status:"forbidden",code:"ROLE_FORBIDDEN"};
  await client.query("SELECT pg_advisory_xact_lock_shared(hashtext('booking-capacity-settings'))");
  const configured = await configuredAvailability(client, input.branchId);
  if(!configured.configuration) return {status:"unconfigured",missing:configured.missing};
  if(!input.demand.length) return {status:"unconfigured",missing:["server-derived approved work demand"]};
  const c=configured.configuration,slots:AvailableSlot[]=[];
  for(let day=start;day<=end;day++) for(let minute=minutes(c.opens_at);minute<minutes(c.closes_at);minute+=c.slot_minutes) {
    const date=dateAt(day),time=`${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`;
    const result=await assessConfiguredSlot(client,input.branchId,date,time,input.demand,input.excludeBookingId);
    if(result.status==="unconfigured") return {status:"unconfigured",missing:result.missing};
    if(result.status==="available") slots.push({dropoffDate:date,dropoffTime:time,expectedPickupDate:result.expectedPickupDate});
  }
  return {status:"available",slots,configurationVersion:String(c.version)};
}
