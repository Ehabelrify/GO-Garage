import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { configuredNumber, configuredServiceHours } from "@garage/domain";
import type { Branch, BranchId, Service } from "@garage/domain";
import { initialState } from "../seed/seed-data";
import { dateOnlyFromSql } from "../../infrastructure/database/date-only";
import type { QuoteVersionRef, WorkComponent } from "@garage/domain";
import { acceptedQuoteInTransaction, attachConfirmedQuoteSnapshot } from "../commercial/quote-booking";
import { addLocalDays, assessConfiguredSlot, bookingAuthority, configuredAvailability, demandFromWork, hasIntervalCapacity, lockAvailability, occupancyByDay, validLocalTime } from "./availability-service";

export type BookingActor = { kind: "staff"; userId: string } | { kind: "customer-confirmation"; channelId: string; confirmationId: string };
export type { QuoteVersionRef, WorkComponent };
export type ConfirmedBookingInput = {
  branchId: string; customerId: string; vehicleId: string; serviceId: string;
  dropoffDate: string; dropoffTime: string; idempotencyKey: string;
  confirmationRef?: string; pendingBookingId?: string; quoteRef?: QuoteVersionRef;
  reservationId?: string; work?: WorkComponent[];
  configurationVersion?: string;
};
export type BookingReservationResult =
  | { status: "confirmed" | "replayed"; bookingId: string; jobId: string }
  | { status: "capacity-conflict"; reason: "closed" | "daily-cap" | "bay-capacity" }
  | { status: "requires-human"; reasons: string[] }
  | { status: "forbidden" | "invalid"; code: string };

