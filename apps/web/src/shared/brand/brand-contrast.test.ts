import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Typed mirror of the colour tokens in shared/styles/tokens.css (the test also checks the mirror matches the file). */
const c = {
  graphite: "#17191D", warmWhite: "#F6F4EF", white: "#FFFFFF", red: "#C82127", redDark: "#98171B",
  gold: "#F3B61F", goldText: "#8A5A00", goldTint: "#FFF4D6", goldInk: "#7A4F0E", muted: "#676B70", captionMuted: "#585D62", danger: "#B42318",
} as const;

function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function ratio(fg: string, bg: string) {
  const [a, b] = [lum(fg), lum(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const text: Array<[string, string, string]> = [
  ["white on red", c.white, c.red], ["white on deep red", c.white, c.redDark],
  ["red on white", c.red, c.white], ["red on warm white", c.red, c.warmWhite],
  ["graphite on gold", c.graphite, c.gold], ["gold text on white", c.goldText, c.white],
  ["gold ink on gold tint", c.goldInk, c.goldTint], ["muted on white", c.muted, c.white],
  ["muted on warm white", c.muted, c.warmWhite], ["caption muted on warm white", c.captionMuted, c.warmWhite],
  ["warm white on graphite", c.warmWhite, c.graphite], ["danger on white", c.danger, c.white],
  ["graphite on warm white", c.graphite, c.warmWhite],
];

describe("brand colour contrast (WCAG AA)", () => {
  it.each(text)("%s >= 4.5:1", (_name, fg, bg) => { expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5); });
  it("red marker on graphite meets the 3:1 UI minimum", () => { expect(ratio(c.red, c.graphite)).toBeGreaterThanOrEqual(3); });
  it("gold alone is not usable as text on white (guard)", () => { expect(ratio(c.gold, c.white)).toBeLessThan(3); });
});

describe("tokens.css", () => {
  const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
  it("contains no old teal values", () => {
    for (const hex of ["#176d68", "#105854", "#173b40"]) expect(css.toLowerCase()).not.toContain(hex);
  });
  it("mirrors the brand tokens used in this test", () => {
    for (const hex of [c.graphite, c.warmWhite, c.red, c.redDark, c.gold, c.goldText, c.goldTint, c.goldInk, c.muted, c.captionMuted]) {
      expect(css.toLowerCase()).toContain(hex.toLowerCase());
    }
  });
});
