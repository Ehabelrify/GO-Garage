import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PackageVersion } from "@garage/domain";
import type { GarageActor } from "../auth/authz";

type Row = Record<string, unknown>;
const { query, createQuote, createBooking } = vi.hoisted(() => ({ query: vi.fn(), createQuote: vi.fn(), createBooking: vi.fn() }));
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query },
  withTransaction: async (run: (client: { query: typeof query }) => unknown) => run({ query }),
}));
vi.mock("../operations/booking-create", () => ({ createBookingInTransaction: createBooking, getSettingValue: vi.fn() }));
vi.mock("../commercial/quote-service", async () => {
  const actual = await vi.importActual<typeof import("../commercial/quote-service")>("../commercial/quote-service");
  return { ...actual, createQuoteRevisionInTransaction: createQuote };
});

const { runIntake, intakeSchema, intakeRequestHash, intakeQuoteId } = await import("./intake-service");
const { assembleIntakeQuote } = await import("./intake-quote");
const { quoteDraftSchema } = await import("../commercial/quote-service");

const actor = (role: GarageActor["role"] = "receptionist", extra: Partial<GarageActor> = {}): GarageActor =>
  ({ userId: `${role}-1`, email: "", name: role, role, branchIds: ["b1"], permissions: role === "receptionist" ? { "quotes.manage": true } : undefined, ...extra });

const occ = { id: "work-occupancy:x", version: 1 };
const approval = { approvedBy: "o", approvedAt: "", evidenceRef: "private:x", reason: "r" };
const price = (minor: number) => ({ state: "approved", value: { minor, currency: "EGP" }, policy: { id: "p", version: 1 }, approval });
const tax = (minor: number) => ({ state: "approved", value: { rule: { id: "t", version: 1 }, amount: { minor, currency: "EGP" } }, policy: { id: "t", version: 1 }, approval });
const product = (over: Record<string, unknown> = {}): PackageVersion => ({
  ref: { id: "prod-mats", version: 1 }, revision: 1, kind: "product", name: { en: "Floor mats", ar: "دواسات" }, productCategory: { en: "Accessories", ar: "إكسسوارات" },
  vehicleCategoryIds: [], vehicleModels: [], branchIds: ["b1"], effectiveFrom: null, effectiveThrough: null,
  scope: [{ id: "scope-product", serviceId: "product", gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1, productId: "prod-mats", label: { en: "Floor mats", ar: "دواسات" } }],
  work: [], price: price(120000), tax: tax(0), workAggregation: { state: "unconfigured", missing: [] }, provenance: "", approval: null, state: "published", ...over,
}) as unknown as PackageVersion;
const service = (over: Record<string, unknown> = {}): PackageVersion => ({
  ref: { id: "svc-tint", version: 2 }, revision: 1, kind: "standalone", name: { en: "Tint", ar: "تظليل" }, vehicleCategoryIds: ["sedan"], vehicleModels: [], branchIds: ["b1"], effectiveFrom: null, effectiveThrough: null,
  scope: [{ id: "s1", serviceId: "tint", gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1 }],
  work: [{ id: "w1", serviceId: "tint", scopeItemIds: ["s1"], occupancyRule: occ }],
  price: price(450000), tax: tax(0), workAggregation: { state: "unconfigured", missing: [] }, provenance: "", approval: null, state: "published", ...over,
}) as unknown as PackageVersion;
const vehicle = { vehicleId: "v1", model: "Civic", categoryId: "sedan" };
const base = (items: Array<{ pkg: PackageVersion; quantity: number; note?: string }>) => ({
  today: "2026-11-22", actorId: "u1", branchId: "b1", customerId: "c1", vehicle, items, notes: null, conversationId: null, quoteId: "q1", terms: null,
});

