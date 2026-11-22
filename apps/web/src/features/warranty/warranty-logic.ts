import type {
  GarageState, LifetimeDefinition, WarrantyAuditEvent, Locale, WarrantyClaimStatus, WarrantyPolicy, WarrantyPolicyInput,
  WarrantyRecord, WarrantyReviewRole, WarrantyStartRule, WarrantyVerificationSettings,
} from "@garage/domain";

export const MAX_EVIDENCE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_EVIDENCE_ATTACHMENTS = 10;
export const EVIDENCE_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";

/** A record is visible only when its branch is allowed for the actor and matches the branch selector. */
export function branchAllowed(state: Pick<GarageState, "currentBranch">, branchId: string, allowed: readonly string[]) {
  return allowed.includes(branchId) && (state.currentBranch === "all" || state.currentBranch === branchId);
}

/** Latin digits in both locales (numeric rule); wrap the result in an LTR isolate when rendering. */
export function formatDateTime(value: string, lang: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value || "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatDate(value: string | null | undefined, lang: Locale) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium" }).format(date);
}

/**
 * Seeded policy names carry a trailing "(example)" marker. It is draft-data bookkeeping, not part of the coverage
 * name, so lists and drawers show the name without it. Matches English and Arabic markers; the stored name is unchanged.
 */
