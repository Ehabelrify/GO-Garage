import {
  Dataset, Rng, addDays, pad, weekday, type Money, type PolicyRef, type SeedContext,
} from "./seed-core";
import type { CustomerRec, VehicleRec } from "./seed-people";
import {
  CLOSURES, SERVICES, serviceById, type PackageDef, type PromoKey, type Reference, type ScopeItem, type WorkComponent,
} from "./seed-reference";

export interface Product {
  kind: "legacy" | "package";
  serviceId: string;
  pkg: PackageDef | null;
  priceEgp: number;
  warrantyPolicyId: string | null;
  label: { en: string; ar: string };
  promoKey: PromoKey | null;
  gradeKey: string | null;
}

export interface QuoteVersionRec {
  revision: number;
  state: "draft" | "offered" | "accepted" | "superseded" | "cancelled";
  offeredOn: string;
  validThrough: string | null;
  digest: string;
}

export interface QuoteRec {
  id: string;
  customer: CustomerRec;
  vehicle: VehicleRec;
  branchId: string;
  pkg: PackageDef;
  revision: number;
  state: "draft" | "offered" | "accepted" | "cancelled";
  offeredOn: string;
  acceptedOn: string | null;
  acceptedAt: Date | null;
  validThrough: string | null;
  digest: string;
  total: Money;
  scope: ScopeItem[];
  work: WorkComponent[];
  warrantyBindings: Array<{ componentId: string; policy: PolicyRef; issuanceAuthority: PolicyRef }>;
  benefitBindings: PolicyRef[];
  evidenceRef: string | null;
  accepted: unknown | null;
  discountMinor: number;
  manual: boolean;
  chatId: string | null;
}

export interface ReservationRec {
  id: string;
  quote: QuoteRec;
  promoKey: PromoKey | "referral";
  status: "enquiry" | "reserved" | "scheduled" | "redeemed" | "cancelled" | "expired";
  depositMinor: number;
  depositRecorded: boolean;
  depositMoneyEventId: string | null;
  allocationId: string | null;
}

export interface WarrantyRec {
  id: string;
  visit: VisitRec;
  policyId: string;
  policyVersion: number;
  kind: "fixed" | "lifetime";
  componentId: string | null;
  serviceId: string;
  startDate: string;
  expiresOn: string | null;
  status: "active" | "void";
  invoiceId: string;
  issuedAt: Date;
  issuedBy: string;
  activeToken: string | null;
  priceMinor: number;
  terminatedOn: string | null;
}

export interface ChatSpec {
  id: string;
  customer: CustomerRec;
  vehicle: VehicleRec;
  branchId: string;
  startAt: Date;
  quote: QuoteRec | null;
  visit: VisitRec | null;
  kind: "booking" | "quote" | "enquiry" | "special" | "followup" | "claim";
  special?: string;
  warranty?: WarrantyRec | null;
}

export interface VisitRec {
  n: number;
  id: string;
  jobId: string | null;
  customer: CustomerRec;
  vehicle: VehicleRec;
  branchId: string;
  product: Product;
  date: string;
  time: string;
  pickup: string;
  days: string[];
  status: "pending" | "confirmed" | "cancelled" | "no-show";
  stage: "booked" | "received" | "in-service" | "qc" | "ready" | "delivered" | "cancelled" | "no-show" | null;
  deliveredDate: string | null;
  deliveredAt: Date | null;
  technician: string | null;
  createdAt: Date;
  createdBy: string;
  quote: QuoteRec | null;
  reservation: ReservationRec | null;
  chat: ChatSpec | null;
  rich: boolean;
  saleMinor: number;
  paidMinor: number;
  depositMinor: number;
  warranties: WarrantyRec[];
  transportId: string | null;
}

export interface World {
  ds: Dataset;
  ctx: SeedContext;
  rng: Rng;
  ref: Reference;
  customers: CustomerRec[];
  seq: Map<string, number>;
  cap: Map<string, { intake: number; minutes: Map<string, number> }>;
  visits: VisitRec[];
  quotes: QuoteRec[];
  warranties: WarrantyRec[];
  reservations: ReservationRec[];
  chats: ChatSpec[];
  promoUse: Map<string, { reserved: number; consumed: number }>;
  referralUsed: Set<string>;
  moneySeq: number;
  moneyReverseCandidates: string[];
  /** Fill factor for bay capacity: bulk history leaves headroom so curated scenes can always be placed. */
  capFactor: number;
  intakeReserve: number;
  /** Dates of every visit per vehicle ("v:id") and customer ("c:id"), so the generator never books the same car or person twice in a short window. */
  vehicleDates: Map<string, string[]>;
  /** Vehicles that already had a full-film (PPF) job: the same car does not get a second full film in the demo year. */
  ppfVehicles: Set<string>;
}

