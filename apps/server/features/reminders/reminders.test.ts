import { describe, expect, it, vi } from "vitest";
import type { GarageActor } from "../auth/authz";
import {
  addDays, bookingCandidate, cairoDate, cairoToUtc, checkinCandidate, defaultRule, displayStatus, initialState, mergeRules, quoteCandidate, readyCandidate,
  renderCandidate, renderTemplate, templateProblem, unknownPlaceholders, warrantyCandidate, reminderKinds,
  type BaseRow, type BookingRow, type JobRow, type QuoteRow, type WarrantyRow,
} from "./reminder-logic";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query },
  withTransaction: async (run: (client: { query: typeof query }) => unknown) => run({ query }),
}));
const service = await import("./reminder-service");

const baseRow: BaseRow = {
  branch_id: "b1", customer_id: "c1", vehicle_id: "v1", customer_name: "Ahmed Mahmoud", plate: "ABC1234", language: "en", has_consent: true,
  branch_en: "Maadi", branch_ar: "المعادي", service_en: "Interior detailing", service_ar: "تنظيف داخلي",
};
// 2026-12-01 10:00 UTC = 12:00 in Cairo (winter, UTC+2)
const NOW = new Date("2026-12-01T10:00:00Z");
const rule = (kind: (typeof reminderKinds)[number], over: object = {}) => ({ ...defaultRule(kind), ...over });

