import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { withTransaction, pool } from "../../infrastructure/database/db";
import { isGarageRole, sanitizeOverrides, type CapabilityOverrides, type GarageActor, type GarageRole } from "./authz";
import { findDemoActor, hasActiveRealOwner } from "./demo-auth";
import { normalizeEmail } from "./membership-match";

export interface RequestWithActor extends Request {
  actor?: GarageActor;
  clerkUserId?: string;
}

interface MembershipRow {
  clerk_user_id: string;
  email: string;
  full_name: string;
  role: GarageRole;
  branch_ids: string[];
  status: "active" | "inactive" | "invited";
  permissions: CapabilityOverrides | null;
}

async function findMembership(userId: string): Promise<MembershipRow | undefined> {
  const result = await pool.query<MembershipRow>(
    `SELECT clerk_user_id, email, full_name, role, branch_ids, status, permissions
     FROM staff_memberships WHERE clerk_user_id = $1`,
    [userId],
  );
  return result.rows[0];
}

async function provisionFromVerifiedIdentity(userId: string): Promise<MembershipRow | undefined> {
  const user = await clerkClient.users.getUser(userId);
  const primaryEmail = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId);
  const email = primaryEmail?.emailAddress;
  if (!email || primaryEmail?.verification?.status !== "verified") return undefined;
  const normalizedEmail = normalizeEmail(email);
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");

  const bootstrapEmail = process.env.OWNER_BOOTSTRAP_EMAIL;
  if (bootstrapEmail && normalizeEmail(bootstrapEmail) === normalizedEmail) {
    await withTransaction(async (client) => {
      const bootstrap = await client.query<{ owner_claimed: boolean }>(
        "SELECT owner_claimed FROM owner_bootstrap WHERE singleton = true FOR UPDATE",
      );
      const activeOwners = await client.query<{ clerk_user_id: string }>(
        "SELECT clerk_user_id FROM staff_memberships WHERE role = 'owner' AND status = 'active'",
      );
      if (bootstrap.rows[0]?.owner_claimed || hasActiveRealOwner(activeOwners.rows.map((row) => row.clerk_user_id))) return;
      await client.query(
        `INSERT INTO staff_memberships
           (clerk_user_id, email, full_name, role, branch_ids, status)
         VALUES ($1, $2, $3, 'owner', '{}', 'active')
         ON CONFLICT (clerk_user_id) DO NOTHING`,
        [userId, email, fullName],
      );
      await client.query(
        "UPDATE owner_bootstrap SET owner_claimed = true, updated_at = now() WHERE singleton = true",
      );
    });
    return findMembership(userId);
  }

  // Invite-only: the verified email must match an owner pre-approved row
  // (status 'invited'). Claiming binds the Clerk user id to that row; role and
  // branches come only from the row, never from client or Clerk metadata.
  const claimed = await pool.query<{ clerk_user_id: string }>(
    `UPDATE staff_memberships
        SET clerk_user_id = $1,
            full_name = CASE WHEN $3 <> '' THEN $3 ELSE full_name END,
            status = 'active',
            updated_at = now()
      WHERE status = 'invited' AND role <> 'owner' AND lower(email) = $2
        AND NOT EXISTS (SELECT 1 FROM staff_memberships WHERE lower(email) = $2 AND status = 'active')
      RETURNING clerk_user_id`,
    [userId, normalizedEmail, fullName],
  );
  if (!claimed.rowCount) return undefined;
  return findMembership(userId);
}

function toActor(row: MembershipRow): GarageActor | undefined {
  if (row.status !== "active" || !isGarageRole(row.role)) return undefined;
  return {
    userId: row.clerk_user_id,
    email: row.email,
    name: row.full_name || row.email,
    role: row.role,
    branchIds: row.branch_ids ?? [],
    permissions: sanitizeOverrides(row.role, row.permissions),
  };
}

export async function requireMembership(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      const demoActor = await findDemoActor(req);
      if (!demoActor) {
        res.status(401).json({ code: "SIGN_IN_REQUIRED", message: "Sign in to continue." });
        return;
      }
      const request = req as RequestWithActor;
      request.actor = demoActor;
      next();
      return;
    }

    let membership = await findMembership(userId);
    if (!membership) membership = await provisionFromVerifiedIdentity(userId);
    const actor = membership && toActor(membership);
    if (!actor) {
      res.status(403).json({
        code: "ACCESS_PENDING",
        message: "This Google account is not approved for Garage OS. Ask the owner to add your work email, then sign in again.",
      });
      return;
    }

    const request = req as RequestWithActor;
    request.actor = actor;
    request.clerkUserId = userId;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRoles(...roles: GarageRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const actor = (req as RequestWithActor).actor;
    if (!actor) {
      res.status(401).json({ code: "SIGN_IN_REQUIRED", message: "Sign in to continue." });
      return;
    }
    if (!roles.includes(actor.role)) {
      res.status(403).json({ code: "ROLE_FORBIDDEN", message: "This action is not available to your role." });
      return;
    }
    next();
  };
}

export function actorFor(req: Request) {
  return (req as RequestWithActor).actor;
}
