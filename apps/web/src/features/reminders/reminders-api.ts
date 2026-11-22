export type ReminderKind = "booking_day_before" | "booking_morning_of" | "ready_for_pickup" | "warranty_expiry" | "quote_followup" | "post_service_checkin";
export type ReminderStatus = "due" | "upcoming" | "snoozed" | "sent-simulated" | "skipped" | "cancelled";

export interface ReminderItem {
  id: string; kind: ReminderKind; status: ReminderStatus; storedStatus: string; reason: string | null; body: string; language: "ar" | "en";
  dueAt: string; snoozedUntil: string | null; sentAt: string | null; branchId: string; customerId: string; customerName: string;
  vehicleId: string | null; plate: string | null; bookingId: string | null; jobId: string | null; warrantyId: string | null; quoteId: string | null; conversationId: string | null;
}
export interface ReminderList {
  reminders: ReminderItem[]; counts: Record<ReminderStatus, number>; deliveryMode: "simulated"; canAct: boolean; canRun: boolean; canManageRules: boolean;
}
export interface RuleView {
  kind: ReminderKind; enabled: boolean; leadDays: number; autoSend: boolean; templateEn: string; templateAr: string; revision: number;
  placeholders: string[]; leadMin: number; leadMax: number;
}
export interface RunSummary { now: string; generated: number; skippedNoConsent: number; autoSent: number; cancelled: number; byKind: Record<string, number> }

export class ReminderApiError extends Error { constructor(public status: number, public code: string) { super(code); } }

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", ...init, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  } catch {
    throw new ReminderApiError(0, init.method && init.method !== "GET" ? "WRITE_OUTCOME_UNKNOWN" : "NETWORK");
  }
  const body = await response.json().catch(() => ({})) as { code?: string } & T;
  if (!response.ok) throw new ReminderApiError(response.status, body.code ?? "REQUEST_FAILED");
  return body;
}
const post = (body: unknown = {}) => ({ method: "POST", body: JSON.stringify(body) });
const id = encodeURIComponent;

export const remindersApi = {
  list: () => call<ReminderList>("/api/reminders"),
  rules: () => call<{ rules: RuleView[]; canManageRules: boolean }>("/api/reminders/rules"),
  saveRule: (kind: ReminderKind, patch: { expectedRevision: number; enabled?: boolean; leadDays?: number; autoSend?: boolean; templateEn?: string; templateAr?: string }) =>
    call<{ rule: RuleView }>(`/api/reminders/rules/${id(kind)}`, { method: "PUT", body: JSON.stringify(patch) }),
  preview: (kind: ReminderKind, template: string, lang: "ar" | "en") =>
    call<{ text: string; problem: string | null; unknown: string[] }>("/api/reminders/rules/preview", post({ kind, template, lang })),
  run: () => call<RunSummary>("/api/reminders/run", post()),
  send: (reminderId: string) => call<{ reminder: ReminderItem }>(`/api/reminders/${id(reminderId)}/send`, post()),
  skip: (reminderId: string) => call<{ reminder: ReminderItem }>(`/api/reminders/${id(reminderId)}/skip`, post()),
  snooze: (reminderId: string, days: number) => call<{ reminder: ReminderItem }>(`/api/reminders/${id(reminderId)}/snooze`, post({ days })),
};
