import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { listReminders, listRules, previewTemplate, ReminderError, runReminders, sendReminder, skipReminder, snoozeReminder, updateRule } from "./reminder-service";

/** Reminders and follow-ups API (simulated outbox only). Mounted at /api/reminders after requireMembership. */
export const remindersRouter = Router();

function respond(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof ReminderError) return res.status(error.status).json({ code: error.code, message: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ code: "INVALID_REMINDER", message: "Check the follow-up fields." });
  next(error);
}
const queryText = (value: unknown) => (typeof value === "string" && value.length <= 120 ? value : undefined);
const idParam = (value: string) => z.string().min(1).max(120).parse(value);

const patchSchema = z.object({
  expectedRevision: z.number().int().min(0),
  enabled: z.boolean().optional(),
  leadDays: z.number().int().optional(),
  autoSend: z.boolean().optional(),
  templateEn: z.string().max(2000).optional(),
  templateAr: z.string().max(2000).optional(),
}).strict();
const previewSchema = z.object({ kind: z.string().max(60), template: z.string().max(2000), lang: z.enum(["ar", "en"]) }).strict();
const snoozeSchema = z.object({ days: z.number().int() }).strict();

remindersRouter.get("/", async (req, res, next) => {
  try { res.json(await listReminders(actorFor(req)!, { kind: queryText(req.query.kind), customerId: queryText(req.query.customerId) })); } catch (e) { respond(res, next, e); }
});
remindersRouter.get("/rules", async (req, res, next) => {
  try { res.json(await listRules(actorFor(req)!)); } catch (e) { respond(res, next, e); }
});
remindersRouter.put("/rules/:kind", async (req, res, next) => {
  try { res.json(await updateRule(actorFor(req)!, idParam(req.params.kind), patchSchema.parse(req.body))); } catch (e) { respond(res, next, e); }
});
remindersRouter.post("/rules/preview", (req, res, next) => {
  try { const body = previewSchema.parse(req.body); res.json(previewTemplate(body.kind, body.template, body.lang)); } catch (e) { respond(res, next, e); }
});
remindersRouter.post("/run", async (req, res, next) => {
  try { res.json(await runReminders(actorFor(req)!)); } catch (e) { respond(res, next, e); }
});
remindersRouter.post("/:id/send", async (req, res, next) => {
  try { res.json(await sendReminder(actorFor(req)!, idParam(req.params.id))); } catch (e) { respond(res, next, e); }
});
remindersRouter.post("/:id/skip", async (req, res, next) => {
  try { res.json(await skipReminder(actorFor(req)!, idParam(req.params.id))); } catch (e) { respond(res, next, e); }
});
remindersRouter.post("/:id/snooze", async (req, res, next) => {
  try { res.json(await snoozeReminder(actorFor(req)!, idParam(req.params.id), snoozeSchema.parse(req.body).days)); } catch (e) { respond(res, next, e); }
});
