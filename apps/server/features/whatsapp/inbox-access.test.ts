import { beforeEach, describe, expect, it, vi } from "vitest";
import { canAccessBranch, type GarageActor } from "../auth/authz";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../infrastructure/database/db", () => ({ pool: { query }, withTransaction: vi.fn() }));
const access = await import("./inbox-access");

const actor = (role: GarageActor["role"], branchIds: string[], extra: Partial<GarageActor> = {}): GarageActor => ({ userId: `${role}-1`, email: "", name: role, role, branchIds, ...extra });
const member = (status: "active" | "revoked" | null) => query.mockResolvedValue({ rows: status ? [{ staff_user_id: "x", status }] : [] });
beforeEach(() => query.mockReset());

// P2T-013, owner decision 22 Nov 2026: all branches see each other's central inbox conversations
// for users who hold whatsapp.use AND an active central membership. Membership grants conversation
// scope only; it never grants customer, booking, finance or export authority.
describe("central inbox access (P2T-013)", () => {
  const conversationElsewhere = { branchId: "b2" };

  it("list/direct access/reply: active member on another branch can access the conversation", async () => {
    member("active");
    const manager = actor("branch-manager", ["b1"]);
    const membership = await access.loadInboxMembership(manager.userId);
    expect(access.canAccessInbox(manager, membership, conversationElsewhere)).toBe(true);
    await expect(access.canActorAccessInboxBranch(manager, "b2")).resolves.toBe(true);
  });
  it("without membership the same user is limited to their own branches", async () => {
    member(null);
    const manager = actor("branch-manager", ["b1"]);
    await expect(access.canActorAccessInboxBranch(manager, "b2")).resolves.toBe(false);
    await expect(access.canActorAccessInboxBranch(manager, "b1")).resolves.toBe(true);
  });
  it("revoked membership takes effect on the next check (reply after revoke is refused)", async () => {
    const manager = actor("branch-manager", ["b1"]);
    member("active");
    await expect(access.canActorAccessInboxBranch(manager, "b2")).resolves.toBe(true);
    member("revoked");
    await expect(access.canActorAccessInboxBranch(manager, "b2")).resolves.toBe(false);
    expect(access.canAccessInbox(manager, { staffUserId: "x", status: "revoked" }, conversationElsewhere)).toBe(false);
  });
  it("requires whatsapp.use even with an active membership", () => {
    const technician = actor("technician", ["b1"]);
    expect(access.canAccessInbox(technician, { staffUserId: "x", status: "active" }, conversationElsewhere)).toBe(false);
    const stripped = actor("receptionist", ["b1"], { permissions: { "whatsapp.use": false } });
    expect(access.canAccessInbox(stripped, { staffUserId: "x", status: "active" }, conversationElsewhere)).toBe(false);
  });
  it("conversation access does not grant branch authority for customers, bookings, finance or exports", () => {
    const manager = actor("branch-manager", ["b1"]);
    expect(access.canAccessInbox(manager, { staffUserId: "x", status: "active" }, conversationElsewhere)).toBe(true);
    expect(canAccessBranch(manager, "b2")).toBe(false);
  });
  it("membership changes are owner-only", async () => {
    await expect(access.setInboxMembership(actor("branch-manager", ["b1"]), { staffUserId: "u", active: true })).rejects.toMatchObject({ status: 403 });
  });
});
