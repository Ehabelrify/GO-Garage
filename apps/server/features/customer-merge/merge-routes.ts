import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { listDuplicates, listMerges, mergeCustomers, MergeError, previewMerge, undoMerge } from "./merge-service";

/** Mounted at /api/customers BEFORE the generic customer routes: /duplicates and /merge* never collide with /:id. */
export const customerMergeRouter = Router();

const idSchema = z.string().trim().min(1).max(200);
const pairSchema = z.object({ survivorId: idSchema, mergedId: idSchema }).strict();
const mergeSchema = pairSchema.extend({ reason: z.string().trim().min(1).max(500) }).strict();
const undoSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

function respond(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof MergeError) return res.status(error.status).json({ code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) });
  if (error instanceof z.ZodError) return res.status(400).json({ code: "INVALID_REQUEST", message: "Choose two customers and enter a reason." });
  next(error);
}

customerMergeRouter.get("/duplicates", async (req, res, next) => {
  try { res.json(await listDuplicates(actorFor(req)!)); } catch (e) { respond(res, next, e); }
});
customerMergeRouter.get("/merges", async (req, res, next) => {
  try { res.json(await listMerges(actorFor(req)!)); } catch (e) { respond(res, next, e); }
});
customerMergeRouter.post("/merge/preview", async (req, res, next) => {
  try { const body = pairSchema.parse(req.body); res.json(await previewMerge(actorFor(req)!, body.survivorId, body.mergedId)); } catch (e) { respond(res, next, e); }
});
customerMergeRouter.post("/merge", async (req, res, next) => {
  try { res.status(201).json(await mergeCustomers(actorFor(req)!, mergeSchema.parse(req.body))); } catch (e) { respond(res, next, e); }
});
customerMergeRouter.post("/merge/:id/undo", async (req, res, next) => {
  try { res.json(await undoMerge(actorFor(req)!, idSchema.parse(req.params.id), undoSchema.parse(req.body).reason)); } catch (e) { respond(res, next, e); }
});
