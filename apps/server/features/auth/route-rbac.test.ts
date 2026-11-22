import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Route-level permission matrix (P2T-016, P2T-002). The whole API router is mounted with a mocked sign-in: the
// actor comes from the x-test-role header (and optional x-test-caps JSON overrides), the pool returns no rows.
vi.mock("@clerk/express", () => ({ getAuth: () => ({ userId: null }), clerkClient: {}, clerkMiddleware: () => (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock("./demo-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("./demo-auth")>();
  return {
    ...original,
    findDemoActor: async (req: { headers: Record<string, string | undefined> }) => {
      const role = req.headers["x-test-role"];
      if (!role) return null;
      const permissions = req.headers["x-test-caps"] ? JSON.parse(String(req.headers["x-test-caps"])) : undefined;
      return { userId: `${role}-1`, email: "", name: role, role, branchIds: ["b1"], permissions, isDemo: false };
    },
  };
});
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), connect: vi.fn() },
  withTransaction: vi.fn().mockRejectedValue(new Error("no database in this test")),
}));

const { createApiRouter } = await import("../operations/api");
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

async function call(method: string, path: string, role?: string, caps?: Record<string, boolean>) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (role) headers["x-test-role"] = role;
  if (caps) headers["x-test-caps"] = JSON.stringify(caps);
  const res = await fetch(`${base}${path}`, { method, headers, body: method === "GET" ? undefined : "{}" });
  return res.status;
}

/** [method, path, roles that must be refused with default capabilities]. */
const guarded: Array<[string, string, string[]]> = [
  ["GET", "/api/invoices", ["technician"]],
  ["GET", "/api/reminders", ["technician"]],
  ["POST", "/api/reminders/run", ["receptionist", "technician"]],
  ["GET", "/api/finance/events", ["technician", "receptionist"]],
];

describe("route permission matrix", () => {
  it("refuses unauthenticated callers on every guarded route", async () => {
    for (const [method, path] of guarded) expect(await call(method, path), `${method} ${path}`).toBe(401);
  });
  it("refuses roles without the capability with 403", async () => {
    for (const [method, path, roles] of guarded) {
      for (const role of roles) expect(await call(method, path, role), `${method} ${path} as ${role}`).toBe(403);
    }
  });
  it("an explicit revoke turns a permitted role into 403 and an explicit grant opens the route", async () => {
    expect(await call("GET", "/api/invoices", "receptionist", { "invoices.view": false })).toBe(403);
    expect(await call("GET", "/api/invoices", "technician", { "invoices.view": true })).not.toBe(403);
  });
  it("owner is never refused on the guarded routes", async () => {
    for (const [method, path] of guarded) expect(await call(method, path, "owner"), `${method} ${path}`).not.toBe(403);
  });
});
