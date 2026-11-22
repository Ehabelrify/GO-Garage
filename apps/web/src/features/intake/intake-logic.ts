import { formatPlateDisplay, isPlausiblePlate, normalizePlate, toAsciiDigits, type Locale } from "@garage/domain";

/* Pure logic for the quick-intake side panel. No React, no network. */

export type CatalogueKind = "service" | "package" | "product";
export type IntakeOutcome = "quote" | "booking" | "customer-only";
export interface CatalogueItemId { packageId: string; version: number }
export interface CatalogueItem {
  id: CatalogueItemId;
  kind: CatalogueKind;
  name: { ar: string; en: string };
  category?: string | { ar?: string; en?: string };
  price: { minor: number; currency: string } | null;
  tax?: unknown;
  requiresVehicle: boolean;
  bayWork: boolean;
}
export interface SelectedItem { item: CatalogueItem; quantity: number; note?: string }

export type CustomerChoice =
  | { kind: "none" }
  | { kind: "existing"; id: string; name: string; phone: string }
  | { kind: "new"; name: string; phone: string; language: Locale };
export type VehicleChoice =
  | { kind: "none" }
  | { kind: "existing"; id: string; plate: string; makeModel: string }
  | { kind: "new"; plate: string; makeModel: string };

export interface IntakeDraft {
  customer: CustomerChoice;
  vehicle: VehicleChoice;
  branchId: string;
  items: SelectedItem[];
  notes: string;
  outcome: IntakeOutcome;
  booking: { date: string; time: string; serviceId: string };
  whatsappConversationId?: string;
  idempotencyKey: string;
}

export interface IntakePayload {
  customer: { id: string } | { name: string; phone: string; language: Locale };
  vehicle?: { id: string } | { plate: string; makeModel: string };
  branchId: string;
  items: Array<{ id: CatalogueItemId; quantity: number; note?: string }>;
  notes?: string;
  outcome: IntakeOutcome;
  booking?: { date: string; time: string; serviceId: string };
  whatsappConversationId?: string;
  idempotencyKey: string;
}

export interface IntakeResult {
  customerId: string;
  vehicleId: string | null;
  quoteId?: string | null;
  quoteRevision?: number | null;
  bookingId?: string | null;
  conversationId?: string | null;
  warnings: string[];
}

export const MAX_QUANTITY = 99;

/* ---------- catalogue ---------- */

export const itemKey = (id: CatalogueItemId) => `${id.packageId}@${id.version}`;

const kinds: readonly string[] = ["service", "package", "product"];
const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Tolerant reader for GET /api/catalogue/intake-items (array or { items }). Malformed rows are dropped. */
export function normaliseCatalogue(json: unknown): CatalogueItem[] {
  const list = Array.isArray(json) ? json : (json as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return [];
  const out: CatalogueItem[] = [];
  for (const raw of list) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const id = (row.id ?? {}) as Record<string, unknown>;
    const packageId = asText(id.packageId);
    const version = Number(id.version);
    const name = (row.name ?? {}) as Record<string, unknown>;
    const en = asText(name.en);
    const ar = asText(name.ar);
    if (!packageId || !Number.isInteger(version) || !kinds.includes(String(row.kind)) || (!en && !ar)) continue;
    const price = row.price as { minor?: unknown; currency?: unknown } | null | undefined;
    const priced = price && Number.isFinite(Number(price.minor)) && asText(price.currency)
      ? { minor: Math.round(Number(price.minor)), currency: asText(price.currency).toUpperCase() } : null;
    const category = typeof row.category === "string" ? row.category : row.category && typeof row.category === "object" ? row.category as { ar?: string; en?: string } : undefined;
    out.push({
      id: { packageId, version }, kind: row.kind as CatalogueKind, name: { en: en || ar, ar: ar || en },
      category, price: priced, tax: row.tax, requiresVehicle: row.requiresVehicle !== false, bayWork: row.bayWork === true,
    });
  }
  return out;
}

export function itemName(item: CatalogueItem, lang: Locale): string {
  return (lang === "ar" ? item.name.ar : item.name.en) || item.name.en || item.name.ar;
}

export function categoryLabel(item: CatalogueItem, lang: Locale): string {
  const category = item.category;
  if (!category) return "";
  if (typeof category === "string") return category;
  return (lang === "ar" ? category.ar || category.en : category.en || category.ar) ?? "";
}

