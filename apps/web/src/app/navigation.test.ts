import { describe, expect, it } from "vitest";
import {
  allRoles,
  MOBILE_BAR_LIMIT,
  navigation,
  navigationForRole,
  overflowNavigationForRole,
  primaryNavigationForRole,
  resolveWorkspacePage,
  routeAliases,
  sectionPagesFor,
} from "./navigation";

const ids = (role: Parameters<typeof navigationForRole>[0]) => navigationForRole(role).map((item) => item.id);

describe("workspace navigation", () => {
  it("gives each role the consolidated menu", () => {
    expect(ids("owner")).toEqual(["overview", "whatsapp", "bookings", "workshop", "customers", "quotes", "warranties", "finance", "catalogue", "settings"]);
    expect(ids("branch-manager")).toEqual(["overview", "whatsapp", "bookings", "workshop", "customers", "quotes", "warranties", "finance"]);
    expect(ids("receptionist")).toEqual(["whatsapp", "customers", "bookings", "quotes", "warranties"]);
    expect(ids("technician")).toEqual(["workshop"]);
  });

  it("keeps menu sizes within the audit targets", () => {
    expect(ids("owner").length).toBeLessThanOrEqual(10);
    expect(ids("branch-manager").length).toBe(8);
    expect(ids("receptionist").length).toBe(5);
    expect(ids("technician").length).toBe(1);
  });

  it("never lists a page a role cannot open (receptionist no longer gets Workshop)", () => {
    for (const role of allRoles) {
      for (const item of navigationForRole(role)) expect(item.roles).toContain(role);
    }
    expect(ids("receptionist")).not.toContain("workshop");
  });

  it("uses unique ids, paths and icons across menu entries and merged pages", () => {
    const entries = [...navigation, ...routeAliases];
    expect(new Set(entries.map((item) => item.id)).size).toBe(entries.length);
    expect(new Set(navigation.map((item) => item.path)).size).toBe(navigation.length);
    expect(new Set(entries.map((item) => item.icon)).size).toBe(entries.length);
  });

  it("keeps every old route reachable and role-protected through aliases", () => {
    expect(resolveWorkspacePage("receptionist", "reservations")).toEqual({ page: "reservations", menu: "quotes", redirectTo: "/workspace/quotes?tab=reservations" });
    expect(resolveWorkspacePage("owner", "staff")?.redirectTo).toBe("/workspace/settings?tab=access");
    expect(resolveWorkspacePage("branch-manager", "transport")?.redirectTo).toBe("/workspace/bookings?tab=transport");
    expect(resolveWorkspacePage("branch-manager", "transport")?.menu).toBe("bookings");
    expect(resolveWorkspacePage("owner", "staff")?.menu).toBe("settings");
    expect(resolveWorkspacePage("branch-manager", "staff")).toBeNull();
    expect(resolveWorkspacePage("technician", "benefits")).toBeNull();
    expect(resolveWorkspacePage("receptionist", "workshop")).toBeNull();
    expect(resolveWorkspacePage("owner", "nonsense")).toBeNull();
    expect(resolveWorkspacePage("owner", undefined)).toBeNull();
  });

  it("every alias points at a visible parent menu entry", () => {
    for (const alias of routeAliases) expect(navigation.some((item) => item.id === alias.parent)).toBe(true);
  });

  it("no longer offers temporary sub-page tabs because every merged page owns its TabBar", () => {
    expect(sectionPagesFor("owner", "quotes")).toEqual([]);
    expect(sectionPagesFor("owner", "settings")).toEqual([]);
    expect(sectionPagesFor("receptionist", "bookings")).toEqual([]);
  });

  it("lets branch managers open Finance and keeps it away from receptionists and technicians", () => {
    expect(resolveWorkspacePage("branch-manager", "finance")?.page).toBe("finance");
    expect(resolveWorkspacePage("receptionist", "finance")).toBeNull();
    expect(resolveWorkspacePage("technician", "finance")).toBeNull();
    expect(resolveWorkspacePage("branch-manager", "catalogue")).toBeNull();
  });

  it("gates Finance and Catalogue by capability when a probe is given", () => {
    const has = (granted: string[]) => (capability: string) => granted.includes(capability);
    const list = (role: Parameters<typeof navigationForRole>[0], granted: string[]) => navigationForRole(role, has(granted)).map((item) => item.id);
    expect(list("receptionist", ["finance.view"])).toContain("finance");
    expect(list("branch-manager", [])).not.toContain("finance");
    expect(list("branch-manager", ["finance.view", "catalogue.manage"])).toEqual(["overview", "whatsapp", "bookings", "workshop", "customers", "quotes", "warranties", "finance", "catalogue"]);
    expect(resolveWorkspacePage("receptionist", "catalogue", has(["catalogue.manage"]))?.page).toBe("catalogue");
    expect(list("owner", ["finance.view", "catalogue.manage"])).toContain("settings");
  });

  it("keeps the public automation demo outside the staff inbox navigation", () => {
    expect(navigation.find((item) => item.id === "whatsapp")?.path).toBe("/workspace/whatsapp");
    expect(navigation.some((item) => item.path === "/demo")).toBe(false);
  });

  it("splits the mobile bar and More menu without losing or duplicating items", () => {
    for (const role of allRoles) {
      const bar = primaryNavigationForRole(role).map((item) => item.id);
      const more = overflowNavigationForRole(role).map((item) => item.id);
      expect([...bar, ...more]).toEqual(ids(role));
      expect(bar.length + (more.length ? 1 : 0)).toBeLessThanOrEqual(MOBILE_BAR_LIMIT);
    }
    expect(overflowNavigationForRole("receptionist")).toEqual([]);
    expect(overflowNavigationForRole("owner").map((item) => item.id)).toEqual(["customers", "quotes", "warranties", "finance", "catalogue", "settings"]);
  });
});
