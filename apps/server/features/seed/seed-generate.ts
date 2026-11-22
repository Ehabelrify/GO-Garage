import { Dataset, Rng, addDays, daysBetween, json, makeContext, type SeedContext } from "./seed-core";
import {
  BRANCH_A, BRANCH_B, BRANCH_IDS, DEMO_TECHNICIAN, RICH_COUNT, buildPeople, type CustomerRec, type VehicleRec,
} from "./seed-people";
import { buildReference, packageAt, type PackageDef } from "./seed-reference";
import {
  nextId, isWorkingDay, type ChatSpec, type Product, type QuoteRec, type VisitRec, type World,
} from "./seed-world";
import {
  addPickupCommitment, legacyProduct, makeQuote, makeVisit, packageProduct, pickProduct, visitConflict, wouldPlace, type QuoteMode, type VisitOptions,
} from "./seed-orders";
import { makePromoFlow } from "./seed-promos";
import { materializeBenefit } from "./seed-aftersales";
import {
  addConsents, addOverheadAndAdjustments, addTransport, addVerificationAudit, finalizeLinks, transportFor,
} from "./seed-extras";
import { generateMessaging } from "./seed-messaging";
import { addIntakeSeed } from "./seed-products";
import { addSpecialRequests } from "./seed-requests";
import { addSeedInvoices } from "./seed-invoices";

export interface GenerateOptions {
  now?: Date;
  seed?: number;
  customers?: number;
  environmentId?: string;
  whatsappMode?: "simulation" | "scenario" | "operational";
}

export const DEFAULT_SEED = 20261121;
/** About 110 customers (150 or so cars) for roughly 450 bookings a year: believable repeat visits, lists of a few hundred rows at most. */
export const DEFAULT_CUSTOMERS = 110;

export function generateDataset(options: GenerateOptions = {}): { ds: Dataset; world: World; ctx: SeedContext } {
  const now = options.now ?? new Date();
  const ctx = makeContext(now, options.environmentId ?? "default", options.whatsappMode === "operational" ? "simulation" : options.whatsappMode ?? "simulation");
  const rng = new Rng(options.seed ?? DEFAULT_SEED);
  const ds = new Dataset();
  const ref = buildReference(ds, ctx);
  const customers = buildPeople(rng, options.customers ?? DEFAULT_CUSTOMERS);
  const world: World = {
    ds, ctx, rng, ref, customers, seq: new Map(), cap: new Map(), visits: [], quotes: [], warranties: [], reservations: [], chats: [],
    promoUse: new Map(), referralUsed: new Set(), moneySeq: 0, moneyReverseCandidates: [], capFactor: 0.95, intakeReserve: 0,
    vehicleDates: new Map(), ppfVehicles: new Set(),
  };

  // Curated scenes go onto the empty calendar first so they always find capacity; bulk history then fills around them.
  runRichCustomers(world);
  runScenes(world);
  runPromotions(world);
  runMultiCar(world);
  runHistory(world);
  runReferrals(world);
  runBenefitsAndCommitments(world);
  runChats(world);
  addConsents(world);
  addOverheadAndAdjustments(world);
  addVerificationAudit(world);
  addPools(world);
  finalizeLinks(world);
  generateMessaging(world);
  addIntakeSeed(world);
  addSpecialRequests(world);
  addSeedInvoices(world);
  return { ds, world, ctx };
}

/* ------------------------------- helpers ------------------------------- */

const pkgNamed = (world: World, id: string) => world.ref.packages.find((pkg) => pkg.id === id)!;
const pkgFor = (world: World, grade: string, vehicle: VehicleRec, date: string) => packageAt(world.ref, `seed-pkg-ppf-${grade}-${vehicle.category}`, date);
const nonRich = (world: World) => world.customers.slice(RICH_COUNT);

export function newChat(world: World, o: Omit<ChatSpec, "id" | "quote" | "visit"> & { quote?: QuoteRec | null; visit?: VisitRec | null }): ChatSpec {
  const chat: ChatSpec = { id: nextId(world, "wa"), quote: o.quote ?? null, visit: o.visit ?? null, ...o };
  world.chats.push(chat);
  return chat;
}

/* -------------------------- twelve-month history -------------------------- */

