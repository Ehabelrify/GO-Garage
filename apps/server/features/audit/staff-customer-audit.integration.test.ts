import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GarageActor } from "../auth/authz";

/**
 * P2T-008: staff_customer_audit_events (migration 0039) is append-only and its rows surface through the unified audit
 * source query as staff-access, customer and reminder kinds. Runs only against the disposable CI database
 * (GARAGE_TEST_DATABASE_URL); otherwise skipped. The rows cannot be deleted by design; they carry this run's unique ids.
 */
const testDatabaseUrl = process.env.GARAGE_TEST_DATABASE_URL;
const originalDatabaseUrl = process.env.DATABASE_URL;
const integration = testDatabaseUrl ? describe : describe.skip;
const suffix = crypto.randomUUID();
const staffEntity = `it-audit-staff-${suffix}`;
const customerEntity = `it-audit-customer-${suffix}`;
const ruleEntity = `it-audit-rule-${suffix}`;
const owner: GarageActor = { userId: `it-audit-owner-${suffix}`, email: "owner@example.test", name: "Fictional Audit Owner", role: "owner", branchIds: [] };

integration("staff/customer audit rows are append-only and visible in the audit timeline", () => {
  let db: typeof import("../../infrastructure/database/db");
  let service: typeof import("./audit-service");
  const find = async (entity: string) => (await service.listAudit(owner, { entity, limit: 50, lang: "en" })).events;

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("GARAGE_TEST_DATABASE_URL is required for database integration tests.");
    process.env.DATABASE_URL = testDatabaseUrl;
    db = await import("../../infrastructure/database/db");
    const writer = await import("./audit-writer");
    service = await import("./audit-service");
    await writer.recordStaffCustomerAudit(db.pool, { entityKind: "staff", entityId: staffEntity, action: "role-changed", summary: "role: receptionist -> technician", actorUserId: owner.userId });
    await writer.recordStaffCustomerAudit(db.pool, { entityKind: "customer", entityId: customerEntity, action: "customer-created", summary: "x".repeat(700), actorUserId: owner.userId });
    await writer.recordStaffCustomerAudit(db.pool, { entityKind: "reminder-rule", entityId: ruleEntity, action: "rule-updated", summary: "Fields changed: enabled; revision 2", actorUserId: null });
  });

  afterAll(async () => {
    try {
      if (db) await db.pool.end();
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("rejects UPDATE and DELETE of an audit row", async () => {
    const id = (await db.pool.query<{ id: string }>("SELECT id FROM staff_customer_audit_events WHERE entity_id = $1", [staffEntity])).rows[0].id;
    await expect(db.pool.query("UPDATE staff_customer_audit_events SET summary = 'tampered' WHERE id = $1", [id])).rejects.toThrow(/append-only/i);
    await expect(db.pool.query("DELETE FROM staff_customer_audit_events WHERE id = $1", [id])).rejects.toThrow(/append-only/i);
    const row = await db.pool.query("SELECT summary FROM staff_customer_audit_events WHERE id = $1", [id]);
    expect(row.rows[0].summary).toBe("role: receptionist -> technician");
  });

  it("surfaces each entity kind through the audit source query with the right kind and entity", async () => {
    const staff = await find(`staff:${staffEntity}`);
    expect(staff).toHaveLength(1);
    expect(staff[0]).toMatchObject({ kind: "staff-access", action: "role-changed", entity: { type: "staff", id: staffEntity }, detail: "role: receptionist -> technician" });
    expect(staff[0].actor.id).toBe(owner.userId);
    expect(staff[0].id).toMatch(/^staff-audit:sca-/);

    const customer = await find(`customer:${customerEntity}`);
    expect(customer).toHaveLength(1);
    expect(customer[0]).toMatchObject({ kind: "customer", action: "customer-created", entity: { type: "customer", id: customerEntity } });
    expect(customer[0].detail).toHaveLength(500);

    const rule = await find(`reminder-rule:${ruleEntity}`);
    expect(rule).toHaveLength(1);
    expect(rule[0]).toMatchObject({ kind: "reminder", action: "rule-updated", actor: { id: null }, detail: "Fields changed: enabled; revision 2" });
  });

  it("does not leak a row into another entity kind's timeline", async () => {
    expect(await find(`customer:${staffEntity}`)).toHaveLength(0);
    expect(await find(`staff:${customerEntity}`)).toHaveLength(0);
  });
});
