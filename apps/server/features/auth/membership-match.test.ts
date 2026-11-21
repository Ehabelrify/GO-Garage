import { describe, expect, it } from "vitest";
import { isClaimableInvitation, isInvitedId, normalizeEmail } from "./membership-match";

describe("pre-approved staff email matching", () => {
  it("matches a verified email case-insensitively and ignoring whitespace", () => {
    expect(isClaimableInvitation({ email: "Sara@Work.com", status: "invited" }, " sara@work.COM ")).toBe(true);
    expect(normalizeEmail("  A@B.com ")).toBe("a@b.com");
  });

  it("refuses a different email or a missing verified email", () => {
    expect(isClaimableInvitation({ email: "sara@work.com", status: "invited" }, "other@work.com")).toBe(false);
    expect(isClaimableInvitation({ email: "sara@work.com", status: "invited" }, "sara@work.com.evil.com")).toBe(false);
    expect(isClaimableInvitation({ email: "sara@work.com", status: "invited" }, undefined)).toBe(false);
    expect(isClaimableInvitation({ email: "sara@work.com", status: "invited" }, "")).toBe(false);
  });

  it("never reactivates removed or already-claimed memberships", () => {
    expect(isClaimableInvitation({ email: "sara@work.com", status: "inactive" }, "sara@work.com")).toBe(false);
    expect(isClaimableInvitation({ email: "sara@work.com", status: "active" }, "sara@work.com")).toBe(false);
  });

  it("recognises placeholder ids for unclaimed invitations", () => {
    expect(isInvitedId("invited:1234")).toBe(true);
    expect(isInvitedId("user_2abc")).toBe(false);
  });
});
