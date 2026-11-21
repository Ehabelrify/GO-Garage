import { describe, expect, it } from "vitest";
import {
  allowedBranchIds,
  canAccessBranch,
  canAccessJob,
  canManageBookings,
  canManageSettings,
  canManageWarrantyPolicies,
  canViewWarrantyRecords,
  canReadCustomers,
  canIssueWarranty,
  canOpenWarrantyClaim,
  canReviewWarrantyClaim,
  canUseWhatsAppInbox,
  effectiveCapabilities,
  canClaimWhatsAppConversation,
  canReplyToWhatsAppConversation,
  type GarageActor,
} from "./authz";

const actor = (role: GarageActor["role"], branchIds: string[] = []): GarageActor => ({
  userId: `${role}-user`,
  email: `${role}@example.test`,
  name: role,
  role,
  branchIds,
});

describe("role and branch access", () => {
  it("lets owners see all branches and change settings", () => {
    const owner = actor("owner");
    expect(allowedBranchIds(owner, ["branch-a", "branch-b"])).toEqual(["branch-a", "branch-b"]);
    expect(canAccessBranch(owner, "branch-b")).toBe(true);
    expect(canManageSettings(owner)).toBe(true);
  });

  it("limits branch managers to assigned branches", () => {
    const manager = actor("branch-manager", ["branch-a"]);
    expect(allowedBranchIds(manager, ["branch-a", "branch-b"])).toEqual(["branch-a"]);
    expect(canAccessBranch(manager, "branch-b")).toBe(false);
    expect(canManageSettings(manager)).toBe(false);
  });

  it("allows reception to manage bookings but not change owner settings", () => {
    const receptionist = actor("receptionist", ["branch-b"]);
    expect(canManageBookings(receptionist)).toBe(true);
    expect(canManageSettings(receptionist)).toBe(false);
    expect(canReadCustomers(receptionist)).toBe(true);
  });

  it("restricts technicians to their assigned jobs and withholds customer records", () => {
    const technician = actor("technician", ["branch-a"]);
    expect(canAccessJob(technician, { branchId: "branch-a", assignedUserId: technician.userId })).toBe(true);
    expect(canAccessJob(technician, { branchId: "branch-a", assignedUserId: "someone-else" })).toBe(false);
    expect(canAccessJob(technician, { branchId: "branch-b", assignedUserId: technician.userId })).toBe(false);
    expect(canReadCustomers(technician)).toBe(false);
    expect(canManageBookings(technician)).toBe(false);
  });

  it("limits warranty policy controls to owners and warranty records to assigned branches", () => {
    const owner = actor("owner");
    const receptionist = actor("receptionist", ["branch-a"]);
    const technician = actor("technician", ["branch-a"]);

    expect(canManageWarrantyPolicies(owner)).toBe(true);
    expect(canManageWarrantyPolicies(receptionist)).toBe(false);
    expect(canViewWarrantyRecords(receptionist, "branch-a")).toBe(true);
    expect(canViewWarrantyRecords(receptionist, "branch-b")).toBe(false);
    expect(canViewWarrantyRecords(technician, "branch-a")).toBe(false);
  });

  it("allows only authorized branch staff to issue coverage and open claims", () => {
    const manager = actor("branch-manager", ["branch-a"]);
    const receptionist = actor("receptionist", ["branch-a"]);

    expect(canIssueWarranty(manager, "branch-a")).toBe(true);
    expect(canIssueWarranty(manager, "branch-b")).toBe(false);
    expect(canIssueWarranty(receptionist, "branch-a")).toBe(false);
    expect(canOpenWarrantyClaim(receptionist, "branch-a")).toBe(true);
    expect(canOpenWarrantyClaim(receptionist, "branch-b")).toBe(false);
  });

  it("limits the shared inbox to authorized roles and assigned branches", () => {
    expect(canUseWhatsAppInbox(actor("owner"), "branch-b")).toBe(true);
    expect(canUseWhatsAppInbox(actor("branch-manager", ["branch-a"]), "branch-a")).toBe(true);
    expect(canUseWhatsAppInbox(actor("branch-manager", ["branch-a"]), "branch-b")).toBe(false);
    expect(canUseWhatsAppInbox(actor("receptionist", ["branch-b"]), "branch-b")).toBe(true);
    expect(canUseWhatsAppInbox(actor("technician", ["branch-a"]), "branch-a")).toBe(false);
  });

  it("prevents conflicting inbox claims and restricts replies to the assignee", () => {
    const receptionist = actor("receptionist", ["branch-a"]);
    expect(canClaimWhatsAppConversation(receptionist, null)).toBe(true);
    expect(canClaimWhatsAppConversation(receptionist, receptionist.userId)).toBe(true);
    expect(canClaimWhatsAppConversation(receptionist, "another-staff")).toBe(false);
    expect(canReplyToWhatsAppConversation(receptionist, receptionist.userId)).toBe(true);
    expect(canReplyToWhatsAppConversation(receptionist, null)).toBe(false);
    expect(canReplyToWhatsAppConversation(actor("technician", ["branch-a"]), "technician-user")).toBe(false);
  });

  it("honors the policy review role and branch boundary", () => {
    const owner = actor("owner");
    const manager = actor("branch-manager", ["branch-a"]);
    const receptionist = actor("receptionist", ["branch-a"]);

    expect(canReviewWarrantyClaim(owner, "branch-a", "owner")).toBe(true);
    expect(canReviewWarrantyClaim(manager, "branch-a", "owner")).toBe(false);
    expect(canReviewWarrantyClaim(manager, "branch-a", "branch-manager")).toBe(true);
    expect(canReviewWarrantyClaim(manager, "branch-b", "branch-manager")).toBe(false);
    expect(canReviewWarrantyClaim(receptionist, "branch-a", "branch-manager")).toBe(false);
  });
});