describe("assembleIntakeQuote", () => {
  it("a product-only quote has no work and no bay time and passes the quote schema", () => {
    const { input, mode } = assembleIntakeQuote(base([{ pkg: product(), quantity: 1 }]));
    expect(mode).toBe("catalogue");
    expect(input.work).toEqual([]);
    expect(input.scope[0]).toMatchObject({ productId: "prod-mats", serviceId: "product", quantity: 1 });
    expect(() => quoteDraftSchema.parse(input)).not.toThrow();
  });
  it("two units of a product become one line with quantity 2 and no work", () => {
    const { input, mode, warnings } = assembleIntakeQuote(base([{ pkg: product(), quantity: 2, note: "black" }]));
    expect(mode).toBe("manual");
    expect(input.packageVersion).toBeNull();
    expect(input.work).toEqual([]);
    expect(input.lines).toHaveLength(1);
    expect(input.lines[0]).toMatchObject({ quantity: 2, unitPrice: { minor: 120000, currency: "EGP" } });
    expect(input.scope[0]).toMatchObject({ quantity: 2, productId: "prod-mats", areas: ["black"] });
    expect(warnings).toContain("manual-price-needs-review");
    expect(() => quoteDraftSchema.parse(input)).not.toThrow();
  });
  it("a single exact service stays a catalogue quote with its work", () => {
    const { input, mode } = assembleIntakeQuote(base([{ pkg: service(), quantity: 1 }]));
    expect(mode).toBe("catalogue");
    expect(input.packageVersion).toEqual({ id: "svc-tint", version: 2 });
    expect(input.work).toHaveLength(1);
  });
  it("mixes a service and a product: only the service keeps work", () => {
    const { input } = assembleIntakeQuote(base([{ pkg: service(), quantity: 1 }, { pkg: product(), quantity: 3 }]));
    expect(input.work).toHaveLength(1);
    expect(input.work[0].serviceId).toBe("tint");
    expect(input.lines).toHaveLength(2);
    expect(input.lines.reduce((sum, line) => sum + line.unitPrice.minor * line.quantity, 0)).toBe(450000 + 3 * 120000);
    expect(() => quoteDraftSchema.parse(input)).not.toThrow();
  });
  it("refuses a quote whose items use two currencies, and an empty quote", () => {
    const usd = product({ ref: { id: "p2", version: 1 }, price: { state: "approved", value: { minor: 100, currency: "USD" }, policy: { id: "p", version: 1 }, approval }, tax: { state: "approved", value: { rule: { id: "t", version: 1 }, amount: { minor: 0, currency: "USD" } }, policy: { id: "t", version: 1 }, approval } });
    expect(() => assembleIntakeQuote(base([{ pkg: product(), quantity: 1 }, { pkg: usd, quantity: 1 }]))).toThrow(/different currencies/);
    expect(() => assembleIntakeQuote(base([]))).toThrow(/at least one item/);
  });
  it("an unpriced item becomes a zero line with a warning, never a guessed price", () => {
    const unpriced = product({ price: { state: "unconfigured", missing: ["price"] }, tax: { state: "unconfigured", missing: ["tax"] } });
    const { input, warnings } = assembleIntakeQuote(base([{ pkg: unpriced, quantity: 1 }]));
    expect(input.lines[0].unitPrice.minor).toBe(0);
    expect(warnings).toContain("no-catalogue-price");
  });
});

/* ------------------------------ endpoint behaviour with a mocked pool ------------------------------ */

const walkIn = (extra: Record<string, unknown> = {}) => ({
  customer: { name: "Mona", phone: "01001234567", language: "ar" }, vehicle: { plate: "أ ب ج 1234", makeModel: "Toyota Corolla 2022" }, branchId: "b1",
  items: [{ id: { packageId: "prod-mats", version: 1 }, quantity: 2 }], outcome: "quote", idempotencyKey: "key-1", ...extra,
});
const serviceRow = (pkg: PackageVersion): Row => ({
  package_id: pkg.ref.id, version: pkg.ref.version, revision: 1, kind: pkg.kind, state: "published", name: pkg.name, vehicle_category_ids: pkg.vehicleCategoryIds, vehicle_models: pkg.vehicleModels,
  branch_ids: pkg.branchIds, effective_from: null, effective_through: null, scope: pkg.scope, work: pkg.work, price: pkg.price, tax: pkg.tax, work_aggregation: pkg.workAggregation,
  provenance: "", approval: null, product_category: pkg.productCategory ?? null,
});
let claimed: boolean; let stored: Row | null; let duplicatePlate: boolean; let existingCustomer: boolean; let catalogue: PackageVersion[];

