import type { Locale, PackageVersion, PolicyRef, QuoteDraftInput, QuoteLine, ScopeItem, VehicleSelection, WorkComponent } from "@garage/domain";
import { buildCatalogueLines, isOfferable, splitList, type Bilingual } from "./quote-logic";

export const DEFAULT_CURRENCY = "EGP";

/** One row of the custom-price editor (a work item plus its price line). Amounts are typed in major units. */
export interface CustomItem {
  id: string;
  serviceId: string;
  quantity: number;
  roof: ScopeItem["roof"];
  addOnIds: string[];
  areas: string;
  exclusions: string;
  unitPrice: string;
  tax: string;
}

export function blankItem(id: string, serviceId = ""): CustomItem {
  return { id, serviceId, quantity: 1, roof: "not-applicable", addOnIds: [], areas: "", exclusions: "", unitPrice: "", tax: "0" };
}

const minorText = (minor: number) => {
  const major = minor / 100;
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
};

/** Rebuilds editable rows from a saved quote (so "Revise" opens with the old values). */
export function itemsFromInput(input: Pick<QuoteDraftInput, "scope" | "lines">): CustomItem[] {
  return input.scope.map((scope) => {
    const line = input.lines.find((entry) => entry.scopeItemId === scope.id);
    return {
      id: scope.id,
      serviceId: scope.serviceId,
      quantity: scope.quantity,
      roof: scope.roof,
      addOnIds: [...scope.addOnIds],
      areas: scope.areas.join(", "),
      exclusions: scope.exclusions.join(", "),
      unitPrice: line && line.unitPrice.minor > 0 ? minorText(line.unitPrice.minor) : "",
      tax: line?.tax ? minorText(line.tax.minor) : "",
    };
  });
}

/** Parses a typed major amount ("1,250.50") to minor units; "" gives null; invalid gives NaN. */
export function parseMajor(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  return Math.round(Number(cleaned) * 100);
}

export type BuildError =
  | "no-customer" | "no-vehicle" | "no-branch" | "no-package" | "package-price"
  | "item-service" | "item-quantity" | "item-price" | "item-tax" | "no-occupancy" | "reason" | "terms" | "valid-through";

export interface BuildParams {
  base: QuoteDraftInput | null;
  branchId: string;
  customerId: string;
  vehicle: VehicleSelection | null;
  mode: "catalogue" | "manual" | "inspection";
  pkg: PackageVersion | null;
  items: CustomItem[];
  terms: { acceptancePolicy: PolicyRef; taxTreatment: PolicyRef } | null;
  validThrough: string | null;
  reason: string;
  actorId: string;
  occupancyFor: (serviceId: string) => PolicyRef | null;
  state: "draft" | "offered";
  newId: (prefix: string) => string;
  /** Currency for custom lines; defaults to the base quote's currency, then EGP. */
  currency?: string;
}

/** Pure translation of the friendly form into the exact payload the server validates. */
export function buildDraftInput(p: BuildParams): { input: QuoteDraftInput } | { error: BuildError } {
  const offered = p.state === "offered";
  if (!p.branchId) return { error: "no-branch" };
  if (!p.customerId) return { error: "no-customer" };
  if (!p.vehicle || !p.vehicle.vehicleId || !p.vehicle.model) return { error: "no-vehicle" };
  if (offered && !p.terms) return { error: "terms" };
  if (offered && !p.validThrough) return { error: "valid-through" };
  const common = {
    ...(p.base?.quoteId ? { quoteId: p.base.quoteId } : {}),
    ...(p.base?.priorRevision ? { priorRevision: p.base.priorRevision } : {}),
    branchId: p.branchId,
    customerId: p.customerId,
    vehicle: p.vehicle,
    enquiryRef: p.base?.enquiryRef ?? null,
    sourceChannelRef: p.base?.sourceChannelRef ?? null,
    taxTreatment: p.terms?.taxTreatment ?? null,
    acceptancePolicy: p.terms?.acceptancePolicy ?? null,
    validThrough: p.validThrough,
    warrantyBindings: p.base?.warrantyBindings ?? [],
    benefitBindings: p.base?.benefitBindings ?? [],
    state: p.state,
  };
  if (p.mode === "catalogue") {
    if (!p.pkg) return { error: "no-package" };
    const lines = buildCatalogueLines(p.pkg, () => p.newId("line"));
    if (!lines) return { error: "package-price" };
    if (offered && !isOfferable(p.pkg)) return { error: "package-price" };
    return { input: { ...common, packageVersion: p.pkg.ref, scope: p.pkg.scope, work: p.pkg.work, lines, priceOrigin: { kind: "catalogue" } } };
  }
  if (!p.reason.trim()) return { error: "reason" };
  if (p.items.length === 0) return { error: "item-service" };
  const currency = p.currency ?? p.base?.lines[0]?.unitPrice.currency ?? DEFAULT_CURRENCY;
  const scope: ScopeItem[] = [];
  const work: WorkComponent[] = [];
  const lines: QuoteLine[] = [];
  for (const item of p.items) {
    if (!item.serviceId) return { error: "item-service" };
    if (!Number.isInteger(item.quantity) || item.quantity < 1) return { error: "item-quantity" };
    const price = parseMajor(item.unitPrice);
    const tax = parseMajor(item.tax);
    if (price !== null && Number.isNaN(price)) return { error: "item-price" };
    if (offered && price === null) return { error: "item-price" };
    if (tax !== null && Number.isNaN(tax)) return { error: "item-tax" };
    if (offered && tax === null) return { error: "item-tax" };
    const occupancy = p.occupancyFor(item.serviceId);
    if (!occupancy) return { error: "no-occupancy" };
    const scopeId = item.id || p.newId("scope");
    scope.push({ id: scopeId, serviceId: item.serviceId, gradeVersion: null, areas: splitList(item.areas), roof: item.roof, addOnIds: item.addOnIds, exclusions: splitList(item.exclusions), quantity: item.quantity });
    work.push({ id: p.newId("work"), serviceId: item.serviceId, scopeItemIds: [scopeId], occupancyRule: occupancy });
    lines.push({
      id: p.newId("line"), scopeItemId: scopeId, quantity: item.quantity,
      unitPrice: { minor: price ?? 0, currency }, discount: { minor: 0, currency },
      tax: tax === null ? null : { minor: tax, currency },
    });
  }
  return { input: { ...common, packageVersion: null, scope, work, lines, priceOrigin: { kind: p.mode, actorId: p.actorId, reason: p.reason.trim() } } };
}

