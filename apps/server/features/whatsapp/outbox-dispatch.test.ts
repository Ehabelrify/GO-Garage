import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  send: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("../../infrastructure/database/db", () => ({
  pool: { query: mocks.query },
  withTransaction: (run: (client: { query: typeof mocks.query }) => Promise<unknown>) =>
    run({ query: mocks.query }),
}));

vi.mock("./provider", () => ({
  providerAdapter: () => ({
    send: mocks.send,
    reconcile: mocks.reconcile,
  }),
}));

import { dispatchDue } from "./outbox";

type FakeOutboxRow = {
  id: string;
  conversation_id: string;
  channel_id: string;
  recipient_ref: string;
  content: { type: "freeform"; purpose: "service"; language: "en"; text: string };
  idempotency_key: string;
  reconciliation_ref: string | null;
  provider_message_id: string | null;
  expires_at: Date;
  attempts: number;
  status: "queued" | "leased" | "unknown-outcome" | "accepted" | "expired";
  failure_code: string | null;
  lease_until: Date | null;
  lease_token: string | null;
};

const originalEnvironment = {
  nodeEnv: process.env.NODE_ENV,
  datasetClass: process.env.GARAGE_DATASET_CLASS,
  providerEnabled: process.env.WHATSAPP_PROVIDER_ENABLED,
  webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET,
};

let row: FakeOutboxRow;
let failNextAcceptedWrite: boolean;

function configureFakeDatabase() {
  mocks.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("SET status='unknown-outcome',failure_code='LEASE_EXPIRED'")) {
      const now = params[0] as Date;
      if (row.status === "leased" && (!row.lease_until || row.lease_until <= now)) {
        row.status = "unknown-outcome";
        row.failure_code = "LEASE_EXPIRED";
        row.lease_until = null;
        row.lease_token = null;
      }
      return { rowCount: 1, rows: [] };
    }

    if (sql.includes("WHERE status='unknown-outcome'")) {
      return {
        rowCount: row.status === "unknown-outcome" ? 1 : 0,
        rows: row.status === "unknown-outcome" ? [{
          id: row.id,
          channel_id: row.channel_id,
          idempotency_key: row.idempotency_key,
          reconciliation_ref: row.reconciliation_ref,
          provider_message_id: row.provider_message_id,
          expires_at: row.expires_at,
          attempts: row.attempts,
          failure_code: row.failure_code,
        }] : [],
      };
    }

    if (sql.includes("SET status='accepted'") && row.status === "leased" && failNextAcceptedWrite) {
      failNextAcceptedWrite = false;
      throw new Error("Simulated worker stop before saving provider acceptance");
    }

    if (sql.includes("SET status='accepted'") && row.status === "unknown-outcome") {
      row.status = "accepted";
      row.provider_message_id = params[2] as string;
      row.failure_code = null;
      row.lease_until = null;
      row.lease_token = null;
      return { rowCount: 1, rows: [] };
    }

    if (sql.includes("SET status='accepted'") && row.status === "leased") {
      row.status = "accepted";
      row.provider_message_id = params[2] as string;
      row.failure_code = null;
      row.lease_until = null;
      row.lease_token = null;
      return { rowCount: 1, rows: [] };
    }

    if (sql.includes("SET status='expired'")) {
      return { rowCount: 0, rows: [] };
    }

    if (sql.includes("SET status='leased'")) {
      if (row.status !== "queued") return { rowCount: 0, rows: [] };
      row.status = "leased";
      row.attempts += 1;
      row.lease_token = params[1] as string;
      row.lease_until = new Date((params[0] as Date).getTime() + 2 * 60_000);
      return {
        rowCount: 1,
        rows: [{
          id: row.id,
          conversation_id: row.conversation_id,
          channel_id: row.channel_id,
          recipient_ref: row.recipient_ref,
          content: row.content,
          idempotency_key: row.idempotency_key,
          attempts: row.attempts,
        }],
      };
    }

    if (sql.includes("RETURNING id") && sql.includes("lease_until=$3")) {
      return { rowCount: 1, rows: [{ id: row.id }] };
    }

    if (sql.includes("FROM whatsapp_conversations")) {
      return {
        rowCount: 1,
        rows: [{
          customer_id: "customer-1",
          preferred_language: "en",
          last_inbound_at: new Date(Date.now() - 60_000),
          provider_contact_hash: row.recipient_ref,
          customer_service_window_hours: 24,
          approved_template_ref: null,
        }],
      };
    }

    if (sql.includes("FROM messaging_customer_consents")) {
      return { rowCount: 1, rows: [{}] };
    }

    return { rowCount: 0, rows: [] };
  });
}

describe("WhatsApp outbox worker restart recovery", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "production";
    process.env.GARAGE_DATASET_CLASS = "operational";
    process.env.WHATSAPP_PROVIDER_ENABLED = "true";
    process.env.WHATSAPP_WEBHOOK_SECRET = "test-only-secret";

    row = {
      id: "outbox-1",
      conversation_id: "conversation-1",
      channel_id: "channel-1",
      recipient_ref: "contact-hash-1",
      content: { type: "freeform", purpose: "service", language: "en", text: "Your vehicle is ready." },
      idempotency_key: "message-key-1",
      reconciliation_ref: null,
      provider_message_id: null,
      expires_at: new Date(Date.now() + 60 * 60_000),
      attempts: 0,
      status: "queued",
      failure_code: null,
      lease_until: null,
      lease_token: null,
    };
    failNextAcceptedWrite = true;
    mocks.send.mockReset().mockResolvedValue({ state: "accepted", providerMessageId: "provider-message-1" });
    mocks.reconcile.mockReset().mockResolvedValue({ state: "accepted", providerMessageId: "provider-message-1" });
    configureFakeDatabase();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries({
      NODE_ENV: originalEnvironment.nodeEnv,
      GARAGE_DATASET_CLASS: originalEnvironment.datasetClass,
      WHATSAPP_PROVIDER_ENABLED: originalEnvironment.providerEnabled,
      WHATSAPP_WEBHOOK_SECRET: originalEnvironment.webhookSecret,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.clearAllMocks();
  });

  it("reconciles provider acceptance after a worker stop without sending the message twice", async () => {
    const firstDispatchAt = new Date();
    await expect(dispatchDue(firstDispatchAt)).rejects.toThrow(
      "Simulated worker stop before saving provider acceptance",
    );
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(row.status).toBe("leased");

    const restartedWorkerAt = new Date(firstDispatchAt.getTime() + 3 * 60_000);
    await dispatchDue(restartedWorkerAt);

    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    expect(mocks.reconcile).toHaveBeenCalledWith({
      channelId: row.channel_id,
      idempotencyKey: row.idempotency_key,
      providerMessageId: null,
      reconciliationRef: null,
    });
    expect(row.status).toBe("accepted");
    expect(row.provider_message_id).toBe("provider-message-1");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("keeps an ambiguous expired lease held when reconciliation fails", async () => {
    mocks.reconcile.mockRejectedValue(new Error("Provider lookup is unavailable"));

    const firstDispatchAt = new Date();
    await expect(dispatchDue(firstDispatchAt)).rejects.toThrow(
      "Simulated worker stop before saving provider acceptance",
    );
    await dispatchDue(new Date(firstDispatchAt.getTime() + 3 * 60_000));

    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    expect(row.status).toBe("unknown-outcome");
    expect(row.failure_code).toBe("LEASE_EXPIRED");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
