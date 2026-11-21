import type { WarrantyReviewRole } from "@garage/domain";

export const garageRoles = ["owner", "branch-manager", "receptionist", "technician"] as const;
export type GarageRole = (typeof garageRoles)[number];

export const capabilities = [
  "bookings.manage",
  "customers.read",
  "whatsapp.use",
  "transport.coordinate",
  "warranty.view",
  "warranty.issue",
  "warranty.review",
  "warranty.void",
  "warranty.policies",
  "catalogue.manage",
  "finance.view",
  "special-requests.review",
  "settings.manage",
  "staff.manage",
] as const;
export type Capability = (typeof capabilities)[number];
export type CapabilityOverrides = Partial<Record<Capability, boolean>>;

/** Capabilities that can never be granted to or revoked from non-owners. */
export const ownerOnlyCapabilities: readonly Capability[] = ["settings.manage", "staff.manage"];

export const roleDefaultCapabilities: Record<GarageRole, readonly Capability[]> = {
  owner: [...capabilities],
  "branch-manager": [
    "bookings.manage", "customers.read", "whatsapp.use", "transport.coordinate",
    "warranty.view", "warranty.issue", "warranty.review", "finance.view",
  ],
  receptionist: ["bookings.manage", "customers.read", "whatsapp.use", "transport.coordinate", "warranty.view"],
  technician: [],
};

export function isCapability(value: unknown): value is Capability {
  return typeof value === "string" && (capabilities as readonly string[]).includes(value);
}

export function isGrantableCapability(value: unknown): value is Capability {
  return isCapability(value) && !ownerOnlyCapabilities.includes(value);
}

/** Keeps only valid, grantable boolean overrides that differ from the role default. */
export function sanitizeOverrides(role: GarageRole, input: unknown): CapabilityOverrides {
  if (role === "owner" || !input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: CapabilityOverrides = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isGrantableCapability(key) || typeof value !== "boolean") continue;
    if (roleDefaultCapabilities[role].includes(key) === value) continue;
    result[key] = value;
  }
  return result;
}

/**
 * Role defaults layered with per-user overrides. Owners always have everything;
 * demo identities always use their fixed role defaults; owner-only capabilities
 * ignore overrides.
 */
export function hasCapability(
  actor: Pick<GarageActor, "role" | "isDemo" | "permissions">,
  capability: Capability,
) {
  if (actor.role === "owner") return true;
  const base = roleDefaultCapabilities[actor.role].includes(capability);
  if (actor.isDemo || ownerOnlyCapabilities.includes(capability)) return base;
  const override = actor.permissions?.[capability];
  return typeof override === "boolean" ? override : base;
}

/** Effective capability list for an actor (role defaults + overrides). Sent to the web as display hints; the server stays the authority. */
export function effectiveCapabilities(actor: Pick<GarageActor, "role" | "isDemo" | "permissions">): Capability[] {
  return capabilities.filter((capability) => hasCapability(actor, capability));
}

export interface GarageActor {
  userId: string;
  email: string;
  name: string;
  role: GarageRole;
  branchIds: string[];
  isDemo?: boolean;
  /** Per-user capability overrides layered on role defaults (never set for owners/demo). */
  permissions?: CapabilityOverrides;
}

export interface JobAccessRecord {
  branchId: string;
  assignedUserId: string | null;
}

export function isGarageRole(value: unknown): value is GarageRole {
  return typeof value === "string" && garageRoles.includes(value as GarageRole);
}

export function canAccessBranch(actor: GarageActor, branchId: string) {
  return actor.role === "owner" || actor.branchIds.includes(branchId);
}

export function allowedBranchIds(actor: GarageActor, allBranchIds: string[]) {
  return actor.role === "owner"
    ? allBranchIds
    : allBranchIds.filter((branchId) => actor.branchIds.includes(branchId));
}

export function canManageBookings(actor: GarageActor) {
  return hasCapability(actor, "bookings.manage");
}

export function canCoordinateTransport(actor: GarageActor, branchId: string) {
  return hasCapability(actor, "transport.coordinate") && canAccessBranch(actor, branchId);
}

export function canReadTransportContact(actor: GarageActor, branchId: string) {
  return !actor.isDemo && canCoordinateTransport(actor, branchId);
}

export function canUseWhatsAppInbox(actor: GarageActor, branchId: string) {
  return hasCapability(actor, "whatsapp.use")
    && canAccessBranch(actor, branchId);
}

export function canClaimWhatsAppConversation(actor: GarageActor, assignedUserId: string | null) {
  return hasCapability(actor, "whatsapp.use")
    && (assignedUserId === null || assignedUserId === actor.userId);
}

export function canReplyToWhatsAppConversation(actor: GarageActor, assignedUserId: string | null) {
  return hasCapability(actor, "whatsapp.use")
    && assignedUserId === actor.userId;
}

export function canReadCustomers(actor: GarageActor) {
  return hasCapability(actor, "customers.read");
}

export function canManageSettings(actor: GarageActor) {
  return hasCapability(actor, "settings.manage");
}

export function canManageStaff(actor: GarageActor) {
  return hasCapability(actor, "staff.manage");
}

export function canViewWarrantyRecords(actor: GarageActor, branchId?: string) {
  if (!hasCapability(actor, "warranty.view")) return false;
  return branchId === undefined || canAccessBranch(actor, branchId);
}

export function canManageWarrantyPolicies(actor: GarageActor) {
  return hasCapability(actor, "warranty.policies");
}

export function canIssueWarranty(actor: GarageActor, branchId: string) {
  return hasCapability(actor, "warranty.issue") && canAccessBranch(actor, branchId);
}

export function canOpenWarrantyClaim(actor: GarageActor, branchId: string) {
  return canViewWarrantyRecords(actor, branchId);
}

export function canReviewWarrantyClaim(
  actor: GarageActor,
  branchId: string,
  reviewRole: WarrantyReviewRole,
) {
  if (!canAccessBranch(actor, branchId)) return false;
  return reviewRole === "owner"
    ? actor.role === "owner"
    : hasCapability(actor, "warranty.review");
}

export function canVoidWarranty(actor: GarageActor) {
  return hasCapability(actor, "warranty.void");
}

export function canAccessJob(actor: GarageActor, job: JobAccessRecord) {
  if (!canAccessBranch(actor, job.branchId)) return false;
  return actor.role !== "technician" || job.assignedUserId === actor.userId;
}
