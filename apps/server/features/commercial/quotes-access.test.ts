import { describe, expect, it, vi } from "vitest";
import type { GarageActor } from "../auth/authz";

vi.mock("../../infrastructure/database/db", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
  withTransaction: vi.fn(),
}));
const { listQuotes } = await import("./quote-service");
const { listReservations } = await import("./reservation-service");
const { listBenefits } = await import("./benefit-service");
const { evaluateQualification } = await import("./qualification-service");
const { generateQuoteDraft } = await import("./quote-generation");
const { listActivePromotions, commercialContext } = await import("./policy-service");
const { pool } = await import("../../infrastructure/database/db");

const actor = (role: GarageActor["role"], extra: Partial<GarageActor> = {}): GarageActor => ({
  userId: `${role}-1`, email: "", name: role, role, branchIds: ["b1"], ...extra,
});
const ctx = commercialContext;

describe("quotes.view vs quotes.manage", () => {
  it("lets a branch manager list quotes, reservations, benefits and promotions", async () => {
    const m = actor("branch-manager");
    await expect(listQuotes(ctx, m)).resolves.toEqual([]);
    await expect(listReservations(ctx, m)).resolves.toEqual([]);
    await expect(listBenefits(ctx, m)).resolves.toEqual([]);
    await expect(listActivePromotions(m)).resolves.toEqual([]);
  });
  it("returns 403 for a branch manager on writes", async () => {
    const m = actor("branch-manager");
    await expect(generateQuoteDraft(ctx, m, { kind: "special-request", requestId: "r" } as never)).rejects.toMatchObject({ status: 403 });
    await expect(evaluateQualification(ctx, m, {} as never)).rejects.toMatchObject({ status: 403 });
  });
  it("denies a technician reads", async () => {
    const t = actor("technician");
    await expect(listQuotes(ctx, t)).rejects.toMatchObject({ status: 403 });
    await expect(listReservations(ctx, t)).rejects.toMatchObject({ status: 403 });
    await expect(listBenefits(ctx, t)).rejects.toMatchObject({ status: 403 });
    await expect(listActivePromotions(t)).rejects.toMatchObject({ status: 403 });
  });
  it("an owner override grants quotes.manage to a manager", async () => {
    const m = actor("branch-manager", { permissions: { "quotes.manage": true } });
    await expect(evaluateQualification(ctx, m, { promotionRef: { id: "bad", version: 1 }, beneficiaryId: "c", vehicleIds: ["v"], evidence: [] } as never))
      .rejects.toMatchObject({ status: 400 });
  });
  it("lists active promotions in the shape the web expects", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 1, rows: [{
      policy_id: "promotion-qualification:p1", family: "promotion-qualification", version: 2, branch_id: null, effective_from: null, effective_through: null, state: "approved",
      approved_by: "o", approved_at: new Date(), value: {
        promotionId: "p1", evidenceKinds: ["membership-verification"], evidenceVerification: { required: true, authorizedRoles: ["owner"], expiresAfterDays: null }, maximumUnits: 5,
        recipient: { kind: "customer", transferWarranty: false }, stackability: { allowed: false, permittedPromotionIds: [] },
        grouping: { minimumVehicles: 1, maximumVehicles: 1, timing: "same-quote", timingWindowHours: 1 },
        discountAllocation: { kind: "per-vehicle-fixed", total: { minor: 100, currency: "EGP" }, perVehicle: { minor: 100, currency: "EGP" } },
        exceptionAuthority: { roles: ["owner"], requiresReason: true, requiresEvidence: true }, beneficiaryRule: { ar: "a", en: "Members" },
      } }] } as never);
    const out = await listActivePromotions(actor("receptionist"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ ref: { id: "promotion-qualification:p1", version: 2 }, name: { ar: "a", en: "Members" }, status: "active" });
    expect(out[0].value).toMatchObject({ maximumUnits: 5 });
  });
  it("hides branch-scoped promotions outside the actor's branches", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 1, rows: [{ policy_id: "promotion-qualification:p2", version: 1, branch_id: "other", state: "approved", approved_by: "o", approved_at: new Date(), effective_from: null, effective_through: null, value: {} }] } as never);
    await expect(listActivePromotions(actor("receptionist"))).resolves.toEqual([]);
  });
});
