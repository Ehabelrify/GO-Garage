import { SEED_REASON, addDays, daysBetween, json, qrToken, qrTokenHash } from "./seed-core";
import { BRANCH_A, OWNER, managerOf, receptionOf } from "./seed-people";
import { lifetimeDefinition, serviceById, warrantyPolicyAt, WARRANTY_POLICIES } from "./seed-reference";
import type { VisitRec, WarrantyRec, World } from "./seed-world";

const CURRENCY = "EGP";
const ev = (kind: string, n: string) => `private:seed/${kind}-${n}`;
const addMonthsIso = (date: string, months: number) => {
  const [y, m, d] = date.split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12), month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const out = new Date(Date.UTC(year, month, Math.min(d, last)));
  out.setUTCDate(out.getUTCDate() - 1);
  return out.toISOString().slice(0, 10);
};

/* ----------------------------- delivery hook ----------------------------- */

export function deliverVisit(world: World, visit: VisitRec) {
  issueWarranties(world, visit);
  recordVisitFinance(world, visit);
  materializeDeliveredBenefits(world, visit);
}

/* -------------------------------- warranties -------------------------------- */

function issueWarranties(world: World, visit: VisitRec) {
  const { ds, ctx, rng } = world;
  if (!visit.deliveredDate || !visit.deliveredAt) return;
  const targets: Array<{ componentId: string | null; serviceId: string; policyId: string; price: number; version?: number }> = [];
  if (visit.quote?.accepted) {
    visit.quote.warrantyBindings.forEach((binding, index) => {
      const component = visit.quote!.work.find((item) => item.id === binding.componentId)!;
      targets.push({ componentId: binding.componentId, serviceId: component.serviceId, policyId: binding.policy.id, version: binding.policy.version, price: index === 0 ? visit.saleMinor : 0 });
    });
  } else if (visit.product.warrantyPolicyId) {
    targets.push({ componentId: null, serviceId: visit.product.serviceId, policyId: visit.product.warrantyPolicyId, price: visit.saleMinor });
  }
  if (!targets.length) return;
  // A realistic share of delivered jobs has not been issued yet (pending review), except rich customers and promo packages.
  if (!visit.rich && !visit.quote && rng.chance(0.07)) return;
  const issuer = visit.branchId === BRANCH_A ? "demo-reception" : receptionOf(visit.branchId);

  for (const target of targets) {
    const policy = target.version ? WARRANTY_POLICIES.find((item) => item.id === target.policyId && item.version === target.version)! : warrantyPolicyAt(target.policyId, visit.deliveredDate);
    const id = `seed-war-${String(visit.n).padStart(4, "0")}${target.componentId ? `-${target.componentId.replace(/^work-/, "").slice(0, 8)}` : ""}`;
    const issuedAt = new Date(visit.deliveredAt.getTime() + 10 * 60_000);
    const startDate = visit.deliveredDate;
    const expiresOn = policy.kind === "fixed" ? addMonthsIso(startDate, policy.months!) : null;
    const voided = !visit.rich && rng.chance(0.03);
    const lifetime = policy.kind === "lifetime" ? lifetimeDefinition(policy, issuedAt) : null;
    const invoiceId = `seed-winv-${id.slice(9)}`;
    const policyDefinition = WARRANTY_POLICIES.find((item) => item.id === policy.id && item.version === policy.version)!;
    ds.add("warranties", {
      id, policy_id: policy.id, policy_version: policy.version, job_id: visit.jobId, customer_id: visit.customer.id, vehicle_id: visit.vehicle.id,
      branch_id: visit.branchId, service_id: target.serviceId, start_date: startDate, expires_on: expiresOn, status: voided ? "void" : "active",
      void_reason: voided ? "Issued against the wrong vehicle plate; replaced by a corrected card" : null, issued_by: issuer, issued_at: issuedAt,
      coverage_kind: policy.kind, lifetime_definition: lifetime ? json(lifetime) : null, component_id: target.componentId,
      accepted_quote_id: visit.quote?.accepted ? visit.quote.id : null, accepted_quote_revision: visit.quote?.accepted ? visit.quote.revision : null,
      accepted_quote_digest: visit.quote?.accepted ? visit.quote.digest : null,
      issuance_authority: visit.quote?.accepted ? json(world.ref.issuanceAuthority) : null,
    });
    ds.add("warranty_audit_events", {
      id: `seed-wae-${id.slice(9)}-1`, warranty_id: id, action: "warranty-auto-issued",
      details: `Exact policy ${policy.id} version ${policy.version}; component ${target.componentId ?? "legacy"}; accepted quote ${visit.quote?.accepted ? visit.quote.id : "none"}.`,
      actor_user_id: issuer, created_at: issuedAt,
    });
    ds.add("warranty_audit_events", {
      id: `seed-wae-${id.slice(9)}-2`, warranty_id: id, action: "invoice-draft-created", details: "Draft created for covered service; no revenue or payment inferred.", actor_user_id: issuer, created_at: issuedAt,
    });
    void policyDefinition;

    const warranty: WarrantyRec = {
      id, visit, policyId: policy.id, policyVersion: policy.version, kind: policy.kind, componentId: target.componentId, serviceId: target.serviceId,
      startDate, expiresOn, status: voided ? "void" : "active", invoiceId, issuedAt, issuedBy: issuer, activeToken: null, priceMinor: target.price, terminatedOn: null,
    };
    visit.warranties.push(warranty);
    world.warranties.push(warranty);
    if (voided) {
      ds.add("warranty_audit_events", { id: `seed-wae-${id.slice(9)}-3`, warranty_id: id, action: "warranty-voided", details: "Voided with a recorded reason.", actor_user_id: managerOf(visit.branchId), created_at: new Date(issuedAt.getTime() + 86_400_000) });
    } else {
      addQrTokens(world, warranty);
      if (policy.kind === "lifetime" && !visit.rich && daysBetween(startDate, ctx.today) > 120 && rng.chance(0.08)) terminate(world, warranty);
    }
    addInvoice(world, warranty, target.serviceId);
    if (!voided && (visit.rich ? warranty === visit.warranties[0] : daysBetween(startDate, ctx.today) > 25 && rng.chance(0.12))) addClaim(world, warranty);
  }
}

