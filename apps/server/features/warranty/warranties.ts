import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { PoolClient } from "pg";
import { z } from "zod";
import { completeLifetimeDefinition, type Configured, type LifetimeDefinition } from "@garage/domain";
import type { WarrantyClaimStatus } from "@garage/domain";
import {
  canIssueWarranty,
  canManageWarrantyPolicies,
  canOpenWarrantyClaim,
  canReviewWarrantyClaim,
  canVoidWarranty,
  canViewWarrantyRecords,
  type GarageActor,
} from "../auth/authz";
import { actorFor } from "../auth/auth";
import { pool, withTransaction } from "../../infrastructure/database/db";
import {
  identifyClaimEvidence,
  MAX_CLAIM_EVIDENCE_BYTES,
  MAX_CLAIM_EVIDENCE_PER_CLAIM,
  safeClaimEvidenceFileName,
} from "./claim-evidence";
import { isPrivateStorageConfigured, privateStorageClient } from "../../infrastructure/storage/private-storage";
import { canAttachEvidenceToClaim, isWarrantyExpired } from "./warranty-rules";
import {
  buildPublicWarrantyVerification,
  canEnableWarrantyVerification,
  deriveWarrantyVerificationToken,
  hashWarrantyVerificationToken,
  warrantyQrSecret,
  isWarrantyVerificationTokenFormat,
  normalizeWarrantyVerificationFields,
} from "./warranty-verification";
import { ensureWarrantyInvoiceDraft, invoiceCurrencyProblem } from "./warranty-invoices";
import { issueCoverageInTransaction, retirePolicyVersion, duplicatePolicyDraft, WarrantyIssuanceError } from "./issuance-service";
import { commercialContext } from "../commercial/policy-service";

export const warrantyRouter = Router();
export const publicWarrantyVerificationRouter = Router();

const policyBodySchema = z.object({
  policyId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  eligibleServiceIds: z.array(z.string().trim().min(1)).min(1).max(30),
  autoIssue: z.boolean().default(false),
  startRule: z.enum(["job-delivery", "owner-selected-date"]),
  coverageKind: z.enum(["fixed", "lifetime"]).default("fixed"),
  durationMonths: z.number().int().min(1).max(120).nullable(),
  lifetimeDefinition: z.any().nullable().optional(),
  exclusions: z.string().trim().min(1).max(4000),
  evidenceRequirements: z.string().trim().min(1).max(4000),
  reviewRole: z.enum(["owner", "branch-manager"]),
  responseDays: z.number().int().min(1).max(365),
}).superRefine((policy, context) => {
  if (policy.coverageKind === "fixed" && policy.durationMonths === null) context.addIssue({ code: "custom", path: ["durationMonths"], message: "Fixed coverage needs a duration." });
  if (policy.coverageKind === "lifetime" && policy.durationMonths !== null) context.addIssue({ code: "custom", path: ["durationMonths"], message: "Lifetime coverage has no month duration." });
  if (policy.coverageKind === "lifetime" && policy.lifetimeDefinition != null &&
      !["approved", "unconfigured"].includes(policy.lifetimeDefinition.state)) {
    context.addIssue({ code: "custom", path: ["lifetimeDefinition"], message: "Complete approved bilingual lifetime terms are required." });
  }
  if (policy.autoIssue && policy.startRule !== "job-delivery") {
    context.addIssue({
      code: "custom",
      path: ["startRule"],
      message: "Automatic coverage must start on the recorded job delivery date.",
    });
  }
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const verificationFieldSchema = z.enum(["service", "status", "startDate", "expiresOn", "branch", "coverage"]);
const invoiceDraftInputSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  items: z.array(z.object({
    description: z.string().trim().min(1).max(240),
    quantity: z.number().min(0.01).max(10000),
    unitAmount: z.number().min(0).max(1_000_000_000).nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  })).min(1).max(50),
  taxRatePercent: z.number().min(0).max(100).nullable(),
  paidAmount: z.number().min(0).max(1_000_000_000),
  paymentMethod: z.enum(["cash", "card", "transfer", "other"]).nullable(),
  notes: z.string().max(1000),
});

function makeId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function actor(req: Request): GarageActor {
  const currentActor = actorFor(req);
  if (!currentActor) throw new Error("A Garage OS membership is required.");
  return currentActor;
}

function routeError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ code, message });
}

async function validateServices(serviceIds: string[]) {
  const uniqueIds = [...new Set(serviceIds)];
  if (uniqueIds.length !== serviceIds.length) return false;
  const rows = await pool.query<{ id: string }>(
    "SELECT id FROM services WHERE id = ANY($1::text[]) AND active = true",
    [uniqueIds],
  );
  return rows.rowCount === uniqueIds.length;
}

