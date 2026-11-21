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