function runHistory(world: World) {
  const { ctx, rng, ref } = world;
  const pool = nonRich(world);
  let bookingChats = 0, followupChats = 0;
  for (let offset = -365; offset <= 21; offset++) {
    const date = ctx.day(offset);
    if (!isWorkingDay(date) || offset === 0) continue;
    for (const branchId of BRANCH_IDS) {
      const count = offset < 0
        ? rng.weighted([[0, 40], [1, 40], [2, 16], [3, 4]] as const)
        : rng.weighted([[0, 42], [1, 38], [2, 16], [3, 4]] as const);
      for (let index = 0; index < count; index++) {
        const local = pool.filter((customer) => customer.homeBranch === branchId);
        const lead = rng.int(1, 14);
        const quoteDate = addDays(date, -(lead + 7));
        const roll = rng.float();
        const status: VisitRec["status"] = offset > 0
          ? (roll < 0.8 ? "confirmed" : "pending")
          : roll < 0.86 ? "confirmed" : roll < 0.94 ? "cancelled" : "no-show";
        // Find a car and a service that do not repeat recent or already-done work for the same car or customer.
        let customer = rng.pick(local), vehicle = rng.pick(customer.vehicles), product = pickProduct(world, vehicle, quoteDate);
        let found = false;
        for (let attempt = 0; attempt < 10 && !found; attempt++) {
          customer = rng.chance(0.85) ? rng.pick(local) : rng.pick(pool);
          vehicle = rng.pick(customer.vehicles);
          product = pickProduct(world, vehicle, quoteDate);
          found = !visitConflict(world, customer, vehicle, date, product) && (status !== "confirmed" || wouldPlace(world, branchId, date, product));
        }
        if (!found) continue;
        let quote: QuoteRec | null = null;
        // Only bookings that went ahead carry an accepted quote, so cancelled and no-show rows never leave "owed" money behind.
        if (product.pkg && status === "confirmed" && quoteDate >= ref.windowStart && rng.chance(0.88)) {
          quote = makeQuote(world, { customer, vehicle, branchId, pkg: product.pkg, quoteDate, mode: rng.chance(0.3) ? "revised" : "direct" });
        }
        const whatsapp = rng.chance(0.12);
        const visit = makeVisit(world, { customer, vehicle, branchId, date, product, quote, status, leadDays: lead, whatsapp });
        if (!visit) continue;
        if (whatsapp && bookingChats < 60) {
          bookingChats++;
          visit.chat = newChat(world, { customer, vehicle, branchId, startAt: new Date(visit.createdAt.getTime() - 12 * 60_000), kind: "booking", visit });
        } else if (visit.stage === "delivered" && visit.deliveredDate && daysBetween(visit.deliveredDate, ctx.today) < 25 && followupChats < 20 && rng.chance(0.4)) {
          followupChats++;
          visit.chat = newChat(world, { customer, vehicle, branchId, startAt: new Date((visit.deliveredAt ?? ctx.now).getTime() + 20 * 60_000), kind: "followup", visit });
        }
        if (visit.jobId && rng.chance(0.07)) transportFor(world, visit, "mixed");
      }
    }
  }
}

/* --------------------- scenes: today, backlog, quote funnel --------------------- */