async function addAuditEvent(
  client: PoolClient,
  event: {
    actorUserId: string;
    action: string;
    details?: string;
    policyId?: string;
    policyVersion?: number;
    warrantyId?: string;
    claimId?: string;
  },
) {
  await client.query(
    `INSERT INTO warranty_audit_events
       (id, policy_id, policy_version, warranty_id, claim_id, action, details, actor_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      makeId("warranty-event"),
      event.policyId ?? null,
      event.policyVersion ?? null,
      event.warrantyId ?? null,
      event.claimId ?? null,
      event.action,
      event.details ?? "",
      event.actorUserId,
    ],
  );
}

function isValidDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function lifetimeSnapshot(input: unknown, policyId: string, version: number, ownerId: string) {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Record<string, unknown>;
  if (candidate.state !== "approved") return { state: "unconfigured", missing: Array.isArray(candidate.missing) ? candidate.missing : [], draftValue: candidate.draftValue ?? null };
  if (!completeLifetimeDefinition(candidate.value)) return null;
  const approval = candidate.approval as Record<string, unknown> | undefined;
  if (typeof approval?.evidenceRef !== "string" || !approval.evidenceRef.trim() || typeof approval.reason !== "string" || !approval.reason.trim()) return null;
  return { state: "approved", value: candidate.value, policy: { id: policyId, version }, approval: {
    approvedBy: ownerId, approvedAt: new Date().toISOString(), evidenceRef: approval.evidenceRef.trim(), reason: approval.reason.trim(),
  } };
}

const claimEvidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CLAIM_EVIDENCE_BYTES, files: 1, fields: 0, parts: 1 },
});

warrantyRouter.get("/evidence/status", (_req, res) => {
  res.json({ available: isPrivateStorageConfigured() });
});

publicWarrantyVerificationRouter.get("/:token", async (req, res) => {
  const token = req.params.token;
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const notVerified = () => routeError(res, 404, "NOT_VERIFIED", "This warranty code could not be verified.");
  if (!isWarrantyVerificationTokenFormat(token)) return notVerified();

  const result = await pool.query<{
    approved_fields: string[];
    record_status: "active" | "void";
    start_date: string;
    expires_on: string | null;
    coverage_kind: "fixed" | "lifetime";
    lifetime_definition: Configured<LifetimeDefinition> | null;
    terminated_on: string | null;
    cairo_today: string;
    service_name_en: string;
    service_name_ar: string;
    branch_name_en: string;
    branch_name_ar: string;
  }>(
    `SELECT settings.approved_fields,
            w.status AS record_status,
            to_char(w.start_date, 'YYYY-MM-DD') AS start_date,
            to_char(w.expires_on, 'YYYY-MM-DD') AS expires_on,
            w.coverage_kind, w.lifetime_definition, w.terminated_on::text,
            to_char((now() AT TIME ZONE 'Africa/Cairo')::date, 'YYYY-MM-DD') AS cairo_today,
            s.name_en AS service_name_en, s.name_ar AS service_name_ar,
            b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
     FROM warranty_verification_tokens token
     JOIN warranty_verification_settings settings
       ON settings.singleton = true AND settings.enabled = true
     JOIN warranties w ON w.id = token.warranty_id
     JOIN services s ON s.id = w.service_id
     JOIN branches b ON b.id = w.branch_id
     WHERE token.token_hash = $1 AND token.revoked_at IS NULL
     LIMIT 1`,
    [hashWarrantyVerificationToken(token)],
  );
  if (!result.rowCount) return notVerified();

  const row = result.rows[0];
  const approvedFields = normalizeWarrantyVerificationFields(row.approved_fields);
  const details = buildPublicWarrantyVerification({
    recordStatus: row.record_status,
    startDate: row.start_date,
    expiresOn: row.expires_on,
    coverageKind: row.coverage_kind,
    publicWording: row.coverage_kind === "lifetime" ? row.lifetime_definition?.state === "approved" ? row.lifetime_definition.value.publicWording : undefined : undefined,
    terminatedOn: row.terminated_on,
    cairoToday: row.cairo_today,
    serviceNameEn: row.service_name_en,
    serviceNameAr: row.service_name_ar,
    branchNameEn: row.branch_name_en,
    branchNameAr: row.branch_name_ar,
  }, approvedFields);
  res.json(details);
});

warrantyRouter.put("/verification-settings", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageWarrantyPolicies(currentActor)) return routeError(res, 403, "ROLE_FORBIDDEN", "Only the Owner can approve public verification fields.");
  const parsed = z.object({
    enabled: z.boolean(),
    approvedFields: z.array(verificationFieldSchema).max(6),
    approvedTerms: z.literal(true),
  }).safeParse(req.body);
  if (!parsed.success) return routeError(res, 400, "INVALID_VERIFICATION_SETTINGS", "Choose valid customer-facing fields and confirm the public display.");
  const approvedFields = [...new Set(parsed.data.approvedFields)];
  if (parsed.data.enabled && !canEnableWarrantyVerification(approvedFields)) {
    return routeError(res, 400, "VERIFICATION_FIELDS_REQUIRED", "Select both the covered service and coverage status before enabling public verification.");
  }

  const result = await withTransaction(async (client) => {
    const current = await client.query<{ enabled: boolean }>(
      "SELECT enabled FROM warranty_verification_settings WHERE singleton = true FOR UPDATE",
    );
    if (!current.rowCount) return "missing" as const;
    await client.query(
      `UPDATE warranty_verification_settings
       SET enabled = $1, approved_fields = $2::text[], updated_by = $3, updated_at = now()
       WHERE singleton = true`,
      [parsed.data.enabled, approvedFields, currentActor.userId],
    );
    const action = current.rows[0].enabled === parsed.data.enabled
      ? "fields-updated"
      : parsed.data.enabled ? "enabled" : "disabled";
    await client.query(
      `INSERT INTO warranty_verification_settings_audit
         (id, action, enabled, approved_fields, actor_user_id)
       VALUES ($1, $2, $3, $4::text[], $5)`,
      [makeId("verification-settings-event"), action, parsed.data.enabled, approvedFields, currentActor.userId],
    );
    return "ok" as const;
  });
  if (result === "missing") return routeError(res, 503, "VERIFICATION_SETTINGS_UNAVAILABLE", "Public verification settings are not initialized.");
  res.json({ ok: true });
});

warrantyRouter.post("/:warrantyId/verification-token", async (req, res) => {
  const currentActor = actor(req);
  const qrSecret = warrantyQrSecret();
  if (!qrSecret) return routeError(res, 503, "QR_SECRET_MISSING", "WARRANTY_QR_SECRET must be configured before QR codes can be created.");
  const tokenId = makeId("verification-token");
  const token = deriveWarrantyVerificationToken(tokenId, qrSecret);
  const tokenHash = hashWarrantyVerificationToken(token);
  const result = await withTransaction(async (client) => {
    const settings = await client.query<{ enabled: boolean; approved_fields: string[] }>(
      "SELECT enabled, approved_fields FROM warranty_verification_settings WHERE singleton = true FOR SHARE",
    );
    if (!settings.rowCount || !settings.rows[0].enabled ||
        !canEnableWarrantyVerification(normalizeWarrantyVerificationFields(settings.rows[0].approved_fields))) {
      return "disabled" as const;
    }
    const record = await client.query<{ branch_id: string; status: string }>(
      "SELECT branch_id, status FROM warranties WHERE id = $1 FOR UPDATE",
      [req.params.warrantyId],
    );
    if (!record.rowCount) return "missing" as const;
    if (!canIssueWarranty(currentActor, record.rows[0].branch_id)) return "forbidden" as const;
    if (record.rows[0].status === "void") return "void" as const;

    const revoked = await client.query<{ id: string }>(
      `UPDATE warranty_verification_tokens
       SET revoked_at = now(), revoked_by = $2
       WHERE warranty_id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [req.params.warrantyId, currentActor.userId],
    );
    await client.query(
      `INSERT INTO warranty_verification_tokens (id, warranty_id, token_hash, created_by)
       VALUES ($1, $2, $3, $4)`,
      [tokenId, req.params.warrantyId, tokenHash, currentActor.userId],
    );
    if (revoked.rowCount) {
      await client.query(
        `INSERT INTO warranty_qr_print_events
           (id, warranty_id, token_id, action, actor_user_id)
         VALUES ($1, $2, $3, 'revoked', $4)`,
        [makeId("warranty-qr-event"), req.params.warrantyId, revoked.rows[0].id, currentActor.userId],
      );
    }
    await client.query(
      `INSERT INTO warranty_qr_print_events
         (id, warranty_id, token_id, action, replaces_token_id, actor_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        makeId("warranty-qr-event"),
        req.params.warrantyId,
        tokenId,
        revoked.rowCount ? "replaced" : "prepared",
        revoked.rows[0]?.id ?? null,
        currentActor.userId,
      ],
    );
    await addAuditEvent(client, {
      warrantyId: req.params.warrantyId,
      action: "verification-token-created",
      details: revoked.rowCount ? "A replacement code was created and the previous code revoked." : "A customer verification code was created.",
      actorUserId: currentActor.userId,
    });
    return "ok" as const;
  });
  if (result === "missing") return routeError(res, 404, "WARRANTY_NOT_FOUND", "Warranty record not found.");
  if (result === "forbidden") return routeError(res, 403, "ROLE_FORBIDDEN", "You cannot prepare a QR code outside your assigned branch.");
  if (result === "void") return routeError(res, 409, "WARRANTY_VOID", "A QR code cannot be created for void coverage.");
  if (result === "disabled") return routeError(res, 409, "VERIFICATION_DISABLED", "The Owner must enable public verification and approve its fields first.");
  res.status(201).json({ token });
});

/** Re-displays the active customer QR code so staff can see or reprint it any time. Recomputed from the server secret and checked against the stored hash. */
warrantyRouter.get("/:warrantyId/verification-token", async (req, res) => {
  const currentActor = actor(req);
  const qrSecret = warrantyQrSecret();
  if (!qrSecret) return routeError(res, 503, "QR_SECRET_MISSING", "WARRANTY_QR_SECRET must be configured before QR codes can be shown.");
  const found = await pool.query<{ branch_id: string; status: string; token_id: string | null; token_hash: string | null }>(
    `SELECT w.branch_id, w.status, t.id AS token_id, t.token_hash
       FROM warranties w LEFT JOIN warranty_verification_tokens t ON t.warranty_id = w.id AND t.revoked_at IS NULL
      WHERE w.id = $1`, [req.params.warrantyId]);
  const row = found.rows[0];
  if (!row) return routeError(res, 404, "WARRANTY_NOT_FOUND", "Warranty record not found.");
  if (!canIssueWarranty(currentActor, row.branch_id)) return routeError(res, 403, "ROLE_FORBIDDEN", "You cannot view a QR code outside your assigned branch.");
  if (row.status === "void") return routeError(res, 409, "WARRANTY_VOID", "A QR code cannot be shown for void coverage.");
  if (!row.token_id || !row.token_hash) return routeError(res, 404, "VERIFICATION_TOKEN_NOT_FOUND", "No active QR code exists for this warranty.");
  const token = deriveWarrantyVerificationToken(row.token_id, qrSecret);
  // A code made before codes were derivable (or with another secret) cannot be recomputed: say so instead of showing a wrong QR.
  if (hashWarrantyVerificationToken(token) !== row.token_hash) {
    return routeError(res, 409, "TOKEN_NOT_RECOVERABLE", "This code was created before codes could be re-displayed. Replace it to print a new card.");
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ token });
});

warrantyRouter.post("/:warrantyId/verification-token/print", async (req, res) => {
  const currentActor = actor(req);
  const result = await withTransaction(async (client) => {
    const record = await client.query<{ branch_id: string; status: string }>(
      "SELECT branch_id, status FROM warranties WHERE id = $1 FOR SHARE",
      [req.params.warrantyId],
    );
    if (!record.rowCount) return { error: "missing" as const };
    if (!canViewWarrantyRecords(currentActor, record.rows[0].branch_id)) return { error: "forbidden" as const };
    if (record.rows[0].status === "void") return { error: "void" as const };

    const settings = await client.query<{ enabled: boolean; approved_fields: string[] }>(
      "SELECT enabled, approved_fields FROM warranty_verification_settings WHERE singleton = true FOR SHARE",
    );
    if (!settings.rowCount || !settings.rows[0].enabled ||
        !canEnableWarrantyVerification(normalizeWarrantyVerificationFields(settings.rows[0].approved_fields))) {
      return { error: "disabled" as const };
    }
    const token = await client.query<{ id: string }>(
      `SELECT id FROM warranty_verification_tokens
       WHERE warranty_id = $1 AND revoked_at IS NULL
       FOR UPDATE`,
      [req.params.warrantyId],
    );
    if (!token.rowCount) return { error: "token" as const };
    const previousPrints = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM warranty_qr_print_events
       WHERE token_id = $1 AND action IN ('printed', 'reprinted')`,
      [token.rows[0].id],
    );
    const action = Number(previousPrints.rows[0]?.count ?? 0) ? "reprinted" : "printed";
    await client.query(
      `INSERT INTO warranty_qr_print_events (id, warranty_id, token_id, action, actor_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [makeId("warranty-qr-event"), req.params.warrantyId, token.rows[0].id, action, currentActor.userId],
    );
    return { action } as const;
  });
  if ("error" in result) {
    if (result.error === "missing") return routeError(res, 404, "WARRANTY_NOT_FOUND", "Warranty record not found.");
    if (result.error === "forbidden") return routeError(res, 403, "ROLE_FORBIDDEN", "You cannot print a code outside your assigned branch.");
    if (result.error === "void") return routeError(res, 409, "WARRANTY_VOID", "A QR code cannot be printed for void coverage.");
    if (result.error === "disabled") return routeError(res, 409, "VERIFICATION_DISABLED", "Public verification must be enabled by the Owner first.");
    return routeError(res, 409, "VERIFICATION_TOKEN_NOT_FOUND", "Prepare an active QR code before printing.");
  }
  res.json({ ok: true, ...result });
});

warrantyRouter.delete("/:warrantyId/verification-token", async (req, res) => {
  const currentActor = actor(req);
  if (!canVoidWarranty(currentActor)) return routeError(res, 403, "ROLE_FORBIDDEN", "Only the Owner can revoke customer verification codes.");
  const result = await withTransaction(async (client) => {
    const record = await client.query<{ id: string }>(
      "SELECT id FROM warranties WHERE id = $1 FOR UPDATE",
      [req.params.warrantyId],
    );
    if (!record.rowCount) return "missing" as const;
    const tokens = await client.query<{ id: string }>(
      `UPDATE warranty_verification_tokens
       SET revoked_at = now(), revoked_by = $2
       WHERE warranty_id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [req.params.warrantyId, currentActor.userId],
    );
    if (!tokens.rowCount) return "no-token" as const;
    await client.query(
      `INSERT INTO warranty_qr_print_events (id, warranty_id, token_id, action, actor_user_id)
       VALUES ($1, $2, $3, 'revoked', $4)`,
      [makeId("warranty-qr-event"), req.params.warrantyId, tokens.rows[0].id, currentActor.userId],
    );
    await addAuditEvent(client, {
      warrantyId: req.params.warrantyId,
      action: "verification-token-revoked",
      details: "Owner revoked the customer verification code.",
      actorUserId: currentActor.userId,
    });
    return "ok" as const;
  });
  if (result === "missing") return routeError(res, 404, "WARRANTY_NOT_FOUND", "Warranty record not found.");
  if (result === "no-token") return routeError(res, 404, "VERIFICATION_TOKEN_NOT_FOUND", "No active QR code exists for this warranty.");
  res.json({ ok: true });
});

