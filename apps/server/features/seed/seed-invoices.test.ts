import { describe, expect, it } from "vitest";
import { generateDataset } from "./seed-generate";
import { buildSteps } from "./purge-plan";

const NOW = new Date("2026-11-21T10:00:00Z");
const { ds, world } = generateDataset({ now: NOW });
const rows = (table: Parameters<typeof ds.rows>[0]) => ds.rows(table);

describe("seeded invoices", () => {
  it("creates one deterministic invoice per delivered priced job and is stable across runs", () => {
    const invoices = rows("invoices");
    expect(invoices.length).toBeGreaterThan(20);
    const jobs = new Set(invoices.map((row) => row.job_id));
    expect(jobs.size).toBe(invoices.length);
    const again = generateDataset({ now: NOW }).ds.rows("invoices");
    expect(JSON.stringify(again)).toBe(JSON.stringify(invoices));
  });
  it("links to real seeded records and keeps ids purge-safe", () => {
    const bookings = new Set(rows("bookings").map((row) => row.id));
    const jobs = new Set(rows("jobs").map((row) => row.id));
    const delivered = new Set(world.visits.filter((visit) => visit.deliveredAt).map((visit) => visit.jobId));
    for (const invoice of rows("invoices")) {
      expect(String(invoice.id)).toMatch(/^seed-inv-/);
      expect(bookings.has(invoice.booking_id)).toBe(true);
      expect(jobs.has(invoice.job_id)).toBe(true);
      expect(delivered.has(invoice.job_id as string)).toBe(true);
      expect(invoice.idempotency_key).toBe(`job:${invoice.job_id}`);
    }
  });
  it("respects the table checks: numbers only after draft, unique per branch and year, paid never above total", () => {
    const seen = new Set<string>();
    for (const invoice of rows("invoices")) {
      if (invoice.status === "draft") { expect(invoice.number).toBeNull(); expect(invoice.issue_date).toBeNull(); continue; }
      expect(invoice.number).toMatch(/^INV-[A-Z0-9]+-\d{4}-\d{5}$/);
      expect(seen.has(String(invoice.number))).toBe(false);
      seen.add(String(invoice.number));
      expect(Number(invoice.paid_minor)).toBeLessThanOrEqual(Number(invoice.total_minor));
      expect((invoice.status === "void") === Boolean(invoice.voided_at)).toBe(true);
      if (invoice.status === "paid") expect(invoice.paid_minor).toBe(invoice.total_minor);
    }
    const lines = rows("invoice_lines");
    for (const invoice of rows("invoices")) {
      const own = lines.filter((line) => line.invoice_id === invoice.id);
      expect(own).toHaveLength(1);
      expect(Number(own[0].unit_minor) - Number(own[0].discount_minor)).toBe(Number(invoice.total_minor));
    }
  });
  it("has history events in order and the purge plan removes every invoice table", () => {
    const events = rows("invoice_events");
    for (const invoice of rows("invoices")) {
      const own = events.filter((event) => event.invoice_id === invoice.id);
      expect(own.map((event) => event.seq)).toEqual(own.map((_, index) => index + 1));
      expect(own[own.length - 1].to_status).toBe(invoice.status);
    }
    const planned = buildSteps({ keepDemoAccounts: false }).map((step) => step.table);
    for (const table of ["invoice_payment_references", "invoice_events", "invoice_lines", "invoices"]) expect(planned).toContain(table);
    expect(planned.indexOf("invoices")).toBeGreaterThan(planned.indexOf("invoice_lines"));
  });
});
