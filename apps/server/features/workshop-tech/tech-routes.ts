import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { PoolClient } from "pg";
import { actorFor } from "../auth/auth";
import { canAccessBranch, canAccessJob, type GarageActor } from "../auth/authz";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { isPrivateStorageConfigured, privateStorageClient } from "../../infrastructure/storage/private-storage";
import { safeClaimEvidenceFileName } from "../warranty/claim-evidence";
import {
  MAX_JOB_PHOTO_BYTES, MAX_JOB_PHOTOS_PER_JOB, canUseTechTools, checklistSummary, checklistToggleSchema, evaluateReadyGate,
  identifyJobPhoto, isClosedStage, isManagerRole, issueSchema, noteSchema, photoFieldsSchema, resolveIssueSchema,
  type ChecklistItemLike,
} from "./tech-rules";

export const techRouter = Router();

const makeId = (prefix: string) => `${prefix}-${randomUUID()}`;
const err = (res: Response, status: number, code: string, message: string) => res.status(status).json({ code, message });
const actor = (req: Request): GarageActor => actorFor(req)!;
const demoBlocked = (res: Response) => err(res, 403, "DEMO_ACTION_DISABLED", "This action is unavailable in a temporary demo session.");

interface JobRow { id: string; branch_id: string; assigned_user_id: string | null; stage: string; service_id: string }
interface ChecklistRow {
  id: string; template_id: string; phase: string; position: number; label_en: string; label_ar: string; mandatory: boolean;
  done: boolean; done_by_name: string | null; done_at: string | null;
}

type Queryable = Pick<PoolClient, "query">;

async function loadJob(db: Queryable, jobId: string, lock = false): Promise<JobRow | undefined> {
  const found = await db.query<JobRow>(
    `SELECT j.id, j.branch_id, j.assigned_user_id, j.stage, b.service_id
       FROM jobs j JOIN bookings b ON b.id = j.booking_id WHERE j.id = $1${lock ? " FOR UPDATE OF j" : ""}`,
    [jobId],
  );
  return found.rows[0];
}

type Access = { ok: true; job: JobRow } | { ok: false; status: number; code: string; message: string };

async function accessJob(db: Queryable, a: GarageActor, jobId: string, lock = false): Promise<Access> {
  if (!canUseTechTools(a.role)) return { ok: false, status: 403, code: "ROLE_FORBIDDEN", message: "This action is not available to your role." };
  const job = await loadJob(db, jobId, lock);
  if (!job) return { ok: false, status: 404, code: "JOB_NOT_FOUND", message: "Job not found." };
  // Same rule as the stage route: branch access, and technicians only for jobs assigned to them.
  if (!canAccessJob(a, { branchId: job.branch_id, assignedUserId: job.assigned_user_id })) {
    return { ok: false, status: 403, code: "ROLE_FORBIDDEN", message: "This job is outside your access." };
  }
  return { ok: true, job };
}

async function audit(db: Queryable, jobId: string, action: string, details: string, actorUserId: string) {
  await db.query(
    "INSERT INTO job_audit_events (id, job_id, action, details, actor_user_id) VALUES ($1,$2,$3,$4,$5)",
    [makeId("job-audit"), jobId, action, details.slice(0, 500), actorUserId],
  );
}

/** Creates the job's checklist from the templates of its service(s) once; later calls change nothing. */
export async function ensureChecklist(db: Queryable, job: Pick<JobRow, "id" | "service_id">) {
  const existing = await db.query("SELECT 1 FROM job_checklist_items WHERE job_id = $1 LIMIT 1", [job.id]);
  if (existing.rowCount) return;
  const components = await db.query<{ service_id: string }>("SELECT DISTINCT service_id FROM job_work_components WHERE job_id = $1", [job.id]);
  const serviceIds = components.rows.length ? components.rows.map((row) => row.service_id) : [job.service_id];
  const templates = await db.query<{ id: string; service_id: string; phase: string; label_en: string; label_ar: string; mandatory: boolean }>(
    `SELECT id, service_id, phase, label_en, label_ar, mandatory FROM job_checklist_templates
      WHERE active = true AND service_id = ANY($1::text[]) ORDER BY position, id`,
    [serviceIds],
  );
  let chosen = templates.rows;
  if (!chosen.length) {
    chosen = (await db.query<(typeof templates.rows)[number]>(
      `SELECT id, service_id, phase, label_en, label_ar, mandatory FROM job_checklist_templates
        WHERE active = true AND service_id = '*' ORDER BY position, id`,
    )).rows;
  }
  let position = 0;
  for (const template of chosen) {
    position += 10;
    await db.query(
      `INSERT INTO job_checklist_items (id, job_id, template_id, phase, position, label_en, label_ar, mandatory)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (job_id, template_id) DO NOTHING`,
      [makeId("job-check"), job.id, template.id, template.phase, position, template.label_en, template.label_ar, template.mandatory],
    );
  }
}

