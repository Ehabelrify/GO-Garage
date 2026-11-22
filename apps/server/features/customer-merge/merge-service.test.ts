import { describe, expect, it, vi } from "vitest";
import type { GarageActor } from "../auth/authz";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query, connect: async () => ({ query, release: () => undefined }) },
  withTransaction: async (run: (client: { query: typeof query }) => unknown) => run({ query }),
}));
const service = await import("./merge-service");

const actor = (role: GarageActor["role"], extra: Partial<GarageActor> = {}): GarageActor => ({ userId: `${role}-1`, email: "", name: role, role, branchIds: ["b1"], ...extra });
const ok = (rows: unknown[] = []) => ({ rows, rowCount: rows.length });
const customer = (id: string) => ({ id, name: `N ${id}`, phone: "0100", phone_normalized: `p${id}`, preferred_language: "ar", created_at: new Date() });

/** Scripted pool: answers by SQL pattern; records every statement in order. First matching override wins. */
function script(overrides: Array<[RegExp, unknown]> = [], counts = 0) {
  const seen: string[] = [];
  query.mockReset();
  query.mockImplementation(async (sql: string, params?: unknown[]) => {
    seen.push(sql);
    for (const [pattern, result] of overrides) if (pattern.test(sql)) return result;
    if (/FROM customers WHERE id=/.test(sql)) return ok([customer(String(params?.[0]))]);
    if (/count\(\*\) AS n/.test(sql)) return ok([{ n: String(counts) }]);
    return ok();
  });
  return seen;
}

describe("merge authorisation", () => {
  it("is owner-only, blocked for demo identities, and validates before any query", async () => {
    script();
    await expect(service.mergeCustomers(actor("branch-manager"), { survivorId: "s", mergedId: "m", reason: "x" })).rejects.toMatchObject({ code: "OWNER_REQUIRED" });
    await expect(service.mergeCustomers(actor("owner", { isDemo: true }), { survivorId: "s", mergedId: "m", reason: "x" })).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });
    await expect(service.undoMerge(actor("owner", { isDemo: true }), "m1", "x")).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });
    await expect(service.mergeCustomers(actor("owner"), { survivorId: "s", mergedId: "m", reason: " " })).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await expect(service.listDuplicates(actor("receptionist"))).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });
  it("refuses merging a customer into itself", async () => {
    script();
    await expect(service.mergeCustomers(actor("owner"), { survivorId: "s", mergedId: "s", reason: "x" })).rejects.toMatchObject({ code: "SAME_CUSTOMER" });
  });
});

describe("preview", () => {
  it("returns a count per table, folds colliding plates, and never writes", async () => {
    const seen = script([
      [/FROM vehicles v/, ok([
        { id: "vs", plate: "ABC 1", key: "ABC1", owner: "s" },
        { id: "vm1", plate: "abc-1", key: "ABC1", owner: "m" },
        { id: "vm2", plate: "XYZ 2", key: "XYZ2", owner: "m" },
      ])],
    ], 3);
    const plan = await service.previewMerge(actor("owner"), "s", "m");
    expect(plan.vehicles.collided).toEqual([{ mergedVehicleId: "vm1", survivorVehicleId: "vs", plate: "abc-1" }]);
    expect(plan.vehicles.moved).toEqual([{ id: "vm2", plate: "XYZ 2" }]);
    expect(plan.counts.find((x) => x.key === "vehicles")?.count).toBe(2);
    expect(plan.counts.find((x) => x.key === "invoices")?.count).toBe(3);
    expect(plan.counts.map((x) => x.key)).toEqual(expect.arrayContaining(["bookings", "quotes", "reservations", "benefits", "transport", "warranties", "special-requests", "conversations", "contact-links"]));
    expect(seen.some((sql) => /^\s*(INSERT|UPDATE|DELETE)/i.test(sql))).toBe(false);
  });
});

