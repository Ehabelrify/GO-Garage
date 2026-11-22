import { describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

const rec = vi.fn(), can = vi.fn();
vi.mock("../../infrastructure/database/db", () => ({ pool: { query: vi.fn() }, withTransaction: vi.fn() }));
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
});
