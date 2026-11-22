import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GarageActor } from "../auth/authz";
import { buildDocumentMessage, maskPhone } from "./document-message";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query },
  withTransaction: async (run: (client: { query: typeof query }) => unknown) => run({ query }),
}));
const service = await import("./document-delivery-service");

const actor = (over: Partial<GarageActor> = {}): GarageActor => ({ userId: "u1", email: "a@b.c", name: "A", role: "branch-manager", branchIds: ["b1"], ...over });
const invoiceRow = { id: "inv1", branch_id: "b1", customer_id: "c1", number: "INV-1", status: "issued", currency: "EGP", total_minor: "150000", paid_minor: "0", plate: "ABC1234" };

interface World { language: "ar" | "en"; consent: boolean; prior?: object; invoice?: object | null; log: unknown[][] }
function world(over: Partial<World> = {}) {
  const state: World = { language: "en", consent: true, invoice: invoiceRow, log: [], ...over };
  query.mockImplementation(async (rawSql?: string, args: unknown[] = []) => {
    const sql = String(rawSql ?? "");
    if (sql.includes("FROM invoices i")) return { rows: state.invoice ? [state.invoice] : [], rowCount: state.invoice ? 1 : 0 };
    if (sql.includes("FROM document_delivery_log WHERE environment_id = $1 AND idempotency_key")) return { rows: state.prior ? [state.prior] : [], rowCount: state.prior ? 1 : 0 };
    if (sql.includes("FROM customers")) return { rows: [{ name: "Ahmed", phone_normalized: "+201001234567", preferred_language: state.language }], rowCount: 1 };
    if (sql.includes("FROM messaging_channels")) return { rows: [{ id: "ch1" }], rowCount: 1 };
    if (sql.includes("FROM messaging_customer_consents")) return { rows: state.consent ? [{}] : [], rowCount: state.consent ? 1 : 0 };
    if (sql.includes("INSERT INTO document_delivery_log")) {
      state.log.push(args);
      return { rows: [{ id: "ddl-1", document_kind: "invoice", document_id: "inv1", status: args[8], delivery_mode: args[9], trigger: args[10], recipient_masked: args[7], language: args[6], link_included: args[11], created_at: new Date("2026-11-22T10:00:00Z") }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return state;
}
const request = (over = {}) => ({ documentKind: "invoice" as const, documentId: "inv1", channel: "whatsapp" as const, idempotencyKey: "key-12345678", ...over });
const code = async (promise: Promise<unknown>) => promise.then(() => "ok", (e: { code?: string; status?: number }) => `${e.status}:${e.code}`);

beforeEach(() => query.mockReset());

describe("sendDocument", () => {
  it("refuses with 422 CONSENT_REQUIRED and writes nothing when consent is missing", async () => {
    const state = world({ consent: false });
    expect(await code(service.sendDocument(actor(), request()))).toBe("422:CONSENT_REQUIRED");
    expect(state.log).toHaveLength(0);
  });

  it("records a simulated send, never claiming delivery", async () => {
    const state = world();
    const result = await service.sendDocument(actor(), request());
    expect(result.simulated).toBe(true);
    expect(result.entry.status).toBe("sent-simulated");
    expect(result.entry.deliveryMode).toBe("simulated");
    expect(result.entry.recipient).not.toContain("1234567");
    expect(state.log).toHaveLength(1);
  });

  it("replays the stored result for the same idempotency key without sending again", async () => {
    const state = world({ prior: { id: "ddl-0", document_kind: "invoice", document_id: "inv1", status: "sent-simulated", delivery_mode: "simulated", trigger: "manual",
      recipient_masked: "+20•••567", language: "en", link_included: false, created_at: new Date(), request_hash: undefined } });
    const hash = (await import("node:crypto")).createHash("sha256").update("invoice|inv1|whatsapp").digest("hex");
    (state.prior as { request_hash?: string }).request_hash = hash;
    const result = await service.sendDocument(actor(), request());
    expect(result.replayed).toBe(true);
    expect(state.log).toHaveLength(0);
  });

  it("rejects a reused key that belongs to a different document", async () => {
    world({ prior: { id: "ddl-0", document_kind: "quote", document_id: "q9", status: "sent-simulated", delivery_mode: "simulated", trigger: "manual", recipient_masked: "x", language: "en", link_included: false, created_at: new Date(), request_hash: "other" } });
    expect(await code(service.sendDocument(actor(), request()))).toBe("409:IDEMPOTENCY_CONFLICT");
  });

  it("denies a role without the capability", async () => {
    world();
    expect(await code(service.sendDocument(actor({ role: "technician" }), request()))).toBe("403:ROLE_FORBIDDEN");
    expect(await code(service.sendDocument(actor({ role: "technician" }), request({ documentKind: "quote", documentId: "q1" })))).toBe("403:ROLE_FORBIDDEN");
  });

  it("hides a document from another branch", async () => {
    world();
    expect(await code(service.sendDocument(actor({ branchIds: ["b2"] }), request()))).toBe("404:DOCUMENT_NOT_FOUND");
  });

  it("refuses a demo session, a draft invoice and the not-yet-available app channel", async () => {
    world();
    expect(await code(service.sendDocument(actor({ isDemo: true }), request()))).toBe("403:DEMO_ACTION_DISABLED");
    expect(await code(service.sendDocument(actor(), request({ channel: "app" })))).toBe("501:CHANNEL_NOT_AVAILABLE");
    world({ invoice: { ...invoiceRow, status: "draft" } });
    expect(await code(service.sendDocument(actor(), request()))).toBe("409:INVOICE_NOT_SENDABLE");
  });

  it("writes the message in the customer's language", async () => {
    const ar = world({ language: "ar" });
    await service.sendDocument(actor(), request());
    expect(ar.log[0][6]).toBe("ar");
    expect(String(ar.log[0][12])).toContain("فاتورتك");
    const en = world({ language: "en" });
    await service.sendDocument(actor(), request({ idempotencyKey: "key-87654321" }));
    expect(en.log[0][6]).toBe("en");
    expect(String(en.log[0][12])).toContain("your invoice");
  });
});

describe("autoSendOnIssue", () => {
  it("never throws and rolls back to its savepoint when consent is missing", async () => {
    world({ consent: false });
    const result = await service.autoSendOnIssue({ query } as never, "invoice", "inv1", "issued");
    expect(result).toEqual({ sent: false, reason: "CONSENT_REQUIRED" });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("ROLLBACK TO SAVEPOINT"))).toBe(true);
  });
});

describe("message text", () => {
  const base = { kind: "warranty-card" as const, customerName: "Ahmed", reference: "W1", date: "2027-01-15" };
  it("includes a link only when one is supplied", () => {
    expect(buildDocumentMessage({ ...base, lang: "en", link: "https://x.test/warranty/verify/t" })).toMatchObject({ linkIncluded: true });
    const without = buildDocumentMessage({ ...base, lang: "ar" });
    expect(without.linkIncluded).toBe(false);
    expect(without.body).not.toContain("http");
  });
  it("formats money by currency exponent and masks phones", () => {
    expect(buildDocumentMessage({ kind: "quote", lang: "en", customerName: "A", reference: "Q", totalMinor: 150000, currency: "EGP" }).body).toContain("EGP 1500.00");
    expect(maskPhone("+201001234567")).toBe("+20•••••••567");
  });
});
