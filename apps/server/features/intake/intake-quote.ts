import { DEFAULT_CURRENCY, PRODUCT_SERVICE_ID, findMixedCurrency, isSupportedCurrency } from "@garage/domain";
import type { Money, PackageVersion, PolicyRef, QuoteDraftInput, QuoteLine, ScopeItem, VehicleSelection, WorkComponent } from "@garage/domain";
import { generatedValidThrough, packageLines } from "../commercial/quote-generation";
import { QuoteError } from "../commercial/quote-service";

/**
 * Pure assembly of the DRAFT quote that quick intake creates. A product line is a scope item with no workshop work (no bay
 * time, no occupancy rule); services and packages keep their catalogue scope and work. Everything here still goes through
 * createQuoteRevision validation, so nothing relaxes the price/tax staleness rules.
 */
export type IntakeWarning =
  | "no-catalogue-price" | "tax-not-set" | "terms-missing" | "manual-price-needs-review" | "vehicle-category-unset" | "items-saved-with-request" | "booking-pending";

export interface IntakeQuoteItem { pkg: PackageVersion; quantity: number; note?: string }
export interface IntakeQuoteInput {
  today: string; actorId: string; branchId: string; customerId: string; vehicle: VehicleSelection;
  items: IntakeQuoteItem[]; notes: string | null; conversationId: string | null; quoteId: string;
  terms: { acceptancePolicy: PolicyRef; taxTreatment: PolicyRef; validityDays: number } | null;
  newId?: (prefix: string) => string;
}

const fail = (status: number, code: string, message: string): never => { throw new QuoteError(status, code, message); };
export const MAX_QUOTE_SCOPE_ITEMS = 40;
const approvedPrice = (pkg: PackageVersion): Money | null => (pkg.price.state === "approved" ? pkg.price.value : null);
const approvedTax = (pkg: PackageVersion): Money | null => (pkg.tax.state === "approved" ? pkg.tax.value.amount : null);
const isProduct = (pkg: PackageVersion) => pkg.kind === "product";

/** True when the single catalogue item can be quoted as an exact catalogue version (so the offer step can check its price and tax). */
function exactCatalogueFit(item: IntakeQuoteItem, vehicle: VehicleSelection, branchId: string): boolean {
  const { pkg } = item;
  if (item.quantity !== 1 || item.note || !approvedPrice(pkg) || !pkg.branchIds.includes(branchId)) return false;
  if (pkg.vehicleModels.length && !pkg.vehicleModels.includes(vehicle.model)) return false;
  if (pkg.vehicleCategoryIds.length === 0) return isProduct(pkg);
  return !!vehicle.categoryId && pkg.vehicleCategoryIds.includes(vehicle.categoryId);
}

