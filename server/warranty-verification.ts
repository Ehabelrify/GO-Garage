import { createHash, randomBytes } from "node:crypto";
import type {
  PublicWarrantyVerification,
  WarrantyStatus,
  WarrantyVerificationField,
} from "../src/types";

export const warrantyVerificationFields: readonly WarrantyVerificationField[] = [
  "service",
  "status",
  "startDate",
  "expiresOn",
  "branch",
];

export interface PublicWarrantyVerificationRow {
  recordStatus: "active" | "void";
  startDate: string;
  expiresOn: string;
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
  expiresOn: string,
  cairoToday: string,
): WarrantyStatus {
  if (recordStatus === "void") return "void";
  return expiresOn < cairoToday ? "expired" : "active";
}

export function buildPublicWarrantyVerification(
  row: PublicWarrantyVerificationRow,
  approvedFields: readonly WarrantyVerificationField[],
): PublicWarrantyVerification {
  const status = customerFacingStatus(row.recordStatus, row.expiresOn, row.cairoToday);
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
    ...(approvedFields.includes("expiresOn") ? { expiresOn: row.expiresOn } : {}),
  };
}
