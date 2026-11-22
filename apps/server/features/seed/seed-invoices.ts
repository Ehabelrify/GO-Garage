import { receptionOf } from "./seed-people";
import type { World } from "./seed-world";

/**
 * Example generic invoices for seeded delivered jobs. Deterministic (no randomness; everything derives from the visit),
 * idempotent (stable `seed-inv-<visit>` ids and `job:<jobId>` keys; inserts use ON CONFLICT DO NOTHING) and purge-safe.
 * Amounts follow the seeded sale price; tax is NOT applied because no tax policy is approved. Example data only.
 */
const METHODS = ["card", "transfer", "cash", "instapay"] as const;
const RECENT_DRAFT_DAYS = 3;
const DAY = 86_400_000;

export const formatSeedInvoiceNumber = (branchId: string, year: number, sequence: number) =>
  `INV-${branchId.replace(/^seed-/i, "").replace(/^branch-/i, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "X"}-${year}-${String(sequence).padStart(5, "0")}`;

export function addSeedInvoices(world: World) {
  const { ds, ctx } = world;
  const delivered = world.visits
    .filter((visit) => visit.jobId && visit.deliveredAt && visit.deliveredDate && visit.saleMinor > 0)
    .sort((a, b) => a.deliveredAt!.getTime() - b.deliveredAt!.getTime() || a.n - b.n);
  const counters = new Map<string, number>();

  for (const visit of delivered) {
    const n = String(visit.n).padStart(4, "0");
    const id = `seed-inv-${n}`;
    const deliveredAt = visit.deliveredAt!;
    const issuer = receptionOf(visit.branchId);
    const discount = visit.quote?.discountMinor ?? 0;
    const sale = visit.saleMinor;
    const gross = sale + discount;
    const recent = ctx.now.getTime() - deliveredAt.getTime() < RECENT_DRAFT_DAYS * DAY;
    const voided = !recent && visit.n % 41 === 0 && visit.paidMinor === 0;
    const paid = recent || voided ? 0 : Math.min(visit.paidMinor, sale);
    const status = recent ? "draft" : voided ? "void" : paid >= sale ? "paid" : paid > 0 ? "partial" : "issued";
    const issuedAt = new Date(Math.min(deliveredAt.getTime() + 30 * 60_000, ctx.now.getTime() - 60_000));
    const issueDate = visit.deliveredDate!;
    const year = Number(issueDate.slice(0, 4));

    let number: string | null = null;
    if (status !== "draft") {
      const key = `${visit.branchId}|${year}`;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      number = formatSeedInvoiceNumber(visit.branchId, year, next);
    }
    const warranty = visit.warranties[0];
    ds.add("invoices", {
      id, environment_id: ctx.environmentId, branch_id: visit.branchId, customer_id: visit.customer.id, vehicle_id: visit.vehicle.id,
      booking_id: visit.id, job_id: visit.jobId, quote_id: visit.quote?.accepted ? visit.quote.id : null, warranty_id: warranty ? warranty.id : null,
      source: "auto", idempotency_key: `job:${visit.jobId}`, number, status, currency: "EGP", tax_rate_percent: null,
      subtotal_minor: gross, discount_minor: discount, tax_minor: 0, total_minor: sale, paid_minor: paid,
      issue_date: status === "draft" ? null : issueDate,
      notes: "Tax is not applied: no tax policy is approved.", terms: "",
      revision: status === "draft" ? 1 : status === "issued" ? 2 : 3 + (paid > 0 ? 1 : 0),
      created_by: issuer, issued_by: status === "draft" ? null : issuer, issued_at: status === "draft" ? null : issuedAt,
      voided_by: voided ? issuer : null, voided_at: voided ? new Date(issuedAt.getTime() + DAY) : null, void_reason: voided ? "Example: issued to the wrong customer record" : null,
      created_at: deliveredAt, updated_at: status === "draft" ? deliveredAt : issuedAt,
    });
    ds.add("invoice_lines", {
      id: `${id}-l1`, invoice_id: id, position: 0, kind: visit.product.kind === "package" ? "package" : "service",
      description_en: visit.product.label.en.slice(0, 240), description_ar: visit.product.label.ar.slice(0, 240),
      quantity: 1, unit_minor: gross, discount_minor: discount, tax_minor: 0,
    });
    let seq = 1;
    const event = (action: string, from: string | null, to: string, at: Date, reason = "") => {
      ds.add("invoice_events", { invoice_id: id, seq: seq++, action, from_status: from, to_status: to, actor_id: action === "generated" ? null : issuer, reason, occurred_at: at });
    };
    event("generated", null, "draft", deliveredAt, "Generated automatically when the job was delivered");
    if (status !== "draft") event("issued", "draft", "issued", issuedAt);
    if (paid > 0) {
      const at = new Date(Math.min(issuedAt.getTime() + 600_000, ctx.now.getTime() - 30_000));
      const reference = `RCPT-${n}`;
      ds.add("invoice_payment_references", {
        id: `${id}-p1`, invoice_id: id, amount_minor: paid, currency: "EGP", method: METHODS[visit.n % METHODS.length], reference,
        received_on: issueDate, recorded_by: issuer, created_at: at,
      });
      event("payment-recorded", "issued", paid >= sale ? "paid" : "partial", at, reference);
    }
    if (voided) event("voided", "issued", "void", new Date(issuedAt.getTime() + DAY), "Example: issued to the wrong customer record");
  }

  for (const [key, last] of counters) {
    const [branchId, year] = key.split("|");
    ds.add("invoice_number_sequences", { branch_id: branchId, year: Number(year), last_value: last });
  }
}
