import { normaliseCatalogue, type CatalogueItem, type CatalogueKind, type IntakePayload, type IntakeResult } from "./intake-logic";
import { invalidateForMutation } from "../../shared/invalidation";

export class IntakeError extends Error {
  constructor(public status: number, public code: string, public body: Record<string, unknown> = {}) { super(code); }
}

async function call<T>(url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "same-origin", signal, ...init,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") throw error;
    throw new IntakeError(0, "WRITE_OUTCOME_UNKNOWN");
  }
  if (response.status === 204) return null;
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    // An unrouted path answers 404/405 without a JSON code: the endpoint does not exist yet.
    const code = typeof body?.code === "string" ? body.code : response.status === 404 || response.status === 405 ? "NOT_AVAILABLE" : "REQUEST_FAILED";
    throw new IntakeError(response.status, code, body ?? {});
  }
  invalidateForMutation(url, init.method);
  return body as T;
}

/** GET /api/catalogue/intake-items. 404 or an unrouted path resolves to [] so the panel still works for customer-only. */
export async function fetchIntakeItems(
  params: { q?: string; kind?: CatalogueKind | "all"; vehicleId?: string; branchId?: string }, signal?: AbortSignal,
): Promise<CatalogueItem[]> {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set("q", params.q.trim());
  if (params.kind && params.kind !== "all") query.set("kind", params.kind);
  if (params.vehicleId) query.set("vehicleId", params.vehicleId);
  if (params.branchId) query.set("branchId", params.branchId);
  try {
    return normaliseCatalogue(await call<unknown>(`/api/catalogue/intake-items?${query.toString()}`, {}, signal));
  } catch (error) {
    if (error instanceof IntakeError && error.status === 404) return [];
    throw error;
  }
}

/** POST /api/intake. */
export async function submitIntake(payload: IntakePayload): Promise<IntakeResult> {
  const body = await call<Partial<IntakeResult>>("/api/intake", { method: "POST", body: JSON.stringify(payload) });
  return {
    customerId: String(body?.customerId ?? ""),
    vehicleId: body?.vehicleId ? String(body.vehicleId) : null,
    quoteId: body?.quoteId ?? null,
    quoteRevision: body?.quoteRevision ?? null,
    bookingId: body?.bookingId ?? null,
    conversationId: body?.conversationId ?? null,
    warnings: Array.isArray(body?.warnings) ? body!.warnings!.filter((item): item is string => typeof item === "string") : [],
  };
}

/** POST /api/whatsapp/conversations/:id/link. */
export async function linkConversation(conversationId: string, customerId: string, vehicleId?: string): Promise<void> {
  await call(`/api/whatsapp/conversations/${encodeURIComponent(conversationId)}/link`, {
    method: "POST", body: JSON.stringify({ customerId, ...(vehicleId ? { vehicleId } : {}) }),
  });
}

/** Existing endpoint: POST /api/customers/:id/vehicles. Used only to resolve a duplicate plate message. */
export interface ExistingVehicleHint { id: string; customerId: string; plate: string }
export function duplicateVehicleOf(error: unknown): ExistingVehicleHint | null {
  if (!(error instanceof IntakeError) || error.code !== "DUPLICATE_PLATE") return null;
  const existing = error.body.existingVehicle as Partial<ExistingVehicleHint> | undefined;
  return existing?.id ? { id: String(existing.id), customerId: String(existing.customerId ?? ""), plate: String(existing.plate ?? "") } : null;
}

export const errorCopy: Record<string, { en: string; ar: string }> = {
  DUPLICATE_PLATE: { en: "A vehicle with this plate already exists.", ar: "توجد مركبة مسجلة بنفس اللوحة." },
  DUPLICATE_PHONE: { en: "A customer with this phone already exists.", ar: "يوجد عميل بنفس رقم الهاتف." },
  NOT_AVAILABLE: { en: "This action is not available yet on the server.", ar: "هذا الإجراء غير متاح بعد على الخادم." },
  WRITE_OUTCOME_UNKNOWN: { en: "We could not confirm it was saved. Check before trying again.", ar: "تعذر التأكد من الحفظ. راجع قبل المحاولة مجدداً." },
  FORBIDDEN: { en: "Your role cannot do this.", ar: "دورك لا يسمح بهذا الإجراء." },
  REQUEST_FAILED: { en: "It could not be saved. Try again.", ar: "تعذر الحفظ. حاول مجدداً." },
};

export function intakeErrorText(error: unknown, lang: "en" | "ar"): string {
  const code = error instanceof IntakeError ? error.code : "REQUEST_FAILED";
  const entry = errorCopy[code] ?? errorCopy.REQUEST_FAILED;
  return entry[lang];
}
