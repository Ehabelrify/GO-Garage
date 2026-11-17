import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../infrastructure/database/db";
import { hasActiveCustomerConsent, type MessagingPurpose } from "./customer-consent";
import { isWithinCustomerServiceWindow, resolveUnknownOutcome } from "./outbox-recovery";
import { providerAdapter, type ProviderAdapter, type ProviderSendResult } from "./provider";
import { isWhatsAppProviderDeliveryEnabled } from "./whatsapp-policy";

type OutboundContent = {
  type: "freeform" | "template";
  purpose: MessagingPurpose;
  language: "ar" | "en";
  text: string;
  templateRef?: string;
};

type UnknownOutboxRow = {
  id: string;
  channel_id: string;
  idempotency_key: string;
  reconciliation_ref: string | null;
  provider_message_id: string | null;
  expires_at: Date;
  attempts: number;
  failure_code: string;
};

async function approvedDelivery(
  client: Pick<PoolClient, "query">,
  input: {
    conversationId: string;
    channelId: string;
    recipientRef: string;
    content: OutboundContent;
    at: Date;
  },
): Promise<boolean> {
  const row = (await client.query<{
    customer_id: string;
    preferred_language: string;
    last_inbound_at: Date | null;
    provider_contact_hash: string | null;
    customer_service_window_hours: number;
    approved_template_ref: string | null;
  }>(
    `SELECT c.customer_id,cu.preferred_language,c.last_inbound_at,
            l.provider_contact_hash,p.customer_service_window_hours,p.approved_template_ref
     FROM whatsapp_conversations c
     JOIN customers cu ON cu.id=c.customer_id
     LEFT JOIN messaging_contact_links l
       ON l.channel_id=c.channel_id AND l.customer_id=c.customer_id
     JOIN messaging_delivery_policies p
       ON p.channel_id=c.channel_id
      AND p.language=cu.preferred_language
      AND p.active=true
      AND (p.expires_at IS NULL OR p.expires_at>$3)
     WHERE c.id=$1 AND c.mode='operational' AND c.channel_id=$2`,
    [input.conversationId, input.channelId, input.at],
  )).rows[0];

  if (
    !row ||
    row.provider_contact_hash !== input.recipientRef ||
    row.preferred_language !== input.content.language
  ) return false;

  if (!await hasActiveCustomerConsent(client, {
    channelId: input.channelId,
    customerId: row.customer_id,
    purpose: input.content.purpose,
    at: input.at,
  })) return false;

  if (input.content.type === "template") {
    return Boolean(row.approved_template_ref && input.content.templateRef === row.approved_template_ref);
  }

  if (input.content.purpose !== "service") return false;
  return isWithinCustomerServiceWindow(
    row.last_inbound_at,
    input.at,
    row.customer_service_window_hours,
  );
}

function recoveryResultUpdate(
  client: Pick<PoolClient, "query">,
  row: UnknownOutboxRow,
  result: ProviderSendResult | undefined,
  now: Date,
): Promise<void> {
  const decision = resolveUnknownOutcome(result, row.expires_at, now, row.attempts);
  const guard = [row.id, row.failure_code];
  switch (decision.state) {
    case "accepted":
      return client.query(
        `UPDATE messaging_outbox
         SET status='accepted',provider_message_id=$3,reconciliation_ref=NULL,
             failure_code=NULL,lease_until=NULL,lease_token=NULL,updated_at=now()
         WHERE id=$1 AND status='unknown-outcome' AND failure_code=$2`,
        [...guard, decision.providerMessageId],
      ).then(() => undefined);
    case "queued":
      return client.query(
        `UPDATE messaging_outbox
         SET status='queued',failure_code=$3,reconciliation_ref=NULL,lease_until=NULL,
             lease_token=NULL,next_attempt_at=$4::timestamptz
               + (interval '1 minute' * power(2,attempts)),updated_at=now()
         WHERE id=$1 AND status='unknown-outcome' AND failure_code=$2`,
        [...guard, decision.failureCode, now],
      ).then(() => undefined);
    case "definite-failure":
      return client.query(
        `UPDATE messaging_outbox
         SET status='definite-failure',failure_code=$3,reconciliation_ref=NULL,
             lease_until=NULL,lease_token=NULL,updated_at=now()
         WHERE id=$1 AND status='unknown-outcome' AND failure_code=$2`,
        [...guard, decision.failureCode],
      ).then(() => undefined);
    case "expired":
      return client.query(
        `UPDATE messaging_outbox
         SET status='expired',failure_code='EXPIRED_AFTER_RECONCILIATION',
             reconciliation_ref=NULL,lease_until=NULL,lease_token=NULL,updated_at=now()
         WHERE id=$1 AND status='unknown-outcome' AND failure_code=$2`,
        guard,
      ).then(() => undefined);
    case "unknown-outcome":
      return Promise.resolve();
  }
}

