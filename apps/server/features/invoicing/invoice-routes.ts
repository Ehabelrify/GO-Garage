import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { draftUpdateSchema, generateSchema, invoiceStatuses, issueSchema, paymentSchema, voidSchema } from "./invoice-logic";
import { generateInvoice, getInvoice, InvoiceError, issueInvoice, listInvoices, recordPayment, updateDraft, voidInvoice } from "./invoice-service";

/** Invoices API. Mounted at /api/invoices after requireMembership. */
export const invoiceRouter = Router();

function respond(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof InvoiceError) return res.status(error.status).json({ code: error.code, message: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ code: "INVALID_INVOICE", message: "Check the invoice fields." });
  next(error);
}
const queryText = (value: unknown) => (typeof value === "string" && value.length <= 120 ? value : undefined);
const idParam = (value: string) => z.string().min(1).max(120).parse(value);

invoiceRouter.get("/", async (req, res, next) => {
  try {
    const status = queryText(req.query.status);
    res.json(await listInvoices(actorFor(req)!, {
      status: (invoiceStatuses as readonly string[]).includes(status ?? "") ? status : undefined,
      customerId: queryText(req.query.customerId), vehicleId: queryText(req.query.vehicleId), jobId: queryText(req.query.jobId),
    }));
  } catch (e) { respond(res, next, e); }
});
invoiceRouter.post("/generate", async (req, res, next) => {
  try { res.status(201).json(await generateInvoice(actorFor(req)!, generateSchema.parse(req.body))); } catch (e) { respond(res, next, e); }
});
invoiceRouter.get("/:id", async (req, res, next) => {
  try { res.json(await getInvoice(actorFor(req)!, idParam(req.params.id))); } catch (e) { respond(res, next, e); }
});
invoiceRouter.put("/:id", async (req, res, next) => {
  try { res.json(await updateDraft(actorFor(req)!, idParam(req.params.id), draftUpdateSchema.parse(req.body))); } catch (e) { respond(res, next, e); }
});
invoiceRouter.post("/:id/issue", async (req, res, next) => {
  try { res.json(await issueInvoice(actorFor(req)!, idParam(req.params.id), issueSchema.parse(req.body).expectedRevision)); } catch (e) { respond(res, next, e); }
});
invoiceRouter.post("/:id/payments", async (req, res, next) => {
  try { res.json(await recordPayment(actorFor(req)!, idParam(req.params.id), paymentSchema.parse(req.body))); } catch (e) { respond(res, next, e); }
});
invoiceRouter.post("/:id/void", async (req, res, next) => {
  try { const body = voidSchema.parse(req.body); res.json(await voidInvoice(actorFor(req)!, idParam(req.params.id), body.expectedRevision, body.reason)); } catch (e) { respond(res, next, e); }
});
