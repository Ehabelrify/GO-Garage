import { parse360, type Parsed360 } from "./customers-logic";

export class RecordError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

/** GET /api/customers/:id/360 or /api/vehicles/:id/360. null when the record (or endpoint) is missing. */
export async function fetch360(kind: "customer" | "vehicle", id: string, signal?: AbortSignal): Promise<Parsed360 | null> {
  const response = await fetch(`/api/${kind === "customer" ? "customers" : "vehicles"}/${encodeURIComponent(id)}/360`, {
    credentials: "same-origin", signal, headers: { Accept: "application/json" },
  });
  if (response.status === 404 || response.status === 204) return null;
  const body = await response.json().catch(() => null) as { code?: string } | null;
  if (!response.ok) throw new RecordError(response.status, body?.code ?? "REQUEST_FAILED");
  return parse360(body);
}

export type WriteResult = { ok: true } | { ok: false; error: string; unsupported: boolean };

async function write(url: string, method: "PATCH" | "POST", payload: unknown): Promise<WriteResult> {
  try {
    const response = await fetch(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    if (response.ok) return { ok: true };
    const body = await response.json().catch(() => ({})) as { code?: string };
    // An unrouted path answers 404/405 without a JSON code: the server endpoint is not available yet.
    return { ok: false, error: body.code ?? "REQUEST_FAILED", unsupported: !body.code && (response.status === 404 || response.status === 405) };
  } catch {
    return { ok: false, error: "WRITE_OUTCOME_UNKNOWN", unsupported: false };
  }
}

/** PATCH /api/customers/:id { name, phone, language }. Requested server endpoint; handled gracefully when absent. */
export const updateCustomer = (id: string, input: { name: string; phone: string; language: "ar" | "en" }) =>
  write(`/api/customers/${encodeURIComponent(id)}`, "PATCH", input);

/** POST /api/customers/:id/vehicles { plate, makeModel }. Requested server endpoint; handled gracefully when absent. */
export const addVehicle = (customerId: string, input: { plate: string; makeModel: string }) =>
  write(`/api/customers/${encodeURIComponent(customerId)}/vehicles`, "POST", input);
