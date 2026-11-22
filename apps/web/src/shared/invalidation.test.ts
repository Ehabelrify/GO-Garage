import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidate, SAFETY_NET_INTERVAL_MS, subscribeInvalidation, topicsForMutation } from "./invalidation";

// The suite runs in a node environment, so provide minimal window/document event targets.
const fakeDocument = Object.assign(new EventTarget(), { visibilityState: "visible" });
const fakeWindow = Object.assign(new EventTarget(), {
  setInterval: (...args: Parameters<typeof setInterval>) => setInterval(...args),
  clearInterval: (id: ReturnType<typeof setInterval>) => clearInterval(id),
});
function setVisibility(state: "visible" | "hidden") { fakeDocument.visibilityState = state; }
const document = fakeDocument;
const window = fakeWindow;

describe("invalidation bus", () => {
  beforeEach(() => {
    vi.useFakeTimers(); setVisibility("visible");
    vi.stubGlobal("window", fakeWindow); vi.stubGlobal("document", fakeDocument);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setVisibility("visible"); });

  it("fires only subscribers of the invalidated topics", () => {
    const quotes = vi.fn(); const finance = vi.fn();
    const offQuotes = subscribeInvalidation(["quotes"], quotes);
    const offFinance = subscribeInvalidation(["finance"], finance);
    invalidate(["quotes"]);
    expect(quotes).toHaveBeenCalledTimes(1);
    expect(finance).not.toHaveBeenCalled();
    invalidate(["quotes", "finance"]);
    expect(quotes).toHaveBeenCalledTimes(2);
    expect(finance).toHaveBeenCalledTimes(1);
    offQuotes(); offFinance();
  });

  it("stops firing after unsubscribe", () => {
    const callback = vi.fn();
    const off = subscribeInvalidation(["jobs"], callback);
    off();
    invalidate("jobs");
    vi.advanceTimersByTime(SAFETY_NET_INTERVAL_MS * 2);
    expect(callback).not.toHaveBeenCalled();
  });

  it("refetches on the interval while visible and never while hidden", () => {
    const callback = vi.fn();
    const off = subscribeInvalidation(["bookings"], callback);
    vi.advanceTimersByTime(SAFETY_NET_INTERVAL_MS);
    expect(callback).toHaveBeenCalledTimes(1);
    setVisibility("hidden");
    vi.advanceTimersByTime(SAFETY_NET_INTERVAL_MS * 3);
    expect(callback).toHaveBeenCalledTimes(1);
    off();
  });

  it("refetches when the tab becomes visible or regains focus", () => {
    const callback = vi.fn();
    const off = subscribeInvalidation(["bookings"], callback);
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(callback).not.toHaveBeenCalled();
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    expect(callback).toHaveBeenCalledTimes(2);
    off();
  });

  it("maps write URLs to topics and ignores reads", () => {
    expect(topicsForMutation("/api/invoices/1/pay", "POST")).toContain("finance");
    expect(topicsForMutation("/api/invoices", "GET")).toEqual([]);
    expect(topicsForMutation("/api/unknown", "POST")).toEqual([]);
  });

  it("covers document delivery, pickup promises, reminders, special requests and staff writes", () => {
    expect(topicsForMutation("/api/document-delivery/send", "POST")).toEqual(expect.arrayContaining(["invoices", "quotes"]));
    expect(topicsForMutation("/api/pickup-commitments", "POST")).toContain("bookings");
    expect(topicsForMutation("/api/pickup-commitments?bookingId=b1", "GET")).toEqual([]);
    expect(topicsForMutation("/api/reminders/r1/send", "POST")).toContain("bookings");
    expect(topicsForMutation("/api/special-requests/x/approve", "POST")).toContain("quotes");
    expect(topicsForMutation("/api/staff/u1/permissions", "PUT")).toContain("permissions");
    expect(topicsForMutation("/api/availability/config/b1", "PUT")).toContain("bookings");
  });
});
