import type { PoolClient } from "pg";
import { pool } from "../../infrastructure/database/db";
import { canAccessBranch, hasCapability, isGarageRole, sanitizeOverrides, type Capability, type GarageActor } from "./authz";
import { isDemoAccountId } from "./demo-auth";

type Queryable = Pick<PoolClient, "query">;

/** Loads the persisted, active staff membership as an actor so capability checks honour per-user overrides. */
export async function loadStaffActor(userId: string, client: Queryable = pool): Promise<GarageActor | null> {
  const result = await client.query<{ clerk_user_id: string; email: string; full_name: string; role: string; branch_ids: string[]; permissions: unknown }>(
    "SELECT clerk_user_id, email, full_name, role, branch_ids, permissions FROM staff_memberships WHERE clerk_user_id = $1 AND status = 'active'",
    [userId],
  );
  const row = result.rows[0];
  if (!row || !isGarageRole(row.role)) return null;
  const isDemo = isDemoAccountId(row.clerk_user_id);
  return {
    userId: row.clerk_user_id,
    email: row.email,
    name: row.full_name || row.email,
    role: row.role,
    branchIds: row.branch_ids ?? [],
    isDemo,
    permissions: isDemo ? undefined : sanitizeOverrides(row.role, row.permissions),
  };
}

/** True when the persisted staff member holds `capability` and may act on `branchId`. */
export async function staffHasCapabilityForBranch(client: Queryable, userId: string, capability: Capability, branchId: string): Promise<boolean> {
  const staff = await loadStaffActor(userId, client);
  return !!staff && hasCapability(staff, capability) && canAccessBranch(staff, branchId);
}
