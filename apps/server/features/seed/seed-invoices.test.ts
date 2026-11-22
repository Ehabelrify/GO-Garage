import { describe, expect, it } from "vitest";
import { generateDataset } from "./seed-generate";
import { buildSteps } from "./purge-plan";

const NOW = new Date("2026-11-21T10:00:00Z");
const { ds, world } = generateDataset({ now: NOW });
const rows = (table: Parameters<typeof ds.rows>[0]) => ds.rows(table);
const standard = () => rows("invoices").filter((row) => row.kind === "standard");

describe("seeded invoices", () => {
  it("creates one deterministic invoice per delivered priced job and is stable across runs", () => {
    const invoices = standard();
    expect(invoices.length).toBeGreaterThan(20);
    const jobs = new Set(invoices.map((row) => row.job_id));
    expect(jobs.size).toBe(invoices.length);
    expect(rows("invoices").length).toBeGreaterThan(invoices.length);
    const again = generateDataset({ now: NOW }).ds.rows("invoices").filter((row) => row.kind === "standard");
    expect(JSON.stringify(again)).toBe(JSON.stringify(invoices));
  });
  it("links to real seeded records and keeps ids purge-safe", () => {
    const bookings = new Set(rows("bookings").map((row) => row.id));
    const jobs = new Set(rows("jobs").map((row) => row.id));
    const delivered = new Set(world.visits.filter((visit) => visit.deliveredAt).map((visit) => visit.jobId));
    for (const invoice of standard()) {
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

  it("seeds reversed payments, refunds and adjustment drafts with consistent money, status and history", () => {
    const invoices = new Map(rows("invoices").map((row) => [String(row.id), row]));
    const payments = rows("invoice_payment_references");
    const reversals = rows("invoice_payment_reversals");
    const refunds = rows("invoice_refunds");
    const events = rows("invoice_events");
    expect(reversals.length).toBeGreaterThanOrEqual(4);
    expect(refunds.length).toBeGreaterThanOrEqual(4);
    const adjustments = rows("invoices").filter((row) => row.kind === "adjustment");
    expect(adjustments.length).toBeGreaterThanOrEqual(3);
    for (const row of [...reversals, ...refunds, ...adjustments]) expect(String(row.id)).toMatch(/^seed-/);
    expect(new Set(reversals.map((row) => row.payment_id)).size).toBe(reversals.length);
    for (const reversal of reversals) {
      const payment = payments.find((row) => row.id === reversal.payment_id);
      expect(payment?.invoice_id).toBe(reversal.invoice_id);
      expect(Number(reversal.amount_minor)).toBe(Number(payment!.amount_minor));
      expect(events.some((event) => event.invoice_id === reversal.invoice_id && event.action === "payment-reversed")).toBe(true);
    }
    for (const refund of refunds) expect(events.some((event) => event.invoice_id === refund.invoice_id && event.action === "refunded")).toBe(true);
    const sum = (list: Record<string, unknown>[], id: unknown) => list.filter((row) => row.invoice_id === id).reduce((total, row) => total + Number(row.amount_minor), 0);
    for (const invoice of invoices.values()) {
      if (invoice.kind === "adjustment") continue;
      const net = sum(payments, invoice.id) - sum(reversals, invoice.id) - sum(refunds, invoice.id);
      expect(Number(invoice.paid_minor), String(invoice.id)).toBe(net);
      expect(sum(refunds, invoice.id)).toBeLessThanOrEqual(sum(payments, invoice.id) - sum(reversals, invoice.id));
      if (invoice.status === "void" || invoice.status === "draft") continue;
      const total = Number(invoice.total_minor);
      expect(invoice.status).toBe(net >= total ? "paid" : net > 0 ? "partial" : "issued");
    }
    expect(reversals.some((row) => invoices.get(String(row.invoice_id))?.status === "issued")).toBe(true);
    expect(reversals.some((row) => invoices.get(String(row.invoice_id))?.status === "partial")).toBe(true);
    const lines = rows("invoice_lines");
    for (const adjustment of adjustments) {
      const parent = invoices.get(String(adjustment.parent_invoice_id))!;
      expect(parent.kind).toBe("standard");
      expect(["issued", "paid", "partial"]).toContain(parent.status);
      expect(adjustment.status).toBe("draft");
      expect(adjustment.number).toBeNull();
      expect(adjustment.issue_date).toBeNull();
      expect(adjustment.paid_minor).toBe(0);
      const own = lines.filter((line) => line.invoice_id === adjustment.id);
      expect(own.length).toBeGreaterThan(0);
      for (const line of own) expect(line.kind).toBe("transport");
      expect(events.some((event) => event.invoice_id === parent.id && event.action === "adjustment-created")).toBe(true);
    }
    expect(new Set(rows("invoices").map((row) => row.idempotency_key)).size).toBe(rows("invoices").length);
    const planned = buildSteps({ keepDemoAccounts: false }).map((step) => step.table);
    for (const table of ["invoice_payment_reversals", "invoice_refunds"]) {
      expect(planned).toContain(table);
      expect(planned.indexOf(table)).toBeLessThan(planned.indexOf("invoice_payment_references"));
      expect(planned.indexOf(table)).toBeLessThan(planned.indexOf("invoices"));
    }
  });
});
