import { receptionOf } from "./seed-people";
import type { World } from "./seed-world";

/**
 * Example generic invoices for seeded delivered jobs. Deterministic (no randomness; everything derives from the visit),
 * idempotent (stable `seed-inv-<visit>` ids and `job:<jobId>` keys; inserts use ON CONFLICT DO NOTHING) and purge-safe.
 * Amounts follow the seeded sale price; tax is NOT applied because no tax policy is approved. Example data only.
 *
 * Some paid invoices (picked by their order among paid ones, modulo 4) also carry a payment reversal, a split payment with
 * one reversed part, or a refund; a few issued/paid originals get a draft adjustment invoice (kind=adjustment, transport line).
 * Invoice payments are not finance money events in this seed, so the money-event links stay empty.
 */
const METHODS = ["card", "transfer", "cash", "instapay"] as const;
const RECENT_DRAFT_DAYS = 3;
const DAY = 86_400_000;

export const formatSeedInvoiceNumber = (branchId: string, year: number, sequence: number) =>
  `INV-${branchId.replace(/^seed-/i, "").replace(/^branch-/i, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "X"}-${year}-${String(sequence).padStart(5, "0")}`;

interface Original { id: string; status: string; issuer: string; branchId: string; customerId: string; vehicleId: string; nextSeq: number; lastAt: Date }

