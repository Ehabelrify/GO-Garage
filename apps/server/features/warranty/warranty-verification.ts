import { createHash, createHmac, randomBytes } from "node:crypto";
import type {
  PublicWarrantyVerification,
  WarrantyStatus,
  WarrantyVerificationField,
} from "@garage/domain";

export const warrantyVerificationFields: readonly WarrantyVerificationField[] = [
  "service",
  "status",
  "startDate",
  "expiresOn",
  "branch",
  "coverage",
];

export interface PublicWarrantyVerificationRow {
  recordStatus: "active" | "void";
  startDate: string;
  expiresOn: string | null;
  coverageKind?: "fixed" | "lifetime";
  publicWording?: { ar: string; en: string };
  terminatedOn?: string | null;
  cairoToday: string;
  serviceNameEn: string;
  serviceNameAr: string;
  branchNameEn: string;
  branchNameAr: string;
}

export function createWarrantyVerificationToken() {
  return randomBytes(32).toString("base64url");
}

/** Secret the customer QR codes are derived from. Required in production; a fixed development value elsewhere so dev and seeded data work. */
export function warrantyQrSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.WARRANTY_QR_SECRET?.trim();
  if (configured) return configured;
  return env.NODE_ENV === "production" ? null : "garage-os-development-warranty-qr-secret";
}

/**
 * The customer QR token is derived from the secret and the token row id (HMAC-SHA256, 43 base64url characters, the exact shape
 * isWarrantyVerificationTokenFormat accepts). The database still stores only the hash, so a leaked database reveals no code, and
 * staff can re-display or reprint the same code any time. Replacing a code creates a new row id, hence a new code.
 */
export function deriveWarrantyVerificationToken(tokenId: string, secret: string): string {
  return createHmac("sha256", secret).update(`warranty-qr:${tokenId}`).digest("base64url");
}

export function hashWarrantyVerificationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isWarrantyVerificationTokenFormat(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function normalizeWarrantyVerificationFields(fields: readonly string[]): WarrantyVerificationField[] {
  return warrantyVerificationFields.filter((field) => fields.includes(field));
}

export function canEnableWarrantyVerification(fields: readonly WarrantyVerificationField[]) {
  return fields.includes("service") && fields.includes("status");
}

function customerFacingStatus(
  recordStatus: PublicWarrantyVerificationRow["recordStatus"],
  expiresOn: string | null,
  cairoToday: string,
  coverageKind: "fixed" | "lifetime" = "fixed",
  terminatedOn: string | null = null,
): WarrantyStatus {
  if (recordStatus === "void") return "void";
  if (coverageKind === "lifetime") return terminatedOn && terminatedOn <= cairoToday ? "terminated" : "active";
  return expiresOn && expiresOn < cairoToday ? "expired" : "active";
}

export function buildPublicWarrantyVerification(
  row: PublicWarrantyVerificationRow,
  approvedFields: readonly WarrantyVerificationField[],
): PublicWarrantyVerification {
  const status = customerFacingStatus(row.recordStatus, row.expiresOn, row.cairoToday, row.coverageKind, row.terminatedOn);
  return {
    verified: true,
    status,
    ...(approvedFields.includes("service")
      ? { serviceName: { en: row.serviceNameEn, ar: row.serviceNameAr } }
      : {}),
    ...(approvedFields.includes("branch")
      ? { branchName: { en: row.branchNameEn, ar: row.branchNameAr } }
      : {}),
    ...(approvedFields.includes("startDate") ? { startDate: row.startDate } : {}),
    ...(approvedFields.includes("expiresOn") && row.expiresOn ? { expiresOn: row.expiresOn } : {}),
    ...(approvedFields.includes("coverage") ? { coverage: row.coverageKind === "lifetime"
      ? { kind: "lifetime" as const, ...(row.publicWording ? { publicWording: row.publicWording } : {}) }
      : { kind: "fixed" as const } } : {}),
  };
}