const missingText: Array<[RegExp, Bilingual]> = [
  [/category/i, { en: "This vehicle has no size/type set yet, so catalogue packages cannot be matched. Use a custom price or ask the Owner.", ar: "لم يتم تحديد نوع/حجم المركبة بعد، لذا لا يمكن مطابقة باقات الكتالوج. استخدم سعراً مخصصاً أو اطلب من المالك." }],
  [/unsupported service/i, { en: "This service has no catalogue packages. Use a custom price.", ar: "لا توجد باقات كتالوج لهذه الخدمة. استخدم سعراً مخصصاً." }],
  [/grade retired/i, { en: "A grade in the matching package was retired. Use a custom price or ask the Owner.", ar: "تم إيقاف درجة في الباقة المطابقة. استخدم سعراً مخصصاً أو اطلب من المالك." }],
  [/vehicle-specific|catalogue scope/i, { en: "No published package fits this vehicle and service.", ar: "لا توجد باقة منشورة تناسب هذه المركبة وهذه الخدمة." }],
  [/price unavailable/i, { en: "Some packages have no approved price yet.", ar: "بعض الباقات ليس لها سعر معتمد بعد." }],
];

/** Bilingual explanation for the catalogue eligibility "missing" notes. */
export function missingLabel(note: string, lang: Locale): string {
  const hit = missingText.find(([pattern]) => pattern.test(note));
  if (hit) return hit[1][lang];
  return lang === "ar" ? "تعذر مطابقة الكتالوج." : "The catalogue could not be matched.";
}

export const buildErrorLabels: Record<BuildError, Bilingual> = {
  "no-customer": { en: "Choose a customer.", ar: "اختر عميلاً." },
  "no-vehicle": { en: "Choose a vehicle.", ar: "اختر مركبة." },
  "no-branch": { en: "Choose a branch.", ar: "اختر الفرع." },
  "no-package": { en: "Choose a package.", ar: "اختر باقة." },
  "package-price": { en: "This package has no approved price or tax yet.", ar: "هذه الباقة ليس لها سعر أو ضريبة معتمدة بعد." },
  "item-service": { en: "Add at least one work item with a service.", ar: "أضف بند عمل واحداً على الأقل مع خدمة." },
  "item-quantity": { en: "Quantity must be 1 or more.", ar: "يجب أن تكون الكمية 1 أو أكثر." },
  "item-price": { en: "Enter a valid price for every item.", ar: "أدخل سعراً صحيحاً لكل بند." },
  "item-tax": { en: "Enter a valid tax amount (0 if none).", ar: "أدخل مبلغ ضريبة صحيحاً (0 إن لم توجد)." },
  "no-occupancy": { en: "No workshop capacity rule is set up for this service yet. Ask the Owner.", ar: "لم يتم إعداد قاعدة سعة الورشة لهذه الخدمة بعد. اطلب من المالك." },
  reason: { en: "Say why the price is custom.", ar: "وضّح سبب السعر المخصص." },
  terms: { en: "The quote terms (tax and acceptance) are not set up. Ask the Owner in Settings.", ar: "شروط العرض (الضريبة والقبول) غير معدّة. اطلب من المالك ذلك من الإعدادات." },
  "valid-through": { en: "Choose a valid-through date.", ar: "اختر تاريخ الصلاحية." },
};
