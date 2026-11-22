import { describe, expect, it } from "vitest";
import type { WarrantyPolicy } from "@garage/domain";
import {
  branchAllowed, buildPolicyInput, evidenceFileProblem, expiryPreview, extractWarrantyCode, formatDate, freshPolicyForm,
  policyDisplayName, policyFormFrom, policyTermsComplete, reviewerAssigned, verificationReady, visibleAuditEvents, warrantyTabCounts,
} from "./warranty-logic";

const policy = (over: Partial<WarrantyPolicy> = {}): WarrantyPolicy => ({
  coverageKind: "fixed", lifetimeDefinition: null, policyId: "p1", version: 1, name: "Tint", eligibleServiceIds: ["tint"],
  autoIssue: false, startRule: "job-delivery", durationMonths: 12, exclusions: "x", evidenceRequirements: "y",
  reviewRole: "owner", responseDays: 5, status: "draft", createdAt: "2026-01-01", ...over,
});

describe("warranty-logic", () => {
  it("clamps expiry to the day before the anniversary", () => {
    expect(expiryPreview("2026-01-31", 1)).toBe("2026-02-27");
    expect(expiryPreview("2026-03-10", 12)).toBe("2027-03-09");
    expect(expiryPreview("", 12)).toBe("");
  });
  it("applies branch scope and selector", () => {
    expect(branchAllowed({ currentBranch: "all" }, "a", ["a"])).toBe(true);
    expect(branchAllowed({ currentBranch: "b" as never }, "a", ["a"])).toBe(false);
    expect(branchAllowed({ currentBranch: "all" }, "c", ["a"])).toBe(false);
  });
  it("requires complete terms before publishing", () => {
    expect(policyTermsComplete(policy())).toBe(true);
    expect(policyTermsComplete(policy({ exclusions: " " }))).toBe(false);
    expect(policyTermsComplete(policy({ autoIssue: true, startRule: "owner-selected-date" }))).toBe(false);
    expect(policyTermsComplete(policy({ coverageKind: "lifetime", durationMonths: null }))).toBe(false);
  });
  it("needs service and status approved for public verification", () => {
    expect(verificationReady({ enabled: true, approvedFields: ["service", "status"] })).toBe(true);
    expect(verificationReady({ enabled: true, approvedFields: ["service"] })).toBe(false);
    expect(verificationReady({ enabled: false, approvedFields: ["service", "status"] })).toBe(false);
  });
  it("extracts a code from a scanned QR URL or bare value", () => {
    expect(extractWarrantyCode("https://x.app/warranty/verify/abc%20d?x=1")).toBe("abc d");
    expect(extractWarrantyCode("  W-100 ")).toBe("W-100");
    expect(extractWarrantyCode("")).toBe("");
  });
  it("validates evidence files", () => {
    expect(evidenceFileProblem({ size: 9 * 1024 * 1024 }, 0)).toBe("too-large");
    expect(evidenceFileProblem({ size: 10 }, 10)).toBe("limit");
    expect(evidenceFileProblem({ size: 10 }, 9)).toBeNull();
  });
  it("assigns review by role", () => {
    expect(reviewerAssigned("owner", "owner")).toBe(true);
    expect(reviewerAssigned("branch-manager", "owner")).toBe(false);
    expect(reviewerAssigned("branch-manager", "branch-manager")).toBe(true);
    expect(reviewerAssigned("receptionist", "branch-manager")).toBe(false);
  });
  it("round-trips a fixed policy form into an input", () => {
    const form = policyFormFrom(policy());
    expect(buildPolicyInput(form)).toMatchObject({ policyId: "p1", durationMonths: 12, responseDays: 5, lifetimeDefinition: null });
    expect(freshPolicyForm().name).toBe("");
  });
  it("keeps a lifetime draft unapproved until the owner confirms", () => {
    const form = { ...freshPolicyForm(), name: "L", coverageKind: "lifetime" as const, lifetimeSubjectDefinition: "a" };
    expect(buildPolicyInput(form).lifetimeDefinition?.state).toBe("unconfigured");
  });
  it("hides the (example) marker from coverage names", () => {
    expect(policyDisplayName("Ceramic coating - 24 months (example)")).toBe("Ceramic coating - 24 months");
    expect(policyDisplayName("Heat film - lifetime wording (Example) ")).toBe("Heat film - lifetime wording");
    expect(policyDisplayName("GO garage Pro PPF - 7 years")).toBe("GO garage Pro PPF - 7 years");
    expect(policyDisplayName("Tint (example) v2")).toBe("Tint v2");
  });
  it("scopes audit events and counts every tab the same way", () => {
    const event = (id: string, entityType: "policy" | "warranty" | "claim", entityId: string, occurredAt: string) =>
      ({ id, entityType, entityId, occurredAt, action: "x", details: "", actorLabel: "a" }) as never;
    const list = [event("1", "policy", "p", "2026-01-01"), event("2", "warranty", "w1", "2026-01-03"), event("3", "warranty", "w9", "2026-01-04"), event("4", "claim", "c1", "2026-01-02")];
    expect(visibleAuditEvents(list, new Set(["w1"]), new Set(["c1"]), true).map((e) => e.id)).toEqual(["2", "4", "1"]);
    expect(visibleAuditEvents(list, new Set(["w1"]), new Set(["c1"]), false).map((e) => e.id)).toEqual(["2", "4"]);
    expect(warrantyTabCounts({ coverage: 415, claims: 12, invoices: 4, history: 30 })).toEqual({ coverage: 415, claims: 12, invoices: 4, qr: 415, history: 30 });
  });
  it("formats dates with Latin digits in Arabic", () => {
    expect(formatDate("2026-11-22", "ar")).toMatch(/2026/);
    expect(formatDate(null, "en")).toBe("—");
  });
});