const mapChecklist = (row: ChecklistRow) => ({
  id: row.id, phase: row.phase, position: row.position, labelEn: row.label_en, labelAr: row.label_ar,
  mandatory: row.mandatory, done: row.done, doneByName: row.done_by_name, doneAt: row.done_at,
});

async function readChecklist(db: Queryable, jobId: string) {
  const rows = await db.query<ChecklistRow>(
    `SELECT id, template_id, phase, position, label_en, label_ar, mandatory, done, done_by_name, done_at
       FROM job_checklist_items WHERE job_id = $1 ORDER BY position, id`,
    [jobId],
  );
  const items = rows.rows.map(mapChecklist);
  return { items, summary: checklistSummary(items) };
}

const readNotes = async (db: Queryable, jobId: string) => (await db.query(
  `SELECT id, author_user_id AS "authorUserId", author_name AS "authorName", body, created_at AS "createdAt"
     FROM job_notes WHERE job_id = $1 ORDER BY created_at DESC LIMIT 200`, [jobId])).rows;
const readPhotos = async (db: Queryable, jobId: string) => (await db.query(
  `SELECT id, kind, original_filename AS "fileName", content_type AS "contentType", byte_size AS "byteSize", caption,
          uploaded_by_name AS "uploadedByName", created_at AS "createdAt"
     FROM job_photos WHERE job_id = $1 ORDER BY created_at DESC LIMIT 200`, [jobId])).rows;
const readIssues = async (db: Queryable, jobId: string) => (await db.query(
  `SELECT id, kind, note, photo_id AS "photoId", status, reported_by_name AS "reportedByName", created_at AS "createdAt",
          resolved_by_name AS "resolvedByName", resolved_at AS "resolvedAt", resolution
     FROM job_issues WHERE job_id = $1 ORDER BY created_at DESC LIMIT 200`, [jobId])).rows;

/** Open issues for the actor's branches; the web shows the count as the 'Issues' badge. Registered before /:id routes. */
techRouter.get("/issues/open", async (req, res) => {
  const a = actor(req);
  if (!canUseTechTools(a.role)) return err(res, 403, "ROLE_FORBIDDEN", "This action is not available to your role.");
  const rows = await pool.query(
    `SELECT i.id, i.job_id AS "jobId", i.kind, i.note, i.created_at AS "createdAt", i.reported_by_name AS "reportedByName", i.branch_id AS "branchId"
       FROM job_issues i JOIN jobs j ON j.id = i.job_id
      WHERE i.status = 'open' AND ($1 OR i.branch_id = ANY($2::text[]))
        AND ($3 <> 'technician' OR j.assigned_user_id = $4)
      ORDER BY i.created_at DESC LIMIT 100`,
    [a.role === "owner", a.branchIds, a.role, a.userId],
  );
  res.json({ count: rows.rows.length, issues: rows.rows });
});

techRouter.get("/:id/extras", async (req, res) => {
  // P1-074/P1-075: a fresh job shows its checklist on first read; the same idempotent helper the Ready gate uses creates the rows.
  const a = actor(req);
  const access = await withTransaction(async (client) => {
    const found = await accessJob(client, a, req.params.id, true);
    if (found.ok) await ensureChecklist(client, found.job);
    return found;
  });
  if (!access.ok) return err(res, access.status, access.code, access.message);
  const [notes, photos, issues] = await Promise.all([readNotes(pool, access.job.id), readPhotos(pool, access.job.id), readIssues(pool, access.job.id)]);
  const checklist = await readChecklist(pool, access.job.id);
  res.json({ stage: access.job.stage, storage: { available: isPrivateStorageConfigured() }, notes, photos, issues, checklist: checklist.items, checklistSummary: checklist.summary });
});

techRouter.get("/:id/notes", async (req, res) => {
  const access = await accessJob(pool, actor(req), req.params.id);
  if (!access.ok) return err(res, access.status, access.code, access.message);
  res.json({ notes: await readNotes(pool, access.job.id) });
});

