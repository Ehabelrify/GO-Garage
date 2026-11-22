import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GarageActor } from "../auth/authz";

/**
 * P2T-011: bootstrap data minimisation against real rows. A receptionist whose operational capabilities are all revoked gets
 * no bookings or jobs; the default receptionist gets them. Runs only against the disposable CI database
 * (GARAGE_TEST_DATABASE_URL); otherwise skipped. Read-only apart from the fixtures, which are removed afterwards.
 */
const testDatabaseUrl = process.env.GARAGE_TEST_DATABASE_URL;
const originalDatabaseUrl = process.env.DATABASE_URL;
const integration = testDatabaseUrl ? describe : describe.skip;
const suffix = crypto.randomUUID();
const branchId = `it-bs-branch-${suffix}`;
const serviceId = `it-bs-service-${suffix}`;
const customerId = `it-bs-customer-${suffix}`;
const vehicleId = `it-bs-vehicle-${suffix}`;
const bookingId = `it-bs-booking-${suffix}`;
const jobId = `it-bs-job-${suffix}`;
const receptionist = (permissions?: GarageActor["permissions"]): GarageActor =>
  ({ userId: `it-bs-reception-${suffix}`, email: `it-bs-${suffix}@example.test`, name: "Fictional Receptionist", role: "receptionist", branchIds: [branchId], ...(permissions ? { permissions } : {}) });

integration("Bootstrap omits bookings and jobs without operational access", () => {
  let db: typeof import("../../infrastructure/database/db");
  let bootstrap: typeof import("./bootstrap");

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("GARAGE_TEST_DATABASE_URL is required for database integration tests.");
    process.env.DATABASE_URL = testDatabaseUrl;
    db = await import("../../infrastructure/database/db");
    bootstrap = await import("./bootstrap");
    await db.pool.query(
      `INSERT INTO branches (id, name_en, name_ar, location_label, daily_dropoff_limit, working_hours, clean_bays, general_bays, weekly_day_off)
       VALUES ($1, 'Bootstrap Branch', 'فرع اختبار', 'Disposable', 8, 10, 1, 2, 'Friday')`, [branchId]);
    await db.pool.query(
      `INSERT INTO services (id, name_en, name_ar, bay_type, bay_hours, price_label, active) VALUES ($1, 'Test Inspection', 'فحص تجريبي', 'general', 2, 'Estimate', true)`, [serviceId]);
    await db.pool.query(
      `INSERT INTO customers (id, name, phone, phone_normalized, preferred_language) VALUES ($1, 'Fictional Bootstrap Customer', '+20 100 000 0306', $2, 'en')`,
      [customerId, `2010000306${suffix.replaceAll("-", "").slice(0, 8)}`]);
    await db.pool.query(`INSERT INTO vehicles (id, customer_id, make, model, year, plate) VALUES ($1, $2, 'Sample', 'Bootstrap Vehicle', 2025, $3)`, [vehicleId, customerId, `BS-${suffix.slice(0, 8)}`]);
    await db.pool.query("INSERT INTO customer_branches (customer_id, branch_id) VALUES ($1, $2)", [customerId, branchId]);
    await db.pool.query(
      `INSERT INTO bookings (id, customer_id, vehicle_id, service_id, branch_id, dropoff_date, dropoff_time, expected_pickup, status, created_by)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, '10:00', CURRENT_DATE, 'confirmed', 'it-bs')`, [bookingId, customerId, vehicleId, serviceId, branchId]);
    await db.pool.query("INSERT INTO jobs (id, booking_id, branch_id, stage) VALUES ($1, $2, $3, 'booked')", [jobId, bookingId, branchId]);
  });

  afterAll(async () => {
    try {
      if (!db) return;
      await db.pool.query("DELETE FROM jobs WHERE id = $1", [jobId]);
      await db.pool.query("DELETE FROM bookings WHERE id = $1", [bookingId]);
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

  it("gives the default receptionist the booking and job", async () => {
    const { state } = await bootstrap.loadGarageBootstrap(receptionist());
    expect(state.bookings.map((booking) => booking.id)).toContain(bookingId);
    expect(state.jobs.map((job) => job.id)).toContain(jobId);
  });

  it("omits every booking and job when all operational capabilities are revoked", async () => {
    const revoked = receptionist({
      "bookings.manage": false, "customers.read": false, "whatsapp.use": false, "transport.coordinate": false, "warranty.view": false,
      "quotes.view": false, "quotes.manage": false, "finance.view": false, "special-requests.review": false,
    });
    expect(bootstrap.hasOperationalAccess(revoked)).toBe(false);
    const { state } = await bootstrap.loadGarageBootstrap(revoked);
    expect(state.bookings).toEqual([]);
    expect(state.jobs).toEqual([]);
    expect(state.warrantyPolicies).toEqual([]);
  });
});
