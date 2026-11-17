import { describe, expect, it } from "vitest";
import {
  groupedNavigationForRole,
  navigation,
  navigationForRole,
  primaryNavigationForRole,
} from "./navigation";

describe("workspace navigation", () => {
  it("keeps every existing route and path unique", () => {
    const ids = navigation.map((item) => item.id);
    const paths = navigation.map((item) => item.path);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual(expect.arrayContaining([
      "/workspace/overview",
      "/workspace/whatsapp",
      "/workspace/bookings",
      "/workspace/workshop",
      "/workspace/customers",
      "/workspace/transport",
      "/workspace/catalogue",
      "/workspace/quotes",
      "/workspace/promotions",
      "/workspace/reservations",
      "/workspace/benefits",
      "/workspace/warranties",
      "/workspace/finance",
      "/workspace/settings",
      "/workspace/staff",
    ]));
  });

  it("preserves the current route access for each role", () => {
    expect(navigationForRole("owner").map((item) => item.id)).toEqual([
      "overview", "whatsapp", "bookings", "workshop", "customers", "transport",
      "catalogue", "quotes", "promotions", "reservations", "benefits", "warranties",
      "finance", "settings", "staff",
    ]);
    expect(navigationForRole("branch-manager").map((item) => item.id)).toEqual([
      "overview", "whatsapp", "bookings", "workshop", "customers", "transport",
      "quotes", "promotions", "reservations", "benefits", "warranties",
    ]);
    expect(navigationForRole("receptionist").map((item) => item.id)).toEqual([
      "whatsapp", "bookings", "customers", "transport", "quotes",
      "promotions", "reservations", "benefits", "warranties",
    ]);
    expect(navigationForRole("technician").map((item) => item.id)).toEqual(["workshop"]);
  });

  it("keeps the public automation demo outside the staff inbox navigation", () => {
    expect(navigation.find((item) => item.id === "whatsapp")?.path).toBe("/workspace/whatsapp");
    expect(navigation.some((item) => item.path === "/demo")).toBe(false);
  });

  it("shows only groups with routes available to the current role", () => {
    expect(groupedNavigationForRole("owner").map((group) => [group.id, group.items.length])).toEqual([
      ["operations", 6],
      ["customer-care", 6],
      ["management", 3],
    ]);
    expect(groupedNavigationForRole("branch-manager").map((group) => group.id)).toEqual([
      "operations",
      "customer-care",
    ]);
    expect(groupedNavigationForRole("receptionist").map((group) => group.id)).toEqual([
      "operations",
      "customer-care",
    ]);
    expect(groupedNavigationForRole("technician").map((group) => group.items.map((item) => item.id))).toEqual([
      ["workshop"],
    ]);
  });

  it("keeps mobile shortcuts inside the role's allowed routes", () => {
    for (const role of ["owner", "branch-manager", "receptionist", "technician"] as const) {
      const allowed = new Set(navigationForRole(role).map((item) => item.id));
      const shortcuts = primaryNavigationForRole(role);

      expect(shortcuts.length).toBeLessThanOrEqual(4);
      expect(shortcuts.every((item) => allowed.has(item.id))).toBe(true);
    }
    expect(primaryNavigationForRole("technician").map((item) => item.id)).toEqual(["workshop"]);
  });
});