describe("Cairo date helpers", () => {
  it("reads the Cairo calendar day and builds instants for it", () => {
    expect(cairoDate(new Date("2026-12-01T22:30:00Z"))).toBe("2026-12-02");
    expect(cairoToUtc("2026-12-02", 9).toISOString()).toBe("2026-12-02T07:00:00.000Z");
    expect(cairoToUtc("2026-07-02", 9).toISOString()).toBe("2026-07-02T06:00:00.000Z");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("due calculation", () => {
  const booking = (date: string): BookingRow => ({ ...baseRow, booking_id: "bk1", dropoff_date: date, dropoff_time: "10:30:00" });
  it("day-before reminder is due at 09:00 Cairo the day before drop-off", () => {
    const c = bookingCandidate("booking_day_before", booking("2026-12-02"), rule("booking_day_before"), NOW)!;
    expect(c.dueAt.toISOString()).toBe("2026-12-01T07:00:00.000Z");
    expect(c.dedupeKey).toBe("booking_day_before:bk1:2026-12-02");
    expect(displayStatus({ status: "due", due_at: c.dueAt, snoozed_until: null }, NOW)).toBe("due");
  });
  it("a booking further out is not generated yet; today's booking gets no day-before reminder", () => {
    expect(bookingCandidate("booking_day_before", booking("2026-12-05"), rule("booking_day_before"), NOW)).toBeNull();
    expect(bookingCandidate("booking_day_before", booking("2026-12-01"), rule("booking_day_before"), NOW)).toBeNull();
  });
  it("morning-of is due at 08:00 Cairo on the day and is upcoming before that", () => {
    const early = new Date("2026-12-01T20:00:00Z");
    const c = bookingCandidate("booking_morning_of", booking("2026-12-02"), rule("booking_morning_of"), early)!;
    expect(c.dueAt.toISOString()).toBe("2026-12-02T06:00:00.000Z");
    expect(displayStatus({ status: "due", due_at: c.dueAt, snoozed_until: null }, early)).toBe("upcoming");
    expect(bookingCandidate("booking_morning_of", booking("2026-11-30"), rule("booking_morning_of"), NOW)).toBeNull();
  });
  it("ready-for-pickup is due when the job became ready", () => {
    const job: JobRow = { ...baseRow, booking_id: "bk1", job_id: "j1", at: new Date("2026-12-01T09:00:00Z") };
    const c = readyCandidate(job, rule("ready_for_pickup"), NOW)!;
    expect(c.dueAt).toEqual(job.at);
    expect(c.dedupeKey).toBe("ready_for_pickup:j1");
  });
  it("check-in follows delivery by the lead days and ignores very old jobs", () => {
    const delivered: JobRow = { ...baseRow, booking_id: "bk1", job_id: "j2", at: new Date("2026-11-24T10:00:00Z") };
    expect(checkinCandidate(delivered, rule("post_service_checkin"), NOW)!.dueAt.toISOString()).toBe("2026-12-01T10:00:00.000Z");
    expect(checkinCandidate({ ...delivered, at: new Date("2026-10-01T10:00:00Z") }, rule("post_service_checkin"), NOW)).toBeNull();
  });
  it("warranty alert is 30 days before a fixed expiry and never for an expired or missing date", () => {
    const w = (expires: string): WarrantyRow => ({ ...baseRow, warranty_id: "w1", expires_on: expires });
    const c = warrantyCandidate(w("2026-12-31"), rule("warranty_expiry"), NOW)!;
    expect(c.dueAt.toISOString()).toBe("2026-12-01T07:00:00.000Z");
    expect(c.dedupeKey).toBe("warranty_expiry:w1:2026-12-31");
    expect(warrantyCandidate(w("2027-02-28"), rule("warranty_expiry"), NOW)).toBeNull();
    expect(warrantyCandidate(w("2026-11-30"), rule("warranty_expiry"), NOW)).toBeNull();
    expect(warrantyCandidate(w(""), rule("warranty_expiry"), NOW)).toBeNull();
  });
  it("quote follow-up waits N days after the offer, is keyed by revision and skips an expired quote", () => {
    const q = (over: Partial<QuoteRow> = {}): QuoteRow => ({ ...baseRow, quote_id: "q1", revision: 2, offered_at: new Date("2026-11-28T10:00:00Z"), valid_through: null, ...over });
    const c = quoteCandidate(q(), rule("quote_followup", { leadDays: 3 }), NOW)!;
    expect(c.dueAt.toISOString()).toBe("2026-12-01T10:00:00.000Z");
    expect(c.dedupeKey).toBe("quote_followup:q1:2");
    expect(quoteCandidate(q({ offered_at: new Date("2026-11-30T10:00:00Z") }), rule("quote_followup", { leadDays: 7 }), NOW)).toBeNull();
    expect(quoteCandidate(q({ valid_through: "2026-11-30" }), rule("quote_followup"), NOW)).toBeNull();
  });
  it("snoozed reminders show as snoozed until the snooze ends", () => {
    const due = new Date("2026-12-01T07:00:00Z");
    expect(displayStatus({ status: "due", due_at: due, snoozed_until: new Date("2026-12-02T07:00:00Z") }, NOW)).toBe("snoozed");
    expect(displayStatus({ status: "due", due_at: due, snoozed_until: new Date("2026-12-01T08:00:00Z") }, NOW)).toBe("due");
    expect(displayStatus({ status: "sent-simulated", due_at: due, snoozed_until: null }, NOW)).toBe("sent-simulated");
  });
});

describe("consent", () => {
  it("no consent means skipped with a visible reason; consent means due", () => {
    expect(initialState(false)).toEqual({ status: "skipped", reason: "no-consent" });
    expect(initialState(true)).toEqual({ status: "due", reason: null });
  });
});

describe("templates", () => {
  it("renders in the customer's language with placeholders filled", () => {
    const booking: BookingRow = { ...baseRow, booking_id: "bk1", dropoff_date: "2026-12-02", dropoff_time: "10:30:00" };
    const en = bookingCandidate("booking_day_before", booking, rule("booking_day_before"), NOW)!;
    expect(renderCandidate(en, rule("booking_day_before"))).toContain("Maadi on 2026-12-02 at 10:30 for Interior detailing");
    const ar = bookingCandidate("booking_day_before", { ...booking, language: "ar" }, rule("booking_day_before"), NOW)!;
    const text = renderCandidate(ar, rule("booking_day_before"));
    expect(text).toContain("المعادي");
    expect(text).toContain("تنظيف داخلي");
    expect(text).not.toContain("{");
  });
  it("leaves unknown placeholders visible and flags them", () => {
    expect(renderTemplate("Hi {name} {oops}", { name: "A" })).toBe("Hi A {oops}");
    expect(unknownPlaceholders("quote_followup", "Hi {name}, {date}")).toEqual(["date"]);
    expect(templateProblem("quote_followup", "Hi {date}")).toBe("UNKNOWN_PLACEHOLDER");
    expect(templateProblem("quote_followup", "   ")).toBe("EMPTY_TEMPLATE");
    expect(templateProblem("quote_followup", "x".repeat(1001))).toBe("TEMPLATE_TOO_LONG");
    expect(templateProblem("quote_followup", "Hi {name}")).toBeNull();
  });
  it("merges stored rules over defaults for every kind", () => {
    const merged = mergeRules([{ kind: "quote_followup", enabled: false, lead_days: 5, auto_send: true, template_en: "e", template_ar: "a", revision: 3 }]);
    expect(merged.map((r) => r.kind)).toEqual([...reminderKinds]);
    expect(merged.find((r) => r.kind === "quote_followup")).toMatchObject({ enabled: false, leadDays: 5, revision: 3 });
    expect(merged.find((r) => r.kind === "warranty_expiry")?.leadDays).toBe(30);
  });
});

describe("dedupe and idempotent generation", () => {
  it("collects one candidate per source and rule, honouring disabled rules", () => {
    const bookings: BookingRow[] = [{ ...baseRow, booking_id: "bk1", dropoff_date: "2026-12-02", dropoff_time: "10:00:00" }];
    const rules = reminderKinds.map((kind) => rule(kind, kind === "booking_morning_of" ? { enabled: false } : {}));
    const found = service.collectCandidates(rules, { bookings, ready: [], delivered: [], warranties: [], quotes: [] }, NOW);
    expect(found.map((item) => item.candidate.kind)).toEqual(["booking_day_before"]);
  });
  it("a second run inserts nothing: the unique dedupe key turns the insert into a no-op", async () => {
    const candidate = bookingCandidate("booking_day_before", { ...baseRow, booking_id: "bk1", dropoff_date: "2026-12-02", dropoff_time: "10:00:00" }, rule("booking_day_before"), NOW)!;
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [{ id: "rem-1" }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const first = await service.insertCandidate({ query }, candidate, rule("booking_day_before"), "system");
    expect(first).toMatchObject({ status: "due" });
    expect(String(query.mock.calls[0][0])).toContain("ON CONFLICT (environment_id, dedupe_key) DO NOTHING");
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await service.insertCandidate({ query }, candidate, rule("booking_day_before"), "system")).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("a customer without consent is stored as skipped with reason no-consent", async () => {
    const candidate = bookingCandidate("booking_day_before", { ...baseRow, has_consent: false, booking_id: "bk1", dropoff_date: "2026-12-02", dropoff_time: "10:00:00" }, rule("booking_day_before"), NOW)!;
    query.mockReset();
    query.mockResolvedValue({ rows: [{ id: "rem-2" }], rowCount: 1 });
    const created = await service.insertCandidate({ query }, candidate, rule("booking_day_before"), "system");
    expect(created).toEqual({ id: expect.any(String), status: "skipped" });
    const params = query.mock.calls[0][1] as unknown[];
    expect(params).toContain("skipped");
    expect(params).toContain("no-consent");
  });
});

describe("authorization", () => {
  const actor = (role: GarageActor["role"], extra: Partial<GarageActor> = {}): GarageActor => ({ userId: `${role}-1`, email: "", name: role, role, branchIds: ["b1"], ...extra });
  const patch = { expectedRevision: 0, enabled: false };
  it("technicians cannot see follow-ups", async () => {
    query.mockReset();
    await expect(service.listReminders(actor("technician"))).rejects.toMatchObject({ status: 403 });
    await expect(service.listRules(actor("technician"))).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });
  it("only the owner edits rules; managers and receptionists are refused before any query", async () => {
    query.mockReset();
    await expect(service.updateRule(actor("branch-manager"), "quote_followup", patch)).rejects.toMatchObject({ code: "OWNER_REQUIRED" });
    await expect(service.updateRule(actor("receptionist"), "quote_followup", patch)).rejects.toMatchObject({ code: "OWNER_REQUIRED" });
    expect(query).not.toHaveBeenCalled();
  });
  it("demo identities cannot send, skip, snooze, run or edit", async () => {
    query.mockReset();
    const demo = actor("owner", { isDemo: true });
    for (const call of [service.sendReminder(demo, "r"), service.skipReminder(demo, "r"), service.snoozeReminder(demo, "r", 1), service.runReminders(demo), service.updateRule(demo, "quote_followup", patch)]) {
      await expect(call).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });
    }
    expect(query).not.toHaveBeenCalled();
  });
  it("receptionists cannot run the job; managers can act on rows", async () => {
    query.mockReset();
    await expect(service.runReminders(actor("receptionist"))).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });
  it("validates lead time and templates before touching the database", async () => {
    query.mockReset();
    await expect(service.updateRule(actor("owner"), "warranty_expiry", { expectedRevision: 0, leadDays: 999 })).rejects.toMatchObject({ code: "INVALID_LEAD_TIME" });
    await expect(service.updateRule(actor("owner"), "quote_followup", { expectedRevision: 0, templateEn: "Hi {date}" })).rejects.toMatchObject({ code: "UNKNOWN_PLACEHOLDER" });
    await expect(service.updateRule(actor("owner"), "nope", patch)).rejects.toMatchObject({ status: 404 });
    await expect(service.snoozeReminder(actor("owner"), "r", 99)).rejects.toMatchObject({ code: "INVALID_SNOOZE" });
    expect(query).not.toHaveBeenCalled();
  });
  it("previews a template with sample values", () => {
    expect(service.previewTemplate("quote_followup", "Hi {name} about {plate}", "en").text).toBe("Hi Ahmed about ABC 1234");
  });
});

describe("P2T-023 and P2T-024 hardening (mocked pool)", () => {
  const owner = { userId: "owner-1", email: "", name: "owner", role: "owner", branchIds: ["b1"] } as GarageActor;
  const storedRule = { kind: "quote_followup", enabled: true, lead_days: 3, auto_send: false, template_en: "Hi {name}", template_ar: "مرحبا {name}", revision: 4 };

  it("writes an existing rule only at the revision it read and reports a conflict when another edit won", async () => {
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [storedRule], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.updateRule(owner, "quote_followup", { expectedRevision: 4, enabled: false })).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    const write = query.mock.calls[1];
    expect(String(write[0])).toMatch(/UPDATE reminder_rules[\s\S]*revision = \$10/);
    expect(write[1][7]).toBe(5);
    expect(write[1][9]).toBe(4);
  });

  it("creates a default rule without overwriting a row that appeared meanwhile", async () => {
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(service.updateRule(owner, "quote_followup", { expectedRevision: 0, enabled: false })).rejects.toMatchObject({ status: 409 });
    expect(String(query.mock.calls[1][0])).toMatch(/ON CONFLICT \(environment_id, kind\) DO NOTHING/);
  });

  it("a successful update returns the next revision", async () => {
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [storedRule], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const result = await service.updateRule(owner, "quote_followup", { expectedRevision: 4, enabled: false });
    expect(result.rule.revision).toBe(5);
    expect(result.rule.enabled).toBe(false);
  });

  it("automatic dispatch skips reminders whose consent is gone before it marks the rest sent", async () => {
    query.mockReset();
    const autoRule = { ...storedRule, kind: "ready_for_pickup", auto_send: true, enabled: true };
    query.mockImplementation(async (sql: string) => {
      if (/FROM reminder_rules/.test(sql)) return { rows: [{ ...autoRule }], rowCount: 1 };
      if (/SET status = 'skipped'/.test(sql) && /due_at <= \$3/.test(sql)) return { rows: [{ id: "withdrawn-1" }], rowCount: 1 };
      if (/SET status = 'sent-simulated'/.test(sql)) return { rows: [{ id: "ok-1" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const summary = await service.runDueReminders(NOW, "system");
    const calls = query.mock.calls.map((call) => String(call[0]));
    const skipIndex = calls.findIndex((sql) => /SET status = 'skipped'/.test(sql) && /NOT EXISTS/.test(sql));
    const sendIndex = calls.findIndex((sql) => /SET status = 'sent-simulated'/.test(sql));
    expect(skipIndex).toBeGreaterThan(-1);
    expect(sendIndex).toBeGreaterThan(skipIndex);
    expect(calls[sendIndex]).toMatch(/AND EXISTS \(SELECT 1 FROM messaging_customer_consents/);
    expect(calls.some((sql) => /VALUES \(\$1, 'skipped', 'system', 'no-consent'\)/.test(sql))).toBe(true);
    expect(summary.autoSent).toBe(1);
    expect(summary.skippedNoConsent).toBeGreaterThanOrEqual(1);
  });
});
