/** Web-safe capability helper. The server computes the effective list (authz.ts) and sends it in the session payload; the server remains the authority. */
export type WebCapability =
  | "bookings.manage" | "customers.read" | "whatsapp.use" | "transport.coordinate"
  | "warranty.view" | "warranty.issue" | "warranty.review" | "warranty.void" | "warranty.policies"
  | "catalogue.manage" | "finance.view" | "special-requests.review" | "settings.manage" | "staff.manage";

type ActorLike = { role: string; isDemo?: boolean; capabilities?: string[]; permissions?: Partial<Record<string, boolean>> } | null | undefined;

/** Mirrors authz.ts role defaults. Used only when the server list is absent (older payloads, tests). */
export const roleDefaults: Record<string, readonly WebCapability[]> = {
  owner: ["bookings.manage", "customers.read", "whatsapp.use", "transport.coordinate", "warranty.view", "warranty.issue", "warranty.review", "warranty.void", "warranty.policies", "catalogue.manage", "finance.view", "special-requests.review", "settings.manage", "staff.manage"],
  "branch-manager": ["bookings.manage", "customers.read", "whatsapp.use", "transport.coordinate", "warranty.view", "warranty.issue", "warranty.review", "finance.view"],
  receptionist: ["bookings.manage", "customers.read", "whatsapp.use", "transport.coordinate", "warranty.view"],
  technician: [],
};
const ownerOnly: readonly WebCapability[] = ["settings.manage", "staff.manage"];

export function hasCapability(actor: ActorLike, capability: WebCapability): boolean {
  if (!actor) return false;
  if (actor.role === "owner") return true;
  if (Array.isArray(actor.capabilities)) return actor.capabilities.includes(capability);
  const base = (roleDefaults[actor.role] ?? []).includes(capability);
  if (actor.isDemo || ownerOnly.includes(capability)) return base;
  const override = actor.permissions?.[capability];
  return typeof override === "boolean" ? override : base;
}
