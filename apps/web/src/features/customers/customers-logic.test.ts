import { describe, expect, it } from "vitest";
import type { Customer } from "@garage/domain";
import {
  buildTimeline, defaultFormBranch, describeItem, filterCustomers, findByPlate, parse360, quoteTotal,
  recordFromParams, validateCustomerForm, type DescribeEnv, type TimelineEntry,
} from "./customers-logic";

const customers: Customer[] = [
  { id: "c1", name: "Mona Samir", phone: "+20 100 123 4567", language: "ar", vehicles: [{ id: "v1", plate: "ABC 1234", makeModel: "Toyota Corolla 2022" }] },
  { id: "c2", name: "Omar Adel", phone: "01229998888", language: "en", vehicles: [{ id: "v2", plate: "XYZ-987", makeModel: "Kia Sportage" }, { id: "v3", plate: "QQ 11", makeModel: "Fiat" }] },
];
const env: DescribeEnv = {
  lang: "en",
  plateOf: (id) => ({ v1: "ABC 1234" })[id],
  serviceName: (id) => ({ s1: "Ceramic coating" })[id],
  bookingServiceId: (id) => (id === "b1" ? "s1" : undefined),
};

describe("customer search", () => {
  it("matches name, phone digits, plate ignoring spaces/dashes and model", () => {
    expect(filterCustomers(customers, "mona").map((c) => c.id)).toEqual(["c1"]);
    expect(filterCustomers(customers, "0100 123").map((c) => c.id)).toEqual(["c1"]);
    expect(filterCustomers(customers, "xyz987").map((c) => c.id)).toEqual(["c2"]);
    expect(filterCustomers(customers, "sportage").map((c) => c.id)).toEqual(["c2"]);
    expect(filterCustomers(customers, "  ")).toHaveLength(2);
  });
  it("finds a vehicle by exact normalised plate", () => {
    expect(findByPlate(customers, "abc-1234")?.vehicle.id).toBe("v1");
    expect(findByPlate(customers, "ABC")).toBeNull();
  });
});

describe("form rules", () => {
  it("validates required fields and phone length", () => {
    expect(validateCustomerForm({ name: "", phone: "123", plate: "A", makeModel: "" })).toEqual({ name: "required", phone: "phone", plate: "required", makeModel: "required" });
    expect(validateCustomerForm({ name: "A", phone: "+20 100 123 4567", plate: "AB 12", makeModel: "Kia" })).toEqual({});
    expect(validateCustomerForm({ name: "A", phone: "0100 123 4567", plate: "", makeModel: "" }, { vehicle: false })).toEqual({});
  });
  it("never preselects 'all' as the add-form branch", () => {
    expect(defaultFormBranch(["branch-a", "branch-b"], "all")).toBe("branch-a");
    expect(defaultFormBranch(["branch-a", "branch-b"], "branch-b")).toBe("branch-b");
    expect(defaultFormBranch(["branch-a"], "branch-b")).toBe("branch-a");
    expect(defaultFormBranch([], "all")).toBe("");
  });
});

describe("360 parsing", () => {
  it("parses customer payload, restricted and reserved sections", () => {
    const parsed = parse360({
      customer: { id: "c1", name: "Mona", phone: null, language: "ar", archived: false },
      vehicles: { count: 1, items: [{ id: "v1", plate: "ABC 1234", make: "Toyota", model: "Corolla", year: 2022 }] },
      bookings: { count: 7, items: [{ id: "b1", status: "confirmed" }, { status: "no id" }] },
      transport: { count: 0, items: [], restricted: true },
      customRequests: { count: 0, items: [], unavailable: true },
    });
    expect(parsed?.kind).toBe("customer");
    expect(parsed?.customer?.phone).toBeNull();
    expect(parsed?.vehicles).toHaveLength(1);
    expect(parsed?.sections.bookings).toMatchObject({ count: 7, restricted: false });
    expect(parsed?.sections.bookings.items).toHaveLength(1);
    expect(parsed?.sections.transport.restricted).toBe(true);
    expect(parsed?.sections.customRequests.unavailable).toBe(true);
    expect(parsed?.sections.purchases.unavailable).toBe(true);
  });
  it("describes a purchase with its own currency and source links, and a special request", () => {
    const purchase = describeItem("purchases", { id: "quote:q1", quoteId: "q1", bookingId: "b1", jobId: "j1", warrantyId: "w1", labelEn: "PPF", labelAr: "حماية", quantity: 2, amount: { minor: 250000, currency: "SAR" }, purchasedOn: "2026-11-01", status: "delivered" }, env);
    expect(purchase).toMatchObject({ type: "quote", id: "q1", label: "PPF", amount: { minor: 250000, currency: "SAR" }, domain: "purchase" });
    expect(purchase?.links?.map((link) => link.type)).toEqual(["booking", "job", "warranty"]);
    expect(describeItem("purchases", { id: "job:j2", jobId: "j2", labelEn: "Tint", purchasedOn: "2026-10-01", status: "delivered" }, env)).toMatchObject({ type: "job", amount: null });
    expect(describeItem("customRequests", { id: "r1", title: "Roof film", status: "accepted", quotedPrice: { minor: 1000, currency: "EGP" } }, env)).toMatchObject({ type: "special-request", domain: "request", amount: { minor: 1000, currency: "EGP" } });
  });
  it("parses a vehicle payload and rejects junk", () => {
    const parsed = parse360({ vehicle: { id: "v1", plate: "ABC 1234", make: "Toyota", model: "Corolla", year: null, color: "White" }, customer: { id: "c1", name: "Mona", phone: "1" } });
    expect(parsed?.kind).toBe("vehicle");
    expect(parsed?.vehicle?.color).toBe("White");
    expect(parse360(null)).toBeNull();
    expect(parse360({})).toBeNull();
  });
});