function runScenes(world: World) {
  const { ctx, rng, ref } = world;
  const pool = nonRich(world);
  const pickFor = (branchId: string, date: string, product: (vehicle: VehicleRec) => Product | null) => {
    const local = pool.filter((customer) => customer.homeBranch === branchId);
    for (let attempt = 0; attempt < 40; attempt++) {
      const customer = rng.pick(local);
      const vehicle = rng.pick(customer.vehicles);
      const chosen = product(vehicle);
      if (chosen && !visitConflict(world, customer, vehicle, date, chosen)) return { customer, vehicle, product: chosen };
    }
    return null;
  };
  const simple = (serviceId: string) => () => legacyProduct(serviceId);
  const schedule = (branchId: string, date: string, time: string, product: (vehicle: VehicleRec) => Product | null, extra: Partial<VisitOptions> = {}) => {
    const chosen = pickFor(branchId, date, product);
    if (!chosen) return null;
    return makeVisit(world, { customer: chosen.customer, vehicle: chosen.vehicle, branchId, date, time, product: chosen.product, status: "confirmed", leadDays: rng.int(2, 8), ...extra });
  };
  const pro = (date: string) => (vehicle: VehicleRec) => { const pkg = pkgFor(world, "pro", vehicle, date); return pkg ? packageProduct(pkg) : null; };

  // Today board. Branch A is the demo technician's branch: the technician carries a realistic mix (in quality check, in service,
  // received, booked for later today and tomorrow, one multi-day film job, one ready for pickup). Other work goes to the rest of the team.
  if (isWorkingDay(ctx.today)) {
    const T = DEMO_TECHNICIAN;
    schedule(BRANCH_A, ctx.today, "08:00", simple("inspection"), { forceStage: "qc", technician: T });
    schedule(BRANCH_A, ctx.today, "09:00", simple("tint"), { forceStage: "in-service", technician: T });
    schedule(BRANCH_A, ctx.today, "10:00", simple("ceramic"), { forceStage: "in-service", technician: T });
    schedule(BRANCH_A, ctx.today, "11:00", simple("audio"), { forceStage: "received", technician: T });
    schedule(BRANCH_A, ctx.today, "14:00", simple("inspection"), { forceStage: "booked", technician: T });
    schedule(BRANCH_A, ctx.today, "13:00", simple("tint"), { forceStage: "booked" });
    schedule(BRANCH_A, addDays(ctx.today, -1), "09:00", pro(addDays(ctx.today, -10)), { technician: T });
    schedule(BRANCH_A, addDays(ctx.today, -2), "10:00", simple("tint"), { forceStage: "ready", technician: T });
    schedule(BRANCH_A, addDays(ctx.today, 1), "09:00", simple("tint"), { technician: T });
    schedule(BRANCH_A, addDays(ctx.today, 1), "10:00", simple("ceramic"), { technician: T });
    schedule(BRANCH_A, addDays(ctx.today, 1), "13:00", simple("inspection"));
    schedule(BRANCH_B, ctx.today, "08:00", simple("inspection"), { forceStage: "qc" });
    schedule(BRANCH_B, ctx.today, "09:00", simple("tint"), { forceStage: "in-service" });
    schedule(BRANCH_B, ctx.today, "10:00", simple("audio"), { forceStage: "received" });
    schedule(BRANCH_B, ctx.today, "13:00", simple("inspection"), { forceStage: "booked" });
    schedule(BRANCH_B, addDays(ctx.today, -1), "09:00", pro(addDays(ctx.today, -10)));
    schedule(BRANCH_B, addDays(ctx.today, 1), "09:00", simple("tint"));
    schedule(BRANCH_B, addDays(ctx.today, 1), "11:00", simple("inspection"));
    schedule(BRANCH_B, addDays(ctx.today, 1), "13:00", simple("audio"));
  }
  // Jobs waiting for pickup past their expected date, one with a missed pickup promise.
  let overdue = 0;
  for (const branchId of BRANCH_IDS) {
    for (const back of [-5, -3]) {
      const chosen = pickFor(branchId, addDays(ctx.today, back - 3), (vehicle) => {
        const pkg = pkgFor(world, rng.pick(["ultimate", "black"]), vehicle, addDays(ctx.today, back - 10));
        return pkg ? packageProduct(pkg) : null;
      });
      if (!chosen) continue;
      const visit = makeVisit(world, { customer: chosen.customer, vehicle: chosen.vehicle, branchId, date: addDays(ctx.today, back - 3), product: chosen.product, status: "confirmed", forceStage: "ready", leadDays: 6 });
      if (visit?.jobId) { addPickupCommitment(world, visit, overdue === 0); overdue++; }
    }
  }
  const pick = (branchId: string) => rng.pick(pool.filter((customer) => customer.homeBranch === branchId));
  // Quote funnel: drafts, open offers, expired offers, cancelled, and accepted-but-not-yet-booked.
  const funnel: Array<[QuoteMode, number, number]> = [
    ["draft", -2, 3], ["draft", -1, 1], ["open", -3, 6], ["open", -5, 4], ["open", -8, 2], ["expired", -45, 4], ["expired", -60, 2], ["cancelled", -25, 2], ["direct", -6, 2], ["revised", -9, 1],
  ];
  for (const [mode, offset, repeat] of funnel) {
    for (let index = 0; index < repeat; index++) {
      const branchId = rng.pick(BRANCH_IDS);
      const customer = pick(branchId);
      const vehicle = rng.pick(customer.vehicles);
      const quoteDate = addDays(ctx.today, offset - index);
      const pkg = rng.chance(0.75) ? pkgFor(world, rng.pick(["pro", "ultimate", "plus", "matte"]), vehicle, quoteDate) : packageAt(ref, `seed-pkg-addon-${rng.pick(["heat-plus", "vkool", "interior-nano", "panorama"])}`, quoteDate);
      if (!pkg) continue;
      const chat = (mode === "open" || mode === "draft") && rng.chance(0.7)
        ? newChat(world, { customer, vehicle, branchId, startAt: new Date(`${quoteDate}T09:00:00Z`), kind: "quote" })
        : null;
      const quote = makeQuote(world, { customer, vehicle, branchId, pkg, quoteDate, mode, chat, followupStatus: mode === "open" && index === 0 ? "requested" : undefined });
      if (chat) chat.quote = quote;
    }
  }
  // Pending enquiries that have not been confirmed yet (no job exists): a believable review queue spread over the next two weeks and both branches.
  for (let index = 0; index < 26; index++) {
    const branchId = index % 5 < 3 ? BRANCH_A : BRANCH_B;
    const date = addDays(ctx.today, 1 + (index % 14));
    const service = (["inspection", "tint", "audio", "ceramic", "tint", "inspection"] as const)[index % 6];
    const chosen = pickFor(branchId, date, simple(service));
    if (!chosen) continue;
    makeVisit(world, { customer: chosen.customer, vehicle: chosen.vehicle, branchId, date, product: chosen.product, status: "pending", leadDays: 1 + (index % 3), whatsapp: index % 3 !== 0 });
  }
  // Manually priced custom work (special request after inspection): quote with inspection price origin.
  for (let index = 0; index < 4; index++) {
    const branchId = rng.pick(BRANCH_IDS);
    const customer = pick(branchId);
    const vehicle = rng.pick(customer.vehicles);
    const pkg = packageAt(ref, "seed-pkg-addon-vkool", addDays(ctx.today, -10))!;
    const chat = newChat(world, { customer, vehicle, branchId, startAt: new Date(`${addDays(ctx.today, -9 - index)}T10:00:00Z`), kind: "special", special: customer.language === "ar" ? "تظليل مخصص بدرجات مختلفة للزجاج الخلفي والجانبي" : "Custom tint shades for the rear and side glass" });
    chat.quote = makeQuote(world, { customer, vehicle, branchId, pkg, quoteDate: addDays(ctx.today, -8 - index), mode: "open", manual: true, priceMinor: 1_150_000, chat });
  }
}

