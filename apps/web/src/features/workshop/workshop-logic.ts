import type { Job, JobStage } from "@garage/domain";

export const terminalStages: readonly JobStage[] = ["delivered", "cancelled", "no-show"];
export const boardStages: readonly JobStage[] = ["booked", "received", "in-service", "qc", "ready"];
export const destructiveStages: readonly JobStage[] = ["cancelled", "no-show"];

/** Button label by TARGET stage (MSA Arabic, consistent with shared stage labels). */
export const stageActionLabels: Record<JobStage, { en: string; ar: string }> = {
  booked: { en: "Move back to booked", ar: "إعادة إلى محجوزة" },
  received: { en: "Mark received", ar: "تسجيل الاستلام" },
  "in-service": { en: "Start service", ar: "بدء الخدمة" },
  qc: { en: "Send to quality check", ar: "إرسال لفحص الجودة" },
  ready: { en: "Mark ready", ar: "تسجيل الجاهزية" },
  delivered: { en: "Mark delivered", ar: "تسجيل التسليم" },
  cancelled: { en: "Cancel job", ar: "إلغاء أمر الشغل" },
  "no-show": { en: "Mark no-show", ar: "تسجيل عدم الحضور" },
};

const stageOrder: JobStage[] = ["received", "in-service", "qc", "ready", "booked", "delivered", "cancelled", "no-show"];

export function isDestructive(stage: JobStage): boolean {
  return destructiveStages.includes(stage);
}

/** Technicians get exactly one forward action; managers get all allowed targets. */
export function actionsFor(choices: JobStage[], technician: boolean): { primary: JobStage[]; destructive: JobStage[] } {
  const forward = choices.filter((stage) => !isDestructive(stage));
  if (technician) return { primary: forward.slice(0, 1), destructive: [] };
  return { primary: forward, destructive: choices.filter(isDestructive) };
}

export interface JobFilter {
  query: string;
  stage: JobStage | "all";
  branch: string;
  technicianId: string;
  /** When set, only this user's non-terminal jobs. */
  onlyAssignedTo?: string;
}

export function matchesJob(job: Job, searchable: string, filter: JobFilter): boolean {
  if (filter.onlyAssignedTo !== undefined && (job.assignedUserId !== filter.onlyAssignedTo || terminalStages.includes(job.stage))) return false;
  if (filter.stage !== "all" && job.stage !== filter.stage) return false;
  if (filter.branch !== "all" && job.branchId !== filter.branch) return false;
  if (filter.technicianId === "unassigned" && job.assignedUserId) return false;
  if (filter.technicianId !== "all" && filter.technicianId !== "unassigned" && job.assignedUserId !== filter.technicianId) return false;
  return searchable.toLowerCase().includes(filter.query.trim().toLowerCase());
}

export function compareJobs(a: Job, b: Job, pickupOf: (job: Job) => string): number {
  const byStage = stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage);
  return byStage !== 0 ? byStage : pickupOf(a).localeCompare(pickupOf(b));
}

export function groupByStage(jobs: Job[]): Record<JobStage, Job[]> {
  const groups = Object.fromEntries([...boardStages, ...terminalStages].map((stage) => [stage, [] as Job[]])) as Record<JobStage, Job[]>;
  for (const job of jobs) groups[job.stage].push(job);
  return groups;
}

export type TechniciansState = "idle" | "loading" | "ready" | "error";

/** Cards shown per board column before "+N more". */
export const COLUMN_CAP = 6;

export function capColumn<T>(items: T[], expanded: boolean, cap = COLUMN_CAP): { shown: T[]; more: number } {
  if (expanded || items.length <= cap) return { shown: items, more: 0 };
  return { shown: items.slice(0, cap), more: items.length - cap };
}

/** Jobs visible on the board (open stages only); the header count must equal this, not the filtered list including closed jobs. */
export function boardCount(groups: Record<JobStage, Job[]>): number {
  return boardStages.reduce((sum, stage) => sum + groups[stage].length, 0);
}

/** Counts per technician filter value ("all", "unassigned", user ids) over an already branch/search-filtered job list. */
export function technicianCounts(jobs: Job[]): Record<string, number> {
  const counts: Record<string, number> = { all: jobs.length, unassigned: 0 };
  for (const job of jobs) {
    if (!job.assignedUserId) counts.unassigned += 1;
    else counts[job.assignedUserId] = (counts[job.assignedUserId] ?? 0) + 1;
  }
  return counts;
}

/** Grid track list: empty columns get a narrow track so busy ones keep room. */
export function columnTracks(groups: Record<JobStage, Job[]>): string {
  return boardStages.map((stage) => (groups[stage].length ? "minmax(0, 1fr)" : "minmax(0, .55fr)")).join(" ");
}

/** True when the expected pickup date (YYYY-MM-DD) is before today and the job is still open. */
export function isOverdue(pickup: string, stage: JobStage, today: string): boolean {
  if (terminalStages.includes(stage) || pickup.startsWith("9999")) return false;
  return pickup.slice(0, 10) < today;
}

/** Technician-facing wording for the forward button: Start / Done. Falls back to the shared label. */
export const technicianActionLabels: Partial<Record<JobStage, { en: string; ar: string }>> = {
  "in-service": { en: "Start job", ar: "بدء العمل" },
  qc: { en: "Done", ar: "تم الانتهاء" },
  ready: { en: "Mark ready", ar: "تسجيل الجاهزية" },
};

export function actionLabelFor(target: JobStage, technician: boolean): { en: string; ar: string } {
  return (technician ? technicianActionLabels[target] : undefined) ?? stageActionLabels[target];
}