describe("describing items without raw ids", () => {
  it("labels bookings and jobs by service and plate", () => {
    const booking = describeItem("bookings", { id: "b1", serviceId: "s1", vehicleId: "v1", status: "confirmed", dropoffDate: "2026-11-20" }, env);
    expect(booking).toMatchObject({ type: "booking", label: "Ceramic coating", status: "confirmed" });
    expect(booking?.subtitle).toContain("ABC 1234");
    expect(describeItem("jobs", { id: "j1", bookingId: "b1", stage: "ready", updatedAt: "2026-11-21T10:00:00Z" }, env)?.label).toBe("Ceramic coating");
    expect(describeItem("bookings", { id: "b2" }, env)?.label).toBe("Booking");
  });
  it("formats quote totals as money and tolerates unknown shapes", () => {
    expect(quoteTotal({ minor: 125000, currency: "EGP" })).toEqual({ minor: 125000, currency: "EGP" });
    expect(quoteTotal({ amount: { minor: 5 } })?.minor).toBe(5);
    expect(quoteTotal("x")).toBeNull();
    const quote = describeItem("quotes", { id: "q1", revision: 2, state: "offered", total: { minor: 125000, currency: "EGP" } }, env);
    expect(quote?.subtitle).toContain("1,250");
    expect(quote?.subtitle).not.toContain("125000");
  });
});

describe("timeline and routing", () => {
  it("orders dated entries newest first and keeps undated separate", () => {
    const base = { type: null, label: "x", section: "bookings" as const };
    const entries: TimelineEntry[] = [
      { ...base, id: "a", date: "2026-01-01" }, { ...base, id: "b", date: "2026-03-01" }, { ...base, id: "c", date: null }, { ...base, id: "d", date: "bad" },
    ];
    const { dated, undated } = buildTimeline(entries);
    expect(dated.map((e) => e.id)).toEqual(["b", "a"]);
    expect(undated.map((e) => e.id)).toEqual(["c", "d"]);
  });
  it("reads both shared and server deep-link params", () => {
    expect(recordFromParams(new URLSearchParams("customer=c1"))).toEqual({ kind: "customer", id: "c1" });
    expect(recordFromParams(new URLSearchParams("customerId=c1"))).toEqual({ kind: "customer", id: "c1" });
    expect(recordFromParams(new URLSearchParams("vehicleId=v1"))).toEqual({ kind: "vehicle", id: "v1" });
    expect(recordFromParams(new URLSearchParams(""))).toBeNull();
  });
});

describe("Arabic plate matching", () => {
  const arabic = [{ id: "c9", name: "Ali", phone: "01000000000", language: "ar" as const, vehicles: [{ id: "v9", plate: "أ ب ج 1234", makeModel: "Kia" }] }];
  it("finds the vehicle for every typed form", () => {
    for (const query of ["ابج١٢٣٤", "ا ب ج-1234", "1234 جبا", "أ ب ج 1234"]) expect(filterCustomers(arabic, query), query).toHaveLength(1);
    expect(filterCustomers(arabic, "ابد1234")).toHaveLength(0);
    expect(findByPlate(arabic, "ابج ١٢٣٤")?.vehicle.id).toBe("v9");
  });
  it("flags implausible plates in the form", () => {
    expect(validateCustomerForm({ name: "A", phone: "0100 123 4567", plate: "12345", makeModel: "Kia" })).toEqual({ plate: "plate" });
  });
});

import { customerStats, scopeNote } from "./customers-logic";

describe("customer list stats and scope", () => {
  it("computes last visit and open jobs", () => {
    const stats = customerStats(
      [
        { customerId: "c1", dropoffDate: "2026-11-01", status: "confirmed" },
        { customerId: "c1", dropoffDate: "2026-11-10", status: "cancelled" },
        { customerId: "c1", dropoffDate: "2026-12-30", status: "confirmed" },
        { customerId: "c1", dropoffDate: "2026-11-15", status: "pending" },
      ],
      [{ customerId: "c1", stage: "in-service" }, { customerId: "c1", stage: "delivered" }, { customerId: "c2", stage: "ready" }],
      "2026-11-22",
    );
    expect(stats.get("c1")).toEqual({ lastVisit: "2026-11-15", openJobs: 1 });
    expect(stats.get("c2")).toEqual({ lastVisit: null, openJobs: 1 });
  });
  it("explains the scope", () => {
    expect(scopeNote({ lang: "en", role: "owner", branchNames: [], currentBranch: "all" })).toBe("Customers of all branches");
    expect(scopeNote({ lang: "en", role: "receptionist", branchNames: ["Nasr City", "Maadi"], currentBranch: "all" })).toBe("Customers of your branches: Nasr City, Maadi");
    expect(scopeNote({ lang: "ar", role: "owner", branchNames: [], currentBranch: "b1", currentBranchName: "مدينة نصر" })).toBe("عملاء فرع مدينة نصر");
  });
});