warrantyRouter.post("/policies", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageWarrantyPolicies(currentActor)) return routeError(res, 403, "ROLE_FORBIDDEN", "Only the Owner can manage warranty policies.");
  const parsed = policyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    if (req.body?.autoIssue === true && req.body?.startRule !== "job-delivery") {
      return routeError(res, 400, "AUTO_ISSUE_REQUIRES_DELIVERY_START", "Automatic coverage must start on the recorded job delivery date.");
    }
    return routeError(res, 400, "INVALID_WARRANTY_POLICY", "Complete all warranty policy fields with valid values.");
  }
  if (!await validateServices(parsed.data.eligibleServiceIds)) {
    return routeError(res, 400, "INVALID_WARRANTY_SERVICE", "Choose active services that exist in Garage OS.");
  }

  const policyId = parsed.data.policyId ?? makeId("warranty-policy");
  const result = await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`warranty-policy:${policyId}`]);
    const latest = await client.query<{ version: number; status: string }>(
      "SELECT version, status FROM warranty_policies WHERE policy_id = $1 ORDER BY version DESC LIMIT 1",
      [policyId],
    );
    if (parsed.data.policyId && !latest.rowCount) return { error: "POLICY_NOT_FOUND" as const };
    if (latest.rows[0]?.status === "draft") return { error: "DRAFT_EXISTS" as const };

    const version = (latest.rows[0]?.version ?? 0) + 1;
    const policy = parsed.data;
    await client.query(
      `INSERT INTO warranty_policies
         (policy_id, version, name, eligible_service_ids, auto_issue, start_rule, duration_months,
          exclusions, evidence_requirements, review_role, response_days, created_by, coverage_kind, lifetime_definition)
       VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)`,
      [
        policyId,
        version,
        policy.name,
        [...new Set(policy.eligibleServiceIds)],
        policy.autoIssue,
        policy.startRule,
        policy.durationMonths,
        policy.exclusions,
        policy.evidenceRequirements,
        policy.reviewRole,
        policy.responseDays,
        currentActor.userId,
        policy.coverageKind,
        policy.coverageKind === "lifetime" ? JSON.stringify(lifetimeSnapshot(policy.lifetimeDefinition, policyId, version, currentActor.userId)) : null,
      ],
    );
    await addAuditEvent(client, {
      policyId,
      policyVersion: version,
      action: "draft-created",
      details: "Owner created a warranty policy draft.",
      actorUserId: currentActor.userId,
    });
    return { version };
  });
  if ("error" in result) {
    if (result.error === "POLICY_NOT_FOUND") return routeError(res, 404, result.error, "The policy version was not found.");
    return routeError(res, 409, "DRAFT_EXISTS", "Finish or publish the current draft before creating another version.");
  }
  res.status(201).json({ ok: true, policyId, version: result.version });
});

