import { describe, expect, it } from "vitest";
import {
  addItem, buildIntakePayload, conversationTitle, findDuplicatePlate, isValidPhone, itemTotals, newContactLabel, newIdempotencyKey,
  normaliseCatalogue, normalisePhoneInput, pickBranch, plateHint, setQuantity, validateDraft,
  type CatalogueItem, type IntakeDraft,
} from "./intake-logic";
import { isIntakeShortcut } from "./intake-bus";

const item = (id: string, kind: CatalogueItem["kind"], price: CatalogueItem["price"]): CatalogueItem => ({
  id: { packageId: id, version: 1 }, kind, name: { en: id, ar: id }, price, requiresVehicle: kind !== "product", bayWork: kind !== "product",
});

const baseDraft = (over: Partial<IntakeDraft> = {}): IntakeDraft => ({
  customer: { kind: "existing", id: "c1", name: "Sara", phone: "01220001046" },
  vehicle: { kind: "existing", id: "v1", plate: "ا ب ج 1234", makeModel: "Kia" },
  branchId: "branch-a", items: [], notes: "", outcome: "quote",
  booking: { date: "2026-12-01", time: "", serviceId: "" }, idempotencyKey: "k1", ...over,
});

describe("item totals", () => {
  it("sums per currency and never mixes currencies", () => {
    let list = addItem([], item("a", "service", { minor: 10000, currency: "EGP" }));
    list = addItem(list, item("b", "product", { minor: 2500, currency: "SAR" }));
    list = setQuantity(list, "a@1", 3);
    list = setQuantity(list, "b@1", 2);
    expect(itemTotals(list)).toEqual({ totals: [{ currency: "EGP", minor: 30000 }, { currency: "SAR", minor: 5000 }], unpriced: 0 });
  });
  it("counts unpriced lines without summing them", () => {
    const list = addItem(addItem([], item("a", "package", null)), item("b", "service", { minor: 100, currency: "EGP" }));
    expect(itemTotals(list)).toEqual({ totals: [{ currency: "EGP", minor: 100 }], unpriced: 1 });
  });
  it("adding twice raises the quantity; quantity is clamped and zero removes", () => {
    let list = addItem(addItem([], item("a", "service", null)), item("a", "service", null));
    expect(list[0].quantity).toBe(2);
    expect(setQuantity(list, "a@1", 500)[0].quantity).toBe(99);
    expect(setQuantity(list, "a@1", 0)).toEqual([]);
    list = setQuantity(list, "a@1", 4);
    expect(list[0].quantity).toBe(4);
  });
});

