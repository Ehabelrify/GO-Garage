import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth/auth", () => ({ actorFor: () => ({ userId: "u1", role: "owner", branchIds: ["b1"], email: "", name: "o" }) }));
vi.mock("../../infrastructure/database/db", () => ({ pool: { query: vi.fn() }, withTransaction: vi.fn() }));
vi.mock("./inbox-access", () => ({ canActorAccessInboxBranch: vi.fn().mockResolvedValue(true) }));
const { customerConsentRouter } = await import("./consent-routes");
const { pool } = await import("../../infrastructure/database/db");

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use("/c", customerConsentRouter);
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/c`;
});
afterAll(() => { server.close(); });
const url = () => `${base}?channelId=ch&customerId=c1&purpose=service`;

describe("GET consents", () => {
  it("returns 200 missing when a known customer has no consent record", async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ channels: "1", customers: "1" }] } as never)
      .mockResolvedValueOnce({ rows: [{ branch_id: "b1" }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    const res = await fetch(url());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { consent: { status: string } }).consent.status).toBe("missing");
  });
  it("returns 404 for an unknown customer or channel", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ channels: "1", customers: "0" }] } as never);
    const res = await fetch(url());
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("CONSENT_NOT_FOUND");
  });
});