describe("merge transaction", () => {
  it("locks, logs, moves, archives and audits in order, setting the trigger flag before any move", async () => {
    const seen = script([
      [/FROM vehicles v/, ok([{ id: "vm2", plate: "XYZ 2", key: "XYZ2", owner: "m" }])],
      [/SELECT 1 FROM customer_merges/, ok()],
      [/FROM bookings WHERE/, ok([{ id: "bk1", customer_id: "m", vehicle_id: "vm2" }])],
    ]);
    const result = await service.mergeCustomers(actor("owner"), { survivorId: "s", mergedId: "m", reason: "same person" });
    expect(result.mergeId).toMatch(/^merge-/);
    const at = (re: RegExp) => seen.findIndex((sql) => re.test(sql));
    expect(at(/pg_advisory_xact_lock/)).toBe(0);
    expect(at(/INSERT INTO customer_merges/)).toBeGreaterThan(at(/pg_advisory_xact_lock/));
    expect(at(/set_config\('garage.customer_merge'/)).toBeGreaterThan(at(/INSERT INTO customer_merges/));
    expect(at(/UPDATE vehicles SET customer_id/)).toBeGreaterThan(at(/set_config/));
    expect(at(/UPDATE bookings SET/)).toBeGreaterThan(at(/UPDATE vehicles SET/));
    expect(at(/INSERT INTO record_archives\(entity_kind, entity_id, archived_by, reason\) VALUES\('customer'/)).toBeGreaterThan(at(/UPDATE bookings SET/));
    expect(at(/INSERT INTO owner_record_audit/)).toBe(seen.length - 1);
    expect(seen.some((sql) => /DELETE FROM/.test(sql))).toBe(false);
    expect(seen.some((sql) => /UPDATE (quote_versions|quote_audit|invoice_events|messaging_customer_consent_events|owner_record_audit)/.test(sql))).toBe(false);
  });
  it("refuses a customer that is already archived or merged", async () => {
    script([[/FROM record_archives WHERE entity_kind='customer'/, ok([{ entity_id: "m" }])]]);
    await expect(service.mergeCustomers(actor("owner"), { survivorId: "s", mergedId: "m", reason: "x" })).rejects.toMatchObject({ code: "ALREADY_ARCHIVED" });
    script([[/SELECT 1 FROM customer_merges/, ok([{ one: 1 }])]]);
    await expect(service.mergeCustomers(actor("owner"), { survivorId: "s", mergedId: "m", reason: "x" })).rejects.toMatchObject({ code: "ALREADY_MERGED" });
  });
});

describe("undo", () => {
  const merge = (extra: Record<string, unknown> = {}) => ok([{ id: "m1", survivor_id: "s", merged_id: "m", merged_at: new Date(), undone_at: null, ...extra }]);

  it("refuses after the 30 day window and when already undone", async () => {
    script([[/FROM customer_merges WHERE id=/, merge({ merged_at: new Date(Date.now() - 31 * 86_400_000) })]]);
    await expect(service.undoMerge(actor("owner"), "m1", "oops")).rejects.toMatchObject({ code: "UNDO_WINDOW_PASSED" });
    script([[/FROM customer_merges WHERE id=/, merge({ undone_at: new Date() })]]);
    await expect(service.undoMerge(actor("owner"), "m1", "oops")).rejects.toMatchObject({ code: "ALREADY_UNDONE" });
  });
  it("refuses when a moved row changed since the merge, and never marks the merge undone", async () => {
    const seen = script([
      [/FROM customer_merges WHERE id=/, merge()],
      [/SELECT 1 FROM customer_merges WHERE merged_id/, ok()],
      [/FROM customer_merge_moves/, ok([{ kind: "move", table_name: "bookings", pk: { id: "bk1" }, column_name: "customer_id", old_value: "m", new_value: "s" }])],
      [/^UPDATE bookings/, { rows: [], rowCount: 0 }],
    ]);
    await expect(service.undoMerge(actor("owner"), "m1", "oops")).rejects.toMatchObject({ code: "UNDO_CONFLICT", details: [{ table: "bookings", id: "bk1", reason: "changed-since-merge" }] });
    expect(seen.some((sql) => /UPDATE customer_merges/.test(sql))).toBe(false);
  });
  it("refuses when the survivor was merged away afterwards", async () => {
    script([
      [/FROM customer_merges WHERE id=/, merge()],
      [/SELECT 1 FROM customer_merges WHERE merged_id/, ok([{ one: 1 }])],
    ]);
    await expect(service.undoMerge(actor("owner"), "m1", "oops")).rejects.toMatchObject({ code: "UNDO_CONFLICT" });
  });
  it("refuses a move log naming a table outside the registry", async () => {
    script([
      [/FROM customer_merges WHERE id=/, merge()],
      [/SELECT 1 FROM customer_merges WHERE merged_id/, ok()],
      [/FROM customer_merge_moves/, ok([{ kind: "move", table_name: "staff_memberships", pk: { id: "x" }, column_name: "customer_id", old_value: "m", new_value: "s" }])],
    ]);
    await expect(service.undoMerge(actor("owner"), "m1", "oops")).rejects.toMatchObject({ code: "MERGE_LOG_INVALID" });
  });
  it("reverts in reverse order, restores the stub and audits when nothing conflicts", async () => {
    const seen = script([
      [/FROM customer_merges WHERE id=/, merge()],
      [/SELECT 1 FROM customer_merges WHERE merged_id/, ok()],
      [/FROM customer_merge_moves/, ok([
        { kind: "insert", table_name: "record_archives", pk: { entity_kind: "customer", entity_id: "m" }, column_name: null, old_value: null, new_value: null },
        { kind: "move", table_name: "bookings", pk: { id: "bk1" }, column_name: "customer_id", old_value: "m", new_value: "s" },
      ])],
      [/^UPDATE bookings/, { rows: [], rowCount: 1 }],
    ]);
    const result = await service.undoMerge(actor("owner"), "m1", "wrong pair");
    expect(result).toMatchObject({ undone: true, moved: 1 });
    const at = (re: RegExp) => seen.findIndex((sql) => re.test(sql));
    expect(at(/DELETE FROM record_archives/)).toBeLessThan(at(/UPDATE bookings/));
    expect(at(/UPDATE customer_merges/)).toBeGreaterThan(at(/UPDATE bookings/));
    expect(at(/INSERT INTO owner_record_audit/)).toBeGreaterThan(at(/UPDATE customer_merges/));
  });
});
