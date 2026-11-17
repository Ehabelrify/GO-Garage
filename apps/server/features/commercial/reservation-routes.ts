import { Router } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { commercialContext } from "./policy-service";
import { ReservationError, correctReservation, listReservations, readReservation, reserveOffer, scheduleReservation, scheduleReservationGroup, recordReservationDepositReference } from "./reservation-service";

export const reservationRouter=Router();
const ref=z.object({id:z.string().min(1),version:z.number().int().positive()}).strict();
const quote=z.object({quoteId:z.string().min(1),revision:z.number().int().positive()}).strict();
const reserve=z.object({quoteRef:quote,promotionRef:ref,qualificationId:z.string().min(1).nullable(),effectiveOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),idempotencyKey:z.string().min(1)}).strict();
const schedule=z.object({reservationId:z.string().min(1),expectedRevision:z.number().int().positive(),slot:z.object({dropoffDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),dropoffTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),configurationVersion:z.string().optional()}).strict(),idempotencyKey:z.string().min(1)}).strict();
const correction=z.object({id:z.string().min(1),expectedRevision:z.number().int().positive(),action:z.enum(["cancel","restore","expire"]),reason:z.string().trim().min(1),evidenceRef:z.string().regex(/^private:[A-Za-z0-9/_-]+$/)}).strict();
const scheduleGroup=z.object({qualificationId:z.string().min(1),items:z.array(schedule.pick({reservationId:true,expectedRevision:true,slot:true})).min(2),idempotencyKey:z.string().min(1)}).strict();
const depositReference=z.object({id:z.string().min(1),expectedRevision:z.number().int().positive(),reference:z.string().regex(/^private:[A-Za-z0-9/_-]+$/),reason:z.string().trim().min(1)}).strict();
function error(res:import("express").Response,next:import("express").NextFunction,e:unknown){if(e instanceof ReservationError)return res.status(e.status).json({code:e.code,message:e.message});if(e instanceof z.ZodError)return res.status(400).json({code:"INVALID_RESERVATION",message:"Check reservation fields."});next(e);}
reservationRouter.get("/",async(req,res,next)=>{try{res.json(await listReservations(commercialContext,actorFor(req)!));}catch(e){error(res,next,e);}});
reservationRouter.get("/:id",async(req,res,next)=>{try{res.json(await readReservation(commercialContext,actorFor(req)!,req.params.id));}catch(e){error(res,next,e);}});
reservationRouter.post("/",async(req,res,next)=>{try{res.status(201).json(await reserveOffer(commercialContext,actorFor(req)!,reserve.parse(req.body)));}catch(e){error(res,next,e);}});
reservationRouter.post("/schedule",async(req,res,next)=>{try{res.json(await scheduleReservation(commercialContext,actorFor(req)!,schedule.parse(req.body)));}catch(e){error(res,next,e);}});
reservationRouter.post("/schedule-group",async(req,res,next)=>{try{res.json(await scheduleReservationGroup(commercialContext,actorFor(req)!,scheduleGroup.parse(req.body)));}catch(e){error(res,next,e);}});
reservationRouter.post("/deposit-reference",async(req,res,next)=>{try{res.json(await recordReservationDepositReference(commercialContext,actorFor(req)!,depositReference.parse(req.body)));}catch(e){error(res,next,e);}});
reservationRouter.post("/corrections",async(req,res,next)=>{try{res.json(await correctReservation(commercialContext,actorFor(req)!,correction.parse(req.body)));}catch(e){error(res,next,e);}});
