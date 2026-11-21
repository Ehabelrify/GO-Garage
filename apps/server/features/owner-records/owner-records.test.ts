import { describe, expect, it, vi } from "vitest";
import type { GarageActor } from "../auth/authz";

vi.mock("../../infrastructure/database/db", () => ({ pool: { query: vi.fn() }, withTransaction: vi.fn() }));
const { assertOwnerControl, archiveRecord, deleteRecord } = await import("./owner-records");
const { withTransaction } = await import("../../infrastructure/database/db");

const actor = (role: GarageActor["role"], extra: Partial<GarageActor> = {}): GarageActor => ({ userId: `${role}-1`, email: "", name: role, role, branchIds: ["b1"], ...extra });

describe("owner record control", () => {
  it("is owner-only and blocked for demo identities and non-owners", () => {
    expect(() => assertOwnerControl(actor("owner"))).not.toThrow();
    expect(() => assertOwnerControl(actor("owner", { isDemo: true }))).toThrow(/demo/i);
    expect(() => assertOwnerControl(actor("branch-manager", { permissions: { "settings.manage": true } as never }))).toThrow(/Owner/);
  });
  it("requires a reason and rejects hard delete of history-bearing kinds before any query", async () => {
    await expect(archiveRecord(actor("owner"), "quote", "q1", " ")).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await expect(deleteRecord(actor("owner"), "quote", "q1", "cleanup")).rejects.toMatchObject({ code: "ARCHIVE_ONLY" });
    expect(withTransaction).not.toHaveBeenCalled();
  });
});
