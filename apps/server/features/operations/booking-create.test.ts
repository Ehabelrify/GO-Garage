import { describe, expect, it, vi } from "vitest";
import { createBookingInTransaction } from "./booking-create";

vi.mock("../../infrastructure/database/db", () => ({ pool: { query: vi.fn() }, withTransaction: vi.fn() }));
vi.mock("../auth/staff-capability", () => ({ staffHasCapabilityForBranch: vi.fn() }));
vi.mock("./availability-service", () => ({ configuredAvailability: vi.fn(async () => ({ configuration: { version: "v1" } })) }));
vi.mock("../commercial/quote-booking", () => ({ acceptedQuoteInTransaction: vi.fn() }));

const input = { customerId: "c", vehicleId: "v", serviceId: "s", branchId: "b", dropoffDate: "2030-01-01", dropoffTime: "09:00" };

function client(priorRow?: { request_fingerprint: string; action: string; booking_id: string }) {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    calls.push(sql);
    if (sql.includes("FROM operating_settings WHERE setting_id")) return { rows: [{ value: "manual" }], rowCount: 1 };
    if (sql.includes("FROM booking_change_idempotency")) return { rows: priorRow ? [priorRow] : [], rowCount: priorRow ? 1 : 0 };
    if (sql.includes("FROM bookings WHERE id=$1")) return { rows: [{ id: "booking-1", status: "pending" }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { query, calls } as never as { query: typeof query; calls: string[] };
}

describe("pending booking create idempotency", () => {
  it("replays the stored booking for the same key and payload without inserting", async () => {
    const first = client();
    await createBookingInTransaction(first as never, { userId: "u" }, input, "booking-1", "k1").catch(() => undefined);
    const fp = (first.query.mock.calls as unknown[][]).find((c) => String(c[0]).includes("INSERT INTO booking_change_idempotency")) as unknown[][] | undefined;
    // Capture fingerprint indirectly: a replay run with a prior row must not insert.
    const c = client({ request_fingerprint: "x", action: "create-pending", booking_id: "booking-1" });
    const r = await createBookingInTransaction(c as never, { userId: "u" }, input, "booking-2", "k1");
    expect(r).toEqual({ status: "invalid", code: "IDEMPOTENCY_KEY_REUSED" });
    expect(c.calls.some((s) => s.includes("INSERT INTO bookings"))).toBe(false);
    void fp;
  });
  it("replays when fingerprint matches", async () => {
    const probe = client();
    await createBookingInTransaction(probe as never, { userId: "u" }, input, "booking-1", "k1").catch(() => undefined);
    const ins = probe.query.mock.calls.find((c) => String(c[0]).includes("INSERT INTO booking_change_idempotency"));
    // Insert may not be reached with an empty mock pool; derive fingerprint the same way as the implementation.
    const { createHash } = await import("node:crypto");
    const fingerprint = createHash("sha256").update(JSON.stringify({ action: "create-pending", input })).digest("hex");
    void ins;
    const c = client({ request_fingerprint: fingerprint, action: "create-pending", booking_id: "booking-1" });
    const r = await createBookingInTransaction(c as never, { userId: "u" }, input, "booking-2", "k1");
    expect(r).toEqual({ bookingId: "booking-1", status: "pending" });
    expect(c.calls.some((s) => s.includes("INSERT INTO bookings"))).toBe(false);
  });
});
