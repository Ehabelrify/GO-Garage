import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { clerkClient } from "@clerk/express";
import { z } from "zod";
import { initialState } from "../seed/seed-data";
import { canTransitionJob, checkBookingCapacity, configuredNumber, configuredServiceHours } from "@garage/domain";
import type { Branch, BranchId, Booking, Service } from "@garage/domain";
import { canAccessBranch, canManageBookings, canManageSettings, canManageStaff, type GarageRole } from "../auth/authz";
import { requireMembership, actorFor } from "../auth/auth";
import { loadGarageBootstrap } from "./bootstrap";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { dateOnlyFromSql } from "../../infrastructure/database/date-only";
import { reserveConfirmedBooking, rescheduleConfirmedBooking, cancelConfirmedBooking, type BookingReservationResult } from "./booking-service";
import { configuredAvailability, demandFromBookedComponents, demandFromWork, listAvailableSlotsForDemand, type OccupancyDemand } from "./availability-service";
import { acceptedQuoteInTransaction } from "../commercial/quote-booking";
import {
  clearDemoSessionCookie,
  DemoAuthError,
  findDemoActor,
  isDemoAuthEnabled,
  listDemoAccounts,
  provisionDemoActor,
  writeDemoSessionCookie,
} from "../auth/demo-auth";
import { publicWarrantyVerificationRouter, warrantyRouter } from "../warranty/warranties";
import { createWhatsAppRouter } from "../whatsapp/whatsapp";
import { issueCoverageInTransaction, WarrantyIssuanceError } from "../warranty/issuance-service";
import { commercialPolicyRouter } from "../commercial/policy-routes";
import { catalogueRouter } from "../commercial/catalogue-routes";
import { quoteRouter } from "../commercial/quote-routes";
import { qualificationRouter } from "../commercial/qualification-routes";
import { reservationRouter } from "../commercial/reservation-routes";
import { benefitRouter } from "../commercial/benefit-routes";
import { transportRouter } from "../commercial/transport-routes";
import { financeRouter } from "../finance/finance-routes";
import { workQueueRouter } from "./work-queue-routes";
import { BenefitError, materializeBenefitsInTransaction } from "../commercial/benefit-service";
import { lockReservationForJobDelivery, redeemReservationOnJobDelivery } from "../commercial/reservation-service";
import { commercialContext } from "../commercial/policy-service";
import { providerWebhookRouter } from "../whatsapp/provider-webhook";

const router = Router();
const editableSettingIds = new Set([
  "booking-confirmation",
  "daily-dropoff-limit",
  "branch-working-hours",
  "clean-bays",
  "general-bays",
  "weekly-day-off",
  "tint-hours",
  "ceramic-hours",
]);
const inviteRoles = ["branch-manager", "receptionist", "technician"] as const;

function actor(req: Request) {
  return actorFor(req)!;
}

function forbidden(res: Response) {
  return res.status(403).json({ code: "ROLE_FORBIDDEN", message: "This action is not available to your role." });
}

function routeError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ code, message });
}

function capacityError(res: Response, issue: string | undefined) {
  if (issue === "closed") return routeError(res, 409, "BRANCH_CLOSED", "The branch is closed on the selected weekday.");
  if (issue === "daily-cap") return routeError(res, 409, "DAILY_CAP_REACHED", "The branch has reached its daily drop-off limit.");
  if (issue === "bay-capacity") return routeError(res, 409, "BAY_CAPACITY_REACHED", "Bay-hour capacity is full for this date and service.");
  return routeError(res, 400, "INVALID_BOOKING", "The selected booking records are not available.");
}