function terminate(world: World, warranty: WarrantyRec) {
  const { ds, ctx } = world;
  const terminatedOn = addDays(warranty.startDate, Math.max(30, Math.floor(daysBetween(warranty.startDate, ctx.today) / 2)));
  warranty.terminatedOn = terminatedOn;
  ds.add("warranty_termination_events", {
    id: `seed-wte-${warranty.id.slice(9)}`, warranty_id: warranty.id, terminated_on: terminatedOn, actor_user_id: OWNER,
    reason: "Vehicle sold to a new owner; lifetime coverage ends with the original vehicle owner", evidence_ref: ev("termination", warranty.id.slice(9)), created_at: ctx.past(terminatedOn, "12:00"),
  });
  ds.add("warranty_audit_events", { id: `seed-wae-${warranty.id.slice(9)}-t`, warranty_id: warranty.id, action: "lifetime-terminated", details: "Termination recorded with evidence.", actor_user_id: OWNER, created_at: ctx.past(terminatedOn, "12:00") });
}

/* --------------------------------- QR tokens --------------------------------- */

function addQrTokens(world: World, warranty: WarrantyRec) {
  const { ds, rng } = world;
  if (!warranty.visit.rich && !rng.chance(0.75)) return;
  const issuer = warranty.issuedBy;
  const replaced = !warranty.visit.rich && rng.chance(0.12);
  const at = (minutes: number) => new Date(warranty.issuedAt.getTime() + minutes * 60_000);
  const key = warranty.id.slice(9);
  if (replaced) {
    const oldToken = qrToken(`${warranty.id}:old`);
    ds.add("warranty_verification_tokens", { id: `seed-wvt-${key}-1`, warranty_id: warranty.id, token_hash: qrTokenHash(oldToken), created_by: issuer, created_at: at(20), revoked_at: at(4000), revoked_by: managerOf(warranty.visit.branchId) });
    ds.add("warranty_qr_print_events", { id: `seed-wqp-${key}-1`, warranty_id: warranty.id, token_id: `seed-wvt-${key}-1`, action: "prepared", replaces_token_id: null, actor_user_id: issuer, created_at: at(20) });
    ds.add("warranty_qr_print_events", { id: `seed-wqp-${key}-2`, warranty_id: warranty.id, token_id: `seed-wvt-${key}-1`, action: "revoked", replaces_token_id: null, actor_user_id: managerOf(warranty.visit.branchId), created_at: at(4000) });
  }
  const token = qrToken(warranty.id);
  const tokenId = `seed-wvt-${key}-${replaced ? 2 : 1}`;
  ds.add("warranty_verification_tokens", { id: tokenId, warranty_id: warranty.id, token_hash: qrTokenHash(token), created_by: issuer, created_at: at(replaced ? 4010 : 20), revoked_at: null, revoked_by: null });
  ds.add("warranty_qr_print_events", { id: `seed-wqp-${key}-a`, warranty_id: warranty.id, token_id: tokenId, action: replaced ? "replaced" : "prepared", replaces_token_id: replaced ? `seed-wvt-${key}-1` : null, actor_user_id: issuer, created_at: at(replaced ? 4010 : 20) });
  ds.add("warranty_qr_print_events", { id: `seed-wqp-${key}-b`, warranty_id: warranty.id, token_id: tokenId, action: "printed", replaces_token_id: null, actor_user_id: issuer, created_at: at(replaced ? 4020 : 40) });
  warranty.activeToken = token;
}

