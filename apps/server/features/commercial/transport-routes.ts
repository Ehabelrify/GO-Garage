import { Router } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { getTransportContact, listTransport, readTransport, requestTransport, transitionTransport, TransportError, transportContext } from "./transport-service";

export const transportRouter=Router();
const status=z.enum(["proposed","requested","confirmed","pickup-in-progress","in-custody","completed","cancelled","exception"]);
const request=z.object({bookingId:z.string().min(1),direction:z.enum(["pickup","return","courtesy"]),mode:z.enum(["tow","driver","courtesy-car"]),contact:z.string().trim().min(1),location:z.string().trim().min(1),instructions:z.string(),idempotencyKey:z.string().min(1)}).strict();
const transition=z.object({id:z.string().min(1),expectedRevision:z.number().int().positive(),nextStatus:status,providerId:z.string().min(1).optional(),committedWindow:z.object({startsAt:z.string().datetime(),endsAt:z.string().datetime()}).strict().optional(),evidenceRef:z.string().regex(/^private:[A-Za-z0-9/_-]+$/).optional(),reason:z.string().trim().min(1).optional(),idempotencyKey:z.string().min(1)}).strict();
function error(res:import("express").Response,next:import("express").NextFunction,value:unknown){if(value instanceof TransportError)return res.status(value.status).json({code:value.code,message:value.message});if(value instanceof z.ZodError)return res.status(400).json({code:"INVALID_TRANSPORT_REQUEST",message:"Check transport fields."});next(value);}
transportRouter.get("/",async(req,res,next)=>{try{res.json(await listTransport(transportContext,actorFor(req)!));}catch(e){error(res,next,e);}});
transportRouter.get("/:id/contact",async(req,res,next)=>{try{res.json(await getTransportContact(transportContext,actorFor(req)!,req.params.id));}catch(e){error(res,next,e);}});
transportRouter.get("/:id",async(req,res,next)=>{try{res.json(await readTransport(transportContext,actorFor(req)!,req.params.id));}catch(e){error(res,next,e);}});
transportRouter.post("/",async(req,res,next)=>{try{res.status(201).json(await requestTransport(transportContext,actorFor(req)!,request.parse(req.body)));}catch(e){error(res,next,e);}});
transportRouter.post("/transitions",async(req,res,next)=>{try{res.json(await transitionTransport(transportContext,actorFor(req)!,transition.parse(req.body)));}catch(e){error(res,next,e);}});