warrantyRouter.patch("/policies/:policyId/:version", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageWarrantyPolicies(currentActor)) return routeError(res, 403, "ROLE_FORBIDDEN", "Only the Owner can manage warranty policies.");
  const parsed = policyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    if (req.body?.autoIssue === true && req.body?.startRule !== "job-delivery") {
      return routeError(res, 400, "AUTO_ISSUE_REQUIRES_DELIVERY_START", "Automatic coverage must start on the recorded job delivery date.");
    }
    return routeError(res, 400, "INVALID_WARRANTY_POLICY", "Complete all warranty policy fields with valid values.");
  }
  if (!await validateServices(parsed.data.eligibleServiceIds)) {
    return routeError(res, 400, "INVALID_WARRANTY_SERVICE", "Choose active services that exist in Garage OS.");
  }
  const version = Number(req.params.version);
  if (!Number.isInteger(version) || version < 1) return routeError(res, 400, "INVALID_POLICY_VERSION", "Choose a valid policy version.");

  const updated = await withTransaction(async (client) => {
    const policy = await client.query<{ status: string }>(
      "SELECT status FROM warranty_policies WHERE policy_id = $1 AND version = $2 FOR UPDATE",
      [req.params.policyId, version],
    );
    if (!policy.rowCount) return "missing" as const;
    if (policy.rows[0].status !== "draft") return "locked" as const;
    await client.query(
      `UPDATE warranty_policies
       SET name = $3, eligible_service_ids = $4::text[], auto_issue = $5,
           start_rule = $6, duration_months = $7, exclusions = $8,
           evidence_requirements = $9, review_role = $10, response_days = $11,
           coverage_kind = $12, lifetime_definition = $13::jsonb
       WHERE policy_id = $1 AND version = $2`,
      [
        req.params.policyId,
        version,
        parsed.data.name,
        [...new Set(parsed.data.eligibleServiceIds)],
        parsed.data.autoIssue,
        parsed.data.startRule,
        parsed.data.durationMonths,
        parsed.data.exclusions,
        parsed.data.evidenceRequirements,
        parsed.data.reviewRole,
        parsed.data.responseDays,
        parsed.data.coverageKind,
        parsed.data.coverageKind === "lifetime" ? JSON.stringify(lifetimeSnapshot(parsed.data.lifetimeDefinition, req.params.policyId, version, currentActor.userId)) : null,
      ],
    );
    await addAuditEvent(client, {
      policyId: req.params.policyId,
      policyVersion: version,
      action: "draft-updated",
      details: "Owner updated a warranty policy draft.",
      actorUserId: currentActor.userId,
    });
    return "ok" as const;
  });
  if (updated === "missing") return routeError(res, 404, "POLICY_NOT_FOUND", "The policy version was not found.");
  if (updated === "locked") return routeError(res, 409, "POLICY_VERSION_LOCKED", "Published policy versions are immutable. Create a new version instead.");
  res.json({ ok: true });
});

warrantyRouter.post("/policies/:policyId/:version/publish", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageWarrantyPolicies(currentActor)) return routeError(res, 403, "ROLE_FORBIDDEN", "Only the Owner can publish warranty policies.");
  const parsed = z.object({ approvedTerms: z.literal(true) }).safeParse(req.body);
  if (!parsed.success) return routeError(res, 400, "OWNER_APPROVAL_REQUIRED", "The Owner must confirm that Go Stores approved these terms.");
  const version = Number(req.params.version);
  if (!Number.isInteger(version) || version < 1) return routeError(res, 400, "INVALID_POLICY_VERSION", "Choose a valid policy version.");

  const result = await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`warranty-policy:${req.params.policyId}`]);
    const policy = await client.query<{
      status: string;
      version: number;
      eligible_service_ids: string[];
      auto_issue: boolean;
      start_rule: string;
      duration_months: number | null;
      coverage_kind: "fixed" | "lifetime";
      lifetime_definition: Configured<LifetimeDefinition> | null;
      exclusions: string;
      evidence_requirements: string;
      review_role: string;
      response_days: number;
    }>(
      `SELECT status, version, eligible_service_ids, auto_issue, start_rule, duration_months, coverage_kind, lifetime_definition,
              exclusions, evidence_requirements, review_role, response_days
       FROM warranty_policies WHERE policy_id = $1 AND version = $2 FOR UPDATE`,
      [req.params.policyId, version],
    );
    if (!policy.rowCount) return "missing" as const;
    if (policy.rows[0].status !== "draft") return "locked" as const;
    if (policy.rows[0].coverage_kind === "lifetime" &&
        (policy.rows[0].lifetime_definition?.state !== "approved" ||
          !completeLifetimeDefinition(policy.rows[0].lifetime_definition.value))) return "lifetime-unconfigured" as const;
    const latest = await client.query<{ version: number }>(
      "SELECT max(version) AS version FROM warranty_policies WHERE policy_id = $1",
      [req.params.policyId],
    );
    if (Number(latest.rows[0]?.version) !== version) return "not-latest" as const;
    const activeServices = await client.query<{ id: string }>(
      "SELECT id FROM services WHERE id = ANY($1::text[]) AND active = true",
      [policy.rows[0].eligible_service_ids],
    );
    if (activeServices.rowCount !== policy.rows[0].eligible_service_ids.length) return "service-invalid" as const;
    if (policy.rows[0].auto_issue) {
      const serviceIds = [...policy.rows[0].eligible_service_ids].sort();
      for (const serviceId of serviceIds) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`warranty-auto-issue:${serviceId}`]);
      }
      const overlap = await client.query(
        `SELECT 1
         FROM warranty_policies
         WHERE policy_id <> $1 AND status = 'published' AND auto_issue = true
           AND eligible_service_ids && $2::text[]
         LIMIT 1`,
        [req.params.policyId, serviceIds],
      );
      if (overlap.rowCount) return "auto-overlap" as const;
    }

    await client.query(
      "UPDATE warranty_policies SET status = 'retired' WHERE policy_id = $1 AND status = 'published'",
      [req.params.policyId],
    );
    await client.query(
      `UPDATE warranty_policies
       SET status = 'published', published_by = $3, published_at = now()
       WHERE policy_id = $1 AND version = $2`,
      [req.params.policyId, version, currentActor.userId],
    );
    await addAuditEvent(client, {
      policyId: req.params.policyId,
      policyVersion: version,
      action: "policy-published",
      details: "Owner confirmed Go Stores approval and published this policy version.",
      actorUserId: currentActor.userId,
    });
    return "ok" as const;
  });
  if (result === "missing") return routeError(res, 404, "POLICY_NOT_FOUND", "The policy version was not found.");
  if (result === "locked") return routeError(res, 409, "POLICY_VERSION_LOCKED", "Only a draft can be published.");
  if (result === "not-latest") return routeError(res, 409, "POLICY_VERSION_NOT_LATEST", "Publish the newest policy version.");
  if (result === "service-invalid") return routeError(res, 409, "POLICY_SERVICE_INACTIVE", "One or more eligible services are no longer active.");
  if (result === "auto-overlap") return routeError(res, 409, "AUTO_WARRANTY_POLICY_CONFLICT", "Another published automatic policy already covers one or more selected services.");
  if (result === "lifetime-unconfigured") return routeError(res, 409, "LIFETIME_TERMS_UNCONFIGURED", "Complete approved bilingual lifetime terms before publishing.");
  res.json({ ok: true });
});

