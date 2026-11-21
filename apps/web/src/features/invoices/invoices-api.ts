export interface InvoiceLine {
  id: string; position: number; kind: "package" | "service" | "add-on" | "transport" | "fee" | "other";
  descriptionEn: string; descriptionAr: string; quantity: number; unitMinor: number | null; discountMinor: number; taxMinor: number | null; amountMinor: number | null;
}
export interface Invoice {
  id: string; number: string | null; status: "draft" | "issued" | "partial" | "paid" | "void"; source: string; currency: string; branchId: string;
  customerId: string; customerName: string | null; vehicleId: string; plate: string | null; bookingId: string | null; jobId: string | null; quoteId: string | null; warrantyId: string | null;
  taxRatePercent: number | null; subtotalMinor: number | null; discountMinor: number; taxMinor: number | null; totalMinor: number | null; paidMinor: number; balanceMinor: number | null;
  issueDate: string | null; notes: string; terms: string; revision: number; createdAt: string; updatedAt: string; issuedAt: string | null; voidReason: string | null;
}
export interface InvoiceDetail {
  invoice: Invoice; lines: InvoiceLine[];
  history: Array<{ seq: number; action: string; fromStatus: string | null; toStatus: string; actorName: string | null; reason: string; occurredAt: string }>;
  payments: Array<{ id: string; amountMinor: number; currency: string; method: string; reference: string; receivedOn: string; recordedAt: string }>;
  canWrite: boolean; canVoid: boolean;
}
export type DraftLineInput = Pick<InvoiceLine, "kind" | "descriptionEn" | "descriptionAr" | "quantity" | "unitMinor" | "discountMinor" | "taxMinor">;
export interface DraftInput { expectedRevision: number; currency?: string; taxRatePercent: number | null; notes: string; terms: string; lines: DraftLineInput[] }

export class InvoiceApiError extends Error { constructor(public status: number, public code: string) { super(code); } }

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", ...init, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  } catch {
    throw new InvoiceApiError(0, init.method && init.method !== "GET" ? "WRITE_OUTCOME_UNKNOWN" : "NETWORK");
  }
  const body = await response.json().catch(() => ({})) as { code?: string } & T;
  if (!response.ok) throw new InvoiceApiError(response.status, body.code ?? "REQUEST_FAILED");
  return body;
}
const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

export const invoicesApi = {
  list: (filter: { customerId?: string; vehicleId?: string; jobId?: string; status?: string } = {}) =>
    call<{ invoices: Invoice[]; canWrite: boolean; canVoid: boolean }>(`/api/invoices?${new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString()}`),
  get: (id: string) => call<InvoiceDetail>(`/api/invoices/${encodeURIComponent(id)}`),
  generate: (by: { jobId?: string; bookingId?: string }) => call<InvoiceDetail>("/api/invoices/generate", post(by)),
  save: (id: string, input: DraftInput) => call<InvoiceDetail>(`/api/invoices/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }),
  issue: (id: string, expectedRevision: number) => call<InvoiceDetail>(`/api/invoices/${encodeURIComponent(id)}/issue`, post({ expectedRevision })),
  void: (id: string, expectedRevision: number, reason: string) => call<InvoiceDetail>(`/api/invoices/${encodeURIComponent(id)}/void`, post({ expectedRevision, reason })),
  pay: (id: string, input: { expectedRevision: number; amountMinor: number; method: string; reference: string; receivedOn: string }) =>
    call<InvoiceDetail>(`/api/invoices/${encodeURIComponent(id)}/payments`, post(input)),
};
