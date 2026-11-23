import { describe, expect, it } from "vitest";
import { generateDataset } from "./seed-generate";
import { buildSteps } from "./purge-plan";

const NOW = new Date("2026-11-21T10:00:00Z");
const { ds, world } = generateDataset({ now: NOW });
const rows = (table: Parameters<typeof ds.rows>[0]) => ds.rows(table);

describe("seeded sent-document history (migration 0040)", () => {
  const log = () => rows("document_delivery_log");
  it("adds a few dozen simulated sends across all three document kinds, never a live one", () => {
    expect(log().length).toBeGreaterThanOrEqual(15);
    expect(log().length).toBeLessThanOrEqual(40);
    expect(new Set(log().map((row) => row.document_kind))).toEqual(new Set(["invoice", "quote", "warranty-card"]));
    for (const row of log()) {
      expect(row.status).toBe("sent-simulated");
      expect(row.delivery_mode).toBe("simulated");
      expect(row.channel).toBe("whatsapp");
      expect(String(row.id)).toMatch(/^seed-ddl-/);
    }
  });
  it("only sends to customers with a granted service consent, to a masked number, in the customer's language", () => {
    const consented = new Set(rows("messaging_customer_consents").filter((row) => row.purpose === "service" && row.status === "granted").map((row) => row.customer_id));
    const customers = new Map(world.customers.map((customer) => [customer.id, customer]));
    for (const row of log()) {
      expect(consented.has(row.customer_id), String(row.id)).toBe(true);
      expect(String(row.recipient_masked)).toContain("•");
      expect(String(row.recipient_masked)).not.toBe(customers.get(String(row.customer_id))!.phone);
      expect(row.language).toBe(customers.get(String(row.customer_id))!.language === "ar" ? "ar" : "en");
    }
    expect(new Set(log().map((row) => row.language))).toEqual(new Set(["ar", "en"]));
  });
  it("points at real seeded documents, keeps idempotency keys unique and dates in the past", () => {
    const invoices = new Set(rows("invoices").map((row) => row.id));
    const quotes = new Set(rows("quote_heads").map((row) => row.id));
    const warranties = new Set(rows("warranties").map((row) => row.id));
    const customers = new Set(rows("customers").map((row) => row.id));
    const keys = new Set<string>();
    for (const row of log()) {
      const known = row.document_kind === "invoice" ? invoices : row.document_kind === "quote" ? quotes : warranties;
      expect(known.has(row.document_id), String(row.id)).toBe(true);
      expect(customers.has(row.customer_id)).toBe(true);
      expect(keys.has(String(row.idempotency_key))).toBe(false);
      keys.add(String(row.idempotency_key));
      expect((row.created_at as Date).getTime()).toBeLessThan(NOW.getTime());
    }
    // Only sendable invoices: never a draft, void or supplementary one.
    const byId = new Map(rows("invoices").map((row) => [row.id, row]));
    for (const row of log().filter((item) => item.document_kind === "invoice")) {
      const invoice = byId.get(row.document_id)!;
      expect(["issued", "partial", "paid"]).toContain(invoice.status);
      expect(invoice.kind).toBe("standard");
    }
  });
});

describe("seeded staff, customer and reminder-rule audit events (migration 0039)", () => {
  const audit = () => rows("staff_customer_audit_events");
  it("covers all three entity kinds with actions the owner log knows", () => {
    expect(audit().length).toBeGreaterThanOrEqual(20);
    expect(new Set(audit().map((row) => row.entity_kind))).toEqual(new Set(["staff", "customer", "reminder-rule"]));
    const actions = new Set(audit().map((row) => row.action));
    for (const action of ["invited", "claimed-invitation", "permissions-changed", "access-removed", "created", "edited", "vehicle-added", "rule-updated"]) expect(actions.has(action), action).toBe(true);
    for (const row of audit()) expect(String(row.id)).toMatch(/^seed-sca-/);
  });
  it("points at seeded customers, seeded staff and real reminder rule kinds", () => {
    const customers = new Set(rows("customers").map((row) => row.id));
    const staff = new Set(rows("staff_memberships").map((row) => row.clerk_user_id));
    const ruleKinds = new Set(["booking_day_before", "booking_morning_of", "ready_for_pickup", "warranty_expiry", "quote_followup", "post_service_checkin"]);
    for (const row of audit()) {
      if (row.entity_kind === "customer") expect(customers.has(row.entity_id), String(row.id)).toBe(true);
      if (row.entity_kind === "staff") expect(staff.has(row.entity_id), String(row.id)).toBe(true);
      if (row.entity_kind === "reminder-rule") expect(ruleKinds.has(String(row.entity_id))).toBe(true);
      expect(staff.has(row.actor_user_id), String(row.id)).toBe(true);
      expect((row.created_at as Date).getTime()).toBeLessThan(NOW.getTime());
    }
  });
  it("never records a phone number or an email address in a summary", () => {
    for (const row of audit()) {
      const summary = String(row.summary);
      expect(summary, String(row.id)).not.toMatch(/@/);
      expect(summary, String(row.id)).not.toMatch(/\d{7,}/);
    }
  });
});

