import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { initialState } from "../seed/seed-data";
import {
  configuredNumber,
  configuredServiceHours,
  estimatePickupDate,
} from "@garage/domain";
import type { Branch, BranchId, Booking, JobStage, Locale, Service } from "@garage/domain";
import {
  canClaimWhatsAppConversation,
  canReplyToWhatsAppConversation,
  type GarageActor,
} from "../auth/authz";
import { actorFor } from "../auth/auth";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { dateOnlyFromSql } from "../../infrastructure/database/date-only";
import { reserveConfirmedBooking, rescheduleConfirmedBooking, cancelConfirmedBooking } from "../operations/booking-service";
import { listAvailableSlotsForDemand } from "../operations/availability-service";
import { isWhatsAppProviderDeliveryEnabled, isWhatsAppSimulationWriteEnabled } from "./whatsapp-policy";
import { canAccessInbox,canActorAccessInboxBranch,loadInboxMembership,setInboxMembership } from "./inbox-access";

const router = Router();
const allowedRoles = ["owner", "branch-manager", "receptionist"];

function id(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function isValidDate(value: string) {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.valueOf())
    && parsed.toISOString().slice(0, 10) === value;
}

function dateValue(value: string | Date) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function addDays(value: string, count: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function locale(value: unknown): Locale {
  return value === "ar" ? "ar" : "en";
}

function branchFromRow(row: {
  id: string;
  name_en: string;
  daily_dropoff_limit: number;
  working_hours: number | string;
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
  bay_hours: number | string;
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

async function settingsForBranch(client: Parameters<Parameters<typeof withTransaction>[0]>[0], branchId: string) {
  const saved = await client.query<{ setting_id: string; scope_key: string; value: string }>(
    "SELECT setting_id, scope_key, value FROM operating_settings WHERE scope_key = 'business' OR scope_key = $1",
    [branchId],
  );
  return initialState.decisions.map((definition) => {
    const values = { ...definition.valueByScope };
    for (const row of saved.rows) {
      if (row.setting_id === definition.id) values[row.scope_key as BranchId | "business"] = row.value;
    }
    return { ...definition, valueByScope: values };
  });
}

async function estimatePickup(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  branchId: string,
  date: string,
  service: Service,
  lang: Locale,
  currentBookingId?: string,
  currentStage?: JobStage | null,
) {
  const branchResult = await client.query(
    `SELECT id, name_en, daily_dropoff_limit, working_hours, clean_bays, general_bays, weekly_day_off
     FROM branches WHERE id = $1`,
    [branchId],
  );
  const settings = await settingsForBranch(client, branchId);
  const branch = branchFromRow(branchResult.rows[0]);
  const bayCount = service.bayType === "clean"
    ? configuredNumber(settings, "clean-bays", branch.id, branch.cleanBays)
    : configuredNumber(settings, "general-bays", branch.id, branch.generalBays);
  const workingHours = configuredNumber(settings, "branch-working-hours", branch.id, branch.workingHours);
  const serviceHours = configuredServiceHours(service, settings);
  const queue = await client.query<{ stage: JobStage; bay_type: "clean" | "general"; bay_hours: string; service_id: string }>(
    `SELECT j.stage, s.bay_type, s.bay_hours, s.id AS service_id
     FROM jobs j JOIN bookings b ON b.id = j.booking_id
     JOIN services s ON s.id = b.service_id
     WHERE j.branch_id = $1
       AND j.stage IN ('booked', 'received', 'in-service', 'qc')
       AND b.status = 'confirmed'
       AND ($2::text IS NULL OR b.id <> $2)`,
    [branchId, currentBookingId ?? null],
  );
  const queueHours = queue.rows.reduce((hours, job) => {
    if (job.bay_type !== service.bayType) return hours;
    const queuedService = initialState.services.find((item) => item.id === job.service_id)
      ?? { ...service, id: job.service_id, bayHours: Number(job.bay_hours) };
    const configuredHours = configuredServiceHours(queuedService, settings);
    const remainingFactor = job.stage === "qc" ? 0.1 : job.stage === "in-service" ? 0.5 : 1;
    return hours + configuredHours * remainingFactor;
  }, 0) + (currentStage
    ? serviceHours * (currentStage === "qc" ? 0.1 : currentStage === "in-service" ? 0.5 : currentStage === "ready" || currentStage === "delivered" ? 0 : 1)
    : 0);
  const newlyRequestedHours = currentStage ? 0 : serviceHours;
  const estimate = estimatePickupDate({
    startDate: date,
    queueHours,
    serviceHours: newlyRequestedHours,
    bayCount,
    workingHours,
    weeklyDayOff: branch.weeklyDayOff,
  });
  const reason = lang === "ar"
    ? `ØªÙ‚Ø¯ÙŠØ± Ù…Ø¨Ù†ÙŠ Ø¹Ù„Ù‰ ${newlyRequestedHours} Ø³Ø§Ø¹Ø© Ø®Ø¯Ù…Ø© Ø¬Ø¯ÙŠØ¯Ø©ØŒ Ùˆ${queueHours.toFixed(1)} Ø³Ø§Ø¹Ø© Ø´ØºÙ„ Ù…ØªØ¨Ù‚ÙŠØ© ÙÙŠ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø±ØŒ Ùˆ${bayCount} Ø¨Ø§ÙŠ ${service.bayType === "clean" ? "Ù†Ø¸ÙŠÙ" : "Ø¹Ø§Ø¯ÙŠ"}ØŒ Ùˆ${workingHours} Ø³Ø§Ø¹Ø© ØªØ´ØºÙŠÙ„ ÙŠÙˆÙ…ÙŠØ§Ù‹.`
    : `Estimate uses ${newlyRequestedHours} new service bay-hours, ${queueHours.toFixed(1)} remaining queued bay-hours, ${bayCount} ${service.bayType} bay(s), and ${workingHours} configured work-hours/day.`;
  return { expectedPickup: estimate, reason, calculatedAt: new Date().toISOString() };
}

function recordEvent(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  conversationId: string,
  type: string,
  details: string,
  actorId: string,
) {
  return client.query(
    `INSERT INTO whatsapp_conversation_events (id, conversation_id, event_type, details, actor_user_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [id("wa-event"), conversationId, type, details, actorId],
  );
}

async function getConversationRecord(actor: GarageActor, conversationId: string) {
  const result = await pool.query<{
    id: string; branch_id: string; customer_label: string; customer_id: string; vehicle_id: string;
    verification_code: string; status: string; assigned_user_id: string | null; unread_count: number;
    related_booking_id: string | null; updated_at: Date; assigned_name: string | null;version:number;mode:"simulation"|"scenario"|"operational";
  }>(
    `SELECT c.id, c.branch_id, c.customer_label, c.customer_id, c.vehicle_id, c.verification_code,c.mode,c.version,
            c.status, c.assigned_user_id, c.unread_count, c.related_booking_id, c.updated_at,
            m.full_name AS assigned_name
     FROM whatsapp_conversations c
     LEFT JOIN staff_memberships m ON m.clerk_user_id = c.assigned_user_id
     WHERE c.id = $1 AND c.mode = $2`,
    [conversationId,conversationMode()],
  );
  const conversation = result.rows[0];
  if (!conversation) return null;
  if (!canAccessInbox(actor,await loadInboxMembership(actor.userId),{branchId:conversation.branch_id})) return false;
  return conversation;
}

function responseError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ code, message });
}

function currentActor(req: Request, res: Response) {
  const current = actorFor(req);
  if (!current) {
    responseError(res, 401, "SIGN_IN_REQUIRED", "Sign in to continue.");
    return null;
  }
  if (!allowedRoles.includes(current.role)) {
    responseError(res, 403, "ROLE_FORBIDDEN", "This action is not available to your role.");
    return null;
  }
  return current;
}

const conversationMode=()=>process.env.GARAGE_DATASET_CLASS==="operational"?"operational":process.env.GARAGE_DATASET_CLASS==="scenario"?"scenario":"simulation";

router.get("/status", async (req, res) => {
  const actor = actorFor(req);
  if (!actor) return responseError(res, 401, "SIGN_IN_REQUIRED", "Sign in to continue.");
  if (!allowedRoles.includes(actor.role)) return responseError(res, 403, "ROLE_FORBIDDEN", "This action is not available to your role.");
  const centralMembership=await loadInboxMembership(actor.userId);
  res.json({
    mode: conversationMode(),
    providerConnected: isWhatsAppProviderDeliveryEnabled(),
    deliveryEnabled: isWhatsAppProviderDeliveryEnabled(),
    centralMembership:centralMembership?.status??"not-enrolled",
    readiness: {
      businessAssetsApproved: false,
      businessNumbersVerified: false,
      credentialsConfigured: false,
      templatesApproved: false,
      customerConsentAndRulesApproved: false,
      outageFallbackDocumented: false,
    },
  });
});

router.get("/services", async (req, res) => {
  const actor = currentActor(req, res);
  if (!actor) return;
  const result = await pool.query(
    "SELECT id, name_en, name_ar, price_label, bay_hours FROM services WHERE active = true ORDER BY name_en",
  );
  res.json({
    services: result.rows.map((row) => ({
      id: row.id,
      nameEn: row.name_en,
      nameAr: row.name_ar,
      priceLabel: row.price_label,
      bayHours: Number(row.bay_hours),
    })),
  });
});

router.get("/branches",async(req,res)=>{const actor=currentActor(req,res);if(!actor)return;const membership=await loadInboxMembership(actor.userId);const rows=await pool.query<{id:string;name_en:string;name_ar:string}>("SELECT id,name_en,name_ar FROM branches ORDER BY id");const branches=rows.rows.filter(branch=>canAccessInbox(actor,membership,{branchId:branch.id})).map(branch=>({id:branch.id,label:{en:branch.name_en,ar:branch.name_ar}}));if(actor.role==="owner"||membership?.status==="active")branches.unshift({id:"all",label:{en:"All branches",ar:"كل الفروع"}});res.json({branches});});

router.put("/inbox-memberships/:userId",async(req,res)=>{const actor=actorFor(req);if(!actor)return responseError(res,401,"SIGN_IN_REQUIRED","Sign in to continue.");const parsed=z.object({active:z.boolean()}).safeParse(req.body);if(!parsed.success)return responseError(res,400,"INVALID_MEMBERSHIP","Choose active or revoked.");try{res.json(await setInboxMembership(actor,{staffUserId:req.params.userId,active:parsed.data.active}));}catch(error){const value=error as Error&{status?:number;code?:string};responseError(res,value.status??500,value.code??"MEMBERSHIP_FAILED",value.message);}});

router.get("/staff", async (req, res) => {
  const actor = currentActor(req, res);
  if (!actor) return;
  const branchId = typeof req.query.branchId === "string" ? req.query.branchId : "";
  if (!branchId || !await canActorAccessInboxBranch(actor, branchId)) {
    return responseError(res, 403, "BRANCH_FORBIDDEN", "Choose a branch you can access.");
  }
  const result = await pool.query<{ userId: string; name: string; role: string }>(
    `SELECT clerk_user_id AS "userId", full_name AS name, role
     FROM staff_memberships
     WHERE status = 'active'
       AND role IN ('owner', 'branch-manager', 'receptionist')
       AND (role = 'owner' OR $1 = ANY(branch_ids))
       AND ($2 <> 'receptionist' OR clerk_user_id = $3)
     ORDER BY full_name`,
    [branchId, actor.role, actor.userId],
  );
  res.json({ staff: result.rows });
});

router.post("/conversations/:conversationId/service-question", async (req, res) => {
  const actor = currentActor(req, res);
  if (!actor) return;
  if(conversationMode()==="operational")return responseError(res,403,"SCENARIO_ONLY","This simulator action is unavailable in the operational inbox.");
  const parsed = z.object({ serviceId: z.string().min(1), lang: z.enum(["ar", "en"]).optional() }).safeParse(req.body);
  if (!parsed.success) return responseError(res, 400, "INVALID_SERVICE", "Choose an active service.");
  const conversation = await getConversationRecord(actor, req.params.conversationId);
  if (conversation === false) return responseError(res, 403, "BRANCH_FORBIDDEN", "This conversation is outside your branch access.");
  if (!conversation) return responseError(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  const serviceResult = await pool.query<{
    name_en: string; name_ar: string; price_label: string; bay_hours: string;
  }>(
    "SELECT name_en, name_ar, price_label, bay_hours FROM services WHERE id = $1 AND active = true",
    [parsed.data.serviceId],
  );
  const service = serviceResult.rows[0];
  if (!service) return responseError(res, 404, "SERVICE_NOT_FOUND", "Service not found.");
  const lang = parsed.data.lang ?? "en";
  const serviceName = lang === "ar" ? service.name_ar : service.name_en;
  const answer = lang === "ar"
    ? `${serviceName} Ù…Ø¯Ø±Ø¬Ø© ÙƒØªÙ‚Ø¯ÙŠØ± ØªØ¬Ø±ÙŠØ¨ÙŠ ÙÙ‚Ø· (${service.price_label}). Ø§Ù„Ø³Ø¹Ø± Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ Ù…Ø­ØªØ§Ø¬ ÙØ­Øµ Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©. Ù…Ø¯Ø© Ø§Ù„Ø´ØºÙ„ Ø§Ù„Ù…Ù‚Ø¯Ø±Ø© ${Number(service.bay_hours)} Ø³Ø§Ø¹Ø© Ø¨Ø§ÙŠ. Ù…Ø§ÙÙŠØ´ Ø­Ø¬Ø² Ø£Ùˆ Ø±Ø³Ø§Ù„Ø© Ø§ØªØ¨Ø¹ØªØª.`
    : `${serviceName} is shown as a sample quote only (${service.price_label}). A final price requires vehicle inspection. Estimated work is ${Number(service.bay_hours)} bay-hours. No booking or message was sent.`;
  const messages = await withTransaction(async (client) => {
    const customerMessage = await client.query(
      `INSERT INTO whatsapp_messages (id, conversation_id, kind, body)
       VALUES ($1, $2, 'customer', $3)
       RETURNING id, kind, body AS text, created_at AS "createdAt"`,
      [id("wa-message"), conversation.id, lang === "ar" ? `Ø³Ø¤Ø§Ù„ Ø¹Ù† Ø®Ø¯Ù…Ø© ${serviceName}` : `Question about ${serviceName}`],
    );
    const botMessage = await client.query(
      `INSERT INTO whatsapp_messages (id, conversation_id, kind, body)
       VALUES ($1, $2, 'bot', $3)
       RETURNING id, kind, body AS text, created_at AS "createdAt"`,
      [id("wa-message"), conversation.id, answer],
    );
    await client.query(
      "UPDATE whatsapp_conversations SET unread_count = unread_count + 1, updated_at = now(), status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END WHERE id = $1",
      [conversation.id],
    );
    await recordEvent(client, conversation.id, "service-question-answered", `Fictional service information returned for ${parsed.data.serviceId}; no quote or booking was made.`, actor.userId);
    return { customer: customerMessage.rows[0], bot: botMessage.rows[0] };
  });
  res.status(201).json({ ...messages, simulation: true, deliveryState: "not-sent" });
});

router.get("/conversations", async (req, res) => {
  const actor = currentActor(req, res);
  if (!actor) return;
  const branchId = typeof req.query.branchId === "string" ? req.query.branchId : "";
  const membership=await loadInboxMembership(actor.userId),allBranches=branchId==="all"&&(actor.role==="owner"||membership?.status==="active");
  if (!branchId || (!allBranches&&!await canActorAccessInboxBranch(actor, branchId))) {
    return responseError(res, 403, "BRANCH_FORBIDDEN", "Choose a branch you can access.");
  }
  const result = await pool.query(
    `SELECT c.id, c.branch_id AS "branchId", c.customer_label AS "customerLabel", c.status,
            c.assigned_user_id AS "assignedUserId", COALESCE(m.full_name, '') AS "assignedTo",
            c.unread_count AS "unreadCount", c.updated_at AS "updatedAt",c.version,
            last.body AS preview, (c.mode <> 'operational') AS simulation
     FROM whatsapp_conversations c
     LEFT JOIN staff_memberships m ON m.clerk_user_id = c.assigned_user_id
     LEFT JOIN LATERAL (
       SELECT body FROM whatsapp_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
     ) last ON true
     WHERE ($1='all' OR c.branch_id = $1) AND c.mode = $2
     ORDER BY c.updated_at DESC`,
    [branchId,conversationMode()],
  );
  res.json({ conversations: result.rows });
});

router.post("/conversations", async (req, res) => {
  const actor = currentActor(req, res);
  if (!actor) return;
  if(!isWhatsAppSimulationWriteEnabled()||conversationMode()==="operational")return responseError(res,503,"SCENARIO_ONLY","Fictional conversation creation is available only in the isolated scenario environment.");
  const parsed = z.object({ branchId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success || !await canActorAccessInboxBranch(actor, parsed.data.branchId)) {
    return responseError(res, 403, "BRANCH_FORBIDDEN", "Choose a branch you can access.");
  }
  const customer = await pool.query<{ id: string; name: string; vehicle_id: string }>(
    `SELECT c.id, c.name, v.id AS vehicle_id
     FROM customer_branches cb
     JOIN customers c ON c.id = cb.customer_id
     JOIN vehicles v ON v.customer_id = c.id
     WHERE cb.branch_id = $1 AND c.id LIKE 'customer-sample-%'
     ORDER BY c.id LIMIT 1`,
    [parsed.data.branchId],
  );
  if (!customer.rows[0]) return responseError(res, 409, "DEMO_PROFILE_UNAVAILABLE", "No fictional sample profile is configured for this branch.");
  const conversationId = id("wa-sim");
  const conversation = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO whatsapp_conversations
         (id, branch_id, mode, customer_label, customer_id, vehicle_id, verification_code)
       VALUES ($1, $2, $3, $4, $5, $6, '4821')
       RETURNING id, branch_id AS "branchId", customer_label AS "customerLabel", status,
                 unread_count AS "unreadCount", updated_at AS "updatedAt"`,
      [conversationId, parsed.data.branchId,conversationMode(), customer.rows[0].name, customer.rows[0].id, customer.rows[0].vehicle_id],
    );
    await client.query(
      `INSERT INTO whatsapp_messages (id, conversation_id, kind, body)
       VALUES ($1, $2, 'bot', $3)`,
      [id("wa-message"), conversationId, "Simulation only. This fictional conversation is not connected to WhatsApp."],
    );
    await recordEvent(client, conversationId, "conversation-created", "Fictional simulation conversation opened.", actor.userId);
    return inserted.rows[0];
  });
  res.status(201).json({ conversation: { ...conversation, simulation: true } });
});

