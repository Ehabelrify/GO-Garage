import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import {
  closeSchema, createSchema, decisionSchema, infoSchema, quoteLinkSchema, requestStatuses, reviewStartSchema,
} from "./special-requests-logic";
import { addInfo, closeRequest, createRequest, decide, getRequest, linkQuote, listRequests, SpecialRequestError, startReview } from "./special-requests-service";

/** Special requests API. Mounted at /api/special-requests after requireMembership. */
export const specialRequestsRouter = Router();

function respond(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof SpecialRequestError) return res.status(error.status).json({ code: error.code, message: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ code: "INVALID_SPECIAL_REQUEST", message: "Check the request fields." });
  next(error);
}
const queryText = (value: unknown) => (typeof value === "string" && value.length <= 100 ? value : undefined);
const idParam = (value: string) => z.string().min(1).max(120).parse(value);

specialRequestsRouter.get("/", async (req, res, next) => {
  try {
    const status = queryText(req.query.status);
    res.json(await listRequests(actorFor(req)!, {
      status: status === "open" || (requestStatuses as readonly string[]).includes(status ?? "") ? status : undefined,
      customerId: queryText(req.query.customerId), vehicleId: queryText(req.query.vehicleId),
    }));
  } catch (e) { respond(res, next, e); }
});
specialRequestsRouter.get("/:id", async (req, res, next) => {
  try { res.json(await getRequest(actorFor(req)!, idParam(req.params.id))); } catch (e) { respond(res, next, e); }
});
specialRequestsRouter.post("/", async (req, res, next) => {
  try { res.status(201).json(await createRequest(actorFor(req)!, createSchema.parse(req.body))); } catch (e) { respond(res, next, e); }
});
specialRequestsRouter.post("/:id/start-review", async (req, res, next) => {
  try { res.json(await startReview(actorFor(req)!, idParam(req.params.id), reviewStartSchema.parse(req.body).expectedRevision)); } catch (e) { respond(res, next, e); }
});
specialRequestsRouter.post("/:id/decision", async (req, res, next) => {
  try { res.json(await decide(actorFor(req)!, idParam(req.params.id), decisionSchema.parse(req.body))); } catch (e) { respond(res, next, e); }
});
specialRequestsRouter.post("/:id/info", async (req, res, next) => {
  try { const body = infoSchema.parse(req.body); res.json(await addInfo(actorFor(req)!, idParam(req.params.id), body.expectedRevision, body.text)); } catch (e) { respond(res, next, e); }
});
specialRequestsRouter.post("/:id/close", async (req, res, next) => {
  try { const body = closeSchema.parse(req.body); res.json(await closeRequest(actorFor(req)!, idParam(req.params.id), body.expectedRevision, body.reason)); } catch (e) { respond(res, next, e); }
});
specialRequestsRouter.post("/:id/quote", async (req, res, next) => {
  try { const body = quoteLinkSchema.parse(req.body); res.json(await linkQuote(actorFor(req)!, idParam(req.params.id), body.expectedRevision, body.quoteId)); } catch (e) { respond(res, next, e); }
});
