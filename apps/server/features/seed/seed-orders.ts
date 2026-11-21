import {
  SEED_REASON, addDays, daysBetween, hash, json, plainHash, type Money,
} from "./seed-core";
import {
  BRANCH_A, BRANCH_B, managerOf, receptionOf, techniciansOf, type CustomerRec, type VehicleRec,
} from "./seed-people";
import {
  GRADES, SERVICES, packageAt, serviceById, warrantyPolicyAt, type PackageDef, type PromoKey,
} from "./seed-reference";
import {
  demandOf, nextId, nextWorkingDay, occupancyPlan, reserveCapacity, tryPlace,
  type ChatSpec, type Product, type QuoteRec, type VisitRec, type World,
} from "./seed-world";
import { deliverVisit } from "./seed-aftersales";

const CURRENCY = "EGP" as const;
const evidence = (kind: string, n: string) => `private:seed/${kind}-${n}`;

/* ------------------------------ products ------------------------------ */

export function legacyProduct(serviceId: string, grade?: string): Product {
  const service = serviceById(serviceId);
  const warrantyPolicyId = serviceId === "tint" ? "seed-wp-heat-film"
    : serviceId === "ceramic" ? "seed-wp-ceramic"
      : serviceId === "full-ppf" ? `seed-wp-ppf-${grade ?? "black"}` : null;
  return {
    kind: "legacy", serviceId, pkg: null, priceEgp: service.examplePrice, warrantyPolicyId,
    label: { en: service.nameEn, ar: service.nameAr }, promoKey: null, gradeKey: grade ?? null,
  };
}
export function packageProduct(pkg: PackageDef): Product {
  const primary = pkg.work[0]?.id ?? "";
  return {
    kind: "package", serviceId: pkg.primaryServiceId, pkg, priceEgp: (pkg.priceMinor ?? 0) / 100,
    warrantyPolicyId: pkg.warranty[primary] ?? null, label: { en: pkg.name.en, ar: pkg.name.ar }, promoKey: pkg.promo, gradeKey: pkg.gradeKey,
  };
}

export function pickProduct(world: World, vehicle: VehicleRec, quoteDate: string): Product {
  const { rng, ref } = world;
  const roll = rng.float();
  if (roll < 0.34) {
    const serviceId = rng.weighted([["inspection", 34], ["tint", 26], ["audio", 8], ["ceramic", 18], ["full-ppf", 14]] as const);
    return legacyProduct(serviceId, serviceId === "full-ppf" ? rng.pick(["black", "ultimate", "matte"]) : undefined);
  }
  if (roll < 0.80) {
    const grade = rng.weighted([["pro", 30], ["ultimate", 28], ["plus", 12], ["black", 10], ["matte", 10]] as const);
    const pkg = packageAt(ref, `seed-pkg-ppf-${grade}-${vehicle.category}`, quoteDate);
    if (pkg) return packageProduct(pkg);
  }
  const addOn = rng.weighted([["heat-plus", 30], ["vkool", 22], ["interior-nano", 20], ["glass-guard", 16], ["panorama", 12]] as const);
  return packageProduct(packageAt(ref, `seed-pkg-addon-${addOn}`, quoteDate)!);
}

/* ------------------------------- quotes ------------------------------- */

export type QuoteMode = "direct" | "revised" | "draft" | "open" | "expired" | "cancelled";
export interface QuoteOptions {
  customer: CustomerRec; vehicle: VehicleRec; branchId: string; pkg: PackageDef; quoteDate: string; mode: QuoteMode;
  chat?: ChatSpec | null; manual?: boolean; priceMinor?: number; acceptDelay?: number; followupStatus?: "requested" | "preparing"; discountMinor?: number;
}

