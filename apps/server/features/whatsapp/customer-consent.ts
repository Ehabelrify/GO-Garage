import type { PoolClient } from "pg";

export type MessagingPurpose = "service" | "marketing";

export async function hasActiveCustomerConsent(
  client: Pick<PoolClient, "query">,
  input: {
    channelId: string;
    customerId: string;
    purpose: MessagingPurpose;
    at: Date;
  },
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
     FROM messaging_customer_consents
     WHERE channel_id=$1
       AND customer_id=$2
       AND purpose=$3
       AND status='granted'
       AND evidence_ref IS NOT NULL
       AND consented_at <= $4
       AND (expires_at IS NULL OR expires_at > $4)`,
    [input.channelId, input.customerId, input.purpose, input.at],
  );
  return result.rowCount === 1;
}
