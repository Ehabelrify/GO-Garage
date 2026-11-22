import { z } from "zod";
import { isPlausiblePlate, normalizePlate, phoneDigits } from "@garage/domain";

/** Splits "Make Model [Year]" into the vehicle columns (same rule POST /customers uses). */
export function splitMakeModel(makeModel: string) {
  const [make = "Vehicle", ...modelParts] = makeModel.trim().split(/\s+/);
  const yearText = modelParts.at(-1);
  const year = yearText && /^\d{4}$/.test(yearText) ? Number(yearText) : null;
  const model = year === null ? modelParts.join(" ") : modelParts.slice(0, -1).join(" ");
  return { make, model: model || "Vehicle", year };
}

/** Normalised plate (letters + digits, Arabic or Latin). Trimmed text is stored as typed; comparisons use normalizePlate. */
export const plateField = z.string().trim().min(2).max(20).refine(isPlausiblePlate, "implausible plate");

export const customerPatchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(8).max(32),
  language: z.enum(["ar", "en"]),
}).strict();

export const customerVehicleSchema = z.object({
  plate: plateField,
  makeModel: z.string().trim().min(2).max(100),
}).strict();

export interface DuplicatePlate { vehicleId: string; customerId: string; plate: string }
type Queryable = { query: (text: string, values: unknown[]) => Promise<{ rows: Array<{ id: string; customer_id: string; plate: string }> }> };

/**
 * Existing, non-archived vehicle with the same canonical plate that belongs to the given customer or to any customer
 * sharing one of the given branches (null when none). SQL side uses garage_normalize_plate (migration 0032).
 */
export async function findDuplicatePlate(db: Queryable, plate: string, scope: { customerId?: string; branchIds: string[] }): Promise<DuplicatePlate | null> {
  const key = normalizePlate(plate);
  if (!key) return null;
  const found = await db.query(
    `SELECT v.id, v.customer_id, v.plate FROM vehicles v
      WHERE garage_normalize_plate(v.plate) = $1
        AND NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind IN ('vehicle','customer') AND ra.entity_id IN (v.id, v.customer_id))
        AND (v.customer_id = $2 OR EXISTS (SELECT 1 FROM customer_branches cb WHERE cb.customer_id = v.customer_id AND cb.branch_id = ANY($3::text[])))
      ORDER BY v.created_at LIMIT 1`,
    [key, scope.customerId ?? "", scope.branchIds],
  );
  const row = found.rows[0];
  return row ? { vehicleId: row.id, customerId: row.customer_id, plate: row.plate } : null;
}

/** Digits only, 8 to 15 long; null when invalid. */
export function normalizePhone(phone: string): string | null {
  const digits = phoneDigits(phone);
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}
