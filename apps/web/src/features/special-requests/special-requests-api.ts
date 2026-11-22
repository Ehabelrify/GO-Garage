import { parseHistory, parseRequest, type HistoryEvent, type SpecialRequest } from "./special-requests-logic";
import { invalidateForMutation } from "../../shared/invalidation";

export class RequestApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

async function call(url: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) }, ...init });
  } catch {
    throw new RequestApiError(0, "NETWORK");
  }
  const body = await response.json().catch(() => null) as { code?: string } | null;
  if (!response.ok) throw new RequestApiError(response.status, body?.code ?? "REQUEST_FAILED");
  invalidateForMutation(url, init?.method);
  return body;
}
const post = (url: string, payload: unknown) => call(url, { method: "POST", body: JSON.stringify(payload) });
const base = "/api/special-requests";
const enc = encodeURIComponent;

export async function listRequests(filter: { customerId?: string; vehicleId?: string } = {}, signal?: AbortSignal): Promise<{ requests: SpecialRequest[]; canReview: boolean }> {
  const params = new URLSearchParams();
  if (filter.customerId) params.set("customerId", filter.customerId);
  if (filter.vehicleId) params.set("vehicleId", filter.vehicleId);
  const query = params.toString();
  const body = await call(`${base}${query ? `?${query}` : ""}`, { signal }) as { requests?: unknown[]; canReview?: boolean };
  return { requests: (body.requests ?? []).map(parseRequest).filter((r): r is SpecialRequest => r !== null), canReview: body.canReview === true };
}
export async function readRequest(id: string): Promise<{ request: SpecialRequest; history: HistoryEvent[] } | null> {
  const body = await call(`${base}/${enc(id)}`) as { request?: unknown; history?: unknown };
  const request = parseRequest(body.request);
  return request ? { request, history: parseHistory(body.history) } : null;
}
export const createRequest = (payload: unknown) => post(base, payload) as Promise<{ id: string }>;
export const startReview = (id: string, expectedRevision: number) => post(`${base}/${enc(id)}/start-review`, { expectedRevision });
export const decide = (id: string, payload: unknown) => post(`${base}/${enc(id)}/decision`, payload);
export const addInfo = (id: string, expectedRevision: number, text: string) => post(`${base}/${enc(id)}/info`, { expectedRevision, text });
export const closeRequest = (id: string, expectedRevision: number, reason: string) => post(`${base}/${enc(id)}/close`, { expectedRevision, reason });

const errorCopy: Record<string, { en: string; ar: string }> = {
  INVALID_SPECIAL_REQUEST: { en: "Check the request fields.", ar: "راجع بيانات الطلب." },
  DECISION_INCOMPLETE: { en: "Fill in every required field for this decision.", ar: "أكمل الحقول المطلوبة لهذا القرار." },
  REVISION_CONFLICT: { en: "This request was changed by someone else. Reload and try again.", ar: "تم تعديل الطلب من مستخدم آخر. أعد التحميل وحاول مجدداً." },
  INVALID_STATE: { en: "This request is no longer in a state that allows this action.", ar: "لم تعد حالة الطلب تسمح بهذا الإجراء." },
  VEHICLE_NOT_FOUND: { en: "That vehicle does not belong to this customer or branch.", ar: "هذه المركبة لا تتبع هذا العميل أو الفرع." },
  ROLE_FORBIDDEN: { en: "Your role cannot do this.", ar: "صلاحيتك لا تسمح بهذا الإجراء." },
  DEMO_ACTION_DISABLED: { en: "Not available in a role preview session.", ar: "غير متاح في جلسة معاينة الدور." },
  REQUEST_NOT_FOUND: { en: "Request not found.", ar: "الطلب غير موجود." },
  NETWORK: { en: "The request could not be sent. Check the connection and try again.", ar: "تعذر إرسال الطلب. تحقق من الاتصال وحاول مجدداً." },
};
export function requestErrorMessage(error: unknown, lang: "ar" | "en"): string {
  const code = error instanceof RequestApiError ? error.code : "NETWORK";
  const copy = errorCopy[code];
  return copy ? copy[lang] : lang === "ar" ? "تعذر حفظ التغيير." : "The change could not be saved.";
}
