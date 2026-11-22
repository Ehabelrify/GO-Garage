import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { formatPlateDisplay, type PackageVersion, type VehicleSelection } from "@garage/domain";
import { withTransaction } from "../../infrastructure/database/db";
import { canAccessBranch, canManageBookings, canManageQuotes, hasCapability, type GarageActor } from "../auth/authz";
import { intakeEligible, loadIntakePackages } from "../commercial/catalogue-service";
import { commercialContext } from "../commercial/policy-service";
import { loadAcceptanceTerms } from "../commercial/quote-generation";
import { createQuoteRevisionInTransaction } from "../commercial/quote-service";
import { createBookingInTransaction } from "../operations/booking-create";
import { customerVehicleSchema, findDuplicatePlate, normalizePhone, plateField, splitMakeModel } from "../operations/customer-edit";
import { canAccessInbox, loadInboxMembership } from "../whatsapp/inbox-access";
import { linkConversationToCustomer } from "../whatsapp/unlinked-contact";
import { conversationMode } from "../whatsapp/whatsapp-policy";
import { IntakeError } from "./intake-errors";
import { assembleIntakeQuote, type IntakeWarning } from "./intake-quote";

const id = z.string().trim().min(1).max(120);
const itemSchema = z.object({
  id: z.object({ packageId: id, version: z.number().int().positive() }).strict(),
  quantity: z.number().int().min(1).max(99),
  note: z.string().trim().max(200).optional(),
}).strict();
const customerNew = z.object({
  name: z.string().trim().min(1).max(120), phone: z.string().trim().min(8).max(32), language: z.enum(["ar", "en"]).default("ar"),
}).strict();
const vehicleNew = customerVehicleSchema;

export const intakeSchema = z.object({
  customer: z.union([z.object({ id }).strict(), customerNew]),
  vehicle: z.union([z.object({ id }).strict(), vehicleNew]).optional(),
  branchId: id,
  items: z.array(itemSchema).max(30).default([]),
  notes: z.string().trim().max(2000).optional(),
  outcome: z.enum(["quote", "booking", "customer-only"]),
  booking: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    serviceId: id,
  }).strict().optional(),
  whatsappConversationId: id.optional(),
  idempotencyKey: z.string().trim().min(1).max(120),
}).strict().superRefine((value, context) => {
  const problem = (path: string, message: string) => context.addIssue({ code: "custom", path: [path], message });
  const keys = value.items.map((item) => `${item.id.packageId}@${item.id.version}`);
  if (new Set(keys).size !== keys.length) problem("items", "Each item can appear once; change its quantity instead.");
  if (value.outcome === "quote") { if (!value.items.length) problem("items", "Choose at least one item."); if (!value.vehicle) problem("vehicle", "A quote needs a vehicle."); }
  if (value.outcome === "booking") { if (!value.booking) problem("booking", "Choose a date, time and service."); if (!value.vehicle) problem("vehicle", "A booking needs a vehicle."); }
});
export type IntakeRequest = z.infer<typeof intakeSchema>;

export interface IntakeResponse {
  customerId: string; vehicleId: string | null; quoteId?: string; quoteRevision?: number; bookingId?: string; conversationId?: string; warnings: IntakeWarning[];
}

const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export const intakeRequestHash = (request: IntakeRequest) => createHash("sha256").update(canonical(request)).digest("hex");
export const intakeQuoteId = (actorId: string, key: string) => `qi-${createHash("sha256").update(`${actorId}:${key}`).digest("hex").slice(0, 32)}`;
const makeId = (prefix: string) => `${prefix}-${randomUUID()}`;

