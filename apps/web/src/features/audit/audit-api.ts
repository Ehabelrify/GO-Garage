import { parseAuditEvent, parseSummary, type AuditEvent, type DailySummary } from "./audit-logic";

export class AuditApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

async function call(url: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try { response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" }, signal }); } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") throw error;
    throw new AuditApiError(0, "NETWORK");
  }
  const body = await response.json().catch(() => null) as { code?: string } | null;
  if (!response.ok) throw new AuditApiError(response.status, body?.code ?? "REQUEST_FAILED");
  return body;
}

export async function fetchAudit(query: string, signal?: AbortSignal): Promise<{ events: AuditEvent[]; nextCursor: string | null }> {
  const body = await call(`/api/audit?${query}`, signal) as { events?: unknown[]; nextCursor?: unknown };
  return { events: (body.events ?? []).map(parseAuditEvent).filter((item): item is AuditEvent => item !== null), nextCursor: typeof body.nextCursor === "string" ? body.nextCursor : null };
}

export async function fetchAuditActors(signal?: AbortSignal): Promise<Array<{ id: string; name: string; role: string }>> {
  const body = await call("/api/audit/actors", signal) as { actors?: Array<{ id?: unknown; name?: unknown; role?: unknown }> };
  return (body.actors ?? []).filter((item) => typeof item.id === "string" && typeof item.name === "string").map((item) => ({ id: String(item.id), name: String(item.name), role: String(item.role ?? "") }));
}

export async function fetchDailySummary(date: string, branchId: string, signal?: AbortSignal): Promise<DailySummary> {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (branchId && branchId !== "all") params.set("branchId", branchId);
  const summary = parseSummary(await call(`/api/reports/daily-summary?${params.toString()}`, signal));
  if (!summary) throw new AuditApiError(500, "BAD_RESPONSE");
  return summary;
}

export const exportUrl = (query: string) => `/api/audit/export.csv?${query}`;

export const auditErrorCopy: Record<string, { en: string; ar: string }> = {
  ROLE_FORBIDDEN: { en: "The activity log is available to the Owner only.", ar: "سجل النشاط متاح للمالك فقط." },
  INVALID_AUDIT_FILTER: { en: "Check the dates and filters.", ar: "راجع التواريخ والمرشحات." },
  INVALID_AUDIT_CURSOR: { en: "The list changed. Reload it.", ar: "تغيرت القائمة. أعد تحميلها." },
  INVALID_DATE: { en: "Choose a valid date.", ar: "اختر تاريخاً صحيحاً." },
  NETWORK: { en: "Could not reach the server. Check the connection and try again.", ar: "تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً." },
};
export const auditErrorMessage = (error: unknown, lang: "en" | "ar") => {
  const code = error instanceof AuditApiError ? error.code : "";
  return auditErrorCopy[code]?.[lang] ?? (lang === "ar" ? "تعذر تحميل البيانات. حاول مجدداً." : "Could not load the data. Try again.");
};
