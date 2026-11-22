import {
  Dataset, SEED_REASON, egp, json, type PolicyRef, type SeedContext,
} from "./seed-core";
import {
  BRANCH_A, BRANCH_B, BRANCH_IDS, OWNER, STAFF, categoryId, type CategoryKey,
} from "./seed-people";

export const lbl = (ar: string, en: string) => ({ ar, en });
const EVIDENCE = "private:seed/example-evidence";

/* ----------------------------- services ----------------------------- */

export interface Occupancy { key: string; bayType: "clean" | "general"; minutes: number; days: number }
export interface ServiceDef {
  id: string; nameEn: string; nameAr: string; bayType: "clean" | "general"; bayHours: number;
  priceLabel: string; active: boolean; occ: Occupancy | null; legacy: boolean; examplePrice: number;
}
const svc = (
  id: string, nameEn: string, nameAr: string, bayType: "clean" | "general", bayHours: number, priceLabel: string,
  active: boolean, occ: Omit<Occupancy, "bayType"> | null, legacy = false, examplePrice = 0,
): ServiceDef => ({ id, nameEn, nameAr, bayType, bayHours, priceLabel, active, occ: occ ? { ...occ, bayType } : null, legacy, examplePrice });

/** The first five rows are the pre-existing development services (kept untouched). The rest are example catalogue services. */
export const SERVICES: ServiceDef[] = [
  svc("inspection", "Inspection", "فحص السيارة", "general", 1, "Estimate after inspection", true, { key: "inspection", minutes: 60, days: 1 }, true, 750),
  svc("tint", "Window tint", "تظليل النوافذ", "general", 3, "Sample quote", true, { key: "tint", minutes: 180, days: 1 }, true, 4500),
  svc("audio", "Audio upgrade", "ترقية النظام الصوتي", "general", 8, "Sample quote", true, { key: "audio", minutes: 480, days: 1 }, true, 9500),
  svc("ceramic", "Ceramic coating", "طلاء سيراميك", "clean", 20, "Estimate after inspection", true, { key: "ceramic", minutes: 420, days: 2 }, true, 12000),
  svc("full-ppf", "Full PPF", "حماية كاملة للطلاء", "clean", 30, "Estimate after inspection", true, { key: "ppf", minutes: 480, days: 4 }, true, 35000),
  svc("seed-svc-interior-nano", "Interior nano ceramic", "نانو سيراميك للداخلية", "general", 4, "Advertised list price", true, { key: "nano", minutes: 240, days: 1 }, false, 2500),
  svc("seed-svc-glass-guard", "Windshield / screen Glass Guard", "حماية الزجاج والشاشات", "general", 2, "Advertised list price", true, { key: "glass", minutes: 120, days: 1 }, false, 5000),
  svc("seed-svc-panorama-film", "Panorama roof film", "فيلم البانوراما", "general", 2.5, "Advertised list price", true, { key: "panorama", minutes: 150, days: 1 }, false, 8000),
  svc("seed-svc-lights-mirrors", "Lights and mirrors film", "فيلم الإضاءة والمرايا", "general", 1.5, "Advertised in package only", true, { key: "lights", minutes: 90, days: 1 }, false, 1500),
  // Adjacent services named in GS-F014. Availability is unconfirmed, so they are inactive and priced as draft catalogue items.
  svc("seed-svc-wrapping", "Vehicle wrapping", "تغليف السيارات (راب)", "general", 16, "Availability unconfirmed", false, null),
  svc("seed-svc-carbon-fiber", "Carbon fibre trim", "كربون فايبر", "general", 8, "Availability unconfirmed", false, null),
  svc("seed-svc-steering-wheel", "Steering wheels", "دركسيون", "general", 4, "Availability unconfirmed", false, null),
  svc("seed-svc-rims", "Rims", "جنوط", "general", 3, "Availability unconfirmed", false, null),
  svc("seed-svc-accessories", "Accessories", "إكسسوارات", "general", 2, "Availability unconfirmed", false, null),
  svc("seed-svc-modifications", "Modifications", "تعديلات", "general", 8, "Availability unconfirmed", false, null),
  svc("seed-svc-home-window-film", "Home / commercial window heat film (per m2)", "فيلم عازل للحرارة للمنازل والمحلات (للمتر)", "general", 4, "999 EGP/m2 advertised - availability unconfirmed", false, null),
];
export const serviceById = (id: string) => SERVICES.find((item) => item.id === id)!;
export const occupancyPolicyId = (service: ServiceDef) => `work-occupancy:seed-${service.occ!.key}`;

/* ------------------------- warranty policies ------------------------- */

