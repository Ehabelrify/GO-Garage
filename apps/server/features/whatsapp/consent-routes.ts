import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { hasCapability } from "../auth/authz";
import { canActorAccessInboxBranch } from "./inbox-access";
import { pool, withTransaction } from "../../infrastructure/database/db";

export const customerConsentRouter = Router();

const consentQuery = z.object({
  channelId: z.string().trim().min(1),
  customerId: z.string().trim().min(1),
  purpose: z.enum(["service", "marketing"]),
}).strict();

const consentUpdate = z.object({
  channelId: z.string().trim().min(1),
  customerId: z.string().trim().min(1),
  purpose: z.enum(["service", "marketing"]),
  action: z.enum(["grant", "revoke"]),
  evidenceRef: z.string().regex(/^private:[A-Za-z0-9/_-]+$/).optional(),
  expiresAt: z.string().datetime().optional(),
  reason: z.enum(["customer-requested", "policy-expired", "other"]).optional(),
}).strict().superRefine((input, context) => {
  if (input.action === "grant" && !input.evidenceRef) {
    context.addIssue({ code: "custom", path: ["evidenceRef"], message: "Protected consent evidence is required." });
  }
  if (input.action === "revoke" && !input.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Record why consent was revoked." });
  }
});

async function authorizedContact(
  actor: NonNullable<ReturnType<typeof actorFor>>,
  channelId: string,
  customerId: string,
) {
  if (actor.isDemo) return null;
  const links = await pool.query<{ branch_id: string }>(
    `SELECT branch_id FROM messaging_contact_links
     WHERE channel_id=$1 AND customer_id=$2`,
    [channelId, customerId],
  );
  for (const link of links.rows) {
    if (await canActorAccessInboxBranch(actor, link.branch_id)) return link.branch_id;
  }
  return null;
}

customerConsentRouter.get("/", async (req, res, next) => {
  try {
    const actor = actorFor(req);
    if (!actor) return res.status(401).json({ code: "SIGN_IN_REQUIRED" });
    const parsed = consentQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ code: "INVALID_CONSENT_QUERY" });
    // 404 only for an unknown channel/customer or a contact the actor cannot reach.
    // A known customer with no consent record yet is a normal state: {status:"missing"}.
    const known = await pool.query(
      `SELECT (SELECT count(*) FROM messaging_channels WHERE id=$1) AS channels,
              (SELECT count(*) FROM customers WHERE id=$2) AS customers`,
      [parsed.data.channelId, parsed.data.customerId],
    );
    // The simulation channel may simply not be seeded yet; that is not an unknown channel for a known customer.
    const channelKnown = Number(known.rows[0]?.channels) > 0 || parsed.data.channelId === "whatsapp-simulation";
    if (!channelKnown || !Number(known.rows[0]?.customers)) {
      return res.status(404).json({ code: "CONSENT_NOT_FOUND" });
    }
    if (!hasCapability(actor, "whatsapp.use")) return res.status(404).json({ code: "CONSENT_NOT_FOUND" });
    if (actor.isDemo) return res.json({ consent: { status: "missing", revision: 0 } });
    const links = await pool.query<{ branch_id: string }>(
      "SELECT branch_id FROM messaging_contact_links WHERE channel_id=$1 AND customer_id=$2",
      [parsed.data.channelId, parsed.data.customerId],
    );
    if (links.rows.length) {
      let reachable = false;
      for (const link of links.rows) {
        if (await canActorAccessInboxBranch(actor, link.branch_id)) { reachable = true; break; }
      }
      if (!reachable) return res.status(404).json({ code: "CONSENT_NOT_FOUND" });
    } else {
      return res.json({ consent: { status: "missing", revision: 0 } });
    }
    const result = await pool.query<{
      status: "granted" | "revoked";
      consented_at: Date;
      expires_at: Date | null;
      revoked_at: Date | null;
      revision: number;
    }>(
      `SELECT status,consented_at,expires_at,revoked_at,revision
       FROM messaging_customer_consents
       WHERE channel_id=$1 AND customer_id=$2 AND purpose=$3`,
      [parsed.data.channelId, parsed.data.customerId, parsed.data.purpose],
    );
    const row = result.rows[0];
    return res.json({
      consent: row
        ? {
            status: row.status,
            consentedAt: row.consented_at,
            expiresAt: row.expires_at,
            revokedAt: row.revoked_at,
            revision: row.revision,
          }
        : { status: "missing", revision: 0 },
    });
  } catch (error) {
    next(error);
  }
});

