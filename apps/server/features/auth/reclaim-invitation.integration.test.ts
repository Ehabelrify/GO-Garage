import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * P2T-022: a removed (inactive) member who is re-invited gets only the new role, branches and capabilities, and the
 * invitation row is consumed. Runs only against the disposable CI database (GARAGE_TEST_DATABASE_URL); otherwise skipped.
 * The staff audit rows written by the claim are append-only and stay behind (they carry this run's unique ids).
 */
const testDatabaseUrl = process.env.GARAGE_TEST_DATABASE_URL;
const originalDatabaseUrl = process.env.DATABASE_URL;
const integration = testDatabaseUrl ? describe : describe.skip;
const suffix = crypto.randomUUID();
const userId = `it-reclaim-user-${suffix}`;
const email = `it-reclaim-${suffix}@example.test`;
const lonelyUserId = `it-reclaim-lonely-${suffix}`;
const lonelyEmail = `it-reclaim-lonely-${suffix}@example.test`;
const invitationId = `invited:${suffix}`;

integration("reclaimInvitation folds a fresh invitation into a removed member", () => {
  let db: typeof import("../../infrastructure/database/db");
  let reclaim: typeof import("./reclaim-invitation").reclaimInvitation;
  const staffRow = async (id: string) =>
    (await db.pool.query<{ role: string; branch_ids: string[]; permissions: Record<string, boolean>; status: string; email: string; full_name: string }>(
      "SELECT role, branch_ids, permissions, status, email, full_name FROM staff_memberships WHERE clerk_user_id = $1", [id])).rows[0];

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("GARAGE_TEST_DATABASE_URL is required for database integration tests.");
    process.env.DATABASE_URL = testDatabaseUrl;
    db = await import("../../infrastructure/database/db");
    reclaim = (await import("./reclaim-invitation")).reclaimInvitation;
    await db.pool.query(
      `INSERT INTO staff_memberships (clerk_user_id, email, full_name, role, branch_ids, permissions, status)
       VALUES ($1, $2, 'Removed Member', 'technician', ARRAY['old-branch-a','old-branch-b']::text[], '{"invoices.manage": true}'::jsonb, 'inactive'),
              ($3, $4, 'Lonely Removed', 'technician', ARRAY['old-branch-a']::text[], '{}'::jsonb, 'inactive')`,
      [userId, email, lonelyUserId, lonelyEmail]);
    await db.pool.query(
      `INSERT INTO staff_memberships (clerk_user_id, email, full_name, role, branch_ids, permissions, status)
       VALUES ($1, $2, 'Invited Again', 'receptionist', ARRAY['new-branch']::text[], '{"warranty.view": false}'::jsonb, 'invited')`,
      [invitationId, email]);
  });

  afterAll(async () => {
    try {
      if (!db) return;
      await db.pool.query("DELETE FROM staff_memberships WHERE clerk_user_id = ANY($1::text[])", [[userId, lonelyUserId, invitationId]]);
      await db.pool.end();
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("does nothing for a removed member who has no invitation", async () => {
    expect(await db.withTransaction((client) => reclaim(client, lonelyUserId, lonelyEmail, ""))).toBe(false);
    expect(await staffRow(lonelyUserId)).toMatchObject({ status: "inactive", role: "technician", branch_ids: ["old-branch-a"] });
  });

  it("replaces role, branches and capabilities (never merges) and consumes the invitation row", async () => {
    expect(await db.withTransaction((client) => reclaim(client, userId, email, "Re-Invited Name"))).toBe(true);
    const row = await staffRow(userId);
    expect(row).toMatchObject({ status: "active", role: "receptionist", branch_ids: ["new-branch"], permissions: { "warranty.view": false }, email, full_name: "Re-Invited Name" });
    expect(row.permissions).not.toHaveProperty("invoices.manage");
    expect(await staffRow(invitationId)).toBeUndefined();
    const invited = await db.pool.query("SELECT 1 FROM staff_memberships WHERE lower(email) = $1 AND status = 'invited'", [email]);
    expect(invited.rowCount).toBe(0);
    const audit = await db.pool.query("SELECT action FROM staff_customer_audit_events WHERE entity_kind = 'staff' AND entity_id = $1", [userId]);
    expect(audit.rows).toEqual([{ action: "claimed-invitation" }]);
  });

  it("is a no-op the second time (the invitation is gone and the member is active)", async () => {
    expect(await db.withTransaction((client) => reclaim(client, userId, email, ""))).toBe(false);
    expect(await staffRow(userId)).toMatchObject({ status: "active", role: "receptionist", branch_ids: ["new-branch"] });
  });
});
