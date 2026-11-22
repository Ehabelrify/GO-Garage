import type { DeliveryEntry, SendChannel, SendDocumentKind } from "./send-to-customer-logic";
import { invalidateForMutation } from "../invalidation";

export class DeliveryApiError extends Error { constructor(public status: number, public code: string) { super(code); } }

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", ...init, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  } catch { throw new DeliveryApiError(0, "NETWORK"); }
  const body = await response.json().catch(() => ({})) as { code?: string } & T;
  if (!response.ok) throw new DeliveryApiError(response.status, body.code ?? "REQUEST_FAILED");
  invalidateForMutation(url, init.method);
  return body;
}

export const documentDeliveryApi = {
  send: (input: { documentKind: SendDocumentKind; documentId: string; channel: SendChannel; idempotencyKey: string; verificationToken?: string }) =>
    call<{ entry: DeliveryEntry; replayed: boolean; simulated: boolean }>("/api/document-delivery/send", { method: "POST", body: JSON.stringify(input) }),
  history: (documentKind: SendDocumentKind, documentId: string) =>
    call<{ deliveries: DeliveryEntry[]; deliveryMode: "simulated" | "live" }>(`/api/document-delivery/history?${new URLSearchParams({ documentKind, documentId }).toString()}`),
};
