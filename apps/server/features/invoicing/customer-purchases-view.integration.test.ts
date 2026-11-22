import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 0038: the customer_purchases view links the generic invoice (table invoices) for a delivered job that has one
 * and no warranty, ignores a void invoice, and keeps invoice_id (the warranty draft) null. Runs only against the
 * disposable CI database (GARAGE_TEST_DATABASE_URL); otherwise skipped. Draft invoices can be deleted, so cleanup is complete.
 */
const testDatabaseUrl = process.env.GARAGE_TEST_DATABASE_URL;
const originalDatabaseUrl = process.env.DATABASE_URL;
const integration = testDatabaseUrl ? describe : describe.skip;
const suffix = crypto.randomUUID();
const branchId = `it-pv-branch-${suffix}`;
const serviceId = `it-pv-service-${suffix}`;
const customerId = `it-pv-customer-${suffix}`;
const vehicleId = `it-pv-vehicle-${suffix}`;
const bookingId = `it-pv-booking-${suffix}`;
const jobId = `it-pv-job-${suffix}`;
const invoiceId = `it-pv-invoice-${suffix}`;
const voidInvoiceId = `it-pv-void-${suffix}`;

integration("customer_purchases view links the generic invoice (0038)", () => {
  let db: typeof import("../../infrastructure/database/db");
  const purchase = async () => (await db.pool.query<Record<string, string | null>>("SELECT * FROM customer_purchases WHERE id = $1", [`job:${jobId}`])).rows;

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("GARAGE_TEST_DATABASE_URL is required for database integration tests.");
    process.env.DATABASE_URL = testDatabaseUrl;
    db = await import("../../infrastructure/database/db");
    await db.pool.query(
      `INSERT INTO branches (id, name_en, name_ar, location_label, daily_dropoff_limit, working_hours, clean_bays, general_bays, weekly_day_off)
       VALUES ($1, 'Purchases Branch', 'فرع اختبار', 'Disposable', 8, 10, 1, 2, 'Friday')`, [branchId]);
    await db.pool.query(
      `INSERT INTO services (id, name_en, name_ar, bay_type, bay_hours, price_label, active) VALUES ($1, 'Test Inspection', 'فحص تجريبي', 'general', 2, 'Estimate', true)`, [serviceId]);
    await db.pool.query(
      `INSERT INTO customers (id, name, phone, phone_normalized, preferred_language) VALUES ($1, 'Fictional Purchaser', '+20 100 000 0305', $2, 'en')`,
      [customerId, `2010000305${suffix.replaceAll("-", "").slice(0, 8)}`]);
    await db.pool.query(`INSERT INTO vehicles (id, customer_id, make, model, year, plate) VALUES ($1, $2, 'Sample', 'Purchase Vehicle', 2025, $3)`, [vehicleId, customerId, `PV-${suffix.slice(0, 8)}`]);
    await db.pool.query("INSERT INTO customer_branches (customer_id, branch_id) VALUES ($1, $2)", [customerId, branchId]);
    await db.pool.query(
      `INSERT INTO bookings (id, customer_id, vehicle_id, service_id, branch_id, dropoff_date, dropoff_time, expected_pickup, status, created_by)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, '10:00', CURRENT_DATE, 'confirmed', 'it-pv')`, [bookingId, customerId, vehicleId, serviceId, branchId]);
    await db.pool.query("INSERT INTO jobs (id, booking_id, branch_id, stage) VALUES ($1, $2, $3, 'delivered')", [jobId, bookingId, branchId]);
  });

  afterAll(async () => {
    try {
      if (!db) return;
      await db.pool.query("DELETE FROM invoices WHERE id = ANY($1::text[]) AND status = 'draft'", [[invoiceId, voidInvoiceId]]);
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

  const insertInvoice = (id: string, status: "draft" | "void", key: string) => db.pool.query(
    `INSERT INTO invoices (id, environment_id, branch_id, customer_id, vehicle_id, booking_id, job_id, source, idempotency_key, status, currency, voided_at, void_reason)
     VALUES ($1, 'default', $2, $3, $4, $5, $6, 'manual', $7, $8, 'EGP', ${status === "void" ? "now()" : "NULL"}, ${status === "void" ? "'test'" : "NULL"})`,
    [id, branchId, customerId, vehicleId, bookingId, jobId, `${key}-${suffix}`, status]);

  it("has no generic invoice link before an invoice exists", async () => {
    const rows = await purchase();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "delivered", warranty_id: null, invoice_id: null, generic_invoice_id: null, generic_invoice_number: null, generic_invoice_status: null });
  });

  it("ignores a void invoice", async () => {
    await insertInvoice(voidInvoiceId, "void", "it-pv-void");
    expect((await purchase())[0]).toMatchObject({ generic_invoice_id: null });
  });

  it("returns generic_invoice_id for a delivered job with a generic invoice and no warranty", async () => {
    await insertInvoice(invoiceId, "draft", "it-pv-draft");
    const rows = await purchase();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ job_id: jobId, booking_id: bookingId, warranty_id: null, invoice_id: null, generic_invoice_id: invoiceId, generic_invoice_status: "draft", generic_invoice_number: null });
  });
});