/* ---------------------------------- invoices ---------------------------------- */

function addInvoice(world: World, warranty: WarrantyRec, serviceId: string) {
  const { ds, ctx, rng } = world;
  const visit = warranty.visit;
  const first = visit.warranties[0] === warranty;
  const price = warranty.priceMinor / 100;
  const service = serviceById(serviceId);
  let paid = 0;
  let method: "cash" | "card" | "transfer" | null = null;
  if (first && price > 0) {
    const roll = rng.float();
    paid = visit.rich ? price : roll < 0.78 ? price : roll < 0.9 ? Math.round(price * rng.pick([0.3, 0.5, 0.7]) / 50) * 50 : 0;
    method = paid > 0 ? rng.weighted([["card", 42], ["transfer", 30], ["cash", 28]] as const) : null;
    visit.paidMinor = Math.round(paid * 100);
  }
  const recordedAt = paid > 0 ? new Date(Math.min(warranty.issuedAt.getTime() + 3_600_000, ctx.now.getTime() - 60_000)) : null;
  const quoteBound = Boolean(visit.quote?.accepted);
  ds.add("warranty_invoice_drafts", {
    id: warranty.invoiceId, warranty_id: warranty.id, branch_id: visit.branchId, status: "draft", tax_rate_percent: null, paid_amount: paid,
    payment_method: method, notes: "Tax treatment is not approved; amounts follow the advertised list price." + (visit.quote?.discountMinor ? " Includes a warranty-card referral discount; the discount does not transfer any warranty." : ""),
    created_by: warranty.issuedBy, updated_by: warranty.issuedBy, created_at: warranty.issuedAt, updated_at: recordedAt ?? warranty.issuedAt,
    payment_recorded_at: recordedAt, payment_recorded_by: recordedAt ? warranty.issuedBy : null,
    accepted_quote_id: quoteBound ? visit.quote!.id : null, accepted_quote_revision: quoteBound ? visit.quote!.revision : null,
    component_id: warranty.componentId, sale_source: quoteBound ? "accepted-quote-component" : "legacy-unlinked",
  });
  const description = `${visit.product.label.en} / ${visit.product.label.ar}${warranty.componentId ? ` - ${service.nameEn}` : ""}`.slice(0, 230);
  ds.add("warranty_invoice_draft_items", { id: `${warranty.invoiceId}-i1`, invoice_id: warranty.invoiceId, description, quantity: 1, unit_amount: price > 0 ? price : null, sort_order: 0 });
}

/* ----------------------------------- claims ----------------------------------- */

const CLAIM_TEXT = [
  ["Edge lifting near the rear door handle", "ارتفاع في حافة الفيلم عند مقبض الباب الخلفي", "photo"],
  ["Small bubble under the film on the front bumper", "فقاعة صغيرة تحت الفيلم على الصدام الأمامي", "photo"],
  ["Yellowing observed on the hood after a summer season", "اصفرار ملاحظ على الكبوت بعد موسم الصيف", "photo"],
  ["Heat film peeling at the windshield corner", "تقشر فيلم الحرارة عند ركن الزجاج الأمامي", "photo"],
  ["Water spots on the ceramic layer after washing", "بقع مياه على طبقة السيراميك بعد الغسيل", "photo"],
] as const;

