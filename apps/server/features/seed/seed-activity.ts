import { createHash } from "node:crypto";
import { maskPhone } from "../document-delivery/document-message";
import { BRANCH_A, BRANCH_B, OWNER, receptionOf } from "./seed-people";
import type { Row } from "./seed-core";
import type { World } from "./seed-world";

/**
 * Sample activity for screens that would otherwise start empty (Phase 2): sent-document history for the Send to customer
 * "Last sent" line (migration 0040) and staff, customer and reminder-rule audit events for the owner activity log (0039).
 * Deterministic (everything derives from the seeded world, no randomness), idempotent (stable `seed-` ids) and purge-safe.
 * Messages are SIMULATED: every delivery row is `sent-simulated` in `simulated` mode, never a claim of a real send.
 * Summaries hold names and changed field NAMES only, never phone numbers, emails or message text.
 */
const DAY = 86_400_000;
const hash = (kind: string, id: string) => createHash("sha256").update(`${kind}|${id}|whatsapp`).digest("hex");

const MESSAGE = {
  invoice: { en: (ref: string) => `Your invoice ${ref} is ready. Thank you for choosing Go Stores.`, ar: (ref: string) => `فاتورتك ${ref} جاهزة. شكراً لاختيارك جو ستورز.` },
  quote: { en: (ref: string) => `Your quote ${ref} is ready for review.`, ar: (ref: string) => `عرض السعر ${ref} جاهز للمراجعة.` },
  "warranty-card": { en: (ref: string) => `Your warranty card ${ref} is attached.`, ar: (ref: string) => `كارت الضمان ${ref} مرفق.` },
} as const;

