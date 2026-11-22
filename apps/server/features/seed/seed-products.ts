import { createHash } from "node:crypto";
import { PRODUCT_SERVICE_ID } from "@garage/domain";
import { SEED_REASON, egp, json, type Dataset, type PolicyRef, type SeedContext } from "./seed-core";
import { BRANCH_A, BRANCH_B, OWNER, categoryId } from "./seed-people";

/**
 * Example catalogue PRODUCTS (accessories, parts, care products): name, bilingual category, price and tax only. No stock:
 * stock levels and per-branch quantity arrive with the customer app (Phase 5) in their own tables keyed by the product id
 * (= package_id). The research confirms prices for film products only, so every price here is an EXAMPLE and every item is
 * labelled so in its name and provenance. Deterministic and idempotent: ids start with "seed-" and the purge plan removes them.
 */
const lbl = (ar: string, en: string) => ({ ar, en });
const EVIDENCE = "private:seed/example-evidence";
const CATEGORIES = {
  accessories: lbl("إكسسوارات", "Accessories"),
  parts: lbl("قطع غيار", "Parts"),
  care: lbl("منتجات عناية", "Care products"),
  electronics: lbl("إلكترونيات", "Electronics"),
} as const;
type CategoryKey = keyof typeof CATEGORIES;

export interface ProductDef { key: string; category: CategoryKey; ar: string; en: string; pounds: number }
export const SEED_PRODUCTS: ProductDef[] = [
  { key: "steering-wheel-cover", category: "accessories", ar: "غطاء دركسيون جلد", en: "Steering wheel cover", pounds: 350 },
  { key: "floor-mats", category: "accessories", ar: "طقم دواسات أرضية", en: "Floor mats set", pounds: 1200 },
  { key: "ceramic-spray", category: "care", ar: "سبراي سيراميك للطلاء", en: "Ceramic spray sealant", pounds: 450 },
  { key: "dash-cam", category: "electronics", ar: "كاميرا طبلون أمامية", en: "Front dash camera", pounds: 2800 },
  { key: "sunshade", category: "accessories", ar: "ستارة شمس للزجاج الأمامي", en: "Windshield sunshade", pounds: 220 },
  { key: "tint-care-kit", category: "care", ar: "طقم عناية بفيلم التظليل", en: "Tint care kit", pounds: 280 },
  { key: "wiper-blades", category: "parts", ar: "طقم مساحات زجاج", en: "Wiper blades pair", pounds: 600 },
  { key: "seat-covers", category: "accessories", ar: "طقم أغطية مقاعد", en: "Seat covers set", pounds: 3500 },
  { key: "phone-holder", category: "accessories", ar: "حامل موبايل للسيارة", en: "Car phone holder", pounds: 250 },
  { key: "microfiber-towels", category: "care", ar: "مناشف مايكروفايبر (3 قطع)", en: "Microfiber towels (pack of 3)", pounds: 180 },
  { key: "ppf-maintenance-spray", category: "care", ar: "سبراي صيانة فيلم الحماية", en: "PPF maintenance spray", pounds: 390 },
  { key: "tyre-shine", category: "care", ar: "ملمع إطارات", en: "Tyre shine", pounds: 160 },
  { key: "air-freshener", category: "accessories", ar: "معطر سيارة فاخر", en: "Premium air freshener", pounds: 140 },
  { key: "usb-charger", category: "electronics", ar: "شاحن سيارة سريع USB-C", en: "USB-C fast car charger", pounds: 300 },
  { key: "cabin-air-filter", category: "parts", ar: "فلتر هواء الكابينة", en: "Cabin air filter", pounds: 420 },
  { key: "headlight-bulbs", category: "parts", ar: "لمبات كشاف LED (زوج)", en: "LED headlight bulbs pair", pounds: 1500 },
  { key: "door-sill-guards", category: "accessories", ar: "حماية عتبات الأبواب", en: "Door sill guards", pounds: 650 },
  { key: "key-fob-cover", category: "accessories", ar: "غطاء مفتاح سيليكون", en: "Silicone key fob cover", pounds: 90 },
  { key: "windshield-washer", category: "care", ar: "سائل غسيل زجاج (4 لتر)", en: "Windshield washer fluid (4 L)", pounds: 110 },
  { key: "trunk-organizer", category: "accessories", ar: "منظم شنطة", en: "Trunk organizer", pounds: 480 },
];

export const productPackageId = (key: string) => `seed-pkg-prod-${key}`;
const EXAMPLE_AR = " - السعر استرشادي";
const EXAMPLE_EN = " - example price";

export interface UnlinkedChatDef { key: string; phone: string; branchId: string; hoursAgo: number; messages: Array<{ text: string; gapMinutes: number }> }
export const UNLINKED_CHATS: UnlinkedChatDef[] = [
  { key: "1", phone: "+201005550141", branchId: BRANCH_A, hoursAgo: 3, messages: [
    { text: "السلام عليكم، عايز أعرف سعر تركيب فيلم حماية كامل لعربية سيدان", gapMinutes: 0 },
    { text: "ممكن أجي بكرة أشوفكم؟", gapMinutes: 4 },
  ] },
  { key: "2", phone: "+201015550177", branchId: BRANCH_A, hoursAgo: 9, messages: [
    { text: "Hello, do you sell dash cams and install them? I have a Kia Sportage.", gapMinutes: 0 },
  ] },
  { key: "3", phone: "+201025550123", branchId: BRANCH_B, hoursAgo: 20, messages: [
    { text: "صباح الخير، عايز أحجز تظليل للعربية وكمان طقم دواسات", gapMinutes: 0 },
    { text: "في عندكم مواعيد الأسبوع ده؟", gapMinutes: 6 },
  ] },
];
export const unlinkedHash = (key: string) => createHash("sha256").update(`seed-unlinked-contact:${key}`).digest("hex");