techRouter.post("/:id/notes", async (req, res) => {
  const a = actor(req);
  if (a.isDemo) return demoBlocked(res);
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return err(res, 400, "INVALID_NOTE", "Write a note of up to 2000 characters.");
  const result = await withTransaction(async (client) => {
    const access = await accessJob(client, a, req.params.id);
    if (!access.ok) return access;
    if (isClosedStage(access.job.stage)) return { ok: false as const, status: 409, code: "JOB_CLOSED", message: "This job is closed." };
    const id = makeId("job-note");
    await client.query("INSERT INTO job_notes (id, job_id, author_user_id, author_name, body) VALUES ($1,$2,$3,$4,$5)", [id, access.job.id, a.userId, a.name, parsed.data.body]);
    await audit(client, access.job.id, "note-added", `Note ${id}`, a.userId);
    return { ok: true as const, id };
  });
  if (!result.ok) return err(res, result.status, result.code, result.message);
  res.status(201).json({ ok: true, noteId: result.id });
});

techRouter.get("/:id/checklist", async (req, res) => {
  const a = actor(req);
  const result = await withTransaction(async (client) => {
    const access = await accessJob(client, a, req.params.id, true);
    if (!access.ok) return access;
    await ensureChecklist(client, access.job);
    return { ok: true as const, ...(await readChecklist(client, access.job.id)) };
  });
  if (!result.ok) return err(res, result.status, result.code, result.message);
  res.json({ items: result.items, summary: result.summary });
});

techRouter.patch("/:id/checklist/:itemId", async (req, res) => {
  const a = actor(req);
  if (a.isDemo) return demoBlocked(res);
  const parsed = checklistToggleSchema.safeParse(req.body);
  if (!parsed.success) return err(res, 400, "INVALID_CHECKLIST", "Send done as true or false.");
  const result = await withTransaction(async (client) => {
    const access = await accessJob(client, a, req.params.id, true);
    if (!access.ok) return access;
    if (isClosedStage(access.job.stage)) return { ok: false as const, status: 409, code: "JOB_CLOSED", message: "This job is closed." };
    await ensureChecklist(client, access.job);
    const updated = await client.query(
      `UPDATE job_checklist_items SET done = $3, done_by = $4, done_by_name = $5, done_at = CASE WHEN $3 THEN now() ELSE NULL END
        WHERE id = $2 AND job_id = $1 RETURNING id`,
      [access.job.id, req.params.itemId, parsed.data.done, parsed.data.done ? a.userId : null, parsed.data.done ? a.name : null],
    );
    if (!updated.rowCount) return { ok: false as const, status: 404, code: "CHECKLIST_ITEM_NOT_FOUND", message: "Checklist item not found." };
    await audit(client, access.job.id, parsed.data.done ? "checklist-done" : "checklist-undone", `Item ${req.params.itemId}`, a.userId);
    return { ok: true as const, ...(await readChecklist(client, access.job.id)) };
  });
  if (!result.ok) return err(res, result.status, result.code, result.message);
  res.json({ ok: true, items: result.items, summary: result.summary });
});

export type ReadyGateResult =
  | { outcome: "allow"; eventNote: string | null }
  | { outcome: "blocked"; payload: { code: "CHECKLIST_INCOMPLETE"; message: string; remaining: { id: string; labelEn: string; labelAr: string }[]; canOverride: boolean } };

/**
 * Gate for a move to 'ready', run by the job stage route INSIDE its own transaction after it has locked the job row.
 * Locks the checklist rows (FOR UPDATE) so a concurrent untick waits until the stage update commits, and writes the
 * override audit in the same transaction: if the audit fails, the whole stage change rolls back.
 * Every mandatory item must be done; an owner or branch manager may override with `overrideReason`.
 */
export async function authorizeReadyInTransaction(
  client: Queryable,
  a: GarageActor,
  job: Pick<JobRow, "id" | "service_id">,
  body: { overrideReason?: unknown },
): Promise<ReadyGateResult> {
  await ensureChecklist(client, job);
  const items = (await client.query<ChecklistRow>(
    "SELECT id, label_en, label_ar, mandatory, done FROM job_checklist_items WHERE job_id = $1 ORDER BY position FOR UPDATE", [job.id])).rows
    .map((row): ChecklistItemLike => ({ id: row.id, labelEn: row.label_en, labelAr: row.label_ar, mandatory: row.mandatory, done: row.done }));
  const gate = evaluateReadyGate({ items, role: a.role, isDemo: a.isDemo, overrideReason: body.overrideReason });
  if (gate.outcome === "allow") return { outcome: "allow", eventNote: null };
  if (gate.outcome === "blocked") {
    return {
      outcome: "blocked",
      payload: {
        code: "CHECKLIST_INCOMPLETE",
        message: isManagerRole(a.role) ? "Finish the required checklist steps, or give a reason to override." : "Finish the required checklist steps first.",
        remaining: gate.remaining.map((item) => ({ id: item.id, labelEn: item.labelEn, labelAr: item.labelAr })),
        canOverride: isManagerRole(a.role),
      },
    };
  }
  const details = `${gate.remaining.length} step(s) skipped. Reason: ${gate.reason}`;
  await audit(client, job.id, "ready-gate-override", details, a.userId);
  return { outcome: "allow", eventNote: `Ready gate override: ${details}`.slice(0, 500) };
}

