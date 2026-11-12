import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { clerkClient } from "@clerk/express";
import { z } from "zod";
import { initialState } from "../../src/demoData";
import { canTransitionJob, checkBookingCapacity, configuredNumber, configuredServiceHours, warrantyExpiryDate } from "../../src/domain";
import type { Branch, BranchId, Booking, Service } from "../../src/types";
import { canAccessBranch, canManageBookings, canManageSettings, canManageStaff, type GarageRole } from "../authz";
import { requireMembership, actorFor } from "../auth";
import { loadGarageBootstrap } from "../bootstrap";
import { pool, withTransaction } from "../db";
import {
  clearDemoSessionCookie,
  DemoAuthError,
  findDemoActor,
  isDemoAuthEnabled,
  listDemoAccounts,
  provisionDemoActor,
  writeDemoSessionCookie,
} from "../demo-auth";
import { publicWarrantyVerificationRouter, warrantyRouter } from "./warranties";
import { createWhatsAppRouter } from "./whatsapp";
import { selectAutomaticWarrantyPolicy } from "../warranty-rules";
import { ensureWarrantyInvoiceDraft } from "../warranty-invoices";

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
    dropoff_date: string | Date; dropoff_time: string; expected_pickup: string | Date; status: Booking["status"];
  }>(
    `SELECT id, customer_id, vehicle_id, service_id, branch_id, dropoff_date, dropoff_time, expected_pickup, status
     FROM bookings WHERE branch_id = $1 AND dropoff_date = $2 AND status = 'confirmed'`,
    [branchId, date],
  );
  const bookings: Booking[] = bookingResult.rows.map((booking) => ({
    id: booking.id,
    customerId: booking.customer_id,
    vehicleId: booking.vehicle_id,
    serviceId: booking.service_id,
    branchId: booking.branch_id as BranchId,
    dropoffDate: String(booking.dropoff_date).slice(0, 10),
    dropoffTime: booking.dropoff_time.slice(0, 5),
    expectedPickup: String(booking.expected_pickup).slice(0, 10),
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
router.use(requireMembership);
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
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${input.branchId}:${input.dropoffDate}`]);
    const matching = await client.query(
      `SELECT 1 FROM customer_branches cb
       JOIN vehicles v ON v.customer_id = cb.customer_id
       WHERE cb.customer_id = $1 AND v.id = $2 AND cb.branch_id = $3`,
      [input.customerId, input.vehicleId, input.branchId],
    );
    if (!matching.rowCount) return { error: "record" as const };

    const issue = await capacityIssue(client, input.branchId, input.dropoffDate, input.serviceId);
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
    const confirmation = await getSettingValue(client, "booking-confirmation", "business");
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
    if (status === "confirmed") {
      await addJob(client, { id: bookingId, customer_id: input.customerId, vehicle_id: input.vehicleId, service_id: input.serviceId, branch_id: input.branchId }, currentActor.userId);
    }
    return { bookingId, status };
  });
  if ("error" in result) {
    if (result.error === "record") return capacityError(res, undefined);
    return capacityError(res, result.error);
  }
  res.status(201).json({ ok: true, ...result });
});

router.patch("/bookings/:bookingId/confirm", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageBookings(currentActor)) return forbidden(res);
  const bookingId = req.params.bookingId;
  const result = await withTransaction(async (client) => {
    const bookingResult = await client.query<{
      id: string; customer_id: string; vehicle_id: string; service_id: string; branch_id: string;
      dropoff_date: string | Date; dropoff_time: string; expected_pickup: string | Date; status: Booking["status"];
    }>("SELECT * FROM bookings WHERE id = $1 FOR UPDATE", [bookingId]);
    const booking = bookingResult.rows[0];
    if (!booking) return { error: "record" as const };
    if (!canAccessBranch(currentActor, booking.branch_id)) return { error: "forbidden" as const };
    if (booking.status !== "pending") return { error: "record" as const };
    const policy = await getSettingValue(client, "booking-confirmation", "business");
    if (policy === "manager-review" && currentActor.role === "receptionist") {
      return { error: "manager-review" as const };
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${booking.branch_id}:${String(booking.dropoff_date).slice(0, 10)}`]);
    const date = String(booking.dropoff_date).slice(0, 10);
    const issue = await capacityIssue(client, booking.branch_id, date, booking.service_id, bookingId);
    if (issue) return { error: issue };
    const branchResult = await client.query(
      `SELECT id, name_en, daily_dropoff_limit, working_hours, clean_bays, general_bays, weekly_day_off
       FROM branches WHERE id = $1`,
      [booking.branch_id],
    );
    const serviceResult = await client.query(
      "SELECT id, name_en, bay_type, bay_hours, price_label FROM services WHERE id = $1",
      [booking.service_id],
    );
    const decisions = await loadCapacitySettings(client, booking.branch_id);
    const pickup = expectedPickupDate(date, branchFromRow(branchResult.rows[0]), serviceFromRow(serviceResult.rows[0]), decisions);
    await client.query(
      "UPDATE bookings SET status = 'confirmed', expected_pickup = $2, updated_at = now() WHERE id = $1",
      [bookingId, pickup],
    );
    await addJob(client, booking, currentActor.userId);
    return { ok: true as const };
  });
  if ("error" in result) {
    if (result.error === "forbidden") return forbidden(res);
    if (result.error === "manager-review") return routeError(res, 403, "MANAGER_REVIEW_REQUIRED", "A manager must confirm this booking.");
    if (result.error === "record") return routeError(res, 409, "BOOKING_NOT_PENDING", "This booking is no longer waiting for confirmation.");
    return capacityError(res, result.error);
  }
  res.json(result);
});