export function addSeedInvoices(world: World) {
  const { ds, ctx } = world;
  const delivered = world.visits
    .filter((visit) => visit.jobId && visit.deliveredAt && visit.deliveredDate && visit.saleMinor > 0)
    .sort((a, b) => a.deliveredAt!.getTime() - b.deliveredAt!.getTime() || a.n - b.n);
  const counters = new Map<string, number>();
  const originals: Original[] = [];
  let eligibleCount = 0;
  const statusFor = (amount: number, sale: number) => (amount >= sale ? "paid" : amount > 0 ? "partial" : "issued");

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
    const received = recent || voided ? 0 : Math.min(visit.paidMinor, sale);
    // Deterministic pick among issued invoices that received money: 0 = fully reversed, 1 = split with one part reversed, 2 = refunded, 3 = untouched.
    const slot = received > 0 ? eligibleCount++ % 4 : -1;
    const split = slot === 1 && received >= 2;
    const firstPart = split ? Math.round(received * 0.6) : received;
    const reversed = slot === 0 ? received : split ? received - firstPart : 0;
    const refunded = slot === 2 ? Math.max(1, Math.round(received * 0.25)) : 0;
    const paid = received - reversed - refunded;
    const status = recent ? "draft" : voided ? "void" : statusFor(paid, sale);
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
    const extraRevisions = (reversed > 0 ? 1 : 0) + (refunded > 0 ? 1 : 0) + (split ? 1 : 0);
    const invoice = ds.add("invoices", {
      id, environment_id: ctx.environmentId, branch_id: visit.branchId, customer_id: visit.customer.id, vehicle_id: visit.vehicle.id,
      booking_id: visit.id, job_id: visit.jobId, quote_id: visit.quote?.accepted ? visit.quote.id : null, warranty_id: warranty ? warranty.id : null,
      source: "auto", idempotency_key: `job:${visit.jobId}`, number, status, currency: "EGP", tax_rate_percent: null,
      subtotal_minor: gross, discount_minor: discount, tax_minor: 0, total_minor: sale, paid_minor: paid,
      issue_date: status === "draft" ? null : issueDate,
      notes: "Tax is not applied: no tax policy is approved.", terms: "", kind: "standard", parent_invoice_id: null,
      revision: status === "draft" ? 1 : status === "issued" && extraRevisions === 0 ? 2 : 3 + (received > 0 ? 1 : 0) + extraRevisions,
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
    let current = "draft";
    let lastAt = deliveredAt;
    const event = (action: string, from: string | null, to: string, at: Date, reason = "") => {
      ds.add("invoice_events", { invoice_id: id, seq: seq++, action, from_status: from, to_status: to, actor_id: action === "generated" ? null : issuer, reason, occurred_at: at });
      current = to;
      lastAt = at;
    };
    event("generated", null, "draft", deliveredAt, "Generated automatically when the job was delivered");
    if (status !== "draft") event("issued", "draft", "issued", issuedAt);
    if (received > 0) {
      const at = new Date(Math.min(issuedAt.getTime() + 600_000, ctx.now.getTime() - 30_000));
      const amounts = split ? [firstPart, received - firstPart] : [received];
      let running = 0;
      amounts.forEach((amount, index) => {
        const reference = index === 0 ? `RCPT-${n}` : `RCPT-${n}-${index + 1}`;
        const paymentAt = new Date(at.getTime() + index * 1000);
        ds.add("invoice_payment_references", {
          id: `${id}-p${index + 1}`, invoice_id: id, amount_minor: amount, currency: "EGP", method: METHODS[(visit.n + index) % METHODS.length], reference,
          received_on: issueDate, recorded_by: issuer, created_at: paymentAt,
        });
        running += amount;
        event("payment-recorded", current, statusFor(running, sale), paymentAt, reference);
      });
      const later = (minutes: number) => new Date(Math.min(at.getTime() + minutes * 60_000, ctx.now.getTime() - 10_000));
      if (reversed > 0) {
        const paymentId = `${id}-p${amounts.length}`;
        const reversalAt = later(120);
        ds.add("invoice_payment_reversals", {
          id: `seed-invrev-${n}`, invoice_id: id, payment_id: paymentId, amount_minor: reversed,
          reason: "Example: payment entered against the wrong invoice", evidence_ref: `EVD-REV-${n}`, money_event_reversal_id: null,
          idempotency_key: `reverse:${paymentId}`, reversed_by: issuer, created_at: reversalAt,
        });
        running -= reversed;
        event("payment-reversed", current, statusFor(running, sale), reversalAt, `Example: payment ${paymentId} reversed`);
      }
      if (refunded > 0) {
        const refundAt = later(240);
        ds.add("invoice_refunds", {
          id: `seed-invref-${n}`, invoice_id: id, amount_minor: refunded, currency: "EGP",
          reason: "Example: goodwill refund approved by the Owner", evidence_ref: `EVD-RFND-${n}`, money_event_id: null,
          idempotency_key: `refund:${id}:1`, refunded_by: issuer, created_at: refundAt,
        });
        running -= refunded;
        event("refunded", current, statusFor(running, sale), refundAt, "Example: goodwill refund");
      }
      if (lastAt > issuedAt) invoice.updated_at = lastAt;
    }
    if (voided) event("voided", "issued", "void", new Date(issuedAt.getTime() + DAY), "Example: issued to the wrong customer record");
    if (status === "issued" || status === "paid") originals.push({ id, status, issuer, branchId: visit.branchId, customerId: visit.customer.id, vehicleId: visit.vehicle.id, nextSeq: seq, lastAt });
  }

  // Supplementary adjustment drafts: separate invoices linked to an issued or paid original, which is never rewritten.
  originals.filter((_, index) => index % 5 === 2).forEach((parent, index) => {
    const adjustmentId = `seed-inv-adj-${String(index + 1).padStart(3, "0")}`;
    const amount = 100_000 + (index % 4) * 50_000;
    const at = new Date(Math.min(parent.lastAt.getTime() + 3 * DAY, ctx.now.getTime() - 20_000));
    ds.add("invoices", {
      id: adjustmentId, environment_id: ctx.environmentId, branch_id: parent.branchId, customer_id: parent.customerId, vehicle_id: parent.vehicleId,
      booking_id: null, job_id: null, quote_id: null, warranty_id: null, source: "manual", idempotency_key: `adjustment:${parent.id}:1`,
      number: null, status: "draft", currency: "EGP", tax_rate_percent: null, subtotal_minor: amount, discount_minor: 0, tax_minor: 0, total_minor: amount, paid_minor: 0,
      issue_date: null, notes: "Supplementary transport charge. Tax is not applied: no tax policy is approved.", terms: "", kind: "adjustment", parent_invoice_id: parent.id,
      revision: 1, created_by: parent.issuer, issued_by: null, issued_at: null, voided_by: null, voided_at: null, void_reason: null, created_at: at, updated_at: at,
    });
    ds.add("invoice_lines", {
      id: `${adjustmentId}-l1`, invoice_id: adjustmentId, position: 0, kind: "transport",
      description_en: "Additional transport charge", description_ar: "رسوم نقل إضافية", quantity: 1, unit_minor: amount, discount_minor: 0, tax_minor: 0,
    });
    ds.add("invoice_events", { invoice_id: adjustmentId, seq: 1, action: "created", from_status: null, to_status: "draft", actor_id: parent.issuer, reason: `Adjustment of ${parent.id}`, occurred_at: at });
    ds.add("invoice_events", { invoice_id: parent.id, seq: parent.nextSeq, action: "adjustment-created", from_status: parent.status, to_status: parent.status, actor_id: parent.issuer, reason: adjustmentId, occurred_at: at });
  });

  for (const [key, last] of counters) {
    const [branchId, year] = key.split("|");
    ds.add("invoice_number_sequences", { branch_id: branchId, year: Number(year), last_value: last });
  }
}