export const kindLabels: Record<CatalogueKind, { en: string; ar: string }> = {
  service: { en: "Service", ar: "خدمة" },
  package: { en: "Package", ar: "باقة" },
  product: { en: "Product", ar: "منتج" },
};

/* ---------- selected items ---------- */

export function addItem(list: SelectedItem[], item: CatalogueItem): SelectedItem[] {
  const key = itemKey(item.id);
  if (list.some((entry) => itemKey(entry.item.id) === key)) return setQuantity(list, key, (list.find((entry) => itemKey(entry.item.id) === key)?.quantity ?? 0) + 1);
  return [...list, { item, quantity: 1 }];
}

/** Clamps to 1..MAX_QUANTITY; 0 or less removes the line. */
export function setQuantity(list: SelectedItem[], key: string, quantity: number): SelectedItem[] {
  if (!Number.isFinite(quantity) || quantity < 1) return list.filter((entry) => itemKey(entry.item.id) !== key);
  const clamped = Math.min(MAX_QUANTITY, Math.floor(quantity));
  return list.map((entry) => (itemKey(entry.item.id) === key ? { ...entry, quantity: clamped } : entry));
}

export const removeItem = (list: SelectedItem[], key: string) => list.filter((entry) => itemKey(entry.item.id) !== key);

export const lineTotal = (entry: SelectedItem): number | null => (entry.item.price ? entry.item.price.minor * entry.quantity : null);

export interface ItemTotals { totals: Array<{ currency: string; minor: number }>; unpriced: number }

/** One total per currency (never mixed). Lines without a price are counted, not summed. */
export function itemTotals(list: SelectedItem[]): ItemTotals {
  const byCurrency = new Map<string, number>();
  let unpriced = 0;
  for (const entry of list) {
    const total = lineTotal(entry);
    if (total === null || !entry.item.price) { unpriced += 1; continue; }
    byCurrency.set(entry.item.price.currency, (byCurrency.get(entry.item.price.currency) ?? 0) + total);
  }
  return { totals: [...byCurrency.entries()].map(([currency, minor]) => ({ currency, minor })).sort((a, b) => a.currency.localeCompare(b.currency)), unpriced };
}

/* ---------- plate and phone ---------- */

export type PlateHint =
  | { state: "empty" }
  | { state: "ok"; display: string }
  | { state: "invalid"; display: string };

/** Live hint for a typed plate: how it will be saved, or that it looks wrong. */
export function plateHint(input: string): PlateHint {
  if (!input.trim()) return { state: "empty" };
  const display = formatPlateDisplay(input);
  return isPlausiblePlate(input) ? { state: "ok", display } : { state: "invalid", display };
}

/** Arabic-Indic digits to ASCII, spaces/dashes collapsed away; keeps a leading plus. */
export function normalisePhoneInput(input: string): string {
  const ascii = toAsciiDigits(input).trim();
  const plus = ascii.startsWith("+") ? "+" : "";
  return `${plus}${ascii.replace(/\D/g, "")}`;
}