const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_JOB_PHOTO_BYTES, files: 1, fields: 4, parts: 6 } });

techRouter.get("/:id/photos", async (req, res) => {
  const access = await accessJob(pool, actor(req), req.params.id);
  if (!access.ok) return err(res, access.status, access.code, access.message);
  res.json({ storage: { available: isPrivateStorageConfigured() }, photos: await readPhotos(pool, access.job.id) });
});

techRouter.post(
  "/:id/photos",
  async (req, res, next) => {
    const a = actor(req);
    if (a.isDemo) return demoBlocked(res);
    const access = await accessJob(pool, a, req.params.id);
    if (!access.ok) return err(res, access.status, access.code, access.message);
    if (isClosedStage(access.job.stage)) return err(res, 409, "JOB_CLOSED", "This job is closed.");
    if (!isPrivateStorageConfigured()) return err(res, 503, "PRIVATE_STORAGE_UNAVAILABLE", "Photo storage is not configured.");
    photoUpload.single("file")(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        const tooLarge = error.code === "LIMIT_FILE_SIZE";
        return err(res, tooLarge ? 413 : 400, tooLarge ? "PHOTO_TOO_LARGE" : "INVALID_PHOTO_UPLOAD", tooLarge ? "Photos must be 8 MB or smaller." : "Upload one photo at a time.");
      }
      if (error) return err(res, 400, "INVALID_PHOTO_UPLOAD", "The photo could not be read.");
      next();
    });
  },
  async (req, res) => {
    const a = actor(req);
    const file = req.file;
    if (!file) return err(res, 400, "PHOTO_REQUIRED", "Choose a photo to upload.");
    const fields = photoFieldsSchema.safeParse(req.body);
    if (!fields.success) return err(res, 400, "INVALID_PHOTO_UPLOAD", "Choose before, after or damage.");
    const type = identifyJobPhoto(file.buffer, file.originalname);
    if (!type) return err(res, 415, "UNSUPPORTED_PHOTO", "Use a valid JPG, PNG or WebP photo.");
    const storage = privateStorageClient();
    if (!storage) return err(res, 503, "PRIVATE_STORAGE_UNAVAILABLE", "Photo storage is not configured.");

    const photoId = makeId("job-photo");
    const objectName = `job-photos/${randomUUID()}${type.extension}`;
    const fileName = safeClaimEvidenceFileName(file.originalname, type.extension);
    const upload = await storage.uploadFromBytes(objectName, file.buffer, { compress: false });
    if (!upload.ok) return err(res, 502, "PHOTO_STORAGE_FAILED", "The photo could not be stored.");

    const result = await withTransaction(async (client) => {
      const access = await accessJob(client, a, req.params.id, true);
      if (!access.ok) return access;
      if (isClosedStage(access.job.stage)) return { ok: false as const, status: 409, code: "JOB_CLOSED", message: "This job is closed." };
      const count = await client.query<{ total: string }>("SELECT count(*)::text AS total FROM job_photos WHERE job_id = $1", [access.job.id]);
      if (Number(count.rows[0]?.total ?? 0) >= MAX_JOB_PHOTOS_PER_JOB) return { ok: false as const, status: 409, code: "PHOTO_LIMIT", message: `A job can have up to ${MAX_JOB_PHOTOS_PER_JOB} photos.` };
      await client.query(
        `INSERT INTO job_photos (id, job_id, kind, object_name, original_filename, content_type, byte_size, caption, uploaded_by, uploaded_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [photoId, access.job.id, fields.data.kind, objectName, fileName, type.contentType, file.size, fields.data.caption ?? "", a.userId, a.name],
      );
      await audit(client, access.job.id, "photo-added", `Photo ${photoId}; ${fields.data.kind}; ${type.contentType}; ${file.size} bytes`, a.userId);
      return { ok: true as const };
    }).catch(async (error: unknown) => {
      await storage.delete(objectName, { ignoreNotFound: true }).catch(() => undefined);
      throw error;
    });
    if (!result.ok) {
      await storage.delete(objectName, { ignoreNotFound: true }).catch(() => undefined);
      return err(res, result.status, result.code, result.message);
    }
    res.status(201).json({ ok: true, photoId });
  },
);

techRouter.get("/:id/photos/:photoId/file", async (req, res) => {
  const access = await accessJob(pool, actor(req), req.params.id);
  if (!access.ok) return err(res, access.status, access.code, access.message);
  const photo = await pool.query<{ object_name: string; content_type: string }>(
    "SELECT object_name, content_type FROM job_photos WHERE id = $1 AND job_id = $2", [req.params.photoId, access.job.id]);
  if (!photo.rowCount) return err(res, 404, "PHOTO_NOT_FOUND", "Photo not found.");
  const storage = privateStorageClient();
  if (!storage) return err(res, 503, "PRIVATE_STORAGE_UNAVAILABLE", "Photo storage is not configured.");
  const download = await storage.downloadAsBytes(photo.rows[0].object_name);
  if (!download.ok) return err(res, 502, "PHOTO_STORAGE_FAILED", "The photo could not be retrieved.");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Content-Type", photo.rows[0].content_type);
  res.setHeader("Content-Length", download.value[0].byteLength);
  res.send(download.value[0]);
});

techRouter.get("/:id/issues", async (req, res) => {
  const access = await accessJob(pool, actor(req), req.params.id);
  if (!access.ok) return err(res, access.status, access.code, access.message);
  res.json({ issues: await readIssues(pool, access.job.id) });
});

techRouter.post("/:id/issues", async (req, res) => {
  const a = actor(req);
  if (a.isDemo) return demoBlocked(res);
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) return err(res, 400, "INVALID_ISSUE", "Choose the issue type and describe it.");
  const result = await withTransaction(async (client) => {
    const access = await accessJob(client, a, req.params.id, true);
    if (!access.ok) return access;
    if (isClosedStage(access.job.stage)) return { ok: false as const, status: 409, code: "JOB_CLOSED", message: "This job is closed." };
    if (parsed.data.photoId) {
      const photo = await client.query("SELECT 1 FROM job_photos WHERE id = $1 AND job_id = $2", [parsed.data.photoId, access.job.id]);
      if (!photo.rowCount) return { ok: false as const, status: 400, code: "INVALID_ISSUE", message: "That photo does not belong to this job." };
    }
    const id = makeId("job-issue");
    await client.query(
      `INSERT INTO job_issues (id, job_id, branch_id, kind, note, photo_id, reported_by, reported_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, access.job.id, access.job.branch_id, parsed.data.kind, parsed.data.note, parsed.data.photoId ?? null, a.userId, a.name],
    );
    await audit(client, access.job.id, "issue-reported", `Issue ${id}; ${parsed.data.kind}`, a.userId);
    return { ok: true as const, id };
  });
  if (!result.ok) return err(res, result.status, result.code, result.message);
  res.status(201).json({ ok: true, issueId: result.id });
});

