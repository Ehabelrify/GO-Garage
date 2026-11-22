import { addDays } from "./seed-core";
import { OWNER, receptionOf } from "./seed-people";
import { nextId, type World } from "./seed-world";
import { RICH_COUNT } from "./seed-people";

/** Bilingual example special requests across every status. Fictional text; prices are examples, not approved policy. */
type Status = "new" | "under-review" | "needs-info" | "accepted" | "declined" | "closed";
interface Spec {
  status: Status; ageDays: number; ar: [string, string]; en: [string, string];
  reply?: { ar: string; en: string; price?: number; days?: number; availableOffset?: number; validDays?: number };
  notes?: string; closed?: boolean; linkQuote?: boolean; source?: "staff" | "customer-app";
}

const SPECS: Spec[] = [
  { status: "new", ageDays: 0, ar: ["تظليل مخصص للزجاج الخلفي", "عايز درجات تظليل مختلفة للزجاج الخلفي والجانبي."], en: ["Custom rear tint", "Different tint shades for the rear and side glass."] },
  { status: "new", ageDays: 1, ar: ["تغليف سقف بانورامي", "تغليف السقف الزجاجي بفيلم مخصص."], en: ["Panoramic roof wrap", "Wrap the glass roof with a special film."], source: "customer-app" },
  { status: "new", ageDays: 2, ar: ["نظام صوت مخصص", "تركيب سماعات وساب ووفر مع عزل الأبواب."], en: ["Custom audio setup", "Speakers, subwoofer and door sound-deadening."] },
  { status: "new", ageDays: 3, ar: ["طلاء أطراف العجلات", "طلاء الكاليبرز بلون أحمر مع حماية حرارية."], en: ["Caliper painting", "Paint the calipers red with heat protection."] },
  { status: "under-review", ageDays: 4, ar: ["حماية كاملة لسيارة قديمة", "سيارة موديل قديم تحتاج حماية للطلاء والداخل."], en: ["Full protection for an older car", "An older model needing paint and interior protection."] },
  { status: "under-review", ageDays: 5, ar: ["إزالة تظليل قديم وإعادة تركيب", "إزالة التظليل الحالي وتركيب فيلم جديد."], en: ["Remove old tint and refit", "Remove the current tint and fit a new film."] },
  { status: "needs-info", ageDays: 6, ar: ["شعار مخصص على الفيلم", "تركيب شعار مطبوع على الزجاج الأمامي."], en: ["Custom logo on film", "A printed logo on the windscreen strip."],
    reply: { ar: "برجاء إرسال تصميم الشعار ومقاساته.", en: "Please send the logo artwork and its dimensions." }, notes: "Check print supplier lead time." },
  { status: "accepted", ageDays: 9, ar: ["فيلم ملون للسقف", "فيلم ملون مطفي على السقف والمرايا."], en: ["Coloured roof film", "Matte coloured film on the roof and mirrors."],
    reply: { ar: "تم قبول الطلب، السعر والمدة أدناه.", en: "Accepted. Price and time frame below.", price: 4800, days: 3, availableOffset: 4, validDays: 14 }, notes: "Margin checked.", linkQuote: true },
  { status: "accepted", ageDays: 12, ar: ["حماية كراسي جلد", "طبقة نانو لحماية الجلد من البقع."], en: ["Leather seat protection", "Nano coating to protect leather from stains."],
    reply: { ar: "متاح الأسبوع القادم.", en: "Available next week.", price: 2200, days: 1, availableOffset: 7, validDays: 10 } },
  { status: "accepted", ageDays: 15, ar: ["تغليف داخلي كامل", "تغليف لوحة العدادات بالكربون."], en: ["Interior carbon wrap", "Carbon wrap for the dashboard trim."],
    reply: { ar: "تم القبول.", en: "Accepted.", price: 3500, days: 2, availableOffset: 3, validDays: 21 }, linkQuote: true },
  { status: "declined", ageDays: 18, ar: ["تعديل غير مطابق للمواصفات", "تغيير لون الأضواء الأمامية لدرجة غير قانونية."], en: ["Non-compliant lighting change", "Change headlight colour to a non-road-legal shade."],
    reply: { ar: "لا يمكننا تنفيذ هذا التعديل لأنه مخالف لقواعد المرور.", en: "We cannot do this change because it is not road-legal." }, notes: "Policy: no non-compliant lighting." },
  { status: "declined", ageDays: 22, ar: ["عمل خارج نطاق الورشة", "إصلاح ميكانيكي للمحرك."], en: ["Work outside our scope", "Mechanical engine repair."],
    reply: { ar: "هذا خارج نطاق خدماتنا.", en: "This is outside the services we offer." } },
  { status: "closed", ageDays: 30, ar: ["استفسار عن لاصق مخصص", "العميل تراجع عن الطلب."], en: ["Custom sticker enquiry", "The customer withdrew the request."], closed: true },
  { status: "closed", ageDays: 40, ar: ["تظليل قديم تم إلغاؤه", "تم تنفيذ العمل ضمن حجز منفصل."], en: ["Tint request fulfilled elsewhere", "Handled as a normal booking instead."], closed: true },
  { status: "under-review", ageDays: 2, ar: ["حماية مخصصة للمقاعد الخلفية", "حماية المقاعد الخلفية للأطفال."], en: ["Back-seat protection", "Protect rear seats used by children."], source: "customer-app" },
];