export function makeQuote(world: World, o: QuoteOptions): QuoteRec {
  const { ds, ctx, rng, ref } = world;
  const id = nextId(world, "quote");
  const reception = receptionOf(o.branchId);
  const manager = managerOf(o.branchId);
  const price = o.priceMinor ?? o.pkg.priceMinor ?? 0;
  const discount = o.discountMinor ?? 0;
  o.customer.branches.add(o.branchId);
  const scope = o.pkg.scope;
  const lines = scope.map((item, index) => ({
    id: `line-${item.id}`, scopeItemId: item.id, quantity: item.quantity,
    unitPrice: { minor: index === 0 ? price : 0, currency: CURRENCY }, discount: { minor: index === 0 ? discount : 0, currency: CURRENCY }, tax: { minor: 0, currency: CURRENCY },
  }));
  const total: Money = { minor: price - discount, currency: CURRENCY };
  const warrantyBindings = o.pkg.work.filter((component) => o.pkg.warranty[component.id]).map((component) => ({
    componentId: component.id,
    policy: { id: o.pkg.warranty[component.id], version: warrantyPolicyAt(o.pkg.warranty[component.id], o.quoteDate).version },
    issuanceAuthority: ref.issuanceAuthority,
  }));
  const benefitBindings = o.pkg.benefitKeys.map((key) => ref.benefitPolicies[key as keyof typeof ref.benefitPolicies]);
  const offeredOn = o.quoteDate;
  const validThrough = addDays(offeredOn, 21);
  const terms = { validityDays: 30, acceptanceMethods: ["staff-recorded", "customer-confirmed"], evidenceRequired: true, overrideRole: "owner", taxTreatment: ref.taxPolicy };
  const priceOrigin = o.manual || discount > 0
    ? { kind: o.manual ? "inspection" : "manual", actorId: manager, reason: o.manual ? "Custom scope priced after inspection (example)" : "Warranty-card referral discount (example)" }
    : { kind: "catalogue" };

  const input = (state: "draft" | "offered") => ({
    quoteId: id, branchId: o.branchId, customerId: o.customer.id,
    vehicle: { vehicleId: o.vehicle.id, model: o.vehicle.model, categoryId: o.vehicle.categoryId },
    enquiryRef: o.chat?.id ?? null, sourceChannelRef: o.chat ? ref.channelId : null,
    packageVersion: o.manual ? null : { id: o.pkg.id, version: o.pkg.version }, scope, work: o.pkg.work, lines,
    priceOrigin, taxTreatment: state === "offered" ? ref.taxPolicy : null,
    acceptancePolicy: state === "offered" ? ref.acceptancePolicy : null, validThrough: state === "offered" ? validThrough : null,
    warrantyBindings: state === "offered" ? warrantyBindings : [], benefitBindings: state === "offered" ? benefitBindings : [], state,
  });
  const versions: Array<{ revision: number; state: "draft" | "offered" | "cancelled"; at: Date }> = [];
  const baseAt = ctx.past(offeredOn, "11:00");
  if (o.mode === "revised") {
    versions.push({ revision: 1, state: "draft", at: new Date(baseAt.getTime() - 26 * 3_600_000) }, { revision: 2, state: "offered", at: baseAt });
  } else if (o.mode === "draft") versions.push({ revision: 1, state: "draft", at: baseAt });
  else if (o.mode === "cancelled") versions.push({ revision: 1, state: "cancelled", at: baseAt });
  else versions.push({ revision: 1, state: "offered", at: baseAt });
  const current = versions[versions.length - 1];
  const accepts = o.mode === "direct" || o.mode === "revised";

  let acceptedAt: Date | null = null, acceptedOn: string | null = null, accepted: unknown | null = null, evidenceRef: string | null = null;
  let digest = "";
  for (const version of versions) {
    const state = version.state === "cancelled" ? "offered" : version.state;
    const snapshot = {
      input: input(state),
      total: state === "offered" ? total : null, acceptanceTerms: state === "offered" ? terms : null,
    };
    const rowDigest = hash({ quoteId: id, revision: version.revision, snapshot });
    if (version === current) digest = rowDigest;
    ds.add("quote_versions", {
      quote_id: id, revision: version.revision, state: version.state, snapshot: json(snapshot), digest: rowDigest,
      valid_through: state === "offered" ? validThrough : null, created_by: reception, created_at: version.at,
    });
    ds.add("quote_audit", {
      quote_id: id, revision: version.revision, action: version.state === "draft" ? "draft-created" : version.state === "cancelled" ? "cancelled" : "offered",
      actor_id: reception, reason: null, occurred_at: version.at,
    });
  }
  if (accepts) {
    acceptedOn = addDays(offeredOn, o.acceptDelay ?? rng.int(0, 5));
    acceptedAt = ctx.past(acceptedOn, "15:30");
    if (acceptedAt.getTime() < current.at.getTime()) acceptedAt = new Date(current.at.getTime() + 3_600_000);
    evidenceRef = evidence("quote-acceptance", id.slice(-4));
    const customerConfirmed = rng.chance(0.3);
    accepted = {
      ref: { quoteId: id, revision: current.revision }, branchId: o.branchId, customerId: o.customer.id,
      vehicle: { vehicleId: o.vehicle.id, model: o.vehicle.model, categoryId: o.vehicle.categoryId }, packageVersion: o.manual ? null : { id: o.pkg.id, version: o.pkg.version },
      scope, lines, total, taxTreatment: ref.taxPolicy, work: o.pkg.work, warrantyBindings, benefitBindings,
      acceptance: { method: customerConfirmed ? "customer-confirmed" : "staff-recorded", actorId: reception, evidenceRef, at: acceptedAt.toISOString() }, digest,
    };
    ds.add("quote_acceptance_events", {
      quote_id: id, revision: current.revision, environment_id: ctx.environmentId, actor_id: reception,
      method: customerConfirmed ? "customer-confirmed" : "staff-recorded", evidence_ref: evidenceRef,
      idempotency_key: `seed-accept-${id}`, request_hash: plainHash({ id, revision: current.revision }), accepted_snapshot: json(accepted), occurred_at: acceptedAt,
    });
    if (customerConfirmed) {
      ds.add("quote_customer_confirmations", {
        id: `seed-qcc-${id.slice(-4)}`, quote_id: id, revision: current.revision, customer_id: o.customer.id,
        evidence_ref: evidenceRef, verified_by: reception, verified_at: acceptedAt,
      });
    }
    ds.add("quote_audit", { quote_id: id, revision: current.revision, action: "accepted", actor_id: reception, reason: null, occurred_at: acceptedAt });
  }
  ds.add("quote_heads", {
    id, environment_id: ctx.environmentId, branch_id: o.branchId, customer_id: o.customer.id, vehicle_id: o.vehicle.id,
    current_revision: current.revision, accepted_revision: accepts ? current.revision : null, created_by: reception, created_at: versions[0].at,
  });
  const followupStatus = o.followupStatus ?? (o.mode === "draft" ? "preparing" : o.mode === "cancelled" ? "cancelled" : "answered");
  ds.add("quote_followups", {
    quote_id: id, requested_at: new Date(versions[0].at.getTime() - 2 * 3_600_000), responsible_user_id: reception, status: followupStatus,
    answered_at: followupStatus === "answered" ? new Date(current.at.getTime() + 2 * 3_600_000) : null,
    promised_response_at: new Date(versions[0].at.getTime() + 24 * 3_600_000),
  });

  const rec: QuoteRec = {
    id, customer: o.customer, vehicle: o.vehicle, branchId: o.branchId, pkg: o.pkg, revision: current.revision,
    state: accepts ? "accepted" : o.mode === "draft" ? "draft" : o.mode === "cancelled" ? "cancelled" : "offered",
    offeredOn, acceptedOn, acceptedAt, validThrough: o.mode === "draft" ? null : validThrough, digest, total, scope, work: o.pkg.work,
    warrantyBindings, benefitBindings, evidenceRef, accepted, discountMinor: o.discountMinor ?? 0, manual: Boolean(o.manual), chatId: o.chat?.id ?? null,
  };
  world.quotes.push(rec);
  return rec;
}

