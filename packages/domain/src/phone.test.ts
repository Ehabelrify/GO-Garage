import { describe, expect, it } from "vitest";
import { phoneDigits } from "./phone";

describe("phoneDigits", () => {
  it("gives the same identity for ASCII, Arabic-Indic, Eastern and mixed digits", () => {
    const expected = "201001234567";
    expect(phoneDigits("+20 100 123 4567")).toBe(expected);
    expect(phoneDigits("+٢٠ ١٠٠ ١٢٣ ٤٥٦٧")).toBe(expected);
    expect(phoneDigits("+۲۰ ۱۰۰ ۱۲۳ ۴۵۶۷")).toBe(expected);
    expect(phoneDigits("٠١٠٠-123-٤٥٦٧")).toBe("01001234567");
  });
  it("is safe on empty input", () => {
    expect(phoneDigits(null)).toBe("");
    expect(phoneDigits(undefined)).toBe("");
  });
});