function makeId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function branchFromRow(row: {
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

function serviceFromRow(row: {
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

async function capacityIssue(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
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

async function loadCapacitySettings(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
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

async function getSettingValue(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
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

function expectedPickupDate(date: string, branch: Branch, service: Service, decisions: typeof initialState.decisions) {
  const expected = new Date(`${date}T12:00:00.000Z`);
  const workingHours = configuredNumber(decisions, "branch-working-hours", branch.id, branch.workingHours);
  if (configuredServiceHours(service, decisions) > workingHours) expected.setUTCDate(expected.getUTCDate() + 1);
  return expected.toISOString().slice(0, 10);
}

async function addJob(client: Parameters<Parameters<typeof withTransaction>[0]>[0], booking: {
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

router.get("/health", (_req, res) => res.json({ ok: true }));
router.get("/demo/session", async (req, res) => {
  if (!isDemoAuthEnabled()) return res.json({ enabled: false, accounts: [] });
  const demoActor = await findDemoActor(req);
  res.json({
    enabled: true,
    accounts: listDemoAccounts(),
    actor: demoActor ? {
      email: demoActor.email,
      name: demoActor.name,
      role: demoActor.role,
    } : undefined,
  });
});
router.post("/demo/session", async (req, res, next) => {
  if (!isDemoAuthEnabled()) return routeError(res, 404, "NOT_FOUND", "Route not found.");
  const parsed = z.object({ accountId: z.string().min(1).max(80) }).safeParse(req.body);
  if (!parsed.success) return routeError(res, 400, "INVALID_DEMO_ACCOUNT", "Choose an available demo account.");
  try {
    const demoActor = await provisionDemoActor(parsed.data.accountId);
    writeDemoSessionCookie(req, res, demoActor.userId);
    res.status(201).json({ ok: true });
  } catch (error) {
    if (error instanceof DemoAuthError) {
      const status = error.code === "DEMO_ACCOUNT_DISABLED" || error.code === "DEMO_ACCOUNT_CONFLICT" ? 409 : 400;
      return routeError(res, status, error.code, error.message);
    }
    next(error);
  }
});
router.delete("/demo/session", (req, res) => {
  clearDemoSessionCookie(req, res);
  res.json({ ok: true });
});
router.use("/public/warranty-verification", publicWarrantyVerificationRouter);
router.use("/provider/whatsapp",providerWebhookRouter);
router.use(requireMembership);
router.use("/commercial-policies", commercialPolicyRouter);
router.use("/catalogue", catalogueRouter);
router.use("/quotes", quoteRouter);
router.use("/promotions", qualificationRouter);
router.use("/reservations", reservationRouter);
router.use("/benefits", benefitRouter);
router.use("/transport", transportRouter);
router.use("/finance", financeRouter);
router.use("/work-queues", workQueueRouter);
router.use("/warranties", warrantyRouter);
router.use("/whatsapp", createWhatsAppRouter());

router.get("/session", (req, res) => {
  res.json({ actor: actor(req) });
});

router.get("/bootstrap", async (req, res) => {
  res.json(await loadGarageBootstrap(actor(req)));
});

router.patch("/settings", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageSettings(currentActor)) return forbidden(res);
  const parsed = z.object({
    settingId: z.string().min(1),
    scopeKey: z.string().min(1),
    value: z.string().min(1).max(80),
  }).safeParse(req.body);
  if (!parsed.success) return routeError(res, 400, "INVALID_SETTING", "Enter a valid setting value.");

  const { settingId, scopeKey, value } = parsed.data;
  if (!editableSettingIds.has(settingId)) {
    return routeError(res, 400, "SETTING_ON_HOLD", "This setting is not active yet.");
  }
  const definition = initialState.decisions.find((item) => item.id === settingId);
  if (!definition) return routeError(res, 404, "SETTING_NOT_FOUND", "Setting not found.");
  const validScope = definition.scope === "business"
    ? scopeKey === "business"
    : definition.branches?.includes(scopeKey as BranchId);
  const validValue = definition.options.some((option) => option.value === value);
  if (!validScope || !validValue) {
    return routeError(res, 400, "INVALID_SETTING", "That value is not valid for this setting.");
  }

  const updated = await withTransaction(async (client) => {
    // Serialize Owner capacity changes with every confirmed reservation's capacity read.
    if (settingId !== "booking-confirmation") {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('booking-capacity-settings'))");
    }
    const existing = await client.query<{ value: string; version: number }>(
      "SELECT value, version FROM operating_settings WHERE setting_id = $1 AND scope_key = $2 FOR UPDATE",
      [settingId, scopeKey],
    );
    const oldValue = existing.rows[0]?.value ?? definition.valueByScope[scopeKey as BranchId | "business"] ?? null;
    const version = (existing.rows[0]?.version ?? 0) + 1;
    await client.query(
      `INSERT INTO operating_settings (setting_id, scope_key, value, version, effective_date, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, now())
       ON CONFLICT (setting_id, scope_key)
       DO UPDATE SET value = EXCLUDED.value, version = EXCLUDED.version,
                     effective_date = EXCLUDED.effective_date, updated_by = EXCLUDED.updated_by,
                     updated_at = EXCLUDED.updated_at`,
      [settingId, scopeKey, value, version, currentActor.userId],
    );
    await client.query(
      `INSERT INTO setting_audit_events
         (id, setting_id, scope_key, old_value, new_value, version, effective_date, actor_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, $7)`,
      [makeId("setting-audit"), settingId, scopeKey, oldValue, value, version, currentActor.userId],
    );
    return { oldValue, version };
  });
  res.json({ ok: true, settingId, scopeKey, value, version: updated.version });
});

router.post("/customers", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageBookings(currentActor)) return forbidden(res);
  const parsed = z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(8).max(32),
    plate: z.string().trim().min(2).max(20),
    makeModel: z.string().trim().min(2).max(100),
    language: z.enum(["ar", "en"]).default("ar"),
    branchId: z.string().min(1),
  }).safeParse(req.body);
  if (!parsed.success) return routeError(res, 400, "INVALID_CUSTOMER", "Check the customer and vehicle details.");

  const { name, phone, plate, makeModel, language, branchId } = parsed.data;
  if (!canAccessBranch(currentActor, branchId)) return forbidden(res);
  const normalizedPhone = phone.replace(/\D/g, "");
  if (normalizedPhone.length < 8 || normalizedPhone.length > 15) {
    return routeError(res, 400, "INVALID_PHONE", "Enter a valid phone number.");
  }

  const customerId = makeId("customer");
  const vehicleId = makeId("vehicle");
  const [make = "Vehicle", ...modelParts] = makeModel.split(" ");
  const yearText = modelParts.at(-1);
  const year = yearText && /^\d{4}$/.test(yearText) ? Number(yearText) : null;
  const model = year === null ? modelParts.join(" ") : modelParts.slice(0, -1).join(" ");
  try {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO customers (id, name, phone, phone_normalized, preferred_language)
         VALUES ($1, $2, $3, $4, $5)`,
        [customerId, name, phone, normalizedPhone, language],
      );
      await client.query(
        "INSERT INTO customer_branches (customer_id, branch_id) VALUES ($1, $2)",
        [customerId, branchId],
      );
      await client.query(
        "INSERT INTO vehicles (id, customer_id, make, model, year, plate) VALUES ($1, $2, $3, $4, $5, $6)",
        [vehicleId, customerId, make, model || "Vehicle", year, plate],
      );
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return routeError(res, 409, "DUPLICATE_PHONE", "A customer with this phone number already exists.");
    }
    throw error;
  }
  res.status(201).json({ ok: true, customerId, vehicleId });
});

const bookingInputSchema = z.object({
  customerId: z.string().min(1),
  vehicleId: z.string().min(1),
  serviceId: z.string().min(1),
  branchId: z.string().min(1),
  dropoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }),
  dropoffTime: z.string().regex(/^\d{2}:\d{2}$/).refine((value) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours <= 23 && minutes <= 59;
  }),
  quoteRef:z.object({quoteId:z.string().min(1),revision:z.number().int().positive()}).optional(),
  configurationVersion:z.string().optional(),
});

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { try { dateOnlyFromSql(value); return true; } catch { return false; } });
const availabilityConfigSchema = z.object({
  expectedVersion:z.number().int().nonnegative(), timezone:z.string().min(1), opensAt:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), closesAt:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  workingWeekdays:z.array(z.number().int().min(0).max(6)).min(1), closures:z.array(z.object({date:localDate,reason:z.string().trim().min(1)}).strict()),
  slotMinutes:z.number().int().min(1).max(1440),dailyIntakeLimit:z.number().int().positive(),bayCounts:z.record(z.string().min(1),z.number().int().nonnegative()),
  effectiveFrom:localDate,reason:z.string().trim().min(1),
}).strict();
router.get("/availability/config/:branchId",async(req,res)=>{
  const current=actor(req);if(current.role!=="owner")return forbidden(res);
  const result=await pool.query(`SELECT v.*,a.version AS active_version FROM branch_availability_versions v LEFT JOIN branch_availability_active a ON a.branch_id=v.branch_id WHERE v.branch_id=$1 ORDER BY v.version DESC LIMIT 1`,[req.params.branchId]);
  if(!result.rows[0])return res.json({status:"unconfigured",version:0});
  const row=result.rows[0];
  const closures=await pool.query<{closed_date:string;reason:string}>("SELECT closed_date::text AS closed_date,reason FROM branch_availability_closures WHERE branch_id=$1 AND version=$2 ORDER BY closed_date",[req.params.branchId,row.version]);
  res.json({status:"configured",version:row.version,activeVersion:row.active_version,timezone:row.timezone,opensAt:row.opens_at,closesAt:row.closes_at,workingWeekdays:row.working_weekdays,slotMinutes:row.slot_minutes,dailyIntakeLimit:row.daily_intake_limit,bayCounts:row.bay_counts,effectiveFrom:row.effective_from,closures:closures.rows});
});
router.put("/availability/config/:branchId",async(req,res)=>{
  const current=actor(req);if(current.role!=="owner")return forbidden(res);
  const parsed=availabilityConfigSchema.safeParse(req.body);
  if(!parsed.success)return routeError(res,400,"INVALID_AVAILABILITY_CONFIG","Complete the branch calendar and capacity configuration.");
  const data=parsed.data;
  try {new Intl.DateTimeFormat("en",{timeZone:data.timezone});}catch{return routeError(res,400,"INVALID_TIMEZONE","Choose a valid IANA timezone.");}
  const open=Number(data.opensAt.slice(0,2))*60+Number(data.opensAt.slice(3,5)),close=Number(data.closesAt.slice(0,2))*60+Number(data.closesAt.slice(3,5));
  if(close<=open||(close-open)%data.slotMinutes||new Set(data.workingWeekdays).size!==data.workingWeekdays.length||!Object.keys(data.bayCounts).length||data.closures.some(c=>c.date<data.effectiveFrom)||new Set(data.closures.map(c=>c.date)).size!==data.closures.length)return routeError(res,400,"INVALID_AVAILABILITY_CONFIG","Review opening hours, grid, bays and closures.");
  const outcome=await withTransaction(async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtext('booking-capacity-settings'))");
    const branch=await client.query("SELECT 1 FROM branches WHERE id=$1",[req.params.branchId]);if(!branch.rowCount)return "missing" as const;
    const latest=await client.query<{version:number}>("SELECT version FROM branch_availability_versions WHERE branch_id=$1 ORDER BY version DESC LIMIT 1",[req.params.branchId]);
    if((latest.rows[0]?.version??0)!==data.expectedVersion)return "stale" as const;
    const version=data.expectedVersion+1;
    await client.query("INSERT INTO branch_availability_versions(branch_id,version,timezone,opens_at,closes_at,working_weekdays,slot_minutes,daily_intake_limit,bay_counts,effective_from,approved_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[req.params.branchId,version,data.timezone,data.opensAt,data.closesAt,data.workingWeekdays,data.slotMinutes,data.dailyIntakeLimit,JSON.stringify(data.bayCounts),data.effectiveFrom,current.userId,data.reason]);
    for(const closure of data.closures)await client.query("INSERT INTO branch_availability_closures(branch_id,version,closed_date,reason) VALUES($1,$2,$3,$4)",[req.params.branchId,version,closure.date,closure.reason]);
    await client.query("INSERT INTO branch_availability_active(branch_id,version,activated_by) VALUES($1,$2,$3) ON CONFLICT(branch_id) DO UPDATE SET version=excluded.version,activated_by=excluded.activated_by,activated_at=now()",[req.params.branchId,version,current.userId]);
    await client.query("INSERT INTO branch_availability_audit(id,branch_id,version,action,actor_id,reason) VALUES($1,$2,$3,'approved-and-activated',$4,$5)",[makeId("availability-audit"),req.params.branchId,version,current.userId,data.reason]);
    return version;
  });
  if(outcome==="missing")return routeError(res,404,"BRANCH_NOT_FOUND","Branch not found.");
  if(outcome==="stale")return routeError(res,409,"STALE_AVAILABILITY_CONFIG","Refresh branch availability before saving.");
  res.json({ok:true,version:outcome});
});
const slotQuerySchema=z.object({branchId:z.string().min(1),fromDate:localDate,toDate:localDate,serviceId:z.string().min(1).optional(),quoteId:z.string().min(1).optional(),quoteRevision:z.coerce.number().int().positive().optional(),bookingId:z.string().min(1).optional()}).refine(v=>Boolean(v.serviceId)!==Boolean(v.quoteId),"Choose a service or accepted quote.");
router.get("/availability/slots",async(req,res)=>{
  const current=actor(req);if(!canManageBookings(current))return forbidden(res);
  const parsed=slotQuerySchema.safeParse(req.query);if(!parsed.success)return routeError(res,400,"INVALID_SLOT_QUERY","Choose a service or accepted quote and date range.");
  const input=parsed.data;if(!canAccessBranch(current,input.branchId))return forbidden(res);
  const result=await withTransaction(async client=>{
    if(input.bookingId){
      const booking=await client.query<{branch_id:string;service_id:string;accepted_quote_id:string|null;accepted_quote_revision:number|null;status:string}>("SELECT branch_id,service_id,accepted_quote_id,accepted_quote_revision,status FROM bookings WHERE id=$1",[input.bookingId]);
      const row=booking.rows[0];
      if(!row||row.branch_id!==input.branchId||row.status!=="confirmed"||(input.serviceId&&row.service_id!==input.serviceId)||(input.quoteId&&(row.accepted_quote_id!==input.quoteId||row.accepted_quote_revision!==input.quoteRevision)))return {status:"invalid" as const,code:"BOOKING_NOT_FOUND"};
    }
    let demand:OccupancyDemand[];
    if(input.quoteId){
      if(!input.quoteRevision)return {status:"invalid" as const,code:"INVALID_QUOTE_REF"};
      if(input.bookingId){const booked=await demandFromBookedComponents(client,input.bookingId);if(!booked.demand)return {status:"unconfigured" as const,missing:booked.missing};demand=booked.demand;}
      else {
      const head=await client.query<{branch_id:string;customer_id:string;vehicle_id:string}>("SELECT branch_id,customer_id,vehicle_id FROM quote_heads WHERE id=$1 AND environment_id=$2",[input.quoteId,commercialContext.environmentId]);
      if(!head.rows[0]||head.rows[0].branch_id!==input.branchId)return {status:"invalid" as const,code:"QUOTE_NOT_FOUND"};
      try {const quote=await acceptedQuoteInTransaction(client,{quoteId:input.quoteId,revision:input.quoteRevision},input.branchId,head.rows[0].customer_id,head.rows[0].vehicle_id);const expanded=await demandFromWork(client,quote.work);if(!expanded.demand)return {status:"unconfigured" as const,missing:expanded.missing};demand=expanded.demand;}
      catch{return {status:"invalid" as const,code:"ACCEPTED_QUOTE_MISMATCH"};}
      }
    }else{
      const service=await client.query<{id:string;bay_type:string;bay_hours:string}>("SELECT id,bay_type,bay_hours FROM services WHERE id=$1 AND active=true",[input.serviceId]);
      if(!service.rows[0])return {status:"invalid" as const,code:"SERVICE_NOT_FOUND"};
      const decisionId=service.rows[0].id==="tint"?"tint-hours":service.rows[0].id==="ceramic"?"ceramic-hours":null;
      const setting=decisionId?(await client.query<{value:string}>("SELECT value FROM operating_settings WHERE setting_id=$1 AND scope_key='business'",[decisionId])).rows[0]:undefined;
      const configuredHours=Number(setting?.value),effectiveHours=Number.isFinite(configuredHours)&&configuredHours>0?configuredHours:Number(service.rows[0].bay_hours);
      demand=[{componentId:`service:${service.rows[0].id}`,serviceId:service.rows[0].id,bayType:service.rows[0].bay_type,requiredMinutes:Math.ceil(effectiveHours*60),durationDays:1,aggregation:"sum"}];
    }
    return listAvailableSlotsForDemand(client,{kind:"staff",userId:current.userId},{branchId:input.branchId,demand,fromDate:input.fromDate,toDate:input.toDate,excludeBookingId:input.bookingId});
  });
  if(result.status==="forbidden")return forbidden(res);if(result.status==="invalid")return routeError(res,400,result.code,"Availability cannot be listed.");
  res.json(result);
});

router.post("/bookings", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageBookings(currentActor)) return forbidden(res);
  const parsed = bookingInputSchema.safeParse(req.body);
  if (!parsed.success) return routeError(res, 400, "INVALID_BOOKING", "Check the booking details.");
  const input = parsed.data;
  if (!canAccessBranch(currentActor, input.branchId)) return forbidden(res);

  const bookingId = makeId("booking");
  const result = await withTransaction(async (client) => {
    if(input.configurationVersion){const configured=await configuredAvailability(client,input.branchId);if(String(configured.configuration?.version??"")!==input.configurationVersion)return {error:"STALE_SLOT" as const};}
    const confirmation = await getSettingValue(client, "booking-confirmation", "business");
    if (confirmation === "instant") {
      return reserveConfirmedBooking(client, { kind: "staff", userId: currentActor.userId }, {
        ...input, idempotencyKey: req.get("Idempotency-Key") || bookingId,
      });
    }
    if(input.quoteRef){
      try {await acceptedQuoteInTransaction(client,input.quoteRef,input.branchId,input.customerId,input.vehicleId);}
      catch{return {error:"ACCEPTED_QUOTE_MISMATCH" as const};}
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
        currentActor.userId,
      ],
    );
    if(input.quoteRef)await client.query("UPDATE bookings SET accepted_quote_id=$2,accepted_quote_revision=$3 WHERE id=$1",[bookingId,input.quoteRef.quoteId,input.quoteRef.revision]);
    if (status === "confirmed") {
      await addJob(client, { id: bookingId, customer_id: input.customerId, vehicle_id: input.vehicleId, service_id: input.serviceId, branch_id: input.branchId }, currentActor.userId);
    }
    return { bookingId, status };
  });
  if ("error" in result) {
    if(result.error==="STALE_SLOT")return routeError(res,409,"STALE_SLOT","This availability changed. Refresh slots before saving.");
    if(result.error==="ACCEPTED_QUOTE_MISMATCH")return routeError(res,409,"ACCEPTED_QUOTE_MISMATCH","The accepted quote has changed.");
    if (result.error === "record") return capacityError(res, undefined);
    return capacityError(res, result.error);
  }
  if ("status" in result && result.status === "capacity-conflict") return capacityError(res, result.reason);
  if ("status" in result && result.status === "requires-human") return routeError(res,409,"AVAILABILITY_UNCONFIGURED",result.reasons.join(" "));
  if ("status" in result && (result.status === "forbidden" || result.status === "invalid"))
    return routeError(res, result.status === "forbidden" ? 403 : result.code === "STALE_SLOT" ? 409 : 400, result.code, "The booking could not be confirmed.");
  if ("status" in result && result.status === "replayed") return res.status(201).json({ ok: true, bookingId: result.bookingId, status: "confirmed" });
  if ("status" in result && result.status === "confirmed") return res.status(201).json({ ok: true, bookingId: result.bookingId, status: "confirmed" });
  res.status(201).json({ ok: true, ...result });
});

router.patch("/bookings/:bookingId/confirm", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageBookings(currentActor)) return forbidden(res);
  const bookingId = req.params.bookingId;
  const result = await withTransaction<{error:"record"|"forbidden"|"manager-review"}|BookingReservationResult>(async (client) => {
    const bookingResult = await client.query<{
      id: string; customer_id: string; vehicle_id: string; service_id: string; branch_id: string;
      dropoff_date: string; dropoff_time: string; expected_pickup: string; status: Booking["status"];accepted_quote_id:string|null;accepted_quote_revision:number|null;
    }>("SELECT id, customer_id, vehicle_id, service_id, branch_id, dropoff_date::text AS dropoff_date, dropoff_time, expected_pickup::text AS expected_pickup, status,accepted_quote_id,accepted_quote_revision FROM bookings WHERE id = $1 FOR UPDATE", [bookingId]);
    const booking = bookingResult.rows[0];
    if (!booking) return { error: "record" as const };
    if (!canAccessBranch(currentActor, booking.branch_id)) return { error: "forbidden" as const };
    if (booking.status !== "pending" && booking.status !== "confirmed") return { error: "record" as const };
    const policy = await getSettingValue(client, "booking-confirmation", "business");
    if (booking.status === "pending" && policy === "manager-review" && currentActor.role === "receptionist") {
      return { error: "manager-review" as const };
    }

    return reserveConfirmedBooking(client, { kind: "staff", userId: currentActor.userId }, {
      branchId: booking.branch_id, customerId: booking.customer_id, vehicleId: booking.vehicle_id,
      serviceId: booking.service_id, dropoffDate: dateOnlyFromSql(booking.dropoff_date),
      dropoffTime: booking.dropoff_time.slice(0, 5), pendingBookingId: bookingId,
      quoteRef:booking.accepted_quote_id&&booking.accepted_quote_revision?{quoteId:booking.accepted_quote_id,revision:booking.accepted_quote_revision}:undefined,
      idempotencyKey: req.get("Idempotency-Key") || `confirm:${bookingId}`,
    });
  });
  if ("error" in result) {
    if (result.error === "forbidden") return forbidden(res);
    if (result.error === "manager-review") return routeError(res, 403, "MANAGER_REVIEW_REQUIRED", "A manager must confirm this booking.");
    if (result.error === "record") return routeError(res, 409, "BOOKING_NOT_PENDING", "This booking is no longer waiting for confirmation.");
    return capacityError(res, result.error);
  }
  if ("bookingId" in result) return res.json({ ok: true });
  if (result.status === "capacity-conflict") return capacityError(res, result.reason);
  if (result.status === "requires-human") return routeError(res,409,"AVAILABILITY_UNCONFIGURED",result.reasons.join(" "));
  if (result.status === "forbidden") return forbidden(res);
  if (result.status === "invalid") return routeError(res, 409, result.code, "This booking is no longer waiting for confirmation.");
  res.json(result);
});

router.patch("/bookings/:bookingId/reschedule",async(req,res)=>{
  const current=actor(req);if(!canManageBookings(current))return forbidden(res);
  const parsed=z.object({dropoffDate:localDate,dropoffTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)}).safeParse(req.body);
  if(!parsed.success)return routeError(res,400,"INVALID_BOOKING","Choose a valid local date and time.");
  const result=await withTransaction(client=>rescheduleConfirmedBooking(client,{kind:"staff",userId:current.userId},{bookingId:req.params.bookingId,dropoffDate:parsed.data.dropoffDate,dropoffTime:parsed.data.dropoffTime,idempotencyKey:req.get("Idempotency-Key")||`move:${req.params.bookingId}:${parsed.data.dropoffDate}:${parsed.data.dropoffTime}`}));
  if(result.status==="forbidden")return forbidden(res);
  if(result.status==="invalid")return routeError(res,409,result.code,"The booking cannot be moved.");
  if(result.status==="requires-human")return routeError(res,409,"AVAILABILITY_UNCONFIGURED",result.reasons.join(" "));
  if(result.status==="capacity-conflict")return capacityError(res,result.reason);
  if ("bookingId" in result) return res.json({ok:true,bookingId:result.bookingId,status:result.status});
});
router.patch("/bookings/:bookingId/cancel", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageBookings(currentActor)) return forbidden(res);
  const commercialLink=await pool.query("SELECT 1 FROM promotion_reservations WHERE booking_id=$1 AND status IN ('scheduled','redeemed')",[req.params.bookingId]);
  if(commercialLink.rowCount)return routeError(res,409,"RESERVATION_CANCELLATION_REQUIRED","Cancel the linked reservation through its authorized correction flow.");
  const confirmed=await pool.query<{status:string}>("SELECT status FROM bookings WHERE id=$1",[req.params.bookingId]);
  if(confirmed.rows[0]?.status==="confirmed"){
    const parsed=z.object({reason:z.string().trim().min(1)}).safeParse(req.body);
    if(!parsed.success)return routeError(res,400,"INVALID_CANCELLATION","A cancellation reason is required.");
    const result=await withTransaction(client=>cancelConfirmedBooking(client,{kind:"staff",userId:currentActor.userId},{bookingId:req.params.bookingId,idempotencyKey:req.get("Idempotency-Key")||`cancel:${req.params.bookingId}`,reason:parsed.data.reason}));
    if(result.status==="forbidden")return forbidden(res);
    if(result.status==="invalid")return routeError(res,409,result.code,"The booking cannot be cancelled.");
    return res.json({ok:true,status:result.status});
  }
  const result = await withTransaction(async (client) => {
    const booking = await client.query<{ id: string; branch_id: string; status: Booking["status"] }>(
      "SELECT id, branch_id, status FROM bookings WHERE id = $1 FOR UPDATE",
      [req.params.bookingId],
    );
    const record = booking.rows[0];
    if (!record) return "record" as const;
    if (!canAccessBranch(currentActor, record.branch_id)) return "forbidden" as const;
    if (record.status === "cancelled") return "record" as const;
    const activeJob = await client.query<{ id: string; stage: string }>(
      "SELECT id, stage FROM jobs WHERE booking_id = $1 FOR UPDATE",
      [record.id],
    );
    if (activeJob.rows[0] && activeJob.rows[0].stage !== "booked") return "job-started" as const;
    await client.query("UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = $1", [record.id]);
    if (activeJob.rows[0]) {
      await client.query("UPDATE jobs SET stage = 'cancelled', updated_at = now() WHERE id = $1", [activeJob.rows[0].id]);
      await client.query(
        `INSERT INTO job_events (id, job_id, from_stage, to_stage, actor_user_id, note)
         VALUES ($1, $2, $3, 'cancelled', $4, 'Booking cancelled')`,
        [makeId("event"), activeJob.rows[0].id, activeJob.rows[0].stage, currentActor.userId],
      );
    }
    return "ok" as const;
  });
  if (result === "forbidden") return forbidden(res);
  if (result === "record") return routeError(res, 404, "BOOKING_NOT_FOUND", "Booking not found or already cancelled.");
  if (result === "job-started") return routeError(res, 409, "JOB_ALREADY_STARTED", "The vehicle is already in service; use the workshop workflow.");
  res.json({ ok: true });
});

router.patch("/jobs/:jobId/stage", async (req, res) => {
  const currentActor = actor(req);
  if (!["owner", "branch-manager", "technician"].includes(currentActor.role)) return forbidden(res);
  const parsed = z.object({ nextStage: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return routeError(res, 400, "INVALID_STAGE", "Choose a valid workshop stage.");
  if(["cancelled","no-show"].includes(parsed.data.nextStage)){
    const linked=await pool.query("SELECT 1 FROM promotion_reservations r JOIN jobs j ON j.booking_id=r.booking_id WHERE j.id=$1 AND r.status IN ('scheduled','redeemed')",[req.params.jobId]);
    if(linked.rowCount)return routeError(res,409,"RESERVATION_CANCELLATION_REQUIRED","Use the linked reservation correction flow for this installation.");
  }
  const result = await withTransaction(async (client) => {
    const deliveryReservationId=parsed.data.nextStage==="delivered"?await lockReservationForJobDelivery(client,commercialContext,req.params.jobId):null;
    const jobResult = await client.query<{
      id: string;
      branch_id: string;
      assigned_user_id: string | null;
      stage: string;
      service_id: string;
      customer_id: string;
      vehicle_id: string;
      accepted_quote_id: string | null;
      accepted_quote_revision: number | null;
    }>(
      `SELECT j.id, j.branch_id, j.assigned_user_id, j.stage,
              b.service_id, b.customer_id, b.vehicle_id, b.accepted_quote_id, b.accepted_quote_revision
       FROM jobs j
       JOIN bookings b ON b.id = j.booking_id
       WHERE j.id = $1
       FOR UPDATE OF j`,
      [req.params.jobId],
    );
    const job = jobResult.rows[0];
    if (!job) return "record" as const;
    if (!canAccessBranch(currentActor, job.branch_id)) return "forbidden" as const;
    if (currentActor.role === "technician" && job.assigned_user_id !== currentActor.userId) return "forbidden" as const;
    if (parsed.data.nextStage === "delivered" && job.stage === "delivered") return "ok" as const;
    if (!canTransitionJob(job.stage as Parameters<typeof canTransitionJob>[0], parsed.data.nextStage as Parameters<typeof canTransitionJob>[1])) {
      return "transition" as const;
    }
    const issueTargets: { componentId: string | null; policyRef: { id: string; version: number } }[] = [];
    if (parsed.data.nextStage === "delivered") {
      const components = await client.query<{ component_id: string; service_id: string }>(
        "SELECT component_id,service_id FROM job_work_components WHERE job_id=$1 ORDER BY position FOR UPDATE", [job.id]);
      const quote = await client.query<{ accepted_snapshot: { warrantyBindings: { componentId: string; policy: { id: string; version: number } }[] } }>(
        "SELECT e.accepted_snapshot FROM jobs j JOIN bookings b ON b.id=j.booking_id JOIN quote_acceptance_events e ON e.quote_id=b.accepted_quote_id AND e.revision=b.accepted_quote_revision WHERE j.id=$1 AND e.environment_id=$2", [job.id,commercialContext.environmentId]);
      if (components.rowCount) {
        const bindings = quote.rows[0]?.accepted_snapshot?.warrantyBindings ?? [];
        for (const component of components.rows) {
          const bound = bindings.filter(b => b.componentId === component.component_id);
          if (bound.length > 1) throw new WarrantyIssuanceError(409, "AUTO_WARRANTY_POLICY_CONFLICT", "A component has overlapping accepted warranty policies. Ask the Owner.");
          if (bound.length === 1) {
            const selected = await client.query<{ auto_issue: boolean }>("SELECT auto_issue FROM warranty_policies WHERE policy_id=$1 AND version=$2", [bound[0].policy.id, bound[0].policy.version]);
            if (selected.rows[0]?.auto_issue) issueTargets.push({ componentId: component.component_id, policyRef: bound[0].policy });
          }
          else {
            const available = await client.query<{ policy_id: string; version: number }>(
              "SELECT policy_id,version FROM warranty_policies WHERE status='published' AND auto_issue=true AND $1=ANY(eligible_service_ids) FOR SHARE", [component.service_id]);
            if (available.rowCount) throw new WarrantyIssuanceError(409, "ACCEPTED_WARRANTY_BINDING_REQUIRED", "Automatic component coverage needs an accepted warranty binding.");
          }
        }
      } else {
        const available = await client.query<{ policy_id: string; version: number }>(
          "SELECT policy_id,version FROM warranty_policies WHERE status='published' AND auto_issue=true AND $1=ANY(eligible_service_ids) FOR SHARE", [job.service_id]);
        if (available.rows.length > 1) throw new WarrantyIssuanceError(409, "AUTO_WARRANTY_POLICY_CONFLICT", "More than one automatic policy covers this service. Ask the Owner.");
        if (available.rows[0]) issueTargets.push({ componentId: null, policyRef: { id: available.rows[0].policy_id, version: available.rows[0].version } });
      }
    }
    await client.query("UPDATE jobs SET stage = $2, updated_at = now() WHERE id = $1", [job.id, parsed.data.nextStage]);
    if (parsed.data.nextStage === "cancelled" || parsed.data.nextStage === "no-show") {
      const bookingStatus = parsed.data.nextStage === "no-show" ? "no-show" : "cancelled";
      await client.query("UPDATE bookings SET status = $2, updated_at = now() WHERE id = (SELECT booking_id FROM jobs WHERE id = $1)", [job.id, bookingStatus]);
    }
    await client.query(
      `INSERT INTO job_events (id, job_id, from_stage, to_stage, actor_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [makeId("event"), job.id, job.stage, parsed.data.nextStage, currentActor.userId],
    );
    for (const target of issueTargets) {
      await issueCoverageInTransaction(client, commercialContext, currentActor, {
        jobId: job.id, componentId: target.componentId, policyRef: target.policyRef,
        source: "job-delivery", idempotencyKey: `delivery:${job.id}:${target.componentId ?? "legacy"}:${target.policyRef.id}:${target.policyRef.version}`,
      });
    }
    if(parsed.data.nextStage==="delivered")await redeemReservationOnJobDelivery(client,commercialContext,currentActor,deliveryReservationId,job.id);
    if(parsed.data.nextStage==="delivered"&&job.accepted_quote_id&&job.accepted_quote_revision){
      await materializeBenefitsInTransaction(client,commercialContext,currentActor,{quoteRef:{quoteId:job.accepted_quote_id,revision:job.accepted_quote_revision},trigger:"delivered"});
    }
    return "ok" as const;
  }).catch((error: unknown) => {
    if (error instanceof WarrantyIssuanceError) return error;
    if (error instanceof BenefitError) return error;
    throw error;
  });
  if (result instanceof WarrantyIssuanceError || result instanceof BenefitError) return routeError(res, result.status, result.code, result.message);
  if (result === "forbidden") return forbidden(res);
  if (result === "record") return routeError(res, 404, "JOB_NOT_FOUND", "Job not found.");
  if (result === "transition") return routeError(res, 409, "INVALID_TRANSITION", "That stage change is not allowed.");
  res.json({ ok: true });
});

router.patch("/jobs/:jobId/assignment", async (req, res) => {
  const currentActor = actor(req);
  if (!["owner", "branch-manager"].includes(currentActor.role)) return forbidden(res);
  const parsed = z.object({ technicianUserId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return routeError(res, 400, "INVALID_ASSIGNMENT", "Choose a technician.");
  const result = await withTransaction(async (client) => {
    const job = await client.query<{ id: string; branch_id: string }>(
      "SELECT id, branch_id FROM jobs WHERE id = $1 FOR UPDATE",
      [req.params.jobId],
    );
    if (!job.rows[0]) return "record" as const;
    if (!canAccessBranch(currentActor, job.rows[0].branch_id)) return "forbidden" as const;
    const technician = await client.query<{ clerk_user_id: string }>(
      `SELECT clerk_user_id FROM staff_memberships
       WHERE clerk_user_id = $1 AND role = 'technician' AND status = 'active'
         AND $2 = ANY(branch_ids)`,
      [parsed.data.technicianUserId, job.rows[0].branch_id],
    );
    if (!technician.rowCount) return "technician" as const;
    await client.query(
      "UPDATE jobs SET assigned_user_id = $2, updated_at = now() WHERE id = $1",
      [job.rows[0].id, parsed.data.technicianUserId],
    );
    return "ok" as const;
  });
  if (result === "forbidden") return forbidden(res);
  if (result === "record") return routeError(res, 404, "JOB_NOT_FOUND", "Job not found.");
  if (result === "technician") return routeError(res, 400, "TECHNICIAN_NOT_AVAILABLE", "Choose an active technician assigned to this branch.");
  res.json({ ok: true });
});

router.get("/staff", async (req, res) => {
  const currentActor = actor(req);
  if (currentActor.role !== "owner" && currentActor.role !== "branch-manager") return forbidden(res);
  const members = currentActor.role === "owner"
    ? await pool.query(
      `SELECT clerk_user_id AS "userId", email, full_name AS name, role, branch_ids AS "branchIds", status, created_at AS "createdAt"
       FROM staff_memberships ORDER BY created_at`,
    )
    : await pool.query(
      `SELECT clerk_user_id AS "userId", '' AS email, full_name AS name, role, branch_ids AS "branchIds", status
       FROM staff_memberships
       WHERE role = 'technician' AND status = 'active' AND branch_ids && $1::text[]
       ORDER BY full_name`,
      [currentActor.branchIds],
    );
  if (currentActor.role !== "owner") {
    return res.json({ members: members.rows, invitations: [] });
  }
  if (currentActor.isDemo) return res.json({ members: members.rows, invitations: [] });
  const invitations = await clerkClient.invitations.getInvitationList({ limit: 100, orderBy: "-created_at" });
  const pendingInvitations = invitations.data
    .filter((invitation) => invitation.publicMetadata?.garageRole && !invitation.revoked)
    .map((invitation) => ({
      id: invitation.id,
      email: invitation.emailAddress,
      role: invitation.publicMetadata?.garageRole,
      branchIds: invitation.publicMetadata?.garageBranchIds ?? [],
      status: invitation.status,
      createdAt: new Date(invitation.createdAt).toISOString(),
    }));
  res.json({ members: members.rows, invitations: pendingInvitations });
});

router.post("/staff/invitations", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageStaff(currentActor)) return forbidden(res);
  if (currentActor.isDemo) return routeError(res, 403, "DEMO_ACTION_DISABLED", "Live Clerk invitations are unavailable in a temporary demo session.");
  const parsed = z.object({
    email: z.string().trim().email().max(254),
    role: z.enum(inviteRoles),
    branchIds: z.array(z.string().min(1)).min(1).max(10),
  }).safeParse(req.body);
  if (!parsed.success) return routeError(res, 400, "INVALID_INVITATION", "Enter an email, role, and branch access.");

  const { email, role, branchIds } = parsed.data;
  const uniqueBranchIds = [...new Set(branchIds)];
  const knownBranches = await pool.query<{ id: string }>(
    "SELECT id FROM branches WHERE id = ANY($1::text[])",
    [uniqueBranchIds],
  );
  if (knownBranches.rowCount !== uniqueBranchIds.length) {
    return routeError(res, 400, "INVALID_BRANCH", "Choose branches that exist in Garage OS.");
  }
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(",")[0]?.trim() ?? req.get("host");
  if (!host) return routeError(res, 400, "INVITE_UNAVAILABLE", "The sign-in address could not be created.");
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)?.split(",")[0]?.trim() ?? req.protocol;
  const invitation = await clerkClient.invitations.createInvitation({
    emailAddress: email.toLowerCase(),
    redirectUrl: `${protocol}://${host}/sign-in`,
    publicMetadata: {
      garageRole: role,
      garageBranchIds: uniqueBranchIds,
      invitedBy: currentActor.userId,
    },
  });
  res.status(201).json({
    id: invitation.id,
    email: invitation.emailAddress,
    role,
    branchIds: uniqueBranchIds,
    status: invitation.status,
    createdAt: new Date(invitation.createdAt).toISOString(),
  });
});