export function isValidPhone(input: string): boolean {
  const digits = normalisePhoneInput(input).replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

/* ---------- validation and payload ---------- */

export type IntakeBlock = "customer" | "customer-name" | "customer-phone" | "vehicle" | "plate" | "make-model" | "items" | "booking" | "permission";

/** A "new car" with nothing typed yet counts as no car (so Save customer only works without one). */
export function effectiveVehicle(vehicle: VehicleChoice): VehicleChoice {
  return vehicle.kind === "new" && !vehicle.plate.trim() && !vehicle.makeModel.trim() ? { kind: "none" } : vehicle;
}

export function validateDraft(draft: IntakeDraft, can: { quote: boolean; booking: boolean }): IntakeBlock | null {
  const { customer, outcome } = draft;
  const vehicle = effectiveVehicle(draft.vehicle);
  if (customer.kind === "none") return "customer";
  if (customer.kind === "new") {
    if (!customer.name.trim()) return "customer-name";
    if (!isValidPhone(customer.phone)) return "customer-phone";
  }
  if (outcome === "quote" && !can.quote) return "permission";
  if (outcome === "booking" && !can.booking) return "permission";
  if (vehicle.kind === "new") {
    if (!isPlausiblePlate(vehicle.plate)) return "plate";
    if (!vehicle.makeModel.trim()) return "make-model";
  } else if (vehicle.kind === "none" && outcome !== "customer-only") return "vehicle";
  if (outcome === "quote" && draft.items.length === 0) return "items";
  if (outcome === "booking") {
    if (!draft.booking.serviceId || !draft.booking.date || !draft.booking.time) return "booking";
  }
  return null;
}

export function buildIntakePayload(draft: IntakeDraft): IntakePayload {
  const { customer } = draft;
  const vehicle = effectiveVehicle(draft.vehicle);
  const payload: IntakePayload = {
    customer: customer.kind === "existing" ? { id: customer.id }
      : customer.kind === "new" ? { name: customer.name.trim(), phone: normalisePhoneInput(customer.phone), language: customer.language }
        : { id: "" },
    branchId: draft.branchId,
    items: draft.items.map((entry) => ({ id: entry.item.id, quantity: entry.quantity, ...(entry.note?.trim() ? { note: entry.note.trim() } : {}) })),
    outcome: draft.outcome,
    idempotencyKey: draft.idempotencyKey,
  };
  if (vehicle.kind === "existing") payload.vehicle = { id: vehicle.id };
  else if (vehicle.kind === "new") payload.vehicle = { plate: vehicle.plate.trim(), makeModel: vehicle.makeModel.trim() };
  if (draft.notes.trim()) payload.notes = draft.notes.trim();
  if (draft.outcome === "booking") payload.booking = { date: draft.booking.date, time: draft.booking.time, serviceId: draft.booking.serviceId };
  if (draft.whatsappConversationId) payload.whatsappConversationId = draft.whatsappConversationId;
  return payload;
}

/** One key per panel session: a retry of the same submit is safe, "Add another" gets a new key. */
export function newIdempotencyKey(random: () => string = defaultRandom): string {
  return `intake-${random()}`;
}

function defaultRandom(): string {
  const cryptoApi = typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/* ---------- WhatsApp new-contact label ---------- */

/** "New contact (<phone>)" / Arabic equivalent. Phone is passed through as given (the UI renders it with Phone). */
export function newContactLabel(phone: string | null | undefined, lang: Locale): string {
  const base = lang === "ar" ? "جهة اتصال جديدة" : "New contact";
  const value = (phone ?? "").trim();
  return value ? `${base} (${value})` : base;
}

export const newContactWord = (lang: Locale) => (lang === "ar" ? "جهة اتصال جديدة" : "New contact");

export interface ConversationLabelSource { linked?: boolean; customerLabel: string; contactLabel?: string; contactPhone?: string }

/** Unlinked conversations are an unsaved number; linked ones show the customer's name. */
export const isNewContact = (conversation: ConversationLabelSource) => conversation.linked === false;

export function conversationTitle(conversation: ConversationLabelSource, lang: Locale): string {
  if (isNewContact(conversation)) return newContactLabel(conversation.contactPhone, lang);
  return conversation.contactLabel?.trim() || conversation.customerLabel;
}

/* ---------- local customer search and duplicate plate ---------- */

export interface StoreCustomer { id: string; name: string; phone: string; language: Locale; vehicles: Array<{ id: string; plate: string; makeModel: string }> }

/** Existing car with the same normalised plate, with its owner, from data already in the store. */
export function findDuplicatePlate(customers: StoreCustomer[], plate: string): { customer: StoreCustomer; vehicle: StoreCustomer["vehicles"][number] } | null {
  if (!isPlausiblePlate(plate)) return null;
  const wanted = normalizePlate(plate);
  for (const customer of customers) {
    const vehicle = customer.vehicles.find((item) => normalizePlate(item.plate) === wanted);
    if (vehicle) return { customer, vehicle };
  }
  return null;
}

/* ---------- slots ---------- */

export function pickBranch(current: string, branchIds: string[], actorBranchIds: string[]): string {
  if (current !== "all" && branchIds.includes(current)) return current;
  return actorBranchIds.find((id) => branchIds.includes(id)) ?? branchIds[0] ?? "";
}

export const canUseIntake = (has: (capability: "bookings.manage" | "quotes.manage" | "customers.read") => boolean) =>
  has("bookings.manage") || has("quotes.manage") || has("customers.read");
