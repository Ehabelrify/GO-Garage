import { addDays, json } from "./seed-core";
import { OWNER, managerOf, receptionOf } from "./seed-people";
import { contactHash } from "./seed-extras";
import type { ChatSpec, World } from "./seed-world";

type Kind = "customer" | "bot" | "staff" | "internal-note";
interface Msg { kind: Kind; ar: string; en: string; gapMinutes: number; author?: boolean }

const m = (kind: Kind, ar: string, en: string, gap = 3, author = false): Msg => ({ kind, ar, en, gapMinutes: gap, author });

function script(chat: ChatSpec): Msg[] {
  const car = `${chat.vehicle.make} ${chat.vehicle.model}`;
  const price = chat.quote ? Math.round(chat.quote.total.minor / 100).toLocaleString("en-US") : "";
  const label = chat.quote ? chat.quote.pkg.name : { ar: "", en: "" };
  switch (chat.kind) {
    case "quote":
      return [
        m("customer", `السلام عليكم، عايز أعرف سعر حماية الطلاء لـ ${car}`, `Hello, I would like the price of paint protection for my ${car}`, 0),
        m("bot", "أهلًا بك في جو ستورز. من فضلك اكتب الاسم الثلاثي ونوع السيارة (رد تجريبي).", "Welcome to GO stores. Please send your three-part name and car model (simulated reply).", 1),
        m("customer", `الاسم ${chat.customer.nameAr} والسيارة ${car}`, `My name is ${chat.customer.nameEn}, the car is ${car}`, 6),
        m("staff", `أهلًا ${chat.customer.nameAr}. الباقة المناسبة: ${label.ar} بسعر ${price} جنيه (سعر معلن).`, `Hello ${chat.customer.nameEn}. The suitable package is ${label.en} at ${price} EGP (advertised price).`, 25, true),
        m("customer", "ينفع أحجز وأدفع عربون؟", "Can I reserve and pay a deposit?", 12),
        m("staff", "تم تسجيل عرض السعر. العربون يُسجل كمرجع فقط بدون دفع داخل النظام (محاكاة).", "The quote is recorded. The deposit is noted as a reference only, with no payment in the system (simulation).", 9, true),
      ];
    case "booking":
      return [
        m("customer", "عايز أحجز ميعاد", "I would like to book an appointment", 0),
        m("bot", "اختر الخدمة والفرع من القائمة وسأعرض المواعيد المتاحة (محاكاة).", "Choose a service and branch and I will show available slots (simulation).", 1),
        m("customer", `${car} - الأسبوع الجاي لو ينفع`, `${car} - next week if possible`, 5),
        m("staff", `تم تأكيد الحجز يوم ${chat.visit?.date ?? ""} الساعة ${chat.visit?.time ?? ""}. من فضلك أحضر كارت الضمان إن وجد.`, `Your booking is confirmed for ${chat.visit?.date ?? ""} at ${chat.visit?.time ?? ""}. Please bring any existing warranty card.`, 15, true),
        m("customer", "تمام شكرًا", "Great, thank you", 4),
      ];
    case "followup":
      return [
        m("staff", `سيارتك ${car} جاهزة للاستلام. المعاد المتوقع تقدير (محاكاة).`, `Your ${car} is ready for pickup. The shown date is an estimate (simulation).`, 0, true),
        m("customer", "هاستلمها بعد الساعة 5", "I will pick it up after 5 pm", 22),
        m("internal-note", "ملاحظة داخلية: العميل سيستلم متأخرًا، تأكد من وجود الفرع مفتوحًا (لا تُرسل للعميل).", "Internal note: customer will collect late; keep the branch open (not sent to the customer).", 2, true),
        m("customer", "شكرًا على الخدمة", "Thank you for the service", 90),
      ];
    case "claim":
      return [
        m("customer", "في مشكلة بسيطة في الفيلم بعد شهرين من التركيب", "There is a small problem with the film two months after installation", 0),
        m("bot", "نأسف لذلك. أرسل صورًا وسيتم فتح طلب ضمان (محاكاة).", "Sorry to hear that. Please send photos and a warranty claim will be opened (simulation).", 1),
        m("customer", "[صورة مرفقة - بيانات وصفية فقط]", "[photo attached - metadata only]", 8),
        m("staff", "تم فتح طلب ضمان وسيتم مراجعته خلال 5 أيام عمل.", "A warranty claim has been opened and will be reviewed within 5 working days.", 18, true),
        m("internal-note", "ملاحظة داخلية: مراجعة الفيلم عند الاستلام القادم.", "Internal note: inspect the film at the next visit.", 5, true),
      ];
    case "special":
      return [
        m("customer", chat.special ? `عندي طلب خاص: ${chat.special}` : "عندي طلب خاص", chat.special ? `I have a special request: ${chat.special}` : "I have a special request", 0),
        m("bot", "هذا الطلب يحتاج مراجعة بشرية وسيتم تحويله للمالك (محاكاة).", "This request needs human review and is routed to the Owner (simulation).", 1),
        m("internal-note", "ملاحظة داخلية: طلب خاص/مخصص موجه للمالك للقبول أو المراجعة.", "Internal note: special/custom request routed to the Owner to accept or review.", 4, true),
        m("staff", "سيتواصل معك المالك خلال يوم عمل.", "The Owner will contact you within one working day.", 40, true),
      ];
    default:
      return [
        m("customer", "عايز أسأل عن تركيب فيلم الحرارة", "I would like to ask about heat film installation", 0),
        m("bot", "من فضلك اكتب نوع السيارة والموديل (محاكاة).", "Please send the car type and model (simulation).", 1),
        m("customer", `${car}`, `${car}`, 7),
        m("staff", "تم تحويل طلبك للفريق وسيتم الرد قريبًا.", "Your request was handed to the team and you will get a reply soon.", 30, true),
      ];
  }
}

