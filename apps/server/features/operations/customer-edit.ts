import { z } from "zod";

/** Splits "Make Model [Year]" into the vehicle columns (same rule POST /customers uses). */
export function splitMakeModel(makeModel: string) {
  const [make = "Vehicle", ...modelParts] = makeModel.trim().split(/\s+/);
  const yearText = modelParts.at(-1);
  const year = yearText && /^\d{4}$/.test(yearText) ? Number(yearText) : null;
  const model = year === null ? modelParts.join(" ") : modelParts.slice(0, -1).join(" ");
  return { make, model: model || "Vehicle", year };
}

export const customerPatchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(8).max(32),
  language: z.enum(["ar", "en"]),
}).strict();

export const customerVehicleSchema = z.object({
  plate: z.string().trim().min(2).max(20),
  makeModel: z.string().trim().min(2).max(100),
}).strict();

/** Digits only, 8 to 15 long; null when invalid. */
export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}
