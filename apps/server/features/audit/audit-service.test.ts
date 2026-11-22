import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GarageActor } from "../auth/authz";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../infrastructure/database/db", () => ({ pool: { query }, withTransaction: vi.fn() }));

const svc = await import("./audit-service");
const { auditArms, auditKinds, auditUnionSql } = await import("./audit-sources");
const { actionLabel } = await import("./audit-labels");

const actor = (role: GarageActor["role"], extra: Partial<GarageActor> = {}): GarageActor => ({ userId: `${role}-1`, email: "", name: role, role, branchIds: ["b1"], ...extra });
const filters = (over: Partial<ReturnType<typeof svc.parseAuditFilters>> = {}) => ({ ...svc.parseAuditFilters({}), ...over });

beforeEach(() => query.mockReset());

describe("union shape", () => {
  it("covers each append-only audit table once per arm and every arm exposes the same twelve columns", () => {
    const tables = auditArms.map((arm) => arm.table);
    for (const required of ["setting_audit_events", "commercial_policy_audit", "catalogue_audit", "quote_audit", "quote_acceptance_events", "warranty_audit_events",
      "whatsapp_conversation_events", "job_events", "owner_record_audit", "branch_availability_audit", "invoice_events", "special_request_events", "customer_merges"]) {
      expect(tables).toContain(required);
    }
    for (const arm of auditArms) {
      for (const column of ["uid", "occurred_at", "kind", "action", "actor_id", "entity_type", "entity_id", "branch_id", "detail", "before_value", "after_value", "extra"]) {
        expect(arm.sql, `${arm.table} exposes ${column}`).toContain(` AS ${column}`);
      }
    }
    expect(auditUnionSql.split("UNION ALL").length).toBe(auditArms.length);
  });
  it("every arm kind is a declared kind and uids are prefixed so rows never collide across tables", () => {
    for (const arm of auditArms) {
      const kind = /'([a-z-]+)'::text AS kind/.exec(arm.sql)?.[1];
      expect(auditKinds as readonly string[]).toContain(kind);
      expect(arm.sql).toMatch(/\(\s*'[a-z-]+:'\|\|/);
    }
  });
  it("only the money arms use the environment bind", () => {
    for (const arm of auditArms) expect(arm.sql.includes("$1")).toBe(arm.table.startsWith("operational_money"));
  });
});

describe("buildAuditQuery", () => {
  it("binds every filter, orders newest first with a tiebreaker and limits", () => {
    const { sql, params } = svc.buildAuditQuery(actor("owner"), filters({ from: "2026-11-01", to: "2026-11-21", actor: "u1", kinds: ["quote", "money"], entity: "quote:q1", q: "50%_" }), 51, { at: "2026-11-20T10:00:00.000000Z", uid: "quote:7" }, "env-1");
    expect(sql).toMatch(/ORDER BY u\.occurred_at DESC, u\.uid DESC\s+LIMIT \$\d+/);
    expect(sql).toContain("(u.occurred_at, u.uid) < (");
    expect(sql).toContain("u.kind = ANY(");
    expect(params[0]).toBe("env-1");
    expect(params).toEqual(expect.arrayContaining(["2026-11-01", "2026-11-21", "u1", ["quote", "money"], "quote", "q1", "%50\\%\\_%", "2026-11-20T10:00:00.000000Z", "quote:7", 51]));
    expect(sql).not.toContain("50%");
    expect(sql).not.toContain("u1");
  });
  it("splits an entity filter into type and id, or matches the id alone", () => {
    expect(svc.buildAuditQuery(actor("owner"), filters({ entity: "job:j1" }), 10).sql).toContain("u.entity_type =");
    const bare = svc.buildAuditQuery(actor("owner"), filters({ entity: "j1" }), 10);
    expect(bare.sql).not.toContain("u.entity_type =");
    expect(bare.params).toContain("j1");
  });
  it("owner sees every branch unless one is chosen; others are always limited to their branches", () => {
    expect(svc.buildAuditQuery(actor("owner"), filters(), 10).sql).not.toContain("u.branch_id = ANY");
    expect(svc.buildAuditQuery(actor("owner"), filters({ branchId: "b2" }), 10).params).toContainEqual(["b2"]);
    expect(svc.buildAuditQuery(actor("branch-manager"), filters(), 10).params).toContainEqual(["b1"]);
    expect(() => svc.buildAuditQuery(actor("branch-manager"), filters({ branchId: "b2" }), 10)).toThrowError(/not available/);
  });
});

describe("filters and cursor", () => {
  it("rejects bad dates, reversed ranges, unknown kinds and oversized pages; empty values count as absent", () => {
    expect(() => svc.parseAuditFilters({ from: "2026-13-40" })).toThrowError(/Check/);
    expect(() => svc.parseAuditFilters({ from: "2026-11-21", to: "2026-11-01" })).toThrowError(/after/);
    expect(() => svc.parseAuditFilters({ kind: "quote,nonsense" })).toThrowError(/Unknown/);
    expect(() => svc.parseAuditFilters({ limit: "5000" })).toThrowError(/Check/);
    expect(svc.parseAuditFilters({ from: "", q: "", kind: "quote,money", limit: "25" })).toMatchObject({ kinds: ["quote", "money"], limit: 25 });
  });
  it("round-trips a cursor and rejects garbage", () => {
    const value = svc.encodeCursor({ at: "2026-11-20T10:00:00.000000Z", uid: "job-event:e1" });
    expect(svc.decodeCursor(value)).toEqual({ at: "2026-11-20T10:00:00.000000Z", uid: "job-event:e1" });
    expect(() => svc.decodeCursor("not-a-cursor")).toThrowError(/page marker/);
  });
});

describe("listAudit paging and access", () => {
  const row = (n: number) => ({ uid: `quote:${n}`, at_key: `2026-11-20T10:00:0${n}.000000Z`, occurred_at: new Date(`2026-11-20T10:00:0${n}Z`), kind: "quote", action: "offered", actor_id: "u1", actor_name: "Mona", actor_role: "owner", entity_type: "quote", entity_id: "q1", branch_id: null, branch_name_en: null, branch_name_ar: null, detail: "", before_value: null, after_value: null, extra: null });
  it("fetches limit+1, returns limit rows and a cursor from the last returned row", async () => {
    query.mockResolvedValueOnce({ rows: [row(3), row(2), row(1)] }).mockResolvedValue({ rows: [{ id: "q1", label: "Ahmed" }] });
    const result = await svc.listAudit(actor("owner"), filters({ limit: 2 }));
    expect(query.mock.calls[0][1].at(-1)).toBe(3);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].entity.label).toBe("Ahmed");
    expect(svc.decodeCursor(result.nextCursor!)).toEqual({ at: "2026-11-20T10:00:02.000000Z", uid: "quote:2" });
  });
  it("returns no cursor on the last page", async () => {
    query.mockResolvedValueOnce({ rows: [row(1)] }).mockResolvedValue({ rows: [] });
    expect((await svc.listAudit(actor("owner"), filters({ limit: 2 }))).nextCursor).toBeNull();
  });
  it("is Owner only: other roles are refused before any query", async () => {
    await expect(svc.listAudit(actor("branch-manager"), filters())).rejects.toMatchObject({ status: 403, code: "ROLE_FORBIDDEN" });
    await expect(svc.listAudit(actor("receptionist", { permissions: { "settings.manage": true } as never }), filters())).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });
});