warrantyRouter.get("/retired-issuance-authority", async (req, res) => {
  const currentActor = actor(req);
  const parsed = z.object({ jobId: z.string().min(1), componentId: z.string().min(1),
    policyId: z.string().min(1), policyVersion: z.coerce.number().int().positive() }).safeParse(req.query);
  if (!parsed.success) return routeError(res, 400, "INVALID_WARRANTY", "Choose an exact job, component and policy version.");
  const { jobId, componentId, policyId, policyVersion } = parsed.data;
  const job = (await pool.query<{ branch_id: string; accepted_quote_id: string | null; accepted_quote_revision: number | null }>(
    "SELECT j.branch_id,b.accepted_quote_id,b.accepted_quote_revision FROM jobs j JOIN bookings b ON b.id=j.booking_id WHERE j.id=$1", [jobId])).rows[0];
  if (!job || !canIssueWarranty(currentActor, job.branch_id)) return routeError(res, 404, "JOB_NOT_FOUND", "The job is unavailable.");
  const policy = (await pool.query<{ status: string }>("SELECT status FROM warranty_policies WHERE policy_id=$1 AND version=$2", [policyId, policyVersion])).rows[0];
  if (policy?.status !== "retired") return res.json({ outcome: "not-retired" });
  if (!job.accepted_quote_id || !job.accepted_quote_revision) return res.json({ outcome: "missing-accepted-binding" });
  const accepted = (await pool.query<{ accepted_snapshot: { warrantyBindings?: Array<{ componentId: string; policy: { id: string; version: number }; issuanceAuthority: { id: string; version: number } }> } }>(
    "SELECT accepted_snapshot FROM quote_acceptance_events WHERE quote_id=$1 AND revision=$2", [job.accepted_quote_id, job.accepted_quote_revision])).rows[0]?.accepted_snapshot;
  const bindings = accepted?.warrantyBindings?.filter((binding) => binding.componentId === componentId &&
    binding.policy.id === policyId && binding.policy.version === policyVersion) ?? [];
  if (bindings.length !== 1) return res.json({ outcome: "missing-accepted-binding" });
  const authority = (await pool.query<{ state: string; value: { honorRetiredAcceptedWarranty?: boolean } | null; approved_at: Date | null; evidence_ref: string | null }>(
    "SELECT state,value,approved_at,evidence_ref FROM commercial_policy_versions WHERE policy_id=$1 AND version=$2",
    [bindings[0].issuanceAuthority.id, bindings[0].issuanceAuthority.version])).rows[0];
  return res.json({ outcome: authority?.state === "approved" && authority.approved_at && authority.evidence_ref &&
    authority.value?.honorRetiredAcceptedWarranty === true ? "approved" : "owner-exception-required" });
});

warrantyRouter.post("/", async (req, res) => {
  const currentActor = actor(req);
  const parsed = z.object({ policyId: z.string().min(1), policyVersion: z.number().int().positive(),
    jobId: z.string().min(1), componentId: z.string().min(1).nullable().optional(), startDate: dateSchema.optional(),
    idempotencyKey: z.string().min(1).optional() }).safeParse(req.body);
  if (!parsed.success) return routeError(res, 400, "INVALID_WARRANTY", "Choose an eligible completed job and policy.");
  try {
    const result = await withTransaction(client => issueCoverageInTransaction(client, commercialContext, currentActor, {
      jobId: parsed.data.jobId, componentId: parsed.data.componentId ?? null,
      policyRef: { id: parsed.data.policyId, version: parsed.data.policyVersion },
      startDate: parsed.data.startDate, source: "manual",
      idempotencyKey: req.get("Idempotency-Key") || parsed.data.idempotencyKey || `manual:${parsed.data.jobId}:${parsed.data.componentId ?? "legacy"}:${parsed.data.policyId}:${parsed.data.policyVersion}`,
    }));
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof WarrantyIssuanceError) return routeError(res, error.status, error.code, error.message);
    throw error;
  }
});

warrantyRouter.post("/policies/:policyId/:version/retire", async (req, res) => {
  const currentActor = actor(req);
  const parsed = z.object({ reason: z.string().trim().min(1), expectedStatus: z.literal("published") }).safeParse(req.body);
  const version = Number(req.params.version);
  if (!parsed.success || !Number.isInteger(version) || version < 1) return routeError(res, 400, "INVALID_RETIREMENT", "Provide the current status and a reason.");
  try {
    await retirePolicyVersion(commercialContext, currentActor, { policyRef: { id: req.params.policyId, version }, ...parsed.data });
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof WarrantyIssuanceError) return routeError(res, error.status, error.code, error.message);
    throw error;
  }
});

warrantyRouter.post("/policies/:policyId/:version/duplicate", async (req, res) => {
  const currentActor = actor(req);
  const parsed = z.object({ target: z.enum(["next-version", "new-policy"]) }).safeParse(req.body);
  const version = Number(req.params.version);
  if (!parsed.success || !Number.isInteger(version) || version < 1) return routeError(res, 400, "INVALID_DUPLICATE", "Choose a valid source and target.");
  try {
    const ref = await duplicatePolicyDraft(commercialContext, currentActor, { sourceRef: { id: req.params.policyId, version }, target: parsed.data.target });
    res.status(201).json({ ok: true, policyId: ref.id, version: ref.version });
  } catch (error) {
    if (error instanceof WarrantyIssuanceError) return routeError(res, error.status, error.code, error.message);
    throw error;
  }
});

