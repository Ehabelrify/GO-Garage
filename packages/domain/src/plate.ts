/**
 * Egyptian licence-plate normalisation (pure, shared by server search, duplicate checks and the web inputs).
 *
 * The canonical comparison KEY is built in four steps:
 *  1. Digits: Arabic-Indic (U+0660-0669) and Eastern/Persian (U+06F0-06F9) digits become ASCII 0-9.
 *  2. Letters: Alef variants (أ إ آ ٱ) -> ا; Yeh variants (ى ی ئ ے) -> ي; Waw hamza (ؤ) -> و; Persian kaf (ک) -> ك;
 *     Heh variants (ة ۀ ہ ھ) -> ه; ASCII a-z -> A-Z. Latin letters are NOT transliterated to Arabic (there is no
 *     standard one-to-one mapping, so "ABC" and "ابج" are different keys).
 *  3. Stripped entirely: whitespace/NBSP/Unicode spaces, hyphens/dashes/minus, dots, underscores, tatweel (ـ),
 *     zero-width and bidi control characters, BOM, and Arabic diacritics (tashkeel).
 *  4. Letters-first: all non-digit characters in typed order, then all digits in typed order. This makes
 *     "1234 جبا" and "جبا 1234" the same key, so digits-first entry matches.
 *
 * Decision on letter ORDER: the key keeps the typed order of the letters. Real Egyptian plates exist whose letters differ
 * only in order (e.g. أ ب ج 1234 and ج ب أ 1234), so order-insensitive keys would merge distinct vehicles and would also
 * wrongly block them as duplicates. Instead, SEARCH (never duplicate detection) additionally tries the letters reversed,
 * because plates are read right-to-left but typed in either direction (see plateSearchKeys).
 *
 * The SQL function garage_normalize_plate (migration 0032) implements exactly the same rules from the constants below;
 * a test compares the two.
 */

/** [from, to] pairs. Order here defines the translate() strings used verbatim in migration 0032. */
const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN = "۰۱۲۳۴۵۶۷۸۹";
const ASCII_DIGITS = "0123456789";
const LATIN_LOWER = "abcdefghijklmnopqrstuvwxyz";
const LATIN_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LETTER_VARIANTS: Array<[string, string]> = [
  ["أإآٱ", "ا"], ["ىیئے", "ي"], ["ؤ", "و"], ["ک", "ك"], ["ةۀہھ", "ه"],
];

function buildTranslate(): { from: string; to: string } {
  let from = ARABIC_INDIC + EASTERN + LATIN_LOWER;
  let to = ASCII_DIGITS + ASCII_DIGITS + LATIN_UPPER;
  for (const [variants, canonical] of LETTER_VARIANTS) {
    from += variants;
    to += canonical.repeat([...variants].length);
  }
  return { from, to };
}

const translate = buildTranslate();
/** translate(plate, PLATE_TRANSLATE_FROM, PLATE_TRANSLATE_TO) in SQL; same length (character for character). */
export const PLATE_TRANSLATE_FROM = translate.from;
export const PLATE_TRANSLATE_TO = translate.to;
/**
 * Regex character class body (identical syntax in JS and PostgreSQL ARE) of characters removed from a plate:
 * ASCII/Unicode whitespace, dashes and minus, dot, underscore, tatweel, ZW/bidi controls, BOM, tashkeel.
 * The hyphen is last so it is literal in both engines.
 */
export const PLATE_STRIP_CLASS =
  String.raw`[ \t\n\r\f\v\u00a0\u1680\u2000-\u200f\u2010-\u2015\u2028-\u202f\u205f-\u206f\u2212\u3000\ufeff\u0640\u064b-\u065f\u0670._-]`;

const stripPattern = new RegExp(PLATE_STRIP_CLASS, "g");
const translateMap = new Map<string, string>();
{
  const from = [...PLATE_TRANSLATE_FROM];
  const to = [...PLATE_TRANSLATE_TO];
  from.forEach((char, index) => translateMap.set(char, to[index]));
}

/** Arabic-Indic and Eastern digits to ASCII (no other change). */
export function toAsciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (char) => String(char.charCodeAt(0) - (char.charCodeAt(0) >= 0x06f0 ? 0x06f0 : 0x0660)));
}

/** Canonical comparison key; "" for empty input. */
export function normalizePlate(input: string): string {
  let text = "";
  for (const char of String(input ?? "")) text += translateMap.get(char) ?? char;
  text = text.replace(stripPattern, "");
  return text.replace(/[0-9]/g, "") + text.replace(/[^0-9]/g, "");
}

/** Splits a key into its letter part and digit part. */
export function plateParts(input: string): { letters: string; digits: string } {
  const key = normalizePlate(input);
  return { letters: key.replace(/[0-9]/g, ""), digits: key.replace(/[^0-9]/g, "") };
}

/**
 * Keys a SEARCH should try: the key itself and the key with the letter order reversed (de-duplicated).
 * Use for substring matching in search only; duplicate detection compares the single key.
 */
export function plateSearchKeys(input: string): string[] {
  const { letters, digits } = plateParts(input);
  const reversed = [...letters].reverse().join("");
  return [...new Set([letters + digits, reversed + digits])].filter(Boolean);
}

/** True when the stored plate contains any search key of the query (case/variant/digit-form insensitive). */
export function plateMatchesQuery(storedPlate: string, query: string): boolean {
  const keys = plateSearchKeys(query);
  if (!keys.length) return false;
  const stored = normalizePlate(storedPlate);
  return keys.some((key) => stored.includes(key));
}

const ARABIC_LETTER = /^[ء-يٱ-ۓ]$/;

// Unicode RLI (U+2067) and PDI (U+2069), built from code points so no bidi control character appears in the source.
const RTL_ISOLATE_START = String.fromCodePoint(0x2067);
const ISOLATE_END = String.fromCodePoint(0x2069);

/**
 * Canonical display: letters separated by single spaces (Arabic letters only; Latin groups stay together), then the
 * ASCII digits, e.g. "ابج١٢٣٤" -> "ا ب ج 1234". With isolate: true an RTL isolate (RLI ... PDI) wraps the text when it
 * contains Arabic letters so it renders in plate order inside any surrounding direction.
 */
export function formatPlateDisplay(input: string, options: { isolate?: boolean } = {}): string {
  const { letters, digits } = plateParts(input);
  const chars = [...letters];
  const arabic = chars.length > 0 && chars.every((char) => ARABIC_LETTER.test(char));
  const letterText = arabic ? chars.join(" ") : letters;
  const text = [letterText, digits].filter(Boolean).join(" ");
  return options.isolate && arabic && text ? `${RTL_ISOLATE_START}${text}${ISOLATE_END}` : text;
}

/**
 * Lenient plausibility: after normalising there are only Arabic/Latin letters and digits, 1-4 letters,
 * 1-6 digits (at least one digit and one letter), 2-12 characters in total. Odd special plates may fail; callers
 * treat this as validation of typos, not as an official registry check.
 */
export function isPlausiblePlate(input: string): boolean {
  const { letters, digits } = plateParts(input);
  if (!/^[ء-يٱ-ۓA-Z]*$/.test(letters)) return false;
  const total = [...letters].length + digits.length;
  return total >= 2 && total <= 12 && [...letters].length >= 1 && [...letters].length <= 4 && digits.length >= 1 && digits.length <= 6;
}
