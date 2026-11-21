import { describe, expect, it } from "vitest";
import {
  createPayload, decisionPayload, emptyCreateForm, emptyReplyForm, filterRequests, parseRequest, validateCreate, validateReply, type SpecialRequest,
} from "./special-requests-logic";

const raw = {
  id: "r1", customerId: "c1", vehicleId: "v1", branchId: null, source: "staff", title: "Roof film", description: "Matte", requestedFrom: "2026-12-01", requestedTo: null,
  status: "accepted", reply: { decision: "accepted", message: "ok", quotedPrice: { minor: 480000, currency: "SAR" }, durationDays: 3, availableFrom: "2026-12-05" },
  revision: 3, createdAt: "2026-11-20T10:00:00Z", customerName: "Mona", plate: "ABC 123",
};

describe("special request parsing", () => {
  it("keeps the quoted currency and omits owner notes when absent", () => {
    const parsed = parseRequest(raw)!;
    expect(parsed.reply?.quotedPrice).toEqual({ minor: 480000, currency: "SAR" });
    expect(parsed.ownerNotes).toBeUndefined();
  });
  it("rejects unknown statuses and junk", () => {
    expect(parseRequest({ ...raw, status: "weird" })).toBeNull();
    expect(parseRequest(null)).toBeNull();
  });
});

describe("filter", () => {
  const rows = [parseRequest(raw)!, parseRequest({ ...raw, id: "r2", status: "new", title: "Audio", plate: "ZZ 9" })!] as SpecialRequest[];
  it("open shows only requests that need action", () => {
    expect(filterRequests(rows, { query: "", status: "open" }).map((row) => row.id)).toEqual(["r2"]);
    expect(filterRequests(rows, { query: "abc", status: "all" }).map((row) => row.id)).toEqual(["r1"]);
  });
});

describe("create form", () => {
  it("requires customer, vehicle, title, description and date", () => {
    expect(Object.keys(validateCreate(emptyCreateForm())).sort()).toEqual(["customerId", "description", "requestedFrom", "title", "vehicleId"]);
  });
  it("flags an inverted range and builds a trimmed payload", () => {
    const form = { ...emptyCreateForm(), customerId: "c", vehicleId: "v", title: " T ", description: " D ", requestedFrom: "2026-12-05", requestedTo: "2026-12-01" };
    expect(validateCreate(form)).toEqual({ requestedTo: "range" });
    expect(createPayload({ ...form, requestedTo: "" })).toMatchObject({ title: "T", description: "D", requestedTo: null, branchId: null });
  });
});

describe("reply form", () => {
  it("accept needs price, duration and availability; decline and ask need a message", () => {
    expect(validateReply(emptyReplyForm("accepted"))).toEqual(["price", "durationDays", "availableFrom"]);
    expect(validateReply(emptyReplyForm("declined"))).toEqual(["message"]);
    expect(validateReply({ ...emptyReplyForm("needs-info"), message: "Which colour?" })).toEqual([]);
  });
  it("converts the typed price to minor units in the chosen currency", () => {
    const form = { ...emptyReplyForm("accepted"), price: "1,250.50", currency: "SAR", durationDays: "2", availableFrom: "2026-12-01" };
    expect(validateReply(form)).toEqual([]);
    expect(decisionPayload(form, 4)).toMatchObject({ expectedRevision: 4, quotedPriceMinor: 125050, quotedCurrency: "SAR", durationDays: 2 });
    expect(decisionPayload({ ...form, decision: "declined", message: "No" }, 4)).toMatchObject({ quotedPriceMinor: null, quotedCurrency: null, durationDays: null });
  });
});
