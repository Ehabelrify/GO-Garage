import { describe, expect, it } from "vitest";
import { generateDataset } from "./seed-generate";
import { Dataset, Json, TABLE_ORDER, qrToken, qrTokenHash, type Row } from "./seed-core";
import { buildSteps, parseArgs, purgeGate } from "./purge-plan";

const NOW = new Date("2026-11-21T10:00:00.000Z");
const build = () => generateDataset({ now: NOW, environmentId: "test-env" });
const plain = (ds: Dataset) => JSON.stringify([...ds.tables.entries()].map(([table, rows]) => [table, rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Json ? value.value : value])))]));

const { ds, world } = build();
const rows = (table: Parameters<Dataset["rows"]>[0]) => ds.rows(table);
const ids = (table: Parameters<Dataset["rows"]>[0], key = "id") => new Set(rows(table).map((row) => String(row[key])));
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));

describe("seed generator", () => {
  it("is deterministic for the same clock and seed", () => {
    expect(plain(build().ds)).toBe(plain(ds));
  });

  it("differs when the seed differs", () => {
    expect(plain(generateDataset({ now: NOW, seed: 7 }).ds)).not.toBe(plain(ds));
  });

  it("covers every module with non-empty rows", () => {
    const required = [
      "branches", "staff_memberships", "customers", "vehicles", "bookings", "jobs", "job_events", "branch_availability_versions", "catalogue_package_versions",
      "commercial_policy_versions", "quote_versions", "promotion_reservations", "benefit_entitlements", "benefit_redemptions", "transport_requests", "warranty_policies",
      "warranties", "warranty_claims", "warranty_invoice_drafts", "warranty_verification_tokens", "operational_money_events", "whatsapp_conversations", "whatsapp_messages",
      "messaging_outbox", "messaging_customer_consents",
    ].filter((table) => table !== "branches");
    for (const table of required) expect(rows(table as never).length, table).toBeGreaterThan(0);
  });

  it("uses only seed-prefixed ids for purge-safe text keys", () => {
    for (const table of ["customers", "vehicles", "bookings", "jobs", "warranties", "quote_heads", "whatsapp_conversations", "transport_requests"] as const) {
      for (const row of rows(table)) expect(String(row.id), table).toMatch(/^seed-/);
    }
  });

  it("links vehicles to their customer and bookings/jobs to a consistent customer and branch", () => {
    const customers = ids("customers");
    const vehicleOwner = new Map(rows("vehicles").map((row) => [String(row.id), String(row.customer_id)]));
    for (const row of rows("vehicles")) expect(customers.has(String(row.customer_id))).toBe(true);
    const bookingById = new Map(rows("bookings").map((row) => [String(row.id), row]));
    for (const booking of bookingById.values()) expect(vehicleOwner.get(String(booking.vehicle_id))).toBe(booking.customer_id);
    for (const job of rows("jobs")) expect(bookingById.get(String(job.booking_id))?.branch_id).toBe(job.branch_id);
    const customerBranches = new Set(rows("customer_branches").map((row) => `${row.customer_id}|${row.branch_id}`));
    for (const booking of bookingById.values()) expect(customerBranches.has(`${booking.customer_id}|${booking.branch_id}`)).toBe(true);
  });

  it("includes every booking status and job stage, ending with bookings in the past, today and the future", () => {
    expect(new Set(rows("bookings").map((row) => row.status))).toEqual(new Set(["pending", "confirmed", "cancelled", "no-show"]));
    const stages = new Set(rows("jobs").map((row) => row.stage));
    for (const stage of ["booked", "received", "in-service", "qc", "ready", "delivered", "cancelled", "no-show"]) expect(stages.has(stage), stage).toBe(true);
    const dates = rows("bookings").map((row) => String(row.dropoff_date));
    expect(dates.some((date) => date < "2026-11-21")).toBe(true);
    expect(dates.some((date) => date === "2026-11-21")).toBe(true);
    expect(dates.some((date) => date > "2026-11-21")).toBe(true);
    expect(dates.sort()[0] <= "2025-12-10").toBe(true);
  });

  it("assigns technicians to started jobs and keeps them in the job's branch", () => {
    const staff = new Map(rows("staff_memberships").map((row) => [String(row.clerk_user_id), row]));
    const started = rows("jobs").filter((job) => ["received", "in-service", "qc", "ready", "delivered"].includes(String(job.stage)));
    expect(started.length).toBeGreaterThan(0);
    for (const job of started) {
      const tech = staff.get(String(job.assigned_user_id));
      expect(tech?.role).toBe("technician");
      expect((tech?.branch_ids as string[]).includes(String(job.branch_id))).toBe(true);
    }
  });

  it("never dates an event after the generation clock", () => {
    const limit = NOW.getTime() + 60_000;
    for (const [table, column] of [["job_events", "created_at"], ["warranties", "issued_at"], ["warranty_claims", "created_at"], ["operational_money_events", "effective_at"], ["whatsapp_messages", "created_at"], ["quote_acceptance_events", "occurred_at"]] as const) {
      for (const row of rows(table)) expect(new Date(iso(row[column])).getTime(), `${table}.${column}`).toBeLessThanOrEqual(limit);
    }
  });

  it("walks job events through ordered stages", () => {
    const order = ["booked", "received", "in-service", "qc", "ready", "delivered"];
    const byJob = new Map<string, Row[]>();
    for (const event of rows("job_events")) byJob.set(String(event.job_id), [...(byJob.get(String(event.job_id)) ?? []), event]);
    for (const [jobId, events] of byJob) {
      const sorted = [...events].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      sorted.forEach((event, index) => {
        if (index === 0) expect(event.from_stage, jobId).toBeNull();
        else expect(event.from_stage, jobId).toBe(sorted[index - 1].to_stage);
        if (order.includes(String(event.to_stage)) && index > 0 && order.includes(String(event.from_stage))) expect(order.indexOf(String(event.to_stage))).toBe(order.indexOf(String(event.from_stage)) + 1);
      });
      const last = sorted[sorted.length - 1];
      expect(rows("jobs").find((job) => job.id === jobId)?.stage).toBe(last.to_stage);
    }
  });

  it("links warranties to delivered jobs and the same customer/vehicle/branch, with fixed and lifetime coverage", () => {
    const jobs = new Map(rows("jobs").map((row) => [String(row.id), row]));
    const bookings = new Map(rows("bookings").map((row) => [String(row.id), row]));
    const policies = new Set(rows("warranty_policies").map((row) => `${row.policy_id}|${row.version}`));
    expect(rows("warranties").length).toBeGreaterThan(40);
    for (const warranty of rows("warranties")) {
      const job = jobs.get(String(warranty.job_id))!;
      expect(job.stage).toBe("delivered");
      const booking = bookings.get(String(job.booking_id))!;
      expect(booking.customer_id).toBe(warranty.customer_id);
      expect(booking.vehicle_id).toBe(warranty.vehicle_id);
      expect(booking.branch_id).toBe(warranty.branch_id);
      expect(policies.has(`${warranty.policy_id}|${warranty.policy_version}`)).toBe(true);
      if (warranty.coverage_kind === "fixed") expect(String(warranty.expires_on) >= String(warranty.start_date)).toBe(true);
      else { expect(warranty.expires_on).toBeNull(); expect(warranty.lifetime_definition).not.toBeNull(); }
    }
    const kinds = new Set(rows("warranties").map((row) => row.coverage_kind));
    expect(kinds).toEqual(new Set(["fixed", "lifetime"]));
    expect(new Set(rows("warranties").map((row) => row.status))).toEqual(new Set(["active", "void"]));
    const seen = new Set<string>();
    for (const warranty of rows("warranties")) {
      const key = `${warranty.job_id}|${warranty.component_id ?? ""}|${warranty.policy_id}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("gives each warranty exactly one invoice draft and covers claim states with evidence metadata", () => {
    const warranties = ids("warranties");
    const invoiceByWarranty = new Map<string, number>();
    for (const invoice of rows("warranty_invoice_drafts")) {
      invoiceByWarranty.set(String(invoice.warranty_id), (invoiceByWarranty.get(String(invoice.warranty_id)) ?? 0) + 1);
      expect(Number(invoice.paid_amount)).toBeGreaterThanOrEqual(0);
      expect((invoice.payment_recorded_at === null) === (invoice.payment_recorded_by === null)).toBe(true);
    }
    for (const id of warranties) expect(invoiceByWarranty.get(id), id).toBe(1);
    const claimStates = new Set(rows("warranty_claims").map((row) => row.status));
    expect(claimStates.size).toBeGreaterThanOrEqual(4);
    for (const claim of rows("warranty_claims")) {
      expect(warranties.has(String(claim.warranty_id))).toBe(true);
      if (["approved", "denied", "closed"].includes(String(claim.status))) { expect(claim.resolution).toBeTruthy(); expect(claim.reviewed_by).toBeTruthy(); expect(claim.reviewed_at).toBeTruthy(); }
    }
    expect(rows("warranty_claim_attachments").length).toBeGreaterThan(0);
  });

  it("produces QR tokens that resolve by hash, with at most one active token per warranty", () => {
    const active = new Map<string, Row>();
    for (const token of rows("warranty_verification_tokens")) {
      expect(String(token.token_hash)).toMatch(/^[0-9a-f]{64}$/);
      if (token.revoked_at === null) { expect(active.has(String(token.warranty_id))).toBe(false); active.set(String(token.warranty_id), token); }
    }
    expect(active.size).toBeGreaterThan(10);
    for (const [warrantyId, token] of active) expect(token.token_hash).toBe(qrTokenHash(qrToken(warrantyId)));
    expect(qrToken("x")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (const warranty of world.warranties.filter((item) => item.activeToken)) expect(warranty.activeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("keeps quote heads, versions, acceptance and bookings mutually consistent", () => {
    const heads = new Map(rows("quote_heads").map((row) => [String(row.id), row]));
    const versions = new Set(rows("quote_versions").map((row) => `${row.quote_id}|${row.revision}`));
    for (const head of heads.values()) {
      expect(versions.has(`${head.quote_id ?? head.id}|${head.current_revision}`)).toBe(true);
      if (head.accepted_revision !== null) expect(head.accepted_revision).toBeLessThanOrEqual(Number(head.current_revision));
    }
    const accepted = new Set(rows("quote_acceptance_events").map((row) => String(row.quote_id)));
    expect(accepted.size).toBe(rows("quote_heads").filter((row) => row.accepted_revision !== null).length);
    expect(rows("quote_acceptance_events").every((row) => new Set(rows("quote_versions").filter((v) => v.quote_id === row.quote_id && v.revision === row.revision).map((v) => v.state)).has("offered"))).toBe(true);
    const states = new Set(rows("quote_versions").map((row) => row.state));
    for (const state of ["draft", "offered", "superseded".replace("superseded", "offered"), "cancelled"]) expect(states.has(state), state).toBe(true);
    const bookingQuotes = rows("bookings").filter((row) => row.accepted_quote_id !== null);
    expect(bookingQuotes.length).toBeGreaterThan(10);
    for (const booking of bookingQuotes) {
      const head = heads.get(String(booking.accepted_quote_id))!;
      expect(head.accepted_revision).toBe(booking.accepted_quote_revision);
      expect(head.customer_id).toBe(booking.customer_id);
      expect(head.vehicle_id).toBe(booking.vehicle_id);
    }
    const unique = new Set(bookingQuotes.map((row) => `${row.accepted_quote_id}|${row.accepted_quote_revision}`));
    expect(unique.size).toBe(bookingQuotes.length);
  });

  it("holds promotion pool and reservation invariants", () => {
    for (const pool of rows("promotion_pools")) {
      expect(Number(pool.reserved_units) + Number(pool.consumed_units)).toBeLessThanOrEqual(Number(pool.maximum_units));
      const allocations = rows("promotion_allocations").filter((row) => row.promotion_id === pool.promotion_id);
      expect(allocations.filter((row) => row.status === "reserved").length).toBe(Number(pool.reserved_units));
      expect(allocations.filter((row) => row.status === "consumed").length).toBe(Number(pool.consumed_units));
    }
    for (const reservation of rows("promotion_reservations")) {
      expect(reservation.deposit_state).not.toBe("recorded");
      expect(reservation.deposit_money_event_id).toBeNull();
      if (reservation.status !== "enquiry") { expect(reservation.policy_id).not.toBeNull(); expect(reservation.expiry_basis).not.toBeNull(); }
      if (reservation.booking_id !== null) expect(["scheduled", "redeemed", "cancelled"]).toContain(reservation.status);
      if (reservation.deposit_reference) expect(String(reservation.deposit_reference)).toMatch(/^private:[A-Za-z0-9/_-]+$/);
    }
    const bookingRefs = rows("promotion_reservations").map((row) => row.booking_id).filter(Boolean);
    expect(new Set(bookingRefs).size).toBe(bookingRefs.length);
    const statuses = new Set(rows("promotion_reservations").map((row) => row.status));
    for (const status of ["enquiry", "reserved", "scheduled", "redeemed", "cancelled", "expired"]) expect(statuses.has(status), status).toBe(true);
  });

  it("uses the real advertised catalogue prices", () => {
    const pkg = (id: string, version = 1) => rows("catalogue_package_versions").find((row) => row.package_id === id && row.version === version)!;
    const price = (id: string, version = 1) => ((pkg(id, version).price as Json).value as { value: { minor: number } }).value.minor;
    expect(price("seed-pkg-ppf-ultimate-sedan")).toBe(3_500_000);
    expect(price("seed-pkg-ppf-ultimate-suv")).toBe(3_800_000);
    expect(price("seed-pkg-ppf-plus-sedan")).toBe(4_000_000);
    expect(price("seed-pkg-ppf-plus-suv")).toBe(4_300_000);
    expect(price("seed-pkg-ppf-pro-sedan", 2)).toBe(2_800_000);
    expect(price("seed-pkg-ppf-pro-suv", 2)).toBe(3_000_000);
    expect(price("seed-pkg-ppf-matte-suv")).toBe(4_000_000);
    expect(price("seed-pkg-promo-ultimate-club")).toBe(4_499_900);
    expect(price("seed-pkg-promo-plus-lifetime")).toBe(5_299_900);
    expect(price("seed-pkg-promo-recent-ultimate")).toBe(3_999_900);
    expect(price("seed-pkg-addon-vkool")).toBe(900_000);
    expect(rows("catalogue_package_versions").some((row) => row.package_id === "seed-pkg-draft-wrapping" && row.state === "draft")).toBe(true);
  });

  it("records referral discounts without transferring warranty and keeps deposits as references", () => {
    const referral = rows("promotion_allocations").filter((row) => String(row.promotion_id).includes("warranty-card-referral"));
    expect(referral.length).toBeGreaterThan(0);
    for (const allocation of referral) expect(Number(allocation.discount_minor)).toBe(1_000_000);
    for (const row of rows("promotion_evidence").filter((item) => item.kind === "warranty-reference")) expect(ids("warranties").has(String(row.reference_id))).toBe(true);
    expect(rows("promotion_reservation_deposit_events").every((row) => row.state === "reference-only")).toBe(true);
  });

  it("keeps money events valid and uses only definitions that exist", () => {
    const defs = new Set(rows("commercial_policy_versions").filter((row) => row.family === "finance-definition").map((row) => row.policy_id));
    const kinds = new Set(rows("operational_money_events").map((row) => row.kind));
    for (const kind of ["collection", "refund", "direct-cost", "overhead", "recognized-revenue"]) expect(kinds.has(kind), kind).toBe(true);
    const seen = new Set<string>();
    for (const event of rows("operational_money_events")) {
      expect(Number(event.amount_minor)).toBeGreaterThan(0);
      expect(defs.has(String(event.definition_id))).toBe(true);
      const key = `${event.kind}|${event.source_method}|${event.source_reference}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
    for (const reversal of rows("operational_money_event_reversals")) expect(ids("operational_money_events").has(String(reversal.event_id))).toBe(true);
    expect(rows("finance_definition_attestations").length).toBe(defs.size);
  });

  it("keeps WhatsApp in simulation, held outbox only, with matching consent rows", () => {
    for (const conversation of rows("whatsapp_conversations")) expect(conversation.mode).toBe("simulation");
    for (const message of rows("whatsapp_messages")) expect(message.mode).toBe("simulation");
    expect(rows("messaging_outbox").length).toBeGreaterThan(0);
    for (const outbox of rows("messaging_outbox")) { expect(outbox.status).toBe("held"); expect(outbox.provider_message_id).toBeNull(); }
    expect(rows("messaging_channels").every((row) => row.status === "sandbox" && row.provider === "simulation")).toBe(true);
    expect(rows("messaging_delivery_policies").every((row) => row.active === false)).toBe(true);
    const customers = ids("customers");
    for (const consent of rows("messaging_customer_consents")) { expect(customers.has(String(consent.customer_id))).toBe(true); expect(String(consent.evidence_ref)).toMatch(/^private:/); }
    expect(new Set(rows("whatsapp_conversations").map((row) => row.status))).toEqual(new Set(["open", "pending", "resolved"]));
    expect(new Set(rows("whatsapp_messages").map((row) => row.kind))).toEqual(new Set(["customer", "bot", "staff", "internal-note"]));
  });

  it("is bilingual with Egyptian formats", () => {
    const names = rows("customers").map((row) => String(row.name));
    expect(names.some((name) => /[؀-ۿ]/.test(name))).toBe(true);
    expect(names.some((name) => /^[A-Za-z]/.test(name))).toBe(true);
    for (const customer of rows("customers")) expect(String(customer.phone)).toMatch(/^\+20 1\d\d 000 \d{4}$/);
    const plates = rows("vehicles").map((row) => String(row.plate));
    expect(new Set(plates).size).toBe(plates.length);
    for (const plate of plates) expect(plate).toMatch(/[؀-ۿ]/);
    expect(world.customers.slice(0, 8).some((customer) => customer.vehicles.length >= 3)).toBe(true);
    expect(world.customers.filter((customer) => customer.vehicles.length >= 2).length).toBeGreaterThan(6);
  });

  it("fits the configured bay and daily intake capacity for confirmed bookings", () => {
    const limits: Record<string, number> = { "branch-a": 8, "branch-b": 6 };
    const perDay = new Map<string, number>();
    for (const booking of rows("bookings").filter((row) => row.status === "confirmed")) {
      const key = `${booking.branch_id}|${booking.dropoff_date}`;
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    for (const [key, count] of perDay) expect(count, key).toBeLessThanOrEqual(limits[key.split("|")[0]]);
    const bays: Record<string, Record<string, number>> = { "branch-a": { clean: 2, general: 4 }, "branch-b": { clean: 1, general: 3 } };
    const bookingBranch = new Map(rows("bookings").map((row) => [String(row.id), String(row.branch_id)]));
    const minutes = new Map<string, number>();
    for (const occupancy of rows("booking_occupancy")) {
      const key = `${bookingBranch.get(String(occupancy.booking_id))}|${occupancy.occupied_date}|${occupancy.bay_type}`;
      minutes.set(key, (minutes.get(key) ?? 0) + Number(occupancy.required_minutes));
    }
    for (const [key, total] of minutes) { const [branch, , bay] = key.split("|"); expect(total, key).toBeLessThanOrEqual(bays[branch][bay] * 540); }
  });

  it("leaves no dangling foreign keys across the main reference chains", () => {
    const sets: Record<string, Set<string>> = {
      customers: ids("customers"), vehicles: ids("vehicles"), staff: ids("staff_memberships", "clerk_user_id"), services: ids("services"),
      bookings: ids("bookings"), jobs: ids("jobs"), warranties: ids("warranties"), quotes: ids("quote_heads"), reservations: ids("promotion_reservations"),
      allocations: ids("promotion_allocations"), conversations: ids("whatsapp_conversations"), entitlements: ids("benefit_entitlements"),
    };
    const check = (table: Parameters<Dataset["rows"]>[0], column: string, target: string) => {
      for (const row of rows(table)) if (row[column] !== null && row[column] !== undefined) expect(sets[target].has(String(row[column])), `${table}.${column}=${row[column]}`).toBe(true);
    };
    check("bookings", "customer_id", "customers"); check("bookings", "vehicle_id", "vehicles"); check("bookings", "service_id", "services");
    check("jobs", "booking_id", "bookings"); check("jobs", "assigned_user_id", "staff"); check("job_events", "job_id", "jobs");
    check("warranties", "job_id", "jobs"); check("warranties", "issued_by", "staff"); check("warranty_claims", "opened_by", "staff");
    check("quote_heads", "customer_id", "customers"); check("quote_heads", "vehicle_id", "vehicles");
    check("promotion_reservations", "beneficiary_id", "customers"); check("promotion_reservations", "allocation_id", "allocations"); check("promotion_reservations", "booking_id", "bookings");
    check("transport_requests", "booking_id", "bookings"); check("transport_requests", "job_id", "jobs");
    check("whatsapp_conversations", "customer_id", "customers"); check("whatsapp_conversations", "related_booking_id", "bookings"); check("whatsapp_messages", "conversation_id", "conversations");
    check("benefit_entitlements", "customer_id", "customers"); check("benefit_redemptions", "entitlement_id", "entitlements");
    check("operational_money_events", "job_id", "jobs"); check("operational_money_events", "customer_id", "customers");
    for (const table of TABLE_ORDER) expect(typeof table).toBe("string");
  });

  it("builds complete lifecycles for the rich customers and exposes lookup keys", () => {
    const rich = world.customers.slice(0, 8);
    for (const customer of rich) {
      const owns = (table: Parameters<Dataset["rows"]>[0], column = "customer_id") => rows(table).some((row) => row[column] === customer.id);
      expect(owns("bookings"), customer.id).toBe(true);
      expect(owns("whatsapp_conversations"), customer.id).toBe(true);
      expect(owns("quote_heads"), customer.id).toBe(true);
      expect(owns("messaging_customer_consents"), customer.id).toBe(true);
    }
    const first = world.customers[0];
    expect(rows("warranties").some((row) => row.customer_id === first.id)).toBe(true);
    expect(rows("warranty_claims").some((claim) => rows("warranties").find((row) => row.id === claim.warranty_id)?.customer_id === first.id)).toBe(true);
    expect(rows("warranty_invoice_drafts").some((invoice) => rows("warranties").find((row) => row.id === invoice.warranty_id)?.customer_id === first.id)).toBe(true);
    expect(first.vehicles[0].plate).toBe("أ ب ج 1234");
    const token = world.warranties.find((warranty) => warranty.visit.customer === first && warranty.activeToken)?.activeToken;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("emits JSON values only through the Json wrapper and covers the purge plan", () => {
    for (const table of ["catalogue_package_versions", "quote_versions", "commercial_policy_versions"] as const) {
      for (const row of rows(table)) for (const key of ["snapshot", "value", "scope"]) if (key in row) expect(row[key]).toBeInstanceOf(Json);
    }
    const planned = new Set(buildSteps({ keepDemoAccounts: false }).map((step) => step.table));
    for (const table of TABLE_ORDER) {
      if (!ds.rows(table).length || ["branch_availability_versions"].includes(table)) continue;
      expect(planned.has(table), `purge plan misses ${table}`).toBe(true);
    }
  });

  it("seeds about fifteen bilingual special requests across every status with consistent owners and valid replies", () => {
    const requests = rows("special_requests");
    expect(requests.length).toBeGreaterThanOrEqual(14);
    expect(new Set(requests.map((row) => row.status))).toEqual(new Set(["new", "under-review", "needs-info", "accepted", "declined", "closed"]));
    const owner = new Map(rows("vehicles").map((row) => [String(row.id), String(row.customer_id)]));
    const quotes = new Map(rows("quote_heads").map((row) => [String(row.id), row]));
    for (const request of requests) {
      expect(String(request.id)).toMatch(/^seed-sr-/);
      expect(owner.get(String(request.vehicle_id))).toBe(request.customer_id);
      if (request.reply_decision === "accepted") for (const key of ["quoted_price_minor", "quoted_currency", "duration_days", "available_from"]) expect(request[key], key).not.toBeNull();
      if (request.quote_id) { const quote = quotes.get(String(request.quote_id))!; expect(quote.customer_id).toBe(request.customer_id); expect(quote.vehicle_id).toBe(request.vehicle_id); }
      const events = rows("special_request_events").filter((event) => event.request_id === request.id);
      expect(events.length, String(request.id)).toBeGreaterThan(0);
      expect(events[events.length - 1].to_status).toBe(request.status);
    }
    expect(requests.some((row) => /[؀-ۿ]/.test(String(row.title)))).toBe(true);
    expect(requests.some((row) => /^[A-Za-z]/.test(String(row.title)))).toBe(true);
  });

  it("has no duplicate primary or unique keys (would abort a real insert)", () => {
    const keys: Array<[Parameters<Dataset["rows"]>[0], string[]]> = [
      ["customers", ["id"]], ["customers", ["phone_normalized"]], ["vehicles", ["id"]], ["bookings", ["id"]], ["jobs", ["id"]], ["jobs", ["booking_id"]], ["job_events", ["id"]],
      ["quote_heads", ["id"]], ["quote_versions", ["quote_id", "revision"]], ["quote_acceptance_events", ["quote_id"]], ["warranties", ["id"]],
      ["warranty_invoice_drafts", ["warranty_id"]], ["warranty_verification_tokens", ["id"]], ["warranty_verification_tokens", ["token_hash"]], ["warranty_qr_print_events", ["id"]],
      ["warranty_audit_events", ["id"]], ["warranty_claims", ["id"]], ["transport_requests", ["booking_id", "direction"]], ["transport_events", ["transport_id", "revision"]],
      ["promotion_reservations", ["id"]], ["promotion_reservations", ["booking_id"]], ["promotion_allocations", ["quote_id", "quote_revision", "vehicle_id", "promotion_id"]],
      ["promotion_evidence_consumption", ["kind", "reference_id"]], ["promotion_reservation_events", ["reservation_id", "revision"]], ["benefit_entitlements", ["id"]],
      ["benefit_redemptions", ["entitlement_id", "fulfillment_ref"]], ["operational_money_events", ["id"]], ["whatsapp_conversations", ["id"]], ["whatsapp_messages", ["id"]],
      ["whatsapp_conversation_events", ["id"]], ["messaging_outbox", ["id"]], ["messaging_outbox", ["idempotency_key"]], ["messaging_contact_links", ["provider_contact_hash"]],
      ["messaging_customer_consents", ["customer_id", "purpose"]], ["messaging_customer_consent_events", ["id"]], ["booking_work_components", ["booking_id", "position"]],
      ["job_work_components", ["job_id", "position"]], ["booking_occupancy", ["booking_id", "occupied_date", "bay_type"]], ["catalogue_package_versions", ["package_id", "version"]],
      ["commercial_policy_versions", ["policy_id", "version"]], ["warranty_policies", ["policy_id", "version"]], ["pickup_commitments", ["booking_id", "revision"]],
      ["benefit_windows", ["entitlement_id", "starts_on"]], ["customer_branches", ["customer_id", "branch_id"]],
    ];
    for (const [table, columns] of keys) {
      const seen = new Set<string>();
      for (const row of rows(table)) {
        if (columns.some((column) => row[column] === null || row[column] === undefined)) continue;
        const value = columns.map((column) => String(row[column])).join("|");
        expect(seen.has(value), `${table} duplicate ${columns.join(",")}=${value}`).toBe(false);
        seen.add(value);
      }
    }
  });

  it("requires both safeguards before purging", () => {
    expect(purgeGate(parseArgs([]), {}).mode).toBe("dry-run");
    expect(purgeGate(parseArgs(["--execute"]), {}).mode).toBe("dry-run");
    expect(purgeGate(parseArgs([]), { GARAGE_CONFIRM_PURGE: "yes" }).mode).toBe("dry-run");
    expect(purgeGate(parseArgs(["--execute"]), { GARAGE_CONFIRM_PURGE: "true" }).mode).toBe("dry-run");
    expect(purgeGate(parseArgs(["--execute"]), { GARAGE_CONFIRM_PURGE: "yes" }).mode).toBe("execute");
  });
});
