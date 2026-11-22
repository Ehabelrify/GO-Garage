import { describe, expect, it, vi } from "vitest";
import { recordStaffCustomerAudit } from "./audit-writer";
import { auditArms } from "./audit-sources";
import { reclaimInvitation } from "../auth/reclaim-invitation";

describe("recordStaffCustomerAudit", () => {
  it("inserts one row on the given client and truncates the summary", async () => {
    const query = vi.fn().mockResolvedValue({});
    await recordStaffCustomerAudit({ query }, { entityKind: "customer", entityId: "c1", action: "edited", summary: "x".repeat(900), actorUserId: "u1" });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO staff_customer_audit_events");
    expect(values[1]).toBe("customer");
    expect(values[4]).toBeNull();
    expect((values[5] as string).length).toBe(500);
  });
  it("is exposed to the owner audit log as staff-access, customer and reminder arms", () => {
    const arms = auditArms.filter((arm) => arm.table === "staff_customer_audit_events").map((arm) => arm.sql);
    expect(arms).toHaveLength(3);
    for (const kind of ["staff-access", "customer", "reminder"]) expect(arms.some((sql) => sql.includes(`'${kind}'::text AS kind`))).toBe(true);
  });
  it("records a claimed-invitation event inside the reclaim transaction", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ clerk_user_id: "invited:1", role: "receptionist", branch_ids: ["b1"], permissions: {} }] })
      .mockResolvedValue({ rowCount: 1, rows: [] });
    expect(await reclaimInvitation({ query }, "u9", "a@b.c", "Name")).toBe(true);
    const last = query.mock.calls.at(-1) as [string, unknown[]];
    expect(last[0]).toContain("staff_customer_audit_events");
    expect(last[1][3]).toBe("claimed-invitation");
    expect(String(last[1][5])).not.toContain("a@b.c");
  });
});
