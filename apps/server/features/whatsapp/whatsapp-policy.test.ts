import { describe, expect, it } from "vitest";
import { isWhatsAppProviderDeliveryEnabled, isWhatsAppSimulationWriteEnabled } from "./whatsapp-policy";

describe("WhatsApp simulation safety gate", () => {
  it("allows simulation writes outside production and blocks them in production", () => {
    expect(isWhatsAppSimulationWriteEnabled("development")).toBe(true);
    expect(isWhatsAppSimulationWriteEnabled("test")).toBe(true);
    expect(isWhatsAppSimulationWriteEnabled("production")).toBe(false);
  });

  it("keeps provider delivery disabled until a separately approved integration exists", () => {
    expect(isWhatsAppProviderDeliveryEnabled()).toBe(false);
  });
});
