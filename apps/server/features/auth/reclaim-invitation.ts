import { recordStaffCustomerAudit } from "../audit/audit-writer";
export interface QueryRunner {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
}

/**
 * P2T-022: a removed member keeps an inactive row under their verified identity, and that identity is the primary key,
 * so a fresh invitation cannot simply be re-keyed onto it. Claiming folds the new invitation's role, branches and
 * capabilities into the existing identity row (history stays attached, stale rights are replaced, never merged) and
 * deletes the consumed invitation row. Runs inside the caller's transaction; returns true when a claim happened.
 */
export async function reclaimInvitation(client: QueryRunner, userId: string, normalizedEmail: string, fullName: string): Promise<boolean> {
  const inactive = await client.query("SELECT clerk_user_id FROM staff_memberships WHERE clerk_user_id = $1 AND status = 'inactive' FOR UPDATE", [userId]);
  if (!inactive.rowCount) return false;
  const invited = await client.query(
    `SELECT clerk_user_id, role, branch_ids, permissions FROM staff_memberships
      WHERE status = 'invited' AND role <> 'owner' AND lower(email) = $1
        AND NOT EXISTS (SELECT 1 FROM staff_memberships active WHERE lower(active.email) = $1 AND active.status = 'active')
      FOR UPDATE`, [normalizedEmail]);
  const invitation = invited.rows[0];
  if (!invitation) return false;
  await client.query("DELETE FROM staff_memberships WHERE clerk_user_id = $1 AND status = 'invited'", [invitation.clerk_user_id]);
  await client.query(
    `UPDATE staff_memberships
        SET role = $2, branch_ids = $3, permissions = $4, email = $5,
            full_name = CASE WHEN $6 <> '' THEN $6 ELSE full_name END,
            status = 'active', updated_at = now()
      WHERE clerk_user_id = $1 AND status = 'inactive'`,
    [userId, invitation.role, invitation.branch_ids, invitation.permissions, normalizedEmail, fullName]);
  await recordStaffCustomerAudit(client, { entityKind: "staff", entityId: userId, action: "claimed-invitation", summary: `Invitation claimed as ${String(invitation.role)}`, actorUserId: userId });
  return true;
}

/**
 * P2T-008: the first-time claim of an invited row by a verified identity. The claim UPDATE and its audit row share the caller's
 * transaction, so an audit failure rolls the claim back. Role and branches come only from the invitation row.
 */
export async function claimInvitationInTransaction(client: QueryRunner, userId: string, normalizedEmail: string, fullName: string): Promise<boolean> {
  const claimed = await client.query(
    `UPDATE staff_memberships
        SET clerk_user_id = $1,
            full_name = CASE WHEN $3 <> '' THEN $3 ELSE full_name END,
            status = 'active',
            updated_at = now()
      WHERE status = 'invited' AND role <> 'owner' AND lower(email) = $2
        AND NOT EXISTS (SELECT 1 FROM staff_memberships WHERE lower(email) = $2 AND status = 'active')
      RETURNING clerk_user_id, role`,
    [userId, normalizedEmail, fullName],
  );
  if (!claimed.rowCount) return false;
  await recordStaffCustomerAudit(client, { entityKind: "staff", entityId: userId, action: "claimed-invitation", summary: `Invitation claimed as ${String(claimed.rows[0]?.role)}`, actorUserId: userId });
  return true;
}