export function addSeedActivity(world: World) {
  addPickupHistory(world);
  addSeedReminders(world);
  const { ds, ctx } = world;
  const consented = new Set(
    ds.rows("messaging_customer_consents")
      .filter((row) => row.purpose === "service" && row.status === "granted" && row.expires_at === null)
      .map((row) => String(row.customer_id)),
  );
  const customers = new Map(world.customers.map((customer) => [customer.id, customer]));
  const sentAt = (index: number) => new Date(ctx.now.getTime() - (index * 2 + 1) * DAY - 3_600_000);

  // ---- sent-document history ------------------------------------------------------------------------------------------------
  type Doc = { kind: "invoice" | "quote" | "warranty-card"; id: string; ref: string; customerId: string; branchId: string };
  const docs: Doc[] = [];
  for (const invoice of ds.rows("invoices")) {
    if (invoice.kind === "adjustment" || !["issued", "partial", "paid"].includes(String(invoice.status))) continue;
    docs.push({ kind: "invoice", id: String(invoice.id), ref: String(invoice.number), customerId: String(invoice.customer_id), branchId: String(invoice.branch_id) });
  }
  for (const head of ds.rows("quote_heads")) {
    if (!head.customer_id || !head.branch_id) continue;
    docs.push({ kind: "quote", id: String(head.id), ref: String(head.id).slice(-8).toUpperCase(), customerId: String(head.customer_id), branchId: String(head.branch_id) });
  }
  for (const warranty of ds.rows("warranties")) {
    if (warranty.status !== "active") continue;
    docs.push({ kind: "warranty-card", id: String(warranty.id), ref: String(warranty.id).slice(-8).toUpperCase(), customerId: String(warranty.customer_id), branchId: String(warranty.branch_id) });
  }
  // Every 9th eligible document, at most 30 of them, alternating kinds so each shows up.
  const eligible = docs.filter((doc) => consented.has(doc.customerId) && customers.has(doc.customerId));
  const byKind = (kind: Doc["kind"]) => eligible.filter((doc) => doc.kind === kind).filter((_, index) => index % 9 === 0).slice(0, 10);
  const chosen = [...byKind("invoice"), ...byKind("quote"), ...byKind("warranty-card")];
  chosen.forEach((doc, index) => {
    const customer = customers.get(doc.customerId)!;
    const language = customer.language === "ar" ? "ar" : "en";
    const body = MESSAGE[doc.kind][language](doc.ref);
    const auto = index % 4 === 0;
    ds.add("document_delivery_log", {
      id: `seed-ddl-${String(index + 1).padStart(3, "0")}`, environment_id: ctx.environmentId, document_kind: doc.kind, document_id: doc.id,
      customer_id: doc.customerId, branch_id: doc.branchId, channel: "whatsapp", language, recipient_masked: maskPhone(customer.phone),
      status: "sent-simulated", delivery_mode: "simulated", trigger: auto ? "auto" : "manual", link_included: false, body,
      provider_message_id: null, outbox_id: null, failure_code: null, idempotency_key: auto ? `auto:${doc.kind}:${doc.id}:seed` : `seed-ddl-key-${index + 1}`,
      request_hash: hash(doc.kind, doc.id), sent_by: auto ? "system" : receptionOf(doc.branchId), created_at: sentAt(index),
    });
  });

  // ---- staff, customer and reminder-rule audit events ------------------------------------------------------------------------
  let seq = 0;
  const audit = (entityKind: "staff" | "customer" | "reminder-rule", entityId: string, action: string, branchId: string | null, summary: string, actor: string, daysAgo: number) => {
    seq += 1;
    const row: Row = {
      id: `seed-sca-${String(seq).padStart(3, "0")}`, entity_kind: entityKind, entity_id: entityId, action, branch_id: branchId, summary, actor_user_id: actor,
      created_at: new Date(ctx.now.getTime() - daysAgo * DAY - (seq % 7) * 600_000),
    };
    ds.add("staff_customer_audit_events", row);
  };
  const staffEvents: Array<[string, string, string | null, string, string, number]> = [
    ["seed-reception-b", "invited", BRANCH_B, "Invited as receptionist", OWNER, 88],
    ["seed-reception-b", "claimed-invitation", BRANCH_B, "Invitation claimed (role: receptionist)", "seed-reception-b", 87],
    ["seed-tech-a3", "invited", BRANCH_A, "Invited as technician", OWNER, 70],
    ["seed-tech-a3", "claimed-invitation", BRANCH_A, "Invitation claimed (role: technician)", "seed-tech-a3", 69],
    ["demo-reception", "permissions-changed", BRANCH_A, "Capabilities changed: invoices.view, invoices.manage", OWNER, 41],
    ["seed-reception-b", "permissions-changed", BRANCH_B, "Capabilities changed: quotes.manage", OWNER, 35],
    ["seed-tech-b2", "invitation-cancelled", BRANCH_B, "Invitation cancelled before it was claimed", OWNER, 29],
    ["seed-tech-b2", "invited", BRANCH_B, "Invited as technician", OWNER, 28],
    ["seed-tech-b2", "claimed-invitation", BRANCH_B, "Invitation claimed (role: technician)", "seed-tech-b2", 27],
    ["seed-manager-b", "permissions-changed", BRANCH_B, "Capabilities changed: finance.view", OWNER, 12],
    ["seed-tech-a2", "access-removed", BRANCH_A, "Access removed by the owner", OWNER, 6],
    ["seed-tech-a2", "invited", BRANCH_A, "Invited again as technician", OWNER, 4],
  ];
  for (const [id, action, branch, summary, actor, daysAgo] of staffEvents) audit("staff", id, action, branch, summary, actor, daysAgo);

  const fields = [["name"], ["phone"], ["language"], ["name", "language"], ["notes"]] as const;
  world.customers.slice(0, 18).forEach((customer, index) => {
    const branch = customer.homeBranch === BRANCH_B ? BRANCH_B : BRANCH_A;
    const actor = receptionOf(branch);
    const created = 120 - index * 5;
    audit("customer", customer.id, "created", branch, `Customer created: ${customer.nameEn}`, actor, created);
    if (index % 2 === 0) audit("customer", customer.id, "edited", branch, `Changed fields: ${fields[index % fields.length].join(", ")}`, actor, Math.max(1, created - 20));
    if (index % 3 === 0) audit("customer", customer.id, "vehicle-added", branch, `Vehicle added: ${customer.vehicles[0] ? `${customer.vehicles[0].make} ${customer.vehicles[0].model}` : "vehicle"}`, actor, Math.max(1, created - 8));
  });

  const rules: Array<[string, string, string, number]> = [
    ["booking_day_before", "Changed fields: leadDays; revision 2", OWNER, 52],
    ["ready_for_pickup", "Changed fields: templateEn, templateAr; revision 2", OWNER, 33],
    ["quote_followup", "Changed fields: autoSend; revision 2", OWNER, 18],
    ["warranty_expiry", "Changed fields: enabled; revision 3", OWNER, 7],
  ];
  for (const [kind, summary, actor, daysAgo] of rules) audit("reminder-rule", kind, "rule-updated", null, summary, actor, daysAgo);
}

/**
 * Pickup promises are immutable (trigger), so a revision or a cancellation is a NEW row that supersedes the earlier one.
 * The base seed has only first revisions; derive a few revised and cancelled ones from them so the promise screens show history.
 */