function assertMayRun(actor: GarageActor, request: IntakeRequest) {
  if (actor.isDemo) throw new IntakeError(403, "DEMO_ACTION_DISABLED", "Quick intake is unavailable in a temporary demo session.");
  if (!canManageBookings(actor)) throw new IntakeError(403, "ROLE_FORBIDDEN", "Customer and booking permission is required.");
  if (request.outcome === "quote" && !canManageQuotes(actor)) throw new IntakeError(403, "ROLE_FORBIDDEN", "Quote authority is required to create a quote.");
  if (!canAccessBranch(actor, request.branchId)) throw new IntakeError(403, "BRANCH_FORBIDDEN", "Choose a branch you can access.");
}

async function resolveCustomer(client: PoolClient, actor: GarageActor, request: IntakeRequest): Promise<{ id: string; created: boolean; branchIds: string[] }> {
  if ("id" in request.customer) {
    const found = await client.query<{ id: string }>(
      `SELECT c.id FROM customers c WHERE c.id=$1
         AND ($2 OR EXISTS (SELECT 1 FROM customer_branches cb WHERE cb.customer_id=c.id AND cb.branch_id=ANY($3::text[])))
         AND NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind='customer' AND ra.entity_id=c.id)`,
      [request.customer.id, actor.role === "owner", actor.branchIds]);
    if (!found.rows[0]) throw new IntakeError(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
    await client.query("INSERT INTO customer_branches(customer_id,branch_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [found.rows[0].id, request.branchId]);
    const branches = await client.query<{ branch_id: string }>("SELECT branch_id FROM customer_branches WHERE customer_id=$1", [found.rows[0].id]);
    return { id: found.rows[0].id, created: false, branchIds: branches.rows.map((row) => row.branch_id) };
  }
  const phone = normalizePhone(request.customer.phone);
  if (!phone) throw new IntakeError(400, "INVALID_PHONE", "Enter a valid phone number.");
  const taken = await client.query<{ id: string }>("SELECT id FROM customers WHERE phone_normalized=$1", [phone]);
  if (taken.rows[0]) throw new IntakeError(409, "DUPLICATE_PHONE", "A customer with this phone number already exists.");
  const customerId = makeId("customer");
  await client.query("INSERT INTO customers(id,name,phone,phone_normalized,preferred_language) VALUES($1,$2,$3,$4,$5)", [customerId, request.customer.name, request.customer.phone, phone, request.customer.language]);
  await client.query("INSERT INTO customer_branches(customer_id,branch_id) VALUES($1,$2)", [customerId, request.branchId]);
  return { id: customerId, created: true, branchIds: [request.branchId] };
}

async function resolveVehicle(client: PoolClient, request: IntakeRequest, customer: { id: string; created: boolean; branchIds: string[] }): Promise<(VehicleSelection & { plate: string }) | null> {
  if (!request.vehicle) return null;
  if ("id" in request.vehicle) {
    const found = await client.query<{ id: string; model: string; category_id: string | null; plate: string }>(
      "SELECT v.id,v.model,v.category_id,v.plate FROM vehicles v WHERE v.id=$1 AND v.customer_id=$2 AND NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind='vehicle' AND ra.entity_id=v.id)",
      [request.vehicle.id, customer.id]);
    if (!found.rows[0]) throw new IntakeError(404, "VEHICLE_NOT_FOUND", "Vehicle not found for this customer.");
    return { vehicleId: found.rows[0].id, model: found.rows[0].model, categoryId: found.rows[0].category_id, plate: found.rows[0].plate };
  }
  const plate = plateField.parse(request.vehicle.plate);
  const duplicate = await findDuplicatePlate(client, plate, { customerId: customer.created ? undefined : customer.id, branchIds: [...new Set([request.branchId, ...customer.branchIds])] });
  if (duplicate) throw new IntakeError(409, "DUPLICATE_PLATE", "A vehicle with this plate already exists.", { existingVehicle: { id: duplicate.vehicleId, customerId: duplicate.customerId, plate: duplicate.plate } });
  const { make, model, year } = splitMakeModel(request.vehicle.makeModel);
  const vehicleId = makeId("vehicle");
  await client.query("INSERT INTO vehicles(id,customer_id,make,model,year,plate) VALUES($1,$2,$3,$4,$5,$6)", [vehicleId, customer.id, make, model, year, formatPlateDisplay(plate)]);
  return { vehicleId, model, categoryId: null, plate };
}

async function chosenPackages(client: PoolClient, actor: GarageActor, request: IntakeRequest, vehicle: VehicleSelection | null): Promise<Array<{ pkg: PackageVersion; quantity: number; note?: string }>> {
  if (!request.items.length) return [];
  const found = await loadIntakePackages(client, request.items.map((item) => ({ packageId: item.id.packageId, version: item.id.version })));
  const byKey = new Map(found.map((pkg) => [`${pkg.ref.id}@${pkg.ref.version}`, pkg]));
  return request.items.map((item) => {
    const pkg = byKey.get(`${item.id.packageId}@${item.id.version}`);
    if (!pkg) throw new IntakeError(409, "ITEM_UNAVAILABLE", "An item is no longer available in the catalogue. Refresh the list.", { item: item.id });
    if (!intakeEligible(pkg, { actor, branchId: request.branchId, vehicle })) throw new IntakeError(409, "ITEM_NOT_ELIGIBLE", "An item does not apply to this vehicle or branch.", { item: item.id });
    return { pkg, quantity: item.quantity, note: item.note };
  });
}

const bookingFailure = (result: Awaited<ReturnType<typeof createBookingInTransaction>>): never => {
  if ("error" in result) {
    const code = result.error;
    if (code === "closed") throw new IntakeError(409, "BRANCH_CLOSED", "The branch is closed on the selected weekday.");
    if (code === "daily-cap") throw new IntakeError(409, "DAILY_CAP_REACHED", "The branch has reached its daily drop-off limit.");
    if (code === "bay-capacity") throw new IntakeError(409, "BAY_CAPACITY_REACHED", "Bay-hour capacity is full for this date and service.");
    if (code === "STALE_SLOT" || code === "ACCEPTED_QUOTE_MISMATCH") throw new IntakeError(409, code, "This availability changed. Refresh slots before saving.");
    throw new IntakeError(400, "INVALID_BOOKING", "The selected booking records are not available.");
  }
  if ("status" in result) {
    if (result.status === "capacity-conflict") return bookingFailure({ error: result.reason });
    if (result.status === "requires-human") throw new IntakeError(409, "AVAILABILITY_UNCONFIGURED", result.reasons.join(" "));
    if (result.status === "forbidden") throw new IntakeError(403, "ROLE_FORBIDDEN", "This action is not available to your role.");
    if (result.status === "invalid") throw new IntakeError(result.code === "STALE_SLOT" ? 409 : 400, result.code, "The booking could not be confirmed.");
  }
  throw new IntakeError(400, "INVALID_BOOKING", "The booking could not be created.");
};

async function linkChat(client: PoolClient, actor: GarageActor, request: IntakeRequest, customerId: string, vehicleId: string | null): Promise<string> {
  if (!hasCapability(actor, "whatsapp.use")) throw new IntakeError(403, "ROLE_FORBIDDEN", "WhatsApp access is required to link a conversation.");
  const row = (await client.query<{ id: string; branch_id: string }>("SELECT id,branch_id FROM whatsapp_conversations WHERE id=$1 AND mode=$2", [request.whatsappConversationId, conversationMode()])).rows[0];
  if (!row) throw new IntakeError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  if (!canAccessInbox(actor, await loadInboxMembership(actor.userId, client), { branchId: row.branch_id })) throw new IntakeError(403, "BRANCH_FORBIDDEN", "This conversation is outside your branch access.");
  await linkConversationToCustomer(client, actor, { conversationId: row.id, customerId, vehicleId: vehicleId ?? undefined });
  return row.id;
}

/**
 * Quick intake in ONE transaction: customer (existing or new), vehicle, optional WhatsApp link, then the outcome
 * (draft quote, booking through the capacity-checked booking service, or customer only). Safe to repeat with the same key.
 */
export async function runIntake(actor: GarageActor, raw: unknown): Promise<{ status: 200 | 201; body: IntakeResponse }> {
  const request = intakeSchema.parse(raw);
  assertMayRun(actor, request);
  const hash = intakeRequestHash(request);
  return withTransaction(async (client) => {
    const branch = await client.query("SELECT 1 FROM branches WHERE id=$1", [request.branchId]);
    if (!branch.rowCount) throw new IntakeError(404, "BRANCH_NOT_FOUND", "Branch not found.");
    const claimed = await client.query("INSERT INTO intake_requests(actor_id,idempotency_key,request_hash,outcome,branch_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [actor.userId, request.idempotencyKey, hash, request.outcome, request.branchId]);
    if (!claimed.rowCount) {
      const prior = (await client.query<{ request_hash: string; response: IntakeResponse | null }>("SELECT request_hash,response FROM intake_requests WHERE actor_id=$1 AND idempotency_key=$2 FOR UPDATE", [actor.userId, request.idempotencyKey])).rows[0];
      if (!prior || prior.request_hash !== hash) throw new IntakeError(409, "IDEMPOTENCY_KEY_REUSED", "This key was used for a different request.");
      if (!prior.response) throw new IntakeError(409, "INTAKE_IN_PROGRESS", "This request is still being processed.");
      return { status: 200 as const, body: prior.response };
    }

    const customer = await resolveCustomer(client, actor, request);
    const vehicle = await resolveVehicle(client, request, customer);
    const warnings: IntakeWarning[] = [];
    const response: IntakeResponse = { customerId: customer.id, vehicleId: vehicle?.vehicleId ?? null, warnings };
    const items = await chosenPackages(client, actor, request, vehicle);

    if (request.outcome === "quote") {
      const terms = await loadAcceptanceTerms(actor);
      const assembled = assembleIntakeQuote({
        today: new Date().toISOString().slice(0, 10), actorId: actor.userId, branchId: request.branchId, customerId: customer.id, vehicle: vehicle!,
        items, notes: request.notes ?? null, conversationId: request.whatsappConversationId ?? null, quoteId: intakeQuoteId(actor.userId, request.idempotencyKey), terms,
      });
      const ref = await createQuoteRevisionInTransaction(client, commercialContext, actor, assembled.input);
      response.quoteId = ref.quoteId; response.quoteRevision = ref.revision;
      warnings.push(...assembled.warnings);
    } else if (request.outcome === "booking") {
      const slot = request.booking!;
      const bookingId = makeId("booking");
      const result = await createBookingInTransaction(client, actor, { customerId: customer.id, vehicleId: vehicle!.vehicleId, serviceId: slot.serviceId, branchId: request.branchId, dropoffDate: slot.date, dropoffTime: slot.time }, bookingId, `intake:${actor.userId}:${request.idempotencyKey}`);
      if (!("bookingId" in result)) bookingFailure(result);
      response.bookingId = (result as { bookingId: string }).bookingId;
      if ((result as { status: string }).status === "pending") warnings.push("booking-pending");
      if (items.length) warnings.push("items-saved-with-request");
    } else if (items.length) warnings.push("items-saved-with-request");

    if (request.whatsappConversationId) response.conversationId = await linkChat(client, actor, request, customer.id, vehicle?.vehicleId ?? null);
    response.warnings = [...new Set(warnings)];
    await client.query(
      "UPDATE intake_requests SET customer_id=$3,vehicle_id=$4,quote_id=$5,booking_id=$6,conversation_id=$7,notes=$8,items=$9,response=$10 WHERE actor_id=$1 AND idempotency_key=$2",
      [actor.userId, request.idempotencyKey, response.customerId, response.vehicleId, response.quoteId ?? null, response.bookingId ?? null, response.conversationId ?? null, request.notes ?? null,
        JSON.stringify(request.items), JSON.stringify(response)]);
    return { status: 201 as const, body: response };
  });
}