router.patch("/bookings/:bookingId/cancel", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageBookings(currentActor)) return forbidden(res);
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
  const result = await withTransaction(async (client) => {
    const jobResult = await client.query<{
      id: string;
      branch_id: string;
      assigned_user_id: string | null;
      stage: string;
      service_id: string;
      customer_id: string;
      vehicle_id: string;
    }>(
      `SELECT j.id, j.branch_id, j.assigned_user_id, j.stage,
              b.service_id, b.customer_id, b.vehicle_id
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
    if (!canTransitionJob(job.stage as Parameters<typeof canTransitionJob>[0], parsed.data.nextStage as Parameters<typeof canTransitionJob>[1])) {
      return "transition" as const;
    }
    let autoPolicy: {
      policy_id: string;
      version: number;
      duration_months: number;
      eligible_service_ids: string[];
      auto_issue: boolean;
      status: string;
      start_rule: string;
    } | null = null;
    if (parsed.data.nextStage === "delivered") {
      const policies = await client.query<NonNullable<typeof autoPolicy>>(
        `SELECT policy_id, version, duration_months, eligible_service_ids,
                auto_issue, status, start_rule
         FROM warranty_policies
         WHERE status = 'published' AND auto_issue = true
           AND $1 = ANY(eligible_service_ids)
         FOR SHARE`,
        [job.service_id],
      );
      const selection = selectAutomaticWarrantyPolicy(policies.rows, job.service_id);
      if (selection.error) return "auto-policy-conflict" as const;
      autoPolicy = selection.policy;
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
    if (autoPolicy) {
      const deliveryDateResult = await client.query<{ delivery_date: string }>(
        "SELECT to_char((now() AT TIME ZONE 'Africa/Cairo')::date, 'YYYY-MM-DD') AS delivery_date",
      );
      const startDate = deliveryDateResult.rows[0].delivery_date;
      const expiresOn = warrantyExpiryDate(startDate, autoPolicy.duration_months);
      const warrantyId = makeId("warranty");
      const issued = await client.query<{ id: string }>(
        `INSERT INTO warranties
           (id, policy_id, policy_version, job_id, customer_id, vehicle_id, branch_id, service_id,
            start_date, expires_on, issued_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (job_id, policy_id) DO NOTHING
         RETURNING id`,
        [
          warrantyId,
          autoPolicy.policy_id,
          autoPolicy.version,
          job.id,
          job.customer_id,
          job.vehicle_id,
          job.branch_id,
          job.service_id,
          startDate,
          expiresOn,
          currentActor.userId,
        ],
      );
      if (issued.rowCount) {
        await ensureWarrantyInvoiceDraft(client, {
          warrantyId,
          branchId: job.branch_id,
          serviceId: job.service_id,
          actorUserId: currentActor.userId,
        });
        await client.query(
          `INSERT INTO warranty_audit_events
             (id, policy_id, policy_version, warranty_id, action, details, actor_user_id)
           VALUES ($1, $2, $3, $4, 'warranty-auto-issued', $5, $6)`,
          [
            makeId("warranty-event"),
            autoPolicy.policy_id,
            autoPolicy.version,
            warrantyId,
            `Automatically issued on delivery; coverage ${startDate} through ${expiresOn}.`,
            currentActor.userId,
          ],
        );
        await client.query(
          `INSERT INTO warranty_audit_events
             (id, warranty_id, action, details, actor_user_id)
           VALUES ($1, $2, 'invoice-draft-created', $3, $4)`,
          [
            makeId("warranty-event"),
            warrantyId,
            "A draft invoice was prepared with the covered service; amounts and tax remain unconfirmed.",
            currentActor.userId,
          ],
        );
      }
    }
    return "ok" as const;
  });
  if (result === "forbidden") return forbidden(res);
  if (result === "record") return routeError(res, 404, "JOB_NOT_FOUND", "Job not found.");
  if (result === "transition") return routeError(res, 409, "INVALID_TRANSITION", "That stage change is not allowed.");
  if (result === "auto-policy-conflict") return routeError(res, 409, "AUTO_WARRANTY_POLICY_CONFLICT", "More than one automatic warranty policy covers this service. Ask the Owner to resolve the policy overlap.");
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
