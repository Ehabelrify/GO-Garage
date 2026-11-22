import { Router } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { QuoteError } from "../commercial/quote-service";
import { CatalogueError } from "../commercial/catalogue-service";
import { LinkError } from "../whatsapp/unlinked-contact";
import { IntakeError } from "./intake-errors";
import { runIntake } from "./intake-service";

export const intakeRouter = Router();

/** POST /api/intake: customer + vehicle + (quote | booking | customer only) in one transaction. */
intakeRouter.post("/", async (req, res, next) => {
  try {
    const result = await runIntake(actorFor(req)!, req.body);
    res.status(result.status).json(result.body);
  } catch (error) {
    if (error instanceof IntakeError) return res.status(error.status).json({ code: error.code, message: error.message, ...error.body });
    if (error instanceof QuoteError || error instanceof CatalogueError || error instanceof LinkError) return res.status(error.status).json({ code: error.code, message: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ code: "INVALID_INTAKE", message: "Check the customer, vehicle and items." });
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return res.status(409).json({ code: "DUPLICATE_PHONE", message: "A customer with this phone number already exists." });
    next(error);
  }
});
