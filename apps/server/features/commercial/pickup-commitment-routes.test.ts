import { describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

const rec = vi.fn(), can = vi.fn(), q = vi.fn();
vi.mock("../../infrastructure/database/db", () => ({ pool: { query: q }, withTransaction: vi.fn() }));
vi.mock("../auth/auth", () => ({ actorFor: () => ({ userId: "u1", role: "owner", branchIds: [] }) }));
vi.mock("./quote-booking", () => ({ recordPickupCommitment: rec, cancelPickupCommitment: can }));
const { pickupCommitmentRouter } = await import("./pickup-commitment-routes");
const { QuoteError } = await import("./quote-service");

async function call(path: string, body: unknown, key = "k1") {
  const app = express(); app.use(express.json()); app.use("/p", pickupCommitmentRouter);
  const server = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/p${path}`, { method: "POST", headers: { "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  } finally { server.close(); }
}
const good = { bookingId: "b1", promisedAt: "2026-12-01T10:00:00Z", evidenceRef: "private:ev/1", reason: "agreed by phone", expectedRevision: 0 };
describe("pickup commitment routes", () => {
  it("records with idempotency key", async () => {
    rec.mockResolvedValue({ commitmentId: "c1" });
    const r = await call("/", good);
    expect(r).toEqual({ status: 201, body: { commitmentId: "c1" } });
    expect(rec.mock.calls[0][2]).toMatchObject({ bookingId: "b1", idempotencyKey: "k1" });
  });
  it("rejects missing key, bad body and maps service errors", async () => {
    expect((await call("/", good, "")).status).toBe(400);
    expect((await call("/", { ...good, evidenceRef: "http://x" })).status).toBe(400);
    rec.mockRejectedValue(new QuoteError(409, "STALE_COMMITMENT", "Refresh"));
    expect(await call("/", good)).toEqual({ status: 409, body: { code: "STALE_COMMITMENT", message: "Refresh" } });
  });
  it("cancels by id", async () => {
    can.mockResolvedValue({ commitmentId: "c2" });
    const r = await call("/c1/cancel", { reason: "customer changed", expectedRevision: 1 });
    expect(r.status).toBe(200);
    expect(can.mock.calls[0][2]).toMatchObject({ commitmentId: "c1", expectedRevision: 1, idempotencyKey: "k1" });
  });
  it("reads the latest revision for a booking behind the writer's role gate", async () => {
    const app = express(); app.use("/p", pickupCommitmentRouter);
    const server = app.listen(0);
    const get = async (qs: string) => { const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/p${qs}`); return { status: r.status, body: await r.json() as Record<string, unknown> }; };
    try {
      q.mockReset();
      q.mockResolvedValueOnce({ rows: [{ role: "branch-manager", branch_ids: ["br1"] }] }).mockResolvedValueOnce({ rows: [{ branch_id: "br1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "c9", revision: 3, promised_at: new Date("2026-12-01T10:00:00Z"), cancellation_reason: null }] });
      expect(await get("?bookingId=b1")).toEqual({ status: 200, body: { bookingId: "b1", revision: 3, commitmentId: "c9", status: "active", promisedAt: "2026-12-01T10:00:00.000Z" } });
      q.mockResolvedValueOnce({ rows: [{ role: "branch-manager", branch_ids: ["other"] }] }).mockResolvedValueOnce({ rows: [{ branch_id: "br1" }] });
      expect((await get("?bookingId=b1")).body.code).toBe("ROLE_FORBIDDEN");
      q.mockResolvedValueOnce({ rows: [{ role: "owner", branch_ids: [] }] }).mockResolvedValueOnce({ rows: [{ branch_id: "br1" }] }).mockResolvedValueOnce({ rows: [] });
      expect((await get("?bookingId=b2")).body).toMatchObject({ revision: 0, status: "none" });
      expect((await get("")).status).toBe(400);
    } finally { server.close(); }
  });
});
