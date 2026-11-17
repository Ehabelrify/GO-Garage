import { describe, expect, it } from "vitest";
import { resolveUnknownOutcome, isWithinCustomerServiceWindow } from "./outbox-recovery";

const now = new Date("2026-11-17T12:00:00.000Z");

describe("WhatsApp outbox recovery", () => {
  it("keeps missing or unknown reconciliation results held", () => {
    expect(resolveUnknownOutcome(undefined, new Date("2026-11-18T12:00:00Z"), now, 1))
      .toEqual({ state: "unknown-outcome" });
    expect(resolveUnknownOutcome(
      { state: "unknown-outcome", reconciliationRef: null },
      new Date("2026-11-18T12:00:00Z"),
      now,
      1,
    )).toEqual({ state: "unknown-outcome" });
  });

  it("records accepted reconciliation without sending again", () => {
    expect(resolveUnknownOutcome(
      { state: "accepted", providerMessageId: "provider-123" },
      new Date("2026-11-18T12:00:00Z"),
      now,
      1,
    )).toEqual({ state: "accepted", providerMessageId: "provider-123" });
  });

  it("requeues only a confirmed retryable failure before expiry", () => {
    expect(resolveUnknownOutcome(
      { state: "definite-failure", code: "NOT_ACCEPTED", retryable: true },
      new Date("2026-11-18T12:00:00Z"),
      now,
      1,
    )).toEqual({ state: "queued", failureCode: "NOT_ACCEPTED" });
    expect(resolveUnknownOutcome(
      { state: "definite-failure", code: "NOT_ACCEPTED", retryable: true },
      new Date("2026-11-17T11:59:00Z"),
      now,
      1,
    )).toEqual({ state: "expired" });
  });

  it("stops retrying after the attempt limit or a permanent failure", () => {
    expect(resolveUnknownOutcome(
      { state: "definite-failure", code: "TEMPORARY", retryable: true },
      new Date("2026-11-18T12:00:00Z"),
      now,
      5,
    )).toEqual({ state: "definite-failure", failureCode: "TEMPORARY" });
    expect(resolveUnknownOutcome(
      { state: "definite-failure", code: "REJECTED", retryable: false },
      new Date("2026-11-18T12:00:00Z"),
      now,
      1,
    )).toEqual({ state: "definite-failure", failureCode: "REJECTED" });
  });

  it("does not treat future inbound timestamps as an open service window", () => {
    expect(isWithinCustomerServiceWindow(new Date("2026-11-17T11:00:00Z"), now, 24)).toBe(true);
    expect(isWithinCustomerServiceWindow(new Date("2026-11-17T12:01:00Z"), now, 24)).toBe(false);
    expect(isWithinCustomerServiceWindow(new Date("2026-11-16T11:00:00Z"), now, 24)).toBe(false);
  });
});