export function generateMessaging(world: World) {
  const { ds, ctx, rng, ref } = world;
  let outboxSeq = 0;
  const linked = new Set<string>();
  for (const chat of world.chats) {
    const messages = script(chat);
    const base = chat.startAt.getTime() > ctx.now.getTime() ? new Date(ctx.now.getTime() - 4 * 3_600_000) : chat.startAt;
    let cursor = base.getTime();
    const times = messages.map((message) => { cursor += message.gapMinutes * 60_000; return new Date(Math.min(cursor, ctx.now.getTime() - 30_000)); });
    const lastAt = times[times.length - 1];
    const recent = ctx.now.getTime() - lastAt.getTime() < 3 * 86_400_000;
    const lastKind = messages[messages.length - 1].kind;
    const status = recent ? (lastKind === "customer" ? "open" : rng.chance(0.5) ? "pending" : "open") : rng.chance(0.82) ? "resolved" : "pending";
    const unread = status === "open" && lastKind === "customer" ? rng.int(1, 3) : 0;
    const lastInbound = [...messages].map((message, index) => ({ message, at: times[index] })).filter((item) => item.message.kind === "customer").pop();
    const staff = receptionOf(chat.branchId);
    const humanDue = status === "open" && chat.kind === "special" ? new Date(Math.min(ctx.now.getTime() + 3_600_000, lastAt.getTime() + 8 * 3_600_000)) : null;
    ds.add("whatsapp_conversations", {
      id: chat.id, branch_id: chat.branchId, mode: ctx.whatsappMode, customer_label: chat.customer.name, customer_id: chat.customer.id, vehicle_id: chat.vehicle.id,
      verification_code: String(4000 + (Number(chat.id.slice(-4)) % 5000)), status, assigned_user_id: status === "resolved" ? staff : rng.chance(0.6) ? staff : null, unread_count: unread,
      related_booking_id: chat.visit?.id ?? null, created_at: base, updated_at: lastAt, channel_id: ref.channelId, version: 1, bot_state: chat.kind === "special" ? "paused" : "active",
      last_inbound_at: lastInbound?.at ?? null, human_response_required_at: humanDue,
    });
    messages.forEach((message, index) => {
      const id = `${chat.id}-m${index + 1}`;
      const authored = message.kind === "staff" || message.kind === "internal-note";
      ds.add("whatsapp_messages", {
        id, conversation_id: chat.id, mode: ctx.whatsappMode, kind: message.kind, body: chat.customer.language === "ar" ? message.ar : message.en,
        author_user_id: authored ? staff : null, created_at: times[index],
      });
      if (message.kind === "staff") {
        // Simulation mode: staff replies are held and never leave the system; provider delivery stays disabled.
        outboxSeq += 1;
        ds.add("messaging_outbox", {
          id: `seed-obx-${String(outboxSeq).padStart(4, "0")}`, conversation_id: chat.id, channel_id: ref.channelId, recipient_ref: `contact:${contactHash(chat.customer).slice(0, 16)}`,
          content: json({ type: "text", body: chat.customer.language === "ar" ? message.ar : message.en, simulation: true }), idempotency_key: `seed-outbox-${id}`,
          status: "held", attempts: 0, next_attempt_at: null, lease_until: null, expires_at: new Date(times[index].getTime() + 30 * 86_400_000),
          provider_message_id: null, failure_code: "provider-delivery-disabled", created_at: times[index], updated_at: times[index], lease_token: null, reconciliation_ref: null,
        });
      }
    });
    const events: Array<[string, string, string | null, Date]> = [["seeded-scenario", "Fictional development inbox scenario (seed data).", OWNER, base]];
    if (status !== "open") events.push(["status-changed", `Status set to ${status}.`, staff, lastAt]);
    if (chat.kind === "special") events.push(["routed-to-owner", "Special request routed to the Owner.", managerOf(chat.branchId), new Date(times[2]?.getTime() ?? base.getTime())]);
    events.forEach(([type, details, actor, at], index) => {
      ds.add("whatsapp_conversation_events", { id: `${chat.id}-e${index + 1}`, conversation_id: chat.id, event_type: type, details, actor_user_id: actor, created_at: at });
    });
    if (chat.kind === "booking" && chat.visit) {
      ds.add("whatsapp_booking_drafts", {
        id: `${chat.id}-draft`, conversation_id: chat.id, service_id: chat.visit.product.serviceId, dropoff_date: chat.visit.date, dropoff_time: chat.visit.time, expected_pickup: chat.visit.pickup,
        eta_reason: "Estimated from the configured branch capacity.", change_booking_id: null, change_action: null,
        status: chat.visit.status === "cancelled" ? "cancelled" : "confirmed", created_at: base, updated_at: lastAt,
      });
    }
    const linkKey = contactHash(chat.customer);
    if (!linked.has(linkKey)) ds.add("messaging_contact_links", {
      channel_id: ref.channelId, provider_contact_hash: contactHash(chat.customer), customer_id: chat.customer.id, vehicle_id: chat.vehicle.id, branch_id: chat.branchId, approved_by: staff, approved_at: base,
    });
    linked.add(linkKey);
  }
  void addDays;
}
