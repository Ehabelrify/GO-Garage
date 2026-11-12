import type { Branch, BranchId, Booking, Decision, JobStage, Service } from "./types";

export type CapacityIssue = "closed" | "daily-cap" | "bay-capacity" | null;

export function configuredNumber(
  decisions: Decision[],
  decisionId: string,
  scopeKey: BranchId | "business",
  fallback: number,
) {
  const raw = decisions.find((item) => item.id === decisionId)?.valueByScope[scopeKey];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function configuredServiceHours(service: Service, decisions: Decision[]) {
  const decisionId = service.id === "tint" ? "tint-hours" : service.id === "ceramic" ? "ceramic-hours" : "";
  if (!decisionId) return service.bayHours;
  const value = Number(decisions.find((item) => item.id === decisionId)?.valueByScope.business);
  return Number.isFinite(value) && value > 0 ? value : service.bayHours;
}

export function checkBookingCapacity(input: {
  branch: Branch;
  service: Service;
  branchId: BranchId;
  date: string;
  bookings: Booking[];
  services: Service[];
  decisions: Decision[];
  excludeBookingId?: string;
}): CapacityIssue {
  const { branch, service, branchId, date, bookings, services, decisions, excludeBookingId } = input;
  const weeklyDayOff = decisions.find((item) => item.id === "weekly-day-off")?.valueByScope[branchId];
  const requestedWeekday = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  if (weeklyDayOff && weeklyDayOff !== "None" && weeklyDayOff === requestedWeekday) return "closed";

  const confirmed = bookings.filter(
    (booking) =>
      booking.id !== excludeBookingId &&
      booking.branchId === branchId &&
      booking.dropoffDate === date &&
      booking.status === "confirmed",
  );
  const dailyLimit = configuredNumber(decisions, "daily-dropoff-limit", branchId, branch.dailyDropoffLimit);
  if (confirmed.length >= dailyLimit) return "daily-cap";

  const bayHours = configuredServiceHours(service, decisions);
  const occupiedHours = confirmed.reduce((total, booking) => {
    const bookedService = services.find((item) => item.id === booking.serviceId);
    return total + (bookedService?.bayType === service.bayType ? configuredServiceHours(bookedService, decisions) : 0);
  }, 0);
  const bayCount = service.bayType === "clean"
    ? configuredNumber(decisions, "clean-bays", branchId, branch.cleanBays)
    : configuredNumber(decisions, "general-bays", branchId, branch.generalBays);
  const workingHours = configuredNumber(decisions, "branch-working-hours", branchId, branch.workingHours);
  if (occupiedHours + bayHours > bayCount * workingHours) return "bay-capacity";
  return null;
}

const transitions: Partial<Record<JobStage, JobStage[]>> = {
  booked: ["received", "cancelled", "no-show"],
  received: ["in-service", "cancelled"],
  "in-service": ["qc"],
  qc: ["ready", "in-service"],
  ready: ["delivered"],
};

export function nextJobStages(stage: JobStage) {
  return transitions[stage] ?? [];
}

export function canTransitionJob(stage: JobStage, nextStage: JobStage) {
  return nextJobStages(stage).includes(nextStage);
}
