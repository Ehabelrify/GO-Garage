import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { hasActiveCustomerConsent } from "./customer-consent";

describe("customer-specific WhatsApp consent", () => {
  it("requires an active consent row for this channel, customer, purpose, and time", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [{}] });
    const client = { query } as unknown as Pick<PoolClient, "query">;
    const at = new Date("2026-11-17T12:00:00.000Z");

    await expect(hasActiveCustomerConsent(client, {
      channelId: "channel-a",
      customerId: "customer-a",
      purpose: "service",
      at,
    })).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='granted'"), [
      "channel-a",
      "customer-a",
      "service",
      at,
    ]);
  });

  it("fails closed when consent is missing or revoked", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const client = { query } as unknown as Pick<PoolClient, "query">;
    await expect(hasActiveCustomerConsent(client, {
      channelId: "channel-a",
      customerId: "customer-a",
      purpose: "marketing",
      at: new Date("2026-11-17T12:00:00.000Z"),
    })).resolves.toBe(false);
  });
});