/* --------------------- rich customers: complete lifecycles --------------------- */

function runRichCustomers(world: World) {
  const { ctx, ref } = world;
  const [ahmed, nour, omar, sara, karim, hoda, tamer, dina] = world.customers;
  const day = (offset: number) => ctx.day(offset);
  const chatFor = (customer: CustomerRec, vehicle: VehicleRec, offset: number, kind: ChatSpec["kind"], extra: Partial<ChatSpec> = {}) =>
    newChat(world, { customer, vehicle, branchId: customer.homeBranch, startAt: new Date(`${day(offset)}T09:30:00Z`), kind, ...extra });
  const promo = (name: string) => pkgNamed(world, name);

  // Ahmed (Nasr City): enquiry chat -> revised quote -> booking -> job -> warranty + QR -> claim -> invoice; then a club package; then an upcoming inspection with tow.
  {
    const [corolla, tucson] = ahmed.vehicles;
    const quoteDate = day(-312);
    const chat = chatFor(ahmed, corolla, -314, "quote");
    const pkg = pkgFor(world, "pro", corolla, quoteDate)!;
    const quote = makeQuote(world, { customer: ahmed, vehicle: corolla, branchId: BRANCH_A, pkg, quoteDate, mode: "revised", chat });
    chat.quote = quote;
    makeVisit(world, { customer: ahmed, vehicle: corolla, branchId: BRANCH_A, date: day(-300), product: packageProduct(pkg), quote, status: "confirmed", rich: true, chat, leadDays: 9 });
    makePromoFlow(world, { key: "club", customer: ahmed, vehicle: tucson, branchId: BRANCH_A, pkg: promo("seed-pkg-promo-ultimate-club"), quoteDate: day(-56), outcome: "redeemed", dropoffDate: day(-40), rich: true, quoteMode: "revised", chat: chatFor(ahmed, tucson, -58, "quote") });
    const upcoming = makeVisit(world, { customer: ahmed, vehicle: tucson, branchId: BRANCH_A, date: day(6), product: legacyProduct("inspection"), status: "confirmed", rich: true, leadDays: 3, whatsapp: true });
    if (upcoming) { upcoming.chat = newChat(world, { customer: ahmed, vehicle: tucson, branchId: BRANCH_A, startAt: new Date(upcoming.createdAt.getTime() - 15 * 60_000), kind: "booking", visit: upcoming }); transportFor(world, upcoming, "tow"); }
  }
  // Nour (Nasr City): warranty-card referral from Ahmed's card (discount only; no warranty transfer), then a special request and a November enquiry.
  {
    const [sportage] = nour.vehicles;
    const referralWarranty = world.warranties.find((warranty) => warranty.visit.customer === ahmed && warranty.status === "active") ?? world.warranties.find((warranty) => warranty.status === "active" && warranty.visit.customer !== nour);
    const quoteDate = day(-90);
    const pkg = pkgFor(world, "ultimate", sportage, quoteDate)!;
    makePromoFlow(world, {
      key: "referral", customer: nour, vehicle: sportage, branchId: BRANCH_A, pkg, quoteDate, outcome: "redeemed", dropoffDate: day(-75), rich: true, discountMinor: 1_000_000,
      evidenceKind: "warranty-reference", evidenceRefId: referralWarranty?.id ?? "seed-war-referral-missing", chat: chatFor(nour, sportage, -92, "quote"),
    });
    chatFor(nour, sportage, -5, "special", { special: "تفصيل داخلي كامل للمقاعد بلون مخصص مع خياطة مميزة" });
    makePromoFlow(world, { key: "nov", customer: nour, vehicle: sportage, branchId: BRANCH_A, pkg: promo("seed-pkg-promo-nov-from"), quoteDate: day(-3), outcome: "enquiry", chat: chatFor(nour, sportage, -4, "quote") });
  }
  // Omar (Maadi, English): older lifetime heat film with claim; recent Ultimate offer reserved and scheduled; ceramic job in service now.
  {
    const [elantra] = omar.vehicles;
    makeVisit(world, { customer: omar, vehicle: elantra, branchId: BRANCH_B, date: day(-200), product: legacyProduct("tint"), status: "confirmed", rich: true, leadDays: 5 });
    makePromoFlow(world, { key: "recent", customer: omar, vehicle: elantra, branchId: BRANCH_B, pkg: promo("seed-pkg-promo-recent-ultimate"), quoteDate: day(-4), outcome: "scheduled", dropoffDate: day(5), rich: true, quoteMode: "revised", chat: chatFor(omar, elantra, -5, "quote") });
    const ceramic = makeVisit(world, { customer: omar, vehicle: elantra, branchId: BRANCH_B, date: day(-1), product: legacyProduct("ceramic"), status: "confirmed", rich: true, leadDays: 4 });
    if (ceramic) transportFor(world, ceramic, "driver");
  }
  // Sara (Maadi): Plus lifetime package redeemed, a claim chat; BMW ceramic with courtesy car and tow.
  {
    const [zs, bmw] = sara.vehicles;
    const plusFlow = makePromoFlow(world, { key: "plus", customer: sara, vehicle: zs, branchId: BRANCH_B, pkg: promo("seed-pkg-promo-plus-lifetime"), quoteDate: day(-47), outcome: "redeemed", dropoffDate: day(-30), rich: true, chat: chatFor(sara, zs, -49, "quote") });
    const bmwVisit = makeVisit(world, { customer: sara, vehicle: bmw, branchId: BRANCH_B, date: day(-120), product: legacyProduct("ceramic"), status: "confirmed", rich: true, leadDays: 6 });
    if (bmwVisit) { transportFor(world, bmwVisit, "tow"); addTransport(world, bmwVisit, "courtesy", "courtesy-car", "completed"); }
    if (plusFlow?.visit) chatFor(sara, zs, -10, "claim", { visit: plusFlow.visit });
  }
  // Karim (Nasr City): a matte film job ready but late, with a missed pickup promise; earlier black edition delivered.
  {
    const [octavia] = karim.vehicles;
    const early = pkgFor(world, "black", octavia, day(-160))!;
    const chat = chatFor(karim, octavia, -162, "quote");
    const quote = makeQuote(world, { customer: karim, vehicle: octavia, branchId: BRANCH_A, pkg: early, quoteDate: day(-160), mode: "direct", chat });
    chat.quote = quote;
    makeVisit(world, { customer: karim, vehicle: octavia, branchId: BRANCH_A, date: day(-145), product: packageProduct(early), quote, status: "confirmed", rich: true, chat, leadDays: 8 });
    const late = makeVisit(world, { customer: karim, vehicle: octavia, branchId: BRANCH_A, date: day(-9), product: legacyProduct("full-ppf", "matte"), status: "confirmed", forceStage: "ready", rich: true, leadDays: 7 });
    if (late?.jobId) { addPickupCommitment(world, late, true); transportFor(world, late, "driver"); }
  }
  // Hoda (Nasr City): three cars together -> fourth car free benefit (published promise; eligibility unverified).
  {
    const nov = promo("seed-pkg-promo-nov-from");
    const group = hoda.vehicles.map((vehicle) => vehicle.id);
    const offsets: Array<[number, number, "redeemed" | "scheduled"]> = [[-13, -10, "redeemed"], [-13, -9, "redeemed"], [-12, 3, "scheduled"]];
    hoda.vehicles.forEach((vehicle, index) => {
      const [quoteOffset, dropOffset, outcome] = offsets[index];
      makePromoFlow(world, {
        key: "threecars", customer: hoda, vehicle, branchId: BRANCH_A, pkg: nov, quoteDate: day(quoteOffset), outcome, dropoffDate: day(dropOffset), rich: true,
        evidenceKind: "grouped-vehicles", evidenceRefId: `seed-group-${hoda.id.slice(-3)}-v${index + 1}`, groupVehicleIds: group,
        chat: index === 0 ? chatFor(hoda, vehicle, -14, "quote") : null,
      });
    });
  }
  // Tamer (Maadi): club package redeemed; Plus reservation cancelled with a refund.
  {
    const [tiggo, song] = tamer.vehicles;
    makePromoFlow(world, { key: "club", customer: tamer, vehicle: tiggo, branchId: BRANCH_B, pkg: promo("seed-pkg-promo-ultimate-club"), quoteDate: day(-57), outcome: "redeemed", dropoffDate: day(-36), rich: true, chat: chatFor(tamer, tiggo, -58, "quote") });
    makePromoFlow(world, { key: "plus", customer: tamer, vehicle: song, branchId: BRANCH_B, pkg: promo("seed-pkg-promo-plus-lifetime"), quoteDate: day(-40), outcome: "cancelled", dropoffDate: day(-20), rich: true });
  }
  // Dina (Nasr City): earlier no-show, Plus package delivered, expired reservation, draft quote and a special request.
  {
    const [jetour] = dina.vehicles;
    makeVisit(world, { customer: dina, vehicle: jetour, branchId: BRANCH_A, date: day(-14), product: legacyProduct("tint"), status: "no-show", rich: true, leadDays: 4 });
    const plusPkg = pkgFor(world, "plus", jetour, day(-105))!;
    const quote = makeQuote(world, { customer: dina, vehicle: jetour, branchId: BRANCH_A, pkg: plusPkg, quoteDate: day(-105), mode: "direct" });
    makeVisit(world, { customer: dina, vehicle: jetour, branchId: BRANCH_A, date: day(-95), product: packageProduct(plusPkg), quote, status: "confirmed", rich: true, leadDays: 6 });
    makePromoFlow(world, { key: "plus", customer: dina, vehicle: jetour, branchId: BRANCH_A, pkg: promo("seed-pkg-promo-plus-lifetime"), quoteDate: day(-34), outcome: "reserved", rich: true });
    const chat = chatFor(dina, jetour, -3, "special", { special: "تركيب فيلم بانوراما مع تغليف المرايات بلون مطفي" });
    chat.quote = makeQuote(world, { customer: dina, vehicle: jetour, branchId: BRANCH_A, pkg: packageAt(ref, "seed-pkg-addon-panorama", day(-3))!, quoteDate: day(-3), mode: "draft", chat, manual: true, priceMinor: 1_350_000 });
  }
}