router.get("/conversations/:conversationId", async (req, res) => {
  const actor = currentActor(req, res);
  if (!actor) return;
  const conversation = await getConversationRecord(actor, req.params.conversationId);
  if (conversation === false) return responseError(res, 403, "BRANCH_FORBIDDEN", "This conversation is outside your branch access.");
  if (!conversation) return responseError(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  const [messages, events] = await Promise.all([
    pool.query(
      `SELECT m.id, CASE WHEN m.kind = 'staff' THEN 'reply' ELSE m.kind END AS kind,
              m.body AS text, m.created_at AS "createdAt",
              COALESCE(s.full_name, CASE WHEN m.kind = 'customer' THEN c.customer_label ELSE 'Simulated bot' END) AS "authorLabel"
       FROM whatsapp_messages m
       JOIN whatsapp_conversations c ON c.id = m.conversation_id
       LEFT JOIN staff_memberships s ON s.clerk_user_id = m.author_user_id
       WHERE m.conversation_id = $1 AND m.mode = $2
       ORDER BY m.created_at`,
      [conversation.id,conversation.mode],
    ),
    pool.query(
      `SELECT e.id, e.event_type AS "eventType", e.details, e.created_at AS "createdAt",
              COALESCE(s.full_name, 'Garage OS') AS "actorLabel"
       FROM whatsapp_conversation_events e
       LEFT JOIN staff_memberships s ON s.clerk_user_id = e.actor_user_id
       WHERE e.conversation_id = $1 ORDER BY e.created_at`,
      [conversation.id],
    ),
  ]);
  res.json({
    conversation: {
      id: conversation.id,
      branchId: conversation.branch_id,
      customerLabel: conversation.customer_label,
      status: conversation.status,
      assignedUserId: conversation.assigned_user_id,
      assignedTo: conversation.assigned_name ?? "",
      unreadCount: conversation.unread_count,
      relatedBookingId: conversation.related_booking_id,
      updatedAt: conversation.updated_at,
      version: conversation.version,
      simulation: conversation.mode!=="operational",
      verificationCode: conversation.verification_code,
    },
    messages: messages.rows,
    events: events.rows,
  });
});

router.post("/conversations/:conversationId/messages", async (req, res) => {
  const actor = currentActor(req, res);
  if (!actor) return;
  const parsed = z.object({
    kind: z.enum(["customer", "reply", "internal-note"]),
    text: z.string().trim().min(1).max(4000),
  }).safeParse(req.body);
  if (!parsed.success) return responseError(res, 400, "INVALID_MESSAGE", "Enter a message.");
  const conversation = await getConversationRecord(actor, req.params.conversationId);
  if (conversation === false) return responseError(res, 403, "BRANCH_FORBIDDEN", "This conversation is outside your branch access.");
  if (!conversation) return responseError(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  if(conversation.mode==="operational"&&parsed.data.kind!=="internal-note")return responseError(res,422,"OUTBOUND_POLICY_UNCONFIGURED","Operational customer messages require an approved delivery policy and provider outbox.");
  if (parsed.data.kind !== "customer" && !canReplyToWhatsAppConversation(actor, conversation.assigned_user_id)) {
    if (!conversation.assigned_user_id) return responseError(res, 409, "CONVERSATION_UNCLAIMED", "Claim the conversation before adding a staff reply or note.");
    return responseError(res, 409, "CONVERSATION_NOT_ASSIGNED", "Only the assigned staff member can add a reply or note.");
  }
  const kind = parsed.data.kind === "reply" ? "staff" : parsed.data.kind;
  const result = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO whatsapp_messages (id, conversation_id, mode, kind, body, author_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, kind, body AS text, created_at AS "createdAt"`,
      [id("wa-message"), conversation.id, conversation.mode,kind, parsed.data.text, parsed.data.kind === "customer" ? null : actor.userId],
    );
    const unread = parsed.data.kind === "customer" ? "unread_count = unread_count + 1" : "unread_count = unread_count";
    await client.query(
      `UPDATE whatsapp_conversations SET ${unread}, updated_at = now(), status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END
       WHERE id = $1`,
      [conversation.id],
    );
    const eventType = parsed.data.kind === "internal-note" ? "internal-note-added" : `${parsed.data.kind}-message-added`;
    await recordEvent(client, conversation.id, eventType, parsed.data.kind === "internal-note" ? "An internal note was added. It is not a customer message." : "A fictional message was added.", actor.userId);
    return inserted.rows[0];
  });
  res.status(201).json({ message: { ...result, authorLabel: parsed.data.kind === "customer" ? conversation.customer_label : actor.name, simulation: true, deliveryState: "not-sent" } });
});

router.post("/conversations/:conversationId/action", async (req, res) => {
  const actor = currentActor(req, res);
  if (!actor) return;
  const parsed = z.object({
    action: z.enum(["claim", "assign", "release", "resolve", "pending", "reopen", "mark-read", "handoff"]),
    userId: z.string().min(1).optional(),
    expectedVersion:z.number().int().positive(),
  }).safeParse(req.body);
  if (!parsed.success) return responseError(res, 400, "INVALID_ACTION", "Choose a valid inbox action.");
  const conversation = await getConversationRecord(actor, req.params.conversationId);
  if (conversation === false) return responseError(res, 403, "BRANCH_FORBIDDEN", "This conversation is outside your branch access.");
  if (!conversation) return responseError(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  const { action } = parsed.data;
  const result = await withTransaction(async (client) => {
    const locked = await client.query<{ branch_id:string;assigned_user_id: string | null; status: string; unread_count: number;version:number }>(
      "SELECT branch_id,assigned_user_id, status, unread_count,version FROM whatsapp_conversations WHERE id = $1 FOR UPDATE",
      [conversation.id],
    );
    const current = locked.rows[0];
    if(!canAccessInbox(actor,await loadInboxMembership(actor.userId,client),{branchId:current.branch_id}))return "revoked" as const;
    if(current.version!==parsed.data.expectedVersion)return "stale" as const;
    if (action === "claim" || action === "assign") {
      const targetUserId = action === "claim" ? actor.userId : (parsed.data.userId ?? actor.userId);
      if (action === "assign" && targetUserId !== actor.userId && actor.role === "receptionist") return "forbidden" as const;
      const member = await client.query(
        `SELECT 1 FROM staff_memberships
         WHERE clerk_user_id = $1 AND role IN ('owner', 'branch-manager', 'receptionist')
           AND status = 'active'
           AND (role = 'owner' OR $2 = ANY(branch_ids))`,
        [targetUserId, conversation.branch_id],
      );
      const central=await loadInboxMembership(targetUserId,client);
      if (!member.rowCount&&central?.status!=="active") return "assignee" as const;
      if (action === "claim" && !canClaimWhatsAppConversation(actor, current.assigned_user_id)) return "already-assigned" as const;
      if (action === "assign" && current.assigned_user_id && current.assigned_user_id !== targetUserId && actor.role === "receptionist") return "forbidden" as const;
      await client.query("UPDATE whatsapp_conversations SET assigned_user_id = $2,version=version+1, updated_at = now() WHERE id = $1", [conversation.id, targetUserId]);
      await recordEvent(client, conversation.id, current.assigned_user_id === targetUserId ? "claim-reaffirmed" : "conversation-assigned", "Assigned to authorized branch staff.", actor.userId);
    } else if (action === "release") {
      if (current.assigned_user_id !== actor.userId && actor.role === "receptionist") return "forbidden" as const;
      await client.query("UPDATE whatsapp_conversations SET assigned_user_id = NULL,version=version+1, updated_at = now() WHERE id = $1", [conversation.id]);
      await recordEvent(client, conversation.id, "assignment-released", "Conversation returned to the branch queue.", actor.userId);
    } else if (action === "mark-read") {
      await client.query("UPDATE whatsapp_conversations SET unread_count = 0,version=version+1 WHERE id = $1", [conversation.id]);
      await recordEvent(client, conversation.id, "conversation-read", "Unread messages were reviewed.", actor.userId);
    } else if (action === "handoff") {
      await client.query(
        `UPDATE whatsapp_conversations SET status = 'open', assigned_user_id = NULL, unread_count = GREATEST(unread_count, 1),version=version+1, updated_at = now()
         WHERE id = $1`,
        [conversation.id],
      );
      await client.query(
        `INSERT INTO whatsapp_messages (id, conversation_id, kind, body)
         VALUES ($1, $2, 'bot', $3)`,
        [id("wa-message"), conversation.id, "A fictional handoff was requested. Branch reception can claim this conversation; no alert or customer message was sent."],
      );
      await recordEvent(client, conversation.id, "human-handoff-requested", "Conversation returned to the branch reception queue. No external alert was sent.", actor.userId);
    } else {
      const status = action === "resolve" ? "resolved" : action === "pending" ? "pending" : "open";
      await client.query("UPDATE whatsapp_conversations SET status = $2,version=version+1, updated_at = now() WHERE id = $1", [conversation.id, status]);
      await recordEvent(client, conversation.id, `status-${status}`, `Conversation status changed to ${status}.`, actor.userId);
    }
    return "ok" as const;
  });
  if (result === "forbidden") return responseError(res, 403, "ROLE_FORBIDDEN", "This action is not available to your role.");
  if (result === "assignee") return responseError(res, 400, "INVALID_ASSIGNEE", "Choose active authorized branch staff.");
  if (result === "already-assigned") return responseError(res, 409, "ALREADY_ASSIGNED", "This conversation is assigned to another staff member.");
  if(result==="revoked")return responseError(res,403,"INBOX_ACCESS_REVOKED","Inbox access changed while this action was pending.");
  if(result==="stale")return responseError(res,409,"STALE_CONVERSATION","Refresh the conversation before applying this action.");
  res.json({ ok: true, simulation: true });
});

router.get("/availability", async (req, res) => {
  const actor=currentActor(req,res);if(!actor)return;
  const branchId=typeof req.query.branchId==="string"?req.query.branchId:"";
  const serviceId=typeof req.query.serviceId==="string"?req.query.serviceId:"";
  const date=typeof req.query.date==="string"?req.query.date:"";
  if(!branchId||!await canActorAccessInboxBranch(actor,branchId))return responseError(res,403,"BRANCH_FORBIDDEN","Choose a branch you can access.");
  if(!serviceId||!isValidDate(date))return responseError(res,400,"INVALID_AVAILABILITY_REQUEST","Choose a valid service and date.");
  const result=await withTransaction(async client=>{
    const service=await client.query<{id:string;bay_type:string;bay_hours:string}>("SELECT id,bay_type,bay_hours FROM services WHERE id=$1 AND active=true",[serviceId]);
    if(!service.rows[0])return {error:"record" as const};
    const demand=[{componentId:`service:${serviceId}`,serviceId,bayType:service.rows[0].bay_type,requiredMinutes:Math.ceil(Number(service.rows[0].bay_hours)*60),durationDays:1,aggregation:"sum" as const}];
    const listing=await listAvailableSlotsForDemand(client,{kind:"staff",userId:actor.userId},{branchId,demand,fromDate:date,toDate:addDays(date,14)});
    if(listing.status!=="available")return {available:false,slots:[],alternatives:[],scheduleNote:locale(req.query.lang)==="ar"?"المواعيد غير مهيأة؛ يلزم اعتماد ساعات العمل والسعة.":"Availability is unconfigured; approved branch hours and capacity are required.",reason:"unconfigured"};
    const today=listing.slots.filter(slot=>slot.dropoffDate===date);
    return {available:today.length>0,slots:today.map(slot=>({date:slot.dropoffDate,time:slot.dropoffTime})),alternatives:listing.slots.filter(slot=>slot.dropoffDate!==date).slice(0,3).map(slot=>({date:slot.dropoffDate,time:slot.dropoffTime})),scheduleNote:locale(req.query.lang)==="ar"?"هذه مواعيد متاحة حالياً في المحاكاة؛ يعاد فحصها عند التأكيد.":"These are current simulator slots; confirmation rechecks capacity.",reason:today.length?undefined:"no-slots"};
  });
  if("error" in result)return responseError(res,404,"SERVICE_NOT_FOUND","Service not found.");
  res.json(result);
});
const bookingDraftSchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().refine(isValidDate),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  lang: z.enum(["ar", "en"]).optional(),
});

router.post("/conversations/:conversationId/booking-draft", async (req, res) => {
  const actor = currentActor(req, res);
  if (!actor) return;
  if(conversationMode()==="operational")return responseError(res,403,"SCENARIO_ONLY","Operational journey changes must arrive through a verified channel event.");
  const parsed = bookingDraftSchema.safeParse(req.body);
  if (!parsed.success) return responseError(res, 400, "INVALID_BOOKING_DRAFT", "Choose a valid service, date, and drop-off time.");
  const conversation = await getConversationRecord(actor, req.params.conversationId);
  if (conversation === false) return responseError(res, 403, "BRANCH_FORBIDDEN", "This conversation is outside your branch access.");
  if (!conversation) return responseError(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  const draft = await withTransaction(async (client) => {
    const serviceResult = await client.query(
      "SELECT id, name_en, bay_type, bay_hours, price_label FROM services WHERE id = $1 AND active = true",
      [parsed.data.serviceId],
    );
    const service = serviceFromRow(serviceResult.rows[0]);
    const demand=[{componentId:`service:${service.id}`,serviceId:service.id,bayType:service.bayType,requiredMinutes:Math.ceil(service.bayHours*60),durationDays:1,aggregation:"sum" as const}];
    const listing=await listAvailableSlotsForDemand(client,{kind:"staff",userId:actor.userId},{branchId:conversation.branch_id,demand,fromDate:parsed.data.date,toDate:parsed.data.date});
    if(listing.status!=="available"||!listing.slots.some(slot=>slot.dropoffTime===parsed.data.time))return {error:"time"} as const;
    const eta = await estimatePickup(client, conversation.branch_id, parsed.data.date, service, parsed.data.lang ?? "en");
    const draftId = id("wa-draft");
    await client.query(
      `INSERT INTO whatsapp_booking_drafts
         (id, conversation_id, service_id, dropoff_date, dropoff_time, expected_pickup, eta_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [draftId, conversation.id, service.id, parsed.data.date, parsed.data.time, eta.expectedPickup, eta.reason],
    );
    await recordEvent(client, conversation.id, "booking-options-prepared", `Fictional booking draft prepared; estimated pickup ${eta.expectedPickup}.`, actor.userId);
    const serviceName = parsed.data.lang === "ar"
      ? (await client.query<{ name_ar: string }>("SELECT name_ar FROM services WHERE id = $1", [service.id])).rows[0]?.name_ar ?? service.name
      : service.name;
    const customerMessage = parsed.data.lang === "ar"
      ? `Ø¹Ø§ÙŠØ² Ø£Ø³ÙŠØ¨ Ø§Ù„Ø¹Ø±Ø¨ÙŠØ© Ù„Ø®Ø¯Ù…Ø© ${serviceName} ÙŠÙˆÙ… ${parsed.data.date} Ø§Ù„Ø³Ø§Ø¹Ø© ${parsed.data.time}.`
      : `I'd like to drop off my car for ${serviceName} on ${parsed.data.date} at ${parsed.data.time}.`;
    const botMessage = parsed.data.lang === "ar"
      ? `Ø§Ù„Ù…ÙˆØ¹Ø¯ Ø§Ù„Ù…Ù‚ØªØ±Ø­ Ù…ØªØ§Ø­ Ø­Ø³Ø¨ Ø³Ø¹Ø© Ø§Ù„ÙØ±Ø¹ Ø§Ù„Ø­Ø§Ù„ÙŠØ©. Ù…ÙˆØ¹Ø¯ Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù… Ø§Ù„ØªÙ‚Ø¯ÙŠØ±ÙŠ ${eta.expectedPickup}. Ø¯ÙŠ Ù…Ø³ÙˆØ¯Ø© ÙÙ‚Ø·ØŒ ÙˆØ§Ù„Ø­Ø¬Ø² Ù…Ø´ Ù‡ÙŠØªØ£ÙƒØ¯ Ø¥Ù„Ø§ Ø¨Ø¹Ø¯ Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø©.`
      : `That suggested time fits the branch's current capacity. Estimated pickup: ${eta.expectedPickup}. This is a draft; no booking is confirmed until approval.`;
    await client.query(
      `INSERT INTO whatsapp_messages (id, conversation_id, kind, body)
       VALUES ($1, $2, 'customer', $3), ($4, $2, 'bot', $5)`,
      [id("wa-message"), conversation.id, customerMessage, id("wa-message"), botMessage],
    );
    return {
      draftId,
      serviceName,
      dropoffDate: parsed.data.date,
      dropoffTime: parsed.data.time,
      expectedPickup: eta.expectedPickup,
      etaReason: eta.reason,
      etaAt: eta.calculatedAt,
    };
  });
  if ("error" in draft) {
    if (draft.error === "time") return responseError(res, 400, "INVALID_DROP_OFF_TIME", "Choose one of the suggested branch drop-off times.");
    return responseError(res, 409, "CAPACITY_UNAVAILABLE", "This time no longer fits branch capacity. Check availability again.");
  }
  res.status(201).json({ ...draft, simulation: true, deliveryState: "not-sent" });
});

router.post("/conversations/:conversationId/booking-confirm", async (req, res) => {
  const actor = currentActor(req, res);
  if (!actor) return;
  if(conversationMode()==="operational")return responseError(res,403,"SCENARIO_ONLY","Operational confirmation must arrive through a verified channel event.");
  const parsed = z.object({ draftId: z.string().min(1), confirmed: z.boolean(), lang: z.enum(["ar", "en"]).optional() }).safeParse(req.body);
  if (!parsed.success) return responseError(res, 400, "INVALID_CONFIRMATION", "Confirm or decline the booking details.");
  const conversation = await getConversationRecord(actor, req.params.conversationId);
  if (conversation === false) return responseError(res, 403, "BRANCH_FORBIDDEN", "This conversation is outside your branch access.");
  if (!conversation) return responseError(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  const outcome = await withTransaction(async (client) => {
    const draftResult = await client.query<{
      id: string; service_id: string; dropoff_date: string; dropoff_time: string;
      expected_pickup: string; status: string;
    }>(
      "SELECT id, service_id, dropoff_date::text AS dropoff_date, dropoff_time, expected_pickup::text AS expected_pickup, status FROM whatsapp_booking_drafts WHERE id = $1 AND conversation_id = $2 FOR UPDATE",
      [parsed.data.draftId, conversation.id],
    );
    const draft = draftResult.rows[0];
    if (!draft) return { error: "draft" as const };
    if (draft.status === "confirmed" && parsed.data.confirmed) {
      // Only a completed durable outcome may be replayed. A pending booking's
      // confirmed draft has no idempotency row and keeps the existing conflict response.
      const completed = await client.query(
        `SELECT 1 FROM booking_idempotency WHERE origin = 'channel:whatsapp-simulation'
         AND idempotency_key = $1 AND outcome_status = 'confirmed'`,
        [`${conversation.id}:${draft.id}`],
      );
      if (!completed.rowCount) return { error: "draft" as const };
      const reserved = await reserveConfirmedBooking(client,
        { kind: "customer-confirmation", channelId: "whatsapp-simulation", confirmationId: draft.id },
        { branchId: conversation.branch_id, customerId: conversation.customer_id, vehicleId: conversation.vehicle_id,
          serviceId: draft.service_id, dropoffDate: dateOnlyFromSql(draft.dropoff_date),
          dropoffTime: draft.dropoff_time.slice(0, 5), idempotencyKey: `${conversation.id}:${draft.id}`,
          confirmationRef: draft.id });
      if (reserved.status !== "replayed") return { error: "draft" as const };
      return { bookingId: reserved.bookingId, status: "confirmed" as const,
        expectedPickup: dateOnlyFromSql(draft.expected_pickup) };
    }
    if (draft.status !== "pending") return { error: "draft" as const };
    if (!parsed.data.confirmed) {
      await client.query("UPDATE whatsapp_booking_drafts SET status = 'cancelled', updated_at = now() WHERE id = $1", [draft.id]);
      await recordEvent(client, conversation.id, "booking-draft-declined", "Customer declined the fictional booking draft.", actor.userId);
      return { declined: true as const };
    }
    const reserved = await reserveConfirmedBooking(client,
      { kind: "customer-confirmation", channelId: "whatsapp-simulation", confirmationId: draft.id },
      { branchId: conversation.branch_id, customerId: conversation.customer_id, vehicleId: conversation.vehicle_id,
        serviceId: draft.service_id, dropoffDate: dateOnlyFromSql(draft.dropoff_date), dropoffTime: draft.dropoff_time.slice(0, 5),
        idempotencyKey: `${conversation.id}:${draft.id}`, confirmationRef: draft.id });
    if (reserved.status !== "confirmed" && reserved.status !== "replayed") return { error: reserved.status } as const;
    const bookingId=reserved.bookingId,bookingStatus="confirmed" as const;
    await client.query("UPDATE whatsapp_booking_drafts SET status = 'confirmed', updated_at = now() WHERE id = $1", [draft.id]);
    await client.query("UPDATE whatsapp_conversations SET related_booking_id = $2, updated_at = now() WHERE id = $1", [conversation.id, bookingId]);
    await recordEvent(client, conversation.id, "simulation-booking-created", `Fictional booking ${bookingId} created after customer confirmation.`, actor.userId);
    return { bookingId, status: bookingStatus, expectedPickup: dateOnlyFromSql(draft.expected_pickup) };
  });
  if ("error" in outcome) return responseError(res, outcome.error === "draft" ? 404 : 409, outcome.error === "draft" ? "DRAFT_NOT_FOUND" : "CAPACITY_UNAVAILABLE", outcome.error === "draft" ? "Booking draft not found or already used." : "Capacity changed; check availability again.");
  if ("declined" in outcome) {
    return res.json({
      ok: true,
      message: parsed.data.lang === "ar"
        ? "Ø±ÙØ¶ Ø§Ù„Ø¹Ù…ÙŠÙ„ Ù…Ø³ÙˆØ¯Ø© Ø§Ù„Ø­Ø¬Ø² Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ› Ù„Ù… ÙŠØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø¬Ø²."
        : "The customer declined the fictional booking draft; no booking was created.",
      simulation: true,
      deliveryState: "not-sent",
    });
  }
  res.status(201).json({
    ok: true,
    ...outcome,
    message: parsed.data.lang === "ar"
      ? outcome.status === "confirmed"
        ? "ØªÙ… ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø­Ø¬Ø² Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ Ø¨Ø¹Ø¯ Ù…ÙˆØ§ÙÙ‚Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø§Ù„ØµØ±ÙŠØ­Ø©. Ù„Ù… ØªÙØ±Ø³Ù„ Ø£ÙŠ Ø±Ø³Ø§Ù„Ø©."
        : "ØªÙ… Ø­ÙØ¸ Ø·Ù„Ø¨ Ø§Ù„Ø­Ø¬Ø² Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ Ø¨Ø¹Ø¯ Ù…ÙˆØ§ÙÙ‚Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„ØŒ ÙˆÙ‡Ùˆ Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„ÙØ±ÙŠÙ‚. Ù„Ù… ØªÙØ±Ø³Ù„ Ø£ÙŠ Ø±Ø³Ø§Ù„Ø©."
      : outcome.status === "confirmed"
        ? "Fictional booking confirmed after explicit customer confirmation. No customer message was sent."
        : "Fictional booking request saved after confirmation and is pending staff review. No customer message was sent.",
    simulation: true,
    deliveryState: "not-sent",
  });
});

router.post("/conversations/:conversationId/booking-change", async (req, res) => {
  const actor = currentActor(req, res);
  if (!actor) return;
  if(conversationMode()==="operational")return responseError(res,403,"SCENARIO_ONLY","Operational booking changes must arrive through a verified channel event.");
  const parsed = z.object({
    bookingId: z.string().min(1),
    action: z.enum(["reschedule", "cancel"]),
    date: z.string().refine(isValidDate).optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    lang: z.enum(["ar", "en"]).optional(),
    confirmed: z.boolean().optional(),
    declined: z.boolean().optional(),
    draftId: z.string().min(1).optional(),
  }).safeParse(req.body);
  if (!parsed.success || (
    parsed.data.action === "reschedule" &&
    !parsed.data.confirmed &&
    !parsed.data.declined &&
    (!parsed.data.date || !parsed.data.time)
  )) {
    return responseError(res, 400, "INVALID_BOOKING_CHANGE", "Provide a valid reschedule date and time.");
  }
  const conversation = await getConversationRecord(actor, req.params.conversationId);
  if (conversation === false) return responseError(res, 403, "BRANCH_FORBIDDEN", "This conversation is outside your branch access.");
  if (!conversation) return responseError(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  const changed = await withTransaction(async (client) => {
    const lang = parsed.data.lang ?? "en";
    if (parsed.data.declined && parsed.data.draftId) {
      const declined = await client.query(
        `UPDATE whatsapp_booking_drafts SET status = 'cancelled', updated_at = now()
         WHERE id = $1 AND conversation_id = $2 AND change_booking_id = $3 AND status = 'pending'
         RETURNING id`,
        [parsed.data.draftId, conversation.id, parsed.data.bookingId],
      );
      if (!declined.rowCount) return { error: "draft" as const };
      await recordEvent(client, conversation.id, "booking-change-declined", "Customer declined the fictional booking change; no booking data changed.", actor.userId);
      return {
        declined: true as const,
        message: lang === "ar" ? "Ø±ÙØ¶ Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ› Ø§Ù„Ø­Ø¬Ø² Ù„Ù… ÙŠØªØºÙŠØ±." : "The customer declined the fictional change; the booking is unchanged.",
      };
    }
    let bookingId = parsed.data.bookingId;
    let changeAction = parsed.data.action;
    let targetDate = parsed.data.date;
    let targetTime = parsed.data.time;
    let etaReason: string | undefined;
    let draftId = parsed.data.draftId;

    if (parsed.data.confirmed) {
      if (!draftId) return { error: "draft" as const };
      const draftResult = await client.query<{
        change_booking_id: string | null; change_action: "reschedule" | "cancel" | null;
        dropoff_date: string | Date; dropoff_time: string; expected_pickup: string | Date; status: string;
      }>(
        `SELECT change_booking_id, change_action, dropoff_date, dropoff_time, expected_pickup, status
         FROM whatsapp_booking_drafts WHERE id = $1 AND conversation_id = $2 FOR UPDATE`,
        [draftId, conversation.id],
      );
      const draft = draftResult.rows[0];
      if (!draft || draft.status !== "pending" || draft.change_booking_id !== bookingId || !draft.change_action) {
        return { error: "draft" as const };
      }
      changeAction = draft.change_action;
      targetDate = dateValue(draft.dropoff_date);
      targetTime = draft.dropoff_time.slice(0, 5);
      const serviceEta = await client.query<{ eta_reason: string }>(
        "SELECT eta_reason FROM whatsapp_booking_drafts WHERE id = $1",
        [draftId],
      );
      etaReason = serviceEta.rows[0]?.eta_reason;
    }

    const result = await client.query<{
      id: string; service_id: string; branch_id: string; status: Booking["status"];
      dropoff_date: string | Date; expected_pickup: string | Date;
    }>(
      `SELECT id, service_id, branch_id, status, dropoff_date, expected_pickup
       FROM bookings WHERE id = $1 AND created_by = 'whatsapp-simulation' FOR UPDATE`,
      [bookingId],
    );
    const booking = result.rows[0];
    if (!booking || booking.branch_id !== conversation.branch_id || conversation.related_booking_id !== booking.id) return { error: "booking" as const };
    if (booking.status === "cancelled") return { error: "booking" as const };
    const job = await client.query<{ id: string; stage: JobStage }>("SELECT id, stage FROM jobs WHERE booking_id = $1 FOR UPDATE", [booking.id]);
    if (job.rows[0] && job.rows[0].stage !== "booked") return { error: "started" as const };

    if (!parsed.data.confirmed) {
      let pickup = dateValue(booking.expected_pickup);
      let reason = lang === "ar"
        ? "Ø¥Ù„ØºØ§Ø¡ Ø§ÙØªØ±Ø§Ø¶ÙŠ Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ù…ÙˆØ§ÙÙ‚Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„."
        : "Fictional cancellation awaiting customer confirmation.";
      if (changeAction === "reschedule") {
        const date = targetDate!;
        const serviceRow = await client.query("SELECT id, name_en, bay_type, bay_hours, price_label FROM services WHERE id = $1", [booking.service_id]);
        const service=serviceFromRow(serviceRow.rows[0]);
        const listing=await listAvailableSlotsForDemand(client,{kind:"staff",userId:actor.userId},{branchId:conversation.branch_id,demand:[{componentId:`service:${service.id}`,serviceId:service.id,bayType:service.bayType,requiredMinutes:Math.ceil(service.bayHours*60),durationDays:1,aggregation:"sum"}],fromDate:date,toDate:date});
        if(listing.status!=="available"||!listing.slots.some(slot=>slot.dropoffTime===targetTime))return {error:"time" as const};
        const eta = await estimatePickup(client, conversation.branch_id, date, serviceFromRow(serviceRow.rows[0]), lang);
        pickup = eta.expectedPickup;
        reason = eta.reason;
      }
      draftId = id("wa-change");
      await client.query(
        `INSERT INTO whatsapp_booking_drafts
           (id, conversation_id, service_id, dropoff_date, dropoff_time, expected_pickup,
            eta_reason, change_booking_id, change_action)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [draftId, conversation.id, booking.service_id, targetDate ?? booking.dropoff_date, targetTime ?? "09:00",
          pickup, reason, booking.id, changeAction],
      );
      await recordEvent(client, conversation.id, "booking-change-offered", `Fictional ${changeAction} awaits customer confirmation.`, actor.userId);
      return {
        requiresConfirmation: true as const,
        draftId,
        action: changeAction,
        dropoffDate: targetDate ?? dateValue(booking.dropoff_date),
        dropoffTime: targetTime ?? "09:00",
        expectedPickup: pickup,
        etaReason: reason,
        etaAt: new Date().toISOString(),
        message: lang === "ar"
          ? "ØªÙ… ØªØ¬Ù‡ÙŠØ² ØªØ¹Ø¯ÙŠÙ„ Ø§ÙØªØ±Ø§Ø¶ÙŠ. Ø§Ù„Ø­Ø¬Ø² Ù„Ù… ÙŠØªØºÙŠØ±Ø› Ø£ÙƒÙ‘Ø¯ Ù…ÙˆØ§ÙÙ‚Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„ Ù„Ù…Ø­Ø§ÙƒØ§Ø© Ø§Ù„ØªÙ†ÙÙŠØ°."
          : "A fictional change is ready. The booking is unchanged; confirm the customer's approval to simulate applying it.",
      };
    }

    if (changeAction === "cancel") {
      const outcome=await cancelConfirmedBooking(client,{kind:"staff",userId:actor.userId},{bookingId:booking.id,idempotencyKey:`wa-change:${draftId}`,reason:"Fictional WhatsApp simulation cancellation"});
      if(outcome.status!=="cancelled"&&outcome.status!=="replayed")return {error:"booking" as const};
      await client.query("UPDATE whatsapp_conversations SET related_booking_id = NULL, updated_at = now() WHERE id = $1", [conversation.id]);
      await recordEvent(client, conversation.id, "simulation-booking-cancelled", "Fictional booking cancelled.", actor.userId);
      await client.query("UPDATE whatsapp_booking_drafts SET status = 'confirmed', updated_at = now() WHERE id = $1", [draftId]);
      return {
        cancelled: true as const,
        message: lang === "ar" ? "ØªÙ… Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø­Ø¬Ø² Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ Ø¨Ø¹Ø¯ Ù…ÙˆØ§ÙÙ‚Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„. Ù„Ù… ØªÙØ±Ø³Ù„ Ø£ÙŠ Ø±Ø³Ø§Ù„Ø©." : "Fictional booking cancelled after customer confirmation. No message was sent.",
      };
    }
    const date = targetDate!;
    const move=await rescheduleConfirmedBooking(client,{kind:"staff",userId:actor.userId},{bookingId:booking.id,dropoffDate:date,dropoffTime:targetTime!,idempotencyKey:`wa-change:${draftId}`});
    if(move.status!=="confirmed"&&move.status!=="replayed")return {error:"capacity" as const};
    const current=await client.query<{expected_pickup:string}>("SELECT expected_pickup::text AS expected_pickup FROM bookings WHERE id=$1",[booking.id]);
    const eta={expectedPickup:current.rows[0].expected_pickup,reason:etaReason??"Confirmed configured availability",calculatedAt:new Date().toISOString()};
    await recordEvent(client, conversation.id, "simulation-booking-rescheduled", `Fictional booking moved to ${date} ${targetTime}; estimated pickup ${eta.expectedPickup}.`, actor.userId);
    await client.query("UPDATE whatsapp_booking_drafts SET status = 'confirmed', updated_at = now() WHERE id = $1", [draftId]);
    return {
      rescheduled: true as const,
      dropoffDate: date,
      dropoffTime: targetTime,
      expectedPickup: eta.expectedPickup,
      etaReason: eta.reason,
      etaAt: eta.calculatedAt,
      message: lang === "ar" ? "ØªÙ… ØªØºÙŠÙŠØ± Ù…ÙˆØ¹Ø¯ Ø§Ù„Ø­Ø¬Ø² Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ Ø¨Ø¹Ø¯ Ù…ÙˆØ§ÙÙ‚Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„. Ù„Ù… ØªÙØ±Ø³Ù„ Ø£ÙŠ Ø±Ø³Ø§Ù„Ø©." : "Fictional booking rescheduled after customer confirmation. No message was sent.",
    };
  });
  if ("error" in changed) {
    if (changed.error === "draft") return responseError(res, 409, "CHANGE_DRAFT_NOT_FOUND", "The pending fictional change was not found or was already used.");
    if (changed.error === "started") return responseError(res, 409, "JOB_ALREADY_STARTED", "This simulated vehicle has entered service and cannot be rescheduled here.");
    if (changed.error === "time") return responseError(res, 400, "INVALID_DROP_OFF_TIME", "Choose one of the suggested branch drop-off times.");
    return responseError(res, changed.error === "booking" ? 404 : 409, changed.error === "booking" ? "BOOKING_NOT_FOUND" : "CAPACITY_UNAVAILABLE", changed.error === "booking" ? "Fictional booking not found." : "Capacity changed; check availability again.");
  }
  res.json({ ok: true, ...changed, simulation: true, deliveryState: "not-sent" });
});

router.post("/conversations/:conversationId/status-lookup", async (req, res) => {
  const actor = currentActor(req, res);
  if (!actor) return;
  if(conversationMode()==="operational")return responseError(res,403,"SCENARIO_ONLY","Operational status lookup must arrive through the verified customer channel.");
  const parsed = z.object({ bookingId: z.string().min(1), verificationCode: z.string().trim().min(1).max(30), lang: z.enum(["ar", "en"]).optional() }).safeParse(req.body);
  if (!parsed.success) return responseError(res, 400, "STATUS_NOT_VERIFIED", "Booking status could not be verified.");
  const conversation = await getConversationRecord(actor, req.params.conversationId);
  if (conversation === false) return responseError(res, 403, "BRANCH_FORBIDDEN", "This conversation is outside your branch access.");
  if (!conversation) return responseError(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  const status = await pool.query<{
    id: string;
    status: Booking["status"]; stage: JobStage | null; expected_pickup: string | Date;
    service_id: string; branch_id: string; accepted_quote_id: string | null; accepted_quote_revision: number | null;
  }>(
    `SELECT b.id, b.status, j.stage, b.expected_pickup, b.service_id, b.branch_id, b.accepted_quote_id, b.accepted_quote_revision
     FROM bookings b LEFT JOIN jobs j ON j.booking_id = b.id
     WHERE b.id = $1 AND b.created_by IN ('whatsapp-simulation', 'development-seed')
       AND b.customer_id = $2 AND b.branch_id = $3`,
    [parsed.data.bookingId, conversation.customer_id, conversation.branch_id],
  );
  const booking = status.rows[0];
  if (!booking || booking.branch_id !== conversation.branch_id
    || conversation.related_booking_id !== booking.id
    || parsed.data.verificationCode !== conversation.verification_code) {
    return responseError(res, 403, "STATUS_NOT_VERIFIED", "Booking status could not be verified.");
  }
  const serviceRow = await pool.query("SELECT id, name_en, bay_type, bay_hours, price_label FROM services WHERE id = $1", [booking.service_id]);
  const eta = await withTransaction(async (client) => {
    const today = await client.query<{ today: string }>(
      "SELECT to_char((now() AT TIME ZONE 'Africa/Cairo')::date, 'YYYY-MM-DD') AS today",
    );
    return estimatePickup(
      client,
      booking.branch_id,
      today.rows[0].today,
      serviceFromRow(serviceRow.rows[0]),
      parsed.data.lang ?? "en",
      parsed.data.bookingId,
      booking.stage ?? "booked",
    );
  });
  const previousEstimate = dateValue(booking.expected_pickup);
  const expected = eta.expectedPickup > previousEstimate ? eta.expectedPickup : previousEstimate;
  const job = await pool.query<{ id: string }>("SELECT id FROM jobs WHERE booking_id = $1", [parsed.data.bookingId]);
  const milestones = job.rows[0]
    ? await pool.query<{ to_stage: JobStage; created_at: Date }>(
      `SELECT to_stage, created_at FROM job_events
       WHERE job_id = $1 AND to_stage IN ('received', 'in-service', 'qc', 'ready', 'delivered')
       ORDER BY created_at`,
      [job.rows[0].id],
    )
    : { rows: [] as { to_stage: JobStage; created_at: Date }[] };
  const workSummary=await pool.query<{en:string|null;ar:string|null}>(`SELECT string_agg(s.name_en, ', ' ORDER BY w.position) AS en,string_agg(s.name_ar, 'ØŒ ' ORDER BY w.position) AS ar FROM booking_work_components w JOIN services s ON s.id=w.service_id WHERE w.booking_id=$1`,[booking.id]);
  const milestoneLabels: Record<JobStage, { en: string; ar: string }> = {
    booked: { en: "Booked", ar: "ØªÙ… Ø§Ù„Ø­Ø¬Ø²" },
    received: { en: "Received", ar: "ØªÙ… Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù…" },
    "in-service": { en: "In service", ar: "Ù‚ÙŠØ¯ Ø§Ù„Ø®Ø¯Ù…Ø©" },
    qc: { en: "Quality check", ar: "ÙØ­Øµ Ø§Ù„Ø¬ÙˆØ¯Ø©" },
    ready: { en: "Ready", ar: "Ø¬Ø§Ù‡Ø²Ø© Ù„Ù„Ø§Ø³ØªÙ„Ø§Ù…" },
    delivered: { en: "Delivered", ar: "ØªÙ… Ø§Ù„ØªØ³Ù„ÙŠÙ…" },
    cancelled: { en: "Cancelled", ar: "Ù…Ù„ØºÙŠ" },
    "no-show": { en: "No-show", ar: "Ù„Ù… ÙŠØ­Ø¶Ø±" },
  };
  res.json({
    status: booking.status,
    stage: booking.stage,
    expectedPickup: expected,
    acceptedWorkSummary:workSummary.rows[0]?.en&&workSummary.rows[0]?.ar?{en:workSummary.rows[0].en,ar:workSummary.rows[0].ar}:undefined,
    acceptedQuoteRef:booking.accepted_quote_id&&booking.accepted_quote_revision?{quoteId:booking.accepted_quote_id,revision:booking.accepted_quote_revision}:undefined,
    etaReason: eta.reason,
    etaAt: eta.calculatedAt,
    changedFrom: expected > previousEstimate ? previousEstimate : undefined,
    milestones: milestones.rows.map((event) => ({
      stage: parsed.data.lang === "ar" ? milestoneLabels[event.to_stage].ar : milestoneLabels[event.to_stage].en,
      occurredAt: event.created_at,
    })),
    message: parsed.data.lang === "ar"
      ? "ØªÙ… Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ©. Ø§Ù„Ù…Ø¹Ø±ÙˆØ¶ Ù‡Ùˆ Ø­Ø§Ù„Ø© Ø§Ù„Ø­Ø¬Ø² ÙˆÙ…ÙˆØ¹Ø¯ Ø§Ø³ØªÙ„Ø§Ù… ØªÙ‚Ø¯ÙŠØ±ÙŠ ÙÙ‚Ø·."
      : "Fictional status verified. Only booking state and an estimated pickup date are shown.",
    simulation: true,
  });
});

export function createWhatsAppRouter() {
  return router;
}
