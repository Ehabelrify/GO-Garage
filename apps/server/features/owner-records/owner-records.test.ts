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

describe("customer archive eligibility (P1-050)", () => {
  it("does not count a confirmed booking whose job is delivered, and ignores terminated lifetime warranties", async () => {
    const { OPEN_BOOKINGS_SQL, ACTIVE_WARRANTIES_SQL } = await import("./owner-records");
    expect(OPEN_BOOKINGS_SQL).toMatch(/b\.status='pending'/);
    expect(OPEN_BOOKINGS_SQL).toMatch(/NOT EXISTS \(SELECT 1 FROM jobs j WHERE j\.booking_id=b\.id AND j\.stage IN \('delivered','cancelled','no-show'\)\)/);
    expect(ACTIVE_WARRANTIES_SQL).toMatch(/terminated_on IS NULL OR terminated_on >/);
  });
  it("blocks archive only with the open-work labels the queries report", async () => {
    const seen: string[] = [];
    vi.mocked(withTransaction).mockImplementationOnce((async (fn: (c: unknown) => unknown) => fn({
      query: vi.fn(async (sql: string) => {
        seen.push(sql);
        if (sql.includes("record_archives WHERE")) return { rowCount: 0, rows: [] };
        if (sql.includes("FROM customers WHERE id")) return { rows: [{ n: "1" }] };
        if (sql.includes("FROM bookings b")) return { rows: [{ n: "0" }] };
        if (sql.includes("FROM warranties WHERE customer_id")) return { rows: [{ n: "0" }] };
        return { rows: [{ n: "0" }], rowCount: 1 };
      }),
    })) as never);
    await archiveRecord(actor("owner"), "customer", "c1", "cleanup");
    expect(seen.some((s) => s.includes("FROM bookings b"))).toBe(true);
  });
});