describe("seeded pickup promise history", () => {
  const all = () => rows("pickup_commitments");
  it("has revised and cancelled promises that supersede an earlier revision of the same booking", () => {
    const byId = new Map(all().map((row) => [row.id, row]));
    const second = all().filter((row) => row.revision === 2);
    expect(second.some((row) => row.promised_at instanceof Date), "a revised promise").toBe(true);
    expect(second.some((row) => row.promised_at === null), "a cancelled promise").toBe(true);
    for (const row of second) {
      const parent = byId.get(row.supersedes_id)!;
      expect(parent, String(row.id)).toBeDefined();
      expect(parent.booking_id).toBe(row.booking_id);
      expect(parent.revision).toBe(1);
      // The table CHECK: a promise needs a time and evidence and no cancellation reason; a cancellation is the opposite.
      if (row.promised_at) { expect(row.customer_agreement_evidence_ref).toBeTruthy(); expect(row.cancellation_reason).toBeNull(); }
      else { expect(row.customer_agreement_evidence_ref).toBeNull(); expect(row.cancellation_reason).toBeTruthy(); }
    }
    expect(new Set(all().map((row) => `${row.booking_id}|${row.revision}`)).size).toBe(all().length);
  });
});

describe("seeded follow-up reminders (migration 0034)", () => {
  const reminders = () => rows("reminders");
  it("shows every state the Follow-ups screen filters on, with the table's own rules respected", () => {
    expect(reminders().length).toBeGreaterThanOrEqual(12);
    const states = new Set(reminders().map((row) => (row.snoozed_until ? "snoozed" : row.status)));
    for (const state of ["due", "snoozed", "sent-simulated", "skipped", "cancelled"]) expect(states.has(state), state).toBe(true);
    const keys = new Set<string>();
    for (const row of reminders()) {
      expect(String(row.id)).toMatch(/^seed-rem-/);
      expect((row.status === "sent-simulated") === (row.sent_at !== null)).toBe(true);
      if (row.status === "skipped" || row.status === "cancelled") expect(row.reason).toBeTruthy();
      expect(keys.has(String(row.dedupe_key))).toBe(false);
      keys.add(String(row.dedupe_key));
    }
  });
  it("only reminds customers with a granted service consent, about their own booking, and every event belongs to a reminder", () => {
    const consented = new Set(rows("messaging_customer_consents").filter((row) => row.purpose === "service" && row.status === "granted").map((row) => row.customer_id));
    const bookings = new Map(rows("bookings").map((row) => [row.id, row]));
    for (const row of reminders()) {
      expect(consented.has(row.customer_id), String(row.id)).toBe(true);
      expect(bookings.get(row.booking_id)!.customer_id).toBe(row.customer_id);
    }
    const ids = new Set(reminders().map((row) => row.id));
    for (const event of rows("reminder_events")) expect(ids.has(event.reminder_id)).toBe(true);
    expect(rows("reminder_events").length).toBeGreaterThan(reminders().length);
  });
});

describe("purge plan and determinism", () => {
  it("removes both new tables by their seeded ids", () => {
    const tables = new Set(buildSteps({ keepDemoAccounts: false }).map((step) => step.table));
    expect(tables.has("document_delivery_log")).toBe(true);
    expect(tables.has("staff_customer_audit_events")).toBe(true);
    expect(tables.has("reminders")).toBe(true);
    expect(tables.has("reminder_events")).toBe(true);
  });
  it("produces identical rows on a second run", () => {
    const again = generateDataset({ now: NOW }).ds;
    expect(JSON.stringify(again.rows("document_delivery_log"))).toBe(JSON.stringify(rows("document_delivery_log")));
    expect(JSON.stringify(again.rows("staff_customer_audit_events"))).toBe(JSON.stringify(rows("staff_customer_audit_events")));
  });
});