async function quarantineExpiredLeases(now: Date): Promise<void> {
  await pool.query(
    `UPDATE messaging_outbox
     SET status='unknown-outcome',failure_code='LEASE_EXPIRED',
         lease_until=NULL,lease_token=NULL,updated_at=now()
     WHERE status='leased' AND (lease_until IS NULL OR lease_until<=$1)`,
    [now],
  );
}

async function reconcileUnknownOutcomes(
  adapter: ProviderAdapter,
  now: Date,
): Promise<void> {
  if (!adapter.reconcile) return;
  const pending = await pool.query<UnknownOutboxRow>(
    `SELECT id,channel_id,idempotency_key,reconciliation_ref,provider_message_id,
            expires_at,attempts,failure_code
     FROM messaging_outbox
     WHERE status='unknown-outcome'
       AND failure_code IN ('LEASE_EXPIRED','OUTCOME_UNKNOWN')
     ORDER BY updated_at
     LIMIT 25`,
  );

  for (const row of pending.rows) {
    let result: ProviderSendResult | undefined;
    try {
      result = await adapter.reconcile({
        channelId: row.channel_id,
        idempotencyKey: row.idempotency_key,
        providerMessageId: row.provider_message_id,
        reconciliationRef: row.reconciliation_ref,
      });
    } catch {
      // Keep ambiguous sends held; a failed lookup is not proof of non-delivery.
      continue;
    }
    await withTransaction((client) => recoveryResultUpdate(client, row, result, now));
  }
}

async function recordSendResult(
  id: string,
  leaseToken: string,
  result: ProviderSendResult,
): Promise<boolean> {
  const completedAt = new Date();
  return withTransaction(async (client) => {
    let update;
    if (result.state === "accepted") {
      update = await client.query(
        `UPDATE messaging_outbox
         SET status='accepted',provider_message_id=$3,reconciliation_ref=NULL,
             failure_code=NULL,lease_until=NULL,lease_token=NULL,updated_at=now()
         WHERE id=$1 AND status='leased' AND lease_token=$2 AND lease_until>$4`,
        [id, leaseToken, result.providerMessageId, completedAt],
      );
    } else if (result.state === "unknown-outcome") {
      update = await client.query(
        `UPDATE messaging_outbox
         SET status='unknown-outcome',failure_code='OUTCOME_UNKNOWN',
             reconciliation_ref=$3,lease_until=NULL,lease_token=NULL,updated_at=now()
         WHERE id=$1 AND status='leased' AND lease_token=$2 AND lease_until>$4`,
        [id, leaseToken, result.reconciliationRef, completedAt],
      );
    } else if (result.retryable) {
      update = await client.query(
        `UPDATE messaging_outbox
         SET status=CASE WHEN attempts<5 THEN 'queued' ELSE 'definite-failure' END,
             failure_code=$3,lease_until=NULL,lease_token=NULL,
             next_attempt_at=now()+(interval '1 minute'*power(2,attempts)),updated_at=now()
         WHERE id=$1 AND status='leased' AND lease_token=$2 AND lease_until>$4`,
        [id, leaseToken, result.code, completedAt],
      );
    } else {
      update = await client.query(
        `UPDATE messaging_outbox
         SET status='definite-failure',failure_code=$3,lease_until=NULL,
             lease_token=NULL,updated_at=now()
         WHERE id=$1 AND status='leased' AND lease_token=$2 AND lease_until>$4`,
        [id, leaseToken, result.code, completedAt],
      );
    }
    return update.rowCount === 1;
  });
}

