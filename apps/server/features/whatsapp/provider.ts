export type ProviderSendResult =
  | { state: "accepted"; providerMessageId: string }
  | { state: "definite-failure"; code: string; retryable: boolean }
  | { state: "unknown-outcome"; reconciliationRef: string | null };

export interface ProviderAdapter {
  /** True only for an adapter that can really reach a provider. A configuration flag alone never makes this true (P2T-006). */
  readonly connected: boolean;
  send(input: {
    channelId: string;
    recipient: string;
    content: unknown;
    idempotencyKey: string;
  }): Promise<ProviderSendResult>;
  /**
   * Resolve an ambiguous send using the same provider idempotency key or a
   * provider-issued reference. Return definite-failure only when the provider
   * confirms the message was not accepted; unresolved results remain held.
   */
  reconcile?(input: {
    channelId: string;
    idempotencyKey: string;
    providerMessageId?: string | null;
    reconciliationRef?: string | null;
  }): Promise<ProviderSendResult>;
}

export class DisconnectedProviderAdapter implements ProviderAdapter {
  readonly connected = false;
  async send(): Promise<ProviderSendResult> {
    return { state: "definite-failure", code: "PROVIDER_DISCONNECTED", retryable: false };
  }
}

export function providerAdapter(): ProviderAdapter {
  return new DisconnectedProviderAdapter();
}
