import { useCallback, useEffect, useRef, useState } from "react";
import type { Configured, Money, PackageVersion, PolicyRef, QualificationEvidence, VehicleSelection } from "@garage/domain";
import type { Bilingual } from "./quote-logic";
import { humaniseKey, knownPolicyName, policyKey } from "./policy-names";
import { quoteApi } from "../../shared/store";
import { invalidateForMutation, useInvalidation, type InvalidationTopic } from "../../shared/invalidation";

/** GET returning null on 401/403/404 (feature unavailable for this role or not built yet); throws on other failures. */
export async function getJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
  if (response.status === 401 || response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw Object.assign(new Error(`Request failed (${response.status})`), { code: "REQUEST_FAILED" });
  return (await response.json().catch(() => null)) as T | null;
}

async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; code: string }> {
  try {
    const response = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, status: response.status, code: String((data as { code?: unknown }).code ?? "REQUEST_FAILED") };
    invalidateForMutation(url, "POST");
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, code: "WRITE_OUTCOME_UNKNOWN" };
  }
}

export interface CategoryInfo { id: string; name: Bilingual }

interface AvailablePackages { packages: PackageVersion[]; categories: CategoryInfo[] }

/** Published packages and vehicle categories for quoting staff (GET /api/catalogue/available-packages). */
export async function loadAvailablePackages(): Promise<AvailablePackages> {
  return (await getJson<AvailablePackages>("/api/catalogue/available-packages")) ?? { packages: [], categories: [] };
}

/** Vehicle categories (sedan, SUV...). */
export async function loadCategories(): Promise<CategoryInfo[]> {
  return (await loadAvailablePackages()).categories;
}

/** Published package versions. */
export async function loadPublishedPackages(): Promise<PackageVersion[]> {
  return (await loadAvailablePackages()).packages.filter((row) => row.state === "published");
}

export interface EligibleResult { packages: PackageVersion[]; missing: string[] }

export interface ResolvedVehicle { selection: VehicleSelection; packages: PackageVersion[]; missing: string[]; categoryResolved: boolean }

/** Asks the server for the vehicle's exact model/category pair, then for its eligible packages. */
export async function resolveVehicle(input: { branchId: string; vehicleId: string; serviceId: string }): Promise<ResolvedVehicle> {
  const selection = await getJson<VehicleSelection>(`/api/catalogue/vehicle-selection/${encodeURIComponent(input.vehicleId)}`);
  if (!selection) return { selection: { vehicleId: input.vehicleId, model: "", categoryId: null }, packages: [], missing: ["VEHICLE_NOT_FOUND"], categoryResolved: false };
  const result = await postJson<EligibleResult>("/api/catalogue/eligible", { branchId: input.branchId, vehicle: selection, serviceIntent: input.serviceId });
  if (!result.ok) return { selection, packages: [], missing: [result.code], categoryResolved: false };
  return { selection, packages: result.data.packages ?? [], missing: result.data.missing ?? [], categoryResolved: selection.categoryId !== null };
}

export interface AcceptanceTerms { acceptancePolicy: PolicyRef; taxTreatment: PolicyRef; validityDays: number; overrideRole: "owner" | "branch-manager" | null }

/** The active, approved quote-acceptance rule (tax + validity). null when none is configured. */
export async function loadAcceptanceTerms(): Promise<AcceptanceTerms | null> {
  const policy = await getJson<Configured<{ validityDays: number; taxTreatment: PolicyRef; overrideRole?: "owner" | "branch-manager" | null }>>("/api/commercial-policies/active/quote-acceptance").catch(() => null);
  if (policy && policy.state === "approved") return { acceptancePolicy: policy.policy, taxTreatment: policy.value.taxTreatment, validityDays: policy.value.validityDays, overrideRole: policy.value.overrideRole ?? null };
  return null;
}

export interface PromotionInfo {
  ref: PolicyRef;
  name: string;
  rule: Bilingual | null;
  evidenceKinds: QualificationEvidence["kind"][];
  maximumUnits: number | null;
  minVehicles: number;
  maxVehicles: number;
  verifierRoles: string[];
  /** Fixed discount total (null when the policy has none or it is zero). */
  discount: Money | null;
  /** Fixed discount per vehicle, when the policy allocates one. */
  perVehicle: Money | null;
  validFrom: string | null;
  validUntil: string | null;
  recipient: "customer" | "referred-customer";
  stackable: boolean;
}

const seedPromotionIds = ["seed-ultimate-club", "seed-plus-lifetime", "seed-recent-ultimate", "seed-nov-announcement", "seed-warranty-card-referral", "seed-four-cars"];

