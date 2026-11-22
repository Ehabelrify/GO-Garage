import type { GradeVersion, PackageVersion, ScopeItem } from "@garage/domain";

export type Category = { id: string; name: { ar: string; en: string } };

/** Newest version per record id (input is newest-first, as served). */
export function latestById<T extends { ref: { id: string; version: number } }>(items: T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const item of items) {
    const current = latest.get(item.ref.id);
    if (!current || item.ref.version > current.ref.version) latest.set(item.ref.id, item);
  }
  return latest;
}

/** All versions of one record, newest first. */
export function historyOf<T extends { ref: { id: string; version: number } }>(items: T[], id: string): T[] {
  return items.filter((item) => item.ref.id === id).sort((a, b) => b.ref.version - a.ref.version);
}

export type Confirmation = "confirmed" | "advertised";

/** A price is confirmed only when it has an approved policy and owner approval; otherwise it is an advertised example. */
export function confirmation(p: Pick<PackageVersion, "price" | "approval">): Confirmation {
  return p.price.state === "approved" && p.approval !== null ? "confirmed" : "advertised";
}

export function priceMinor(p: Pick<PackageVersion, "price">): { minor: number; currency: string } | null {
  return p.price.state === "approved" ? { minor: p.price.value.minor, currency: p.price.value.currency } : null;
}

export type RoofState = "included" | "excluded" | "mixed" | "not-applicable";

export function roofState(scope: Pick<ScopeItem, "roof">[]): RoofState {
  const set = new Set(scope.map((item) => item.roof).filter((roof) => roof !== "not-applicable"));
  if (set.size === 0) return "not-applicable";
  if (set.size > 1) return "mixed";
  return set.has("included") ? "included" : "excluded";
}

export type MatrixRow = {
  id: string;
  pkg: PackageVersion;
  roof: RoofState;
  /** categoryId -> price, or null when the package does not apply / has no approved price. */
  cells: Record<string, { minor: number; currency: string } | null>;
  appliesTo: Record<string, boolean>;
};

/** Package x vehicle-category price matrix over the latest non-retired versions. */
export function priceMatrix(packages: PackageVersion[], categories: Category[]): MatrixRow[] {
  return packages
    .filter((p) => p.state !== "retired")
    .map((pkg) => {
      const price = priceMinor(pkg);
      const cells: MatrixRow["cells"] = {};
      const appliesTo: MatrixRow["appliesTo"] = {};
      for (const category of categories) {
        const applies = pkg.vehicleCategoryIds.includes(category.id);
        appliesTo[category.id] = applies;
        cells[category.id] = applies ? price : null;
      }
      return { id: pkg.ref.id, pkg, roof: roofState(pkg.scope), cells, appliesTo };
    });
}

export type AddOnRow = { serviceId: string; packageIds: string[] };

/** Add-on services referenced by package scope items, with the packages that offer them. */
export function addOnUsage(packages: PackageVersion[]): AddOnRow[] {
  const map = new Map<string, Set<string>>();
  for (const pkg of packages) {
    if (pkg.state === "retired") continue;
    for (const item of pkg.scope) for (const id of item.addOnIds) {
      if (!map.has(id)) map.set(id, new Set());
      map.get(id)!.add(pkg.ref.id);
    }
  }
  return [...map.entries()].map(([serviceId, ids]) => ({ serviceId, packageIds: [...ids] }));
}

export function toggleId(list: string[], id: string, on: boolean): string[] {
  const without = list.filter((item) => item !== id);
  return on ? [...without, id] : without;
}

export const evidencePattern = /^private:[A-Za-z0-9/_-]+$/;

/** Returns the first missing item for publication approval, or null when ready. */
export function approvalGap(evidenceRef: string, reason: string): "evidence" | "reason" | null {
  if (!evidencePattern.test(evidenceRef.trim())) return "evidence";
  if (!reason.trim()) return "reason";
  return null;
}