/* -------------------------------- visits -------------------------------- */

export interface VisitOptions {
  customer: CustomerRec; vehicle: VehicleRec; branchId: string; date: string; product: Product; quote?: QuoteRec | null;
  status: VisitRec["status"]; leadDays?: number; rich?: boolean; chat?: ChatSpec | null; whatsapp?: boolean; deliveredDelay?: number;
  forceStage?: VisitRec["stage"]; time?: string; skipCapacity?: boolean;
}

const hh = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const nowCairoMinutes = (world: World) => ((world.ctx.now.getUTCHours() + 2) * 60 + world.ctx.now.getUTCMinutes()) % 1440;

export function makeVisit(world: World, o: VisitOptions): VisitRec | null {
  const { ds, ctx, rng } = world;
  const demand = demandOf(o.product);
  let date = nextWorkingDay(o.date);
  const confirmed = o.status === "confirmed";
  let plan = occupancyPlan(date, demand);
  if (confirmed && !o.skipCapacity) {
    let placed = tryPlace(world, o.branchId, date, demand);
    for (let attempt = 0; !placed && attempt < 4; attempt++) {
      date = nextWorkingDay(addDays(date, 1));
      placed = tryPlace(world, o.branchId, date, demand);
    }
    if (!placed) return null;
    plan = placed;
    reserveCapacity(world, o.branchId, plan);
  } else if (confirmed) {
    reserveCapacity(world, o.branchId, plan);
  }
  const firstDayMax = Math.max(...[...(plan.perDay.get(date)?.values() ?? [120])]);
  const latestStart = Math.max(8, Math.floor((17 * 60 - firstDayMax) / 60));
  const time = o.time ?? hh(rng.int(8, latestStart) * 60);
  const pickup = plan.dayList[plan.dayList.length - 1];
  const n = (world.seq.get("visit") ?? 0) + 1;
  world.seq.set("visit", n);
  const id = `seed-bkg-${String(n).padStart(4, "0")}`;
  const lead = o.leadDays ?? rng.int(1, 12);
  const createdAt = ctx.past(addDays(date, -lead), `${String(rng.int(9, 17)).padStart(2, "0")}:${String(rng.int(0, 5) * 10).padStart(2, "0")}`);
  const reception = receptionOf(o.branchId);
  const createdBy = o.whatsapp ? "whatsapp-simulation" : reception;
  const quote = o.quote ?? null;

  ds.add("bookings", {
    id, customer_id: o.customer.id, vehicle_id: o.vehicle.id, service_id: o.product.serviceId, branch_id: o.branchId,
    dropoff_date: date, dropoff_time: time, expected_pickup: pickup, status: o.status, created_by: createdBy,
    created_at: createdAt, updated_at: createdAt,
    accepted_quote_id: quote?.accepted ? quote.id : null, accepted_quote_revision: quote?.accepted ? quote.revision : null,
  });
  o.customer.branches.add(o.branchId);
  const visit: VisitRec = {
    n, id, jobId: null, customer: o.customer, vehicle: o.vehicle, branchId: o.branchId, product: o.product, date, time, pickup, days: plan.dayList,
    status: o.status, stage: null, deliveredDate: null, deliveredAt: null, technician: null, createdAt, createdBy, quote, reservation: null,
    chat: o.chat ?? null, rich: Boolean(o.rich), saleMinor: Math.round(o.product.priceEgp * 100) - (quote?.discountMinor ?? 0), paidMinor: 0, depositMinor: 0,
    warranties: [], transportId: null,
  };
  world.visits.push(visit);
  if (o.chat) o.chat.visit = visit;

  if (o.status === "pending") return visit;
  const jobId = `seed-job-${String(n).padStart(4, "0")}`;
  visit.jobId = jobId;
  const jobEvents: Array<{ from: string | null; to: string; actor: string; note: string; at: Date }> = [];
  const techs = techniciansOf(o.branchId);
  const technician = rng.pick(techs);
  const manager = managerOf(o.branchId);

  if (o.status === "cancelled" || o.status === "no-show") {
    visit.stage = o.status === "cancelled" ? "cancelled" : "no-show";
    jobEvents.push({ from: null, to: "booked", actor: reception, note: "Booking confirmed", at: createdAt });
    const endAt = ctx.past(date, time, o.status === "no-show" ? 180 : -60);
    jobEvents.push({
      from: "booked", to: visit.stage, actor: o.status === "no-show" ? manager : reception, at: new Date(Math.max(endAt.getTime(), createdAt.getTime() + 600_000)),
      note: o.status === "no-show" ? "Customer did not arrive; no contact within the grace period (example note)" : rng.pick(["Customer requested cancellation (example)", "Rescheduled by phone then cancelled (example)", "Customer found a closer branch (example)"]),
    });
  } else {
    jobEvents.push({ from: null, to: "booked", actor: createdBy, note: "Booking confirmed", at: createdAt });
    const today = ctx.today;
    let stage: NonNullable<VisitRec["stage"]> = "booked";
    let deliveredDate: string | null = null;
    if (pickup < today) {
      const delay = o.deliveredDelay ?? (rng.chance(0.14) ? rng.int(1, 3) : 0);
      const candidate = nextWorkingDay(addDays(pickup, delay));
      if (o.forceStage === "ready") stage = "ready";
      else if (candidate < today) { stage = "delivered"; deliveredDate = candidate; }
      else stage = "ready";
    } else if (date > today || (date === today && time > hh(nowCairoMinutes(world)))) stage = "booked";
    else if (pickup === today) stage = rng.weighted([["received", 22], ["in-service", 48], ["qc", 30]] as const);
    else stage = date === today ? "received" : "in-service";
    if (o.forceStage && o.forceStage !== "delivered" && (stage !== "delivered")) stage = o.forceStage as typeof stage;
    visit.stage = stage;
    const order = ["booked", "received", "in-service", "qc", "ready", "delivered"] as const;
    const reached = order.indexOf(stage as (typeof order)[number]);
    const lastDay = deliveredDate ?? pickup;
    const times: Array<[string, string, string, string, string]> = [
      ["booked", "received", date, "10:00", reception], ["received", "in-service", date, "11:00", technician],
      ["in-service", "qc", plan.dayList[plan.dayList.length - 1], "13:00", technician], ["qc", "ready", plan.dayList[plan.dayList.length - 1], "15:00", manager],
      ["ready", "delivered", lastDay, "16:30", reception],
    ];
    const notes: Record<string, string> = {
      received: "Vehicle received and inspected at the bay (example note)", "in-service": "Work started by the assigned technician (example note)",
      qc: "Work finished; quality check in progress (example note)", ready: "Quality check passed; vehicle ready for pickup (example note)", delivered: "Delivered to the customer; handover checklist signed (example note)",
    };
    for (let step = 0; step < reached; step++) {
      const [from, to, day, clock, actor] = times[step];
      const at = ctx.past(day, clock, step === 1 ? 5 : 0);
      jobEvents.push({ from, to, actor, note: notes[to], at });
    }
    if (stage === "delivered") {
      visit.deliveredDate = deliveredDate;
      visit.deliveredAt = jobEvents[jobEvents.length - 1].at;
    }
    if (reached >= 1) visit.technician = technician;
  }
  jobEvents.forEach((event, index) => {
    const previous = index > 0 ? jobEvents[index - 1].at.getTime() : 0;
    if (event.at.getTime() <= previous) event.at = new Date(previous + 300_000);
    if (event.at.getTime() > ctx.now.getTime()) event.at = new Date(ctx.now.getTime() - (jobEvents.length - index) * 60_000);
  });
  if (visit.stage === "delivered") visit.deliveredAt = jobEvents[jobEvents.length - 1].at;
  const lastAt = jobEvents[jobEvents.length - 1].at;
  ds.add("jobs", { id: jobId, booking_id: id, branch_id: o.branchId, assigned_user_id: visit.technician, stage: visit.stage, updated_at: lastAt });
  jobEvents.forEach((event, index) => {
    ds.add("job_events", { id: `seed-je-${String(n).padStart(4, "0")}-${index + 1}`, job_id: jobId, from_stage: event.from, to_stage: event.to, actor_user_id: event.actor, note: event.note, created_at: event.at });
  });

  if (quote?.accepted) {
    quote.pkg.work.forEach((component, position) => {
      const row = { position, component_id: component.id, service_id: component.serviceId, scope_item_ids: component.scopeItemIds, occupancy_rule_id: component.occupancyRule.id, occupancy_rule_version: component.occupancyRule.version };
      ds.add("booking_work_components", { booking_id: id, ...row });
      ds.add("job_work_components", { job_id: jobId, ...row });
    });
  }
  if (confirmed) {
    for (const [day, bays] of plan.perDay) for (const [bay, minutes] of bays) {
      ds.add("booking_occupancy", { booking_id: id, occupied_date: day, bay_type: bay, required_minutes: minutes, configuration_version: 1 });
    }
  }
  if (visit.stage === "delivered") deliverVisit(world, visit);
  return visit;
}