export interface WarrantyPolicyDef {
  id: string; version: number; name: string; services: string[]; kind: "fixed" | "lifetime"; months: number | null;
  status: "draft" | "published" | "retired"; publishedOn: string | null; reviewRole: "owner" | "branch-manager"; auto: boolean;
}
export const WARRANTY_POLICIES: WarrantyPolicyDef[] = [
  { id: "seed-wp-ppf-pro", version: 1, name: "GO garage Pro PPF - 7 years (superseded)", services: ["full-ppf"], kind: "fixed", months: 84, status: "retired", publishedOn: "2025-01-01", reviewRole: "branch-manager", auto: true },
  { id: "seed-wp-ppf-pro", version: 2, name: "GO garage Pro PPF - 7 years", services: ["full-ppf"], kind: "fixed", months: 84, status: "published", publishedOn: "2026-06-01", reviewRole: "branch-manager", auto: true },
  { id: "seed-wp-ppf-ultimate", version: 1, name: "GO stores Ultimate PPF - 10 years", services: ["full-ppf"], kind: "fixed", months: 120, status: "published", publishedOn: "2025-01-01", reviewRole: "owner", auto: true },
  { id: "seed-wp-ppf-plus", version: 1, name: "GO stores Plus+ PPF - lifetime wording", services: ["full-ppf"], kind: "lifetime", months: null, status: "published", publishedOn: "2025-01-01", reviewRole: "owner", auto: true },
  { id: "seed-wp-ppf-black", version: 1, name: "Black edition PPF - 7 years", services: ["full-ppf"], kind: "fixed", months: 84, status: "published", publishedOn: "2025-01-01", reviewRole: "branch-manager", auto: true },
  { id: "seed-wp-ppf-matte", version: 1, name: "Matte PPF - 10 years", services: ["full-ppf"], kind: "fixed", months: 120, status: "published", publishedOn: "2025-01-01", reviewRole: "owner", auto: true },
  { id: "seed-wp-heat-film", version: 1, name: "Heat film - lifetime wording", services: ["tint"], kind: "lifetime", months: null, status: "published", publishedOn: "2025-01-01", reviewRole: "branch-manager", auto: true },
  { id: "seed-wp-ceramic", version: 1, name: "Ceramic coating - 24 months", services: ["ceramic"], kind: "fixed", months: 24, status: "published", publishedOn: "2025-01-01", reviewRole: "branch-manager", auto: true },
  { id: "seed-wp-interior-nano", version: 1, name: "Interior nano ceramic - 6 months", services: ["seed-svc-interior-nano"], kind: "fixed", months: 6, status: "published", publishedOn: "2025-01-01", reviewRole: "branch-manager", auto: true },
  { id: "seed-wp-glass-guard", version: 1, name: "Glass Guard coverage - 12 months (draft)", services: ["seed-svc-glass-guard"], kind: "fixed", months: 12, status: "draft", publishedOn: null, reviewRole: "owner", auto: false },
];
export const warrantyPolicyAt = (id: string, date: string) =>
  WARRANTY_POLICIES.filter((policy) => policy.id === id && policy.status !== "draft" && (policy.publishedOn ?? "") <= date)
    .sort((a, b) => b.version - a.version)[0] ?? WARRANTY_POLICIES.find((policy) => policy.id === id && policy.status !== "draft")!;

export const lifetimeDefinition = (policy: WarrantyPolicyDef, at: Date) => ({
  state: "approved",
  value: {
    subject: "vehicle",
    subjectDefinition: "The vehicle on which the product was originally installed by GO stores.",
    terminationConditions: "Ends on sale of the vehicle, accident damage, or removal by a third party.",
    transferRule: "Not transferable. A referral discount does not transfer warranty coverage.",
    maintenanceConditions: "Optional free aftercare visits are recommended; no mandatory interval is defined.",
    issuer: "GO stores",
    remedy: "Repair or replace the affected panel at the issuing branch.",
    publicWording: { ar: "ضمان مدى الحياة للسيارة الأصلية وفق الشروط", en: "Lifetime coverage for the original vehicle under the stated conditions" },
  },
  policy: { id: policy.id, version: policy.version },
  approval: { approvedBy: OWNER, approvedAt: at.toISOString(), evidenceRef: EVIDENCE, reason: SEED_REASON },
});

/* ------------------------------ catalogue ------------------------------ */

export interface ScopeItem {
  id: string; serviceId: string; gradeVersion: PolicyRef | null; areas: string[];
  roof: "included" | "excluded" | "not-applicable"; addOnIds: string[]; exclusions: string[]; quantity: number;
}
export interface WorkComponent { id: string; serviceId: string; scopeItemIds: string[]; occupancyRule: PolicyRef }
export type PromoKey = "club" | "plus" | "recent" | "nov";
export interface PackageDef {
  id: string; version: number; revision: number; kind: "package" | "standalone"; state: "draft" | "published" | "retired";
  name: { ar: string; en: string }; categories: CategoryKey[]; effectiveFrom: string | null; effectiveThrough: string | null;
  scope: ScopeItem[]; work: WorkComponent[]; priceMinor: number | null; primaryServiceId: string;
  gradeKey: string | null; warranty: Record<string, string>; benefitKeys: string[]; promo: PromoKey | null; provenance: string;
}

export const GRADES = [
  { key: "pro", id: "seed-grade-pro", um: 150, en: "GO garage Pro", ar: "جو جراج برو", warranty: "seed-wp-ppf-pro", prices: { sedan: 28000, suv: 30000 } },
  { key: "ultimate", id: "seed-grade-ultimate", um: 180, en: "GO stores Ultimate", ar: "جو ستورز ألتيميت", warranty: "seed-wp-ppf-ultimate", prices: { sedan: 35000, suv: 38000 } },
  { key: "plus", id: "seed-grade-plus", um: 200, en: "GO stores Plus+", ar: "جو ستورز بلس+", warranty: "seed-wp-ppf-plus", prices: { sedan: 40000, suv: 43000 } },
  { key: "black", id: "seed-grade-black", um: 180, en: "Black edition", ar: "بلاك إديشن", warranty: "seed-wp-ppf-black", prices: { sedan: 35000, suv: 38000 } },
  { key: "matte", id: "seed-grade-matte", um: 180, en: "Matte", ar: "مات", warranty: "seed-wp-ppf-matte", prices: { sedan: 38000, suv: 40000 } },
] as const;
export type GradeKey = (typeof GRADES)[number]["key"];
export const gradeByKey = (key: string) => GRADES.find((grade) => grade.key === key)!;

