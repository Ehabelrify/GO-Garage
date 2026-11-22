import type { Locale } from "@garage/domain";

export const EVIDENCE_PATTERN = /^private:[A-Za-z0-9/_-]+$/;
export const MAX_REVISION_PROBES = 12;

export class PickupApiError extends Error { constructor(public status: number, public code: string) { super(code); } }

const copy: Record<string, [string, string]> = {
  POLICY_UNCONFIGURED: ["The pickup commitment policy is not approved for this branch yet. Ask the owner to approve it in Settings.", "سياسة موعد التسليم المتفق عليه غير معتمدة لهذا الفرع بعد. اطلب من المالك اعتمادها من الإعدادات."],
  STALE_COMMITMENT: ["Someone changed this promise. Close and reopen to see the latest.", "تم تغيير هذا الوعد. أغلق النافذة وافتحها لعرض الأحدث."],
  ROLE_FORBIDDEN: ["Only the owner or the branch manager of this branch can record a pickup promise.", "المالك أو مدير هذا الفرع فقط يسجّل وعد التسليم."],
  IDEMPOTENCY_CONFLICT: ["This request was already used for a different promise. Try again.", "استُخدم هذا الطلب لوعد مختلف. حاول مرة أخرى."],
  COMMITMENT_NOT_FOUND: ["This promise no longer exists.", "هذا الوعد لم يعد موجوداً."],
  INVALID_COMMITMENT: ["Check the date, the evidence reference and the reason.", "راجع التاريخ ومرجع الإثبات والسبب."],
  WRITE_OUTCOME_UNKNOWN: ["The connection dropped, so the result is unknown. Refresh before trying again.", "انقطع الاتصال والنتيجة غير معروفة. حدّث الصفحة قبل المحاولة."],
};

export function pickupErrorCopy(code: string, lang: Locale): string {
  const found = copy[code] ?? ["The promise could not be saved.", "تعذر حفظ الوعد."];
  return lang === "ar" ? found[1] : found[0];
}

export interface PromiseDraft { promisedLocal: string; evidenceRef: string; reason: string }
export type PromiseProblem = "date" | "evidence" | "reason" | null;

export function promiseProblem(draft: PromiseDraft, now = new Date()): PromiseProblem {
  const at = new Date(draft.promisedLocal);
  if (!draft.promisedLocal || Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) return "date";
  if (!EVIDENCE_PATTERN.test(draft.evidenceRef.trim())) return "evidence";
  if (draft.reason.trim().length < 1) return "reason";
  return null;
}

export const cancelReady = (reason: string) => reason.trim().length > 0;

export function toIso(local: string): string { return new Date(local).toISOString(); }

/**
 * The server exposes no revision read, so the screen tries revisions upward until the write is accepted.
 * A rejected probe writes nothing. STALE_COMMITMENT on every probe means the history is longer than the cap.
 */
export async function withRevisionProbe<T>(attempt: (expectedRevision: number) => Promise<T>, start = 0, max = MAX_REVISION_PROBES): Promise<T> {
  let last: unknown = new PickupApiError(409, "STALE_COMMITMENT");
  for (let revision = start; revision < start + max; revision++) {
    try { return await attempt(revision); }
    catch (failure) {
      last = failure;
      if (!(failure instanceof PickupApiError) || failure.code !== "STALE_COMMITMENT") throw failure;
    }
  }
  throw last;
}
