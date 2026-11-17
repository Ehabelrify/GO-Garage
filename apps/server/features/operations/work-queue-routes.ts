import { Router } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { listWorkQueue } from "./work-queues";
export const workQueueRouter=Router();
workQueueRouter.get("/",async(req,res,next)=>{try{const input=z.object({branchId:z.string().min(1).default("all"),kinds:z.string().optional()}).parse(req.query);res.json(await listWorkQueue(actorFor(req)!,{branchId:input.branchId,kinds:input.kinds?.split(",").filter(Boolean)}));}catch(error){next(error);}});