export function gradeLabel(grade: Pick<GradeVersion, "name">, lang: "ar" | "en"): string {
  return grade.name[lang] || grade.name.en || grade.name.ar;
}

export const splitLines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);

export type OccupancyOption = { key: string; ref: { id: string; version: number }; services: string[] };

/** Distinct work-duration rules already used by packages, so they can be picked instead of typed. */
export function occupancyOptions(packages: PackageVersion[]): OccupancyOption[] {
  const map = new Map<string, OccupancyOption>();
  for (const pkg of packages) for (const work of pkg.work) {
    const { id, version } = work.occupancyRule;
    if (!id) continue;
    const key = `${id}:${version}`;
    const entry = map.get(key) ?? { key, ref: { id, version }, services: [] };
    if (!entry.services.includes(work.serviceId)) entry.services.push(work.serviceId);
    map.set(key, entry);
  }
  return [...map.values()];
}

/** Fills sensible defaults before saving: work steps inherit the first service and cover every scope item when left blank. */
export function normaliseDraft(draft: PackageVersion): PackageVersion {
  const firstService = draft.scope[0]?.serviceId ?? "";
  const allScope = draft.scope.map((item) => item.id);
  return {
    ...draft,
    name: { en: draft.name.en.trim(), ar: draft.name.ar.trim() },
    work: draft.work.map((w) => ({
      ...w,
      serviceId: w.serviceId || firstService,
      scopeItemIds: w.scopeItemIds.length ? w.scopeItemIds : allScope,
    })),
  };
}

/** Field errors keyed for PackageForm; empty object means valid. Messages are [en, ar]. */
export function validateDraft(draft: PackageVersion): Record<string, [string, string]> {
  const errors: Record<string, [string, string]> = {};
  if (!draft.name.en.trim()) errors.nameEn = ["Enter the English name.", "أدخل الاسم بالإنجليزية."];
  if (!draft.name.ar.trim()) errors.nameAr = ["Enter the Arabic name.", "أدخل الاسم بالعربية."];
  if (!draft.vehicleCategoryIds.length) errors.categories = ["Choose at least one category.", "اختر فئة واحدة على الأقل."];
  if (!draft.branchIds.length) errors.branches = ["Choose at least one branch.", "اختر فرعاً واحداً على الأقل."];
  draft.scope.forEach((item, index) => { if (!item.serviceId) errors[`scope${index}`] = ["Choose a service.", "اختر خدمة."]; });
  draft.work.forEach((item, index) => { if (!item.occupancyRule.id.trim()) errors[`work${index}`] = ["Choose a duration rule.", "اختر قاعدة المدة."]; });
  return errors;
}

export function isPublishable(p: Pick<PackageVersion, "price" | "tax" | "workAggregation">): boolean {
  return p.price.state === "approved" && p.tax.state === "approved" && p.workAggregation.state === "approved";
}

export type PackageSegment = "package" | "offer" | "unconfirmed";

/**
 * Where a catalogue row belongs in the list. Marketing announcements and promotional bundles are "offer";
 * drafts with no approved price (unconfirmed services such as wrapping) are "unconfirmed"; the rest are real packages.
 */
export function packageSegment(p: Pick<PackageVersion, "ref" | "kind" | "state" | "price" | "provenance">): PackageSegment {
  if (/(^|[-_:])promo([-_:]|$)/i.test(p.ref.id) || /announcement/i.test(p.provenance)) return "offer";
  if (p.kind === "standalone" && p.state === "draft" && p.price.state !== "approved") return "unconfirmed";
  return "package";
}

export function segmentCounts(packages: Array<Parameters<typeof packageSegment>[0]>): Record<PackageSegment, number> {
  const counts: Record<PackageSegment, number> = { package: 0, offer: 0, unconfirmed: 0 };
  for (const item of packages) counts[packageSegment(item)] += 1;
  return counts;
}
