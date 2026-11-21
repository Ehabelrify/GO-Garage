import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLATE_STRIP_CLASS, PLATE_TRANSLATE_FROM, PLATE_TRANSLATE_TO, formatPlateDisplay, isPlausiblePlate, normalizePlate,
  plateMatchesQuery, plateParts, plateSearchKeys, toAsciiDigits,
} from "./plate";

const KEY = "ابج1234";

describe("normalizePlate", () => {
  const sameAsKey = [
    "أ ب ج 1234", "ابج١٢٣٤", "ا ب ج-1234", "ا ب ج ۱۲۳۴",
    "  ا  ب  ج  1234  ", "اـبـج 1234", "إ ب ج 1234", "آ ب ج 1234", "ا‌ب‍ج‏1234", "ا ب ج 1234",
    "ا.ب.ج.1234", "ا_ب_ج_1234", "ا–ب—ج−1234", "اَبُج 1234", "1234 ا ب ج", "١٢٣٤ ابج", "﻿ابج1234",
  ]
  it.each(sameAsKey)("maps %j to the canonical key", (input) => {
    expect(normalizePlate(input)).toBe(KEY);
  });

  it("table of letter and digit variants", () => {
    const table: Array<[string, string]> = [
      ["", ""], ["   ", ""], ["abc 123", "ABC123"], ["ABC-123", "ABC123"], ["abc123", "ABC123"], ["123 abc", "ABC123"],
      ["٠١٢٣٤٥٦٧٨٩", "0123456789"], ["۰۱۲۳۴۵۶۷۸۹", "0123456789"], ["س م ر ٥٦٧٨", "سمر5678"],
      ["ى ي ی ئ", "ييييي".slice(0, 4)], ["ة ه ھ ۀ", "هههه"], ["ک ك", "كك"], ["ؤ و", "وو"],
      ["ع د ر 1357", "عدر1357"], ["ص ط م 9021", "صطم9021"], ["ج ب أ 7788", "جبا7788"],
      ["A1", "A1"], ["a-1", "A1"],
    ];
    for (const [input, expected] of table) expect(normalizePlate(input), JSON.stringify(input)).toBe(expected);
  });

  it("does not transliterate Latin to Arabic and keeps letter order", () => {
    expect(normalizePlate("ABC 1234")).not.toBe(KEY);
    expect(normalizePlate("ج ب أ 1234")).toBe("جبا1234");
    expect(normalizePlate("ج ب أ 1234")).not.toBe(normalizePlate("أ ب ج 1234"));
  });

  it("is idempotent", () => {
    for (const input of ["أ ب ج ١٢٣٤", "abc-12", "1234 جبا", "ك ن ل ٢٤٦٨"]) {
      expect(normalizePlate(normalizePlate(input))).toBe(normalizePlate(input));
    }
  });

  it("tolerates non-string-ish input", () => {
    expect(normalizePlate(undefined as unknown as string)).toBe("");
  });
});

describe("search keys and matching", () => {
  it("finds the same vehicle for every typed form", () => {
    for (const query of ["أ ب ج 1234", "ابج١٢٣٤", "ا ب ج-1234", "1234 جبا", "1234 ابج", "ج ب ا ١٢٣٤"]) {
      expect(plateMatchesQuery("أ ب ج 1234", query), query).toBe(true);
    }
  });
  it("matches partial queries and reversed partial letters", () => {
    expect(plateMatchesQuery("أ ب ج 1234", "ابج")).toBe(true);
    expect(plateMatchesQuery("أ ب ج 1234", "جب")).toBe(true);
    expect(plateMatchesQuery("أ ب ج 1234", "1234")).toBe(true); // digit-only queries match the digit tail
  });
  it("does not match other vehicles", () => {
    expect(plateMatchesQuery("س م ر 5678", "ابج1234")).toBe(false);
    expect(plateMatchesQuery("", "ابج")).toBe(false);
    expect(plateMatchesQuery("أ ب ج 1234", "")).toBe(false);
  });
  it("returns forward and reversed keys without duplicates", () => {
    expect(plateSearchKeys("ا ب ج 12")).toEqual(["ابج12", "جبا12"]);
    expect(plateSearchKeys("ع 5")).toEqual(["ع5"]);
    expect(plateSearchKeys("")).toEqual([]);
  });
  it("splits parts", () => {
    expect(plateParts("ابج ١٢")).toEqual({ letters: "ابج", digits: "12" });
  });
});

