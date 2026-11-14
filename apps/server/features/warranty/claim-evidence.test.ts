import { describe, expect, it } from "vitest";
import {
  identifyClaimEvidence,
  MAX_CLAIM_EVIDENCE_BYTES,
  MAX_CLAIM_EVIDENCE_PER_CLAIM,
  safeClaimEvidenceFileName,
} from "./claim-evidence";

describe("warranty claim evidence files", () => {
  it("recognizes supported file signatures and matching extensions", () => {
    expect(identifyClaimEvidence(Buffer.from("%PDF-1.7"), "report.pdf")).toEqual({
      contentType: "application/pdf",
      extension: ".pdf",
    });
    expect(identifyClaimEvidence(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "photo.png",
    )).toEqual({ contentType: "image/png", extension: ".png" });
    expect(identifyClaimEvidence(Buffer.from([0xff, 0xd8, 0xff]), "photo.jpeg")).toEqual({
      contentType: "image/jpeg",
      extension: ".jpg",
    });
    expect(identifyClaimEvidence(Buffer.from("RIFF0000WEBP"), "photo.webp")).toEqual({
      contentType: "image/webp",
      extension: ".webp",
    });
  });

  it("rejects unrecognized content and misleading extensions", () => {
    expect(identifyClaimEvidence(Buffer.from("not a PDF"), "report.pdf")).toBeNull();
    expect(identifyClaimEvidence(Buffer.from("%PDF-1.7"), "report.jpg")).toBeNull();
    expect(identifyClaimEvidence(Buffer.from([0xff, 0xd8, 0xff]), "photo.svg")).toBeNull();
  });

  it("normalizes filenames and applies explicit upload limits", () => {
    expect(safeClaimEvidenceFileName("../customer\r\nname.pdf", ".pdf")).toBe("customername.pdf");
    expect(MAX_CLAIM_EVIDENCE_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_CLAIM_EVIDENCE_PER_CLAIM).toBe(10);
  });
});
