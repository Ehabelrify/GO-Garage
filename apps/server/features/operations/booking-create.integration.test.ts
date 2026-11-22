import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Pending booking creation is idempotent per (staff origin, key) through booking_change_idempotency (action 'create-pending').
 * Runs only against the disposable CI database (GARAGE_TEST_DATABASE_URL); otherwise the suite is skipped.
 * Assumes the default booking-confirmation policy (staff-review), so the pending path is used; the test never writes that setting.
 */
const testDatabaseUrl = process.env.GARAGE_TEST_DATABASE_URL;
const originalDatabaseUrl = process.env.DATABASE_URL;
const integration = testDatabaseUrl ? describe : describe.skip;
const suffix = crypto.randomUUID();
const branchId = `it-bkc-branch-${suffix}`;
const serviceId = `it-bkc-service-${suffix}`;
const customerId = `it-bkc-customer-${suffix}`;
const vehicleId = `it-bkc-vehicle-${suffix}`;
const staffId = `it-bkc-staff-${suffix}`;

function futureDate(days: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

integration("Pending booking create replays by idempotency key", () => {
  let db: typeof import("../../infrastructure/database/db");
  let create: typeof import("./booking-create").createBookingInTransaction;
  const dropoffDate = futureDate(20);
  const input = () => ({ customerId, vehicleId, serviceId, branchId, dropoffDate, dropoffTime: "10:00" });
  const run = (key: string, body: ReturnType<typeof input>, bookingId = `it-bkc-${crypto.randomUUID()}`) =>
    db.withTransaction((client) => create(client, { userId: staffId }, body, bookingId, key));
  const bookingCount = async () => Number((await db.pool.query("SELECT count(*)::int AS n FROM bookings WHERE customer_id = $1", [customerId])).rows[0].n);

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("GARAGE_TEST_DATABASE_URL is required for database integration tests.");
    process.env.DATABASE_URL = testDatabaseUrl;
    db = await import("../../infrastructure/database/db");
    create = (await import("./booking-create")).createBookingInTransaction;
    await db.pool.query(
      `INSERT INTO branches (id, name_en, name_ar, location_label, daily_dropoff_limit, working_hours, clean_bays, general_bays, weekly_day_off)
       VALUES ($1, 'Booking Create Branch', 'فرع اختبار', 'Disposable', 8, 10, 1, 2, 'None')`, [branchId]);
    await db.pool.query(
      `INSERT INTO services (id, name_en, name_ar, bay_type, bay_hours, price_label, active) VALUES ($1, 'Test Inspection', 'فحص تجريبي', 'general', 2, 'Estimate', true)`, [serviceId]);
    await db.pool.query(
      `INSERT INTO customers (id, name, phone, phone_normalized, preferred_language) VALUES ($1, 'Fictional Booker', '+20 100 000 0302', $2, 'en')`,
      [customerId, `2010000302${suffix.replaceAll("-", "").slice(0, 8)}`]);
    await db.pool.query(`INSERT INTO vehicles (id, customer_id, make, model, year, plate) VALUES ($1, $2, 'Sample', 'Booking Vehicle', 2025, $3)`, [vehicleId, customerId, `BKC-${suffix.slice(0, 8)}`]);
    await db.pool.query("INSERT INTO customer_branches (customer_id, branch_id) VALUES ($1, $2)", [customerId, branchId]);
  });

  afterAll(async () => {
    try {
      if (!db) return;
      await db.pool.query("DELETE FROM booking_change_idempotency WHERE origin = $1", [`staff:${staffId}`]);
      await db.pool.query("DELETE FROM booking_occupancy WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id = $1)", [customerId]);
      await db.pool.query("DELETE FROM bookings WHERE customer_id = $1", [customerId]);
      await db.pool.query("DELETE FROM customer_branches WHERE customer_id = $1", [customerId]);
      await db.pool.query("DELETE FROM vehicles WHERE customer_id = $1", [customerId]);
      await db.pool.query("DELETE FROM customers WHERE id = $1", [customerId]);
      await db.pool.query("DELETE FROM services WHERE id = $1", [serviceId]);
      await db.pool.query("DELETE FROM branches WHERE id = $1", [branchId]);
      await db.pool.end();
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("creates one pending booking, replays the same key with the same payload, and rejects the key for a different payload", async () => {
    const first = await run("key-replay", input());
    expect(first).toMatchObject({ status: "pending" });
    const bookingId = (first as { bookingId: string }).bookingId;
    expect(await bookingCount()).toBe(1);

    const replay = await run("key-replay", input());
    expect(replay).toEqual({ bookingId, status: "pending" });
    expect(await bookingCount()).toBe(1);

    const different = await run("key-replay", { ...input(), dropoffTime: "11:30" });
    expect(different).toEqual({ status: "invalid", code: "IDEMPOTENCY_KEY_REUSED" });
    expect(await bookingCount()).toBe(1);

    const stored = await db.pool.query("SELECT action, booking_id FROM booking_change_idempotency WHERE origin = $1 AND idempotency_key = 'key-replay'", [`staff:${staffId}`]);
    expect(stored.rows).toEqual([{ action: "create-pending", booking_id: bookingId }]);
  });

  it("creates a separate booking for a new key and serialises two concurrent creates that share a key", async () => {
    const before = await bookingCount();
    const [a, b] = await Promise.all([run("key-concurrent", input()), run("key-concurrent", input())]);
    expect((a as { bookingId: string }).bookingId).toBe((b as { bookingId: string }).bookingId);
    expect(await bookingCount()).toBe(before + 1);

    const other = await run("key-other", input());
    expect((other as { bookingId: string }).bookingId).not.toBe((a as { bookingId: string }).bookingId);
    expect(await bookingCount()).toBe(before + 2);
  });
});