import { hasCapability, roleDefaultCapabilities, sanitizeOverrides, capabilities } from "./authz";

describe("per-user capability resolution", () => {
  const withPerms = (role: GarageActor["role"], permissions: GarageActor["permissions"], extra: Partial<GarageActor> = {}) =>
    ({ ...actor(role, ["branch-a"]), permissions, ...extra });

  it("uses role defaults when there are no overrides", () => {
    expect(hasCapability(actor("branch-manager", ["a"]), "warranty.issue")).toBe(true);
    expect(hasCapability(actor("branch-manager", ["a"]), "settings.manage")).toBe(false);
    expect(hasCapability(actor("technician", ["a"]), "bookings.manage")).toBe(false);
  });

  it("layers grants and revocations on role defaults", () => {
    expect(hasCapability(withPerms("receptionist", { "warranty.issue": true }), "warranty.issue")).toBe(true);
    expect(canIssueWarranty(withPerms("receptionist", { "warranty.issue": true }), "branch-a")).toBe(true);
    expect(canIssueWarranty(withPerms("receptionist", { "warranty.issue": true }), "branch-b")).toBe(false);
    expect(canManageBookings(withPerms("branch-manager", { "bookings.manage": false }))).toBe(false);
    expect(canReadCustomers(withPerms("technician", { "customers.read": true }))).toBe(true);
  });

  it("never lets overrides grant owner-only capabilities or touch owners and demo identities", () => {
    expect(hasCapability(withPerms("branch-manager", { "settings.manage": true, "staff.manage": true }), "staff.manage")).toBe(false);
    expect(canManageSettings(withPerms("receptionist", { "settings.manage": true }))).toBe(false);
    expect(hasCapability(withPerms("owner", { "bookings.manage": false }), "bookings.manage")).toBe(true);
    expect(hasCapability(withPerms("receptionist", { "warranty.issue": true }, { isDemo: true }), "warranty.issue")).toBe(false);
  });

  it("sanitises stored overrides", () => {
    expect(sanitizeOverrides("receptionist", { "warranty.issue": true, "bookings.manage": true, "staff.manage": true, bogus: true, "warranty.view": "yes" }))
      .toEqual({ "warranty.issue": true });
    expect(sanitizeOverrides("owner", { "bookings.manage": false })).toEqual({});
    expect(sanitizeOverrides("technician", null)).toEqual({});
  });

  it("special-requests.review is owner-default, grantable to a manager, and never to demo identities", () => {
    expect(hasCapability(withPerms("owner", {}), "special-requests.review")).toBe(true);
    expect(hasCapability(withPerms("branch-manager", {}), "special-requests.review")).toBe(false);
    expect(hasCapability(withPerms("branch-manager", { "special-requests.review": true }), "special-requests.review")).toBe(true);
    expect(hasCapability({ role: "branch-manager", isDemo: true, permissions: { "special-requests.review": true } }, "special-requests.review")).toBe(false);
  });
  it("owner holds every capability by default", () => {
    expect([...roleDefaultCapabilities.owner].sort()).toEqual([...capabilities].sort());
  });

  it("lists effective capabilities with overrides applied", () => {
    expect(effectiveCapabilities(withPerms("owner", {}))).toEqual([...capabilities]);
    expect(effectiveCapabilities(withPerms("technician", {}))).toEqual([]);
    const manager = effectiveCapabilities(withPerms("branch-manager", { "finance.view": false, "catalogue.manage": true }));
    expect(manager).not.toContain("finance.view");
    expect(manager).toContain("catalogue.manage");
    expect(effectiveCapabilities(withPerms("receptionist", { "warranty.issue": true }, { isDemo: true }))).not.toContain("warranty.issue");
  });
});