/* ---------------------------- pickup promises ---------------------------- */

export function addPickupCommitment(world: World, visit: VisitRec, missed: boolean) {
  if (!visit.jobId) return;
  const { ds, ctx } = world;
  const manager = managerOf(visit.branchId);
  const promisedDay = missed ? addDays(ctx.today, -1) : visit.pickup;
  const recorded = ctx.past(addDays(promisedDay, -2), "12:00");
  const id = `seed-pc-${String(visit.n).padStart(4, "0")}`;
  ds.add("pickup_commitments", {
    id, booking_id: visit.id, job_id: visit.jobId, revision: 1, supersedes_id: null, promised_at: ctx.at(promisedDay, "16:00"),
    branch_timezone: "Africa/Cairo", recorded_by: manager, recorded_at: recorded, customer_agreement_evidence_ref: evidence("pickup-agreement", String(visit.n).padStart(4, "0")),
    reason: "Customer agreed to the pickup window by phone (example)", cancellation_reason: null,
  });
}


/** Keeps otherwise unused imports referenced for tooling; also exposes the grade list to scripts. */
export const GRADE_KEYS = GRADES.map((grade) => grade.key);
export const SERVICE_IDS = SERVICES.map((service) => service.id);
export { BRANCH_A, BRANCH_B, daysBetween, SEED_REASON };
export type { PromoKey };
