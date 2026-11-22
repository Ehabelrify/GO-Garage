/** Client for the duplicate-customer endpoints (GET /api/customers/duplicates, /merges, POST /merge/preview, /merge, /merge/:id/undo). */
export interface DupCustomer { id: string; name: string; phone: string; vehicles: { plate: string }[]; bookings: number }
export interface DupReason { kind: "phone" | "plate" | "name"; detail: string }
export interface DupPair { key: string; a: DupCustomer; b: DupCustomer; score: number; band: "high" | "medium" | "low"; reasons: DupReason[]; suggestedSurvivorId: string }
export interface PlanCount { key: string; labelEn: string; labelAr: string; count: number }
export interface MergePlan {
  survivor: { id: string; name: string; phone: string };
  merged: { id: string; name: string; phone: string };
  vehicles: { moved: { id: string; plate: string }[]; collided: { mergedVehicleId: string; survivorVehicleId: string; plate: string }[] };
  counts: PlanCount[];
  leftInPlace: PlanCount[];
  total: number;
}
export interface MergeEntry { id: string; survivorId: string; survivorName: string; mergedId: string; mergedName: string; reason: string; mergedAt: string; undoneAt: string | null; undoableUntil: string; canUndo: boolean }

export class MergeApiError extends Error {
  constructor(public status: number, public code: string, public details?: unknown) { super(code); }
}

async function call(url: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) }, ...init });
  } catch {
    throw new MergeApiError(0, "NETWORK");
  }
  const body = await response.json().catch(() => null) as { code?: string; details?: unknown } | null;
  if (!response.ok) throw new MergeApiError(response.status, body?.code ?? "REQUEST_FAILED", body?.details);
  return body;
}
const post = (url: string, payload: unknown) => call(url, { method: "POST", body: JSON.stringify(payload) });

const text = (value: unknown) => (typeof value === "string" ? value : "");
function parseCustomer(raw: unknown): DupCustomer {
  const r = (raw ?? {}) as Record<string, unknown>;
  return { id: text(r.id), name: text(r.name), phone: text(r.phone), bookings: Number(r.bookings) || 0,
    vehicles: Array.isArray(r.vehicles) ? r.vehicles.map((v) => ({ plate: text((v as { plate?: unknown }).plate) })) : [] };
}

export async function fetchDuplicates(signal?: AbortSignal): Promise<DupPair[]> {
  const body = await call("/api/customers/duplicates", { signal }) as { pairs?: unknown[] };
  return (body.pairs ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    return { key: text(r.key), a: parseCustomer(r.a), b: parseCustomer(r.b), score: Number(r.score) || 0,
      band: r.band === "high" || r.band === "medium" ? r.band : "low", suggestedSurvivorId: text(r.suggestedSurvivorId),
      reasons: Array.isArray(r.reasons) ? r.reasons.map((x) => ({ kind: (x as DupReason).kind, detail: text((x as DupReason).detail) })) : [] } satisfies DupPair;
  });
}
export async function fetchMerges(signal?: AbortSignal): Promise<MergeEntry[]> {
  const body = await call("/api/customers/merges", { signal }) as { merges?: MergeEntry[] };
  return body.merges ?? [];
}
export const previewMerge = (survivorId: string, mergedId: string) => post("/api/customers/merge/preview", { survivorId, mergedId }) as Promise<MergePlan>;
export const runMerge = (survivorId: string, mergedId: string, reason: string) => post("/api/customers/merge", { survivorId, mergedId, reason }) as Promise<{ mergeId: string; total: number }>;
export const undoMerge = (id: string, reason: string) => post(`/api/customers/merge/${encodeURIComponent(id)}/undo`, { reason });

const errors: Record<string, [string, string]> = {
  OWNER_REQUIRED: ["Only the Owner can merge customers.", "الدمج للمالك فقط."],
  DEMO_ACTION_DISABLED: ["Not available in a demo session.", "غير متاح في الجلسة التجريبية."],
  ALREADY_ARCHIVED: ["One of these customers is archived.", "أحد العميلين مؤرشف."],
  ALREADY_MERGED: ["One of these customers was already merged.", "تم دمج أحد العميلين من قبل."],
  ALREADY_UNDONE: ["This merge was already undone.", "تم التراجع عن هذا الدمج من قبل."],
  UNDO_WINDOW_PASSED: ["The 30-day undo window has passed.", "انتهت مهلة التراجع (30 يوما)."],
  UNDO_CONFLICT: ["Records changed after the merge, so it cannot be undone safely.", "تغيرت سجلات بعد الدمج، فلا يمكن التراجع بأمان."],
  RECORD_NOT_FOUND: ["Customer not found.", "العميل غير موجود."],
  NETWORK: ["Could not reach the server.", "تعذر الوصول إلى الخادم."],
};
export const mergeErrorMessage = (error: unknown, lang: "en" | "ar") => {
  const code = error instanceof MergeApiError ? error.code : "";
  const pair = errors[code] ?? ["Something went wrong. Try again.", "حدث خطأ. حاول مرة أخرى."];
  return lang === "ar" ? pair[1] : pair[0];
};