customerConsentRouter.put("/", async (req, res, next) => {
  try {
    const actor = actorFor(req);
    if (!actor) return res.status(401).json({ code: "SIGN_IN_REQUIRED" });
    if (!hasCapability(actor, "whatsapp.use")) {
      return res.status(403).json({ code: "ROLE_FORBIDDEN" });
    }
    const parsed = consentUpdate.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: "INVALID_CONSENT_UPDATE" });
    const input = parsed.data;
    const branchId = await authorizedContact(actor, input.channelId, input.customerId);
    if (!branchId) return res.status(404).json({ code: "CONTACT_NOT_FOUND" });
    if (input.expiresAt && new Date(input.expiresAt) <= new Date()) {
      return res.status(400).json({ code: "CONSENT_EXPIRY_INVALID" });
    }

    const consent = await withTransaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        [`messaging-consent:${input.channelId}:${input.customerId}:${input.purpose}`],
      );
      const link = await client.query(
        `SELECT 1 FROM messaging_contact_links
         WHERE channel_id=$1 AND customer_id=$2 AND branch_id=$3 FOR SHARE`,
        [input.channelId, input.customerId, branchId],
      );
      if (!link.rowCount) throw Object.assign(new Error("The approved contact link changed."), { status: 404 });
      const current = await client.query<{ status: "granted" | "revoked"; revision: number }>(
        `SELECT status,revision FROM messaging_customer_consents
         WHERE channel_id=$1 AND customer_id=$2 AND purpose=$3 FOR UPDATE`,
        [input.channelId, input.customerId, input.purpose],
      );
      const prior = current.rows[0];
      if (input.action === "revoke" && (!prior || prior.status !== "granted")) {
        throw Object.assign(new Error("An active consent record was not found."), { status: 409 });
      }
      const revision = (prior?.revision ?? 0) + 1;
      if (input.action === "grant") {
        await client.query(
          `INSERT INTO messaging_customer_consents
             (channel_id,customer_id,purpose,status,evidence_ref,consented_at,expires_at,consented_by,revision)
           VALUES($1,$2,$3,'granted',$4,now(),$5,$6,$7)
           ON CONFLICT(channel_id,customer_id,purpose) DO UPDATE SET
             status='granted',evidence_ref=excluded.evidence_ref,consented_at=now(),
             expires_at=excluded.expires_at,consented_by=excluded.consented_by,
             revoked_at=NULL,revoked_by=NULL,revision=excluded.revision`,
          [input.channelId, input.customerId, input.purpose, input.evidenceRef, input.expiresAt ?? null, actor.userId, revision],
        );
      } else {
        await client.query(
          `UPDATE messaging_customer_consents
           SET status='revoked',revoked_at=now(),revoked_by=$4,revision=$5
           WHERE channel_id=$1 AND customer_id=$2 AND purpose=$3`,
          [input.channelId, input.customerId, input.purpose, actor.userId, revision],
        );
      }
      await client.query(
        `INSERT INTO messaging_customer_consent_events
           (id,channel_id,customer_id,purpose,revision,action,evidence_ref,reason,actor_user_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          `consent-event-${randomUUID()}`,
          input.channelId,
          input.customerId,
          input.purpose,
          revision,
          input.action === "grant" ? "granted" : "revoked",
          input.evidenceRef ?? null,
          input.reason ?? null,
          actor.userId,
        ],
      );
      return { status: input.action === "grant" ? "granted" : "revoked", revision };
    });
    return res.json({ consent });
  } catch (error) {
    const value = error as Error & { status?: number };
    if (value.status) return res.status(value.status).json({ code: "CONSENT_UPDATE_REJECTED", message: value.message });
    next(error);
  }
});