/* ------------------------ promotions for other customers ------------------------ */

function runPromotions(world: World) {
  const { ctx, rng } = world;
  const pool = nonRich(world);
  const choose = (pkg: PackageDef, dropoff: string | null) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const customer = rng.pick(pool);
      const vehicle = rng.pick(customer.vehicles);
      if (dropoff === null || !visitConflict(world, customer, vehicle, dropoff, packageProduct(pkg))) return { customer, vehicle, branchId: customer.homeBranch };
    }
    return null;
  };
  const run = (key: "club" | "plus" | "recent" | "nov", pkgId: string, quoteOffset: [number, number], list: Array<["enquiry" | "reserved" | "scheduled" | "redeemed" | "cancelled", number | null]>) => {
    for (const [outcome, dropOffset] of list) {
      const pkg = pkgNamed(world, pkgId);
      const dropoffDate = dropOffset === null ? undefined : ctx.day(dropOffset + rng.int(0, 5));
      const chosen = choose(pkg, dropoffDate ?? null);
      if (!chosen) continue;
      const { customer, vehicle, branchId } = chosen;
      const quoteDate = ctx.day(rng.int(quoteOffset[0], quoteOffset[1]));
      makePromoFlow(world, {
        key, customer, vehicle, branchId, pkg, quoteDate, outcome, dropoffDate,
        chat: rng.chance(0.4) ? newChat(world, { customer, vehicle, branchId, startAt: new Date(`${quoteDate}T09:00:00Z`), kind: "quote" }) : null,
      });
    }
  };
  run("club", "seed-pkg-promo-ultimate-club", [-58, -45], [["redeemed", -30], ["redeemed", -26], ["scheduled", 4], ["reserved", null], ["cancelled", -18], ["enquiry", null]]);
  run("plus", "seed-pkg-promo-plus-lifetime", [-50, -40], [["redeemed", -22], ["scheduled", 5], ["reserved", null], ["enquiry", null]]);
  run("recent", "seed-pkg-promo-recent-ultimate", [-5, -2], [["reserved", null], ["scheduled", 6], ["enquiry", null]]);
  run("nov", "seed-pkg-promo-nov-from", [-14, -2], [["redeemed", -9], ["scheduled", 3], ["scheduled", 7], ["reserved", null], ["enquiry", null], ["cancelled", -4]]);
}

