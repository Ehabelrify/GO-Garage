import { createHash } from "node:crypto";
import { addDays, daysBetween, egp, json, plainHash } from "./seed-core";
import { OWNER, managerOf, receptionOf, type CustomerRec } from "./seed-people";
import { lbl } from "./seed-reference";
import { recordMoneyEvent } from "./seed-aftersales";
import { nextId, type ChatSpec, type VisitRec, type World } from "./seed-world";

const ev = (kind: string, n: string) => `private:seed/${kind}-${n}`;
export const contactHash = (customer: CustomerRec) => createHash("sha256").update(`seed-contact:${customer.phoneNormalized}`).digest("hex");

/* ------------------------------- transport ------------------------------- */

type TransportStatus = "proposed" | "requested" | "confirmed" | "pickup-in-progress" | "in-custody" | "completed" | "cancelled" | "exception";
const PATH: TransportStatus[] = ["proposed", "requested", "confirmed", "pickup-in-progress", "in-custody", "completed"];
const AR_AREAS = ["مدينة نصر - شارع عباس العقاد", "المعادي - شارع 9", "التجمع الخامس - الحي الثاني", "مصر الجديدة - شارع الحجاز", "الشيخ زايد - الحي السابع", "المهندسين - شارع جامعة الدول", "الزمالك - شارع 26 يوليو", "6 أكتوبر - الحي المتميز"];
const EN_AREAS = ["Nasr City - Abbas El-Akkad St", "Maadi - Street 9", "New Cairo - 2nd District", "Heliopolis - El-Hegaz St", "Sheikh Zayed - 7th District", "Mohandessin - Gameat El-Dowal St", "Zamalek - 26 July St", "6th of October - Gehan District"];

export function addTransport(world: World, visit: VisitRec, direction: "pickup" | "return" | "courtesy", mode: "tow" | "driver" | "courtesy-car", target: TransportStatus) {
  const { ds, ctx, rng, ref } = world;
  if (!visit.jobId) return;
  const id = nextId(world, "tr");
  const branchId = visit.branchId;
  const policyId = `transport-availability:${branchId}:${direction}:${mode}`;
  const fee = mode === "driver" ? { minor: 35000, currency: "EGP" } : null;
  const day = direction === "return" ? visit.pickup : visit.date;
  const start = ctx.at(day, direction === "return" ? "14:00" : "08:00");
  const snapshot = {
    direction, mode, serviceArea: lbl("القاهرة الكبرى (نص تجريبي)", "Greater Cairo (example)"), providerId: `seed-provider-${mode}-${branchId}`,
    capacity: mode === "courtesy-car" ? 1 : 2, fee, custodyRule: lbl("تُسجل حالة السيارة عند الاستلام (نص تجريبي)", "Vehicle condition is recorded at hand-over (example wording)"),
  };
  const path = target === "cancelled" || target === "exception" ? PATH.slice(0, 3) : PATH.slice(0, PATH.indexOf(target) + 1);
  const finalPath: TransportStatus[] = target === "cancelled" || target === "exception" ? [...path, target] : path;
  const committed = finalPath.length > 2 && !["cancelled"].includes(target);
  const created = new Date(Math.min(start.getTime() - 2 * 86_400_000, ctx.now.getTime() - 3_600_000));
  const staff = receptionOf(branchId);
  const area = rng.int(0, AR_AREAS.length - 1);
  ds.add("transport_requests", {
    id, environment_id: ctx.environmentId, booking_id: visit.id, job_id: visit.jobId, branch_id: branchId, customer_id: visit.customer.id, vehicle_id: visit.vehicle.id,
    direction, mode, status: target, provider_id: finalPath.length > 2 ? snapshot.providerId : null, policy_id: finalPath.length > 1 ? policyId : null,
    policy_version: finalPath.length > 1 ? 1 : null, policy_snapshot: finalPath.length > 1 ? json(snapshot) : null, fee: finalPath.length > 1 && fee ? json(fee) : null,
    committed_starts_at: committed ? start : null, committed_ends_at: committed ? new Date(start.getTime() + 3 * 3_600_000) : null,
    missing: finalPath.length > 1 ? [] : ["provider", "committed window"], revision: finalPath.length, created_by: staff, created_at: created,
    updated_at: new Date(Math.min(created.getTime() + finalPath.length * 3_600_000 * 6, ctx.now.getTime())),
  });
  ds.add("transport_private_contacts", {
    transport_id: id, contact: visit.customer.phone, location: ctx.now ? (visit.customer.language === "ar" ? AR_AREAS[area] : EN_AREAS[area]) : "",
    instructions: visit.customer.language === "ar" ? "الاتصال قبل الوصول بنصف ساعة. السيارة في الجراج (نص تجريبي)." : "Call 30 minutes before arrival. The car is in the garage (example).",
  });
  finalPath.forEach((status, index) => {
    ds.add("transport_events", {
      transport_id: id, revision: index + 1, from_status: index === 0 ? null : finalPath[index - 1], to_status: status, actor_id: index < 2 ? staff : managerOf(branchId),
      reason: status === "cancelled" ? "Customer drove the car in themselves (example)" : status === "exception" ? "Provider could not reach the pickup address (example)" : null,
      evidence_ref: ["in-custody", "completed"].includes(status) ? ev("custody", `${id.slice(-4)}-${index}`) : null,
      occurred_at: new Date(Math.min(created.getTime() + index * 6 * 3_600_000, ctx.now.getTime() - 60_000)),
    });
  });
  void ref;
  if (!visit.transportId) visit.transportId = id;
}

