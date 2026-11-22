import { describe, expect, it } from "vitest";
import { hasCapability } from "./capabilities";

describe("web hasCapability", () => {
  it("prefers the server list", () => {
    expect(hasCapability({ role: "receptionist", capabilities: ["warranty.issue"] }, "warranty.issue")).toBe(true);
    expect(hasCapability({ role: "branch-manager", capabilities: [] }, "finance.view")).toBe(false);
  });
  it("falls back to role defaults and overrides", () => {
    expect(hasCapability({ role: "branch-manager" }, "finance.view")).toBe(true);
    expect(hasCapability({ role: "branch-manager", permissions: { "finance.view": false } }, "finance.view")).toBe(false);
    expect(hasCapability({ role: "technician" }, "bookings.manage")).toBe(false);
    expect(hasCapability({ role: "branch-manager", permissions: { "staff.manage": true } }, "staff.manage")).toBe(false);
    expect(hasCapability(null, "bookings.manage")).toBe(false);
  });
  it("mirrors the quotes split: view for managers and reception, manage owner-only by default", () => {
    expect(hasCapability({ role: "branch-manager" }, "quotes.view")).toBe(true);
    expect(hasCapability({ role: "branch-manager" }, "quotes.manage")).toBe(false);
    expect(hasCapability({ role: "receptionist" }, "quotes.view")).toBe(true);
    expect(hasCapability({ role: "receptionist" }, "quotes.manage")).toBe(false);
    expect(hasCapability({ role: "technician" }, "quotes.view")).toBe(false);
    expect(hasCapability({ role: "receptionist", permissions: { "quotes.manage": true } }, "quotes.manage")).toBe(true);
    expect(hasCapability({ role: "owner", capabilities: [] }, "quotes.manage")).toBe(true);
  });
  it("owner has everything", () => expect(hasCapability({ role: "owner", capabilities: [] }, "catalogue.manage")).toBe(true));
});
