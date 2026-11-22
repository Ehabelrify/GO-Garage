import { formatPlateDisplay } from "@garage/domain";

/** Pure reminder rules: due calculation, dedupe keys, consent decision and template rendering. No I/O. */

export const reminderKinds = [
  "booking_day_before", "booking_morning_of", "ready_for_pickup", "warranty_expiry", "quote_followup", "post_service_checkin",
] as const;
export type ReminderKind = (typeof reminderKinds)[number];
export type ReminderLang = "ar" | "en";
export type StoredStatus = "due" | "sent-simulated" | "skipped" | "cancelled";
export type DisplayStatus = "due" | "upcoming" | "snoozed" | StoredStatus;

export const isReminderKind = (value: unknown): value is ReminderKind => typeof value === "string" && (reminderKinds as readonly string[]).includes(value);

/** Reminders are generated this long before they are due so staff can see what is coming ("upcoming"). */
export const HORIZON_MS = 36 * 3_600_000;
/** A delivered job older than this (after its lead time) never gets a check-in. */
export const CHECKIN_LOOKBACK_DAYS = 14;
export const DAY_MS = 86_400_000;

export interface RuleConfig {
  kind: ReminderKind;
  enabled: boolean;
  leadDays: number;
  autoSend: boolean;
  templateEn: string;
  templateAr: string;
  revision: number;
}

export const placeholdersByKind: Record<ReminderKind, readonly string[]> = {
  booking_day_before: ["name", "plate", "branch", "service", "date", "time"],
  booking_morning_of: ["name", "plate", "branch", "service", "date", "time"],
  ready_for_pickup: ["name", "plate", "branch", "service"],
  warranty_expiry: ["name", "plate", "branch", "service", "expiry"],
  quote_followup: ["name", "plate", "branch"],
  post_service_checkin: ["name", "plate", "branch", "service"],
};

/** Inclusive lead-time limits in days (min equals max where the lead time is fixed). */
export const leadLimits: Record<ReminderKind, { min: number; max: number }> = {
  booking_day_before: { min: 1, max: 7 },
  booking_morning_of: { min: 0, max: 0 },
  ready_for_pickup: { min: 0, max: 0 },
  warranty_expiry: { min: 1, max: 180 },
  quote_followup: { min: 1, max: 60 },
  post_service_checkin: { min: 1, max: 60 },
};

export const TEMPLATE_MAX = 1000;

export const defaultRules: Record<ReminderKind, Omit<RuleConfig, "kind" | "revision">> = {
  booking_day_before: {
    enabled: true, leadDays: 1, autoSend: false,
    templateEn: "Hello {name}, a reminder that your car {plate} is booked at {branch} on {date} at {time} for {service}. Reply here if you need to change the time.",
    templateAr: "أهلاً {name}، تذكير بموعد عربيتك {plate} في {branch} يوم {date} الساعة {time} لخدمة {service}. لو محتاج تغيّر الموعد رد علينا هنا.",
  },
  booking_morning_of: {
    enabled: true, leadDays: 0, autoSend: false,
    templateEn: "Good morning {name}. Today is your drop-off at {branch} for {service} at {time}. See you soon.",
    templateAr: "صباح الخير {name}. النهاردة موعد تسليم عربيتك في {branch} لخدمة {service} الساعة {time}. في انتظارك.",
  },
  ready_for_pickup: {
    enabled: true, leadDays: 0, autoSend: false,
    templateEn: "Hello {name}, your car {plate} is ready for pickup at {branch}. The {service} work is complete.",
    templateAr: "أهلاً {name}، عربيتك {plate} جاهزة للاستلام في {branch}. شغل {service} خلص.",
  },
  warranty_expiry: {
    enabled: true, leadDays: 30, autoSend: false,
    templateEn: "Hello {name}, the warranty on your car {plate} ({service}) ends on {expiry}. Contact us if you would like it checked before then.",
    templateAr: "أهلاً {name}، ضمان عربيتك {plate} ({service}) هينتهي يوم {expiry}. تواصل معانا لو حابب نفحصها قبل كده.",
  },
  quote_followup: {
    enabled: true, leadDays: 3, autoSend: false,
    templateEn: "Hello {name}, we sent you a quote for your car {plate}. Do you have any questions, or would you like to go ahead?",
    templateAr: "أهلاً {name}، بعتنالك عرض سعر لعربيتك {plate}. عندك أي سؤال، أو حابب نبدأ؟",
  },
  post_service_checkin: {
    enabled: true, leadDays: 7, autoSend: false,
    templateEn: "Hello {name}, how is your car {plate} after the {service}? Tell us if anything needs a look.",
    templateAr: "أهلاً {name}، عربيتك {plate} عاملة إيه بعد {service}؟ قولنا لو في أي حاجة محتاجة نشوفها.",
  },
};

