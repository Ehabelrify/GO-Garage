import { describe, expect, it } from "vitest";
import { deliveryStatusLabel, keepKeyOnRetry, lastSentLine, nextSendState, sendErrorCopy, type DeliveryEntry } from "./send-to-customer-logic";

const entry: DeliveryEntry = { id: "1", status: "sent-simulated", deliveryMode: "simulated", trigger: "manual", recipient: "+20•••567", language: "ar", linkIncluded: false, sentAt: "2026-11-22T10:00:00Z" };

describe("send to customer state", () => {
  it("moves idle to sending to sent or error and ignores a second start", () => {
    const sending = nextSendState({ kind: "idle" }, { type: "start" });
    expect(nextSendState(sending, { type: "start" })).toBe(sending);
    expect(nextSendState(sending, { type: "done", entry, replayed: false })).toMatchObject({ kind: "sent" });
    expect(nextSendState(sending, { type: "fail", code: "CONSENT_REQUIRED" })).toEqual({ kind: "error", code: "CONSENT_REQUIRED" });
  });
  it("shows the consent refusal and the app channel stub in both languages", () => {
    expect(sendErrorCopy("CONSENT_REQUIRED", "en")).toContain("no recorded WhatsApp consent");
    expect(sendErrorCopy("CONSENT_REQUIRED", "ar")).toContain("موافقة");
    expect(sendErrorCopy("CHANNEL_NOT_AVAILABLE", "en")).toContain("not available yet");
  });
  it("never calls a simulated send delivered", () => {
    expect(deliveryStatusLabel(entry, "en")).toContain("not delivered");
    expect(deliveryStatusLabel({ status: "delivered", deliveryMode: "live" }, "en")).toBe("Delivered");
  });
  it("builds the last-sent line and reuses the key only after a network failure", () => {
    expect(lastSentLine([], "en", String)).toBeNull();
    expect(lastSentLine([entry], "en", () => "T")).toBe("Last sent to +20•••567 at T · Simulated send (not delivered)");
    expect(keepKeyOnRetry("NETWORK")).toBe(true);
    expect(keepKeyOnRetry("CONSENT_REQUIRED")).toBe(false);
  });
});
