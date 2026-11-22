import { describe, expect, it } from "vitest";
import type { PackageVersion, QuoteLine } from "@garage/domain";
import { buildCatalogueLines, daysBetween, defaultValidThrough, expiresSoonLabel, filterQuotes, hasOpenFollowup, isExpired, latestPerQuote, policyLabel, quoteAttentionKey, summariseLines, upcomingFirstKey, validThroughProblem, type QuoteRow } from "./quote-logic";
import { blankItem, buildDraftInput, itemsFromInput, parseMajor } from "./quote-build";
import { commercialError } from "./commercial-errors";
import { toPromotion } from "./commercial-data";

const line = (patch: Partial<QuoteLine> = {}): QuoteLine => ({ id: "l", scopeItemId: "s", quantity: 1, unitPrice: { minor: 10_000, currency: "EGP" }, discount: { minor: 0, currency: "EGP" }, tax: { minor: 1_400, currency: "EGP" }, ...patch });
const approval = { approvedBy: "o", approvedAt: "x", evidenceRef: "private:e", reason: "r" };
const pkg = (price = 500_000, tax: number | null = 70_000): PackageVersion => ({
  ref: { id: "pkg", version: 1 }, revision: 1, kind: "package", name: { en: "Ceramic", ar: "سيراميك" }, vehicleCategoryIds: [], vehicleModels: [], branchIds: ["b"], effectiveFrom: null, effectiveThrough: null,
  scope: [
    { id: "s1", serviceId: "svc", gradeVersion: null, areas: [], roof: "included", addOnIds: [], exclusions: [], quantity: 1 },
    { id: "s2", serviceId: "svc2", gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1 },
  ],
  work: [{ id: "w1", serviceId: "svc", scopeItemIds: ["s1", "s2"], occupancyRule: { id: "work-occupancy:x", version: 1 } }],
  price: { state: "approved", value: { minor: price, currency: "EGP" }, policy: { id: "p", version: 1 }, approval },
  tax: tax === null ? { state: "unconfigured", missing: ["tax"] } : { state: "approved", value: { rule: { id: "t", version: 1 }, amount: { minor: tax, currency: "EGP" } }, policy: { id: "t", version: 1 }, approval },
  workAggregation: { state: "unconfigured", missing: [] }, provenance: "", approval: null, state: "published",
});

describe("quote totals", () => {
  it("matches the server arithmetic (gross - discount + tax)", () => {
    const summary = summariseLines([line({ quantity: 2, discount: { minor: 500, currency: "EGP" } }), line({ unitPrice: { minor: 0, currency: "EGP" }, tax: null })]);
    expect(summary).toEqual({ currency: "EGP", subtotal: 20_000, discount: 500, tax: 1_400, total: 20_900 });
  });
});

describe("catalogue lines", () => {
  it("puts the approved price and tax on the first single-quantity item and zero on the rest", () => {
    let n = 0;
    const lines = buildCatalogueLines(pkg(), () => `l${n++}`)!;
    expect(lines.map((item) => item.unitPrice.minor)).toEqual([500_000, 0]);
    const summary = summariseLines(lines);
    expect(summary.subtotal).toBe(500_000);
    expect(summary.tax).toBe(70_000);
  });
  it("returns null without an approved price", () => {
    const unpriced = pkg();
    unpriced.price = { state: "unconfigured", missing: ["price"] };
    expect(buildCatalogueLines(unpriced, () => "x")).toBeNull();
  });
  it("keeps tax null (draft only) when tax is not approved", () => {
    expect(buildCatalogueLines(pkg(100, null), () => "x")![0].tax).toBeNull();
  });
});

describe("validity", () => {
  it("defaults to 14 days or the policy limit", () => {
    expect(defaultValidThrough("2026-11-21", 30)).toBe("2026-12-05");
    expect(defaultValidThrough("2026-11-21", 7)).toBe("2026-11-28");
    expect(defaultValidThrough("2026-11-21", null)).toBe("2026-12-05");
  });
  it("flags missing, past and too-far dates", () => {
    expect(validThroughProblem(null, "2026-11-21", 30)).toBe("missing");
    expect(validThroughProblem("2026-11-20", "2026-11-21", 30)).toBe("past");
    expect(validThroughProblem("2027-02-01", "2026-11-21", 30)).toBe("too-far");
    expect(validThroughProblem("2026-12-01", "2026-11-21", 30)).toBeNull();
  });
  it("detects expired offers only", () => {
    expect(isExpired({ state: "offered", validThrough: "2026-11-01" }, "2026-11-21")).toBe(true);
    expect(isExpired({ state: "accepted", validThrough: "2026-11-01" }, "2026-11-21")).toBe(false);
  });
});

