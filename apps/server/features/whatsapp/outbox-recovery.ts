import type { ProviderSendResult } from "./provider";

export type RecoveryDecision =
  | { state: "accepted"; providerMessageId: string }
  | { state: "queued"; failureCode: string }
  | { state: "definite-failure"; failureCode: string }
  | { state: "expired" }
  | { state: "unknown-outcome" };

export function resolveUnknownOutcome(
  result: ProviderSendResult | undefined,
  expiresAt: Date,
  now: Date,
  attempts: number,
): RecoveryDecision {
  if (!result || result.state === "unknown-outcome") {
    return { state: "unknown-outcome" };
  }

  if (result.state === "accepted") {
    return { state: "accepted", providerMessageId: result.providerMessageId };
  }

  if (expiresAt <= now) {
    return { state: "expired" };
  }

  if (result.retryable && attempts < 5) {
    return { state: "queued", failureCode: result.code };
  }

  return { state: "definite-failure", failureCode: result.code };
}

export function isWithinCustomerServiceWindow(
  lastInboundAt: Date | null,
  at: Date,
  windowHours: number,
): boolean {
  if (!lastInboundAt || !Number.isFinite(windowHours) || windowHours <= 0) return false;
  const ageMs = at.getTime() - lastInboundAt.getTime();
  return ageMs >= 0 && ageMs <= windowHours * 60 * 60 * 1000;
}
