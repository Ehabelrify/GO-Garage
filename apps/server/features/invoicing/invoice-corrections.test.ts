import { describe, expect, it, vi } from "vitest";
import type { GarageActor } from "../auth/authz";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query },
  withTransaction: async (run: (client: { query: typeof query }) => unknown) => run({ query }),
}));
const service = await import("./invoice-service");

const actor = (role: GarageActor["role"], extra: Partial<GarageActor> = {}): GarageActor => ({ userId: `${role}-1`, email: "", name: role, role, branchIds: ["branch-a"], ...extra });
const did = (needle: string) => query.mock.calls.filter((c) => String(c[0]).includes(needle));
const rows = (list: unknown[]) => ({ rows: list, rowCount: list.length });

describe("payment reversal and refund (P2T-012)", () => {
  const inv = (over: Record<string, unknown> = {}) => rows([{ id: "i1", branch_id: "branch-a", customer_id: "c1", job_id: "j1", quote_id: null, status: "paid", revision: 4, currency: "EGP", total_minor: "1000", paid_minor: "1000", created_at: new Date(0), updated_at: new Date(0), ...over }]);
  const def = { policy_id: "fin-ref", version: 1, value: { currency: "EGP", minorUnitExponent: 2, reportingTimezone: "Africa/Cairo", sourceKinds: ["collection", "refund"] } };
  const rev = { reason: "Wrong amount", idempotencyKey: "k1" };
  const ref = { amountMinor: 300, reason: "Goodwill", idempotencyKey: "k2" };
  const setup = (opts: { invoice?: ReturnType<typeof inv>; payment?: unknown[]; event?: unknown[]; priorRev?: unknown[]; reversedAlready?: boolean; priorRefund?: unknown[]; defs?: unknown[] } = {}) => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      const t = String(sql);
      if (t.includes("FROM invoices i JOIN customers")) return opts.invoice ?? inv();
      if (t.includes("FROM invoice_payment_reversals WHERE invoice_id")) return rows(opts.priorRev ?? []);
      if (t.includes("FROM invoice_payment_reversals WHERE payment_id")) return rows(opts.reversedAlready ? [{}] : []);
      if (t.includes("FROM invoice_payment_references WHERE id")) return rows(opts.payment ?? [{ id: "p1", amount_minor: "400", reference: "R1" }]);
      if (t.includes("FROM operational_money_events WHERE")) return rows(opts.event ?? [{ id: "mev-1" }]);
      if (t.includes("FROM operational_money_event_reversals")) return rows([]);
      if (t.includes("FROM invoice_refunds WHERE invoice_id")) return rows(opts.priorRefund ?? []);
      if (t.includes("commercial_policy_active")) return rows(opts.defs ?? [def]);
      return rows([]);
    });
  };

  it("reverses a payment: finance reversal, reversal row, paid and status lowered, event appended", async () => {
    setup();
    await service.reversePayment(actor("owner"), "i1", "p1", rev);
    expect(did("INSERT INTO operational_money_event_reversals")).toHaveLength(1);
    expect(did("INSERT INTO invoice_payment_reversals")).toHaveLength(1);
    expect(did("UPDATE invoices SET paid_minor")[0][1]).toEqual(["i1", 600, "partial"]);
    expect(did("INSERT INTO invoice_events")[0][1]).toEqual(expect.arrayContaining(["payment-reversed", "paid", "partial"]));
  });
  it("returns to issued when everything is reversed", async () => {
    setup({ invoice: inv({ status: "partial", paid_minor: "400" }) });
    await service.reversePayment(actor("owner"), "i1", "p1", rev);
    expect(did("UPDATE invoices SET paid_minor")[0][1]).toEqual(["i1", 0, "issued"]);
  });
  it("replays the same reversal key without writing, and rejects the key on another payment", async () => {
    setup({ priorRev: [{ payment_id: "p1" }] });
    await service.reversePayment(actor("owner"), "i1", "p1", rev);
    expect(did("INSERT INTO")).toHaveLength(0);
    setup({ priorRev: [{ payment_id: "other" }] });
    await expect(service.reversePayment(actor("owner"), "i1", "p1", rev)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("refuses double reversal, unknown payment, wrong status and over-reversal", async () => {
    setup({ reversedAlready: true });
    await expect(service.reversePayment(actor("owner"), "i1", "p1", rev)).rejects.toMatchObject({ code: "ALREADY_REVERSED" });
    setup({ payment: [] });
    await expect(service.reversePayment(actor("owner"), "i1", "p1", rev)).rejects.toMatchObject({ status: 404, code: "PAYMENT_NOT_FOUND" });
    setup({ invoice: inv({ status: "void" }) });
    await expect(service.reversePayment(actor("owner"), "i1", "p1", rev)).rejects.toMatchObject({ code: "INVALID_STATE" });
    setup({ invoice: inv({ paid_minor: "100" }) });
    await expect(service.reversePayment(actor("owner"), "i1", "p1", rev)).rejects.toMatchObject({ code: "OVER_REVERSAL" });
  });
  it("refuses demo actors and holders without invoices.payments before any query", async () => {
    setup();
    await expect(service.reversePayment(actor("owner", { isDemo: true }), "i1", "p1", rev)).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });
    await expect(service.recordRefund(actor("owner", { isDemo: true }), "i1", ref)).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });
    await expect(service.reversePayment(actor("receptionist"), "i1", "p1", rev)).rejects.toMatchObject({ status: 403 });
    await expect(service.recordRefund(actor("receptionist"), "i1", ref)).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });
  it("records a refund with a finance refund event and moves paid to partial", async () => {
    setup();
    await service.recordRefund(actor("owner"), "i1", ref);
    const ev = did("INSERT INTO operational_money_events");
    expect(ev).toHaveLength(1);
    expect(String(ev[0][0])).toContain("'refund'");
    expect(ev[0][1]).toEqual(expect.arrayContaining([300, "EGP", 2, "i1:refund:k2"]));
    expect(did("INSERT INTO invoice_refunds")).toHaveLength(1);
    expect(did("UPDATE invoices SET paid_minor")[0][1]).toEqual(["i1", 700, "partial"]);
    expect(did("INSERT INTO invoice_events")[0][1]).toEqual(expect.arrayContaining(["refunded"]));
  });
  it("refuses over-refund, nothing paid, and a missing finance definition", async () => {
    setup({ invoice: inv({ status: "partial", paid_minor: "200" }) });
    await expect(service.recordRefund(actor("owner"), "i1", ref)).rejects.toMatchObject({ code: "OVER_REFUND" });
    setup({ invoice: inv({ status: "issued", paid_minor: "0" }) });
    await expect(service.recordRefund(actor("owner"), "i1", ref)).rejects.toMatchObject({ code: "INVALID_STATE" });
    setup({ defs: [] });
    await expect(service.recordRefund(actor("owner"), "i1", ref)).rejects.toMatchObject({ status: 422, code: "FINANCE_DEFINITION_REQUIRED" });
    expect(did("INSERT INTO invoice_refunds")).toHaveLength(0);
  });
  it("replays a refund key idempotently and rejects a changed amount", async () => {
    setup({ priorRefund: [{ amount_minor: "300", created_at: new Date(0) }] });
    await service.recordRefund(actor("owner"), "i1", ref);
    expect(did("INSERT INTO")).toHaveLength(0);
    setup({ priorRefund: [{ amount_minor: "999" }] });
    await expect(service.recordRefund(actor("owner"), "i1", ref)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
});

describe("issued-invoice transport adjustment (P2T-004)", () => {
  const parent = { status: "issued", currency: "EGP", branch_id: "branch-a", customer_id: "c1", vehicle_id: "v1", booking_id: "b1", job_id: "j1", quote_id: null, warranty_id: null, tax_rate_percent: null };
  const svc = { id: "l", position: 0, kind: "service", description_en: "Tint", description_ar: "", quantity: "1", unit_minor: "10000", discount_minor: "0", tax_minor: "0" };
  const setup = (children: unknown[] = [], childLines: unknown[] = [], status = "issued") => {
    query.mockReset();
    query.mockImplementation(async (sql: string, args?: unknown[]) => {
      const t = String(sql);
      if (t.includes("SELECT i.id FROM invoices i JOIN jobs")) return rows([{ id: "i1" }]);
      if (t.includes("tax_rate_percent::text AS tax_rate_percent FROM invoices")) return rows([{ ...parent, status }]);
      if (t.includes("FROM transport_requests")) return rows([{ direction: "pickup", fee: { minor: 5000, currency: "EGP" } }]);
      if (t.includes("parent_invoice_id = $1")) return rows(children);
      if (t.includes("FROM invoice_lines")) return rows(args?.[0] === "i1" ? [svc] : childLines);
      return rows([]);
    });
  };
  it("creates a linked draft adjustment with only transport lines and leaves the issued invoice untouched", async () => {
    setup();
    const out = await service.syncInvoiceTransportForBooking({ query } as never, "b1");
    expect(out).toMatchObject({ invoiceId: "i1", transportAdjustmentRequired: true, transportSynced: false, adjustmentInvoiceId: expect.stringMatching(/^inv-/) });
    const insert = did("INSERT INTO invoices")[0];
    expect(String(insert[0])).toContain("'adjustment'");
    expect(insert[1]).toEqual(expect.arrayContaining(["adjust:i1:1", "i1"]));
    expect(did("INSERT INTO invoice_lines").map((c) => c[1][3])).toEqual(["transport"]);
    expect(did("INSERT INTO invoice_lines").every((c) => c[1][1] !== "i1")).toBe(true);
    expect(did("UPDATE invoices").every((c) => c[1][0] !== "i1")).toBe(true);
    expect(did("DELETE FROM invoice_lines").every((c) => c[1][0] !== "i1")).toBe(true);
    expect(did("INSERT INTO invoice_events").map((c) => c[1][1])).toEqual(expect.arrayContaining(["generated", "adjustment-created"]));
  });
  it("refreshes an existing draft adjustment instead of creating another", async () => {
    setup([{ id: "adj1", status: "draft" }]);
    expect(await service.syncInvoiceTransportForBooking({ query } as never, "b1")).toMatchObject({ adjustmentInvoiceId: "adj1" });
    expect(did("INSERT INTO invoices")).toHaveLength(0);
  });
  it("does nothing once an issued adjustment already carries the fee", async () => {
    setup([{ id: "adj1", status: "issued" }], [{ id: "t", position: 0, kind: "transport", description_en: "Transport (pickup)", description_ar: "", quantity: "1", unit_minor: "5000", discount_minor: "0", tax_minor: "0" }]);
    expect(await service.syncInvoiceTransportForBooking({ query } as never, "b1")).toMatchObject({ transportAdjustmentRequired: false });
    expect(did("INSERT INTO invoices")).toHaveLength(0);
  });
  it("a void invoice only flags", async () => {
    setup([], [], "void");
    expect(await service.syncInvoiceTransportForBooking({ query } as never, "b1")).toMatchObject({ transportAdjustmentRequired: true });
    expect(did("INSERT INTO invoices")).toHaveLength(0);
  });
});