describe("formatPlateDisplay", () => {
  it("spaces Arabic letters and appends ASCII digits", () => {
    expect(formatPlateDisplay("ابج١٢٣٤")).toBe("ا ب ج 1234");
    expect(formatPlateDisplay("1234 جبا")).toBe("ج ب ا 1234");
    expect(formatPlateDisplay("أ-ب ج 1234")).toBe("ا ب ج 1234");
  });
  it("keeps Latin groups together and handles partial input", () => {
    expect(formatPlateDisplay("abc 123")).toBe("ABC 123");
    expect(formatPlateDisplay("ابج")).toBe("ا ب ج");
    expect(formatPlateDisplay("12")).toBe("12");
    expect(formatPlateDisplay("")).toBe("");
  });
  it("wraps Arabic plates in an RTL isolate on request only", () => {
    expect(formatPlateDisplay("ابج1234", { isolate: true })).toBe("⁧ا ب ج 1234⁩");
    expect(formatPlateDisplay("ABC123", { isolate: true })).toBe("ABC 123");
    expect(formatPlateDisplay("", { isolate: true })).toBe("");
  });
});

describe("isPlausiblePlate", () => {
  it.each(["أ ب ج 1234", "ابج١٢٣٤", "س م ر 5678", "ABC 123", "ع 12", "1234 جبا", "ا ب 1"])("accepts %j", (value) => {
    expect(isPlausiblePlate(value)).toBe(true);
  });
  it.each(["", "A", "1234", "ابج", "ابجده 1", "ا ب ج 1234567", "ا ب ج !234", "ا ب ج @ 12"])("rejects %j", (value) => {
    expect(isPlausiblePlate(value)).toBe(false);
  });
});

describe("toAsciiDigits", () => {
  it("converts both digit families only", () => {
    expect(toAsciiDigits("٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹ ab")).toBe("0123456789 0123456789 ab");
  });
});

/**
 * SQL equivalence. Migration 0032 defines garage_normalize_plate with translate(), regexp_replace(strip class) and a
 * letters-then-digits concatenation. Without a database we re-execute exactly those documented semantics, driven by
 * the literals parsed OUT of the migration file, and compare with the TS normaliser for a table of inputs.
 * Divergences known by design (none observed): PostgreSQL translate()/regexp work per code point exactly like the
 * JS code-point iteration here; characters outside the BMP are untouched by both.
 */
describe("migration 0032 equivalence", () => {
  const sql = readFileSync(new URL("../../../apps/server/infrastructure/database/migrations/0032_plate_normalization.sql", import.meta.url), "utf8");
  const translateMatch = /translate\(plate, '([^']+)', '([^']+)'\)/.exec(sql);
  const stripMatch = /\n\s+'(\[[^\n]*\])', '', 'g'\) AS s/.exec(sql);

  it("embeds the TypeScript constants verbatim", () => {
    expect(translateMatch?.[1]).toBe(PLATE_TRANSLATE_FROM);
    expect(translateMatch?.[2]).toBe(PLATE_TRANSLATE_TO);
    expect(stripMatch?.[1]).toBe(PLATE_STRIP_CLASS);
    expect([...PLATE_TRANSLATE_FROM].length).toBe([...PLATE_TRANSLATE_TO].length);
    expect(new Set([...PLATE_TRANSLATE_FROM]).size).toBe([...PLATE_TRANSLATE_FROM].length);
  });

  /** postgres translate(): per-character, first occurrence in `from`, chars beyond `to` would be deleted (never the case here). */
  function sqlTranslate(value: string, from: string, to: string): string {
    const f = [...from]; const t = [...to];
    return [...value].map((char) => { const at = f.indexOf(char); return at < 0 ? char : (t[at] ?? ""); }).join("");
  }
  function sqlNormalize(value: string): string {
    const s = sqlTranslate(value, translateMatch![1], translateMatch![2]).replace(new RegExp(stripMatch![1], "g"), "");
    return s.replace(/[0-9]/g, "") + s.replace(/[^0-9]/g, "");
  }

  it("agrees with normalizePlate on a table of inputs", () => {
    const inputs = [
      "أ ب ج 1234", "ابج١٢٣٤", "ا ب ج-1234", "1234 جبا", "abc-123", "ABC 123", "  س م ر ٥٦٧٨ ", "ـاـبـ", "ا​ب‌ج‍‎‏‪1⁦",
      "ى ي ی ئ ے", "ة ه ھ ۀ ہ", "ک ك", "ؤ و", "إ آ ٱ أ", "اًٌٍَُِّْٰب", "a.b_c-1−–2",
      "١٢٣ ۴۵۶ 789", "  　x", "", "!@#", "ك ن ل ٢٤٦٨", "ص\tط\nم\r9021",
    ];
    for (const input of inputs) expect(sqlNormalize(input), JSON.stringify(input)).toBe(normalizePlate(input));
  });
});