export async function enqueueOutbound(
  client: PoolClient,
  input: {
    conversationId: string;
    channelId: string;
    recipientRef: string;
    content: OutboundContent;
    idempotencyKey: string;
    expiresAt: string;
  },
) {
  const expires = new Date(input.expiresAt);
  const now = new Date();
  if (
    !input.idempotencyKey.trim() ||
    !["service", "marketing"].includes(input.content.purpose) ||
    !Number.isFinite(expires.getTime()) ||
    expires <= now ||
    !input.content.text.trim() ||
    !await approvedDelivery(client, { ...input, at: now })
  ) {
    throw Object.assign(
      new Error("Recorded customer consent, recipient, service window or approved template are required."),
      { code: "OUTBOUND_POLICY_UNCONFIGURED", status: 422 },
    );
  }

  const id = randomUUID();
  const status = isWhatsAppProviderDeliveryEnabled() ? "queued" : "held";
  const row = await client.query<{ id: string }>(
    `INSERT INTO messaging_outbox
       (id,conversation_id,channel_id,recipient_ref,content,idempotency_key,status,
        next_attempt_at,expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,now(),$8)
     ON CONFLICT(idempotency_key) DO UPDATE SET id=messaging_outbox.id
     RETURNING id`,
    [
      id,
      input.conversationId,
      input.channelId,
      input.recipientRef,
      JSON.stringify(input.content),
      input.idempotencyKey,
      status,
      expires,
    ],
  );
  return { outboxId: row.rows[0].id, state: status as "held" | "queued" };
}

export async function dispatchDue(now = new Date()) {
  await quarantineExpiredLeases(now);
  if (!isWhatsAppProviderDeliveryEnabled()) return { claimed: 0, accepted: 0, held: true };

  const adapter = providerAdapter();
  await reconcileUnknownOutcomes(adapter, now);
  await pool.query(
    `UPDATE messaging_outbox
     SET status='expired',updated_at=now()
     WHERE status='queued' AND expires_at<=$1`,
    [now],
  );

  const leaseToken = randomUUID();
  const due = await pool.query<{
    id: string;
    conversation_id: string;
    channel_id: string;
    recipient_ref: string;
    content: OutboundContent;
    idempotency_key: string;
    attempts: number;
  }>(
    `UPDATE messaging_outbox
     SET status='leased',lease_token=$2,
         lease_until=$1::timestamptz+interval '2 minutes',
         attempts=attempts+1,updated_at=now()
     WHERE id IN (
       SELECT id FROM messaging_outbox
       WHERE status='queued' AND next_attempt_at<=$1 AND expires_at>$1
       ORDER BY next_attempt_at
       FOR UPDATE SKIP LOCKED
       LIMIT 25
     )
     RETURNING id,conversation_id,channel_id,recipient_ref,content,idempotency_key,attempts`,
    [now, leaseToken],
  );

  let accepted = 0;
  for (const item of due.rows) {
    const attemptAt = new Date();
    const renewed = await pool.query(
      `UPDATE messaging_outbox
       SET lease_until=$3::timestamptz+interval '2 minutes'
       WHERE id=$1 AND status='leased' AND lease_token=$2 AND lease_until>$3
       RETURNING id`,
      [item.id, leaseToken, attemptAt],
    );
    if (!renewed.rowCount) continue;

    if (!await approvedDelivery(pool, {
      conversationId: item.conversation_id,
      channelId: item.channel_id,
      recipientRef: item.recipient_ref,
      content: item.content,
      at: attemptAt,
    })) {
      await pool.query(
        `UPDATE messaging_outbox
         SET status='held',failure_code='CONSENT_OR_POLICY_UNAVAILABLE',
             lease_until=NULL,lease_token=NULL,updated_at=now()
         WHERE id=$1 AND status='leased' AND lease_token=$2`,
        [item.id, leaseToken],
      );
      continue;
    }

    let result: ProviderSendResult;
    try {
      result = await adapter.send({
        channelId: item.channel_id,
        recipient: item.recipient_ref,
        content: item.content,
        idempotencyKey: item.idempotency_key,
      });
    } catch {
      // Leave the lease to expire; recovery will reconcile instead of resending.
      continue;
    }

    if (await recordSendResult(item.id, leaseToken, result) && result.state === "accepted") {
      accepted += 1;
    }
  }
  return { claimed: due.rowCount, accepted, held: false };
}
