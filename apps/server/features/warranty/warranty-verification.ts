import { createHash, randomBytes } from "node:crypto";
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
