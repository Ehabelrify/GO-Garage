import { Router } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { BenefitError, benefitContext, evaluateBenefit, listBenefits, readBenefit, redeemBenefit, reverseBenefitRedemption } from "./benefit-service";

export const benefitRouter=Router();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const evaluate=z.object({entitlementId:z.string().min(1),on:date,branchId:z.string().min(1)}).strict();
const redeem=z.object({entitlementId:z.string().min(1),quantity:z.number().int().positive(),on:date,branchId:z.string().min(1),fulfillmentRef:z.string().trim().min(1),expectedRevision:z.number().int().positive(),idempotencyKey:z.string().min(1)}).strict();
const reverse=z.object({redemptionId:z.string().min(1),reason:z.string().trim().min(1),evidenceRef:z.string().regex(/^private:[A-Za-z0-9/_-]+$/),idempotencyKey:z.string().min(1)}).strict();
function error(res:import("express").Response,next:import("express").NextFunction,value:unknown){if(value instanceof BenefitError)return res.status(value.status).json({code:value.code,message:value.message});if(value instanceof z.ZodError)return res.status(400).json({code:"INVALID_BENEFIT_REQUEST",message:"Check benefit fields."});next(value);}
benefitRouter.get("/",async(req,res,next)=>{try{res.json(await listBenefits(benefitContext,actorFor(req)!));}catch(e){error(res,next,e);}});
benefitRouter.get("/:id",async(req,res,next)=>{try{res.json(await readBenefit(benefitContext,actorFor(req)!,req.params.id));}catch(e){error(res,next,e);}});
benefitRouter.post("/evaluate",async(req,res,next)=>{try{res.json(await evaluateBenefit(benefitContext,actorFor(req)!,evaluate.parse(req.body)));}catch(e){error(res,next,e);}});
benefitRouter.post("/redeem",async(req,res,next)=>{try{res.json(await redeemBenefit(benefitContext,actorFor(req)!,redeem.parse(req.body)));}catch(e){error(res,next,e);}});
benefitRouter.post("/reverse",async(req,res,next)=>{try{res.json(await reverseBenefitRedemption(benefitContext,actorFor(req)!,reverse.parse(req.body)));}catch(e){error(res,next,e);}});
