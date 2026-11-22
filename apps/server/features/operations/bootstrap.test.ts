import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GarageActor } from "../auth/authz";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../infrastructure/database/db", () => ({ pool: { query } }));

const { loadGarageBootstrap, hasOperationalAccess } = await import("./bootstrap");

const actor = (role: GarageActor["role"], extra: Partial<GarageActor> = {}): GarageActor =>
  ({ userId: `${role}-1`, email: "", name: role, role, branchIds: ["b1"], ...extra });

let sqlLog: string[];
beforeEach(() => {
  sqlLog = [];
  query.mockReset();
  query.mockImplementation(async (sql: string) => {
    sqlLog.push(sql);
    if (/FROM branches/.test(sql)) return { rows: [{ id: "b1", name_en: "B", name_ar: "B", daily_dropoff_limit: 5, working_hours: "8", clean_bays: 1, general_bays: 1, weekly_day_off: "Fri" }] };
    if (/FROM warranty_verification_settings/.test(sql)) return { rowCount: 1, rows: [{ enabled: true, approved_fields: [] }] };
    if (/FROM jobs j/.test(sql)) return { rows: [{ id: "j1", booking_id: "bk1", customer_id: "c1", vehicle_id: "v1", service_id: "tint", branch_id: "b1", stage: "in-service", assigned_user_id: "technician-1", updated_at: new Date() }] };
    if (/FROM bookings b/.test(sql)) return { rows: [{ id: "bk1", customer_id: "c1", vehicle_id: "v1", service_id: "tint", branch_id: "b1", dropoff_date: "2026-01-01", dropoff_time: "10:00", expected_pickup: "2026-01-02", status: "confirmed", work_summary_en: null, work_summary_ar: null, accepted_quote_id: null, accepted_quote_revision: null }] };
    if (/FROM warranty_policies/.test(sql)) return { rows: [{ policy_id: "p1", version: 1, name: "P", eligible_service_ids: [], auto_issue: false, start_rule: "delivery", duration_months: 12, coverage_kind: "fixed", lifetime_definition: null, exclusions: "", evidence_requirements: "", review_role: "owner", response_days: 3, status: "published", created_at: new Date(), published_at: null }] };
    return { rows: [], rowCount: 0 };
  });
});

describe("bootstrap data minimisation (P2T-011)", () => {
  it("gives a technician only their jobs and no warranty policy metadata", async () => {
    const { state } = await loadGarageBootstrap(actor("technician"));
    expect(state.jobs).toHaveLength(1);
    expect(state.warrantyPolicies).toEqual([]);
    expect(state.warrantyVerificationSettings).toEqual({ enabled: false, approvedFields: [] });
    expect(sqlLog.some((s) => /warranty_policies|warranty_verification_settings/.test(s))).toBe(false);
  });

  it("omits bookings and jobs for a receptionist whose operational capabilities are all revoked", async () => {
    const revoked = actor("receptionist", {
      permissions: { "bookings.manage": false, "customers.read": false, "whatsapp.use": false, "transport.coordinate": false, "warranty.view": false, "quotes.view": false },
    });
    expect(hasOperationalAccess(revoked)).toBe(false);
    const { state } = await loadGarageBootstrap(revoked);
    expect(state.jobs).toEqual([]);
    expect(state.bookings).toEqual([]);
    expect(state.warrantyPolicies).toEqual([]);
    expect(sqlLog.some((s) => /FROM jobs j|FROM bookings b|warranty_policies/.test(s))).toBe(false);
  });

  it("omits warranty policies when warranty.view is revoked but keeps bookings", async () => {
    const { state } = await loadGarageBootstrap(actor("receptionist", { permissions: { "warranty.view": false } }));
    expect(state.bookings).toHaveLength(1);
    expect(state.warrantyPolicies).toEqual([]);
    expect(sqlLog.some((s) => /warranty_policies/.test(s))).toBe(false);
  });

  it("returns bookings, jobs and policies for a receptionist and owner by default", async () => {
    for (const role of ["receptionist", "owner"] as const) {
      const { state } = await loadGarageBootstrap(actor(role));
      expect(state.bookings).toHaveLength(1);
      expect(state.jobs).toHaveLength(1);
      expect(state.warrantyPolicies).toHaveLength(1);
    }
  });

  it("grants warranty metadata to a technician override only through warranty.view", async () => {
    const { state } = await loadGarageBootstrap(actor("technician", { permissions: { "warranty.view": true } }));
    expect(state.warrantyPolicies).toHaveLength(1);
  });
});
