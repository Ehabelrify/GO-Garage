import { describe, expect, it, vi } from "vitest";
import type { GarageActor } from "../auth/authz";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query },
  withTransaction: async (run: (client: { query: typeof query }) => unknown) => run({ query }),
}));
const service = await import("./special-requests-service");

const actor = (role: GarageActor["role"], extra: Partial<GarageActor> = {}): GarageActor => ({ userId: `${role}-1`, email: "", name: role, role, branchIds: ["branch-a"], ...extra });
const input = { customerId: "c1", vehicleId: "v1", title: "T", description: "D", requestedFrom: "2026-12-01", preferredTimeNote: "", budgetNote: "" };
const decision = { expectedRevision: 1, decision: "declined" as const, message: "No", durationNote: "", ownerNotes: "" };
const empty = () => { query.mockReset(); query.mockResolvedValue({ rows: [], rowCount: 0 }); };

describe("special request authorization", () => {
  it("denies technicians before touching the database", async () => {
    empty();
    await expect(service.listRequests(actor("technician"), {})).rejects.toMatchObject({ status: 403 });
    await expect(service.createRequest(actor("technician"), input)).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });
  it("only reviewers decide; receptionists and managers cannot", async () => {
    empty();
    await expect(service.decide(actor("receptionist"), "sr-1", decision)).rejects.toMatchObject({ status: 403 });
    await expect(service.decide(actor("branch-manager"), "sr-1", decision)).rejects.toMatchObject({ status: 403 });
    await expect(service.startReview(actor("receptionist"), "sr-1", 1)).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });
  it("the review capability is grantable to a manager", async () => {
    empty();
    const manager = actor("branch-manager", { permissions: { "special-requests.review": true } });
    await expect(service.decide(manager, "sr-1", decision)).rejects.toMatchObject({ status: 404, code: "REQUEST_NOT_FOUND" });
  });
  it("demo identities cannot write, even the owner role", async () => {
    empty();
    const demoOwner = actor("owner", { isDemo: true });
    await expect(service.createRequest(demoOwner, input)).rejects.toMatchObject({ status: 403, code: "DEMO_ACTION_DISABLED" });
    await expect(service.decide(demoOwner, "sr-1", decision)).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });
    expect(query).not.toHaveBeenCalled();
  });
  it("rejects an incomplete accept before any query", async () => {
    empty();
    await expect(service.decide(actor("owner"), "sr-1", { ...decision, decision: "accepted" })).rejects.toMatchObject({ status: 400, code: "DECISION_INCOMPLETE" });
    expect(query).not.toHaveBeenCalled();
  });
  it("create refuses a vehicle that is not the customer's or is out of scope", async () => {
    empty();
    await expect(service.createRequest(actor("receptionist"), input)).rejects.toMatchObject({ status: 404, code: "VEHICLE_NOT_FOUND" });
  });
  it("create refuses a branch outside the actor's branches", async () => {
    query.mockReset();
    query.mockResolvedValue({ rows: [{ customer_id: "c1" }], rowCount: 1 });
    await expect(service.createRequest(actor("receptionist"), { ...input, branchId: "branch-b" })).rejects.toMatchObject({ status: 403 });
  });
  it("detects a stale revision", async () => {
    query.mockReset();
    query.mockResolvedValue({ rows: [{ id: "sr-1", status: "new", revision: 5, quote_id: null }], rowCount: 1 });
    await expect(service.startReview(actor("owner"), "sr-1", 1)).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
  });
  it("refuses a decision on a closed request", async () => {
    query.mockReset();
    query.mockResolvedValue({ rows: [{ id: "sr-1", status: "closed", revision: 1, quote_id: null }], rowCount: 1 });
    await expect(service.decide(actor("owner"), "sr-1", decision)).rejects.toMatchObject({ status: 409, code: "INVALID_STATE" });
  });
});