export function defaultRule(kind: ReminderKind): RuleConfig {
  return { kind, revision: 0, ...defaultRules[kind] };
}

export interface StoredRule {
  kind: string; enabled: boolean; lead_days: number; auto_send: boolean; template_en: string; template_ar: string; revision: number;
}

/** Stored rows override code defaults; a kind without a row uses its default (revision 0). Always returns every kind in order. */
export function mergeRules(rows: StoredRule[]): RuleConfig[] {
  const byKind = new Map(rows.filter((row) => isReminderKind(row.kind)).map((row) => [row.kind as ReminderKind, row]));
  return reminderKinds.map((kind) => {
    const row = byKind.get(kind);
    return row
      ? { kind, enabled: row.enabled, leadDays: row.lead_days, autoSend: row.auto_send, templateEn: row.template_en, templateAr: row.template_ar, revision: row.revision }
      : defaultRule(kind);
  });
}

// ---------- Templates ----------

const PLACEHOLDER = /\{([a-z_]+)\}/g;

/** Placeholders used in a template that the rule kind does not provide. */
export function unknownPlaceholders(kind: ReminderKind, template: string): string[] {
  const allowed = placeholdersByKind[kind];
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) if (!allowed.includes(match[1])) found.add(match[1]);
  return [...found];
}

/** Replaces {placeholders}. A provided value is inserted as is; an unknown placeholder is left untouched. */
export function renderTemplate(template: string, vars: Partial<Record<string, string>>): string {
  return template.replace(PLACEHOLDER, (whole, key: string) => (key in vars ? vars[key] ?? "" : whole)).replace(/[ \t]{2,}/g, " ").trim();
}

export type TemplateProblem = "EMPTY_TEMPLATE" | "TEMPLATE_TOO_LONG" | "UNKNOWN_PLACEHOLDER";
export function templateProblem(kind: ReminderKind, template: string): TemplateProblem | null {
  const text = template.trim();
  if (!text) return "EMPTY_TEMPLATE";
  if (text.length > TEMPLATE_MAX) return "TEMPLATE_TOO_LONG";
  return unknownPlaceholders(kind, text).length ? "UNKNOWN_PLACEHOLDER" : null;
}

// ---------- Dates (Africa/Cairo) ----------

const CAIRO = "Africa/Cairo";
const dateParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: CAIRO, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { y: pick("year"), m: pick("month"), d: pick("day"), h: pick("hour"), min: pick("minute"), s: pick("second") };
};
const offsetMinutes = (date: Date) => {
  const p = dateParts(date);
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
};