/** A second "three cars together" group (fourth car free, GS-F026): one customer with three cars, two redeemed and one scheduled. Skipped when no customer has three free cars. */
function runMultiCar(world: World) {
  const { ctx } = world;
  const nov = pkgNamed(world, "seed-pkg-promo-nov-from");
  const family = nonRich(world).find((customer) => customer.vehicles.length >= 3
    && customer.vehicles.every((vehicle, index) => !visitConflict(world, customer, vehicle, ctx.day(index === 2 ? 8 : -6 - index * 3), packageProduct(nov))));
  if (!family) return;
  const group = family.vehicles.slice(0, 3).map((vehicle) => vehicle.id);
  const plan: Array<[number, number, "redeemed" | "scheduled"]> = [[-14, -7, "redeemed"], [-14, -4, "redeemed"], [-13, 8, "scheduled"]];
  family.vehicles.slice(0, 3).forEach((vehicle, index) => {
    const [quoteOffset, dropOffset, outcome] = plan[index];
    makePromoFlow(world, {
      key: "threecars", customer: family, vehicle, branchId: family.homeBranch, pkg: nov, quoteDate: ctx.day(quoteOffset), outcome, dropoffDate: ctx.day(dropOffset),
      evidenceKind: "grouped-vehicles", evidenceRefId: `seed-group-${family.id.slice(-3)}-v${index + 1}`, groupVehicleIds: group,
    });
  });
}

