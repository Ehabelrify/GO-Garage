import { describe, expect, it, vi } from "vitest";
import type { GarageActor } from "../auth/authz";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query },
  withTransaction: async (run: (client: { query: typeof query }) => unknown) => run({ query }),
}));
const service = await import("./invoice-service");

const actor = (role: GarageActor["role"], extra: Partial<GarageActor> = {}): GarageActor => ({ userId: `${role}-1`, email: "", name: role, role, branchIds: ["branch-a"], ...extra });
const empty = () => { query.mockReset(); query.mockResolvedValue({ rows: [], rowCount: 0 }); };
const draftUpdate = { expectedRevision: 1, taxRatePercent: null, notes: "", terms: "", lines: [{ kind: "service" as const, descriptionEn: "x", descriptionAr: "", quantity: 1, unitMinor: 100, discountMinor: 0, taxMinor: 0 }] };

describe("invoice authorization", () => {
  it("denies technicians before any query", async () => {
    empty();
    await expect(service.listInvoices(actor("technician"), {})).rejects.toMatchObject({ status: 403 });
    await expect(service.getInvoice(actor("technician"), "i1")).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });
  it("blocks writes for demo identities, even the owner role", async () => {
    empty();
    const demo = actor("owner", { isDemo: true });
    await expect(service.generateInvoice(demo, { jobId: "j1" })).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });
    await expect(service.issueInvoice(demo, "i1", 1)).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });
    await expect(service.updateDraft(demo, "i1", draftUpdate)).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });
    expect(query).not.toHaveBeenCalled();
  });
  it("only the owner (or finance plus manage) voids", async () => {
    empty();
    await expect(service.voidInvoice(actor("receptionist"), "i1", 1, "mistake")).rejects.toMatchObject({ status: 403 });
    await expect(service.voidInvoice(actor("branch-manager"), "i1", 1, "mistake")).rejects.toMatchObject({ status: 404, code: "INVOICE_NOT_FOUND" });
  });
  it("rejects an unsupported currency and a bad discount before any query", async () => {
    empty();
    await expect(service.updateDraft(actor("owner"), "i1", { ...draftUpdate, currency: "EUR" })).rejects.toMatchObject({ code: "UNSUPPORTED_CURRENCY" });
    await expect(service.updateDraft(actor("owner"), "i1", { ...draftUpdate, lines: [{ ...draftUpdate.lines[0], discountMinor: 500 }] })).rejects.toMatchObject({ code: "INVALID_LINE" });
    expect(query).not.toHaveBeenCalled();
  });
});

describe("invoice state", () => {
  const row = (over: Record<string, unknown>) => ({ rows: [{ id: "i1", branch_id: "branch-a", status: "draft", revision: 3, currency: "EGP", total_minor: "1000", paid_minor: "0", ...over }], rowCount: 1 });
  it("detects a stale revision", async () => {
    query.mockReset(); query.mockResolvedValue(row({}));
    await expect(service.issueInvoice(actor("owner"), "i1", 1)).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
  });
  it("refuses to edit an issued invoice", async () => {
    query.mockReset(); query.mockResolvedValue(row({ status: "issued" }));
    await expect(service.updateDraft(actor("owner"), "i1", { ...draftUpdate, expectedRevision: 3 })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
  it("refuses an unpriced issue", async () => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      if (String(sql).includes("FROM invoices i")) return row({});
      if (String(sql).includes("FROM invoice_lines")) return { rows: [{ id: "l", position: 0, kind: "service", description_en: "x", description_ar: "", quantity: "1", unit_minor: null, discount_minor: "0", tax_minor: null }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await expect(service.issueInvoice(actor("owner"), "i1", 3)).rejects.toMatchObject({ code: "INVOICE_UNPRICED" });
  });
  it("refuses overpayment and voiding a paid invoice", async () => {
    query.mockReset(); query.mockResolvedValue(row({ status: "issued" }));
    const pay = { expectedRevision: 3, amountMinor: 2000, method: "cash" as const, reference: "R1", receivedOn: "2026-11-21" };
    await expect(service.recordPayment(actor("owner"), "i1", pay)).rejects.toMatchObject({ code: "OVERPAYMENT" });
    query.mockReset(); query.mockResolvedValue(row({ status: "issued", paid_minor: "400" }));
    await expect(service.voidInvoice(actor("owner"), "i1", 3, "wrong customer")).rejects.toMatchObject({ code: "HAS_PAYMENTS" });
  });
  it("auto generation never throws and returns the existing draft (idempotent)", async () => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes("FROM jobs j JOIN bookings")) return { rows: [{ job_id: "j1", booking_id: "b1", branch_id: "branch-a", customer_id: "c", vehicle_id: "v", stage: "delivered", service_id: "s", accepted_quote_id: null, accepted_quote_revision: null, name_en: "Tint", name_ar: "x" }], rowCount: 1 };
      if (text.includes("idempotency_key = $2")) return { rows: [{ id: "inv-existing" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const client = { query } as never;
    expect(await service.autoGenerateInvoiceForDeliveredJob(client, "j1")).toBe("inv-existing");
    expect(query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO invoices"))).toBe(false);
    query.mockReset();
    query.mockImplementation(async (sql: string) => { if (String(sql).startsWith("SAVEPOINT") || String(sql).startsWith("ROLLBACK")) return { rows: [], rowCount: 0 }; throw new Error("boom"); });
    expect(await service.autoGenerateInvoiceForDeliveredJob(client, "j1")).toBeNull();
  });
});