function route(sql: string, values: unknown[] = []): { rows: Row[]; rowCount: number } {
  const done = (rows: Row[], rowCount = rows.length) => ({ rows, rowCount });
  if (sql.includes("INSERT INTO intake_requests")) return done([], claimed ? 0 : 1);
  if (sql.includes("FROM intake_requests")) return done(stored ? [stored] : []);
  if (sql.includes("UPDATE intake_requests")) return done([], 1);
  if (sql.startsWith("SELECT 1 FROM branches")) return done([{}], 1);
  if (sql.includes("SELECT c.id FROM customers c WHERE c.id=$1")) return done(existingCustomer ? [{ id: "c-old" }] : []);
  if (sql.includes("SELECT branch_id FROM customer_branches")) return done([{ branch_id: "b1" }]);
  if (sql.includes("SELECT id FROM customers WHERE phone_normalized")) return done([]);
  if (sql.includes("garage_normalize_plate")) return done(duplicatePlate ? [{ id: "veh-x", customer_id: "c-x", plate: "أ ب ج 1234" }] : []);
  if (sql.includes("FROM vehicles v WHERE v.id=$1 AND v.customer_id=$2")) return done([{ id: values[0], model: "Corolla", category_id: "sedan", plate: "ABC 123" }]);
  if (sql.includes("FROM catalogue_package_active")) return done(catalogue.map(serviceRow));
  if (sql.includes("FROM whatsapp_conversations WHERE id=$1 AND mode")) return done([{ id: "wa-1", branch_id: "b1" }]);
  if (sql.includes("FROM whatsapp_conversations WHERE id=$1 FOR UPDATE")) return done([{ id: "wa-1", branch_id: "b1", channel_id: "ch-1", customer_id: null, vehicle_id: null, provider_contact_hash: "hash-abcd", mode: "operational" }]);
  if (sql.includes("SELECT c.id,c.name FROM customers c")) return done([{ id: values[0], name: "Sami" }]);
  return done([], 1);
}
beforeEach(() => {
  claimed = false; stored = null; duplicatePlate = false; existingCustomer = false; catalogue = [product()];
  query.mockReset(); query.mockImplementation(async (sql: string, values?: unknown[]) => route(String(sql), values));
  createQuote.mockReset(); createQuote.mockImplementation(async (_client: unknown, _ctx: unknown, _actor: unknown, input: { quoteId: string }) => ({ quoteId: input.quoteId, revision: 1 }));
  createBooking.mockReset(); createBooking.mockResolvedValue({ bookingId: "booking-1", status: "pending" });
});