function addClaim(world: World, warranty: WarrantyRec) {
  const { ds, ctx, rng } = world;
  const visit = warranty.visit;
  const age = daysBetween(warranty.startDate, ctx.today);
  if (age < 10) return;
  const text = rng.pick(CLAIM_TEXT);
  const id = `seed-clm-${warranty.id.slice(9)}`;
  const openedAt = ctx.past(addDays(warranty.startDate, Math.min(age - 2, rng.int(15, 150))), "12:20");
  const reviewer = warranty.issuedBy === "demo-reception" ? "demo-manager" : managerOf(visit.branchId);
  const status = visit.rich ? (["approved", "under-review", "approved", "denied", "closed"] as const)[Number(visit.customer.id.slice(-3)) % 5] : rng.weighted([["open", 22], ["under-review", 22], ["approved", 24], ["denied", 12], ["closed", 20]] as const);
  const resolved = ["approved", "denied", "closed"].includes(status);
  const reviewedAt = resolved ? new Date(openedAt.getTime() + 3 * 86_400_000) : null;
  const reviewedAtSafe = reviewedAt && reviewedAt.getTime() > ctx.now.getTime() ? new Date(ctx.now.getTime() - 60_000) : reviewedAt;
  ds.add("warranty_claims", {
    id, warranty_id: warranty.id, summary: `${text[0]} / ${text[1]}`, evidence: "Customer photos and the original job card attached as evidence metadata.",
    status, resolution: resolved ? (status === "approved" ? "Approved. Re-application scheduled at no cost." : status === "denied" ? "Denied. Damage matches a listed exclusion: external impact." : "Closed after the customer confirmed the issue was resolved.") : null,
    opened_by: receptionOf(visit.branchId), reviewed_by: resolved ? reviewer : null, reviewed_at: reviewedAtSafe, created_at: openedAt, updated_at: reviewedAtSafe ?? openedAt,
  });
  ds.add("warranty_audit_events", { id: `seed-wae-${id.slice(9)}-c1`, claim_id: id, action: "claim-opened", details: text[0], actor_user_id: receptionOf(visit.branchId), created_at: openedAt });
  if (resolved) ds.add("warranty_audit_events", { id: `seed-wae-${id.slice(9)}-c2`, claim_id: id, action: `claim-${status}`, details: "Review recorded.", actor_user_id: reviewer, created_at: reviewedAtSafe });
  for (let index = 1; index <= rng.int(1, 3); index++) {
    ds.add("warranty_claim_attachments", {
      id: `seed-cla-${id.slice(9)}-${index}`, claim_id: id, object_name: `seed/claims/${id}/evidence-${index}.jpg`,
      original_filename: `claim-${warranty.id.slice(9)}-photo-${index}.jpg`, content_type: "image/jpeg", byte_size: rng.int(180_000, 2_400_000), uploaded_by: receptionOf(visit.branchId), created_at: openedAt,
    });
  }
}

/* ----------------------------------- finance ----------------------------------- */

export function recordMoneyEvent(world: World, o: {
  kind: "collection" | "refund" | "direct-cost" | "overhead" | "recognized-revenue"; amountMinor: number; at: Date; branchId: string; ref: string;
  method: string; reason: string; customerId?: string | null; jobId?: string | null; quoteId?: string | null; reservationId?: string | null;
}) {
  const { ds, ctx } = world;
  if (o.amountMinor <= 0) return null;
  const definitionKey = o.kind === "collection" || o.kind === "refund" ? "collections" : o.kind === "overhead" ? "net-profit" : (o.kind as "direct-cost" | "recognized-revenue");
  world.moneySeq += 1;
  const id = `seed-mev-${String(world.moneySeq).padStart(5, "0")}`;
  ds.add("operational_money_events", {
    id, environment_id: ctx.environmentId, kind: o.kind, amount_minor: o.amountMinor, currency: CURRENCY, minor_unit_exponent: 2, effective_at: o.at, branch_id: o.branchId,
    customer_id: o.customerId ?? null, job_id: o.jobId ?? null, quote_id: o.quoteId ?? null, reservation_id: o.reservationId ?? null, source_method: o.method,
    source_reference: o.ref, definition_id: world.ref.financePolicies[definitionKey].id, definition_version: 1, reason: o.reason, evidence_ref: ev("money", id.slice(-5)),
    recorded_by: OWNER, created_at: o.at,
  });
  return id;
}