/** Adds the transport lifecycle that fits where a visit currently is. */
export function transportFor(world: World, visit: VisitRec, kind: "tow" | "driver" | "mixed") {
  if (!visit.jobId) return;
  const mode = kind === "mixed" ? (world.rng.chance(0.5) ? "tow" : "driver") : kind;
  const stage = visit.stage;
  if (stage === "cancelled") return addTransport(world, visit, "pickup", mode, "cancelled");
  if (stage === "no-show") return addTransport(world, visit, "pickup", mode, "exception");
  if (stage === "delivered") { addTransport(world, visit, "pickup", mode, "completed"); return addTransport(world, visit, "return", mode, "completed"); }
  if (stage === "booked") { addTransport(world, visit, "pickup", mode, world.rng.pick(["confirmed", "requested"] as const)); return; }
  addTransport(world, visit, "pickup", mode, "completed");
  addTransport(world, visit, "return", mode, stage === "ready" || stage === "qc" ? "confirmed" : "requested");
}

/* ------------------------------ consents ------------------------------ */

export function addConsents(world: World) {
  const { ds, ctx, rng, ref } = world;
  const channel = ref.channelId;
  for (const customer of world.customers) {
    const active = customer.rich || world.chats.some((chat) => chat.customer === customer) || rng.chance(0.4);
    if (!active) continue;
    const firstVisit = world.visits.find((visit) => visit.customer === customer);
    const base = new Date(Math.min((firstVisit?.createdAt ?? addDaysDate(ctx.now, -90)).getTime(), ctx.now.getTime() - 3_600_000));
    const staff = receptionOf(customer.homeBranch);
    const purposes: Array<"service" | "marketing"> = rng.chance(0.55) || customer.rich ? ["service", "marketing"] : ["service"];
    for (const purpose of purposes) {
      const revokes = purpose === "marketing" && !customer.rich && rng.chance(0.25);
      const evidenceRef = ev("consent", `${customer.id.slice(-3)}-${purpose}`);
      const revokedAt = new Date(Math.min(base.getTime() + 20 * 86_400_000, ctx.now.getTime() - 60_000));
      ds.add("messaging_customer_consents", {
        channel_id: channel, customer_id: customer.id, purpose, status: revokes ? "revoked" : "granted", evidence_ref: evidenceRef, consented_at: base,
        expires_at: null, consented_by: staff, revoked_at: revokes ? revokedAt : null, revoked_by: revokes ? staff : null, revision: revokes ? 2 : 1,
      });
      ds.add("messaging_customer_consent_events", { id: `seed-mce-${customer.id.slice(-3)}-${purpose}-1`, channel_id: channel, customer_id: customer.id, purpose, revision: 1, action: "granted", evidence_ref: evidenceRef, reason: null, actor_user_id: staff, occurred_at: base });
      if (revokes) ds.add("messaging_customer_consent_events", { id: `seed-mce-${customer.id.slice(-3)}-${purpose}-2`, channel_id: channel, customer_id: customer.id, purpose, revision: 2, action: "revoked", evidence_ref: evidenceRef, reason: "Customer asked to stop promotional messages (example)", actor_user_id: staff, occurred_at: revokedAt });
    }
  }
}
const addDaysDate = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/* --------------------------- overhead and refunds --------------------------- */