/** True when the key ("v:<vehicle id>" or "c:<customer id>") has no other visit within +/- windowDays of the date. */
export const slotFree = (world: World, key: string, date: string, windowDays = 10) =>
  !(world.vehicleDates.get(key) ?? []).some((other) => Math.abs(Date.parse(`${other}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) < windowDays * 86_400_000);

export const nextId = (world: World, key: string, width = 4) => {
  const value = (world.seq.get(key) ?? 0) + 1;
  world.seq.set(key, value);
  return `seed-${key}-${pad(value, width)}`;
};

export const closureDates = new Set(CLOSURES.map(([date]) => date));
export const isWorkingDay = (date: string) => weekday(date) !== 5 && !closureDates.has(date);
export function nextWorkingDay(date: string): string {
  let day = date;
  while (!isWorkingDay(day)) day = addDays(day, 1);
  return day;
}

export const BAY_COUNTS: Record<string, Record<string, number>> = {
  "branch-a": { clean: 2, general: 4 },
  "branch-b": { clean: 1, general: 3 },
};
export const INTAKE_LIMIT: Record<string, number> = { "branch-a": 8, "branch-b": 6 };
export const DAY_MINUTES = 540;

export interface Demand { bayType: "clean" | "general"; minutes: number; days: number }
export function demandOf(product: Product): Demand[] {
  const services = product.pkg ? product.pkg.work.map((component) => component.serviceId) : [product.serviceId];
  return services.map((serviceId) => {
    const occ = serviceById(serviceId).occ ?? { bayType: "general" as const, minutes: 120, days: 1 };
    return { bayType: occ.bayType, minutes: occ.minutes, days: occ.days };
  });
}

/** Working days a demand list occupies, and per-day per-bay minutes (same summing rule as availability-service occupancyByDay). */
export function occupancyPlan(startDate: string, demand: Demand[]) {
  const dayList: string[] = [];
  const maxDays = Math.max(...demand.map((item) => item.days));
  let cursor = startDate;
  for (let index = 0; index < maxDays; index++) {
    cursor = nextWorkingDay(cursor);
    dayList.push(cursor);
    cursor = addDays(cursor, 1);
  }
  const perDay = new Map<string, Map<string, number>>();
  for (const item of demand) {
    for (let index = 0; index < item.days; index++) {
      const bays = perDay.get(dayList[index]) ?? new Map<string, number>();
      bays.set(item.bayType, (bays.get(item.bayType) ?? 0) + item.minutes);
      perDay.set(dayList[index], bays);
    }
  }
  return { dayList, perDay };
}

export function tryPlace(world: World, branchId: string, date: string, demand: Demand[]) {
  const plan = occupancyPlan(date, demand);
  if (plan.dayList[0] !== date) return null;
  for (const [day, bays] of plan.perDay) {
    const slot = world.cap.get(`${branchId}:${day}`);
    if (day === date && (slot?.intake ?? 0) >= INTAKE_LIMIT[branchId] - world.intakeReserve) return null;
    for (const [bay, minutes] of bays) {
      const used = slot?.minutes.get(bay) ?? 0;
      if (used + minutes > BAY_COUNTS[branchId][bay] * DAY_MINUTES * world.capFactor) return null;
    }
  }
  return plan;
}

export function reserveCapacity(world: World, branchId: string, plan: ReturnType<typeof occupancyPlan>) {
  for (const [day, bays] of plan.perDay) {
    const key = `${branchId}:${day}`;
    const slot = world.cap.get(key) ?? { intake: 0, minutes: new Map<string, number>() };
    if (day === plan.dayList[0]) slot.intake += 1;
    for (const [bay, minutes] of bays) slot.minutes.set(bay, (slot.minutes.get(bay) ?? 0) + minutes);
    world.cap.set(key, slot);
  }
}

export const bayLabel = (serviceId: string) => serviceById(serviceId).bayType;
export const allServiceIds = SERVICES.map((service) => service.id);
