import { Router } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { withTransaction } from "../../infrastructure/database/db";
import { commercialContext, CommercialPolicyError, listActivePromotions } from "./policy-service";
import { QualificationError, allocatePromotionInTransaction, consumeAllocationInTransaction, evaluateQualification, readPromotionAllocation, reverseAllocation, verifyPromotionMembership, revokePromotionMembership } from "./qualification-service";

export const qualificationRouter=Router();
qualificationRouter.get("/",async(req,res,next)=>{try{res.json(await listActivePromotions(actorFor(req)!));}catch(e){if(e instanceof CommercialPolicyError)return res.status(e.status).json({code:e.code,message:e.message});next(e);}});
const id=z.string().trim().min(1);
const policyRef=z.object({id,version:z.number().int().positive()}).strict();
const evidence=z.object({kind:z.enum(["warranty-reference","membership-verification","grouped-vehicles"]),referenceIds:z.array(id).min(1),verifiedBy:id.nullable(),verifiedAt:z.string().datetime().nullable()}).strict();
const evaluation=z.object({promotionRef:policyRef,beneficiaryId:id,vehicleIds:z.array(id).min(1),evidence:z.array(evidence)}).strict();
const quoteRef=z.object({quoteId:id,revision:z.number().int().positive()}).strict();
const allocation=z.object({promotionRef:policyRef,qualificationId:id,quoteRef,quoteRefs:z.array(quoteRef).min(1).optional(),idempotencyKey:id}).strict();
const correction=z.object({allocationId:id,reason:id,evidenceRef:id,idempotencyKey:id}).strict();
function error(res:import("express").Response,next:import("express").NextFunction,e:unknown){if(e instanceof QualificationError) return res.status(e.status).json({code:e.code,message:e.message});if(e instanceof z.ZodError) return res.status(400).json({code:"INVALID_QUALIFICATION",message:"Check promotion fields."});next(e);}
qualificationRouter.post("/evaluate",async(req,res,next)=>{try{res.json(await evaluateQualification(commercialContext,actorFor(req)!,evaluation.parse(req.body)));}catch(e){error(res,next,e);}});
qualificationRouter.post("/membership-verifications",async(req,res,next)=>{try{const input=z.object({promotionRef:policyRef,beneficiaryId:id,branchId:id,sourceRef:id,expiresAt:z.string().datetime().nullable()}).strict().parse(req.body);res.status(201).json(await verifyPromotionMembership(commercialContext,actorFor(req)!,input));}catch(e){error(res,next,e);}});
qualificationRouter.post("/membership-verifications/revoke",async(req,res,next)=>{try{const input=z.object({verificationId:id}).strict().parse(req.body);res.json(await revokePromotionMembership(commercialContext,actorFor(req)!,input));}catch(e){error(res,next,e);}});
qualificationRouter.post("/allocations",async(req,res,next)=>{try{res.status(201).json(await withTransaction(client=>allocatePromotionInTransaction(client,commercialContext,actorFor(req)!,allocation.parse(req.body))));}catch(e){error(res,next,e);}});
qualificationRouter.post("/allocations/consume",async(req,res,next)=>{try{const input=z.object({allocationId:id,idempotencyKey:id}).strict().parse(req.body);res.json(await withTransaction(client=>consumeAllocationInTransaction(client,commercialContext,actorFor(req)!,input)));}catch(e){error(res,next,e);}});
qualificationRouter.post("/allocations/reverse",async(req,res,next)=>{try{res.json(await reverseAllocation(commercialContext,actorFor(req)!,correction.parse(req.body)));}catch(e){error(res,next,e);}});
qualificationRouter.get("/allocations/:id",async(req,res,next)=>{try{res.json(await readPromotionAllocation(commercialContext,actorFor(req)!,req.params.id));}catch(e){error(res,next,e);}});