warrantyRouter.post("/:warrantyId/invoice-draft", async (req, res) => {
  const currentActor = actor(req);
  const result = await withTransaction(async (client) => {
    const warranty = await client.query<{ branch_id: string; service_id: string }>(
      "SELECT branch_id, service_id FROM warranties WHERE id = $1 FOR SHARE",
      [req.params.warrantyId],
    );
    if (!warranty.rowCount) return { error: "missing" as const };
    if (!canViewWarrantyRecords(currentActor, warranty.rows[0].branch_id)) return { error: "forbidden" as const };
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM warranty_invoice_drafts WHERE warranty_id = $1",
      [req.params.warrantyId],
    );
    const invoiceId = await ensureWarrantyInvoiceDraft(client, {
      warrantyId: req.params.warrantyId,
      branchId: warranty.rows[0].branch_id,
      serviceId: warranty.rows[0].service_id,
      actorUserId: currentActor.userId,
    });
    if (!existing.rowCount) {
      await addAuditEvent(client, {
        warrantyId: req.params.warrantyId,
        action: "invoice-draft-created",
        details: "A draft invoice was prepared with the covered service; amounts and tax remain unconfirmed.",
        actorUserId: currentActor.userId,
      });
    }
    return { invoiceId } as const;
  });
  if ("error" in result) {
    if (result.error === "missing") return routeError(res, 404, "WARRANTY_NOT_FOUND", "Warranty record not found.");
    return routeError(res, 403, "ROLE_FORBIDDEN", "This warranty is outside your role or branch access.");
  }
  res.status(201).json({ ok: true, ...result });
});

