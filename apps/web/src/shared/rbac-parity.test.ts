import { describe, expect, it } from "vitest";
import {
  capabilities,
  effectiveCapabilities,
  garageRoles,
  hasCapability as serverHas,
  roleDefaultCapabilities,
  type Capability,
  type CapabilityOverrides,
  type GarageRole,
} from "../../../server/features/auth/authz";
import { hasCapability as webHas, roleDefaults, type WebCapability } from "./capabilities";
import { navigationForRole } from "../app/navigation";

type Variant = { name: string; isDemo: boolean; permissions: CapabilityOverrides };

function variants(capability: Capability): Variant[] {
  return [
    { name: "no override", isDemo: false, permissions: {} },
    { name: "explicit grant", isDemo: false, permissions: { [capability]: true } },
    { name: "explicit revoke", isDemo: false, permissions: { [capability]: false } },
    { name: "demo with grant", isDemo: true, permissions: { [capability]: true } },
    { name: "demo with revoke", isDemo: true, permissions: { [capability]: false } },
  ];
}

describe("RBAC parity: server authz vs web capabilities", () => {
  it("web capability union covers exactly the server registry", () => {
    const web = new Set(Object.values(roleDefaults).flat());
    // owner defaults list every capability on the web.
    expect([...web].sort()).toEqual([...capabilities].sort());
  });

  it("role defaults match for every role", () => {
    for (const role of garageRoles) {
      expect([...(roleDefaults[role] ?? [])].sort(), role).toEqual([...roleDefaultCapabilities[role]].sort());
    }
  });

  for (const role of garageRoles) {
    for (const capability of capabilities) {
      for (const v of variants(capability)) {
        it(`${role} x ${capability} (${v.name})`, () => {
          const server = serverHas({ role, isDemo: v.isDemo, permissions: v.permissions }, capability);
          // Web fallback path (no server list) computes the same thing from role + overrides.
          expect(webHas({ role, isDemo: v.isDemo, permissions: v.permissions }, capability as WebCapability)).toBe(server);
          // Web path fed with the server-computed effective list agrees too.
          const list = effectiveCapabilities({ role, isDemo: v.isDemo, permissions: v.permissions });
          expect(webHas({ role, capabilities: list }, capability as WebCapability)).toBe(server);
        });
      }
    }
  }

  describe("navigation visibility follows capability checks", () => {
    const gatedPages: Array<{ id: string; any: Capability[] }> = [
      { id: "finance", any: ["finance.view"] },
      { id: "catalogue", any: ["catalogue.manage"] },
      { id: "quotes", any: ["quotes.view", "quotes.manage"] },
    ];

    for (const role of garageRoles as readonly GarageRole[]) {
      for (const subject of capabilities) {
        for (const v of variants(subject)) {
          it(`${role} / ${subject} (${v.name})`, () => {
            const actor = { role, isDemo: v.isDemo, permissions: v.permissions };
            const has = (c: string) => webHas(actor, c as WebCapability);
            const ids = navigationForRole(role, has).map((item) => item.id as string);
            for (const page of gatedPages) {
              const expected = page.any.some((c) => serverHas(actor, c));
              expect(ids.includes(page.id), `${page.id} visibility`).toBe(expected);
            }
          });
        }
      }
    }
  });
});
