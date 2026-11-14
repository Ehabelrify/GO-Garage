import type {
  Branch,
  BranchId,
  Booking,
  Decision,
  JobStage,
  Service,
  WarrantyInvoiceDraftItem,
  WarrantyInvoiceTotals,
  WarrantyStatus,
} from "./types";

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

export function suggestedDropoffTimes(workingHours: number, openingHour = 8) {
  if (!Number.isFinite(workingHours) || workingHours < 1 ||
      !Number.isInteger(openingHour) || openingHour < 0 || openingHour > 23) return [];
  const count = Math.min(16, Math.floor(workingHours));
  return Array.from({ length: count }, (_, index) => {
    const hour = openingHour + index;
    return hour < 24 ? `${String(hour).padStart(2, "0")}:00` : null;
  }).filter((time): time is string => time !== null);
}

export function configuredServiceHours(service: Service, decisions: Decision[]) {
  const decisionId = service.id === "tint" ? "tint-hours" : service.id === "ceramic" ? "ceramic-hours" : "";
  if (!decisionId) return service.bayHours;
  const value = Number(decisions.find((item) => item.id === decisionId)?.valueByScope.business);
  return Number.isFinite(value) && value > 0 ? value : service.bayHours;
}

export function estimatePickupDate(input: {
  startDate: string;
  queueHours: number;
  serviceHours: number;
  bayCount: number;
  workingHours: number;
  weeklyDayOff: string;
}) {
  const dailyCapacity = Math.max(1, input.bayCount * input.workingHours);
  const totalDays = (Math.max(0, input.queueHours) + Math.max(0, input.serviceHours)) / dailyCapacity;
  const additionalDays = Math.max(0, Math.ceil(totalDays) - 1);
  const estimate = new Date(`${input.startDate}T12:00:00.000Z`);
  estimate.setUTCDate(estimate.getUTCDate() + additionalDays);
  let closedDays = 0;
  while (
    input.weeklyDayOff !== "None" &&
    estimate.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) === input.weeklyDayOff &&
    closedDays < 14
  ) {
    estimate.setUTCDate(estimate.getUTCDate() + 1);
    closedDays += 1;
  }
  return estimate.toISOString().slice(0, 10);
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
  const requestedWeekday = new Date(`${date}T12:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
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

export function warrantyExpiryDate(startDate: string, durationMonths: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  if (!match || !Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 120) {
    throw new RangeError("A valid start date and warranty duration are required.");
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const sourceDate = new Date(Date.UTC(year, month, day));
  if (
    month < 0 ||
    month > 11 ||
    sourceDate.getUTCFullYear() !== year ||
    sourceDate.getUTCMonth() !== month ||
    sourceDate.getUTCDate() !== day
  ) {
    throw new RangeError("A valid start date and warranty duration are required.");
  }

  const targetMonthIndex = month + durationMonths;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const anniversary = new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDayOfTargetMonth)));
  anniversary.setUTCDate(anniversary.getUTCDate() - 1);
  return anniversary.toISOString().slice(0, 10);
}

function roundInvoiceAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateWarrantyInvoiceTotals(
  items: readonly Pick<WarrantyInvoiceDraftItem, "quantity" | "unitAmount">[],
  taxRatePercent: number | null,
  paidAmount: number,
): WarrantyInvoiceTotals {
  const priced = items.length > 0 && items.every((item) =>
    Number.isFinite(item.quantity) && item.quantity > 0 &&
    item.unitAmount !== null && Number.isFinite(item.unitAmount) && item.unitAmount >= 0,
  );
  const subtotal = priced
    ? roundInvoiceAmount(items.reduce((sum, item) => sum + item.quantity * (item.unitAmount ?? 0), 0))
    : null;
  const validTaxRate = taxRatePercent !== null && Number.isFinite(taxRatePercent) &&
    taxRatePercent >= 0 && taxRatePercent <= 100;
  const taxAmount = subtotal !== null && validTaxRate
    ? roundInvoiceAmount(subtotal * taxRatePercent / 100)
    : null;
  const total = subtotal !== null && taxAmount !== null ? roundInvoiceAmount(subtotal + taxAmount) : null;
  const normalizedPaid = Number.isFinite(paidAmount) && paidAmount >= 0 ? roundInvoiceAmount(paidAmount) : 0;
  const balance = total === null ? null : roundInvoiceAmount(total - normalizedPaid);
  const paymentStatus: WarrantyInvoiceTotals["paymentStatus"] = total === null
    ? "unpriced"
    : normalizedPaid <= 0
      ? "unpaid"
      : normalizedPaid >= total
        ? "paid"
        : "partial";
  return { subtotal, taxAmount, total, balance, paymentStatus };
}

export function filterWarrantyRecords<T extends { status: WarrantyStatus }>(
  records: readonly T[],
  query: string,
  status: WarrantyStatus | "all",
  getSearchableText: (record: T) => string = (record) => JSON.stringify(record),
) {
  const normalizedQuery = query.trim().toLowerCase();
  return records.filter((record) =>
    (status === "all" || record.status === status) &&
    (!normalizedQuery || getSearchableText(record).toLowerCase().includes(normalizedQuery)),
  );
}