function addPickupHistory(world: World) {
  const { ds, ctx } = world;
  const firsts = ds.rows("pickup_commitments").filter((row) => row.revision === 1 && row.promised_at instanceof Date);
  const mine = (row: Row) => String(row.id);
  // Revised: promise moved one day later (revision 2 supersedes revision 1).
  firsts.filter((_, index) => index % 4 === 1).slice(0, 3).forEach((row, index) => {
    const at = new Date((row.promised_at as Date).getTime() + DAY);
    ds.add("pickup_commitments", {
      id: `${mine(row)}-r2`, booking_id: row.booking_id, job_id: row.job_id, revision: 2, supersedes_id: row.id, promised_at: at, branch_timezone: row.branch_timezone,
      recorded_by: row.recorded_by, recorded_at: new Date(Math.min((row.recorded_at as Date).getTime() + DAY, ctx.now.getTime() - 60_000)),
      customer_agreement_evidence_ref: `private:seed/pickup-agreement-r2-${index + 1}`, reason: "Customer agreed to a later pickup window", cancellation_reason: null,
    });
  });
  // Cancelled: the promise was withdrawn (revision 2 with no promised time).
  firsts.filter((_, index) => index % 4 === 3).slice(0, 2).forEach((row) => {
    ds.add("pickup_commitments", {
      id: `${mine(row)}-r2`, booking_id: row.booking_id, job_id: row.job_id, revision: 2, supersedes_id: row.id, promised_at: null, branch_timezone: row.branch_timezone,
      recorded_by: row.recorded_by, recorded_at: new Date(Math.min((row.recorded_at as Date).getTime() + DAY, ctx.now.getTime() - 60_000)),
      customer_agreement_evidence_ref: null, reason: "Promise withdrawn", cancellation_reason: "Customer asked to collect the vehicle another day",
    });
  });
}

/**
 * Follow-up reminders (migration 0034) in every state the Follow-ups screen shows. Reminders are simulated messages: nothing here is
 * sent anywhere. The base seed has none, so the screen would otherwise be empty.
 */
function addSeedReminders(world: World) {
  const { ds, ctx } = world;
  const consented = new Set(ds.rows("messaging_customer_consents").filter((row) => row.purpose === "service" && row.status === "granted").map((row) => String(row.customer_id)));
  const customers = new Map(world.customers.map((customer) => [customer.id, customer]));
  const bookings = ds.rows("bookings").filter((row) => customers.has(String(row.customer_id)) && ["confirmed", "pending"].includes(String(row.status)));
  const states = ["due", "due", "due", "snoozed", "sent-simulated", "sent-simulated", "skipped", "cancelled"] as const;
  const picks = bookings.filter((row) => consented.has(String(row.customer_id))).filter((_, index) => index % 7 === 0).slice(0, 24);
  picks.forEach((booking, index) => {
    const customer = customers.get(String(booking.customer_id))!;
    const language = customer.language === "ar" ? "ar" : "en";
    const state = states[index % states.length];
    const id = `seed-rem-${String(index + 1).padStart(3, "0")}`;
    const dueAt = new Date(ctx.now.getTime() + ((index % 5) - 2) * DAY);
    const body = language === "ar" ? `تذكير: موعدك في ${String(booking.dropoff_date)}. نراك قريباً.` : `Reminder: your appointment is on ${String(booking.dropoff_date)}. See you soon.`;
    const sent = state === "sent-simulated";
    ds.add("reminders", {
      id, environment_id: ctx.environmentId, rule_kind: "booking_day_before", dedupe_key: `seed:booking_day_before:${String(booking.id)}`, branch_id: booking.branch_id,
      customer_id: booking.customer_id, vehicle_id: booking.vehicle_id, booking_id: booking.id, job_id: null, warranty_id: null, quote_id: null,
      source_date: booking.dropoff_date, source_revision: null, language, body, due_at: sent ? new Date(ctx.now.getTime() - DAY) : dueAt, status: state === "snoozed" ? "due" : state,
      reason: state === "skipped" ? "staff-skipped" : state === "cancelled" ? "source-changed" : null,
      snoozed_until: state === "snoozed" ? new Date(ctx.now.getTime() + DAY) : null, sent_at: sent ? new Date(ctx.now.getTime() - DAY + 3_600_000) : null,
      handled_by: sent || state === "skipped" || state === "cancelled" ? receptionOf(String(booking.branch_id) === BRANCH_B ? BRANCH_B : BRANCH_A) : null,
      created_at: new Date(ctx.now.getTime() - 3 * DAY), updated_at: new Date(ctx.now.getTime() - DAY),
    });
    ds.add("reminder_events", { reminder_id: id, action: "generated", actor_id: "system", details: "", occurred_at: new Date(ctx.now.getTime() - 3 * DAY) });
    if (sent) ds.add("reminder_events", { reminder_id: id, action: "sent-simulated", actor_id: "system", details: "auto", occurred_at: new Date(ctx.now.getTime() - DAY + 3_600_000) });
    if (state === "skipped") ds.add("reminder_events", { reminder_id: id, action: "skipped", actor_id: receptionOf(BRANCH_A), details: "staff-skipped", occurred_at: new Date(ctx.now.getTime() - DAY) });
    if (state === "cancelled") ds.add("reminder_events", { reminder_id: id, action: "cancelled", actor_id: "system", details: "source-changed", occurred_at: new Date(ctx.now.getTime() - DAY) });
    if (state === "snoozed") ds.add("reminder_events", { reminder_id: id, action: "snoozed", actor_id: receptionOf(BRANCH_A), details: "1 day", occurred_at: new Date(ctx.now.getTime() - 3_600_000) });
  });
}