describe("catalogue reader", () => {
  it("drops malformed rows and keeps the three kinds", () => {
    const rows = normaliseCatalogue([
      { id: { packageId: "p", version: 2 }, kind: "product", name: { en: "Wiper", ar: "ممسحة" }, price: { minor: 5000, currency: "egp" }, requiresVehicle: false, bayWork: false },
      { id: { packageId: "", version: 1 }, kind: "service", name: { en: "x", ar: "x" } },
      { id: { packageId: "q", version: 1 }, kind: "weird", name: { en: "x", ar: "x" } },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toEqual({ minor: 5000, currency: "EGP" });
    expect(normaliseCatalogue(null)).toEqual([]);
  });
});

describe("plate hint and phone", () => {
  it("normalises live and flags implausible plates", () => {
    expect(plateHint("")).toEqual({ state: "empty" });
    expect(plateHint("ابج١٢٣٤")).toEqual({ state: "ok", display: "ا ب ج 1234" });
    expect(plateHint("!!").state).toBe("invalid");
  });
  it("accepts Arabic digits in phones", () => {
    expect(normalisePhoneInput("٠١٢٢ ٠٠٠ ١٠٤٦")).toBe("01220001046");
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("+20 122 000 1046")).toBe(true);
  });
  it("finds a duplicate plate across spellings", () => {
    const customers = [{ id: "c1", name: "A", phone: "1", language: "ar" as const, vehicles: [{ id: "v1", plate: "ا ب ج 1234", makeModel: "Kia" }] }];
    expect(findDuplicatePlate(customers, "ابج١٢٣٤")?.vehicle.id).toBe("v1");
    expect(findDuplicatePlate(customers, "س م ر 5678")).toBeNull();
  });
});

describe("payload and validation", () => {
  it("builds the agreed shape for an existing customer and car", () => {
    const draft = baseDraft({ items: addItem([], item("a", "service", { minor: 1, currency: "EGP" })), notes: " hi ", whatsappConversationId: "w1" });
    expect(buildIntakePayload(draft)).toEqual({
      customer: { id: "c1" }, vehicle: { id: "v1" }, branchId: "branch-a",
      items: [{ id: { packageId: "a", version: 1 }, quantity: 1 }], notes: "hi", outcome: "quote", whatsappConversationId: "w1", idempotencyKey: "k1",
    });
  });
  it("builds new customer and new car, and a booking block", () => {
    const draft = baseDraft({
      customer: { kind: "new", name: " Omar ", phone: "٠١٢٢٠٠٠١٠٤٦", language: "ar" },
      vehicle: { kind: "new", plate: "ابج1234", makeModel: "Kia Rio" }, outcome: "booking",
      booking: { date: "2026-12-01", time: "10:00", serviceId: "s1" },
    });
    const payload = buildIntakePayload(draft);
    expect(payload.customer).toEqual({ name: "Omar", phone: "01220001046", language: "ar" });
    expect(payload.vehicle).toEqual({ plate: "ابج1234", makeModel: "Kia Rio" });
    expect(payload.booking).toEqual({ date: "2026-12-01", time: "10:00", serviceId: "s1" });
  });
  it("validates by outcome and permission", () => {
    const can = { quote: true, booking: true };
    expect(validateDraft(baseDraft({ customer: { kind: "none" } }), can)).toBe("customer");
    expect(validateDraft(baseDraft(), can)).toBe("items");
    expect(validateDraft(baseDraft({ outcome: "customer-only", vehicle: { kind: "none" } }), can)).toBeNull();
    expect(validateDraft(baseDraft({ outcome: "customer-only", vehicle: { kind: "new", plate: "", makeModel: "" } }), can)).toBeNull();
    expect(validateDraft(baseDraft({ vehicle: { kind: "none" }, items: addItem([], item("a", "service", null)) }), can)).toBe("vehicle");
    expect(validateDraft(baseDraft({ items: addItem([], item("a", "service", null)) }), { quote: false, booking: true })).toBe("permission");
    expect(validateDraft(baseDraft({ outcome: "booking" }), can)).toBe("booking");
    expect(validateDraft(baseDraft({ customer: { kind: "new", name: "x", phone: "1", language: "en" }, outcome: "customer-only" }), can)).toBe("customer-phone");
  });
  it("omits an untouched new car from the payload", () => {
    const payload = buildIntakePayload(baseDraft({ outcome: "customer-only", vehicle: { kind: "new", plate: "", makeModel: "" } }));
    expect(payload.vehicle).toBeUndefined();
  });
});

describe("idempotency key and branch", () => {
  it("is unique per call and prefixed", () => {
    const a = newIdempotencyKey();
    expect(a.startsWith("intake-")).toBe(true);
    expect(newIdempotencyKey()).not.toBe(a);
    expect(newIdempotencyKey(() => "fixed")).toBe("intake-fixed");
  });
  it("picks the current branch, else an allowed one", () => {
    expect(pickBranch("branch-b", ["branch-a", "branch-b"], ["branch-a"])).toBe("branch-b");
    expect(pickBranch("all", ["branch-a", "branch-b"], ["branch-b"])).toBe("branch-b");
    expect(pickBranch("all", ["branch-a"], [])).toBe("branch-a");
  });
});

describe("new contact label", () => {
  it("shows New contact (phone) only for unlinked conversations", () => {
    expect(newContactLabel("+201220001046", "en")).toBe("New contact (+201220001046)");
    expect(newContactLabel("+201220001046", "ar")).toContain("(+201220001046)");
    expect(newContactLabel("", "en")).toBe("New contact");
    expect(conversationTitle({ linked: false, customerLabel: "x", contactPhone: "0122" }, "en")).toBe("New contact (0122)");
    expect(conversationTitle({ linked: true, customerLabel: "Old", contactLabel: "Sara" }, "en")).toBe("Sara");
    expect(conversationTitle({ customerLabel: "Legacy" }, "en")).toBe("Legacy");
  });
});

describe("N shortcut", () => {
  const ev = (key: string, tagName: string, extra: Record<string, unknown> = {}) =>
    ({ key, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, target: { tagName, closest: () => null }, ...extra }) as never;
  it("fires only outside fields and without modifiers", () => {
    expect(isIntakeShortcut(ev("n", "BODY"))).toBe(true);
    expect(isIntakeShortcut(ev("n", "INPUT"))).toBe(false);
    expect(isIntakeShortcut(ev("n", "TEXTAREA"))).toBe(false);
    expect(isIntakeShortcut(ev("n", "BODY", { ctrlKey: true }))).toBe(false);
    expect(isIntakeShortcut(ev("x", "BODY"))).toBe(false);
    expect(isIntakeShortcut(ev("n", "DIV", { target: { tagName: "DIV", closest: () => ({}) } }))).toBe(false);
  });
});
