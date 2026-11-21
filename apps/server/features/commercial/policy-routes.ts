import { Router } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { activateCommercialPolicy, approveCommercialPolicy, commercialContext, commercialPolicyReview, CommercialPolicyError, getActiveQuoteAcceptance, getCommercialPolicy, proposeCommercialPolicy } from "./policy-service";

export const commercialPolicyRouter = Router();
const id = z.string().regex(/^[a-z-]+:[A-Za-z0-9_-]+$/);
const proposal = z.object({ id, expectedVersion: z.number().int().nonnegative(), value: z.unknown(), branchId: z.string().min(1).nullable().optional(), effectiveFrom: z.string().optional(), effectiveThrough: z.string().optional() }).strict();
const approval = z.object({ id, expectedVersion: z.number().int().nonnegative(), value: z.unknown(), evidenceRef: z.string(), reason: z.string() }).strict();
const activation = z.object({ id, version: z.number().int().positive(), expectedActiveVersion: z.number().int().positive().nullable() }).strict();
function error(res: import("express").Response, failure: unknown) {
  if (failure instanceof CommercialPolicyError) return res.status(failure.status).json({ code: failure.code, message: failure.message });
  throw failure;
}
commercialPolicyRouter.get("/active/quote-acceptance", async (req, res, next) => {
  try { res.json(await getActiveQuoteAcceptance(actorFor(req)!)); } catch (failure) { try { error(res, failure); } catch (unknown) { next(unknown); } }
});
commercialPolicyRouter.get("/:id/review", async (req, res, next) => {
  try { res.json(await commercialPolicyReview(actorFor(req)!, req.params.id)); } catch (failure) { try { error(res, failure); } catch (unknown) { next(unknown); } }
});
commercialPolicyRouter.get("/:id", async (req, res, next) => {
  try { res.json(await getCommercialPolicy(commercialContext, actorFor(req)!, req.params.id)); } catch (failure) { try { error(res, failure); } catch (unknown) { next(unknown); } }
});
commercialPolicyRouter.post("/proposals", async (req, res, next) => {
  const parsed = proposal.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_POLICY", message: "Check the policy proposal." });
  try { res.status(201).json(await proposeCommercialPolicy(commercialContext, actorFor(req)!, parsed.data)); } catch (failure) { try { error(res, failure); } catch (unknown) { next(unknown); } }
});
commercialPolicyRouter.post("/approvals", async (req, res, next) => {
  const parsed = approval.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_POLICY", message: "Check the policy approval." });
  try { res.status(201).json(await approveCommercialPolicy(commercialContext, actorFor(req)!, parsed.data)); } catch (failure) { try { error(res, failure); } catch (unknown) { next(unknown); } }
});
commercialPolicyRouter.post("/activations", async (req, res, next) => {
  const parsed = activation.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_POLICY", message: "Check the policy activation." });
  try { res.json(await activateCommercialPolicy(commercialContext, actorFor(req)!, parsed.data)); } catch (failure) { try { error(res, failure); } catch (unknown) { next(unknown); } }
});