/** Warranty-card referrals (needs issued warranties from history): discount on another car; the discount never transfers warranty coverage. */
function runReferrals(world: World) {
  const { ctx, rng } = world;
  const pool = nonRich(world);
  const donors = world.warranties.filter((warranty) => warranty.status === "active" && warranty.visit.customer !== undefined && !world.referralUsed.has(warranty.id));
  const outcomes: Array<["redeemed" | "scheduled" | "reserved", number | null]> = [["redeemed", -45], ["redeemed", -33], ["redeemed", -21], ["redeemed", -14], ["scheduled", 4], ["reserved", null]];
  for (const [outcome, dropOffset] of outcomes) {
    const donor = donors.splice(rng.int(0, Math.max(0, donors.length - 1)), 1)[0];
    if (!donor) break;
    world.referralUsed.add(donor.id);
    const candidates = pool.filter((customer) => customer.id !== donor.visit.customer.id);
    const customer = rng.pick(candidates);
    const vehicle = rng.pick(customer.vehicles);
    const quoteDate = dropOffset === null ? ctx.day(-12) : ctx.day(dropOffset - 12);
    const pkg = pkgFor(world, rng.pick(["pro", "ultimate", "black"]), vehicle, quoteDate);
    if (!pkg) continue;
    makePromoFlow(world, {
      key: "referral", customer, vehicle, branchId: customer.homeBranch, pkg, quoteDate, outcome, dropoffDate: dropOffset === null ? undefined : ctx.day(dropOffset),
      discountMinor: 1_000_000, evidenceKind: "warranty-reference", evidenceRefId: donor.id,
    });
  }
}