export async function reserveConfirmedBooking(client: PoolClient, actor: BookingActor, input: ConfirmedBookingInput, commercialReservationId?: string): Promise<BookingReservationResult> {
  let date: string;
  try { date = dateOnlyFromSql(input.dropoffDate); } catch { return { status: "invalid", code: "INVALID_BOOKING_DATE" }; }
  if (!input.branchId || !input.customerId || !input.vehicleId || !input.serviceId || !input.idempotencyKey ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dropoffTime)) return { status: "invalid", code: "INVALID_BOOKING" };
  if (input.work && !input.quoteRef) return { status: "invalid", code: "UNTRUSTED_WORK" };
  if (input.reservationId) return { status: "requires-human", reasons: ["Commercial reservation scheduling is not configured."] };
  if(input.quoteRef){
    const linked=await client.query<{id:string}>("SELECT id FROM promotion_reservations WHERE quote_id=$1 AND quote_revision=$2 AND status IN ('reserved','scheduled','redeemed')",[input.quoteRef.quoteId,input.quoteRef.revision]);
    if(linked.rows.some(x=>x.id!==commercialReservationId)||commercialReservationId&&!linked.rows.some(x=>x.id===commercialReservationId))return {status:"requires-human",reasons:["Schedule the accepted offer through its commercial reservation."]};
  }

  // Capacity-setting writes take this key exclusively before modifying settings.
  // Reservations hold a shared lock until commit, so their capacity snapshot cannot
  // straddle a settings update. Keep this before the date lock and all capacity reads.
  await client.query("SELECT pg_advisory_xact_lock_shared(hashtext('booking-capacity-settings'))");

  if (actor.kind === "staff") {
    const membership = await client.query<{ role: string; branch_ids: string[] }>(
      "SELECT role, branch_ids FROM staff_memberships WHERE clerk_user_id = $1 AND status = 'active'", [actor.userId]);
    const row = membership.rows[0];
    if (!row || !["owner", "branch-manager", "receptionist"].includes(row.role) ||
        (row.role !== "owner" && !row.branch_ids.includes(input.branchId))) return { status: "forbidden", code: "ROLE_FORBIDDEN" };
  } else {
    // Confirmation evidence is resolved from persisted simulator state, never a caller assertion.
    if (!actor.channelId || !input.confirmationRef || input.confirmationRef !== actor.confirmationId) {
      return { status: "forbidden", code: "CONFIRMATION_FORBIDDEN" };
    }
  }

  const origin = actor.kind === "staff" ? `staff:${actor.userId}` : `channel:${actor.channelId}`;
  const fingerprint = createHash("sha256").update(JSON.stringify({ ...input, work: undefined, dropoffDate: date })).digest("hex");
  await client.query(
    `INSERT INTO booking_idempotency (origin, idempotency_key, request_fingerprint, outcome_status)
     VALUES ($1, $2, $3, 'started') ON CONFLICT (origin, idempotency_key) DO NOTHING`,
    [origin, input.idempotencyKey, fingerprint]);
  const replay = await client.query<{ request_fingerprint: string; outcome_status: string; booking_id: string | null; job_id: string | null }>(
    "SELECT request_fingerprint, outcome_status, booking_id, job_id FROM booking_idempotency WHERE origin = $1 AND idempotency_key = $2 FOR UPDATE",
    [origin, input.idempotencyKey]);
  const prior = replay.rows[0];
  if (prior.request_fingerprint !== fingerprint) return { status: "invalid", code: "IDEMPOTENCY_KEY_REUSED" };
  if (prior.outcome_status === "confirmed" && prior.booking_id && prior.job_id)
    return { status: "replayed", bookingId: prior.booking_id, jobId: prior.job_id };
  if (actor.kind === "customer-confirmation") {
    const evidence = await client.query(
      `SELECT 1 FROM whatsapp_booking_drafts d JOIN whatsapp_conversations c ON c.id = d.conversation_id
       WHERE d.id = $1 AND c.id || ':' || d.id = $2 AND c.branch_id = $3 AND c.customer_id = $4 AND c.vehicle_id = $5
         AND d.service_id = $6 AND d.dropoff_date = $7 AND d.dropoff_time = $8 AND d.status = 'pending'
         AND ((c.mode IN ('simulation','scenario') AND $9='whatsapp-simulation') OR (c.mode='operational' AND c.channel_id=$9))`,
      [actor.confirmationId, input.idempotencyKey, input.branchId, input.customerId, input.vehicleId, input.serviceId, date, input.dropoffTime,actor.channelId]);
    if (!evidence.rowCount) return { status: "forbidden", code: "CONFIRMATION_FORBIDDEN" };
  }

  let quotedWork: WorkComponent[] | null = null;
  if (input.quoteRef) {
    try {
      const accepted = await acceptedQuoteInTransaction(client, input.quoteRef, input.branchId, input.customerId, input.vehicleId);
      quotedWork = accepted.work;
      if (!quotedWork.length || quotedWork[0].serviceId !== input.serviceId || new Set(quotedWork.map(w => w.id)).size !== quotedWork.length)
        return { status: "invalid", code: "INVALID_QUOTED_WORK" };
      if (input.work && JSON.stringify(input.work) !== JSON.stringify(quotedWork)) return { status: "invalid", code: "UNTRUSTED_WORK" };
    } catch { return { status: "invalid", code: "ACCEPTED_QUOTE_MISMATCH" }; }
  }

  let pending: { id: string; status: string; accepted_quote_id: string | null; accepted_quote_revision: number | null } | undefined;
  if (input.pendingBookingId) {
    const locked = await client.query<{ id: string; status: string; accepted_quote_id: string | null; accepted_quote_revision: number | null }>(
      `SELECT id, status, accepted_quote_id, accepted_quote_revision FROM bookings WHERE id = $1 AND branch_id = $2 AND customer_id = $3 AND vehicle_id = $4
       AND service_id = $5 AND dropoff_date = $6 AND dropoff_time = $7 FOR UPDATE`,
      [input.pendingBookingId, input.branchId, input.customerId, input.vehicleId, input.serviceId, date, input.dropoffTime]);
    pending = locked.rows[0];
    if (!pending || pending.status !== "pending") return { status: "invalid", code: "BOOKING_NOT_PENDING" };
    if (pending.accepted_quote_id && (pending.accepted_quote_id !== input.quoteRef?.quoteId || pending.accepted_quote_revision !== input.quoteRef.revision))
      return { status: "invalid", code: "BOOKING_QUOTE_MISMATCH" };
  }
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${input.branchId}:${date}`]);
  const matching = await client.query(
    `SELECT 1 FROM customer_branches cb JOIN vehicles v ON v.customer_id = cb.customer_id
     WHERE cb.customer_id = $1 AND v.id = $2 AND cb.branch_id = $3`,
    [input.customerId, input.vehicleId, input.branchId]);
  if (!matching.rowCount) return { status: "invalid", code: "INVALID_BOOKING" };
  const branches = await client.query<Branch & { name_en: string; daily_dropoff_limit: number; working_hours: string; clean_bays: number; general_bays: number; weekly_day_off: string }>(
    "SELECT id, name_en, daily_dropoff_limit, working_hours, clean_bays, general_bays, weekly_day_off FROM branches WHERE id = $1", [input.branchId]);
  const serviceRows = await client.query<{ id: string; name_en: string; bay_type: "clean" | "general"; bay_hours: string; price_label: string; active: boolean }>(
    "SELECT id, name_en, bay_type, bay_hours, price_label, active FROM services");
  const branchRow = branches.rows[0];
  const serviceRow = serviceRows.rows.find((item) => item.id === input.serviceId);
  if (!branchRow || !serviceRow || (!quotedWork && !serviceRow.active)) return { status: "invalid", code: "INVALID_BOOKING" };
  const branch: Branch = { id: input.branchId as BranchId, name: branchRow.name_en, shortName: branchRow.name_en,
    dailyDropoffLimit: branchRow.daily_dropoff_limit, workingHours: Number(branchRow.working_hours),
    cleanBays: branchRow.clean_bays, generalBays: branchRow.general_bays, weeklyDayOff: branchRow.weekly_day_off };
  const services: Service[] = serviceRows.rows.map((row) => ({ id: row.id, name: row.name_en,
    bayType: row.bay_type, bayHours: Number(row.bay_hours), priceLabel: row.price_label }));
  const settings = await client.query<{ setting_id: string; scope_key: string; value: string }>(
    "SELECT setting_id, scope_key, value FROM operating_settings WHERE scope_key = 'business' OR scope_key = $1", [input.branchId]);
  const decisions = initialState.decisions.map((definition) => {
    const valueByScope = { ...definition.valueByScope };
    for (const row of settings.rows) if (row.setting_id === definition.id) valueByScope[row.scope_key as BranchId | "business"] = row.value;
    return { ...definition, valueByScope };
  });
  const activeAvailability=await configuredAvailability(client,input.branchId);
  if(input.configurationVersion && String(activeAvailability.configuration?.version??"")!==input.configurationVersion)return {status:"invalid",code:"STALE_SLOT"};
  if (!activeAvailability.configuration) return {status:"requires-human",reasons:activeAvailability.missing};
  const pickup = new Date(`${date}T12:00:00.000Z`);
  if (configuredServiceHours(services.find((item) => item.id === input.serviceId)!, decisions) >
      configuredNumber(decisions, "branch-working-hours", branch.id, branch.workingHours)) pickup.setUTCDate(pickup.getUTCDate() + 1);
  let expectedPickup = pickup.toISOString().slice(0, 10);
  let reservedOccupancy: Map<string,Map<string,number>> | undefined;
  let capacityVersion: number | undefined;
  if (!quotedWork && activeAvailability.configuration) {
    const service=services.find(item=>item.id===input.serviceId)!;
    const windowMinutes=(Number(activeAvailability.configuration.closes_at.slice(0,2))*60+Number(activeAvailability.configuration.closes_at.slice(3,5)))-(Number(activeAvailability.configuration.opens_at.slice(0,2))*60+Number(activeAvailability.configuration.opens_at.slice(3,5)));
    const requiredMinutes=Math.ceil(configuredServiceHours(service,decisions)*60);
    if(requiredMinutes>windowMinutes) return {status:"requires-human",reasons:["Legacy multi-day service occupancy requires an approved rule."]};
    const demand=[{componentId:`service:${service.id}`,serviceId:service.id,bayType:service.bayType,requiredMinutes,durationDays:1,aggregation:"sum" as const}];
    await lockAvailability(client,input.branchId,[...occupancyByDay(date,demand).keys()],[service.bayType]);
    const assessment=await assessConfiguredSlot(client,input.branchId,date,input.dropoffTime,demand,input.pendingBookingId);
    if(assessment.status==="unconfigured") return {status:"requires-human",reasons:assessment.missing};
    if(assessment.status==="conflict") return {status:"capacity-conflict",reason:assessment.reason};
    expectedPickup=assessment.expectedPickupDate; reservedOccupancy=assessment.occupancy; capacityVersion=assessment.configurationVersion;
  }
  if (quotedWork) {
    const expanded=await demandFromWork(client,quotedWork);
    if (!expanded.demand) return {status:"requires-human",reasons:expanded.missing};
    const dates=[...occupancyByDay(date,expanded.demand).keys()];
    await lockAvailability(client,input.branchId,dates,expanded.demand.map(d=>d.bayType));
    const assessment=await assessConfiguredSlot(client,input.branchId,date,input.dropoffTime,expanded.demand,input.pendingBookingId);
    if(assessment.status==="unconfigured") return {status:"requires-human",reasons:assessment.missing};
    if(assessment.status==="conflict") return {status:"capacity-conflict",reason:assessment.reason};
    expectedPickup=assessment.expectedPickupDate;
    reservedOccupancy=assessment.occupancy;
    capacityVersion=assessment.configurationVersion;
  }
  const bookingId = pending?.id ?? `booking-${randomUUID()}`;
  if (pending) await client.query("UPDATE bookings SET status = 'confirmed', expected_pickup = $2, updated_at = now() WHERE id = $1", [bookingId, expectedPickup]);
  else await client.query(
    `INSERT INTO bookings (id, customer_id, vehicle_id, service_id, branch_id, dropoff_date, dropoff_time, expected_pickup, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9)`,
    [bookingId, input.customerId, input.vehicleId, input.serviceId, input.branchId, date, input.dropoffTime, expectedPickup,
      actor.kind === "staff" ? actor.userId : "whatsapp-simulation"]);
  const jobId = `job-${randomUUID()}`;
  await client.query("INSERT INTO jobs (id, booking_id, branch_id, stage) VALUES ($1,$2,$3,'booked')", [jobId, bookingId, input.branchId]);
  if (input.quoteRef) {
    await attachConfirmedQuoteSnapshot(client,{bookingId,ref:input.quoteRef});
  }
  if(reservedOccupancy && capacityVersion) {
    for(const [occupiedDate,bays] of reservedOccupancy) for(const [bayType,requiredMinutes] of bays)
      await client.query("INSERT INTO booking_occupancy(booking_id,occupied_date,bay_type,required_minutes,configuration_version) VALUES($1,$2,$3,$4,$5)",[bookingId,occupiedDate,bayType,requiredMinutes,capacityVersion]);
  }
  await client.query(
    "INSERT INTO job_events (id, job_id, from_stage, to_stage, actor_user_id, note) VALUES ($1,$2,NULL,'booked',$3,$4)",
    [`event-${randomUUID()}`, jobId, actor.kind === "staff" ? actor.userId : "whatsapp-simulation", "Booking confirmed"]);
  await client.query(
    `UPDATE booking_idempotency SET outcome_status = 'confirmed', booking_id = $3, job_id = $4, completed_at = now()
     WHERE origin = $1 AND idempotency_key = $2`, [origin, input.idempotencyKey, bookingId, jobId]);
  return { status: "confirmed", bookingId, jobId };
}

type ChangeRow = { id:string; branch_id:string; dropoff_date:string; dropoff_time:string; expected_pickup:string; status:string; job_id:string; stage:string };
async function changeTarget(client: PoolClient, bookingId: string): Promise<ChangeRow | undefined> {
  const result = await client.query<ChangeRow>(`SELECT b.id,b.branch_id,b.dropoff_date::text AS dropoff_date,b.dropoff_time::text AS dropoff_time,b.expected_pickup::text AS expected_pickup,b.status,j.id AS job_id,j.stage FROM bookings b JOIN jobs j ON j.booking_id=b.id WHERE b.id=$1`,[bookingId]);
  return result.rows[0];
}
async function changeReplay(client: PoolClient, actor: BookingActor, bookingId: string, key: string, action: string, payload: unknown): Promise<"new"|"replayed"|"reused"> {
  const origin = actor.kind === "staff" ? `staff:${actor.userId}` : `channel:${actor.channelId}`;
  const fingerprint = createHash("sha256").update(JSON.stringify({action,bookingId,payload})).digest("hex");
  const prior = await client.query<{request_fingerprint:string;action:string;booking_id:string}>("SELECT request_fingerprint,action,booking_id FROM booking_change_idempotency WHERE origin=$1 AND idempotency_key=$2 FOR UPDATE",[origin,key]);
  if (prior.rows[0]) return prior.rows[0].request_fingerprint === fingerprint && prior.rows[0].action === action && prior.rows[0].booking_id === bookingId ? "replayed" : "reused";
  return "new";
}
async function recordChange(client: PoolClient, actor: BookingActor, bookingId: string, key: string, action: string, payload: unknown): Promise<void> {
  const origin = actor.kind === "staff" ? `staff:${actor.userId}` : `channel:${actor.channelId}`;
  const fingerprint = createHash("sha256").update(JSON.stringify({action,bookingId,payload})).digest("hex");
  await client.query("INSERT INTO booking_change_idempotency(origin,idempotency_key,request_fingerprint,action,booking_id) VALUES($1,$2,$3,$4,$5)",[origin,key,fingerprint,action,bookingId]);
}
export async function rescheduleConfirmedBooking(client: PoolClient, actor: BookingActor, input: {bookingId:string;dropoffDate:string;dropoffTime:string;idempotencyKey:string}): Promise<BookingReservationResult> {
  let date: string;
  try { date = dateOnlyFromSql(input.dropoffDate); } catch { return {status:"invalid",code:"INVALID_BOOKING_DATE"}; }
  if (!input.bookingId || !input.idempotencyKey || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dropoffTime)) return {status:"invalid",code:"INVALID_BOOKING"};
  const discovered = await changeTarget(client,input.bookingId);
  if (!discovered) return {status:"invalid",code:"BOOKING_NOT_FOUND"};
  if (!await bookingAuthority(client,actor,discovered.branch_id)) return {status:"forbidden",code:"ROLE_FORBIDDEN"};
  await client.query("SELECT id FROM bookings WHERE id=$1 FOR UPDATE",[input.bookingId]);
  const booking = await changeTarget(client,input.bookingId);
  if (!booking || booking.branch_id !== discovered.branch_id) return {status:"invalid",code:"STALE_BOOKING"};
  const replay = await changeReplay(client,actor,input.bookingId,input.idempotencyKey,"reschedule",{date,time:input.dropoffTime});
  if (replay === "reused") return {status:"invalid",code:"IDEMPOTENCY_KEY_REUSED"};
  if (replay === "replayed") return {status:"replayed",bookingId:booking.id,jobId:booking.job_id};
  if (booking.status !== "confirmed" || booking.stage !== "booked") return {status:"invalid",code:"BOOKING_NOT_MOVABLE"};
  const occupancy = await client.query<{occupied_date:string;bay_type:string;required_minutes:number}>("SELECT occupied_date::text AS occupied_date,bay_type,required_minutes FROM booking_occupancy WHERE booking_id=$1",[booking.id]);
  if (!occupancy.rows.length) return {status:"requires-human",reasons:["Verified occupancy is missing for this visit."]};
  const shiftDays=Math.round((Date.parse(`${date}T12:00:00Z`)-Date.parse(`${booking.dropoff_date}T12:00:00Z`))/86400000);
  const moved=occupancy.rows.map(r=>({...r,target:addLocalDays(r.occupied_date,shiftDays)}));
  await lockAvailability(client,booking.branch_id,[booking.dropoff_date,...occupancy.rows.map(r=>r.occupied_date),date,...moved.map(r=>r.target)],occupancy.rows.map(r=>r.bay_type));
  const config = await configuredAvailability(client,booking.branch_id);
  if (!config.configuration) return {status:"requires-human",reasons:config.missing};
  const c = config.configuration;
  if (date === booking.dropoff_date && input.dropoffTime === booking.dropoff_time.slice(0,5)) {
    await recordChange(client,actor,booking.id,input.idempotencyKey,"reschedule",{date,time:input.dropoffTime});
    return {status:"replayed",bookingId:booking.id,jobId:booking.job_id};
  }
  const targetMinute = Number(input.dropoffTime.slice(0,2))*60+Number(input.dropoffTime.slice(3,5));
  const openMinute = Number(c.opens_at.slice(0,2))*60+Number(c.opens_at.slice(3,5));
  const closeMinute = Number(c.closes_at.slice(0,2))*60+Number(c.closes_at.slice(3,5));
  if (targetMinute<openMinute || targetMinute>=closeMinute || (targetMinute-openMinute)%c.slot_minutes || !validLocalTime(date,input.dropoffTime,c.timezone)) return {status:"capacity-conflict",reason:"closed"};
  const intake = await client.query<{count:string}>("SELECT count(*)::text AS count FROM bookings WHERE branch_id=$1 AND dropoff_date=$2 AND status='confirmed' AND id<>$3",[booking.branch_id,date,booking.id]);
  if (Number(intake.rows[0].count)>=c.daily_intake_limit) return {status:"capacity-conflict",reason:"daily-cap"};
  for (const row of moved) {
    const closed=await client.query("SELECT 1 FROM branch_availability_closures WHERE branch_id=$1 AND version=$2 AND closed_date=$3",[booking.branch_id,c.version,row.target]);
    if(closed.rowCount||!c.working_weekdays.includes(new Date(`${row.target}T12:00:00Z`).getUTCDay())) return {status:"capacity-conflict",reason:"closed"};
    const legacy=await client.query("SELECT 1 FROM bookings b WHERE b.branch_id=$1 AND b.status='confirmed' AND b.dropoff_date<=$2 AND b.expected_pickup>=$2 AND b.id<>$3 AND NOT EXISTS(SELECT 1 FROM booking_occupancy o WHERE o.booking_id=b.id) LIMIT 1",[booking.branch_id,row.target,booking.id]);
    if(legacy.rowCount) return {status:"requires-human",reasons:[`Historical occupancy for ${row.target} is missing.`]};
    const used = await client.query<{minutes:string}>(`SELECT coalesce(sum(o.required_minutes),0)::text AS minutes FROM booking_occupancy o JOIN bookings b ON b.id=o.booking_id WHERE b.branch_id=$1 AND o.occupied_date=$2 AND o.bay_type=$3 AND b.status='confirmed' AND b.id<>$4`,[booking.branch_id,row.target,row.bay_type,booking.id]);
    if (Number(used.rows[0].minutes)+row.required_minutes > (c.bay_counts[row.bay_type]??0)*(closeMinute-openMinute)) return {status:"capacity-conflict",reason:"bay-capacity"};
    const candidateStart=row.target===date?targetMinute:openMinute,candidateEnd=candidateStart+row.required_minutes;
    if(candidateEnd>closeMinute)return {status:"capacity-conflict",reason:"closed"};
    if(!await hasIntervalCapacity(client,{branchId:booking.branch_id,day:row.target,bayType:row.bay_type,excludeBookingId:booking.id,openMinute,candidateStart,candidateEnd,bayCount:c.bay_counts[row.bay_type]??0}))return {status:"capacity-conflict",reason:"bay-capacity"};
  }
  const pickup=addLocalDays(booking.expected_pickup,shiftDays);
  await client.query("UPDATE bookings SET dropoff_date=$2,dropoff_time=$3,expected_pickup=$4,updated_at=now() WHERE id=$1",[booking.id,date,input.dropoffTime,pickup]);
  await client.query("DELETE FROM booking_occupancy WHERE booking_id=$1",[booking.id]);
  for(const row of moved) await client.query("INSERT INTO booking_occupancy(booking_id,occupied_date,bay_type,required_minutes,configuration_version) VALUES($1,$2,$3,$4,$5)",[booking.id,row.target,row.bay_type,row.required_minutes,c.version]);
  await client.query("INSERT INTO job_events(id,job_id,from_stage,to_stage,actor_user_id,note) VALUES($1,$2,'booked','booked',$3,'Booking rescheduled')",[`event-${randomUUID()}`,booking.job_id,actor.kind==="staff"?actor.userId:"customer-confirmation"]);
  await recordChange(client,actor,booking.id,input.idempotencyKey,"reschedule",{date,time:input.dropoffTime});
  return {status:"confirmed",bookingId:booking.id,jobId:booking.job_id};
}
export async function cancelConfirmedBooking(client: PoolClient, actor: BookingActor, input: {bookingId:string;idempotencyKey:string;reason:string}): Promise<{status:"cancelled"|"replayed";bookingId:string}|{status:"forbidden"|"invalid";code:string}> {
  if (!input.bookingId || !input.idempotencyKey || !input.reason?.trim()) return {status:"invalid",code:"INVALID_CANCELLATION"};
  const discovered=await changeTarget(client,input.bookingId);
  if (!discovered) return {status:"invalid",code:"BOOKING_NOT_FOUND"};
  if (!await bookingAuthority(client,actor,discovered.branch_id)) return {status:"forbidden",code:"ROLE_FORBIDDEN"};
  await client.query("SELECT id FROM bookings WHERE id=$1 FOR UPDATE",[input.bookingId]);
  const booking=await changeTarget(client,input.bookingId);
  if (!booking || booking.branch_id!==discovered.branch_id) return {status:"invalid",code:"STALE_BOOKING"};
  const replay=await changeReplay(client,actor,input.bookingId,input.idempotencyKey,"cancel",{reason:input.reason.trim()});
  if (replay==="reused") return {status:"invalid",code:"IDEMPOTENCY_KEY_REUSED"};
  if (replay==="replayed") return {status:"replayed",bookingId:booking.id};
  if (booking.status!=="confirmed" || booking.stage!=="booked") return {status:"invalid",code:"BOOKING_NOT_CANCELLABLE"};
  const occupied=await client.query<{occupied_date:string;bay_type:string}>("SELECT occupied_date::text AS occupied_date,bay_type FROM booking_occupancy WHERE booking_id=$1",[booking.id]);
  await lockAvailability(client,booking.branch_id,[booking.dropoff_date,...occupied.rows.map(r=>r.occupied_date)],occupied.rows.map(r=>r.bay_type));
  await client.query("UPDATE bookings SET status='cancelled',updated_at=now() WHERE id=$1",[booking.id]);
  await client.query("UPDATE jobs SET stage='cancelled',updated_at=now() WHERE id=$1",[booking.job_id]);
  await client.query("INSERT INTO job_events(id,job_id,from_stage,to_stage,actor_user_id,note) VALUES($1,$2,'booked','cancelled',$3,$4)",[`event-${randomUUID()}`,booking.job_id,actor.kind==="staff"?actor.userId:"customer-confirmation",input.reason.trim()]);
  await recordChange(client,actor,booking.id,input.idempotencyKey,"cancel",{reason:input.reason.trim()});
  return {status:"cancelled",bookingId:booking.id};
}
