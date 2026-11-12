import type { WarrantyReviewRole } from "../src/types";

export const garageRoles = ["owner", "branch-manager", "receptionist", "technician"] as const;
export type GarageRole = (typeof garageRoles)[number];

export interface GarageActor {
  userId: string;
  email: string;
  name: string;
  role: GarageRole;
  branchIds: string[];
  isDemo?: boolean;
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
  return ["owner", "branch-manager", "receptionist"].includes(actor.role);
}

export function canUseWhatsAppInbox(actor: GarageActor, branchId: string) {
  return ["owner", "branch-manager", "receptionist"].includes(actor.role)
    && canAccessBranch(actor, branchId);
}

export function canClaimWhatsAppConversation(actor: GarageActor, assignedUserId: string | null) {
  return ["owner", "branch-manager", "receptionist"].includes(actor.role)
    && (assignedUserId === null || assignedUserId === actor.userId);
}

export function canReplyToWhatsAppConversation(actor: GarageActor, assignedUserId: string | null) {
  return ["owner", "branch-manager", "receptionist"].includes(actor.role)
    && assignedUserId === actor.userId;
}

export function canReadCustomers(actor: GarageActor) {
  return actor.role !== "technician";
}

export function canManageSettings(actor: GarageActor) {
  return actor.role === "owner";
}

export function canManageStaff(actor: GarageActor) {
  return actor.role === "owner";
}

export function canViewWarrantyRecords(actor: GarageActor, branchId?: string) {
  if (!["owner", "branch-manager", "receptionist"].includes(actor.role)) return false;
  return branchId === undefined || canAccessBranch(actor, branchId);
}

export function canManageWarrantyPolicies(actor: GarageActor) {
  return actor.role === "owner";
}

export function canIssueWarranty(actor: GarageActor, branchId: string) {
  return (actor.role === "owner" || actor.role === "branch-manager") && canAccessBranch(actor, branchId);
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
    : actor.role === "owner" || actor.role === "branch-manager";
}

export function canVoidWarranty(actor: GarageActor) {
  return actor.role === "owner";
}

export function canAccessJob(actor: GarageActor, job: JobAccessRecord) {
  if (!canAccessBranch(actor, job.branchId)) return false;
  return actor.role !== "technician" || job.assignedUserId === actor.userId;
}
