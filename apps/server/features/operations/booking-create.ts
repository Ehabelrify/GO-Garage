import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { checkBookingCapacity, configuredNumber, configuredServiceHours } from "@garage/domain";
import type { Branch, BranchId, Booking, Service } from "@garage/domain";
import { initialState } from "../seed/seed-data";
import { dateOnlyFromSql } from "../../infrastructure/database/date-only";
import { acceptedQuoteInTransaction } from "../commercial/quote-booking";
import { configuredAvailability } from "./availability-service";
import { reserveConfirmedBooking, type BookingReservationResult } from "./booking-service";
import type { GarageActor } from "../auth/authz";

type Client = PoolClient;
const makeId = (prefix: string) => `${prefix}-${randomUUID()}`;

export function branchFromRow(row: {
  id: string;
  name_en: string;
  daily_dropoff_limit: number;
  working_hours: string;
  clean_bays: number;
  general_bays: number;
  weekly_day_off: string;
}): Branch {
  return {
    id: row.id as BranchId,
    name: row.name_en,
    shortName: row.name_en,
    dailyDropoffLimit: row.daily_dropoff_limit,
    workingHours: Number(row.working_hours),
    cleanBays: row.clean_bays,
    generalBays: row.general_bays,
    weeklyDayOff: row.weekly_day_off,
  };
}

export function serviceFromRow(row: {
  id: string;
  name_en: string;
  bay_type: "clean" | "general";
  bay_hours: string;
  price_label: string;
}): Service {
  return {
    id: row.id,
    name: row.name_en,
    bayType: row.bay_type,
    bayHours: Number(row.bay_hours),
    priceLabel: row.price_label,
  };
}

export async function capacityIssue(
  client: Client,
  branchId: string,
  date: string,
  serviceId: string,
  excludeBookingId?: string,
) {
  const branchResult = await client.query(
    `SELECT id, name_en, daily_dropoff_limit, working_hours, clean_bays, general_bays, weekly_day_off
     FROM branches WHERE id = $1`,
    [branchId],
  );
  const serviceResult = await client.query(
    "SELECT id, name_en, bay_type, bay_hours, price_label FROM services WHERE id = $1 AND active = true",
    [serviceId],
  );
  if (!branchResult.rowCount || !serviceResult.rowCount) return "record";

  const decisions = await loadCapacitySettings(client, branchId);

  const bookingResult = await client.query<{
    id: string; customer_id: string; vehicle_id: string; service_id: string; branch_id: string;
    dropoff_date: string; dropoff_time: string; expected_pickup: string; status: Booking["status"];
  }>(
    `SELECT id, customer_id, vehicle_id, service_id, branch_id, dropoff_date::text AS dropoff_date, dropoff_time, expected_pickup::text AS expected_pickup, status
     FROM bookings WHERE branch_id = $1 AND dropoff_date = $2 AND status = 'confirmed'`,
    [branchId, date],
  );
  const bookings: Booking[] = bookingResult.rows.map((booking) => ({
    id: booking.id,
    customerId: booking.customer_id,
    vehicleId: booking.vehicle_id,
    serviceId: booking.service_id,
    branchId: booking.branch_id as BranchId,
    dropoffDate: dateOnlyFromSql(booking.dropoff_date),
    dropoffTime: booking.dropoff_time.slice(0, 5),
    expectedPickup: dateOnlyFromSql(booking.expected_pickup),
    status: booking.status,
  }));
  const serviceRows = await client.query(
    "SELECT id, name_en, bay_type, bay_hours, price_label FROM services WHERE active = true",
  );
  const services = serviceRows.rows.map(serviceFromRow);
  return checkBookingCapacity({
    branch: branchFromRow(branchResult.rows[0]),
    service: serviceFromRow(serviceResult.rows[0]),
    branchId: branchId as BranchId,
    date,
    bookings,
    services,
    decisions,
    excludeBookingId,
  });
}

export async function loadCapacitySettings(
  client: Client,
  branchId: string,
) {
  const settingResult = await client.query<{ setting_id: string; scope_key: string; value: string }>(
    "SELECT setting_id, scope_key, value FROM operating_settings WHERE scope_key = 'business' OR scope_key = $1",
    [branchId],
  );
  return initialState.decisions.map((definition) => {
    const values = { ...definition.valueByScope };
    for (const setting of settingResult.rows) {
      if (setting.setting_id === definition.id) {
        values[setting.scope_key as BranchId | "business"] = setting.value;
      }
    }
    return { ...definition, valueByScope: values };
  });
}

export async function getSettingValue(
  client: Client,
  settingId: string,
  scopeKey: string,
) {
  const result = await client.query<{ value: string }>(
    "SELECT value FROM operating_settings WHERE setting_id = $1 AND scope_key = $2",
    [settingId, scopeKey],
  );
  if (result.rows[0]) return result.rows[0].value;
  return initialState.decisions.find((item) => item.id === settingId)?.valueByScope[scopeKey as BranchId | "business"] ?? "";
}

export function expectedPickupDate(date: string, branch: Branch, service: Service, decisions: typeof initialState.decisions) {
  const expected = new Date(`${date}T12:00:00.000Z`);
  const workingHours = configuredNumber(decisions, "branch-working-hours", branch.id, branch.workingHours);
  if (configuredServiceHours(service, decisions) > workingHours) expected.setUTCDate(expected.getUTCDate() + 1);
  return expected.toISOString().slice(0, 10);
}

export async function addJob(client: Client, booking: {
  id: string; customer_id: string; vehicle_id: string; service_id: string; branch_id: string;
}, userId: string) {
  const id = makeId("job");
  await client.query(
    "INSERT INTO jobs (id, booking_id, branch_id, stage) VALUES ($1, $2, $3, 'booked')",
    [id, booking.id, booking.branch_id],
  );
  await client.query(
    `INSERT INTO job_events (id, job_id, from_stage, to_stage, actor_user_id, note)
     VALUES ($1, $2, NULL, 'booked', $3, 'Booking confirmed')`,
    [makeId("event"), id, userId],
  );
}


