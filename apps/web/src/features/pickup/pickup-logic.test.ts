import { describe, expect, it } from "vitest";
import { PickupApiError, cancelReady, pickupErrorCopy, promiseProblem, toIso, withCurrentRevision } from "./pickup-logic";

const now = new Date("2026-11-22T10:00:00");
const good = { promisedLocal: "2026-11-25T14:00", evidenceRef: "private:agreements/2026_11-abc", reason: "Customer agreed by phone" };

describe("pickup promise logic", () => {
  it("validates date, evidence and reason", () => {
    expect(promiseProblem(good, now)).toBeNull();
    expect(promiseProblem({ ...good, promisedLocal: "" }, now)).toBe("date");
    expect(promiseProblem({ ...good, promisedLocal: "2026-11-20T10:00" }, now)).toBe("date");
    expect(promiseProblem({ ...good, evidenceRef: "https://x" }, now)).toBe("evidence");
    expect(promiseProblem({ ...good, reason: "  " }, now)).toBe("reason");
    expect(cancelReady(" ")).toBe(false);
    expect(cancelReady("customer changed plan")).toBe(true);
    expect(toIso("2026-11-25T14:00")).toMatch(/Z$/);
  });
  it("maps server codes to EN and AR", () => {
    expect(pickupErrorCopy("POLICY_UNCONFIGURED", "en")).toMatch(/not approved/);
    expect(pickupErrorCopy("STALE_COMMITMENT", "ar")).toMatch(/تغيير/);
    expect(pickupErrorCopy("ROLE_FORBIDDEN", "en")).toMatch(/branch manager/);
    expect(pickupErrorCopy("nope", "en")).toMatch(/could not be saved/);
  });
  it("reads the revision first and retries once on stale", async () => {
    const seen: number[] = [];
    let head = 3;
    const ok = await withCurrentRevision(async () => head, async (r) => { seen.push(r); if (r === 3) { head = 4; throw new PickupApiError(409, "STALE_COMMITMENT"); } return "done"; });
    expect(ok).toBe("done"); expect(seen).toEqual([3, 4]);
    await expect(withCurrentRevision(async () => 1, async () => { throw new PickupApiError(403, "ROLE_FORBIDDEN"); })).rejects.toMatchObject({ code: "ROLE_FORBIDDEN" });
    const twice: number[] = [];
    await expect(withCurrentRevision(async () => 1, async (r) => { twice.push(r); throw new PickupApiError(409, "STALE_COMMITMENT"); })).rejects.toMatchObject({ code: "STALE_COMMITMENT" });
    expect(twice).toEqual([1, 1]);
  });
});
