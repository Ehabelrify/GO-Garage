import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// P2T-001: routes guarded by rejectDemoActor (and the staff routes with an explicit demo check) refuse demo actors
// with 403 DEMO_ACTION_DISABLED; the same call as a real owner is never refused for that reason.
vi.mock("@clerk/express", () => ({ getAuth: () => ({ userId: null }), clerkClient: {}, clerkMiddleware: () => (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock("../auth/demo-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("../auth/demo-auth")>();
  return {
    ...original,
    findDemoActor: async (req: { headers: Record<string, string | undefined> }) => {
      if (!req.headers["x-test-role"]) return null;
      return { userId: "owner-1", email: "", name: "owner", role: "owner", branchIds: ["b1"], isDemo: req.headers["x-test-demo"] === "1" };
    },
  };
});
vi.mock("../../infrastructure/database/db", () => {
  const query = async () => ({ rows: [], rowCount: 0 });
  return { pool: { query, connect: vi.fn() }, withTransaction: async (cb: (c: unknown) => unknown) => cb({ query }) };
});

const { createApiRouter } = await import("./api");
let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", createApiRouter());
  app.use((_e: unknown, _q: unknown, res: express.Response, _n: unknown) => { res.status(500).json({ code: "TEST_ERROR" }); });
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

async function call(method: string, path: string, demo: boolean, body: unknown = {}) {
  const res = await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", "x-test-role": "owner", ...(demo ? { "x-test-demo": "1" } : {}) }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { status: res.status, code: json.code };
}

/** [method, path, body] for every route that must refuse demo sessions. */
const demoBlocked: Array<[string, string, unknown]> = [
  ["PATCH", "/settings", { settingId: "s", scopeKey: "business", value: "v" }],
  ["PUT", "/availability/config/b1", {}],
  ["PATCH", "/bookings/bk1/cancel", { reason: "customer asked" }],
  ["PATCH", "/jobs/j1/assignment", { technicianUserId: "t1" }],
  ["POST", "/staff/invitations", { email: "a@b.co", role: "receptionist", branchIds: ["b1"] }],
  ["DELETE", "/staff/invitations/inv1", {}],
  ["PUT", "/staff/u2/permissions", { permissions: {} }],
  ["DELETE", "/staff/u2", {}],
];

describe("demo actors on guarded routes", () => {
  for (const [method, path, body] of demoBlocked) {
    it(`${method} ${path}: demo owner -> 403 DEMO_ACTION_DISABLED`, async () => {
      expect(await call(method, path, true, body)).toEqual({ status: 403, code: "DEMO_ACTION_DISABLED" });
    });
    it(`${method} ${path}: real owner is not refused as a demo session`, async () => {
      const result = await call(method, path, false, body);
      expect(result.code).not.toBe("DEMO_ACTION_DISABLED");
    });
  }
});
