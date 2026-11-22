import { describe, expect, it, vi } from "vitest";
import type { GarageActor } from "../auth/authz";

vi.mock("../../infrastructure/database/db", () => ({ pool: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } }));
const { globalSearch, customer360, vehicle360, resolveWarranty, RelationsError } = await import("./relations-service");
const { pool } = await import("../../infrastructure/database/db");

const actor = (role: GarageActor["role"], extra: Partial<GarageActor> = {}): GarageActor => ({
  userId: `${role}-1`, email: "", name: role, role, branchIds: ["b1"], ...extra,
});

describe("relations API authorization", () => {
  it("denies technicians search, 360 views and warranty resolve before touching the database", async () => {
    const tech = actor("technician");
    await expect(globalSearch(tech, "abc", ["customer"])).rejects.toBeInstanceOf(RelationsError);
    await expect(customer360(tech, "c1")).rejects.toMatchObject({ status: 403 });
    await expect(vehicle360(tech, "v1")).rejects.toMatchObject({ status: 403 });
    await expect(resolveWarranty(tech, "code")).rejects.toMatchObject({ status: 403 });
    expect(pool.query).not.toHaveBeenCalled();
  });
  it("honours per-user overrides (a receptionist without customers.read is denied)", async () => {
    const r = actor("receptionist", { permissions: { "customers.read": false } });
    await expect(customer360(r, "c1")).rejects.toMatchObject({ status: 403 });
  });
  it("returns 404 for out-of-scope customers", async () => {
    await expect(customer360(actor("branch-manager"), "missing")).rejects.toMatchObject({ status: 404, code: "CUSTOMER_NOT_FOUND" });
  });
  it("ignores too-short search text", async () => {
    await expect(globalSearch(actor("owner"), "a", ["customer"])).resolves.toEqual([]);
  });
  it("marks sections restricted when the capability is missing and never queries them", async () => {
    vi.mocked(pool.query).mockReset();
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (text.includes("FROM customers c WHERE")) return { rows: [{ id: "c1", name: "N", phone: "0100", preferred_language: "ar", archived: false }], rowCount: 1 } as never;
      return { rows: [], rowCount: 0 } as never;
    });
    const view = (await customer360(actor("receptionist", { permissions: { "transport.coordinate": false, "whatsapp.use": false, "warranty.view": false } }), "c1")) as Record<string, unknown>;
    expect(view.transport).toEqual({ count: 0, items: [], restricted: true });
    expect(view.conversations).toEqual({ count: 0, items: [], restricted: true });
    expect(view.warranties).toMatchObject({ restricted: true });
    expect(view.bookings).toEqual({ count: 0, items: [] });
    expect(view.purchases).toEqual({ count: 0, items: [] });
    expect(view.customRequests).toEqual({ count: 0, items: [] });
  });
  it("restricts purchases and special requests for roles without bookings.manage", async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      if (String(sql).includes("FROM customers c WHERE")) return { rows: [{ id: "c1", name: "N", phone: "0100", preferred_language: "ar", archived: false }], rowCount: 1 } as never;
      return { rows: [], rowCount: 0 } as never;
    });
    const view = (await customer360(actor("receptionist", { permissions: { "bookings.manage": false } }), "c1")) as Record<string, unknown>;
    expect(view.purchases).toEqual({ count: 0, items: [], restricted: true });
    expect(view.customRequests).toEqual({ count: 0, items: [], restricted: true });
  });
  it("maps purchase rows with their own currency and source links", async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (text.includes("FROM customers c WHERE")) return { rows: [{ id: "c1", name: "N", phone: "0100", preferred_language: "ar", archived: false }], rowCount: 1 } as never;
      if (text.includes("FROM customer_purchases")) return { rows: [{ id: "quote:q1", branch_id: "b1", vehicle_id: "v1", quote_id: "q1", booking_id: "bk1", job_id: "j1", warranty_id: "w1", invoice_id: null, generic_invoice_id: "inv1", generic_invoice_number: "INV-2026-0001", generic_invoice_status: "issued", label_en: "PPF", label_ar: "ppf", quantity: 1, amount_minor: "250000", currency: "SAR", purchased_on: "2026-11-01", status: "delivered", total: "1" }], rowCount: 1 } as never;
      return { rows: [], rowCount: 0 } as never;
    });
    const view = (await customer360(actor("owner"), "c1")) as unknown as Record<string, { items: Array<Record<string, unknown>> }>;
    expect(view.purchases.items[0]).toMatchObject({ quoteId: "q1", warrantyId: "w1", genericInvoiceId: "inv1", genericInvoiceNumber: "INV-2026-0001", genericInvoiceStatus: "issued", amount: { minor: 250000, currency: "SAR" } });
  });
  it("hides contact numbers for demo identities", async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      if (String(sql).includes("FROM customers c WHERE")) return { rows: [{ id: "c1", name: "N", phone: "0100", preferred_language: "ar", archived: false }], rowCount: 1 } as never;
      return { rows: [], rowCount: 0 } as never;
    });
    const view = await customer360(actor("owner", { isDemo: true }), "c1");
    expect((view.customer as { phone: string | null }).phone).toBeNull();
  });
});

describe("section query parameters", () => {
  it("never binds more parameters than a section query references (PostgreSQL rejects the extra ones)", async () => {
    vi.mocked(pool.query).mockClear();
    const owner = actor("owner");
    await customer360(owner, "c1").catch(() => undefined);
    await vehicle360(owner, "v1").catch(() => undefined);
    const mismatches = vi.mocked(pool.query).mock.calls
      .map(([sql, params]) => ({ sql: String(sql), count: Array.isArray(params) ? (params as unknown[]).length : 0 }))
      .filter(({ sql, count }) => {
        const highest = Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
        return count > 0 && count !== highest;
      });
    expect(mismatches.map((m) => `${m.count} params for: ${m.sql.slice(0, 80)}`)).toEqual([]);
  });
});

describe("paramsFor", () => {
  it("trims the shared parameter list to the highest placeholder used", async () => {
    const { paramsFor } = await import("./relations-service");
    expect(paramsFor("SELECT 1 WHERE a=$1", ["a", "b", "c", "d"])).toEqual(["a"]);
    expect(paramsFor("SELECT 1 WHERE a=$1 AND b=$3", ["a", "b", "c", "d"])).toEqual(["a", "b", "c"]);
    expect(paramsFor("SELECT 1 WHERE a=$1 AND b=$4", ["a", "b", "c", "d"])).toEqual(["a", "b", "c", "d"]);
  });
});