describe("CSV escaping", () => {
  it("neutralises formula starters so a spreadsheet never evaluates them", () => {
    for (const lead of ["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "\rx"]) expect(svc.csvCell(lead).replace(/^"/, "").startsWith("'")).toBe(true);
    expect(svc.csvCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(svc.csvCell("a=b")).toBe("a=b");
  });
  it("quotes commas, quotes and newlines and keeps Arabic as is", () => {
    expect(svc.csvCell("a,b")).toBe('"a,b"');
    expect(svc.csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(svc.csvCell("one\ntwo")).toBe('"one\ntwo"');
    expect(svc.csvCell("أحمد")).toBe("أحمد");
    expect(svc.csvCell(null)).toBe("");
    expect(svc.csvCell(12)).toBe("12");
    expect(svc.csvRow(["a", "b,c"])).toBe('a,"b,c"\r\n');
  });
  it("starts with a byte order mark built from its code point", () => {
    expect(svc.CSV_BOM.codePointAt(0)).toBe(0xfeff);
    expect(svc.CSV_BOM).toHaveLength(1);
  });
  it("labels actions in both languages and humanises unknown ones", () => {
    expect(actionLabel("stage-delivered", "en")).toBe("Delivered");
    expect(actionLabel("stage-delivered", "ar")).toBe("تم التسليم");
    expect(actionLabel("status-in-custody", "en")).toBe("In custody");
    expect(actionLabel("brand-new-thing", "en")).toBe("Brand new thing");
  });
});

describe("CSV stream", () => {
  const rows = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ uid: `job-event:${from - i}`, at_key: "2026-11-20T10:00:00.000000Z", occurred_at: new Date("2026-11-20T10:00:00Z"), kind: "job", action: "stage-delivered", actor_id: "u1", actor_name: "=Evil", actor_role: "owner", entity_type: "job", entity_id: "j1", branch_id: "b1", branch_name_en: "Maadi", branch_name_ar: "المعادي", detail: "ok", before_value: "ready", after_value: "delivered", extra: null }));
  it("writes the BOM header, escapes cells and stops at the cap with a clear note", async () => {
    query.mockImplementation(async (sql: string) => (/FROM \(/.test(sql) ? { rows: rows(100, 4) } : { rows: [] }));
    const chunks: string[] = [];
    const result = await svc.streamAuditCsv(actor("owner"), filters(), (chunk) => { chunks.push(chunk); }, 3);
    const text = chunks.join("");
    expect(text.codePointAt(0)).toBe(0xfeff);
    expect(text).toContain("Date and time (Cairo)");
    expect(text).toContain("'=Evil");
    expect(result).toEqual({ rows: 3, truncated: true });
    expect(text.trim().split("\r\n").at(-1)).toContain("Export limited to the newest 3 rows");
    expect(text.match(/Delivered/g)).toHaveLength(3);
  });
  it("pages by keyset until a short batch and writes no note when under the cap", async () => {
    let call = 0;
    query.mockImplementation(async (sql: string) => {
      if (!/FROM \(/.test(sql)) return { rows: [] };
      call += 1;
      return { rows: call === 1 ? rows(2000, 1001) : rows(900, 5) };
    });
    const chunks: string[] = [];
    const result = await svc.streamAuditCsv(actor("owner"), filters(), (chunk) => { chunks.push(chunk); }, 10_000);
    expect(result.truncated).toBe(false);
    expect(result.rows).toBe(1006);
    expect(chunks.join("")).not.toContain("Export limited");
  });
  it("refuses a non-owner before writing anything", async () => {
    const write = vi.fn();
    await expect(svc.streamAuditCsv(actor("branch-manager"), filters(), write)).rejects.toMatchObject({ status: 403 });
    expect(write).not.toHaveBeenCalled();
  });
});

describe("daily summary maths", () => {
  it("computes deltas for event counts and leaves snapshot counts without a previous value", () => {
    const counts = svc.summariseCounts(
      { bookingsCreated: "7", jobsDelivered: 3, openSpecialRequests: "4", pendingReviews: 31 },
      { bookingsCreated: "5", jobsDelivered: 4, openSpecialRequests: "9" },
    );
    expect(counts.bookingsCreated).toMatchObject({ value: 7, previous: 5, delta: 2, basis: "exact" });
    expect(counts.jobsDelivered).toMatchObject({ value: 3, previous: 4, delta: -1 });
    expect(counts.openSpecialRequests).toEqual({ value: 4, previous: null, delta: null, basis: "snapshot" });
    expect(counts.pendingReviews.basis).toBe("snapshot");
    expect(counts.bookingsCancelled).toMatchObject({ value: 0, delta: 0, basis: "approximate" });
  });
  it("keeps currencies apart, includes a currency that appears on one day only, and never sums across currencies", () => {
    const money = svc.summariseMoney(
      [{ metric: "collections", currency: "EGP", n: 2, amount: "150000" }, { metric: "collections", currency: "USD", n: 1, amount: "5000" }],
      [{ metric: "collections", currency: "EGP", n: 1, amount: "100000" }, { metric: "refunds", currency: "SAR", n: 1, amount: "700" }],
    );
    expect(money.collections).toEqual([
      { currency: "EGP", count: 2, amountMinor: 150000, previousAmountMinor: 100000, deltaMinor: 50000 },
      { currency: "USD", count: 1, amountMinor: 5000, previousAmountMinor: 0, deltaMinor: 5000 },
    ]);
    expect(money.refunds).toEqual([{ currency: "SAR", count: 0, amountMinor: 0, previousAmountMinor: 700, deltaMinor: -700 }]);
    expect(money.quotesAcceptedValue).toEqual([]);
  });
  it("computes the previous calendar day, including across a month and a leap day", () => {
    expect(svc.previousDay("2026-12-01")).toBe("2026-11-30");
    expect(svc.previousDay("2028-03-01")).toBe("2028-02-29");
    expect(svc.cairoToday(new Date("2026-11-21T22:30:00Z"))).toBe("2026-11-22");
  });
  it("reads today and yesterday, scopes managers' branches, and is Owner only", async () => {
    query.mockResolvedValue({ rows: [] });
    const summary = await svc.dailySummary(actor("owner"), { date: "2026-11-22", branchId: "b2" });
    expect(summary).toMatchObject({ date: "2026-11-22", previousDate: "2026-11-21", branchId: "b2", timezone: "Africa/Cairo" });
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[0][1]).toEqual(["2026-11-22", ["b2"]]);
    expect(query.mock.calls[1][1]).toEqual(["2026-11-21", ["b2"]]);
    await svc.dailySummary(actor("owner"), { date: "2026-11-22" });
    expect(query.mock.calls[4][1]).toEqual(["2026-11-22", null]);
    await expect(svc.dailySummary(actor("owner"), { date: "22/11/2026" })).rejects.toMatchObject({ code: "INVALID_DATE" });
    await expect(svc.dailySummary(actor("receptionist"), {})).rejects.toMatchObject({ status: 403 });
  });
  it("the summary SQL excludes reversed money events and filters by the Cairo day", () => {
    expect(svc.dailyMoneySql).toContain("operational_money_event_reversals");
    expect(svc.dailyCountsSql).toContain("Africa/Cairo");
  });
});
