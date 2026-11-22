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

describe("payment finance event (P2T-003)", () => {
  const invRow = { rows: [{ id: "i1", branch_id: "branch-a", customer_id: "c1", job_id: "j1", quote_id: null, status: "issued", revision: 3, currency: "EGP", total_minor: "1000", paid_minor: "0" }], rowCount: 1 };
  const pay = { expectedRevision: 3, amountMinor: 400, method: "cash" as const, reference: "R1", receivedOn: "2026-11-21" };
  const run = (definitions: unknown[]) => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes("FROM invoices i JOIN customers")) return invRow;
      if (text.includes("commercial_policy_active")) return { rows: definitions, rowCount: definitions.length };
      return { rows: [], rowCount: 0 };
    });
  };
  const def = { policy_id: "fin-col", version: 2, value: { currency: "EGP", minorUnitExponent: 2, reportingTimezone: "Africa/Cairo", sourceKinds: ["collection"] } };
  it("writes one collection event keyed by invoice and reference, in the same client", async () => {
    run([def]);
    await service.recordPayment(actor("owner"), "i1", pay).catch(() => undefined);
    const inserts = query.mock.calls.filter((c) => String(c[0]).includes("INSERT INTO operational_money_events"));
    expect(inserts).toHaveLength(1);
    expect(String(inserts[0][0])).toContain("ON CONFLICT (environment_id, kind, source_method, source_reference) DO NOTHING");
    expect(inserts[0][1]).toEqual(expect.arrayContaining([400, "EGP", 2, "2026-11-21", "Africa/Cairo", "i1:R1", "fin-col", 2]));
    expect(query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO invoice_payment_references"))).toBe(true);
  });
  it("refuses the payment when no attested finance definition exists", async () => {
    run([]);
    await expect(service.recordPayment(actor("owner"), "i1", pay)).rejects.toMatchObject({ status: 422, code: "FINANCE_DEFINITION_REQUIRED" });
    expect(query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO operational_money_events"))).toBe(false);
  });
  it("does not insert a second event for a duplicate reference", async () => {
    run([def]);
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes("FROM invoices i JOIN customers")) return invRow;
      if (text.includes("FROM invoice_payment_references")) return { rows: [{}], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await expect(service.recordPayment(actor("owner"), "i1", pay)).rejects.toMatchObject({ code: "DUPLICATE_REFERENCE" });
    expect(query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO operational_money_events"))).toBe(false);
  });
});

describe("late transport sync (P2T-004)", () => {
  const fee = (currency = "EGP") => ({ rows: [{ direction: "pickup", fee: { minor: 5000, currency } }], rowCount: 1 });
  const setup = (status: string, transport = fee(), lines: unknown[] = [{ id: "l", position: 0, kind: "service", description_en: "Tint", description_ar: "", quantity: "1", unit_minor: "10000", discount_minor: "0", tax_minor: "0" }]) => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes("SELECT i.id FROM invoices i JOIN jobs")) return { rows: [{ id: "i1" }], rowCount: 1 };
      if (text.includes("tax_rate_percent::text AS tax_rate_percent FROM invoices")) return { rows: [{ status, currency: "EGP", tax_rate_percent: null }], rowCount: 1 };
      if (text.includes("FROM transport_requests")) return transport;
      if (text.includes("FROM invoice_lines")) return { rows: lines, rowCount: lines.length };
      return { rows: [], rowCount: 0 };
    });
  };
  const wrote = () => query.mock.calls.some((c) => String(c[0]).includes("INSERT INTO invoice_lines"));
  it("rebuilds a draft with the transport line and recomputed totals", async () => {
    setup("draft");
    const r = await service.syncInvoiceTransportForBooking({ query } as never, "b1");
    expect(r).toEqual({ invoiceId: "i1", transportAdjustmentRequired: false, transportSynced: true });
    const inserted = query.mock.calls.filter((c) => String(c[0]).includes("INSERT INTO invoice_lines")).map((c) => c[1][3]);
    expect(inserted).toEqual(["service", "transport"]);
    const totals = query.mock.calls.find((c) => String(c[0]).includes("UPDATE invoices SET subtotal_minor"));
    expect(totals?.[1]).toEqual(["i1", 15000, 0, null, null]);
  });
  it("is a no-op when the draft already matches", async () => {
    setup("draft", fee(), [
      { id: "l", position: 0, kind: "service", description_en: "Tint", description_ar: "", quantity: "1", unit_minor: "10000", discount_minor: "0", tax_minor: "0" },
      { id: "t", position: 1, kind: "transport", description_en: "Transport (pickup)", description_ar: "", quantity: "1", unit_minor: "5000", discount_minor: "0", tax_minor: null }]);
    expect(await service.syncInvoiceTransportForBooking({ query } as never, "b1")).toMatchObject({ transportSynced: false, transportAdjustmentRequired: false });
    expect(wrote()).toBe(false);
  });
  it("never rewrites an issued invoice and flags the adjustment", async () => {
    setup("issued");
    expect(await service.syncInvoiceTransportForBooking({ query } as never, "b1")).toMatchObject({ transportAdjustmentRequired: true, transportSynced: false });
    expect(wrote()).toBe(false);
  });
  it("ignores a fee in a different currency", async () => {
    setup("draft", fee("USD"));
    expect(await service.syncInvoiceTransportForBooking({ query } as never, "b1")).toMatchObject({ transportAdjustmentRequired: false, transportSynced: false });
    expect(wrote()).toBe(false);
  });
});
