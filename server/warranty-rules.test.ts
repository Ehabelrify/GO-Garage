import { describe, expect, it } from "vitest";
import {
  canAttachEvidenceToClaim,
  isWarrantyExpired,
  selectAutomaticWarrantyPolicy,
  type AutomaticWarrantyPolicyCandidate,
} from "./warranty-rules";

const policy = (overrides: Partial<AutomaticWarrantyPolicyCandidate> = {}): AutomaticWarrantyPolicyCandidate => ({
  policy_id: "tint-coverage",
  version: 1,
  duration_months: 12,
  eligible_service_ids: ["tint"],
  auto_issue: true,
  status: "published",
  start_rule: "job-delivery",
  ...overrides,
});

describe("automatic warranty policy selection", () => {
  it("selects the published automatic policy for the delivered service", () => {
    expect(selectAutomaticWarrantyPolicy([
      policy({ status: "draft", policy_id: "draft" }),
      policy({ auto_issue: false, policy_id: "manual" }),
      policy(),
    ], "tint")).toEqual({ policy: policy() });
  });

  it("does not issue for ineligible services or owner-selected start dates", () => {
    expect(selectAutomaticWarrantyPolicy([policy()], "inspection")).toEqual({ policy: null });
    expect(selectAutomaticWarrantyPolicy([
      policy({ start_rule: "owner-selected-date" }),
    ], "tint")).toEqual({ policy: null });
  });

  it("fails closed when published automatic policies overlap", () => {
    expect(selectAutomaticWarrantyPolicy([
      policy(),
      policy({ policy_id: "second-policy", version: 2 }),
    ], "tint")).toEqual({ error: "overlapping-policies" });
  });
});

describe("warranty claim safeguards", () => {
  it("keeps coverage valid through the expiry date and rejects it afterward", () => {
    expect(isWarrantyExpired("2026-11-12", "2026-11-12")).toBe(false);
    expect(isWarrantyExpired("2026-11-11", "2026-11-12")).toBe(true);
  });

  it("allows evidence only while a claim is open or under review", () => {
    expect(canAttachEvidenceToClaim("open")).toBe(true);
    expect(canAttachEvidenceToClaim("under-review")).toBe(true);
    expect(canAttachEvidenceToClaim("approved")).toBe(false);
    expect(canAttachEvidenceToClaim("denied")).toBe(false);
    expect(canAttachEvidenceToClaim("closed")).toBe(false);
  });
});
