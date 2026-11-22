import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GarageActor } from "../auth/authz";

type Row = Record<string, unknown>;
const { query, current, storageConfigured } = vi.hoisted(() => ({ query: vi.fn(), current: { actor: null as unknown }, storageConfigured: { value: false } }));
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query },
  withTransaction: async (run: (client: { query: typeof query }) => unknown) => run({ query }),
}));
vi.mock("../auth/auth", () => ({ actorFor: () => current.actor }));
vi.mock("../../infrastructure/storage/private-storage", () => ({
  isPrivateStorageConfigured: () => storageConfigured.value,
  privateStorageClient: () => (storageConfigured.value ? { uploadFromBytes: async () => ({ ok: true }), delete: async () => ({ ok: true }) } : null),
}));

const { techRouter, authorizeReadyInTransaction } = await import("./tech-routes");

const actor = (role: GarageActor["role"], extra: Partial<GarageActor> = {}): GarageActor =>
  ({ userId: `${role}-1`, email: "", name: role, role, branchIds: ["b1"], ...extra });

let jobRow: Row | undefined;
const checklistRows: Row[] = [
  { id: "i1", template_id: "t1", phase: "prep", position: 10, label_en: "Prep", label_ar: "prep-ar", mandatory: true, done: false, done_by_name: null, done_at: null },
  { id: "i2", template_id: "t2", phase: "qc", position: 20, label_en: "QC", label_ar: "qc-ar", mandatory: true, done: true, done_by_name: "x", done_at: null },
];
const sqlLog: string[] = [];

beforeEach(() => {
  query.mockReset();
  sqlLog.length = 0;
  jobRow = { id: "j1", branch_id: "b1", assigned_user_id: "technician-1", stage: "in-service", service_id: "tint" };
  query.mockImplementation(async (sql: string) => {
    sqlLog.push(sql);
    if (/FROM jobs j JOIN bookings b/.test(sql)) return { rows: jobRow ? [jobRow] : [], rowCount: jobRow ? 1 : 0 };
    if (/FROM job_checklist_items WHERE job_id = \$1 LIMIT 1/.test(sql)) return { rows: [{}], rowCount: 1 };
    if (/FROM job_checklist_items/.test(sql)) return { rows: checklistRows, rowCount: checklistRows.length };
    return { rows: [], rowCount: 1 };
  });
});

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/jobs", techRouter);
  app.patch("/jobs/:jobId/stage", (_req, res) => res.json({ reached: "stage-route" }));
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

const call = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
};

describe("access control", () => {
  it("lets the assigned technician write a note", async () => {
    current.actor = actor("technician");
    const res = await call("POST", "/jobs/j1/notes", { body: "Scratch on left door" });
    expect(res.status).toBe(201);
    expect(sqlLog.some((s) => s.includes("INSERT INTO job_audit_events"))).toBe(true);
  });
  it("refuses a technician who is not assigned to the job", async () => {
    current.actor = actor("technician", { userId: "technician-2" });
    expect((await call("POST", "/jobs/j1/notes", { body: "hi" })).status).toBe(403);
    expect((await call("GET", "/jobs/j1/notes")).status).toBe(403);
  });
  it("refuses a manager outside the branch and roles without tools", async () => {
    current.actor = actor("branch-manager", { branchIds: ["b2"] });
    expect((await call("GET", "/jobs/j1/checklist")).status).toBe(403);
    current.actor = actor("receptionist");
    expect((await call("GET", "/jobs/j1/notes")).status).toBe(403);
  });
  it("lets a branch manager in the branch read notes", async () => {
    current.actor = actor("branch-manager");
    expect((await call("GET", "/jobs/j1/notes")).status).toBe(200);
  });
  it("404s an unknown job and 409s a closed one", async () => {
    current.actor = actor("owner");
    jobRow = undefined;
    expect((await call("GET", "/jobs/zz/notes")).status).toBe(404);
    jobRow = { id: "j1", branch_id: "b1", assigned_user_id: null, stage: "delivered", service_id: "tint" };
    expect((await call("POST", "/jobs/j1/notes", { body: "late" })).status).toBe(409);
  });
  it("blocks every write for demo identities", async () => {
    current.actor = actor("owner", { isDemo: true });
    const writes: [string, string, unknown][] = [["POST", "/jobs/j1/notes", { body: "x" }], ["PATCH", "/jobs/j1/checklist/i1", { done: true }], ["POST", "/jobs/j1/issues", { kind: "delay", note: "x" }], ["POST", "/jobs/j1/photos", {}]];
    for (const [method, path, body] of writes) {
      const res = await call(method, path, body);
      expect(res.status, path).toBe(403);
      expect(res.body.code).toBe("DEMO_ACTION_DISABLED");
    }
  });
  it("validates note and issue payloads", async () => {
    current.actor = actor("technician");
    expect((await call("POST", "/jobs/j1/notes", { body: "" })).status).toBe(400);
    expect((await call("POST", "/jobs/j1/issues", { kind: "nope", note: "x" })).status).toBe(400);
    expect((await call("POST", "/jobs/j1/issues", { kind: "delay", note: "Film is late" })).status).toBe(201);
  });
  it("only managers resolve issues", async () => {
    current.actor = actor("technician");
    expect((await call("PATCH", "/jobs/j1/issues/i9", {})).status).toBe(403);
  });
});

