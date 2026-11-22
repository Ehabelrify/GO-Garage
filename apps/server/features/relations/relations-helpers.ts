import { normalizePlate as normalizePlateKey, plateSearchKeys, phoneDigits } from "@garage/domain";
import { hashWarrantyVerificationToken, isWarrantyVerificationTokenFormat } from "../warranty/warranty-verification";

export const searchTypes = ["customer", "vehicle", "booking", "quote", "warranty"] as const;
export type SearchType = (typeof searchTypes)[number];

/** Escapes LIKE/ILIKE metacharacters so user text is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Canonical plate key (Arabic/Latin letters, Arabic-Indic digits, spaces/dashes/tatweel); SQL twin: garage_normalize_plate (migration 0032). */
export function normalizePlate(value: string): string {
  return normalizePlateKey(value);
}

/** LIKE patterns for plate search: forward and reversed-letter keys, contains-match, wildcards escaped. */
export function plateLikePatterns(value: string): string[] {
  return plateSearchKeys(value).map((key) => `%${escapeLike(key)}%`);
}

export function digitsOnly(value: string): string {
  return phoneDigits(value);
}

export function parseSearchTypes(raw: unknown): SearchType[] {
  if (typeof raw !== "string" || !raw.trim()) return [...searchTypes];
  const wanted = raw.split(",").map((part) => part.trim()).filter(Boolean);
  const valid = searchTypes.filter((type) => wanted.includes(type));
  return valid.length ? valid : [...searchTypes];
}

/** Accepts a bare warranty code, a bare QR token, or a pasted verification URL. */
export function parseWarrantyCode(raw: string): { code: string; tokenHash: string | null } {
  let code = raw.trim();
  const marker = "/warranty/verify/";
  const at = code.indexOf(marker);
  if (at >= 0) code = code.slice(at + marker.length).split(/[?#/]/)[0];
  try { code = decodeURIComponent(code); } catch { /* keep raw */ }
  code = code.trim();
  return { code, tokenHash: isWarrantyVerificationTokenFormat(code) ? hashWarrantyVerificationToken(code) : null };
}

export type RelationSection<T> = { count: number; items: T[]; restricted?: true };
export const restrictedSection = <T>(): RelationSection<T> => ({ count: 0, items: [], restricted: true });