warrantyRouter.put("/:warrantyId/invoice-draft", async (req, res) => {
  const currentActor = actor(req);
  const parsed = invoiceDraftInputSchema.safeParse(req.body);
  if (!parsed.success) return routeError(res, 400, "INVALID_INVOICE_DRAFT", "Check draft invoice items, amounts, tax, and payment fields.");

  const result = await withTransaction(async (client) => {
    const warranty = await client.query<{ branch_id: string }>(
      "SELECT branch_id FROM warranties WHERE id = $1 FOR SHARE",
      [req.params.warrantyId],
    );
    if (!warranty.rowCount) return { error: "missing" as const };
    if (!canViewWarrantyRecords(currentActor, warranty.rows[0].branch_id)) return { error: "forbidden" as const };
    const invoice = await client.query<{ id: string; paid_amount: string; payment_method: string | null; currency: string }>(
      "SELECT id, paid_amount, payment_method, currency FROM warranty_invoice_drafts WHERE warranty_id = $1 FOR UPDATE",
      [req.params.warrantyId],
    );
    if (!invoice.rowCount) return { error: "invoice" as const };
    const currencyProblem = invoiceCurrencyProblem({
      requested: parsed.data.currency,
      stored: invoice.rows[0].currency,
      lines: parsed.data.items,
      paymentEntered: Number(invoice.rows[0].paid_amount) > 0,
    });
    if (currencyProblem) return { error: "currency" as const, code: currencyProblem };
    const nextCurrency = parsed.data.currency ?? invoice.rows[0].currency;
    const paymentChanged = Number(invoice.rows[0].paid_amount) !== parsed.data.paidAmount ||
      invoice.rows[0].payment_method !== parsed.data.paymentMethod;

    await client.query("DELETE FROM warranty_invoice_draft_items WHERE invoice_id = $1", [invoice.rows[0].id]);
    for (const [sortOrder, item] of parsed.data.items.entries()) {
      await client.query(
        `INSERT INTO warranty_invoice_draft_items
           (id, invoice_id, description, quantity, unit_amount, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          makeId("warranty-invoice-item"),
          invoice.rows[0].id,
          item.description,
          item.quantity,
          item.unitAmount,
          sortOrder,
        ],
      );
    }
    await client.query(
      `UPDATE warranty_invoice_drafts
       SET tax_rate_percent = $2, paid_amount = $3, payment_method = $4,
           notes = $5, updated_by = $6, updated_at = now(), currency = $8,
           payment_recorded_at = CASE WHEN $7 THEN CASE WHEN $3::numeric > 0 THEN now() ELSE NULL END ELSE payment_recorded_at END,
           payment_recorded_by = CASE WHEN $7 THEN CASE WHEN $3::numeric > 0 THEN $6 ELSE NULL END ELSE payment_recorded_by END
       WHERE id = $1`,
      [
        invoice.rows[0].id,
        parsed.data.taxRatePercent,
        parsed.data.paidAmount,
        parsed.data.paymentMethod,
        parsed.data.notes,
        currentActor.userId,
        paymentChanged,
        nextCurrency,
      ],
    );
    await addAuditEvent(client, {
      warrantyId: req.params.warrantyId,
      action: "invoice-draft-updated",
      details: `Draft invoice updated with ${parsed.data.items.length} line item(s) in ${nextCurrency}${nextCurrency !== invoice.rows[0].currency ? ` (currency changed from ${invoice.rows[0].currency})` : ""}; no final invoice was issued.`,
      actorUserId: currentActor.userId,
    });
    if (paymentChanged) {
      await addAuditEvent(client, {
        warrantyId: req.params.warrantyId,
        action: "invoice-payment-updated",
        details: "Draft payment tracking was updated; this does not confirm a reconciled payment.",
        actorUserId: currentActor.userId,
      });
    }
    return { ok: true } as const;
  });
  if ("error" in result) {
    if (result.error === "missing") return routeError(res, 404, "WARRANTY_NOT_FOUND", "Warranty record not found.");
    if (result.error === "forbidden") return routeError(res, 403, "ROLE_FORBIDDEN", "This warranty is outside your role or branch access.");
    if (result.error === "currency") {
      const messages = {
        UNSUPPORTED_CURRENCY: "Choose a currency from the supported list.",
        MIXED_CURRENCY: "Every line must use the invoice currency; totals never mix currencies.",
        CURRENCY_LOCKED: "The currency cannot change once a payment amount has been entered.",
      } as const;
      return routeError(res, 400, result.code, messages[result.code]);
    }
    return routeError(res, 404, "INVOICE_DRAFT_NOT_FOUND", "Create a draft invoice before editing it.");
  }
  res.json(result);
});

warrantyRouter.post("/:warrantyId/void", async (req, res) => {
  const currentActor = actor(req);
  if (!canVoidWarranty(currentActor)) return routeError(res, 403, "ROLE_FORBIDDEN", "Only the Owner can void a warranty.");
  if (currentActor.isDemo) return routeError(res, 403, "DEMO_ACTION_DISABLED", "Voiding a warranty is unavailable in a temporary demo session.");
  const parsed = z.object({ reason: z.string().trim().min(3).max(1000) }).safeParse(req.body);
  if (!parsed.success) return routeError(res, 400, "VOID_REASON_REQUIRED", "Enter a reason before voiding this warranty.");

  const result = await withTransaction(async (client) => {
    const record = await client.query<{ status: string }>(
      "SELECT status FROM warranties WHERE id = $1 FOR UPDATE",
      [req.params.warrantyId],
    );
    if (!record.rowCount) return "missing" as const;
    if (record.rows[0].status !== "active") return "not-active" as const;
    await client.query(
      "UPDATE warranties SET status = 'void', void_reason = $2 WHERE id = $1",
      [req.params.warrantyId, parsed.data.reason],
    );
    await addAuditEvent(client, {
      warrantyId: req.params.warrantyId,
      action: "warranty-voided",
      details: parsed.data.reason,
      actorUserId: currentActor.userId,
    });
    return "ok" as const;
  });
  if (result === "missing") return routeError(res, 404, "WARRANTY_NOT_FOUND", "Warranty record not found.");
  if (result === "not-active") return routeError(res, 409, "WARRANTY_NOT_ACTIVE", "Only an active warranty can be voided.");
  res.json({ ok: true });
});

warrantyRouter.post("/:warrantyId/terminate", async (req, res) => {
  const currentActor = actor(req);
  if (!canManageWarrantyPolicies(currentActor)) return routeError(res, 403, "ROLE_FORBIDDEN", "Only the Owner can record lifetime termination.");
  const parsed = z.object({
    terminatedOn: dateSchema,
    reason: z.string().trim().min(3).max(2000),
    evidenceRef: z.string().trim().min(1).max(500),
  }).safeParse(req.body);
  if (!parsed.success || !isValidDate(parsed.data.terminatedOn)) return routeError(res, 400, "INVALID_TERMINATION", "Enter a valid date, reason, and evidence reference.");
  const outcome = await withTransaction(async (client) => {
    const coverage = await client.query<{ coverage_kind: string; start_date: string; terminated_on: string | null; status: string }>(
      "SELECT coverage_kind, start_date::text, terminated_on::text, status FROM warranties WHERE id = $1 FOR UPDATE", [req.params.warrantyId],
    );
    if (!coverage.rowCount) return "missing" as const;
    const row = coverage.rows[0];
    if (row.coverage_kind !== "lifetime" || row.terminated_on || row.status !== "active") return "invalid-state" as const;
    if (parsed.data.terminatedOn < row.start_date) return "invalid-date" as const;
    await client.query(
      `INSERT INTO warranty_termination_events (id, warranty_id, terminated_on, actor_user_id, reason, evidence_ref)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [makeId("warranty-termination"), req.params.warrantyId, parsed.data.terminatedOn, currentActor.userId, parsed.data.reason, parsed.data.evidenceRef],
    );
    await addAuditEvent(client, { warrantyId: req.params.warrantyId, action: "lifetime-terminated", details: parsed.data.reason, actorUserId: currentActor.userId });
    return "ok" as const;
  });
  if (outcome === "missing") return routeError(res, 404, "WARRANTY_NOT_FOUND", "Warranty record not found.");
  if (outcome !== "ok") return routeError(res, 409, "TERMINATION_NOT_ALLOWED", "This coverage cannot be terminated on the chosen date.");
  res.json({ ok: true });
});

warrantyRouter.post("/:warrantyId/claims", async (req, res) => {
  const currentActor = actor(req);
  const parsed = z.object({
    summary: z.string().trim().min(5).max(2000),
    evidence: z.string().trim().min(5).max(4000),
  }).safeParse(req.body);
  if (!parsed.success) return routeError(res, 400, "INVALID_WARRANTY_CLAIM", "Describe the issue and the available evidence.");

  const result = await withTransaction(async (client) => {
    const warranty = await client.query<{
      branch_id: string;
      status: string;
      expires_on: string | null;
      coverage_kind: "fixed" | "lifetime";
      terminated_on: string | null;
      cairo_today: string;
    }>(
      `SELECT branch_id, status, coverage_kind, terminated_on::text,
              to_char(expires_on, 'YYYY-MM-DD') AS expires_on,
              to_char((now() AT TIME ZONE 'Africa/Cairo')::date, 'YYYY-MM-DD') AS cairo_today
       FROM warranties WHERE id = $1 FOR SHARE`,
      [req.params.warrantyId],
    );
    if (!warranty.rowCount) return { error: "WARRANTY_NOT_FOUND" as const };
    const record = warranty.rows[0];
    if (!canOpenWarrantyClaim(currentActor, record.branch_id)) return { error: "ROLE_FORBIDDEN" as const };
    if (record.status === "void") return { error: "WARRANTY_VOID" as const };
    if (record.coverage_kind === "lifetime" && record.terminated_on && record.terminated_on <= record.cairo_today) return { error: "WARRANTY_TERMINATED" as const };
    if (record.coverage_kind === "fixed" && record.expires_on && isWarrantyExpired(record.expires_on, record.cairo_today)) return { error: "WARRANTY_EXPIRED" as const };

    const claimId = makeId("warranty-claim");
    await client.query(
      `INSERT INTO warranty_claims (id, warranty_id, summary, evidence, opened_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [claimId, req.params.warrantyId, parsed.data.summary, parsed.data.evidence, currentActor.userId],
    );
    await addAuditEvent(client, {
      claimId,
      action: "claim-opened",
      details: "Claim opened for manual review.",
      actorUserId: currentActor.userId,
    });
    return { claimId };
  });
  if ("error" in result) {
    if (result.error === "WARRANTY_NOT_FOUND") return routeError(res, 404, result.error, "Warranty record not found.");
    if (result.error === "ROLE_FORBIDDEN") return routeError(res, 403, result.error, "This warranty is outside your branch access.");
    if (result.error === "WARRANTY_EXPIRED") return routeError(res, 409, result.error, "A claim cannot be opened after warranty coverage has expired.");
    if (result.error === "WARRANTY_TERMINATED") return routeError(res, 409, result.error, "Coverage was terminated; contact a reviewer about any disputed claim.");
    return routeError(res, 409, "WARRANTY_VOID", "A claim cannot be opened for a void warranty.");
  }
  res.status(201).json({ ok: true, claimId: result.claimId });
});

warrantyRouter.post(
  "/claims/:claimId/attachments",
  async (req, res, next) => {
    if (!isPrivateStorageConfigured()) {
      return routeError(res, 503, "PRIVATE_STORAGE_UNAVAILABLE", "Private evidence storage is not configured.");
    }
    const currentActor = actor(req);
    const claimAccess = await pool.query<{ branch_id: string; status: WarrantyClaimStatus }>(
      `SELECT w.branch_id, c.status
       FROM warranty_claims c
       JOIN warranties w ON w.id = c.warranty_id
       WHERE c.id = $1`,
      [req.params.claimId],
    );
    if (!claimAccess.rowCount) return routeError(res, 404, "CLAIM_NOT_FOUND", "Warranty claim not found.");
    if (!canOpenWarrantyClaim(currentActor, claimAccess.rows[0].branch_id)) {
      return routeError(res, 403, "ROLE_FORBIDDEN", "This claim is outside your branch access.");
    }
    if (!canAttachEvidenceToClaim(claimAccess.rows[0].status)) {
      return routeError(res, 409, "CLAIM_FINALIZED", "New evidence cannot be attached after a claim is finalized.");
    }
    claimEvidenceUpload.single("file")(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        const tooLarge = error.code === "LIMIT_FILE_SIZE";
        return routeError(
          res,
          tooLarge ? 413 : 400,
          tooLarge ? "EVIDENCE_FILE_TOO_LARGE" : "INVALID_EVIDENCE_UPLOAD",
          tooLarge ? "Evidence files must be 8 MB or smaller." : "Upload one evidence file at a time.",
        );
      }
      if (error) return routeError(res, 400, "INVALID_EVIDENCE_UPLOAD", "The evidence file could not be read.");
      next();
    });
  },
  async (req, res) => {
    const currentActor = actor(req);
    const file = req.file;
    if (!file) return routeError(res, 400, "EVIDENCE_FILE_REQUIRED", "Choose one evidence file to upload.");

    const evidenceType = identifyClaimEvidence(file.buffer, file.originalname);
    if (!evidenceType) {
      return routeError(
        res,
        415,
        "UNSUPPORTED_EVIDENCE_FILE",
        "Use a valid JPG, PNG, WebP, or PDF file with a matching file extension.",
      );
    }
    const storage = privateStorageClient();
    if (!storage) return routeError(res, 503, "PRIVATE_STORAGE_UNAVAILABLE", "Private evidence storage is not configured.");

    const attachmentId = makeId("claim-evidence");
    const objectName = `claim-evidence/${randomUUID()}${evidenceType.extension}`;
    const fileName = safeClaimEvidenceFileName(file.originalname, evidenceType.extension);
    const upload = await storage.uploadFromBytes(objectName, file.buffer, { compress: false });
    if (!upload.ok) {
      return routeError(res, 502, "EVIDENCE_STORAGE_FAILED", "The private evidence file could not be stored.");
    }

    const result = await withTransaction(async (client) => {
      const claim = await client.query<{ branch_id: string; status: WarrantyClaimStatus }>(
        `SELECT w.branch_id, c.status
         FROM warranty_claims c
         JOIN warranties w ON w.id = c.warranty_id
         WHERE c.id = $1
         FOR UPDATE OF c`,
        [req.params.claimId],
      );
      if (!claim.rowCount) return "missing" as const;
      if (!canOpenWarrantyClaim(currentActor, claim.rows[0].branch_id)) return "forbidden" as const;
      if (!canAttachEvidenceToClaim(claim.rows[0].status)) return "finalized" as const;

      const count = await client.query<{ total: string }>(
        "SELECT count(*)::text AS total FROM warranty_claim_attachments WHERE claim_id = $1",
        [req.params.claimId],
      );
      if (Number(count.rows[0]?.total ?? 0) >= MAX_CLAIM_EVIDENCE_PER_CLAIM) return "limit" as const;

      await client.query(
        `INSERT INTO warranty_claim_attachments
           (id, claim_id, object_name, original_filename, content_type, byte_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          attachmentId,
          req.params.claimId,
          objectName,
          fileName,
          evidenceType.contentType,
          file.size,
          currentActor.userId,
        ],
      );
      await addAuditEvent(client, {
        claimId: req.params.claimId,
        action: "claim-evidence-added",
        details: `Attachment ${attachmentId}; ${evidenceType.contentType}; ${file.size} bytes.`,
        actorUserId: currentActor.userId,
      });
      return "ok" as const;
    }).catch(async (error: unknown) => {
      await storage.delete(objectName, { ignoreNotFound: true }).catch(() => undefined);
      throw error;
    });

    if (result !== "ok") {
      await storage.delete(objectName, { ignoreNotFound: true }).catch(() => undefined);
      if (result === "missing") return routeError(res, 404, "CLAIM_NOT_FOUND", "Warranty claim not found.");
      if (result === "forbidden") return routeError(res, 403, "ROLE_FORBIDDEN", "This claim is outside your branch access.");
      if (result === "finalized") return routeError(res, 409, "CLAIM_FINALIZED", "New evidence cannot be attached after a claim is finalized.");
      return routeError(res, 409, "CLAIM_EVIDENCE_LIMIT", "A claim can have up to 10 evidence attachments.");
    }
    res.status(201).json({ ok: true, attachmentId });
  },
);

warrantyRouter.get("/claims/:claimId/attachments/:attachmentId/download", async (req, res) => {
  const currentActor = actor(req);
  const attachment = await pool.query<{
    object_name: string;
    original_filename: string;
    content_type: string;
    branch_id: string;
  }>(
    `SELECT a.object_name, a.original_filename, a.content_type, w.branch_id
     FROM warranty_claim_attachments a
     JOIN warranty_claims c ON c.id = a.claim_id
     JOIN warranties w ON w.id = c.warranty_id
     WHERE a.id = $1 AND a.claim_id = $2`,
    [req.params.attachmentId, req.params.claimId],
  );
  if (!attachment.rowCount) return routeError(res, 404, "ATTACHMENT_NOT_FOUND", "Evidence attachment not found.");
  if (!canOpenWarrantyClaim(currentActor, attachment.rows[0].branch_id)) {
    return routeError(res, 403, "ROLE_FORBIDDEN", "This claim is outside your branch access.");
  }

  const storage = privateStorageClient();
  if (!storage) return routeError(res, 503, "PRIVATE_STORAGE_UNAVAILABLE", "Private evidence storage is not configured.");
  const download = await storage.downloadAsBytes(attachment.rows[0].object_name);
  if (!download.ok) return routeError(res, 502, "EVIDENCE_STORAGE_FAILED", "The private evidence file could not be retrieved.");

  const fileName = attachment.rows[0].original_filename;
  const asciiName = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encodedName = encodeURIComponent(fileName).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
  res.setHeader("Content-Type", attachment.rows[0].content_type);
  res.setHeader("Content-Length", download.value[0].byteLength);
  res.send(download.value[0]);
});

const claimStatusSchema = z.enum(["under-review", "approved", "denied", "closed"]);
const finalClaimStatuses = new Set<WarrantyClaimStatus>(["approved", "denied", "closed"]);

warrantyRouter.patch("/claims/:claimId", async (req, res) => {
  const currentActor = actor(req);
  const parsed = z.object({
    status: claimStatusSchema,
    resolution: z.string().trim().max(4000).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return routeError(res, 400, "INVALID_CLAIM_UPDATE", "Choose a valid claim status and review note.");

  const result = await withTransaction(async (client) => {
    const claimResult = await client.query<{
      status: WarrantyClaimStatus;
      branch_id: string;
      review_role: "owner" | "branch-manager";
    }>(
      `SELECT c.status, w.branch_id, p.review_role
       FROM warranty_claims c
       JOIN warranties w ON w.id = c.warranty_id
       JOIN warranty_policies p ON p.policy_id = w.policy_id AND p.version = w.policy_version
       WHERE c.id = $1
       FOR UPDATE OF c`,
      [req.params.claimId],
    );
    if (!claimResult.rowCount) return "missing" as const;
    const claim = claimResult.rows[0];
    if (!canReviewWarrantyClaim(currentActor, claim.branch_id, claim.review_role)) return "forbidden" as const;
    const canTransition =
      (claim.status === "open" && parsed.data.status === "under-review") ||
      (claim.status === "under-review" && finalClaimStatuses.has(parsed.data.status));
    if (!canTransition) return "transition" as const;
    if (finalClaimStatuses.has(parsed.data.status) && !parsed.data.resolution?.trim()) return "resolution" as const;

    await client.query(
      `UPDATE warranty_claims
       SET status = $2, resolution = coalesce($3, resolution), reviewed_by = $4,
           reviewed_at = now(), updated_at = now()
       WHERE id = $1`,
      [req.params.claimId, parsed.data.status, parsed.data.resolution ?? null, currentActor.userId],
    );
    await addAuditEvent(client, {
      claimId: req.params.claimId,
      action: "claim-status-changed",
      details: parsed.data.resolution?.trim() ?? `Status changed from ${claim.status} to ${parsed.data.status}.`,
      actorUserId: currentActor.userId,
    });
    return "ok" as const;
  });
  if (result === "missing") return routeError(res, 404, "CLAIM_NOT_FOUND", "Warranty claim not found.");
  if (result === "forbidden") return routeError(res, 403, "ROLE_FORBIDDEN", "Your role or branch does not permit reviewing this claim.");
  if (result === "transition") return routeError(res, 409, "CLAIM_STATUS_TRANSITION", "Claims must be reviewed before a final decision; closed claims cannot be reopened.");
  if (result === "resolution") return routeError(res, 400, "CLAIM_RESOLUTION_REQUIRED", "Record the reason for this final claim decision.");
  res.json({ ok: true });
});

