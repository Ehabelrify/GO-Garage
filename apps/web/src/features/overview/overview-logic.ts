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

export interface QueueGroup { kind: string; /** Total items of this kind in scope. */ count: number; /** Items to show (top N). */ items: QueueItem[] }

/** Groups queue items by kind in the fixed kind order (unknown kinds last). */
export function groupQueue(items: QueueItem[]): QueueGroup[] {
  const byKind = new Map<string, QueueItem[]>();
  for (const item of sortQueue(items)) byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item]);
  return [...byKind.entries()].map(([kind, list]) => ({ kind, count: list.length, items: list }));
}

/**
 * Top-N selection for the Overview. With kind "all" the slots are dealt round-robin across the groups so every type with
 * work shows at least one row; with one kind the first N rows of that kind are shown. `count` stays the full total.
 */
export function selectAttention(items: QueueItem[], kind: string, limit = 10): { groups: QueueGroup[]; total: number; shown: number } {
  const all = groupQueue(items);
  const pool = kind === "all" ? all : all.filter((group) => group.kind === kind);
  const taken = new Map<string, number>(pool.map((group) => [group.kind, 0]));
  let shown = 0;
  let progressed = true;
  while (shown < limit && progressed) {
    progressed = false;
    for (const group of pool) {
      if (shown >= limit) break;
      const used = taken.get(group.kind) ?? 0;
      if (used < group.items.length) { taken.set(group.kind, used + 1); shown += 1; progressed = true; }
    }
  }
  return {
    groups: pool.map((group) => ({ ...group, items: group.items.slice(0, taken.get(group.kind) ?? 0) })).filter((group) => group.items.length > 0),
    total: items.length,
    shown,
  };
}

export interface QueueLookup {
  bookings: Array<Pick<Booking, "id" | "customerId" | "vehicleId" | "dropoffDate">>;
  jobs: Array<Pick<Job, "id" | "customerId" | "vehicleId" | "updatedAt">>;
  claims: Array<{ id: string; warrantyId: string; createdAt: string }>;
  warranties: Array<{ id: string; customerId: string; vehicleId: string }>;
  customers: Array<{ id: string; name: string; vehicles: Array<{ id: string; plate: string }> }>;
}

export interface QueueRecordInfo { type: RecordType | null; customerId: string | null; customerName: string; plate: string; /** yyyy-mm-dd or empty. */ date: string }

/** Resolves who, what and when for a queue item so the Record cell never shows a bare dash. Unresolvable kinds fall back to the committed date. */
export function describeQueueRecord(item: QueueItem, lookup: QueueLookup): QueueRecordInfo {
  const type = queueRecordType(item.kind);
  let customerId: string | null = null;
  let vehicleId = "";
  let date = "";
  if (item.kind === "booking-review") {
    const booking = lookup.bookings.find((row) => row.id === item.recordId);
    if (booking) { customerId = booking.customerId; vehicleId = booking.vehicleId; date = booking.dropoffDate; }
  } else if (type === "job") {
    const job = lookup.jobs.find((row) => row.id === item.recordId);
    if (job) { customerId = job.customerId; vehicleId = job.vehicleId; date = job.updatedAt; }
  } else if (type === "claim") {
    const claim = lookup.claims.find((row) => row.id === item.recordId);
    const warranty = claim ? lookup.warranties.find((row) => row.id === claim.warrantyId) : undefined;
    if (claim && warranty) { customerId = warranty.customerId; vehicleId = warranty.vehicleId; date = claim.createdAt; }
  }
  if (!date && item.committedAt) date = item.committedAt;
  const customer = customerId ? lookup.customers.find((row) => row.id === customerId) : undefined;
  const plate = customer?.vehicles.find((vehicle) => vehicle.id === vehicleId)?.plate ?? "";
  return { type, customerId: customer ? customer.id : null, customerName: customer?.name ?? "", plate, date: date.slice(0, 10) };
}

export function todayBookings(bookings: Booking[], today: string) {
  const live = bookings.filter((booking) => booking.status === "confirmed" || booking.status === "pending");
  return {
    dropoffs: live.filter((booking) => booking.dropoffDate === today).sort((a, b) => a.dropoffTime.localeCompare(b.dropoffTime)),
    pickups: live.filter((booking) => booking.expectedPickup.slice(0, 10) === today),
  };
}