/* ---------------------- benefits and pickup promises ---------------------- */

function runBenefitsAndCommitments(world: World) {
  for (const quote of world.quotes) {
    if (!quote.accepted || !quote.benefitBindings.length || !quote.acceptedAt) continue;
    const visit = world.visits.find((item) => item.quote === quote) ?? null;
    quote.benefitBindings.forEach((_binding, index) => materializeBenefit(world, quote, index, "accepted", quote.acceptedAt!, visit));
  }
  let count = 0;
  for (const visit of world.visits) {
    if (!visit.jobId || visit.stage === "delivered" || visit.stage === "cancelled" || visit.stage === "no-show" || visit.pickup < world.ctx.today) continue;
    if (count < 14 && world.rng.chance(0.5)) { addPickupCommitment(world, visit, false); count++; }
  }
  // A few transport requests tied to upcoming and in-progress visits.
  let transports = world.visits.filter((visit) => visit.transportId).length;
  for (const visit of world.visits) {
    if (transports >= 28) break;
    if (visit.transportId || !visit.jobId || visit.stage === "cancelled" || visit.stage === "no-show" || visit.date < world.ctx.day(-30)) continue;
    if (world.rng.chance(0.18)) { transportFor(world, visit, "mixed"); transports++; }
  }
}

/* ----------------------------------- chats ----------------------------------- */

function runChats(world: World) {
  // Open enquiries without a quote yet (inbox tab) and a few claim chats on recent warranties.
  const { rng, ctx } = world;
  const pool = nonRich(world);
  for (let index = 0; index < 8; index++) {
    const customer = rng.pick(pool);
    newChat(world, { customer, vehicle: rng.pick(customer.vehicles), branchId: customer.homeBranch, startAt: new Date(ctx.now.getTime() - rng.int(1, 40) * 3_600_000), kind: "enquiry" });
  }
  for (const warranty of world.warranties.filter((item) => item.status === "active" && daysBetween(item.startDate, ctx.today) > 20).slice(0, 4)) {
    if (world.chats.some((chat) => chat.kind === "claim" && chat.visit === warranty.visit)) continue;
    newChat(world, { customer: warranty.visit.customer, vehicle: warranty.visit.vehicle, branchId: warranty.visit.branchId, startAt: new Date(ctx.now.getTime() - rng.int(24, 200) * 3_600_000), kind: "claim", visit: warranty.visit });
  }
  world.chats = world.chats.filter((chat) => !(chat.kind === "booking" && !chat.visit));
}

/* ----------------------------------- pools ----------------------------------- */

function addPools(world: World) {
  const { ds, ctx, ref } = world;
  for (const [key, policy] of Object.entries(ref.promoPolicies)) {
    const used = world.promoUse.get(policy.id) ?? { reserved: 0, consumed: 0 };
    ds.add("promotion_pools", {
      environment_id: ctx.environmentId, promotion_id: policy.id, policy_version: 1, branch_id: null,
      maximum_units: ref.promoCaps[key as keyof typeof ref.promoCaps], reserved_units: used.reserved, consumed_units: used.consumed,
    });
  }
  void json;
}

export type { PackageDef };
