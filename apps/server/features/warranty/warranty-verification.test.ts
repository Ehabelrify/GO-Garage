import { describe, expect, it } from "vitest";
import {
  buildPublicWarrantyVerification,
  canEnableWarrantyVerification,
  createWarrantyVerificationToken,
  deriveWarrantyVerificationToken,
  warrantyQrSecret,
  hashWarrantyVerificationToken,
  isWarrantyVerificationTokenFormat,
  normalizeWarrantyVerificationFields,
  type PublicWarrantyVerificationRow,
} from "./warranty-verification";

const sample: PublicWarrantyVerificationRow = {
  recordStatus: "active",
  startDate: "2026-11-12",
  expiresOn: "2027-11-11",
  cairoToday: "2026-11-12",
  serviceNameEn: "Window tint",
  serviceNameAr: "تظليل زجاج",
  branchNameEn: "Cairo branch",
  branchNameAr: "فرع القاهرة",
};

describe("warranty verification tokens", () => {
  it("creates high-entropy URL-safe tokens and stores only a one-way hash", () => {
    const first = createWarrantyVerificationToken();
    const second = createWarrantyVerificationToken();

    expect(isWarrantyVerificationTokenFormat(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(hashWarrantyVerificationToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashWarrantyVerificationToken(first)).not.toBe(first);
  });

  it("accepts only approved public fields and requires service and status to enable", () => {
    const fields = normalizeWarrantyVerificationFields(["status", "service", "customer", "service"]);
    expect(fields).toEqual(["service", "status"]);
    expect(canEnableWarrantyVerification(fields)).toBe(true);
    expect(canEnableWarrantyVerification(["expiresOn"])).toBe(false);
  });
});

describe("public warranty response", () => {
  it("includes only the Owner-approved details and never adds customer data", () => {
    const result = buildPublicWarrantyVerification(sample, ["service", "status"]);
    expect(result).toEqual({
      verified: true,
      status: "active",
      serviceName: { en: "Window tint", ar: "تظليل زجاج" },
    });
    expect(result).not.toHaveProperty("customerName");
    expect(result).not.toHaveProperty("plate");
    expect(result).not.toHaveProperty("jobId");
  });

  it("marks expired and void coverage without exposing unapproved fields", () => {
    expect(buildPublicWarrantyVerification({
      ...sample,
      expiresOn: "2026-11-11",
    }, ["status"])).toEqual({ verified: true, status: "expired" });
    expect(buildPublicWarrantyVerification({
      ...sample,
      recordStatus: "void",
    }, ["status"])).toEqual({ verified: true, status: "void" });
  });
});

describe("derivable customer QR codes", () => {
  it("derives the same valid code for the same row and secret, and a different code for another row or secret", () => {
    const a = deriveWarrantyVerificationToken("tok-1", "secret-a");
    expect(a).toBe(deriveWarrantyVerificationToken("tok-1", "secret-a"));
    expect(isWarrantyVerificationTokenFormat(a)).toBe(true);
    expect(deriveWarrantyVerificationToken("tok-2", "secret-a")).not.toBe(a);
    expect(deriveWarrantyVerificationToken("tok-1", "secret-b")).not.toBe(a);
  });
  it("a replaced code (new row id) is a different code, so the old printed card stops matching", () => {
    expect(hashWarrantyVerificationToken(deriveWarrantyVerificationToken("old", "s"))).not.toBe(hashWarrantyVerificationToken(deriveWarrantyVerificationToken("new", "s")));
  });
  it("needs a configured secret in production and falls back to a development value elsewhere", () => {
    expect(warrantyQrSecret({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBeNull();
    expect(warrantyQrSecret({ NODE_ENV: "production", WARRANTY_QR_SECRET: "  real  " } as NodeJS.ProcessEnv)).toBe("real");
    expect(warrantyQrSecret({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBeTruthy();
  });
});
