import { createHash } from "node:crypto";

/** Every seeded text id starts with this prefix, which is how the purge script recognises seeded rows. */
export const SEED_PREFIX = "seed-";
export const SEED_REASON = "Example seed data - not approved business policy";

/** Wraps a value that must be sent to PostgreSQL as JSON (jsonb) rather than as a text[] array. */
export class Json {
  constructor(public readonly value: unknown) {}
}
export const json = (value: unknown) => new Json(value);
export type Row = Record<string, unknown>;

/** Parent-before-child insertion order. The purge script walks the same set in its own safe order. */
export const TABLE_ORDER = [
  "staff_memberships", "services", "catalogue_vehicle_categories",
  "commercial_policy_versions", "commercial_policy_active", "commercial_policy_audit",
  "catalogue_grade_versions", "catalogue_grade_active", "catalogue_package_versions", "catalogue_package_active", "catalogue_audit",
  "branch_availability_versions", "branch_availability_active", "branch_availability_closures", "branch_availability_audit",
  "warranty_policies", "customers", "vehicles", "customer_branches",
  "quote_heads", "quote_versions", "quote_followups", "quote_customer_confirmations", "quote_acceptance_events", "quote_audit",
  "bookings", "jobs", "job_events", "booking_work_components", "job_work_components", "booking_occupancy", "pickup_commitments",
  "promotion_pools", "promotion_membership_verifications", "promotion_membership_verification_events",
  "promotion_qualifications", "promotion_evidence", "promotion_allocations", "promotion_evidence_consumption", "promotion_allocation_events",
  "promotion_reservations", "promotion_reservation_events", "promotion_reservation_deposit_events", "promotion_reservation_allocation_events",
  "warranties", "warranty_termination_events", "warranty_verification_tokens", "warranty_qr_print_events",
  "warranty_claims", "warranty_claim_attachments", "warranty_audit_events", "warranty_verification_settings_audit",
  "warranty_invoice_drafts", "warranty_invoice_draft_items",
  "benefit_entitlements", "benefit_windows", "benefit_redemptions", "benefit_reversals", "benefit_audit",
  "transport_requests", "transport_private_contacts", "transport_events",
  "finance_definition_attestations", "operational_money_events", "operational_money_event_reversals",
  "messaging_channels", "messaging_delivery_policies", "messaging_inbox_memberships", "messaging_inbox_access_audit",
  "messaging_customer_consents", "messaging_customer_consent_events",
  "whatsapp_conversations", "whatsapp_messages", "whatsapp_conversation_events", "whatsapp_booking_drafts",
  "messaging_contact_links", "messaging_outbox",
  "special_requests", "special_request_events",
] as const;
export type TableName = (typeof TABLE_ORDER)[number];

/** Tables whose primary key is a generated bigserial and that have no unique constraint: rows are checked by natural key before insert. */
export const NATURAL_KEYS: Partial<Record<TableName, string[]>> = {
  commercial_policy_audit: ["policy_id", "version", "action"],
  catalogue_audit: ["entity_kind", "entity_id", "version", "action"],
  quote_audit: ["quote_id", "revision", "action"],
  promotion_reservation_deposit_events: ["reservation_id", "reference"],
  promotion_reservation_allocation_events: ["reservation_id", "allocation_id", "action"],
  benefit_audit: ["entitlement_id", "action", "event_ref"],
};

export class Dataset {
  readonly tables = new Map<TableName, Row[]>();
  add(table: TableName, row: Row): Row {
    const rows = this.tables.get(table) ?? [];
    rows.push(row);
    this.tables.set(table, rows);
    return row;
  }
  rows(table: TableName): Row[] {
    return this.tables.get(table) ?? [];
  }
  counts(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const table of TABLE_ORDER) if (this.tables.get(table)?.length) result[table] = this.tables.get(table)!.length;
    return result;
  }
}

/** mulberry32: small, fast, seedable PRNG. No Math.random is used anywhere in the seeder. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float() { return this.next(); }
  int(min: number, max: number) { return min + Math.floor(this.next() * (max - min + 1)); }
  chance(probability: number) { return this.next() < probability; }
  pick<T>(items: readonly T[]): T { return items[Math.floor(this.next() * items.length)]; }
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    const total = items.reduce((sum, [, weight]) => sum + weight, 0);
    let point = this.next() * total;
    for (const [value, weight] of items) {
      point -= weight;
      if (point < 0) return value;
    }
    return items[items.length - 1][0];
  }
  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index--) {
      const other = Math.floor(this.next() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  }
}

export const pad = (value: number, width = 4) => String(value).padStart(width, "0");
export const ymd = (date: Date) => date.toISOString().slice(0, 10);
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** Same canonical form and hash as features/commercial/quote-service.ts, so seeded digests verify against the live service. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item);
export const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
export const plainHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** 43-character base64url token, the exact shape warranty-verification.ts accepts. Deterministic so lookups are testable. */
export const qrToken = (warrantyId: string) => createHash("sha256").update(`garage-os-seed-qr:${warrantyId}`).digest("base64url");
export const qrTokenHash = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

export type Money = { minor: number; currency: "EGP" };
export const egp = (pounds: number): Money => ({ minor: Math.round(pounds * 100), currency: "EGP" });
export type PolicyRef = { id: string; version: number };

export interface SeedContext {
  now: Date;
  today: string;
  environmentId: string;
  whatsappMode: "simulation" | "scenario" | "operational";
  /** Cairo local wall-clock to a UTC Date (UTC+2 approximation; only used for display-grade timestamps). */
  at(date: string, hhmm: string, extraMinutes?: number): Date;
  /** Like at(), but never later than "now" so past events cannot be dated in the future. */
  past(date: string, hhmm: string, extraMinutes?: number): Date;
  day(offset: number): string;
}

export function makeContext(now: Date, environmentId: string, whatsappMode: SeedContext["whatsappMode"]): SeedContext {
  const today = ymd(now);
  const at = (date: string, hhmm: string, extraMinutes = 0) =>
    new Date(Date.parse(`${date}T${hhmm}:00.000Z`) - 2 * 3_600_000 + extraMinutes * 60_000);
  return {
    now, today, environmentId, whatsappMode, at,
    past: (date, hhmm, extra = 0) => {
      const value = at(date, hhmm, extra);
      return value.getTime() > now.getTime() ? new Date(now.getTime() - 5 * 60_000) : value;
    },
    day: (offset) => addDays(today, offset),
  };
}
