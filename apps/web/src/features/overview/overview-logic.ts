import type { Booking, Job, QueueItem } from "@garage/domain";
import type { RecordType } from "../../shared/record-types";

export const queueKinds = ["booking-review", "unassigned-job", "quality-check", "ready-pickup", "quote-followup", "pickup-commitment", "benefit-fulfillment", "transport", "warranty-claim"] as const;

export const queueLabels: Record<string, { en: string; ar: string }> = {
  "booking-review": { en: "Booking review", ar: "مراجعة الحجز" },
  "unassigned-job": { en: "Unassigned job", ar: "أمر شغل غير مسند" },
  "quality-check": { en: "Quality check", ar: "فحص الجودة" },
  "ready-pickup": { en: "Ready for pickup", ar: "جاهز للتسليم" },
  "quote-followup": { en: "Quote follow-up", ar: "متابعة عرض السعر" },
  "pickup-commitment": { en: "Pickup commitment", ar: "موعد التسليم المتفق عليه" },
  "benefit-fulfillment": { en: "Benefit to fulfill", ar: "منفعة تحتاج تنفيذ" },
  transport: { en: "Transport", ar: "النقل" },
  "warranty-claim": { en: "Warranty claim", ar: "مطالبة ضمان" },
};

export const nextActionLabels: Record<string, { en: string; ar: string }> = {
  "review-booking": { en: "Review and confirm", ar: "مراجعة وتأكيد" },
  "assign-technician": { en: "Assign a technician", ar: "إسناد فني" },
  "complete-quality-check": { en: "Complete quality check", ar: "إكمال فحص الجودة" },
  "coordinate-pickup": { en: "Coordinate pickup", ar: "تنسيق التسليم" },
  "open-quote-followup": { en: "Follow up on quote", ar: "متابعة عرض السعر" },
  "resolve-missed-pickup": { en: "Resolve missed pickup", ar: "معالجة تسليم فائت" },
  "open-pickup-commitment": { en: "Prepare for pickup", ar: "التحضير للتسليم" },
  "review-claim": { en: "Review claim", ar: "مراجعة المطالبة" },
  "review-benefit": { en: "Review benefit", ar: "مراجعة المنفعة" },
  "resolve-transport-exception": { en: "Resolve transport issue", ar: "معالجة مشكلة النقل" },
  "coordinate-committed-window": { en: "Coordinate transport window", ar: "تنسيق موعد النقل" },
  "review-transport": { en: "Review transport request", ar: "مراجعة طلب النقل" },
};

/** Record type a queue item points at, or null when it only maps to a list page. */
export function queueRecordType(kind: string): RecordType | null {
  if (kind === "booking-review") return "booking";
  if (["unassigned-job", "quality-check", "ready-pickup"].includes(kind)) return "job";
  if (kind === "quote-followup") return "quote";
  if (kind === "warranty-claim") return "claim";
  return null;
}

/** Page that owns a queue item. */
export function queuePath(kind: string): string {
  if (["booking-review", "pickup-commitment"].includes(kind)) return "/workspace/bookings";
  if (["unassigned-job", "quality-check", "ready-pickup"].includes(kind)) return "/workspace/workshop";
  if (kind === "quote-followup") return "/workspace/quotes";
  if (kind === "benefit-fulfillment") return "/workspace/benefits";
  if (kind === "transport") return "/workspace/transport";
  return "/workspace/warranties";
}

/** Page path for an item, deep-linking to the record where the route is known. */
export function queueTarget(item: Pick<QueueItem, "kind" | "recordId">): string {
  const type = queueRecordType(item.kind);
  const base = queuePath(item.kind);
  if (!type) return base;
  if (type === "claim") return `${base}?tab=claims&record=${encodeURIComponent(item.recordId)}`;
  return `${base}?record=${encodeURIComponent(item.recordId)}`;
}

export function sortQueue(items: QueueItem[]): QueueItem[] {
  const rank = (kind: string) => { const index = (queueKinds as readonly string[]).indexOf(kind); return index < 0 ? queueKinds.length : index; };
  return [...items].sort((a, b) => rank(a.kind) - rank(b.kind));
}

export function localIsoDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function monthStart(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

const closedStages = ["delivered", "cancelled", "no-show"];
export const isActiveJob = (job: Pick<Job, "stage">) => !closedStages.includes(job.stage);

export interface BranchSummary { branchId: string; activeJobs: number; confirmedBookings: number; todayDropoffs: number; attention: number }

export function summariseBranches(branchIds: string[], jobs: Job[], bookings: Booking[], queue: QueueItem[], today: string): BranchSummary[] {
  return branchIds.map((branchId) => ({
    branchId,
    activeJobs: jobs.filter((job) => job.branchId === branchId && isActiveJob(job)).length,
    confirmedBookings: bookings.filter((booking) => booking.branchId === branchId && booking.status === "confirmed").length,
    todayDropoffs: bookings.filter((booking) => booking.branchId === branchId && booking.status !== "cancelled" && booking.dropoffDate === today).length,
    attention: queue.filter((item) => item.branchId === branchId).length,
  }));
}

export function todayBookings(bookings: Booking[], today: string) {
  const live = bookings.filter((booking) => booking.status === "confirmed" || booking.status === "pending");
  return {
    dropoffs: live.filter((booking) => booking.dropoffDate === today).sort((a, b) => a.dropoffTime.localeCompare(b.dropoffTime)),
    pickups: live.filter((booking) => booking.expectedPickup.slice(0, 10) === today),
  };
}