function recordVisitFinance(world: World, visit: VisitRec) {
  const { ctx, rng } = world;
  if (!visit.deliveredAt || !visit.deliveredDate) return;
  const sale = visit.saleMinor;
  if (sale <= 0) return;
  const n = String(visit.n).padStart(4, "0");
  const base = { branchId: visit.branchId, customerId: visit.customer.id, jobId: visit.jobId, quoteId: visit.quote?.accepted ? visit.quote.id : null };
  recordMoneyEvent(world, { ...base, kind: "recognized-revenue", amountMinor: sale, at: visit.deliveredAt, ref: `REV-${n}`, method: "delivery-recognition", reason: "Revenue recognised on delivery" });
  const costRatio = visit.product.kind === "package" ? rng.float() * 0.1 + 0.42 : rng.float() * 0.15 + 0.35;
  recordMoneyEvent(world, { ...base, kind: "direct-cost", amountMinor: Math.round(sale * costRatio), at: new Date(visit.deliveredAt.getTime() - 3_600_000), ref: `COST-${n}`, method: "supplier-invoice", reason: "Film, materials and labour cost for the job" });
  // Collections are recorded after the invoice draft logic assigned paidMinor; deliverVisit runs issueWarranties first.
  const paid = visit.warranties.length ? visit.paidMinor : Math.round(sale * rng.pick([1, 1, 1, 1, 0.5]));
  if (!visit.warranties.length) visit.paidMinor = paid;
  if (paid > 0) {
    const methods = ["cash", "card", "bank-transfer", "instapay"] as const;
    const parts = paid > 2_000_000 && rng.chance(0.6) ? 2 : 1;
    for (let part = 0; part < parts; part++) {
      const amount = part === 0 && parts === 2 ? Math.round(paid * 0.4) : parts === 2 ? paid - Math.round(paid * 0.4) : paid;
      const at = part === 0 && parts === 2 ? ctx.past(addDays(visit.date, -1), "13:00") : new Date(Math.min(visit.deliveredAt.getTime() + 600_000, ctx.now.getTime() - 60_000));
      const id = recordMoneyEvent(world, { ...base, reservationId: part === 0 && visit.reservation ? visit.reservation.id : null, kind: "collection", amountMinor: amount, at, ref: `RCPT-${n}-${part + 1}`, method: rng.pick(methods), reason: part === 0 && parts === 2 ? "Booking advance" : "Payment on delivery" });
      if (id && part === 1) world.moneyReverseCandidates.push(id);
    }
  }
}

/* ----------------------------------- benefits ----------------------------------- */

export function benefitPolicyKeyById(world: World, policyId: string) {
  return Object.entries(world.ref.benefitPolicies).find(([, ref]) => ref.id === policyId)?.[0] ?? "inspection";
}
const BENEFIT_DEF: Record<string, { trigger: "accepted" | "delivered"; limit: unknown; label: { ar: string; en: string } }> = {
  inspection: { trigger: "accepted", limit: { kind: "quantity", quantity: 1 }, label: { ar: "فحص استلام السيارة الجديدة مجانًا", en: "Free new-car handover inspection" } },
  tow: { trigger: "accepted", limit: { kind: "quantity", quantity: 2 }, label: { ar: "سحب مجاني داخل القاهرة", en: "Free Cairo tow" } },
  wash: { trigger: "delivered", limit: { kind: "recurring", quantity: 1, interval: "calendar-month" }, label: { ar: "غسيل وصيانة مجانية خلال فترة الضمان", en: "Free washing/maintenance during warranty" } },
  vip: { trigger: "accepted", limit: { kind: "quantity", quantity: 2 }, label: { ar: "سيارة سائق / اختيار VIP", en: "Chauffeur car / VIP selection" } },
  fourth: { trigger: "accepted", limit: { kind: "quantity", quantity: 1 }, label: { ar: "السيارة الرابعة مجانًا", en: "Fourth car free" } },
};

