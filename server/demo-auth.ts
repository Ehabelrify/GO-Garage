import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { pool } from "./db";
import type { GarageActor, GarageRole } from "./authz";

export interface DemoAccount {
  id: string;
  email: string;
  name: string;
  role: GarageRole;
}

const demoAccounts: DemoAccount[] = [
  { id: "demo-owner", email: "Owner@noemail.com", name: "Demo Owner", role: "owner" },
  { id: "demo-manager", email: "Manager@noemail.com", name: "Demo Branch Manager", role: "branch-manager" },
  { id: "demo-reception", email: "Reception@noemail.com", name: "Demo Receptionist", role: "receptionist" },
  { id: "demo-technician", email: "Technician@noemail.com", name: "Demo Technician", role: "technician" },
];

const cookieName = "garage_os_demo";
const sessionLifetimeSeconds = 60 * 60 * 8;
const sessionLifetimeMs = sessionLifetimeSeconds * 1000;

export class DemoAuthError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function isDemoAuthEnabled() {
  return process.env.NODE_ENV !== "production" &&
    process.env.GARAGE_DEMO_AUTH_ENABLED === "true" &&
    Boolean(process.env.SESSION_SECRET);
}

export function listDemoAccounts() {
  return demoAccounts.map((account) => ({ ...account }));
}

export function isDemoAccountId(userId: string) {
  return demoAccounts.some((account) => account.id === userId);
}

export function hasActiveRealOwner(userIds: string[]) {
  return userIds.some((userId) => !isDemoAccountId(userId));
}

function accountById(id: string) {
  return demoAccounts.find((account) => account.id === id);
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new DemoAuthError("DEMO_AUTH_UNAVAILABLE", "Development demo access is not configured.");
  return secret;
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createDemoSessionToken(accountId: string, expiresAt: number, secret = process.env.SESSION_SECRET) {
  if (!accountById(accountId) || !secret) throw new DemoAuthError("DEMO_AUTH_UNAVAILABLE", "Development demo access is not configured.");
  const payload = `${accountId}.${expiresAt}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyDemoSessionToken(token: string, now = Date.now(), secret = process.env.SESSION_SECRET) {
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [accountId, expiryText, suppliedSignature] = parts;
  const account = accountById(accountId);
  const expiresAt = Number(expiryText);
  if (!account || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + sessionLifetimeMs + 60_000) return null;

  const expected = Buffer.from(signature(`${accountId}.${expiryText}`, secret), "base64url");
  const supplied = Buffer.from(suppliedSignature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  return account;
}

function readCookie(req: Request) {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === cookieName) return rest.join("=");
  }
  return "";
}

export function writeDemoSessionCookie(req: Request, res: Response, accountId: string) {
  const expiresAt = Date.now() + sessionLifetimeMs;
  const token = createDemoSessionToken(accountId, expiresAt, sessionSecret());
  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0].trim();
  const secure = req.secure || forwardedProtocol === "https";
  res.setHeader(
    "Set-Cookie",
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetimeSeconds}${secure ? "; Secure" : ""}`,
  );
}

export function clearDemoSessionCookie(req: Request, res: Response) {
  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0].trim();
  const secure = req.secure || forwardedProtocol === "https";
  res.setHeader(
    "Set-Cookie",
    `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? "; Secure" : ""}`,
  );
}

function actorFromRow(row: {
  clerk_user_id: string;
  email: string;
  full_name: string;
  role: GarageRole;
  branch_ids: string[];
  status: string;
}): GarageActor | null {
  if (row.status !== "active" || !accountById(row.clerk_user_id)) return null;
  return {
    userId: row.clerk_user_id,
    email: row.email,
    name: row.full_name || row.email,
    role: row.role,
    branchIds: row.branch_ids ?? [],
    isDemo: true,
  };
}

export async function findDemoActor(req: Request): Promise<GarageActor | null> {
  if (!isDemoAuthEnabled()) return null;
  const account = verifyDemoSessionToken(readCookie(req));
  if (!account) return null;
  const result = await pool.query<{
    clerk_user_id: string;
    email: string;
    full_name: string;
    role: GarageRole;
    branch_ids: string[];
    status: string;
  }>(
    `SELECT clerk_user_id, email, full_name, role, branch_ids, status
     FROM staff_memberships WHERE clerk_user_id = $1`,
    [account.id],
  );
  const row = result.rows[0];
  if (!row || row.role !== account.role || row.email.toLowerCase() !== account.email.toLowerCase()) return null;
  return actorFromRow(row);
}

export async function provisionDemoActor(accountId: string): Promise<GarageActor> {
  if (!isDemoAuthEnabled()) throw new DemoAuthError("DEMO_AUTH_UNAVAILABLE", "Development demo access is not enabled.");
  const account = accountById(accountId);
  if (!account) throw new DemoAuthError("INVALID_DEMO_ACCOUNT", "Choose one of the available demo accounts.");

  const branches = await pool.query<{ id: string }>("SELECT id FROM branches ORDER BY id");
  if (account.role !== "owner" && !branches.rows.length) {
    throw new DemoAuthError("DEMO_BRANCH_UNAVAILABLE", "No branch is configured for the demo account yet.");
  }
  const accountsToEnsure = account.role === "owner" && branches.rows.length ? demoAccounts : [account];
  let selectedActor: GarageActor | null = null;
  for (const demoAccount of accountsToEnsure) {
    const branchIds = demoAccount.role === "owner" ? [] : [branches.rows[0].id];
    await pool.query(
      `INSERT INTO staff_memberships
         (clerk_user_id, email, full_name, role, branch_ids, status)
       VALUES ($1, $2, $3, $4, $5::text[], 'active')
       ON CONFLICT (clerk_user_id) DO NOTHING`,
      [demoAccount.id, demoAccount.email, demoAccount.name, demoAccount.role, branchIds],
    );

    const result = await pool.query<{
      clerk_user_id: string;
      email: string;
      full_name: string;
      role: GarageRole;
      branch_ids: string[];
      status: string;
    }>(
      `SELECT clerk_user_id, email, full_name, role, branch_ids, status
       FROM staff_memberships WHERE clerk_user_id = $1`,
      [demoAccount.id],
    );
    const row = result.rows[0];
    if (!row || row.role !== demoAccount.role || row.email.toLowerCase() !== demoAccount.email.toLowerCase()) {
      throw new DemoAuthError("DEMO_ACCOUNT_CONFLICT", "A demo identity conflicts with an existing development membership.");
    }
    if (demoAccount.id === account.id) {
      if (row.status !== "active") throw new DemoAuthError("DEMO_ACCOUNT_DISABLED", "This demo account has been disabled.");
      selectedActor = actorFromRow(row);
    }
  }
  if (!selectedActor) throw new DemoAuthError("DEMO_ACCOUNT_UNAVAILABLE", "This demo account is unavailable.");
  return selectedActor;
}
