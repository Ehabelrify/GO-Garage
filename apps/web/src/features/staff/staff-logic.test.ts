import { describe, expect, it } from "vitest";
import { effectiveAllowed, filterMembers, groupCapabilities, overrideCount, sameOverrides, toggleOverride, type StaffMember } from "./staff-logic";

const member = (patch: Partial<StaffMember>): StaffMember => ({ userId: "u1", email: "a@x.com", name: "Amal", role: "receptionist", branchIds: [], status: "active", ...patch });

describe("staff logic", () => {
  it("groups capabilities and keeps unknown ones", () => {
    const groups = groupCapabilities(["bookings.manage", "warranty.view", "mystery.thing"]);
    expect(groups.map((group) => group.id)).toEqual(["front-desk", "warranty", "other"]);
    expect(groups[2].capabilities).toEqual(["mystery.thing"]);
  });
  it("drops overrides equal to the role default", () => {
    expect(toggleOverride({}, "finance.view", true, false)).toEqual({ "finance.view": true });
    expect(toggleOverride({ "finance.view": true }, "finance.view", false, false)).toEqual({});
  });
  it("computes effective permission", () => {
    expect(effectiveAllowed(["a"], {}, "a")).toBe(true);
    expect(effectiveAllowed(["a"], { a: false }, "a")).toBe(false);
    expect(effectiveAllowed([], { b: true }, "b")).toBe(true);
  });
  it("compares overrides", () => {
    expect(sameOverrides({ a: true }, { a: true })).toBe(true);
    expect(sameOverrides({ a: true }, {})).toBe(false);
  });
  it("filters members by text, role and status", () => {
    const list = [member({ userId: "1" }), member({ userId: "2", name: "Omar", email: "o@x.com", role: "technician", status: "inactive" })];
    expect(filterMembers(list, { query: "omar", role: "", status: "" })).toHaveLength(1);
    expect(filterMembers(list, { query: "", role: "technician", status: "active" })).toHaveLength(0);
    expect(filterMembers(list, { query: "", role: "", status: "" })).toHaveLength(2);
  });
  it("counts overrides", () => {
    expect(overrideCount(member({ permissions: { a: true, b: false } }))).toBe(2);
    expect(overrideCount(member({}))).toBe(0);
  });
});
