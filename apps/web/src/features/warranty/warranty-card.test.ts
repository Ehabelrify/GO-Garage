import { describe, expect, it } from "vitest";
import { buildVerifyUrl, buildWarrantyCard, forgetLiveToken, liveToken, rememberLiveToken, warrantyDisplayNumber, type WarrantyCardInput } from "./warranty-card";

const fixed = { id: "warranty-abc123", policyName: "Ceramic coating - 24 months (example)", startDate: "2026-11-22", expiresOn: "2028-11-21", terminatedOn: null,
  coverageKind: "fixed" as const, lifetimeDefinition: null, issuedAt: "2026-11-22T10:00:00Z", status: "active" as const, verificationTokenActive: true };
const base: WarrantyCardInput = { record: fixed, lang: "en", customerName: "Amal", plate: "1234", serviceLabel: "Ceramic", branchLabel: "Maadi",
  verificationEnabled: true, token: "tok/en 1", origin: "https://garage.example", basePath: "/" };
const lifetime = { ...fixed, coverageKind: "lifetime" as const, expiresOn: null,
  lifetimeDefinition: { subject: "vehicle" as const, subjectDefinition: "x", terminationConditions: "x", transferRule: "x", maintenanceConditions: "x", issuer: "x", remedy: "x",
    publicWording: { en: "Covered for as long as you own the vehicle.", ar: "مغطى طالما تملك المركبة." } } };

describe("warranty card model", () => {
  it("shows the fixed expiry date and hides the example marker", () => {
    const card = buildWarrantyCard(base);
    expect(card.termHeading).toBe("Valid until 21 Nov 2028");
    expect(card.termDetail).toBeNull();
    expect(card.product).toBe("Ceramic coating - 24 months");
  });
  it("prints lifetime wording exactly as issued, per language", () => {
    expect(buildWarrantyCard({ ...base, record: lifetime }).termDetail).toBe("Covered for as long as you own the vehicle.");
    const ar = buildWarrantyCard({ ...base, record: lifetime, lang: "ar" });
    expect(ar.termHeading).toBe("تغطية مدى الحياة");
    expect(ar.termDetail).toBe("مغطى طالما تملك المركبة.");
    expect(buildWarrantyCard({ ...base, record: { ...lifetime, terminatedOn: "2027-01-05" } }).termHeading).toContain("Ended");
  });
  it("builds the verification URL with an encoded token and tolerates slashes", () => {
    expect(buildVerifyUrl("https://a.example/", "/app/", "a/b c")).toBe("https://a.example/app/warranty/verify/a%2Fb%20c");
    const card = buildWarrantyCard(base);
    expect(card.qr).toEqual({ state: "live", url: "https://garage.example/warranty/verify/tok%2Fen%201" });
    expect(card.qrNote).toBeNull();
  });
  it("prints without a live QR when verification is off, no token is known, or the code is inactive", () => {
    const off = buildWarrantyCard({ ...base, verificationEnabled: false });
    expect(off.qr).toEqual({ state: "unavailable", reason: "verification-off" });
    expect(off.qrNote).toContain("not available");
    expect(buildWarrantyCard({ ...base, token: null }).qr).toEqual({ state: "unavailable", reason: "not-prepared" });
    expect(buildWarrantyCard({ ...base, record: { ...fixed, verificationTokenActive: false } }).qr.state).toBe("unavailable");
    expect(buildWarrantyCard({ ...base, record: { ...fixed, status: "void" } }).qr.state).toBe("unavailable");
  });
  it("derives a stable display number that is not the raw id", () => {
    const n = warrantyDisplayNumber("warranty-abc123", "2026-11-22T10:00:00Z");
    expect(n).toMatch(/^WC-2026-[0-9A-Z]{6}$/);
    expect(n).toBe(warrantyDisplayNumber("warranty-abc123", "2026-11-22T10:00:00Z"));
    expect(n).not.toContain("abc123");
  });
  it("keeps live tokens in memory only", () => {
    rememberLiveToken("w1", "t"); expect(liveToken("w1")).toBe("t"); forgetLiveToken("w1"); expect(liveToken("w1")).toBeNull();
  });
});