type PromotionValue = {
  evidenceKinds?: QualificationEvidence["kind"][];
  maximumUnits?: number;
  grouping?: { minimumVehicles?: number; maximumVehicles?: number };
  evidenceVerification?: { authorizedRoles?: string[] };
  beneficiaryRule?: Bilingual;
  discountAllocation?: { total?: Money; perVehicle?: Money | null };
  recipient?: { kind?: "customer" | "referred-customer" };
  stackability?: { allowed?: boolean };
};

/** Short title: our localised name when the promotion is known, else the policy id humanised. The rule sentence is a description, never the title. */
export function promotionTitle(ref: PolicyRef, lang: "ar" | "en", fallback?: Bilingual | null): string {
  const humanised = humaniseKey(policyKey(ref.id));
  return knownPolicyName(ref.id, lang) ?? (humanised || (fallback ? fallback[lang] || fallback.en : "") || (lang === "ar" ? "غير محدد" : "Not set"));
}

const positive = (money: Money | null | undefined): Money | null => (money && money.minor > 0 ? money : null);

export function toPromotion(ref: PolicyRef, value: PromotionValue, name?: Bilingual | null, lang: "ar" | "en" = "en", validity: { validFrom?: string | null; validUntil?: string | null } = {}): PromotionInfo {
  return {
    ref,
    name: promotionTitle(ref, lang, name),
    rule: value.beneficiaryRule ?? name ?? null,
    evidenceKinds: value.evidenceKinds ?? [],
    maximumUnits: value.maximumUnits ?? null,
    minVehicles: value.grouping?.minimumVehicles ?? 1,
    maxVehicles: value.grouping?.maximumVehicles ?? 1,
    verifierRoles: value.evidenceVerification?.authorizedRoles ?? [],
    discount: positive(value.discountAllocation?.total),
    perVehicle: positive(value.discountAllocation?.perVehicle),
    validFrom: validity.validFrom ?? null,
    validUntil: validity.validUntil ?? null,
    recipient: value.recipient?.kind ?? "customer",
    stackable: value.stackability?.allowed ?? false,
  };
}

/**
 * Approved promotions. Prefers GET /api/promotions (server request); falls back to probing the known
 * example promotion policies through the existing GET /api/commercial-policies/:id endpoint.
 */
export async function loadPromotions(lang: "ar" | "en"): Promise<PromotionInfo[]> {
  const listed = await getJson<unknown>("/api/promotions").catch(() => null);
  const rows = Array.isArray(listed) ? listed : Array.isArray((listed as { promotions?: unknown } | null)?.promotions) ? (listed as { promotions: unknown[] }).promotions : null;
  if (rows) {
    const out: PromotionInfo[] = [];
    for (const raw of rows as Array<Record<string, unknown>>) {
      const ref = (raw.ref ?? raw.policy) as PolicyRef | undefined;
      if (!ref || typeof ref.id !== "string" || typeof ref.version !== "number") continue;
      out.push(toPromotion(ref, (raw.value ?? raw) as PromotionValue, (raw.name as Bilingual | undefined) ?? null, lang, { validFrom: (raw.validFrom as string | null | undefined) ?? null, validUntil: (raw.validUntil as string | null | undefined) ?? null }));
    }
    return out;
  }
  const found = await Promise.all(seedPromotionIds.map(async (key) => {
    const policy = await getJson<Configured<PromotionValue>>(`/api/commercial-policies/promotion-qualification:${key}`).catch(() => null);
    return policy && policy.state === "approved" ? toPromotion(policy.policy, policy.value, null, lang) : null;
  }));
  return found.filter((item): item is PromotionInfo => item !== null);
}

export interface AsyncList<T> { data: T; loading: boolean; error: string | null; reload: () => void }

/** Loads on mount and whenever `reload` is called. Keeps the previous data while reloading. */
export function useLoader<T>(load: () => Promise<T>, initial: T, describe: (error: unknown) => string, topics: readonly InvalidationTopic[] = []): AsyncList<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  const describeRef = useRef(describe);
  loadRef.current = load;
  describeRef.current = describe;
  const run = useCallback(() => {
    let live = true;
    setLoading(true);
    loadRef.current().then((value) => { if (live) { setData(value); setError(null); } })
      .catch((reason) => { if (live) setError(describeRef.current(reason)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  useEffect(() => run(), [run]);
  const reload = () => { run(); };
  useInvalidation(topics, reload);
  return { data, loading, error, reload };
}

/** Accepted quotes (the only quotes that can be reserved or carry benefits). */
export async function loadAcceptedQuotes() {
  const rows = await quoteApi.list();
  return rows.filter((row) => row.state === "accepted");
}