export type BookingCreateInput = { customerId: string; vehicleId: string; serviceId: string; branchId: string; dropoffDate: string; dropoffTime: string; quoteRef?: { quoteId: string; revision: number }; configurationVersion?: string };
export type BookingCreateOutcome = { error: "STALE_SLOT" | "ACCEPTED_QUOTE_MISMATCH" | "record" | "closed" | "daily-cap" | "bay-capacity" | string } | BookingReservationResult | { bookingId: string; status: Booking["status"] };

/**
 * The booking transaction behind POST /api/bookings, callable inside a caller-owned transaction (quick intake).
 * Honours the configured confirmation policy (instant = confirmed through the capacity-checked reservation service,
 * otherwise a pending booking after the capacity check) so both entry points behave identically.
 */
export async function createBookingInTransaction(client: Client, actor: Pick<GarageActor, "userId">, input: BookingCreateInput, bookingId: string, idempotencyKey: string): Promise<BookingCreateOutcome> {
  if(input.configurationVersion){const configured=await configuredAvailability(client,input.branchId);if(String(configured.configuration?.version??"")!==input.configurationVersion)return {error:"STALE_SLOT" as const};}
  const confirmation = await getSettingValue(client, "booking-confirmation", "business");
  if (confirmation === "instant") {
    return reserveConfirmedBooking(client, { kind: "staff", userId: actor.userId }, {
      ...input, idempotencyKey: idempotencyKey,
    });
  }
  if(input.quoteRef){
    try {await acceptedQuoteInTransaction(client,input.quoteRef,input.branchId,input.customerId,input.vehicleId);}
    catch{return {error:"ACCEPTED_QUOTE_MISMATCH" as const};}
  }
  // Pending path: persist/replay the key in booking_change_idempotency (action 'create-pending').
  const origin = `staff:${actor.userId}`;
  const fingerprint = createHash("sha256").update(JSON.stringify({ action: "create-pending", input })).digest("hex");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`booking-create:${origin}:${idempotencyKey}`]);
  const prior = await client.query<{ request_fingerprint: string; action: string; booking_id: string }>(
    "SELECT request_fingerprint, action, booking_id FROM booking_change_idempotency WHERE origin=$1 AND idempotency_key=$2",
    [origin, idempotencyKey]);
  if (prior.rows[0]) {
    if (prior.rows[0].request_fingerprint !== fingerprint || prior.rows[0].action !== "create-pending") return { status: "invalid", code: "IDEMPOTENCY_KEY_REUSED" };
    const existing = await client.query<{ id: string; status: Booking["status"] }>("SELECT id, status FROM bookings WHERE id=$1", [prior.rows[0].booking_id]);
    if (existing.rows[0]) return { bookingId: existing.rows[0].id, status: existing.rows[0].status };
  }
  await client.query("SELECT pg_advisory_xact_lock_shared(hashtext('booking-capacity-settings'))");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${input.branchId}:${dateOnlyFromSql(input.dropoffDate)}`]);
  const matching = await client.query(
    `SELECT 1 FROM customer_branches cb
     JOIN vehicles v ON v.customer_id = cb.customer_id
     WHERE cb.customer_id = $1 AND v.id = $2 AND cb.branch_id = $3`,
    [input.customerId, input.vehicleId, input.branchId],
  );
  if (!matching.rowCount) return { error: "record" as const };

  const issue = input.quoteRef ? null : await capacityIssue(client, input.branchId, input.dropoffDate, input.serviceId);
  if (issue) return { error: issue };
  const branchResult = await client.query(
    `SELECT id, name_en, daily_dropoff_limit, working_hours, clean_bays, general_bays, weekly_day_off
     FROM branches WHERE id = $1`,
    [input.branchId],
  );
  const serviceResult = await client.query(
    "SELECT id, name_en, bay_type, bay_hours, price_label FROM services WHERE id = $1",
    [input.serviceId],
  );
  if (!branchResult.rowCount || !serviceResult.rowCount) return { error: "record" as const };
  const branch = branchFromRow(branchResult.rows[0]);
  const service = serviceFromRow(serviceResult.rows[0]);
  const decisions = await loadCapacitySettings(client, input.branchId);
  const status: Booking["status"] = confirmation === "instant" ? "confirmed" : "pending";
  const expectedPickup = expectedPickupDate(input.dropoffDate, branch, service, decisions);
  await client.query(
    `INSERT INTO bookings
       (id, customer_id, vehicle_id, service_id, branch_id, dropoff_date, dropoff_time, expected_pickup, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      bookingId,
      input.customerId,
      input.vehicleId,
      input.serviceId,
      input.branchId,
      input.dropoffDate,
      input.dropoffTime,
      expectedPickup,
      status,
      actor.userId,
    ],
  );
  if(input.quoteRef)await client.query("UPDATE bookings SET accepted_quote_id=$2,accepted_quote_revision=$3 WHERE id=$1",[bookingId,input.quoteRef.quoteId,input.quoteRef.revision]);
  if (status === "confirmed") {
    await addJob(client, { id: bookingId, customer_id: input.customerId, vehicle_id: input.vehicleId, service_id: input.serviceId, branch_id: input.branchId }, actor.userId);
  }
  await client.query(
    "INSERT INTO booking_change_idempotency(origin,idempotency_key,request_fingerprint,action,booking_id) VALUES($1,$2,$3,'create-pending',$4)",
    [origin, idempotencyKey, fingerprint, bookingId]);
  return { bookingId, status };
}