export function addOverheadAndAdjustments(world: World) {
  const { ctx, rng } = world;
  for (let back = 0; back < 12; back++) {
    const first = new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth() - back, 1, 10));
    if (first.getTime() > ctx.now.getTime()) continue;
    const month = first.toISOString().slice(0, 7);
    for (const [branchId, tag] of [["branch-a", "A"], ["branch-b", "B"]] as const) {
      const items: Array<[string, number, string]> = [
        ["rent", branchId === "branch-a" ? 4_200_000 : 3_600_000, "Workshop rent (example)"],
        ["salaries", branchId === "branch-a" ? 6_800_000 : 5_100_000, "Staff salaries (example)"],
        ["utilities", rng.int(380_000, 620_000), "Electricity, water and internet (example)"],
      ];
      for (const [slug, amount, reason] of items) {
        recordMoneyEvent(world, { kind: "overhead", amountMinor: amount, at: first, branchId, ref: `OVH-${tag}-${month}-${slug}`, method: "bank-transfer", reason });
      }
    }
  }
  const candidates = world.moneyReverseCandidates.slice(0, 4);
  candidates.forEach((eventId, index) => {
    world.ds.add("operational_money_event_reversals", {
      id: `seed-mrev-${index + 1}`, event_id: eventId, reason: "Duplicate receipt entered by mistake; reversed (example)", evidence_ref: ev("reversal", `m${index + 1}`),
      reversed_by: OWNER, reversed_at: new Date(Math.min(ctx.now.getTime() - 60_000, new Date(`${ctx.today}T08:00:00Z`).getTime())),
    });
  });
  // A few refunds on cancelled bookings that had advance payments.
  let refunds = 0;
  for (const visit of world.visits) {
    if (refunds >= 4) break;
    if (visit.stage !== "cancelled" || !visit.reservation) continue;
    recordMoneyEvent(world, { kind: "refund", amountMinor: 500_000, at: new Date(Math.min(ctx.now.getTime() - 60_000, visit.createdAt.getTime() + 5 * 86_400_000)), branchId: visit.branchId, ref: `RFND-${String(visit.n).padStart(4, "0")}`, method: "bank-transfer", reason: "Advance refunded after cancellation approved by the Owner (example)", customerId: visit.customer.id, jobId: visit.jobId });
    refunds++;
  }
}

/* ------------------------- marketing-grade settings ------------------------- */

export function addVerificationAudit(world: World) {
  world.ds.add("warranty_verification_settings_audit", {
    id: "seed-wvsa-1", action: "enabled", enabled: true, approved_fields: ["service", "status", "startDate", "expiresOn", "branch", "coverage"], actor_user_id: OWNER,
    created_at: world.ctx.at(world.ref.windowStart, "10:30"),
  });
}

export const finalizeLinks = (world: World) => {
  // Every customer has at least their home branch in customer_branches.
  for (const customer of world.customers) customer.branches.add(customer.homeBranch);
  for (const customer of world.customers) {
    const first = world.visits.filter((visit) => visit.customer === customer).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    const firstQuote = world.quotes.filter((quote) => quote.customer === customer)[0];
    const created = first?.createdAt ?? (firstQuote ? world.ctx.past(firstQuote.offeredOn, "10:00") : world.ctx.past(addDays(world.ctx.today, -30), "10:00"));
    const createdAt = new Date(Math.min(created.getTime(), (first?.createdAt ?? created).getTime()) - 86_400_000);
    world.ds.add("customers", { id: customer.id, name: customer.name, phone: customer.phone, phone_normalized: customer.phoneNormalized, preferred_language: customer.language, created_at: createdAt });
    for (const vehicle of customer.vehicles) {
      world.ds.add("vehicles", { id: vehicle.id, customer_id: customer.id, make: vehicle.make, model: vehicle.model, year: vehicle.year, plate: vehicle.plate, color: vehicle.color, category_id: vehicle.categoryId, created_at: createdAt });
    }
    for (const branchId of customer.branches) world.ds.add("customer_branches", { customer_id: customer.id, branch_id: branchId, created_at: createdAt });
  }
  void daysBetween; void egp; void plainHash;
};

export type { ChatSpec };
