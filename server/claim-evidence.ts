import path from "node:path";

export const MAX_CLAIM_EVIDENCE_BYTES = 8 * 1024 * 1024;
export const MAX_CLAIM_EVIDENCE_PER_CLAIM = 10;

export type ClaimEvidenceType = {
  contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  extension: ".jpg" | ".png" | ".webp" | ".pdf";
};

const allowedExtensions: Record<ClaimEvidenceType["contentType"], string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

export function identifyClaimEvidence(buffer: Buffer, fileName: string): ClaimEvidenceType | null {
  const extension = path.extname(fileName).toLowerCase();
  let contentType: ClaimEvidenceType["contentType"] | undefined;

  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    contentType = "application/pdf";
  } else if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    contentType = "image/png";
  } else if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    contentType = "image/jpeg";
  } else if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    contentType = "image/webp";
  }

  if (!contentType || !allowedExtensions[contentType].includes(extension)) return null;

  return {
    contentType,
    extension: contentType === "image/jpeg" ? ".jpg" : extension as ClaimEvidenceType["extension"],
  };
}

export function safeClaimEvidenceFileName(fileName: string, extension: ClaimEvidenceType["extension"]) {
  const baseName = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = baseName
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .slice(0, 180);
  const stem = path.basename(cleaned, path.extname(cleaned)).trim() || "claim-evidence";
  return `${stem}${extension}`;
}