techRouter.patch("/:id/issues/:issueId", async (req, res) => {
  const a = actor(req);
  if (!isManagerRole(a.role)) return err(res, 403, "ROLE_FORBIDDEN", "Only a manager can resolve an issue.");
  if (a.isDemo) return demoBlocked(res);
  const parsed = resolveIssueSchema.safeParse(req.body ?? {});
  if (!parsed.success) return err(res, 400, "INVALID_ISSUE", "The resolution is too long.");
  const result = await withTransaction(async (client) => {
    const job = await loadJob(client, req.params.id, true);
    if (!job) return { ok: false as const, status: 404, code: "JOB_NOT_FOUND", message: "Job not found." };
    if (!canAccessBranch(a, job.branch_id)) return { ok: false as const, status: 403, code: "ROLE_FORBIDDEN", message: "This job is outside your access." };
    const updated = await client.query(
      `UPDATE job_issues SET status = 'resolved', resolved_by = $3, resolved_by_name = $4, resolved_at = now(), resolution = $5
        WHERE id = $2 AND job_id = $1 AND status = 'open' RETURNING id`,
      [job.id, req.params.issueId, a.userId, a.name, parsed.data.resolution ?? null],
    );
    if (!updated.rowCount) return { ok: false as const, status: 404, code: "ISSUE_NOT_FOUND", message: "Open issue not found." };
    await audit(client, job.id, "issue-resolved", `Issue ${req.params.issueId}`, a.userId);
    return { ok: true as const };
  });
  if (!result.ok) return err(res, result.status, result.code, result.message);
  res.json({ ok: true });
});