/** Calendar date (YYYY-MM-DD) in Cairo at the given instant. */
export function cairoDate(date: Date): string {
  const p = dateParts(date);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The instant at which Cairo wall-clock reads `day` hh:mm (handles the summer-time offset). */
export function cairoToUtc(day: string, hour: number, minute = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  let instant = wall - offsetMinutes(new Date(wall)) * 60_000;
  instant = wall - offsetMinutes(new Date(instant)) * 60_000;
  return new Date(instant);
}

// ---------- Candidates ----------

export interface TemplateVars { name: string; plate: string; branch: string; service: string; date: string; time: string; expiry: string }

export interface Candidate {
  kind: ReminderKind;
  dedupeKey: string;
  branchId: string;
  customerId: string;
  vehicleId: string | null;
  bookingId: string | null;
  jobId: string | null;
  warrantyId: string | null;
  quoteId: string | null;
  sourceDate: string | null;
  sourceRevision: number | null;
  dueAt: Date;
  language: ReminderLang;
  hasConsent: boolean;
  vars: Record<ReminderLang, TemplateVars>;
}

export interface BaseRow {
  branch_id: string; customer_id: string; vehicle_id: string | null; customer_name: string; plate: string | null;
  language: string; has_consent: boolean; branch_en: string; branch_ar: string; service_en?: string | null; service_ar?: string | null;
}
export interface BookingRow extends BaseRow { booking_id: string; dropoff_date: string; dropoff_time: string }
export interface JobRow extends BaseRow { booking_id: string; job_id: string; at: Date }
export interface WarrantyRow extends BaseRow { warranty_id: string; expires_on: string }
export interface QuoteRow extends BaseRow { quote_id: string; revision: number; offered_at: Date; valid_through: string | null }

const lang = (value: string): ReminderLang => (value === "en" ? "en" : "ar");
const withinHorizon = (dueAt: Date, now: Date) => dueAt.getTime() <= now.getTime() + HORIZON_MS;

function base(kind: ReminderKind, row: BaseRow, dedupeKey: string, dueAt: Date, extra: Partial<Candidate>, vars: Partial<TemplateVars>): Candidate {
  const plate = row.plate ? formatPlateDisplay(row.plate) : "";
  const make = (l: ReminderLang): TemplateVars => ({
    name: row.customer_name, plate, branch: l === "ar" ? row.branch_ar : row.branch_en,
    service: (l === "ar" ? row.service_ar || row.service_en : row.service_en || row.service_ar) ?? "", date: "", time: "", expiry: "", ...vars,
  });
  return {
    kind, dedupeKey, branchId: row.branch_id, customerId: row.customer_id, vehicleId: row.vehicle_id, bookingId: null, jobId: null, warrantyId: null, quoteId: null,
    sourceDate: null, sourceRevision: null, dueAt, language: lang(row.language), hasConsent: row.has_consent, vars: { en: make("en"), ar: make("ar") }, ...extra,
  };
}

/** Booking reminders. Day-before skips a booking that is today or earlier; morning-of skips past days. */
export function bookingCandidate(kind: "booking_day_before" | "booking_morning_of", row: BookingRow, rule: RuleConfig, now: Date): Candidate | null {
  const today = cairoDate(now);
  if (kind === "booking_day_before" ? row.dropoff_date <= today : row.dropoff_date < today) return null;
  const dueAt = cairoToUtc(addDays(row.dropoff_date, -rule.leadDays), kind === "booking_day_before" ? 9 : 8);
  if (!withinHorizon(dueAt, now)) return null;
  return base(kind, row, `${kind}:${row.booking_id}:${row.dropoff_date}`, dueAt,
    { bookingId: row.booking_id, sourceDate: row.dropoff_date }, { date: row.dropoff_date, time: row.dropoff_time.slice(0, 5) });
}

export function readyCandidate(row: JobRow, rule: RuleConfig, now: Date): Candidate | null {
  const dueAt = new Date(row.at.getTime() + rule.leadDays * DAY_MS);
  if (!withinHorizon(dueAt, now)) return null;
  return base("ready_for_pickup", row, `ready_for_pickup:${row.job_id}`, dueAt, { bookingId: row.booking_id, jobId: row.job_id }, {});
}

export function checkinCandidate(row: JobRow, rule: RuleConfig, now: Date): Candidate | null {
  const dueAt = new Date(row.at.getTime() + rule.leadDays * DAY_MS);
  if (!withinHorizon(dueAt, now) || dueAt.getTime() < now.getTime() - CHECKIN_LOOKBACK_DAYS * DAY_MS) return null;
  return base("post_service_checkin", row, `post_service_checkin:${row.job_id}`, dueAt, { bookingId: row.booking_id, jobId: row.job_id }, {});
}

/** Fixed warranties only; a lifetime warranty has no expiry date so it never reaches this function. */
export function warrantyCandidate(row: WarrantyRow, rule: RuleConfig, now: Date): Candidate | null {
  if (!row.expires_on || row.expires_on < cairoDate(now)) return null;
  const dueAt = cairoToUtc(addDays(row.expires_on, -rule.leadDays), 9);
  if (!withinHorizon(dueAt, now)) return null;
  return base("warranty_expiry", row, `warranty_expiry:${row.warranty_id}:${row.expires_on}`, dueAt,
    { warrantyId: row.warranty_id, sourceDate: row.expires_on }, { expiry: row.expires_on });
}

/** An offered quote that nobody answered; a quote past its validity is not chased. */
export function quoteCandidate(row: QuoteRow, rule: RuleConfig, now: Date): Candidate | null {
  if (row.valid_through && row.valid_through < cairoDate(now)) return null;
  const dueAt = new Date(row.offered_at.getTime() + rule.leadDays * DAY_MS);
  if (!withinHorizon(dueAt, now)) return null;
  return base("quote_followup", row, `quote_followup:${row.quote_id}:${row.revision}`, dueAt, { quoteId: row.quote_id, sourceRevision: row.revision }, {});
}

/** Consent decides the first state: no service consent means skipped, with a visible reason. */
export function initialState(hasConsent: boolean): { status: "due" | "skipped"; reason: string | null } {
  return hasConsent ? { status: "due", reason: null } : { status: "skipped", reason: "no-consent" };
}

export function renderCandidate(candidate: Candidate, rule: RuleConfig): string {
  const template = candidate.language === "en" ? rule.templateEn : rule.templateAr;
  return renderTemplate(template, { ...candidate.vars[candidate.language] });
}

export function displayStatus(row: { status: StoredStatus; due_at: Date | string; snoozed_until: Date | string | null }, now: Date): DisplayStatus {
  if (row.status !== "due") return row.status;
  if (row.snoozed_until && new Date(row.snoozed_until).getTime() > now.getTime()) return "snoozed";
  return new Date(row.due_at).getTime() > now.getTime() ? "upcoming" : "due";
}

export const snoozeChoices = [1, 2, 3, 7] as const;
