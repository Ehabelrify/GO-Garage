import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { DeliveryError, deliveryChannels, documentKinds, listDeliveries, sendDocument } from "./document-delivery-service";

/** Mounted at /api/document-delivery after requireMembership. */
export const documentDeliveryRouter = Router();

function respond(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof DeliveryError) return res.status(error.status).json({ code: error.code, message: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ code: "INVALID_DELIVERY", message: "Check the document and idempotency key." });
  next(error);
}
const sendSchema = z.object({
  documentKind: z.enum(documentKinds),
  documentId: z.string().min(1).max(120),
  channel: z.enum(deliveryChannels),
  idempotencyKey: z.string().min(8).max(120),
  verificationToken: z.string().max(200).optional(),
}).strict();
const historySchema = z.object({ documentKind: z.enum(documentKinds), documentId: z.string().min(1).max(120) }).strict();

documentDeliveryRouter.post("/send", async (req, res, next) => {
  try { res.json(await sendDocument(actorFor(req)!, sendSchema.parse(req.body))); } catch (e) { respond(res, next, e); }
});
documentDeliveryRouter.get("/history", async (req, res, next) => {
  try {
    const q = historySchema.parse({ documentKind: req.query.documentKind, documentId: req.query.documentId });
    res.json(await listDeliveries(actorFor(req)!, q.documentKind, q.documentId));
  } catch (e) { respond(res, next, e); }
});