export function addSpecialRequests(world: World) {
  const { ds, ctx, rng } = world;
  const pool = world.customers.slice(RICH_COUNT);
  const acceptedQuotes = world.quotes.filter((quote) => quote.accepted);
  let quoteCursor = 0;
  SPECS.forEach((spec, index) => {
    const quote = spec.linkQuote ? acceptedQuotes[quoteCursor++] : undefined;
    const customer = quote ? quote.customer : pool[(index * 3) % pool.length];
    const vehicle = quote ? quote.vehicle : customer.vehicles[index % customer.vehicles.length];
    const branchId = quote ? quote.branchId : customer.homeBranch;
    customer.branches.add(branchId);
    const ar = customer.language === "ar";
    const id = nextId(world, "sr");
    const createdOn = addDays(ctx.today, -spec.ageDays);
    const created = ctx.past(createdOn, "10:30");
    const staff = receptionOf(branchId);
    const source = spec.source ?? "staff";
    const events: Array<{ action: string; from: string | null; to: string; actor: string | null; reason: string; at: Date; snapshot?: unknown }> = [
      { action: "created", from: null, to: "new", actor: source === "staff" ? staff : null, reason: "", at: created },
    ];
    const decided = ["needs-info", "accepted", "declined"].includes(spec.status) && spec.reply;
    let at = created;
    if (spec.status !== "new") { at = new Date(created.getTime() + 4 * 3_600_000); events.push({ action: "review-started", from: "new", to: "under-review", actor: OWNER, reason: "", at }); }
    const price = spec.reply?.price;
    const row: Record<string, unknown> = {
      id, customer_id: customer.id, vehicle_id: vehicle.id, branch_id: branchId, source, title: ar ? spec.ar[0] : spec.en[0], description: ar ? spec.ar[1] : spec.en[1],
      requested_from: addDays(createdOn, rng.int(5, 20)), requested_to: index % 3 === 0 ? addDays(createdOn, rng.int(21, 30)) : null,
      preferred_time_note: index % 2 === 0 ? (ar ? "صباحاً إن أمكن" : "Mornings if possible") : "", budget_note: index % 4 === 0 ? (ar ? "ميزانية مرنة" : "Flexible budget") : "",
      status: spec.status, owner_notes: spec.notes ?? "", created_by: source === "staff" ? staff : null, created_at: created,
    };
    if (decided && spec.reply) {
      at = new Date(at.getTime() + 20 * 3_600_000);
      const decision = spec.status as "needs-info" | "accepted" | "declined";
      const accepted = decision === "accepted";
      Object.assign(row, {
        reply_decision: decision, reply_message: ar ? spec.reply.ar : spec.reply.en,
        quoted_price_minor: accepted && price ? price * 100 : null, quoted_currency: accepted ? "EGP" : null, duration_days: accepted ? spec.reply.days : null,
        duration_note: accepted ? (ar ? "حسب جدول الورشة" : "Subject to workshop schedule") : "",
        available_from: accepted ? addDays(createdOn, (spec.reply.availableOffset ?? 3) + 5) : null,
        offer_valid_until: accepted ? addDays(createdOn, (spec.reply.availableOffset ?? 3) + 5 + (spec.reply.validDays ?? 14)) : null,
        decided_by: OWNER, decided_at: at,
      });
      events.push({ action: decision, from: "under-review", to: decision, actor: OWNER, reason: ar ? spec.reply.ar : spec.reply.en, at });
    }
    if (spec.closed) {
      at = new Date(at.getTime() + 48 * 3_600_000);
      events.push({ action: "closed", from: events[events.length - 1].to, to: "closed", actor: staff, reason: ar ? "العميل تراجع" : "Customer withdrew", at });
    }
    if (quote && spec.status === "accepted") {
      row.quote_id = quote.id;
      events.push({ action: "quote-linked", from: "accepted", to: "accepted", actor: OWNER, reason: quote.id, at: new Date(at.getTime() + 2 * 3_600_000) });
    }
    row.updated_at = events[events.length - 1].at;
    row.revision = events.length;
    ds.add("special_requests", row);
    events.forEach((event, seq) => ds.add("special_request_events", {
      request_id: id, seq: seq + 1, action: event.action, from_status: event.from, to_status: event.to, actor_id: event.actor, reason: event.reason, occurred_at: event.at,
    }));
  });
}
