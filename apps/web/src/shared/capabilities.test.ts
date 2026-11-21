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
  it("owner has everything", () => expect(hasCapability({ role: "owner", capabilities: [] }, "catalogue.manage")).toBe(true));
});