describe("authorizeReadyInTransaction (runs inside the stage transaction)", () => {
  const job = { id: "j1", service_id: "tint" };
  it("blocks a technician while a mandatory step is open, locking checklist rows", async () => {
    const res = await authorizeReadyInTransaction({ query } as never, actor("technician"), job, {});
    expect(res.outcome).toBe("blocked");
    if (res.outcome !== "blocked") return;
    expect(res.payload.code).toBe("CHECKLIST_INCOMPLETE");
    expect(res.payload.canOverride).toBe(false);
    expect(res.payload.remaining).toEqual([{ id: "i1", labelEn: "Prep", labelAr: "prep-ar" }]);
    expect(sqlLog.some((s) => /FROM job_checklist_items WHERE job_id = \$1 ORDER BY position FOR UPDATE/.test(s))).toBe(true);
    expect(sqlLog.some((s) => s.includes("INSERT INTO job_audit_events"))).toBe(false);
  });
  it("blocks a manager without a reason", async () => {
    const res = await authorizeReadyInTransaction({ query } as never, actor("branch-manager"), job, {});
    expect(res.outcome === "blocked" && res.payload.canOverride).toBe(true);
  });
  it("lets a manager override with a reason and writes the audit on the same client", async () => {
    const res = await authorizeReadyInTransaction({ query } as never, actor("branch-manager"), job, { overrideReason: "Checked by hand" });
    expect(res.outcome).toBe("allow");
    expect(res.outcome === "allow" && res.eventNote).toContain("Checked by hand");
    expect(sqlLog.some((s) => s.includes("INSERT INTO job_audit_events"))).toBe(true);
  });
  it("propagates an audit write failure so the stage change rolls back", async () => {
    const base = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("INSERT INTO job_audit_events")) throw new Error("audit down");
      return base(sql, params);
    });
    await expect(authorizeReadyInTransaction({ query } as never, actor("owner"), job, { overrideReason: "Checked by hand" })).rejects.toThrow("audit down");
  });
  it("passes without audit when all mandatory items are done", async () => {
    checklistRows[0].done = true;
    try {
      const res = await authorizeReadyInTransaction({ query } as never, actor("technician"), job, {});
      expect(res).toEqual({ outcome: "allow", eventNote: null });
      expect(sqlLog.some((s) => s.includes("INSERT INTO job_audit_events"))).toBe(false);
    } finally { checklistRows[0].done = false; }
  });
});

describe("photo upload", () => {
  const pngBytes = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
  const upload = async (bytes: Buffer, name: string, kind = "before") => {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", new Blob([new Uint8Array(bytes)]), name);
    const response = await fetch(`${base}/jobs/j1/photos`, { method: "POST", body: form });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  it("answers storage-not-configured (503) while notes still work", async () => {
    current.actor = actor("technician");
    storageConfigured.value = false;
    const res = await call("POST", "/jobs/j1/photos", {});
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("PRIVATE_STORAGE_UNAVAILABLE");
    expect((await call("POST", "/jobs/j1/notes", { body: "still works" })).status).toBe(201);
  });
  it("rejects a pdf, a fake image and a bad kind, accepts a real png", async () => {
    current.actor = actor("technician");
    storageConfigured.value = true;
    try {
      expect((await upload(Buffer.from("%PDF-1.4 x"), "a.pdf")).status).toBe(415);
      expect((await upload(Buffer.from("plain text"), "a.png")).status).toBe(415);
      expect((await upload(pngBytes(), "a.png", "sideways")).status).toBe(400);
      expect((await upload(pngBytes(), "a.png", "damage")).status).toBe(201);
    } finally { storageConfigured.value = false; }
  });
  it("rejects files over 8 MB", async () => {
    current.actor = actor("technician");
    storageConfigured.value = true;
    try {
      const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(8 * 1024 * 1024 + 10)]);
      expect((await upload(big, "big.jpg")).status).toBe(413);
    } finally { storageConfigured.value = false; }
  });
});

describe("extras on a fresh job (P1-074/P1-075)", () => {
  it("creates the checklist rows lazily and returns them", async () => {
    current.actor = actor("technician");
    query.mockImplementation(async (sql: string) => {
      sqlLog.push(sql);
      if (/FROM jobs j JOIN bookings b/.test(sql)) return { rows: [jobRow], rowCount: 1 };
      if (/FROM job_checklist_items WHERE job_id = \$1 LIMIT 1/.test(sql)) return { rows: [], rowCount: 0 };
      if (/FROM job_work_components/.test(sql)) return { rows: [], rowCount: 0 };
      if (/FROM job_checklist_templates/.test(sql)) return { rows: [{ id: "t1", service_id: "tint", phase: "prep", label_en: "Prep", label_ar: "p", mandatory: true }], rowCount: 1 };
      if (/FROM job_checklist_items/.test(sql)) return { rows: checklistRows, rowCount: checklistRows.length };
      return { rows: [], rowCount: 1 };
    });
    const res = await call("GET", "/jobs/j1/extras");
    expect(res.status).toBe(200);
    expect(sqlLog.some((s) => s.includes("INSERT INTO job_checklist_items"))).toBe(true);
    expect((res.body.checklist as unknown[]).length).toBe(2);
  });
});
