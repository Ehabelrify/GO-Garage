import { describe, expect, it } from "vitest";
import { accessNoticeFor, accessNoticeText } from "./access-notice";

describe("access notice for an address the role cannot open", () => {
  it("says nothing for the bare workspace address", () => {
    expect(accessNoticeFor(undefined)).toBeNull();
    expect(accessNoticeFor("workspace")).toBeNull();
  });
  it("names a real page the person is not allowed to open", () => {
    expect(accessNoticeFor("finance")).toEqual({ kind: "no-access", pageEn: "Finance", pageAr: "المالية" });
    expect(accessNoticeFor("settings")).toMatchObject({ kind: "no-access", pageEn: "Settings" });
  });
  it("names a merged-away page by its own name, not its parent", () => {
    expect(accessNoticeFor("staff")).toMatchObject({ kind: "no-access", pageEn: "Staff access" });
    expect(accessNoticeFor("transport")).toMatchObject({ kind: "no-access", pageEn: "Transport" });
  });
  it("calls an address that is not a page not found", () => {
    expect(accessNoticeFor("does-not-exist")).toEqual({ kind: "not-found" });
    expect(accessNoticeFor("../etc")).toEqual({ kind: "not-found" });
  });
  it("tells staff to ask the owner, tells the owner to check Settings, in both languages", () => {
    const notice = accessNoticeFor("finance")!;
    expect(accessNoticeText(notice, "technician", "en")).toBe("You do not have access to Finance. Ask the owner to grant it. You have been taken to your home page.");
    expect(accessNoticeText(notice, "technician", "ar")).toContain("المالية");
    expect(accessNoticeText(notice, "technician", "ar")).toContain("اطلب من المالك");
    expect(accessNoticeText(notice, "owner", "en")).toBe("You cannot open Finance. Check your permissions in Settings.");
    expect(accessNoticeText({ kind: "not-found" }, "receptionist", "en")).toBe("That page does not exist. You have been taken to your home page.");
    expect(accessNoticeText({ kind: "not-found" }, "receptionist", "ar").length).toBeGreaterThan(10);
  });
});
