import { describe, expect, it, vi } from "vitest";
import { reclaimInvitation } from "./reclaim-invitation";

const runner = (responses: Array<{ rows: Array<Record<string, unknown>>; rowCount: number }>) => {
  const query = vi.fn();
  for (const response of responses) query.mockResolvedValueOnce(response);
  return { query };
};

describe("reclaimInvitation (P2T-022)", () => {
  it("does nothing when the identity has no inactive row", async () => {
    const client = runner([{ rows: [], rowCount: 0 }]);
    expect(await reclaimInvitation(client, "u1", "a@x.com", "A")).toBe(false);
    expect(client.query).toHaveBeenCalledTimes(1);
  });
  it("does nothing when there is no matching pending invitation", async () => {
    const client = runner([{ rows: [{ clerk_user_id: "u1" }], rowCount: 1 }, { rows: [], rowCount: 0 }]);
    expect(await reclaimInvitation(client, "u1", "a@x.com", "A")).toBe(false);
    expect(client.query).toHaveBeenCalledTimes(2);
  });
  it("replaces the old rights with the new invitation's and consumes the invitation", async () => {
    const invitation = { clerk_user_id: "invite-1", role: "receptionist", branch_ids: ["b2"], permissions: { "bookings.manage": false } };
    const client = runner([{ rows: [{ clerk_user_id: "u1" }], rowCount: 1 }, { rows: [invitation], rowCount: 1 }, { rows: [], rowCount: 1 }, { rows: [], rowCount: 1 }]);
    expect(await reclaimInvitation(client, "u1", "a@x.com", "Ann")).toBe(true);
    const [, deleteCall, updateCall] = client.query.mock.calls.slice(1);
    expect(String(deleteCall[0])).toMatch(/DELETE FROM staff_memberships/);
    expect(deleteCall[1]).toEqual(["invite-1"]);
    expect(String(updateCall[0])).toMatch(/status = 'active'/);
    expect(updateCall[1]).toEqual(["u1", "receptionist", ["b2"], { "bookings.manage": false }, "a@x.com", "Ann"]);
  });
});
