import { Router } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { cancelPickupCommitment, recordPickupCommitment } from "./quote-booking";
import { QuoteError } from "./quote-service";
import { commercialContext } from "./policy-service";

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