export function materializeBenefit(world: World, quote: import("./seed-world").QuoteRec, bindingIndex: number, trigger: "accepted" | "delivered", at: Date, visit: VisitRec | null) {
  const { ds, ctx, rng, ref } = world;
  const binding = quote.benefitBindings[bindingIndex];
  const key = benefitPolicyKeyById(world, binding.id);
  const def = BENEFIT_DEF[key];
  if (def.trigger !== trigger) return;
  const id = `seed-ben-${quote.id.slice(-4)}-${bindingIndex}`;
  const limit = key === "wash"
    ? { ...(def.limit as object), startsOn: world.ref.windowStart, endsOn: null, eligibilityPolicy: ref.taxPolicy }
    : def.limit;
  const approval = { approvedBy: OWNER, approvedAt: at.toISOString(), evidenceRef: ev("benefit-policy", key), reason: SEED_REASON };
  ds.add("benefit_entitlements", {
    id, environment_id: ctx.environmentId, source_quote_id: quote.id, source_revision: quote.revision, binding_index: bindingIndex, trigger_kind: trigger,
    benefit_id: binding.id, benefit_version: binding.version, customer_id: quote.customer.id, vehicle_id: quote.vehicle.id, branch_ids: ["branch-a", "branch-b"],
    promise: json({
      limit: { state: "approved", value: limit, policy: binding, approval }, eligibilityRule: { ar: "حسب شروط العرض المنشور", en: "Per the published offer terms" },
      activationTrigger: trigger, transferRule: "same-customer-vehicle", cancellationRule: "review-required", expiryRule: { kind: "none" }, reversalRestoresEligibility: true,
    }),
    responsible_team_id: "seed-team-service", status: "active", revision: 1, created_at: at,
  });
  ds.add("benefit_audit", { entitlement_id: id, action: "materialized", actor_id: receptionOf(quote.branchId), event_ref: `${quote.id}:${quote.revision}:${trigger}`, occurred_at: at });

  const redeem = (on: string, quantity: number, windowStart: string | null, n: number, reverse: boolean) => {
    const redemptionId = `${id}-r${n}`;
    const redeemedAt = ctx.past(on, "12:00");
    ds.add("benefit_redemptions", {
      id: redemptionId, entitlement_id: id, quantity, on_date: on, branch_id: quote.branchId, window_starts_on: windowStart,
      fulfillment_ref: `seed-fulfillment-${redemptionId.slice(-8)}`, eligibility_evidence_ref: ev("eligibility", redemptionId.slice(-6)), actor_id: receptionOf(quote.branchId), created_at: redeemedAt,
    });
    ds.add("benefit_audit", { entitlement_id: id, action: "redeemed", actor_id: receptionOf(quote.branchId), event_ref: redemptionId, occurred_at: redeemedAt });
    if (reverse) {
      ds.add("benefit_reversals", { id: `${redemptionId}-rev`, redemption_id: redemptionId, reason: "Service not performed; redemption reversed", evidence_ref: ev("reversal", redemptionId.slice(-6)), restored_quantity: quantity, actor_id: managerOf(quote.branchId), created_at: new Date(redeemedAt.getTime() + 86_400_000) });
      ds.add("benefit_audit", { entitlement_id: id, action: "reversed", actor_id: managerOf(quote.branchId), event_ref: redemptionId, occurred_at: new Date(redeemedAt.getTime() + 86_400_000) });
    }
  };
  const startDay = (visit?.deliveredDate ?? visit?.date ?? quote.acceptedOn ?? ctx.today);
  if (key === "wash" && visit?.deliveredDate) {
    const windows: Array<{ start: string; end: string; consumed: number }> = [];
    let cursor = `${visit.deliveredDate.slice(0, 7)}-01`;
    while (cursor <= ctx.today && windows.length < 8) {
      const [year, month] = cursor.split("-").map(Number);
      const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      const used = cursor > visit.deliveredDate.slice(0, 7) + "-01" && end < ctx.today && rng.chance(0.5);
      windows.push({ start: cursor, end, consumed: used ? 1 : 0 });
      cursor = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    }
    windows.forEach((window, index) => {
      ds.add("benefit_windows", { entitlement_id: id, starts_on: window.start, ends_on: window.end, quantity: 1, consumed: window.consumed });
      if (window.consumed) redeem(addDays(window.start, 9), 1, window.start, index + 1, false);
    });
  } else if (key !== "wash" && visit && visit.deliveredDate && (key === "inspection" || key === "tow") && rng.chance(0.7)) {
    redeem(startDay, 1, null, 1, key === "tow" && rng.chance(0.25));
  }
}

function materializeDeliveredBenefits(world: World, visit: VisitRec) {
  const quote = visit.quote;
  if (!quote?.accepted || !visit.deliveredAt) return;
  quote.benefitBindings.forEach((_binding, index) => materializeBenefit(world, quote, index, "delivered", visit.deliveredAt!, visit));
}

export const acceptedBenefitTime = (quote: import("./seed-world").QuoteRec) => quote.acceptedAt ?? new Date();
