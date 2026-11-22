import { describe, expect, it } from "vitest";
import { defaultRange, inDateRange, showBranchColumn, sortBookings, telHref, whatsappHref } from "./booking-logic";
import { matchesTransport, splitDateTime } from "../transport/transport-logic";

describe("booking list defaults", () => {
  it("opens on today and upcoming", () => {
    expect(defaultRange).toBe("upcoming");
    expect(inDateRange("2026-11-22", defaultRange, "2026-11-22")).toBe(true);
    expect(inDateRange("2026-11-21", defaultRange, "2026-11-22")).toBe(false);
  });
  it("sorts upcoming soonest first and all/past newest first", () => {
    const rows = [{ dropoffDate: "2026-11-24", dropoffTime: "09:00" }, { dropoffDate: "2026-11-22", dropoffTime: "15:00" }, { dropoffDate: "2026-11-22", dropoffTime: "09:00" }];
    expect(sortBookings(rows, "upcoming").map((r) => `${r.dropoffDate} ${r.dropoffTime}`)).toEqual(["2026-11-22 09:00", "2026-11-22 15:00", "2026-11-24 09:00"]);
    expect(sortBookings(rows, "all")[0].dropoffDate).toBe("2026-11-24");
    expect(rows[0].dropoffDate).toBe("2026-11-24");
  });
  it("hides the Branch column for one branch or a narrowed view", () => {
    expect(showBranchColumn(1, "all")).toBe(false);
    expect(showBranchColumn(2, "branch-a")).toBe(false);
    expect(showBranchColumn(2, "all")).toBe(true);
  });
});

describe("contact links", () => {
  it("builds tel and wa.me links from Egyptian local and international numbers", () => {
    expect(telHref("0122 000 1046")).toBe("tel:+201220001046");
    expect(whatsappHref("+20 122 000 1046")).toBe("https://wa.me/201220001046");
    expect(whatsappHref("00201220001046")).toBe("https://wa.me/201220001046");
  });
  it("returns null for missing or too short numbers", () => {
    expect(telHref("")).toBeNull();
    expect(whatsappHref(undefined)).toBeNull();
    expect(telHref("123")).toBeNull();
  });
});

describe("transport helpers", () => {
  it("splits an ISO timestamp into date and time", () => {
    const parts = splitDateTime("2026-11-22T10:30:00");
    expect(parts).toEqual({ date: "2026-11-22", time: "10:30" });
    expect(splitDateTime("nope")).toBeNull();
  });
  it("searches name, phone digits and plate", () => {
    const parts = { customerName: "Ahmed Mahmoud", phone: "+20 122 000 1046", plate: "ABC 1234" };
    expect(matchesTransport(parts, "ahmed")).toBe(true);
    expect(matchesTransport(parts, "122 000")).toBe(true);
    expect(matchesTransport(parts, "abc1234")).toBe(true);
    expect(matchesTransport(parts, "zzz")).toBe(false);
    expect(matchesTransport(parts, "  ")).toBe(true);
  });
});
