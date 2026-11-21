import { describe, expect, it } from "vitest";
import { digitsOnly, escapeLike, normalizePlate, plateLikePatterns, parseSearchTypes, parseWarrantyCode, restrictedSection } from "./relations-helpers";
import { hashWarrantyVerificationToken } from "../warranty/warranty-verification";

describe("relations helpers", () => {
  it("escapes LIKE metacharacters so user text is literal", () => {
    expect(escapeLike("50%_off")).toBe(String.raw`50\%\_off`);
  });
  it("normalises plates and digits", () => {
    expect(normalizePlate("abc 123-x")).toBe("ABCX123");
    expect(digitsOnly("+20 100-555")).toBe("20100555");
  });
  it("normalises Arabic plates and digits for search", () => {
    expect(normalizePlate("أ ب ج ١٢٣٤")).toBe("ابج1234");
    expect(digitsOnly("٠١٠٠ ١٢٣")).toBe("0100123");
    expect(plateLikePatterns("1234 جبا")).toEqual(["%جبا1234%", "%ابج1234%"]);
    expect(plateLikePatterns("a_b1")).toEqual(["%AB1%", "%BA1%"]);
    expect(plateLikePatterns("a%1")[0]).toBe("%A" + "\\" + "%1%");
  });
  it("parses search types and falls back to all", () => {
    expect(parseSearchTypes("customer,quote")).toEqual(["customer", "quote"]);
    expect(parseSearchTypes("nonsense")).toHaveLength(5);
    expect(parseSearchTypes(undefined)).toHaveLength(5);
  });
  it("resolves a QR token from a pasted verification URL", () => {
    const token = "A".repeat(43);
    const parsed = parseWarrantyCode(`https://x.test/warranty/verify/${token}?a=1`);
    expect(parsed.code).toBe(token);
    expect(parsed.tokenHash).toBe(hashWarrantyVerificationToken(token));
    expect(parseWarrantyCode("warranty-123").tokenHash).toBeNull();
  });
  it("marks restricted sections without items", () => {
    expect(restrictedSection()).toEqual({ count: 0, items: [], restricted: true });
  });
});
