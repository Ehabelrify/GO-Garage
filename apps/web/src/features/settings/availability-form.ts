export interface Closure { date: string; reason: string }

export interface AvailabilityForm {
  version: number;
  timezone: string;
  opensAt: string;
  closesAt: string;
  workingWeekdays: number[];
  slotMinutes: string;
  dailyIntakeLimit: string;
  cleanBays: string;
  generalBays: string;
  effectiveFrom: string;
  closures: Closure[];
  reason: string;
}

export const blankAvailability: AvailabilityForm = {
  version: 0, timezone: "", opensAt: "", closesAt: "", workingWeekdays: [], slotMinutes: "", dailyIntakeLimit: "",
  cleanBays: "", generalBays: "", effectiveFrom: "", closures: [], reason: "",
};

/** Maps the GET /api/availability/config/:branch response onto the form. */
export function availabilityFromApi(data: Record<string, any>): AvailabilityForm {
  if (!data || data.status === "unconfigured") return { ...blankAvailability };
  return {
    version: Number(data.version ?? 0),
    timezone: String(data.timezone ?? ""),
    opensAt: String(data.opensAt ?? "").slice(0, 5),
    closesAt: String(data.closesAt ?? "").slice(0, 5),
    workingWeekdays: Array.isArray(data.workingWeekdays) ? data.workingWeekdays.map(Number) : [],
    slotMinutes: String(data.slotMinutes ?? ""),
    dailyIntakeLimit: String(data.dailyIntakeLimit ?? ""),
    cleanBays: String(data.bayCounts?.clean ?? ""),
    generalBays: String(data.bayCounts?.general ?? ""),
    effectiveFrom: String(data.effectiveFrom ?? "").slice(0, 10),
    closures: (Array.isArray(data.closures) ? data.closures : []).map((closure: { closed_date: string; reason: string }) => ({
      date: String(closure.closed_date).slice(0, 10), reason: String(closure.reason ?? ""),
    })),
    reason: "",
  };
}

/** Fully blank rows are ignored. Returns null when a kept row is incomplete. */
export function cleanClosures(closures: Closure[]): Closure[] | null {
  const kept = closures.map((row) => ({ date: row.date.trim(), reason: row.reason.trim() })).filter((row) => row.date || row.reason);
  return kept.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.reason) ? kept : null;
}

/** Same body shape the existing PUT endpoint accepts. Null when closures are incomplete. */
export function availabilityPayload(form: AvailabilityForm) {
  const closures = cleanClosures(form.closures);
  if (!closures) return null;
  return {
    expectedVersion: form.version,
    timezone: form.timezone.trim(),
    opensAt: form.opensAt,
    closesAt: form.closesAt,
    workingWeekdays: [...form.workingWeekdays].sort((a, b) => a - b),
    closures,
    slotMinutes: Number(form.slotMinutes),
    dailyIntakeLimit: Number(form.dailyIntakeLimit),
    bayCounts: { clean: Number(form.cleanBays), general: Number(form.generalBays) },
    effectiveFrom: form.effectiveFrom,
    reason: form.reason.trim(),
  };
}

export function availabilityComplete(form: AvailabilityForm): boolean {
  return Boolean(form.timezone.trim() && form.opensAt && form.closesAt && form.slotMinutes && form.dailyIntakeLimit
    && form.cleanBays !== "" && form.generalBays !== "" && form.effectiveFrom && form.reason.trim() && form.workingWeekdays.length);
}
