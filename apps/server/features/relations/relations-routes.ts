import { Router, type NextFunction, type Response } from "express";
import { actorFor } from "../auth/auth";
import { parseSearchTypes } from "./relations-helpers";
import { customer360, globalSearch, RelationsError, resolveWarranty, vehicle360 } from "./relations-service";

/** Read-only relations API. Mounted at /api after requireMembership. */
export const relationsRouter = Router();

function respond(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof RelationsError) return res.status(error.status).json({ code: error.code, message: error.message });
  next(error);
}
const text = (value: unknown) => (typeof value === "string" ? value : "");

relationsRouter.get("/search", async (req, res, next) => {
  try { res.json({ results: await globalSearch(actorFor(req)!, text(req.query.q), parseSearchTypes(req.query.types)) }); } catch (e) { respond(res, next, e); }
});
relationsRouter.get("/customers/:id/360", async (req, res, next) => {
  try { res.json(await customer360(actorFor(req)!, req.params.id)); } catch (e) { respond(res, next, e); }
});
relationsRouter.get("/vehicles/:id/360", async (req, res, next) => {
  try { res.json(await vehicle360(actorFor(req)!, req.params.id)); } catch (e) { respond(res, next, e); }
});
relationsRouter.get("/warranties/resolve", async (req, res, next) => {
  try { res.json(await resolveWarranty(actorFor(req)!, text(req.query.code))); } catch (e) { respond(res, next, e); }
});
