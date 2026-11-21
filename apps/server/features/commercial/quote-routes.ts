import { Router } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { commercialContext } from "./policy-service";
import { generateQuoteDraft, listQuoteSources } from "./quote-generation";
import { QuoteError, acceptQuote, createQuoteRevision, listQuotes, quoteDraftSchema, readAcceptanceOutcome, readAcceptedQuote, readQuoteRevision, recordQuoteFollowup } from "./quote-service";

export const quoteRouter = Router();
const ref = z.object({ quoteId:z.string().min(1),revision:z.number().int().positive() }).strict();
function error(res: import("express").Response, next: import("express").NextFunction, err: unknown) {
  if (err instanceof QuoteError) return res.status(err.status).json({ code:err.code,message:err.message });
  if (err instanceof z.ZodError) return res.status(400).json({ code:"INVALID_QUOTE",message:"Check quote fields." });
  next(err);
}
quoteRouter.get("/", async (req,res,next) => { try { res.json(await listQuotes(commercialContext,actorFor(req)!)); } catch(e) { error(res,next,e); } });
quoteRouter.post("/revisions", async (req,res,next) => { try { res.status(201).json(await createQuoteRevision(commercialContext,actorFor(req)!,quoteDraftSchema.parse(req.body))); } catch(e) { error(res,next,e); } });
quoteRouter.get("/:quoteId/revisions/:revision", async (req,res,next) => { try { res.json(await readQuoteRevision(commercialContext,actorFor(req)!,ref.parse({ quoteId:req.params.quoteId,revision:Number(req.params.revision) }))); } catch(e) { error(res,next,e); } });
quoteRouter.post("/acceptances", async (req,res,next) => { try { res.status(201).json(await acceptQuote(commercialContext,actorFor(req)!,req.body)); } catch(e) { error(res,next,e); } });
quoteRouter.get("/:quoteId/acceptance-outcomes/:key", async (req,res,next) => { try { const result=await readAcceptanceOutcome(commercialContext,actorFor(req)!,req.params.quoteId,req.params.key); if (!result) return res.status(404).json({ code:"OUTCOME_NOT_FOUND",message:"No committed acceptance for this key." }); res.json(result); } catch(e) { error(res,next,e); } });
quoteRouter.get("/:quoteId/accepted/:revision", async (req,res,next) => { try { res.json(await readAcceptedQuote(commercialContext,actorFor(req)!,ref.parse({ quoteId:req.params.quoteId,revision:Number(req.params.revision) }))); } catch(e) { error(res,next,e); } });
quoteRouter.post("/followups", async (req,res,next) => { try { const input=z.object({ quoteId:z.string().min(1),expectedRevision:z.number().int().positive(),nextStatus:z.enum(["requested","preparing","answered","cancelled"]),responsibleUserId:z.string().nullable().optional(),promisedResponseAt:z.string().datetime().nullable().optional() }).strict().parse(req.body); await recordQuoteFollowup(commercialContext,actorFor(req)!,input); res.json({ ok:true }); } catch(e) { error(res,next,e); } });
const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("special-request"), requestId: z.string().min(1).max(120) }).strict(),
  z.object({ kind: z.literal("booking"), bookingId: z.string().min(1).max(120) }).strict(),
]);
/** Candidate recent services for the "Create quote" picker. */
quoteRouter.get("/sources", async (req,res,next) => { try { const customerId = typeof req.query.customerId === "string" ? req.query.customerId : ""; if (!customerId || customerId.length > 120) return res.status(400).json({ code:"INVALID_QUOTE",message:"Choose a customer." }); const vehicleId = typeof req.query.vehicleId === "string" && req.query.vehicleId ? req.query.vehicleId : undefined; res.json(await listQuoteSources(actorFor(req)!,{ customerId,vehicleId })); } catch(e) { error(res,next,e); } });
/** Generates (or returns the existing) DRAFT quote for a source. Idempotent per source. */
quoteRouter.post("/generate", async (req,res,next) => { try { const result = await generateQuoteDraft(commercialContext,actorFor(req)!,sourceSchema.parse(req.body)); res.status(result.created ? 201 : 200).json(result); } catch(e) { error(res,next,e); } });