describe("POST /api/intake service", () => {
  it("walk-in to a draft quote: creates customer and vehicle, then a product-only draft with no bay time", async () => {
    const out = await runIntake(actor(), walkIn());
    expect(out.status).toBe(201);
    expect(out.body.quoteId).toMatch(/^qi-/);
    expect(out.body.quoteRevision).toBe(1);
    expect(out.body.customerId).toMatch(/^customer-/);
    expect(out.body.vehicleId).toMatch(/^vehicle-/);
    const draft = createQuote.mock.calls[0][3];
    expect(draft.state).toBe("draft");
    expect(draft.work).toEqual([]);
    expect(draft.lines[0].quantity).toBe(2);
    expect(draft.quoteId).toBe(intakeQuoteId("receptionist-1", "key-1"));
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO customers("))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO vehicles("))).toBe(true);
  });
  it("existing customer with a new car books through the booking service (no quote)", async () => {
    existingCustomer = true;
    const out = await runIntake(actor(), { customer: { id: "c-old" }, vehicle: { plate: "ABC 123", makeModel: "Kia Rio" }, branchId: "b1", items: [], outcome: "booking", booking: { date: "2026-12-01", time: "10:00", serviceId: "tint" }, idempotencyKey: "key-2" });
    expect(out.body.bookingId).toBe("booking-1");
    expect(out.body.warnings).toContain("booking-pending");
    expect(createQuote).not.toHaveBeenCalled();
    expect(createBooking.mock.calls[0][2]).toMatchObject({ customerId: "c-old", serviceId: "tint", branchId: "b1", dropoffDate: "2026-12-01" });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO customers("))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO vehicles("))).toBe(true);
  });
  it("a booking capacity conflict is reported with its code and nothing else is returned", async () => {
    createBooking.mockResolvedValue({ status: "capacity-conflict", reason: "bay-capacity" });
    await expect(runIntake(actor(), { ...walkIn({ outcome: "booking", booking: { date: "2026-12-01", time: "10:00", serviceId: "tint" } }) })).rejects.toMatchObject({ status: 409, code: "BAY_CAPACITY_REACHED" });
  });
  it("saves the customer only and links an unsaved WhatsApp conversation", async () => {
    const out = await runIntake(actor(), { customer: { name: "Sami", phone: "01007654321", language: "en" }, branchId: "b1", items: [], outcome: "customer-only", whatsappConversationId: "wa-1", idempotencyKey: "key-3" });
    expect(out.body).toMatchObject({ conversationId: "wa-1", vehicleId: null });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO messaging_contact_links"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE whatsapp_conversations SET customer_id=$2"))).toBe(true);
  });
  it("answers 409 DUPLICATE_PLATE with the existing vehicle", async () => {
    duplicatePlate = true;
    await expect(runIntake(actor(), walkIn())).rejects.toMatchObject({ status: 409, code: "DUPLICATE_PLATE", body: { existingVehicle: { id: "veh-x", customerId: "c-x" } } });
    expect(createQuote).not.toHaveBeenCalled();
  });
  it("a view-only user gets 403 for a quote but may save a customer", async () => {
    const manager = actor("branch-manager");
    await expect(runIntake(manager, walkIn())).rejects.toMatchObject({ status: 403, code: "ROLE_FORBIDDEN" });
    expect(query).not.toHaveBeenCalled();
    const out = await runIntake(manager, { customer: { name: "Sami", phone: "01007654321", language: "en" }, branchId: "b1", outcome: "customer-only", idempotencyKey: "key-4" });
    expect(out.status).toBe(201);
  });
  it("blocks demo identities and other branches before any query", async () => {
    await expect(runIntake(actor("owner", { isDemo: true }), walkIn())).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });
    await expect(runIntake(actor("receptionist", { branchIds: ["other"] }), walkIn())).rejects.toMatchObject({ status: 403, code: "BRANCH_FORBIDDEN" });
    await expect(runIntake(actor("technician"), walkIn())).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });
  it("is idempotent: the same key and body replays the stored answer without creating anything", async () => {
    claimed = true;
    const body = walkIn();
    const response = { customerId: "customer-1", vehicleId: "vehicle-1", quoteId: "qi-1", quoteRevision: 1, warnings: [] };
    stored = { request_hash: intakeRequestHash(intakeSchema.parse(body)), response };
    const out = await runIntake(actor(), body);
    expect(out).toEqual({ status: 200, body: response });
    expect(createQuote).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO customers("))).toBe(false);
  });
  it("refuses a reused key with a different body", async () => {
    claimed = true;
    stored = { request_hash: "other", response: { customerId: "x", vehicleId: null, warnings: [] } };
    await expect(runIntake(actor(), walkIn())).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  });
  it("rejects an item that is no longer published and invalid bodies", async () => {
    catalogue = [];
    await expect(runIntake(actor(), walkIn())).rejects.toMatchObject({ status: 409, code: "ITEM_UNAVAILABLE" });
    await expect(runIntake(actor(), walkIn({ items: [] }))).rejects.toThrow();
    await expect(runIntake(actor(), walkIn({ items: [{ id: { packageId: "a", version: 1 }, quantity: 1 }, { id: { packageId: "a", version: 1 }, quantity: 2 }] }))).rejects.toThrow();
    await expect(runIntake(actor(), { ...walkIn(), extra: true })).rejects.toThrow();
  });
});