describe("lists", () => {
  const row = (quoteId: string, revision: number, state: QuoteRow["state"] = "offered", followup: QuoteRow["followup"]["status"] = "requested"): QuoteRow => ({
    ref: { quoteId, revision }, state, total: null, digest: "d", validThrough: null,
    followup: { requestedAt: "", responsibleUserId: null, status: followup, answeredAt: null, promisedResponseAt: null },
    input: { branchId: "b", customerId: "c", vehicle: { vehicleId: "v", model: "Civic", categoryId: null }, packageVersion: null, scope: [], work: [], lines: [], priceOrigin: { kind: "catalogue" }, taxTreatment: null, acceptancePolicy: null, validThrough: null, warrantyBindings: [], benefitBindings: [], state: "offered" },
  });
  it("keeps the highest revision per quote in list order", () => {
    const rows = latestPerQuote([row("a", 1), row("b", 1), row("a", 2)]);
    expect(rows.map((item) => `${item.ref.quoteId}${item.ref.revision}`)).toEqual(["a2", "b1"]);
  });
  it("filters by status, follow-up and text", () => {
    const rows = [row("a", 1, "draft"), row("b", 1, "offered", "answered")];
    const text = () => "Mariam ABC 123";
    expect(filterQuotes(rows, { query: "", status: "draft", followup: "all" }, text)).toHaveLength(1);
    expect(filterQuotes(rows, { query: "", status: "all", followup: "answered" }, text)).toHaveLength(1);
    expect(filterQuotes(rows, { query: "abc", status: "all", followup: "all" }, text)).toHaveLength(2);
    expect(filterQuotes(rows, { query: "zzz", status: "all", followup: "all" }, text)).toHaveLength(0);
  });
});

describe("money entry", () => {
  it("parses major amounts to minor units", () => {
    expect(parseMajor("1,250.50")).toBe(125_050);
    expect(parseMajor("0")).toBe(0);
    expect(parseMajor("")).toBeNull();
    expect(Number.isNaN(parseMajor("12.345"))).toBe(true);
    expect(Number.isNaN(parseMajor("abc"))).toBe(true);
  });
});

describe("draft building", () => {
  const base = {
    base: null, branchId: "b", customerId: "c", vehicle: { vehicleId: "v", model: "Civic", categoryId: "sedan" }, mode: "catalogue" as const, pkg: pkg(), items: [],
    terms: { acceptancePolicy: { id: "quote-acceptance:a", version: 1 }, taxTreatment: { id: "quote-acceptance:t", version: 1 } }, validThrough: "2026-12-01", reason: "", actorId: "u",
    occupancyFor: () => ({ id: "work-occupancy:x", version: 1 }), state: "offered" as const, newId: (prefix: string) => `${prefix}-1`,
  };
  it("builds a catalogue offer from the published package scope and work", () => {
    const result = buildDraftInput(base);
    expect("input" in result && result.input.packageVersion).toEqual({ id: "pkg", version: 1 });
    expect("input" in result && result.input.priceOrigin).toEqual({ kind: "catalogue" });
    expect("input" in result && result.input.scope).toHaveLength(2);
  });
  it("blocks an offer without a package, terms or a priced package", () => {
    expect(buildDraftInput({ ...base, pkg: null })).toEqual({ error: "no-package" });
    expect(buildDraftInput({ ...base, terms: null })).toEqual({ error: "terms" });
    expect(buildDraftInput({ ...base, pkg: pkg(100, null) })).toEqual({ error: "package-price" });
    expect(buildDraftInput({ ...base, customerId: "" })).toEqual({ error: "no-customer" });
    expect(buildDraftInput({ ...base, vehicle: null })).toEqual({ error: "no-vehicle" });
  });
  it("allows a catalogue draft even when tax is unapproved", () => {
    expect("input" in buildDraftInput({ ...base, state: "draft", terms: null, validThrough: null, pkg: pkg(100, null) })).toBe(true);
  });
  it("builds custom-price items with minor units and the actor, and requires a reason", () => {
    const item = { ...blankItem("scope-1", "svc"), unitPrice: "1,000", tax: "140", quantity: 2 };
    const ok = buildDraftInput({ ...base, mode: "manual", pkg: null, items: [item], reason: "Special request" });
    expect("input" in ok).toBe(true);
    if ("input" in ok) {
      expect(ok.input.lines[0]).toMatchObject({ quantity: 2, unitPrice: { minor: 100_000, currency: "EGP" }, tax: { minor: 14_000 } });
      expect(ok.input.priceOrigin).toEqual({ kind: "manual", actorId: "u", reason: "Special request" });
      expect(ok.input.packageVersion).toBeNull();
    }
    expect(buildDraftInput({ ...base, mode: "manual", pkg: null, items: [item], reason: " " })).toEqual({ error: "reason" });
    expect(buildDraftInput({ ...base, mode: "manual", pkg: null, items: [{ ...item, unitPrice: "" }], reason: "x" })).toEqual({ error: "item-price" });
    expect(buildDraftInput({ ...base, mode: "manual", pkg: null, items: [item], reason: "x", occupancyFor: () => null })).toEqual({ error: "no-occupancy" });
    expect("input" in buildDraftInput({ ...base, mode: "inspection", state: "draft", pkg: null, items: [{ ...item, unitPrice: "" }], reason: "x" })).toBe(true);
  });
  it("round-trips a saved custom quote back into editable rows", () => {
    const built = buildDraftInput({ ...base, mode: "manual", pkg: null, items: [{ ...blankItem("scope-1", "svc"), unitPrice: "1250.5", tax: "0", areas: "front, rear" }], reason: "x", state: "draft" });
    if (!("input" in built)) throw new Error("expected input");
    const rows = itemsFromInput(built.input);
    expect(rows[0]).toMatchObject({ serviceId: "svc", unitPrice: "1250.50", areas: "front, rear" });
  });
  it("keeps the quote id and prior revision when revising", () => {
    const result = buildDraftInput({ ...base, base: { quoteId: "q1", priorRevision: { quoteId: "q1", revision: 2 } } as never });
    expect("input" in result && result.input.quoteId).toBe("q1");
    expect("input" in result && result.input.priorRevision).toEqual({ quoteId: "q1", revision: 2 });
  });
});