router.delete("/staff/invitations/:invitationId", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageStaff(currentActor)) return forbidden(res);
  if (currentActor.isDemo) return routeError(res, 403, "DEMO_ACTION_DISABLED", "Live Clerk invitations are unavailable in a temporary demo session.");
  await clerkClient.invitations.revokeInvitation(req.params.invitationId);
  res.json({ ok: true });
});

router.delete("/staff/:userId", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageStaff(currentActor)) return forbidden(res);
  if (currentActor.isDemo) return routeError(res, 403, "DEMO_ACTION_DISABLED", "Staff changes are unavailable in a temporary demo session.");
  if (req.params.userId === currentActor.userId) {
    return routeError(res, 409, "CANNOT_REMOVE_SELF", "You cannot remove your own access.");
  }
  const target = await pool.query<{ role: GarageRole }>(
    "SELECT role FROM staff_memberships WHERE clerk_user_id = $1 AND status = 'active'",
    [req.params.userId],
  );
  if (!target.rowCount) return routeError(res, 404, "MEMBER_NOT_FOUND", "Team member not found.");
  if (target.rows[0].role === "owner") {
    const owners = await pool.query(
      "SELECT 1 FROM staff_memberships WHERE role = 'owner' AND status = 'active' AND clerk_user_id <> $1",
      [req.params.userId],
    );
    if (!owners.rowCount) return routeError(res, 409, "LAST_OWNER", "At least one active owner must remain.");
  }
  await pool.query(
    "UPDATE staff_memberships SET status = 'inactive', updated_at = now() WHERE clerk_user_id = $1",
    [req.params.userId],
  );
  let sessionsRevoked = true;
  try {
    const sessionIds: string[] = [];
    let offset = 0;
    let totalCount = 0;
    do {
      const sessions = await clerkClient.sessions.getSessionList({
        userId: req.params.userId,
        status: "active",
        limit: 100,
        offset,
      });
      sessionIds.push(...sessions.data.map((session) => session.id));
      if (!sessions.data.length) break;
      offset += sessions.data.length;
      totalCount = sessions.totalCount;
    } while (offset < totalCount);
    await Promise.all(sessionIds.map((sessionId) => clerkClient.sessions.revokeSession(sessionId)));
  } catch {
    sessionsRevoked = false;
    console.error("One or more staff sessions could not be revoked after access removal.");
  }
  res.json({ ok: true, sessionsRevoked });
});

router.use((_req, res) => {
  res.status(404).json({ code: "NOT_FOUND", message: "Route not found." });
});

export function createApiRouter() {
  return router;
}
