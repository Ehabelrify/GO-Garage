import { Router } from "express";
import { z } from "zod";
import { actorFor } from "../auth/auth";
import { commercialContext } from "./policy-service";
import { CatalogueError, classifyVehicle, getEligiblePackages, getVehicleSelection, listAvailablePackages, listGradeVersions, listPackageVersions, listPackagePriceHistory, listVehicleCategories, publishGradeVersion, publishPackageVersion, retireGradeVersion, retirePackageVersion, saveGradeDraft, savePackageDraft, savePriceDraft, saveVehicleCategory } from "./catalogue-service";

export const catalogueRouter = Router();
function respondError(res: import("express").Response, next: import("express").NextFunction, error: unknown) {
  if (error instanceof CatalogueError) return res.status(error.status).json({ code: error.code, message: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ code: "INVALID_CATALOGUE", message: "Check catalogue fields." });
  next(error);
}
catalogueRouter.get("/versions", async (req, res, next) => { try { res.json(await listPackageVersions(actorFor(req)!)); } catch (e) { respondError(res,next,e); } });
catalogueRouter.get("/available-packages", async (req, res, next) => { try { res.json(await listAvailablePackages(actorFor(req)!)); } catch (e) { respondError(res,next,e); } });
catalogueRouter.get("/vehicle-selection/:vehicleId", async (req, res, next) => { try { res.json(await getVehicleSelection(actorFor(req)!, req.params.vehicleId)); } catch (e) { respondError(res,next,e); } });
catalogueRouter.get("/grades", async (req, res, next) => { try { res.json(await listGradeVersions(actorFor(req)!)); } catch (e) { respondError(res,next,e); } });
catalogueRouter.get("/categories", async (req, res, next) => { try { res.json(await listVehicleCategories(actorFor(req)!)); } catch (e) { respondError(res,next,e); } });
catalogueRouter.post("/categories", async (req, res, next) => { try { res.status(201).json(await saveVehicleCategory(actorFor(req)!,req.body)); } catch (e) { respondError(res,next,e); } });
catalogueRouter.post("/vehicle-classifications", async (req, res, next) => {
  const parsed = z.object({ vehicleId: z.string().min(1), categoryId: z.string().min(1) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_CLASSIFICATION", message: "Select a vehicle and category." });
  try { res.json(await classifyVehicle(actorFor(req)!,parsed.data)); } catch (e) { respondError(res,next,e); }
});
catalogueRouter.post("/grades/drafts", async (req, res, next) => {
  const parsed = z.object({ grade: z.unknown(), expectedRevision: z.number().int().nonnegative() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_GRADE", message: "Check grade draft." });
  try { res.status(201).json(await saveGradeDraft(commercialContext,actorFor(req)!,parsed.data as Parameters<typeof saveGradeDraft>[2])); } catch (e) { respondError(res,next,e); }
});
catalogueRouter.post("/grades/publications", async (req, res, next) => {
  const parsed = z.object({ gradeId: z.string().min(1), expectedRevision: z.number().int().positive(), evidenceRef: z.string(), reason: z.string() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_GRADE", message: "Check grade publication." });
  try { res.status(201).json(await publishGradeVersion(commercialContext,actorFor(req)!,parsed.data)); } catch (e) { respondError(res,next,e); }
});
catalogueRouter.post("/grades/retirements", async (req, res, next) => {
  const parsed = z.object({ gradeId: z.string().min(1), expectedRevision: z.number().int().positive(), expectedVersion: z.number().int().positive(), reason: z.string().min(1) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_RETIREMENT", message: "Check grade retirement fields." });
  try { res.status(201).json(await retireGradeVersion(commercialContext,actorFor(req)!,parsed.data)); } catch (e) { respondError(res,next,e); }
});
catalogueRouter.post("/eligible", async (req, res, next) => {
  const parsed = z.object({ branchId: z.string().min(1), vehicle: z.object({ vehicleId: z.string().min(1), model: z.string().min(1), categoryId: z.string().nullable() }).strict(), serviceIntent: z.string().min(1) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_SELECTION", message: "Branch, vehicle and service are required." });
  try { res.json(await getEligiblePackages(commercialContext,actorFor(req)!,parsed.data)); } catch (e) { respondError(res,next,e); }
});
catalogueRouter.get("/price-history/:packageId", async (req, res, next) => { try { res.json(await listPackagePriceHistory(actorFor(req)!, req.params.packageId)); } catch (e) { respondError(res,next,e); } });
catalogueRouter.post("/price-drafts", async (req, res, next) => {
  try { res.status(201).json(await savePriceDraft(commercialContext,actorFor(req)!,req.body)); } catch (e) { respondError(res,next,e); }
});
catalogueRouter.post("/drafts", async (req, res, next) => {
  const parsed = z.object({ package: z.unknown(), expectedRevision: z.number().int().nonnegative() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_DRAFT", message: "Check draft fields." });
  try { res.status(201).json(await savePackageDraft(commercialContext,actorFor(req)!,parsed.data as Parameters<typeof savePackageDraft>[2])); } catch (e) { respondError(res,next,e); }
});
catalogueRouter.post("/publications", async (req, res, next) => {
  const parsed = z.object({ packageId: z.string().min(1), expectedRevision: z.number().int().positive(), evidenceRef: z.string(), reason: z.string() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_PUBLICATION", message: "Check publication fields." });
  try { res.status(201).json(await publishPackageVersion(commercialContext,actorFor(req)!,parsed.data)); } catch (e) { respondError(res,next,e); }
});
catalogueRouter.post("/retirements", async (req, res, next) => {
  const parsed = z.object({ packageId: z.string().min(1), expectedRevision: z.number().int().positive(), expectedVersion: z.number().int().positive(), reason: z.string().min(1) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_RETIREMENT", message: "Check retirement fields." });
  try { res.status(201).json(await retirePackageVersion(commercialContext,actorFor(req)!,parsed.data)); } catch (e) { respondError(res,next,e); }
});