export function policyDisplayName(name: string): string {
  return name
    .replace(/\s*[(（]\s*(?:example|examples|sample|مثال|تجريبي|نص تجريبي)\s*[)）]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Last covered day: the day before the anniversary; month-end start dates clamp to the last valid day. */
export function expiryPreview(start: string, months: number) {
  if (!start || !months) return "";
  const [year, month, day] = start.split("-").map(Number);
  if (!year || !month || !day) return "";
  const anniversary = new Date(Date.UTC(year, month - 1 + months, day));
  if (anniversary.getUTCDate() !== day) anniversary.setUTCDate(0);
  anniversary.setUTCDate(anniversary.getUTCDate() - 1);
  return anniversary.toISOString().slice(0, 10);
}

export function policyForWarranty(state: Pick<GarageState, "warrantyPolicies">, record: WarrantyRecord) {
  return state.warrantyPolicies.find((policy) => policy.policyId === record.policyId && policy.version === record.policyVersion);
}

/** A draft can be published only when every term is complete (the server re-checks). */
export function policyTermsComplete(policy: WarrantyPolicy): boolean {
  return Boolean(
    policy.name.trim() && policy.eligibleServiceIds.length &&
    (policy.coverageKind === "lifetime" ? policy.lifetimeDefinition?.state === "approved" : (policy.durationMonths ?? 0) >= 1) &&
    policy.exclusions.trim() && policy.evidenceRequirements.trim() && policy.responseDays >= 1 &&
    (policy.startRule === "job-delivery" || policy.startRule === "owner-selected-date") &&
    (policy.reviewRole === "owner" || policy.reviewRole === "branch-manager") &&
    !(policy.autoIssue && policy.startRule !== "job-delivery"),
  );
}

export function verificationReady(settings: WarrantyVerificationSettings | undefined) {
  return Boolean(settings?.enabled && settings.approvedFields.includes("service") && settings.approvedFields.includes("status"));
}

/** Owner always reviews; a branch manager only when the policy assigns the Branch Manager. */
export function reviewerAssigned(role: string | undefined, reviewRole: WarrantyReviewRole | undefined) {
  return role === "owner" || (role === "branch-manager" && reviewRole === "branch-manager");
}

export const claimIsActive = (status: WarrantyClaimStatus) => status === "open" || status === "under-review";
export const claimIsFinal = (status: WarrantyClaimStatus) => status === "approved" || status === "denied" || status === "closed";

export function evidenceFileProblem(file: { size: number }, attachmentCount: number): "too-large" | "limit" | null {
  if (file.size > MAX_EVIDENCE_FILE_BYTES) return "too-large";
  if (attachmentCount >= MAX_EVIDENCE_ATTACHMENTS) return "limit";
  return null;
}

/** Accepts a scanned QR URL (`.../warranty/verify/<token>`), a bare token or a typed code. */
export function extractWarrantyCode(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const match = value.match(/\/warranty\/verify\/([^/?#\s]+)/);
  if (match) {
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  }
  return value;
}

export function fileSizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type PolicyFormState = {
  policyId: string; name: string; eligibleServiceIds: string[]; autoIssue: boolean; startRule: "" | WarrantyStartRule;
  durationMonths: string; coverageKind: "fixed" | "lifetime"; lifetimeSubject: LifetimeDefinition["subject"];
  lifetimeSubjectDefinition: string; lifetimeTerminationConditions: string; lifetimeTransferRule: string;
  lifetimeMaintenanceConditions: string; lifetimeIssuer: string; lifetimeRemedy: string; lifetimePublicAr: string;
  lifetimePublicEn: string; lifetimeEvidenceRef: string; lifetimeApprovalReason: string; lifetimeApproved: boolean;
  exclusions: string; evidenceRequirements: string; reviewRole: "" | WarrantyReviewRole; responseDays: string;
};

export const freshPolicyForm = (): PolicyFormState => ({
  policyId: "", name: "", eligibleServiceIds: [], autoIssue: false, startRule: "", durationMonths: "",
  exclusions: "", evidenceRequirements: "", coverageKind: "fixed", lifetimeSubject: "other",
  lifetimeSubjectDefinition: "", lifetimeTerminationConditions: "", lifetimeTransferRule: "",
  lifetimeMaintenanceConditions: "", lifetimeIssuer: "", lifetimeRemedy: "", lifetimePublicAr: "",
  lifetimePublicEn: "", lifetimeEvidenceRef: "", lifetimeApprovalReason: "", lifetimeApproved: false,
  reviewRole: "", responseDays: "",
});

export function policyFormFrom(policy: WarrantyPolicy): PolicyFormState {
  const snapshot = policy.lifetimeDefinition;
  const value = snapshot?.state === "approved" ? snapshot.value : snapshot?.draftValue;
  return {
    policyId: policy.policyId, name: policy.name, eligibleServiceIds: [...policy.eligibleServiceIds],
    autoIssue: policy.autoIssue, startRule: policy.startRule,
    durationMonths: policy.durationMonths == null ? "" : String(policy.durationMonths),
    exclusions: policy.exclusions, evidenceRequirements: policy.evidenceRequirements,
    reviewRole: policy.reviewRole, responseDays: String(policy.responseDays),
    coverageKind: policy.coverageKind ?? "fixed", lifetimeSubject: value?.subject ?? "other",
    lifetimeSubjectDefinition: value?.subjectDefinition ?? "", lifetimeTerminationConditions: value?.terminationConditions ?? "",
    lifetimeTransferRule: value?.transferRule ?? "", lifetimeMaintenanceConditions: value?.maintenanceConditions ?? "",
    lifetimeIssuer: value?.issuer ?? "", lifetimeRemedy: value?.remedy ?? "",
    lifetimePublicAr: value?.publicWording?.ar ?? "", lifetimePublicEn: value?.publicWording?.en ?? "",
    lifetimeEvidenceRef: snapshot?.state === "approved" ? snapshot.approval.evidenceRef : "",
    lifetimeApprovalReason: snapshot?.state === "approved" ? snapshot.approval.reason : "",
    lifetimeApproved: snapshot?.state === "approved",
  };
}

export function buildPolicyInput(form: PolicyFormState, editingVersion?: number): WarrantyPolicyInput {
  let lifetimeDefinition: WarrantyPolicyInput["lifetimeDefinition"] = null;
  if (form.coverageKind === "lifetime") {
    const value: LifetimeDefinition = {
      subject: form.lifetimeSubject, subjectDefinition: form.lifetimeSubjectDefinition.trim(),
      terminationConditions: form.lifetimeTerminationConditions.trim(), transferRule: form.lifetimeTransferRule.trim(),
      maintenanceConditions: form.lifetimeMaintenanceConditions.trim(), issuer: form.lifetimeIssuer.trim(),
      remedy: form.lifetimeRemedy.trim(), publicWording: { ar: form.lifetimePublicAr.trim(), en: form.lifetimePublicEn.trim() },
    };
    const complete = [value.subjectDefinition, value.terminationConditions, value.transferRule, value.maintenanceConditions,
      value.issuer, value.remedy, value.publicWording.ar, value.publicWording.en,
      form.lifetimeEvidenceRef.trim(), form.lifetimeApprovalReason.trim()].every(Boolean);
    lifetimeDefinition = complete && form.lifetimeApproved
      ? { state: "approved" as const, value, policy: { id: form.policyId || "new-draft", version: editingVersion ?? 1 },
        approval: { approvedBy: "owner", approvedAt: new Date().toISOString(), evidenceRef: form.lifetimeEvidenceRef.trim(), reason: form.lifetimeApprovalReason.trim() } }
      : { state: "unconfigured" as const, missing: ["approved lifetime definition"], draftValue: value };
  }
  return {
    ...(form.policyId ? { policyId: form.policyId } : {}),
    name: form.name.trim(), eligibleServiceIds: form.eligibleServiceIds, autoIssue: form.autoIssue,
    startRule: form.startRule as WarrantyStartRule, coverageKind: form.coverageKind,
    durationMonths: form.coverageKind === "fixed" ? Number(form.durationMonths) : null,
    lifetimeDefinition, exclusions: form.exclusions.trim(), evidenceRequirements: form.evidenceRequirements.trim(),
    reviewRole: form.reviewRole as WarrantyReviewRole, responseDays: Number(form.responseDays),
  };
}

/** Audit events a viewer may see: policy events for the owner, plus events of the warranties and claims in scope, newest first. */
export function visibleAuditEvents(
  events: readonly WarrantyAuditEvent[], warrantyIds: ReadonlySet<string>, claimIds: ReadonlySet<string>, isOwner: boolean,
): WarrantyAuditEvent[] {
  return events
    .filter((event) =>
      (event.entityType === "policy" && isOwner) ||
      (event.entityType === "warranty" && warrantyIds.has(event.entityId)) ||
      (event.entityType === "claim" && claimIds.has(event.entityId)))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export interface WarrantyTabCountInput { coverage: number; claims: number; invoices: number; history: number }

/** One convention: a tab's count is the number of records it holds before any filter (never "open only"). */
export function warrantyTabCounts(input: WarrantyTabCountInput) {
  return { coverage: input.coverage, claims: input.claims, invoices: input.invoices, qr: input.coverage, history: input.history };
}