/** Products plus their approved example pricing, published and active in both branches. */
export function addSeedProducts(ds: Dataset, ctx: SeedContext, taxPolicy: PolicyRef, windowStart: string) {
  const base = ctx.at(windowStart, "09:00");
  for (const product of SEED_PRODUCTS) {
    const id = productPackageId(product.key);
    const name = lbl(product.ar + EXAMPLE_AR, product.en + EXAMPLE_EN);
    const money = egp(product.pounds);
    const pricingId = `catalogue-pricing:seed-prod-${product.key}-v1`;
    ds.add("commercial_policy_versions", {
      policy_id: pricingId, family: "catalogue-pricing", version: 1, branch_id: null, effective_from: windowStart, effective_through: null, state: "approved",
      evidence_ref: EVIDENCE, approved_by: OWNER, approved_at: base, reason: SEED_REASON, created_by: OWNER, created_at: base,
      value: json({ name, serviceId: PRODUCT_SERVICE_ID, vehicleCategoryId: "any", gradeId: "none", roof: "not-applicable", price: money, tax: null, bayType: "general", bayHours: 0, exclusions: [] }),
    });
    ds.add("commercial_policy_active", { policy_id: pricingId, version: 1, activated_by: OWNER, activated_at: base });
    for (const [offset, action] of [[0, "proposed"], [1, "approved"], [2, "activated"]] as const) {
      ds.add("commercial_policy_audit", { policy_id: pricingId, version: 1, action, actor_id: OWNER, occurred_at: new Date(base.getTime() + offset * 60_000), reason: SEED_REASON });
    }
    const approval = { approvedBy: OWNER, approvedAt: base.toISOString(), evidenceRef: EVIDENCE, reason: SEED_REASON };
    ds.add("catalogue_package_versions", {
      package_id: id, version: 1, revision: 1, kind: "product", state: "published", name: json(name), product_category: json(CATEGORIES[product.category]),
      vehicle_category_ids: [categoryId("sedan"), categoryId("suv")], vehicle_models: [], branch_ids: [BRANCH_A, BRANCH_B], effective_from: null, effective_through: null,
      scope: json([{ id: "scope-product", serviceId: PRODUCT_SERVICE_ID, gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1, productId: id, label: name }]),
      work: json([]),
      price: json({ state: "approved", value: money, policy: { id: pricingId, version: 1 }, approval }),
      tax: json({ state: "approved", value: { rule: taxPolicy, amount: { minor: 0, currency: "EGP" } }, policy: taxPolicy, approval }),
      work_aggregation: json({ state: "unconfigured", missing: ["not applicable to a product"] }),
      provenance: "Example price, availability unconfirmed: the research confirms prices for film products only. Stock is not tracked yet.",
      approval: json(approval), created_by: OWNER, created_at: base,
    });
    ds.add("catalogue_package_active", { package_id: id, version: 1, retired: false });
    ds.add("catalogue_audit", { entity_kind: "package", entity_id: id, version: 1, action: "published", actor_id: OWNER, reason: SEED_REASON, occurred_at: base });
  }
}

/** Three conversations from numbers that are not saved customers ("New contact"). Phones are fictional; no customer or vehicle exists. */
export function addUnlinkedChats(ds: Dataset, ctx: SeedContext, channelId: string) {
  for (const chat of UNLINKED_CHATS) {
    const id = `seed-wa-new-${chat.key}`;
    const start = new Date(ctx.now.getTime() - chat.hoursAgo * 3_600_000);
    let cursor = start.getTime();
    const times = chat.messages.map((message) => { cursor += message.gapMinutes * 60_000; return new Date(Math.min(cursor, ctx.now.getTime() - 30_000)); });
    const last = times[times.length - 1];
    const hash = unlinkedHash(chat.key);
    ds.add("whatsapp_conversations", {
      id, branch_id: chat.branchId, mode: ctx.whatsappMode, customer_label: "New contact", customer_id: null, vehicle_id: null, verification_code: `new${chat.key}0000`.slice(0, 8),
      status: "open", assigned_user_id: null, unread_count: chat.messages.length, related_booking_id: null, created_at: start, updated_at: last, channel_id: channelId, version: 1,
      bot_state: "paused", last_inbound_at: last, human_response_required_at: null,
      contact_label: `New contact (#${hash.slice(-4)})`, provider_contact_hash: hash, contact_phone: chat.phone,
    });
    chat.messages.forEach((message, index) => {
      ds.add("whatsapp_messages", { id: `${id}-m${index + 1}`, conversation_id: id, mode: ctx.whatsappMode, kind: "customer", body: message.text, author_user_id: null, created_at: times[index] });
    });
    ds.add("whatsapp_conversation_events", { id: `${id}-e1`, conversation_id: id, event_type: "new-contact-received", details: "A message arrived from a number that is not saved as a customer.", actor_user_id: null, created_at: start });
  }
}

/** Single hook used by seed-generate.ts. */
export function addIntakeSeed(world: { ds: Dataset; ctx: SeedContext; ref: { taxPolicy: PolicyRef; windowStart: string; channelId: string } }) {
  addSeedProducts(world.ds, world.ctx, world.ref.taxPolicy, world.ref.windowStart);
  addUnlinkedChats(world.ds, world.ctx, world.ref.channelId);
}
