import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/warranties/:id/verification-token re-displays the active customer QR code (recomputed from the server secret).
const actorState = vi.hoisted(() => ({ role: "owner" as string, branchIds: ["b1"] as string[] }));
vi.mock("../auth/auth", () => ({
  actorFor: () => ({ userId: "u1", email: "", name: "u", role: actorState.role, branchIds: actorState.branchIds }),
  requireMembership: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
const query = vi.hoisted(() => vi.fn());
vi.mock("../../infrastructure/database/db", () => ({ pool: { query }, withTransaction: vi.fn() }));

const { deriveWarrantyVerificationToken, hashWarrantyVerificationToken } = await import("./warranty-verification");
const { warrantyRouter } = await import("./warranties");

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use("/w", warrantyRouter);
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/w`;
});
afterAll(() => { server.close(); });
beforeEach(() => { query.mockReset(); actorState.role = "owner"; actorState.branchIds = ["b1"]; vi.stubEnv("WARRANTY_QR_SECRET", "test-qr-secret"); });

const row = (over: Record<string, unknown> = {}) => ({ rows: [{ branch_id: "b1", status: "active", token_id: "tok-1", token_hash: hashWarrantyVerificationToken(deriveWarrantyVerificationToken("tok-1", "test-qr-secret")), ...over }] });

describe("GET verification-token", () => {
  it("returns the same code the server derived when the code was prepared", async () => {
    query.mockResolvedValueOnce(row());
    const res = await fetch(`${base}/w1/verification-token`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(((await res.json()) as { token: string }).token).toBe(deriveWarrantyVerificationToken("tok-1", "test-qr-secret"));
  });
  it("refuses to show a code that no longer matches the stored hash (made before codes were derivable, or another secret)", async () => {
    query.mockResolvedValueOnce(row({ token_hash: "0".repeat(64) }));
    const res = await fetch(`${base}/w1/verification-token`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("TOKEN_NOT_RECOVERABLE");
  });
  it("answers 404 when no code is active, 404 for an unknown warranty and 409 for void coverage", async () => {
    query.mockResolvedValueOnce(row({ token_id: null, token_hash: null }));
    expect((await fetch(`${base}/w1/verification-token`)).status).toBe(404);
    query.mockResolvedValueOnce({ rows: [] });
    expect((await fetch(`${base}/w1/verification-token`)).status).toBe(404);
    query.mockResolvedValueOnce(row({ status: "void" }));
    expect((await fetch(`${base}/w1/verification-token`)).status).toBe(409);
  });
  it("is refused outside the actor's branch and for roles that cannot issue warranties", async () => {
    actorState.branchIds = ["other"]; actorState.role = "branch-manager";
    query.mockResolvedValueOnce(row());
    expect((await fetch(`${base}/w1/verification-token`)).status).toBe(403);
    actorState.role = "technician"; actorState.branchIds = ["b1"];
    query.mockResolvedValueOnce(row());
    expect((await fetch(`${base}/w1/verification-token`)).status).toBe(403);
  });
  it("answers 503 in production when no secret is configured, never a code derived from a guessable default", async () => {
    vi.stubEnv("WARRANTY_QR_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    const res = await fetch(`${base}/w1/verification-token`);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe("QR_SECRET_MISSING");
    vi.unstubAllEnvs();
  });
});