describe("labels and errors", () => {
  it("never shows a raw policy id", () => {
    expect(policyLabel({ id: "promotion-qualification:seed-ultimate-club", version: 1 })).toBe("Ultimate club");
    expect(policyLabel(null, null, "ar")).toBe("غير محدد");
    expect(policyLabel(null, { en: "Club", ar: "النادي" }, "ar")).toBe("النادي");
  });
  it("maps api failures to friendly bilingual copy", () => {
    expect(commercialError({ code: "QUOTE_EXPIRED", message: "x" }, "en")).toMatch(/expired/i);
    expect(commercialError(Object.assign(new Error("x"), { code: "QUOTE_EXPIRED" }), "ar")).toMatch(/صلاحية/);
    expect(commercialError(new Error("{\"a\":1}"), "en")).toBe("Something went wrong. Try again.");
  });
  it("reads a promotion policy into a readable summary", () => {
    const info = toPromotion({ id: "promotion-qualification:seed-four-cars", version: 1 }, { evidenceKinds: ["grouped-vehicles"], maximumUnits: 10, grouping: { minimumVehicles: 3, maximumVehicles: 4 }, evidenceVerification: { authorizedRoles: ["owner"] } });
    expect(info).toMatchObject({ name: "Fourth car free", minVehicles: 3, maxVehicles: 4, maximumUnits: 10, verifierRoles: ["owner"] });
  });
});

describe("dates and ordering", () => {
  it("counts whole days and accepts date-times", () => {
    expect(daysBetween("2026-11-22", "2026-11-25T10:00:00Z")).toBe(3);
    expect(daysBetween("2026-11-22", "2026-11-20")).toBe(-2);
  });
  it("puts upcoming dates first, then past dates most recent first, and empty dates last", () => {
    const keys = ["2026-12-01", "2026-11-22", "2026-11-01", "2026-10-01"].map((date) => upcomingFirstKey(date, "2026-11-22") as number);
    expect([...keys].sort((a, b) => a - b)).toEqual([keys[1], keys[0], keys[2], keys[3]]);
    expect(upcomingFirstKey(null)).toBeNull();
  });
  it("ranks offered quotes by expiry and everything else after them", () => {
    const row = (state: QuoteRow["state"], validThrough: string | null) => ({ state, validThrough });
    const soon = quoteAttentionKey(row("offered", "2026-11-24"), "2026-11-22");
    const later = quoteAttentionKey(row("offered", "2026-12-24"), "2026-11-22");
    const expired = quoteAttentionKey(row("offered", "2026-11-01"), "2026-11-22");
    expect(soon).toBeLessThan(later);
    expect(later).toBeLessThan(expired);
    expect(expired).toBeLessThan(quoteAttentionKey(row("accepted", "2026-11-24"), "2026-11-22"));
  });
  it("only shows the follow-up column for work somebody still owes", () => {
    const base = { requestedAt: "x", responsibleUserId: null, answeredAt: null, promisedResponseAt: null };
    expect(hasOpenFollowup({ state: "offered", followup: { ...base, status: "requested" } })).toBe(true);
    expect(hasOpenFollowup({ state: "offered", followup: { ...base, status: "answered" } })).toBe(false);
    expect(hasOpenFollowup({ state: "draft", followup: { ...base, status: "requested" } })).toBe(false);
  });
  it("words the expiry warning in both languages", () => {
    expect(expiresSoonLabel("2026-11-22", "en", "2026-11-22")).toBe("Expires today");
    expect(expiresSoonLabel("2026-11-25", "en", "2026-11-22")).toBe("Expires in 3 days");
    expect(expiresSoonLabel("2026-11-23", "ar", "2026-11-22")).toBe("ينتهي غداً");
    expect(expiresSoonLabel("2026-12-30", "en", "2026-11-22")).toBeNull();
    expect(expiresSoonLabel("2026-11-01", "en", "2026-11-22")).toBeNull();
  });
});
