import { invalidateForMutation } from "../../shared/invalidation";
import { PickupApiError } from "./pickup-logic";

async function post<T>(url: string, body: unknown, key: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) });
  } catch { throw new PickupApiError(0, "WRITE_OUTCOME_UNKNOWN"); }
  const data = await response.json().catch(() => ({})) as { code?: string } & T;
  if (!response.ok) throw new PickupApiError(response.status, data.code ?? "REQUEST_FAILED");
  invalidateForMutation(url, "POST");
  return data;
}

export const pickupApi = {
  record: (input: { bookingId: string; promisedAt: string; evidenceRef: string; reason: string; expectedRevision: number }, key: string) =>
    post<{ commitmentId: string }>("/api/pickup-commitments", input, key),
  cancel: (commitmentId: string, input: { reason: string; expectedRevision: number }, key: string) =>
    post<{ commitmentId: string }>(`/api/pickup-commitments/${encodeURIComponent(commitmentId)}/cancel`, input, key),
};

export interface PickupHead { bookingId: string; revision: number; commitmentId: string | null; status: "none" | "active" | "cancelled"; promisedAt: string | null }

/** Reads the latest revision so the drawer can send the right expectedRevision first time. */
export async function readPickupHead(ref: { bookingId: string } | { commitmentId: string }): Promise<PickupHead> {
  let response: Response;
  try { response = await fetch(`/api/pickup-commitments?${"bookingId" in ref ? `bookingId=${encodeURIComponent(ref.bookingId)}` : `commitmentId=${encodeURIComponent(ref.commitmentId)}`}`, { credentials: "same-origin", headers: { Accept: "application/json" } }); }
  catch { throw new PickupApiError(0, "WRITE_OUTCOME_UNKNOWN"); }
  const data = await response.json().catch(() => ({})) as { code?: string } & PickupHead;
  if (!response.ok) throw new PickupApiError(response.status, data.code ?? "REQUEST_FAILED");
  return data;
}