export interface Reference {
  windowStart: string;
  packages: PackageDef[];
  taxPolicy: PolicyRef;
  acceptancePolicy: PolicyRef;
  issuanceAuthority: PolicyRef;
  promoPolicies: Record<"club" | "plus" | "recent" | "nov" | "referral" | "threecars", PolicyRef>;
  promoCaps: Record<keyof Reference["promoPolicies"], number>;
  benefitPolicies: Record<"inspection" | "tow" | "wash" | "vip" | "fourth", PolicyRef>;
  financePolicies: Record<"quoted-value" | "draft-value" | "collections" | "outstanding" | "direct-cost" | "recognized-revenue" | "gross-profit" | "net-profit", PolicyRef>;
  channelId: string;
}

export const channelId = "seed-channel-simulation";

export function buildReference(ds: Dataset, ctx: SeedContext): Reference {
  const windowStart = ctx.day(-365);
  const base = ctx.at(windowStart, "09:00");

  /* staff, services, categories */
  for (const member of STAFF) {
    ds.add("staff_memberships", {
      clerk_user_id: member.id, email: member.email, full_name: member.name, role: member.role,
      branch_ids: member.branchIds, status: "active", created_at: base, updated_at: base,
    });
  }
  for (const item of SERVICES) {
    ds.add("services", {
      id: item.id, name_en: item.nameEn, name_ar: item.nameAr, bay_type: item.bayType, bay_hours: item.bayHours,
      price_label: item.priceLabel, active: item.active,
    });
  }
  const categoryNames: Record<CategoryKey, { ar: string; en: string }> = {
    sedan: lbl("سيدان", "Sedan"), suv: lbl("إس يو في", "SUV"),
  };
  for (const key of ["sedan", "suv"] as const) {
    ds.add("catalogue_vehicle_categories", { id: categoryId(key), name: json(categoryNames[key]), created_by: OWNER, created_at: base });
  }

  /* policy helper: approved + activated + audited */
  const policyRows = (id: string, family: string, value: unknown, extra: { branchId?: string; from?: string; through?: string; at?: Date } = {}): PolicyRef => {
    const at = extra.at ?? base;
    ds.add("commercial_policy_versions", {
      policy_id: id, family, version: 1, value: json(value), branch_id: extra.branchId ?? null,
      effective_from: extra.from ?? windowStart, effective_through: extra.through ?? null, state: "approved",
      evidence_ref: EVIDENCE, approved_by: OWNER, approved_at: at, reason: SEED_REASON, created_by: OWNER, created_at: at,
    });
    ds.add("commercial_policy_active", { policy_id: id, version: 1, activated_by: OWNER, activated_at: at });
    for (const [offset, action] of [[0, "proposed"], [1, "approved"], [2, "activated"]] as const) {
      ds.add("commercial_policy_audit", {
        policy_id: id, version: 1, action, actor_id: OWNER, occurred_at: new Date(at.getTime() + offset * 60_000), reason: SEED_REASON,
      });
    }
    return { id, version: 1 };
  };

  /* occupancy */
  const occupancyRefs = new Map<string, PolicyRef>();
  for (const item of SERVICES.filter((entry) => entry.occ)) {
    const occ = item.occ!;
    occupancyRefs.set(item.id, policyRows(occupancyPolicyId(item), "work-occupancy", {
      bayType: occ.bayType, requiredMinutes: occ.minutes, durationDays: occ.days, aggregation: "sum",
    }));
  }

  /* quote acceptance + tax */
  const taxPolicy = policyRows("quote-acceptance:seed-tax", "quote-acceptance", {
    validityDays: 30, acceptanceMethods: ["staff-recorded", "customer-confirmed"], evidenceRequired: true, overrideRole: "owner",
    taxTreatment: { id: "quote-acceptance:seed-tax", version: 1 },
  });
  const acceptancePolicy = policyRows("quote-acceptance:seed-acceptance", "quote-acceptance", {
    validityDays: 30, acceptanceMethods: ["staff-recorded", "customer-confirmed"], evidenceRequired: true, overrideRole: "owner",
    taxTreatment: taxPolicy,
  });
  const issuanceAuthority = policyRows("warranty-issuance:seed-authority", "warranty-issuance", { honorRetiredAcceptedWarranty: true });

  /* deposit terms per branch (deposit references only; no payment gateway) */
  for (const branchId of BRANCH_IDS) {
    policyRows(`reservation-deposit:${branchId}`, "reservation-deposit", {
      validityDays: 30,
      deposit: { required: true, amount: egp(5000), refundRule: lbl("يُراجع الاسترداد مع المالك", "Refund is reviewed by the Owner") },
      cancellationRule: lbl("يتم مراجعة الإلغاء يدويًا", "Cancellation is reviewed manually"),
      cancellationDisposition: "review-required", priceLock: true, redemptionTiming: "installation", restoreAllowed: true, expiryAction: "review-required",
    }, { branchId });
  }

  /* benefits (GS-F026 published promises; eligibility/frequency unverified) */
  const benefitBase = {
    eligibleBranchIds: [BRANCH_A, BRANCH_B], eligibilityRule: lbl("حسب شروط العرض المنشور", "Per the published offer terms"),
    responsibleTeamId: "seed-team-service", transferRule: "same-customer-vehicle", cancellationRule: "review-required",
    expiryRule: { kind: "none" }, reversalRestoresEligibility: true,
  };
  const benefitPolicies = {
    inspection: policyRows("benefit-eligibility:seed-handover-inspection", "benefit-eligibility", { ...benefitBase, benefitId: "seed-handover-inspection", activationTrigger: "accepted", limit: { kind: "quantity", quantity: 1 } }),
    tow: policyRows("benefit-eligibility:seed-cairo-tow", "benefit-eligibility", { ...benefitBase, benefitId: "seed-cairo-tow", activationTrigger: "accepted", limit: { kind: "quantity", quantity: 2 } }),
    wash: policyRows("benefit-eligibility:seed-free-wash", "benefit-eligibility", { ...benefitBase, benefitId: "seed-free-wash", activationTrigger: "delivered", limit: { kind: "recurring", quantity: 1, interval: "calendar-month", startsOn: ctx.day(-60), endsOn: null, eligibilityPolicy: taxPolicy } }),
    vip: policyRows("benefit-eligibility:seed-vip-transport", "benefit-eligibility", { ...benefitBase, benefitId: "seed-vip-transport", activationTrigger: "accepted", limit: { kind: "quantity", quantity: 2 } }),
    fourth: policyRows("benefit-eligibility:seed-fourth-car", "benefit-eligibility", { ...benefitBase, benefitId: "seed-fourth-car", activationTrigger: "accepted", limit: { kind: "quantity", quantity: 1 } }),
  };

  /* transport availability (free Cairo tow = no fee; driver and courtesy car carry example fees) */
  const transportCombos = [
    ["pickup", "tow", null], ["return", "tow", null], ["pickup", "driver", egp(350)], ["return", "driver", egp(350)], ["courtesy", "courtesy-car", null],
  ] as const;
  for (const branchId of BRANCH_IDS) {
    for (const [direction, mode, fee] of transportCombos) {
      policyRows(`transport-availability:${branchId}:${direction}:${mode}`, "transport-availability", {
        direction, mode, serviceArea: lbl("القاهرة الكبرى", "Greater Cairo"), providerId: `seed-provider-${mode}-${branchId}`,
        capacity: mode === "courtesy-car" ? 1 : 2, fee,
        custodyRule: lbl("تُسجل حالة السيارة عند الاستلام", "Vehicle condition is recorded at hand-over"),
      }, { branchId });
    }
  }

  /* promotions */
  const promoBase = {
    evidenceVerification: { required: true, authorizedRoles: ["owner", "branch-manager"], expiresAfterDays: 90 },
    recipient: { kind: "customer", transferWarranty: false },
    stackability: { allowed: false, permittedPromotionIds: [] },
    exceptionAuthority: { roles: ["owner"], requiresReason: true, requiresEvidence: true },
  };
  const promoPolicies = {
    club: policyRows("promotion-qualification:seed-ultimate-club", "promotion-qualification", { ...promoBase, promotionId: "seed-ultimate-club", evidenceKinds: ["membership-verification"], maximumUnits: 15, grouping: { minimumVehicles: 1, maximumVehicles: 1, timingWindowHours: 24, timing: "same-quote" }, discountAllocation: { kind: "per-vehicle-fixed", total: egp(10001), perVehicle: egp(10001) }, beneficiaryRule: lbl("باقة نادي ألتيميت 44,999 جنيه - محدودة بـ 15 سيارة (عرض معلن)", "Ultimate club package 44,999 EGP - limited to 15 cars (advertised offer)") }, { from: ctx.day(-60), through: ctx.day(40) }),
    plus: policyRows("promotion-qualification:seed-plus-lifetime", "promotion-qualification", { ...promoBase, promotionId: "seed-plus-lifetime", evidenceKinds: ["membership-verification"], maximumUnits: 10, grouping: { minimumVehicles: 1, maximumVehicles: 1, timingWindowHours: 24, timing: "same-quote" }, discountAllocation: { kind: "per-vehicle-fixed", total: egp(0), perVehicle: egp(0) }, beneficiaryRule: lbl("باقة بلس مدى الحياة 52,999 جنيه (عرض معلن)", "Plus lifetime package 52,999 EGP (advertised offer)") }, { from: ctx.day(-52), through: ctx.day(40) }),
    recent: policyRows("promotion-qualification:seed-recent-ultimate", "promotion-qualification", { ...promoBase, promotionId: "seed-recent-ultimate", evidenceKinds: ["membership-verification"], maximumUnits: 20, grouping: { minimumVehicles: 1, maximumVehicles: 1, timingWindowHours: 24, timing: "same-quote" }, discountAllocation: { kind: "per-vehicle-fixed", total: egp(0), perVehicle: egp(0) }, beneficiaryRule: lbl("عرض ألتيميت الأخير 39,999 جنيه (عرض معلن)", "Recent Ultimate offer 39,999 EGP (advertised offer)") }, { from: ctx.day(-6), through: ctx.day(40) }),
    nov: policyRows("promotion-qualification:seed-nov-announcement", "promotion-qualification", { ...promoBase, promotionId: "seed-nov-announcement", evidenceKinds: ["membership-verification"], maximumUnits: 25, grouping: { minimumVehicles: 1, maximumVehicles: 1, timingWindowHours: 24, timing: "same-quote" }, discountAllocation: { kind: "per-vehicle-fixed", total: egp(0), perVehicle: egp(0) }, beneficiaryRule: lbl("عرض 5 نوفمبر - فيلم يبدأ من 32,999 جنيه مع فحص استلام وسحب داخل القاهرة وغسيل مجاني وسيارة سائق (عرض معلن)", "5 November offer - film from 32,999 EGP with handover inspection, Cairo tow, free washing and chauffeur car (advertised offer)") }, { from: ctx.day(-16), through: ctx.day(9) }),
    referral: policyRows("promotion-qualification:seed-warranty-card-referral", "promotion-qualification", { ...promoBase, promotionId: "seed-warranty-card-referral", evidenceKinds: ["warranty-reference"], maximumUnits: 50, recipient: { kind: "referred-customer", transferWarranty: false }, grouping: { minimumVehicles: 1, maximumVehicles: 1, timingWindowHours: 24, timing: "same-quote" }, discountAllocation: { kind: "per-vehicle-fixed", total: egp(10000), perVehicle: egp(10000) }, beneficiaryRule: lbl("إحالة بكارت الضمان - خصم 10,000 جنيه على سيارة أخرى، والخصم لا ينقل الضمان (عرض معلن)", "Warranty-card referral - 10,000 EGP off another car; the discount does not transfer the warranty (advertised offer)") }, { from: ctx.day(-120) }),
    threecars: policyRows("promotion-qualification:seed-four-cars", "promotion-qualification", { ...promoBase, promotionId: "seed-four-cars", evidenceKinds: ["grouped-vehicles"], maximumUnits: 10, grouping: { minimumVehicles: 3, maximumVehicles: 4, timingWindowHours: 72, timing: "same-booking" }, discountAllocation: { kind: "equal-remainder-by-vehicle", total: egp(35000), perVehicle: null }, beneficiaryRule: lbl("السيارة الرابعة مجانًا عند حضور ثلاث سيارات معًا (عرض معلن)", "Fourth car free when three cars come together (advertised offer)") }, { from: ctx.day(-30), through: ctx.day(9) }),
  } as Reference["promoPolicies"];
  const promoCaps = { club: 15, plus: 10, recent: 20, nov: 25, referral: 50, threecars: 10 } as Reference["promoCaps"];

  /* finance definitions + attestations */
  const financeBase = { currency: "EGP", minorUnitExponent: 2, reportingTimezone: "Africa/Cairo", emptyPeriod: "complete" };
  const fin = (metric: keyof Reference["financePolicies"], sourceKinds: string[], required: string[], rule: [string, string]) => {
    const ref = policyRows(`finance-definition:seed-${metric}`, "finance-definition", {
      ...financeBase, metric, recognitionRule: lbl(rule[0], rule[1]), taxTreatment: lbl("حسب تعريف المالك", "As defined by the Owner"),
      sourceKinds, completenessRule: lbl("كل المصادر المسجلة", "All recorded sources"), requiredSourceKinds: required,
    });
    ds.add("finance_definition_attestations", {
      environment_id: ctx.environmentId, definition_id: ref.id, definition_version: 1, currency: "EGP", minor_unit_exponent: 2,
      completeness_evidence_ref: EVIDENCE, attested_by: OWNER, attested_at: base,
    });
    return ref;
  };
  const financePolicies = {
    "quoted-value": fin("quoted-value", ["accepted-quote"], ["accepted-quote"], ["العروض المقبولة", "Accepted quotes"]),
    "draft-value": fin("draft-value", ["draft-invoice"], [], ["مسودات الفواتير", "Draft invoices"]),
    collections: fin("collections", ["collection", "refund"], ["collection"], ["المبالغ المحصلة", "Recorded collections"]),
    outstanding: fin("outstanding", ["calculated-outstanding"], [], ["المتبقي = المقبول - المحصل", "Accepted minus collected"]),
    "direct-cost": fin("direct-cost", ["direct-cost"], ["direct-cost"], ["التكلفة المباشرة", "Direct cost"]),
    "recognized-revenue": fin("recognized-revenue", ["recognized-revenue"], ["recognized-revenue"], ["عند التسليم", "On delivery"]),
    "gross-profit": fin("gross-profit", ["recognized-revenue", "direct-cost"], ["recognized-revenue", "direct-cost"], ["الإيراد - التكلفة المباشرة", "Revenue minus direct cost"]),
    "net-profit": fin("net-profit", ["recognized-revenue", "direct-cost", "overhead"], ["recognized-revenue", "direct-cost", "overhead"], ["الإيراد - كل التكاليف", "Revenue minus all costs"]),
  } as Reference["financePolicies"];

  /* grades */
  const gradeApproval = { approvedBy: OWNER, approvedAt: base.toISOString(), evidenceRef: EVIDENCE, reason: SEED_REASON };
  for (const grade of GRADES) {
    ds.add("catalogue_grade_versions", {
      grade_id: grade.id, version: 1, revision: 1, state: "published", name: json(lbl(grade.ar, grade.en)),
      thickness_micrometres: grade.um, provenance: "Advertised list of 26 April 2026 (GS-F016). Not an approved specification.",
      approval: json(gradeApproval), created_by: OWNER, created_at: base,
    });
    ds.add("catalogue_grade_active", { grade_id: grade.id, version: 1, retired: false });
    ds.add("catalogue_audit", { entity_kind: "grade", entity_id: grade.id, version: 1, action: "published", actor_id: OWNER, reason: SEED_REASON, occurred_at: base });
  }

  /* packages */
  const packages: PackageDef[] = [];
  const occ = (serviceId: string): PolicyRef => occupancyRefs.get(serviceId)!;
  const scopeItem = (id: string, serviceId: string, extra: Partial<ScopeItem> = {}): ScopeItem => ({
    id, serviceId, gradeVersion: null, areas: [], roof: "not-applicable", addOnIds: [], exclusions: [], quantity: 1, ...extra,
  });
  const work = (id: string, serviceId: string, scopeItemIds: string[]): WorkComponent => ({ id, serviceId, scopeItemIds, occupancyRule: occ(serviceId) });
  const addPackage = (def: Partial<PackageDef> & Pick<PackageDef, "id" | "name" | "scope" | "work" | "primaryServiceId">) => {
    packages.push({
      version: 1, revision: 1, kind: "package", state: "published", categories: ["sedan", "suv"], effectiveFrom: null, effectiveThrough: null,
      priceMinor: null, gradeKey: null, warranty: {}, benefitKeys: [], promo: null, provenance: "", ...def,
    });
  };

  for (const grade of GRADES) {
    for (const category of ["sedan", "suv"] as const) {
      const id = `seed-pkg-ppf-${grade.key}-${category}`;
      const catName = category === "sedan" ? lbl("سيدان", "sedan") : lbl("إس يو في", "SUV");
      const scope = [scopeItem("scope-ppf", "full-ppf", { gradeVersion: { id: grade.id, version: 1 }, areas: ["full-body"], roof: "excluded", exclusions: ["roof"] })];
      const common: Pick<PackageDef, "id" | "name" | "categories" | "scope" | "work" | "primaryServiceId" | "gradeKey" | "warranty" | "provenance"> = {
        id, name: lbl(`${grade.ar} - حماية كاملة للطلاء (${catName.ar}، بدون السقف)`, `${grade.en} - full-car PPF (${catName.en}, roof excluded)`),
        categories: [category], scope, work: [work("work-ppf", "full-ppf", ["scope-ppf"])], primaryServiceId: "full-ppf", gradeKey: grade.key,
        warranty: { "work-ppf": grade.warranty }, provenance: "Advertised list of 26 April 2026 (GS-F016); roof excluded (GS-F017).",
      };
      if (grade.key === "pro") {
        const older = grade.prices[category] - 1500;
        addPackage({ ...common, version: 1, state: "retired", priceMinor: older * 100, effectiveFrom: windowStart, effectiveThrough: "2026-05-31" });
        addPackage({ ...common, version: 2, revision: 2, priceMinor: grade.prices[category] * 100, effectiveFrom: "2026-06-01" });
      } else {
        addPackage({ ...common, priceMinor: grade.prices[category] * 100 });
      }
    }
  }
  const addOn = (key: string, serviceId: string, en: string, ar: string, price: number, warrantyId: string | null, source: string) => {
    addPackage({
      id: `seed-pkg-addon-${key}`, kind: "standalone", name: lbl(ar, en), scope: [scopeItem("scope-main", serviceId, { areas: [key] })],
      work: [work("work-main", serviceId, ["scope-main"])], primaryServiceId: serviceId, priceMinor: price * 100,
      warranty: warrantyId ? { "work-main": warrantyId } : {}, provenance: `${source}`,
    });
  };
  addOn("heat-plus", "tint", "GO stores plus heat film", "فيلم حراري جو ستورز بلس", 5000, "seed-wp-heat-film", "Advertised list (GS-F018), lifetime wording (GS-F019).");
  addOn("vkool", "tint", "VKool High Performance heat film", "فيلم في كول عالي الأداء", 9000, "seed-wp-heat-film", "Advertised list (GS-F018).");
  addOn("interior-nano", "seed-svc-interior-nano", "Interior nano ceramic", "نانو سيراميك للداخلية", 2500, "seed-wp-interior-nano", "Advertised list (GS-F018).");
  addOn("glass-guard", "seed-svc-glass-guard", "Windshield Glass Guard", "حماية الزجاج الأمامي", 5000, null, "Advertised list (GS-F018).");
  addOn("panorama", "seed-svc-panorama-film", "Panorama film", "فيلم البانوراما", 8000, null, "Advertised list (GS-F018).");

  const promoScope = (grade: GradeKey, roof: "included" | "excluded", extras: Array<[string, string]>): { scope: ScopeItem[]; work: WorkComponent[] } => {
    const g = gradeByKey(grade);
    const scope = [
      scopeItem("scope-ppf", "full-ppf", { gradeVersion: { id: g.id, version: 1 }, areas: ["full-body"], roof, exclusions: roof === "excluded" ? ["roof"] : [] }),
      ...extras.map(([id, serviceId]) => scopeItem(id, serviceId, { areas: [id] })),
    ];
    return { scope, work: [work("work-ppf", "full-ppf", ["scope-ppf"]), ...extras.map(([id, serviceId]) => work(`work-${id}`, serviceId, [id]))] };
  };
  const glass: [string, string] = ["scope-glass-film", "tint"];
  const screens: [string, string] = ["scope-screens", "seed-svc-glass-guard"];
  const nano: [string, string] = ["scope-nano", "seed-svc-interior-nano"];
  const lights: [string, string] = ["scope-lights", "seed-svc-lights-mirrors"];
  const promoWarranty = (grade: GradeKey) => ({ "work-ppf": gradeByKey(grade).warranty, "work-scope-glass-film": "seed-wp-heat-film", "work-scope-nano": "seed-wp-interior-nano" });
  addPackage({ id: "seed-pkg-promo-ultimate-club", name: lbl("باقة نادي ألتيميت (180 ميكرون / 10 سنوات)", "Ultimate club package (180 um / 10 years)"), ...promoScope("ultimate", "included", [glass, screens, nano]), primaryServiceId: "full-ppf", gradeKey: "ultimate", priceMinor: 4_499_900, effectiveFrom: ctx.day(-60), effectiveThrough: ctx.day(40), warranty: promoWarranty("ultimate"), benefitKeys: ["wash", "vip"], promo: "club", provenance: "4 October offer (GS-F021): roof/panorama, glass heat film, screens, interior nano gift; limited to 15 cars." });
  addPackage({ id: "seed-pkg-promo-plus-lifetime", name: lbl("باقة بلس مدى الحياة (200 ميكرون)", "Plus lifetime package (200 um)"), ...promoScope("plus", "included", [glass, screens, nano, lights]), primaryServiceId: "full-ppf", gradeKey: "plus", priceMinor: 5_299_900, effectiveFrom: ctx.day(-52), effectiveThrough: ctx.day(40), warranty: promoWarranty("plus"), benefitKeys: ["wash", "vip", "tow"], promo: "plus", provenance: "18 October 2026 offer (GS-F022)." });
  addPackage({ id: "seed-pkg-promo-recent-ultimate", name: lbl("عرض ألتيميت الأخير 39,999", "Recent Ultimate offer 39,999"), ...promoScope("ultimate", "excluded", [glass, nano, lights]), primaryServiceId: "full-ppf", gradeKey: "ultimate", priceMinor: 3_999_900, effectiveFrom: ctx.day(-6), effectiveThrough: ctx.day(40), warranty: promoWarranty("ultimate"), promo: "recent", provenance: "Recent Ultimate offer (GS-F024); roof not explicitly included." });
  addPackage({ id: "seed-pkg-promo-nov-from", name: lbl("إعلان 5 نوفمبر - فيلم يبدأ من 32,999", "5 November announcement - film from 32,999"), ...promoScope("pro", "excluded", []), primaryServiceId: "full-ppf", gradeKey: "pro", priceMinor: 3_299_900, effectiveFrom: ctx.day(-16), effectiveThrough: ctx.day(9), warranty: { "work-ppf": "seed-wp-ppf-pro" }, benefitKeys: ["inspection", "tow", "wash", "vip", "fourth"], promo: "nov", provenance: "5 November 2026 announcement (GS-F026): film from 32,999, free handover inspection, free Cairo tow, free washing during warranty, chauffeur car. Eligibility unverified." });

  // Roof add-on is size dependent and the adjacent services are unconfirmed: draft items with an unconfigured price.
  const draft = (key: string, serviceId: string, en: string, ar: string, note: string, unconfirmed = true) => {
    addPackage({
      id: `seed-pkg-draft-${key}`, kind: "standalone", state: "draft", name: unconfirmed ? lbl(`${ar} - التوفر غير مؤكد`, `${en} - availability unconfirmed`) : lbl(ar, en), scope: [scopeItem("scope-main", serviceId, { areas: [key] })],
      work: [], primaryServiceId: serviceId, priceMinor: null, provenance: `${note} Availability unconfirmed.`,
    });
  };
  draft("roof", "full-ppf", "Roof PPF add-on (size dependent)", "إضافة السقف (حسب المقاس)", "GS-F017: roof addition depends on size.", false);
  draft("wrapping", "seed-svc-wrapping", "Vehicle wrapping", "تغليف السيارات (راب)", "GS-F014 Instagram highlight.");
  draft("carbon-fiber", "seed-svc-carbon-fiber", "Carbon fibre trim", "كربون فايبر", "GS-F014 Instagram highlight.");
  draft("steering-wheel", "seed-svc-steering-wheel", "Steering wheels", "دركسيون", "GS-F014 Instagram highlight.");
  draft("rims", "seed-svc-rims", "Rims", "جنوط", "GS-F014 Instagram highlight.");
  draft("accessories", "seed-svc-accessories", "Accessories", "إكسسوارات", "GS-F014 official material.");
  draft("modifications", "seed-svc-modifications", "Modifications", "تعديلات", "GS-F014 official material.");
  draft("home-window-film", "seed-svc-home-window-film", "Home / commercial window heat film - 999 EGP per m2", "فيلم عازل للحرارة للمنازل والمحلات - 999 جنيه للمتر", "GS-F015: 23 July 2026 post.");

  for (const pkg of packages) {
    const published = pkg.state !== "draft";
    const approval = { approvedBy: OWNER, approvedAt: base.toISOString(), evidenceRef: EVIDENCE, reason: SEED_REASON };
    let price: unknown, tax: unknown, aggregation: unknown;
    if (published && pkg.priceMinor !== null) {
      const pricingRef = policyRows(`catalogue-pricing:seed-${pkg.id.replace("seed-pkg-", "")}-v${pkg.version}`, "catalogue-pricing", {
        name: pkg.name, serviceId: pkg.primaryServiceId, vehicleCategoryId: categoryId(pkg.categories[0]), gradeId: pkg.gradeKey ? gradeByKey(pkg.gradeKey).id : "seed-grade-none",
        roof: pkg.scope[0].roof, price: { minor: pkg.priceMinor, currency: "EGP" }, tax: null,
        bayType: serviceById(pkg.primaryServiceId).bayType, bayHours: serviceById(pkg.primaryServiceId).bayHours, exclusions: pkg.scope[0].exclusions,
      }, { from: pkg.effectiveFrom ?? windowStart });
      price = { state: "approved", value: { minor: pkg.priceMinor, currency: "EGP" }, policy: pricingRef, approval };
      tax = { state: "approved", value: { rule: taxPolicy, amount: { minor: 0, currency: "EGP" } }, policy: taxPolicy, approval };
      aggregation = { state: "approved", value: { rule: occ(pkg.primaryServiceId), mode: "sum" }, policy: occ(pkg.primaryServiceId), approval };
    } else {
      price = { state: "unconfigured", missing: ["approved price", "availability confirmation"] };
      tax = { state: "unconfigured", missing: ["approved tax treatment"] };
      aggregation = { state: "unconfigured", missing: ["approved work aggregation"] };
    }
    ds.add("catalogue_package_versions", {
      package_id: pkg.id, version: pkg.version, revision: pkg.revision, kind: pkg.kind, state: pkg.state, name: json(pkg.name),
      vehicle_category_ids: pkg.categories.map(categoryId), vehicle_models: [], branch_ids: [BRANCH_A, BRANCH_B],
      effective_from: pkg.effectiveFrom, effective_through: pkg.effectiveThrough, scope: json(pkg.scope), work: json(pkg.work),
      price: json(price), tax: json(tax), work_aggregation: json(aggregation), provenance: pkg.provenance,
      approval: published ? json(approval) : null, created_by: OWNER, created_at: base,
    });
    if (pkg.state === "published") ds.add("catalogue_package_active", { package_id: pkg.id, version: pkg.version, retired: false });
    ds.add("catalogue_audit", {
      entity_kind: "package", entity_id: pkg.id, version: pkg.version, action: published ? "published" : "draft-saved", actor_id: OWNER, reason: SEED_REASON, occurred_at: base,
    });
    if (pkg.state === "retired") {
      ds.add("catalogue_audit", { entity_kind: "package", entity_id: pkg.id, version: pkg.version, action: "retired", actor_id: OWNER, reason: "Superseded by version 2", occurred_at: ctx.at("2026-06-01", "09:00") });
    }
  }

  /* warranty policies (+ policy audit) */
  for (const policy of WARRANTY_POLICIES) {
    const published = policy.status !== "draft";
    const at = ctx.at(policy.publishedOn ?? windowStart, "10:00");
    ds.add("warranty_policies", {
      policy_id: policy.id, version: policy.version, name: policy.name, eligible_service_ids: policy.services, auto_issue: policy.auto,
      start_rule: "job-delivery", duration_months: policy.months, exclusions: "Draft exclusions: misuse, collision damage, third-party removal. The Owner must confirm them before publishing.",
      evidence_requirements: "Draft evidence: dated photos and the job card. The Owner must confirm before publishing.",
      review_role: policy.reviewRole, response_days: 5, status: policy.status, created_by: OWNER, published_by: published ? OWNER : null,
      created_at: at, published_at: published ? at : null, coverage_kind: policy.kind,
      lifetime_definition: policy.kind === "lifetime" ? json(lifetimeDefinition(policy, at)) : null,
    });
    ds.add("warranty_audit_events", {
      id: `seed-wae-policy-${policy.id}-v${policy.version}`, policy_id: policy.id, policy_version: policy.version,
      action: published ? "policy-published" : "policy-drafted", details: SEED_REASON, actor_user_id: OWNER, created_at: at,
    });
  }

  /* branch availability (capacity) */
  const capacity = {
    [BRANCH_A]: { limit: 8, bays: { clean: 2, general: 4 } },
    [BRANCH_B]: { limit: 6, bays: { clean: 1, general: 3 } },
  } as const;
  for (const branchId of BRANCH_IDS) {
    ds.add("branch_availability_versions", {
      branch_id: branchId, version: 1, timezone: "Africa/Cairo", opens_at: "08:00", closes_at: "17:00",
      working_weekdays: [0, 1, 2, 3, 4, 6], slot_minutes: 60, daily_intake_limit: capacity[branchId].limit,
      bay_counts: json(capacity[branchId].bays), effective_from: windowStart, approved_by: OWNER, approved_at: base, reason: SEED_REASON,
    });
    ds.add("branch_availability_active", { branch_id: branchId, version: 1, activated_at: base, activated_by: OWNER });
    ds.add("branch_availability_audit", { id: `seed-bav-${branchId}-1`, branch_id: branchId, version: 1, action: "activated", actor_id: OWNER, reason: SEED_REASON, occurred_at: base });
    for (const [date, reason] of CLOSURES) ds.add("branch_availability_closures", { branch_id: branchId, version: 1, closed_date: date, reason });
  }

  /* messaging channel (simulation only: provider delivery stays disabled) */
  ds.add("messaging_channels", { id: channelId, provider: "simulation", display_label: "WhatsApp simulator", status: "sandbox", provider_asset_ref: "simulation:seed", enabled_at: base });
  for (const [index, language] of (["ar", "en"] as const).entries()) {
    ds.add("messaging_delivery_policies", {
      channel_id: channelId, version: index + 1, language, customer_service_window_hours: 24, approved_template_ref: null,
      consent_basis_ref: "private:seed/consent-basis", retention_days: 365, approved_by: OWNER, approved_at: base, expires_at: null, active: false,
    });
  }
  for (const staffId of ["demo-manager", "demo-reception", "seed-manager-b", "seed-reception-b"]) {
    ds.add("messaging_inbox_memberships", { staff_user_id: staffId, status: "active", granted_by: OWNER, granted_at: base });
    ds.add("messaging_inbox_access_audit", { id: `seed-mia-${staffId}`, staff_user_id: staffId, action: "granted", actor_user_id: OWNER, occurred_at: base });
  }

  return { windowStart, packages, taxPolicy, acceptancePolicy, issuanceAuthority, promoPolicies, promoCaps, benefitPolicies, financePolicies, channelId };
}

/** Public holidays (approximate, fictional calendar entries) closed in both branches. */
export const CLOSURES: Array<[string, string]> = [
  ["2026-01-07", "Coptic Christmas"],
  ["2026-01-25", "Revolution Day"],
  ["2026-03-20", "Eid al-Fitr"],
  ["2026-04-25", "Sinai Liberation Day"],
  ["2026-05-27", "Eid al-Adha"],
  ["2026-07-23", "Revolution anniversary"],
  ["2026-10-06", "Armed Forces Day"],
];

export const packageAt = (reference: Reference, id: string, date: string) =>
  reference.packages.filter((pkg) => pkg.id === id && pkg.state !== "draft" && (!pkg.effectiveFrom || pkg.effectiveFrom <= date) && (!pkg.effectiveThrough || date <= pkg.effectiveThrough))
    .sort((a, b) => b.version - a.version)[0];
