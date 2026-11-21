/** Pure rules for matching a verified Google identity to a pre-approved staff membership. */

export type MembershipStatus = "active" | "inactive" | "invited";

export interface InvitationCandidate {
  email: string;
  status: MembershipStatus;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

/** Placeholder primary key for a pre-approved row that has no Clerk user yet. */
export const invitedIdPrefix = "invited:";

export function isInvitedId(userId: string) {
  return userId.startsWith(invitedIdPrefix);
}

/**
 * A sign-in may claim a pre-approved membership only when the Clerk primary
 * email is verified and equals the invited email (case-insensitive).
 * Inactive (removed) and already-active memberships are never claimable.
 */
export function isClaimableInvitation(candidate: InvitationCandidate, verifiedEmail: string | undefined) {
  if (!verifiedEmail) return false;
  return candidate.status === "invited" && normalizeEmail(candidate.email) === normalizeEmail(verifiedEmail);
}
