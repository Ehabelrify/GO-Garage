import { Router } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { cancelPickupCommitment, recordPickupCommitment } from "./quote-booking";
import { QuoteError } from "./quote-service";
import { commercialContext } from "./policy-service";
import { pool } from "../../infrastructure/database/db";

export const pickupCommitmentRouter = Router();
const record = z.object({ bookingId: z.string().trim().min(1), promisedAt: z.string().datetime(), evidenceRef: z.string().regex(/^private:[A-Za-z0-9/_-]+$/), reason: z.string().trim().min(1), expectedRevision: z.number().int().min(0) }).strict();
const cancel = z.object({ reason: z.string().trim().min(1), expectedRevision: z.number().int().positive() }).strict();
const keyOf = (header: string | undefined) => header?.trim() || undefined;
function fail(res: import("express").Response, next: import("express").NextFunction, value: unknown) {
  if (value instanceof QuoteError) return res.status(value.status).json({ code: value.code, message: value.message });
  if (value instanceof z.ZodError) return res.status(400).json({ code: "INVALID_COMMITMENT", message: "Check pickup commitment fields." });
  next(value);
}
pickupCommitmentRouter.post("/", async (req, res, next) => {
  try {
    const key = keyOf(req.get("Idempotency-Key"));
    if (!key) throw new QuoteError(400, "INVALID_KEY", "Idempotency-Key header is required.");
    res.status(201).json(await recordPickupCommitment(commercialContext, actorFor(req)!, { ...record.parse(req.body), idempotencyKey: key }));
  } catch (e) { fail(res, next, e); }
});
pickupCommitmentRouter.post("/:id/cancel", async (req, res, next) => {
  try {
    const key = keyOf(req.get("Idempotency-Key"));
    if (!key) throw new QuoteError(400, "INVALID_KEY", "Idempotency-Key header is required.");
    res.json(await cancelPickupCommitment(commercialContext, actorFor(req)!, { commitmentId: req.params.id, ...cancel.parse(req.body), idempotencyKey: key }));
  } catch (e) { fail(res, next, e); }
});

/** Latest revision for a booking (0 when none). Same gate as the writer: owner, or branch manager of the booking's branch. */
export async function latestPickupCommitment(userId: string, bookingId: string) {
  const member = await pool.query<{ role: string; branch_ids: string[] }>("SELECT role,branch_ids FROM staff_memberships WHERE clerk_user_id=$1 AND status='active'", [userId]);
  const staff = member.rows[0];
  if (!staff || !["owner", "branch-manager"].includes(staff.role)) throw new QuoteError(403, "ROLE_FORBIDDEN", "Pickup commitment authority is required.");
  const booking = await pool.query<{ branch_id: string }>("SELECT branch_id FROM bookings WHERE id=$1", [bookingId]);
  const row = booking.rows[0];
  if (!row) throw new QuoteError(404, "BOOKING_NOT_FOUND", "Booking not found.");
  if (staff.role !== "owner" && !staff.branch_ids.includes(row.branch_id)) throw new QuoteError(403, "ROLE_FORBIDDEN", "Pickup commitment authority is required.");
  const latest = await pool.query<{ id: string; revision: number; promised_at: Date | null; cancellation_reason: string | null }>("SELECT id,revision,promised_at,cancellation_reason FROM pickup_commitments WHERE booking_id=$1 ORDER BY revision DESC LIMIT 1", [bookingId]);
  const c = latest.rows[0];
  if (!c) return { bookingId, revision: 0, commitmentId: null, status: "none" as const, promisedAt: null };
  const cancelled = c.promised_at === null;
  return { bookingId, revision: c.revision, commitmentId: c.id, status: cancelled ? "cancelled" as const : "active" as const, promisedAt: c.promised_at ? c.promised_at.toISOString() : null };
}
pickupCommitmentRouter.get("/", async (req, res, next) => {
  try {
    const bookingId = z.string().trim().min(1).safeParse(req.query.bookingId);
    const commitmentId = z.string().trim().min(1).safeParse(req.query.commitmentId);
    let target = bookingId.success ? bookingId.data : null;
    if (!target && commitmentId.success) {
      const found = await pool.query<{ booking_id: string }>("SELECT booking_id FROM pickup_commitments WHERE id=$1", [commitmentId.data]);
      if (!found.rows[0]) throw new QuoteError(404, "COMMITMENT_NOT_FOUND", "Pickup commitment not found.");
      target = found.rows[0].booking_id;
    }
    if (!target) throw new QuoteError(400, "INVALID_COMMITMENT", "bookingId or commitmentId is required.");
    res.json(await latestPickupCommitment(actorFor(req)!.userId, target));
  } catch (e) { fail(res, next, e); }
});
