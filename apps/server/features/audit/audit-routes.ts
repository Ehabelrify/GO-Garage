import { Router, type NextFunction, type Response } from "express";
import { actorFor } from "../auth/auth";
import { AuditError, dailySummary, EXPORT_ROW_CAP, listAudit, listAuditActors, parseAuditFilters, streamAuditCsv } from "./audit-service";

/** Read-only owner activity log and daily summary. Mounted at /api/audit and /api/reports after requireMembership. */
function respond(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof AuditError) return res.status(error.status).json({ code: error.code, message: error.message });
  next(error);
}

const auditRouter = Router();

auditRouter.get("/", async (req, res, next) => {
  try { res.json(await listAudit(actorFor(req)!, parseAuditFilters(req.query))); } catch (error) { respond(res, next, error); }
});

auditRouter.get("/actors", async (req, res, next) => {
  try { res.json({ actors: await listAuditActors(actorFor(req)!) }); } catch (error) { respond(res, next, error); }
});

auditRouter.get("/export.csv", async (req, res, next) => {
  let started = false;
  try {
    const actor = actorFor(req)!;
    const filters = parseAuditFilters(req.query);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="activity-log-${stamp}.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Export-Row-Cap", String(EXPORT_ROW_CAP));
    // The access check runs inside streamAuditCsv before the first write, so rows are only sent to an allowed actor.
    await streamAuditCsv(actor, filters, async (chunk) => {
      started = true;
      if (!res.write(chunk)) await new Promise<void>((resolve) => res.once("drain", resolve));
    });
    res.end();
  } catch (error) {
    if (started) { res.destroy(error instanceof Error ? error : undefined); return; }
    res.removeHeader("Content-Disposition");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    respond(res, next, error);
  }
});

const reportsRouter = Router();

reportsRouter.get("/daily-summary", async (req, res, next) => {
  try {
    const date = typeof req.query.date === "string" && req.query.date ? req.query.date : undefined;
    const branchId = typeof req.query.branchId === "string" && req.query.branchId && req.query.branchId !== "all" ? req.query.branchId : undefined;
    res.json(await dailySummary(actorFor(req)!, { date, branchId }));
  } catch (error) { respond(res, next, error); }
});

/** One mount point for operations/api.ts: /api/audit/* and /api/reports/*. */
export const auditApiRouter = Router();
auditApiRouter.use("/audit", auditRouter);
auditApiRouter.use("/reports", reportsRouter);
