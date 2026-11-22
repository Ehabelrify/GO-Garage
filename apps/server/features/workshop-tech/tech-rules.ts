import { z } from "zod";
import type { GarageRole } from "../auth/authz";
import { identifyClaimEvidence, type ClaimEvidenceType } from "../warranty/claim-evidence";

export const MAX_JOB_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_JOB_PHOTOS_PER_JOB = 40;
export const closedStages = ["delivered", "cancelled", "no-show"] as const;
export const issueKinds = ["damage-found", "part-missing", "customer-request", "delay"] as const;
export const photoKinds = ["before", "after", "damage"] as const;
export const techToolRoles: readonly GarageRole[] = ["owner", "branch-manager", "technician"];
export const managerRoles: readonly GarageRole[] = ["owner", "branch-manager"];

export const noteSchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict();
export const checklistToggleSchema = z.object({ done: z.boolean() }).strict();
export const issueSchema = z.object({
  kind: z.enum(issueKinds),
  note: z.string().trim().min(1).max(2000),
  photoId: z.string().trim().min(1).max(120).optional(),
}).strict();
export const resolveIssueSchema = z.object({ resolution: z.string().trim().max(500).optional() }).strict();
export const photoFieldsSchema = z.object({
  kind: z.enum(photoKinds),
  caption: z.string().trim().max(200).optional(),
});
export const overrideReasonSchema = z.string().trim().min(3).max(500);

export function canUseTechTools(role: GarageRole) {
  return techToolRoles.includes(role);
}
export function isManagerRole(role: GarageRole) {
  return managerRoles.includes(role);
}
export function isClosedStage(stage: string) {
  return (closedStages as readonly string[]).includes(stage);
}

/** Photos only: the claim-evidence sniffer also accepts PDFs, which a job photo must not be. */
export function identifyJobPhoto(buffer: Buffer, fileName: string): ClaimEvidenceType | null {
  const found = identifyClaimEvidence(buffer, fileName);
  if (!found || found.contentType === "application/pdf") return null;
  return found;
}

export interface ChecklistItemLike {
  id: string;
  labelEn: string;
  labelAr: string;
  mandatory: boolean;
  done: boolean;
}

export function remainingMandatory<T extends ChecklistItemLike>(items: T[]): T[] {
  return items.filter((item) => item.mandatory && !item.done);
}

export function checklistSummary(items: ChecklistItemLike[]) {
  const mandatory = items.filter((item) => item.mandatory);
  return {
    total: items.length,
    done: items.filter((item) => item.done).length,
    mandatoryTotal: mandatory.length,
    mandatoryDone: mandatory.filter((item) => item.done).length,
    readyForStage: remainingMandatory(items).length === 0,
  };
}

export type ReadyGateOutcome<T extends ChecklistItemLike = ChecklistItemLike> =
  | { outcome: "allow" }
  | { outcome: "override"; reason: string; remaining: T[] }
  | { outcome: "blocked"; remaining: T[] };

/**
 * Moving a job to 'ready' needs every mandatory checklist item done. A manager or the owner may
 * override with a written reason. Demo identities cannot tick items (read-only), so they are not gated.
 */
export function evaluateReadyGate<T extends ChecklistItemLike>(input: {
  items: T[];
  role: GarageRole;
  isDemo?: boolean;
  overrideReason?: unknown;
}): ReadyGateOutcome<T> {
  const remaining = remainingMandatory(input.items);
  if (!remaining.length || input.isDemo) return { outcome: "allow" };
  const reason = overrideReasonSchema.safeParse(input.overrideReason);
  if (isManagerRole(input.role) && reason.success) return { outcome: "override", reason: reason.data, remaining };
  return { outcome: "blocked", remaining };
}