export function assembleIntakeQuote(source: IntakeQuoteInput): { input: QuoteDraftInput; warnings: IntakeWarning[]; mode: "catalogue" | "manual" } {
  let counter = 0;
  const newId = source.newId ?? ((prefix: string) => `${prefix}-${++counter}`);
  if (!source.items.length) fail(400, "ITEMS_REQUIRED", "Choose at least one item to quote.");
  const warnings: IntakeWarning[] = [];

  const priced = source.items.map((item) => approvedPrice(item.pkg)).filter((price): price is Money => price !== null);
  const currency = priced[0]?.currency ?? DEFAULT_CURRENCY;
  if (!isSupportedCurrency(currency)) fail(422, "CURRENCY_UNSUPPORTED", "The catalogue currency is not in the supported currency list.");
  if (findMixedCurrency(priced.map((price) => ({ currency: price.currency })), currency) !== -1) fail(422, "CURRENCY_MISMATCH", "Items in different currencies cannot share one quote.");
  for (const item of source.items) {
    const price = approvedPrice(item.pkg), tax = approvedTax(item.pkg);
    if (price && tax && tax.currency !== price.currency) fail(422, "CURRENCY_MISMATCH", "Catalogue price and tax use different currencies.");
  }
  const zero: Money = { minor: 0, currency };

  let scope: ScopeItem[] = [];
  let work: WorkComponent[] = [];
  let lines: QuoteLine[] = [];
  let packageVersion: PolicyRef | null = null;
  let mode: "catalogue" | "manual" = "manual";

  const only = source.items.length === 1 ? source.items[0] : null;
  if (only && exactCatalogueFit(only, source.vehicle, source.branchId)) {
    const built = packageLines(only.pkg, newId);
    if (built) {
      mode = "catalogue"; packageVersion = only.pkg.ref;
      scope = only.pkg.scope.map((item) => ({ ...item })); work = only.pkg.work.map((item) => ({ ...item })); lines = built;
      if (!approvedTax(only.pkg)) warnings.push("tax-not-set");
    }
  }
  if (mode === "manual") {
    if (!source.vehicle.categoryId && source.items.some((item) => !isProduct(item.pkg) || item.pkg.vehicleCategoryIds.length > 0)) warnings.push("vehicle-category-unset");
    for (const item of source.items) {
      const { pkg } = item;
      const price = approvedPrice(pkg), tax = approvedTax(pkg);
      if (!price) warnings.push("no-catalogue-price");
      if (price && !tax) warnings.push("tax-not-set");
      const note = item.note?.trim() ? [item.note.trim().slice(0, 200)] : [];
      if (isProduct(pkg)) {
        // One scope item per product line, quantity on the line. No work component: a product never needs bay time.
        const template = pkg.scope[0];
        const scopeId = newId("scope");
        scope.push({ ...template, id: scopeId, areas: note, quantity: item.quantity, productId: pkg.ref.id, label: template.label ?? pkg.name, serviceId: PRODUCT_SERVICE_ID });
        lines.push({
          id: newId("line"), scopeItemId: scopeId, quantity: item.quantity, unitPrice: price ? { ...price } : { ...zero }, discount: { ...zero },
          tax: tax ? { minor: tax.minor * item.quantity, currency: tax.currency } : null,
        });
        if (!Number.isSafeInteger((price?.minor ?? 0) * item.quantity)) fail(400, "INVALID_AMOUNT", "Line amount exceeds safe limits.");
        continue;
      }
      // Services and packages: one full copy of the catalogue scope and work per unit, so every copy keeps its own occupancy.
      for (let copy = 0; copy < item.quantity; copy++) {
        const ids = new Map<string, string>();
        const copies = pkg.scope.map((entry) => { const id = newId("scope"); ids.set(entry.id, id); return { ...entry, id, areas: [...entry.areas, ...(copy === 0 ? note : [])] }; });
        const carrier = copies.findIndex((entry) => entry.quantity === 1);
        copies.forEach((entry, index) => {
          scope.push(entry);
          const carries = index === carrier && price !== null;
          lines.push({
            id: newId("line"), scopeItemId: entry.id, quantity: entry.quantity, unitPrice: carries ? { ...price } : { ...zero }, discount: { ...zero },
            tax: !tax ? null : carries ? { ...tax } : { minor: 0, currency: tax.currency },
          });
        });
        for (const component of pkg.work) work.push({ ...component, id: newId("work"), scopeItemIds: component.scopeItemIds.map((id) => ids.get(id) ?? id) });
      }
    }
    if (priced.length) warnings.push("manual-price-needs-review");
  }
  if (scope.length > MAX_QUOTE_SCOPE_ITEMS) fail(400, "TOO_MANY_LINES", "Reduce the number of items on this quote.");
  if (!source.terms) warnings.push("terms-missing");

  const input: QuoteDraftInput = {
    quoteId: source.quoteId, branchId: source.branchId, customerId: source.customerId, vehicle: source.vehicle, enquiryRef: null,
    sourceChannelRef: source.conversationId, packageVersion, scope, work, lines,
    priceOrigin: mode === "catalogue" ? { kind: "catalogue" } : { kind: "manual", actorId: source.actorId, reason: "Quick intake: catalogue prices copied, review before offering" },
    taxTreatment: source.terms?.taxTreatment ?? null, acceptancePolicy: source.terms?.acceptancePolicy ?? null,
    validThrough: generatedValidThrough(source.today, null, source.terms?.validityDays ?? null),
    warrantyBindings: [], benefitBindings: [], state: "draft", notes: source.notes?.trim() || null,
  };
  return { input, warnings: [...new Set(warnings)], mode };
}
