/**
 * Pure duplicate-customer scoring (no database). A pair is scored from independent signals combined as a noisy-or:
 *  - phone: the same number written differently (last 10 digits equal; phone_normalized itself is unique);
 *  - plate: the same canonical plate on two different customers;
 *  - name: near-identical names (normalised Arabic/Latin, fuzzy token overlap) for customers sharing a branch.
 */
export interface DuplicateCandidate {
  id: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  createdAt: string;
  branchIds: string[];
  /** key = canonical plate (garage_normalize_plate), plate = as stored. */
  vehicles: { key: string; plate: string }[];
  bookings: number;
}

export type DuplicateReason =
  | { kind: "phone"; detail: string; exact: boolean }
  | { kind: "plate"; detail: string }
  | { kind: "name"; detail: string; similarity: number };

export type ConfidenceBand = "high" | "medium" | "low";

export interface DuplicatePair {
  key: string;
  a: DuplicateCandidate;
  b: DuplicateCandidate;
  score: number;
  band: ConfidenceBand;
  reasons: DuplicateReason[];
  suggestedSurvivorId: string;
}

export const MIN_SCORE = 0.5;
const WEIGHT = { phoneExact: 0.9, phoneSuffix: 0.85, plate: 0.7, nameExact: 0.55 } as const;
const MAX_BUCKET = 60;
const MAX_PAIRS = 200;
const PHONE_SUFFIX = 10;

// Built from code points so no literal control/combining characters live in the source.
const COMBINING = /[̀-ͯ]/g;
const ARABIC_MARKS = /[ً-ٰٟـ]/g;
const ALEF_VARIANTS = /[آأإ]/g;
const AL = "ال";

export function normalizeName(value: string): string {
  return value
    .normalize("NFKD").replace(COMBINING, "")
    .toLowerCase()
    .replace(ALEF_VARIANTS, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(ARABIC_MARKS, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim().replace(/\s+/g, " ");
}

const ARTICLES = new Set(["al", "el", AL]);

export function nameTokens(value: string): string[] {
  const tokens: string[] = [];
  for (const raw of normalizeName(value).split(" ")) {
    if (!raw || ARTICLES.has(raw)) continue;
    tokens.push(raw.length > 3 && raw.startsWith(AL) ? raw.slice(2) : raw);
  }
  return tokens;
}

function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; let j = 0; let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length === b.length) { i++; j++; } else if (a.length > b.length) i++; else j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const tokensMatch = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && withinOneEdit(a, b));

/** Fuzzy Jaccard over name tokens plus the number of matched tokens. */
export function nameSimilarity(left: string, right: string): { similarity: number; matched: number; tokensA: number; tokensB: number } {
  const a = nameTokens(left); const b = nameTokens(right);
  const used = new Set<number>();
  let matched = 0;
  for (const token of a) {
    const index = b.findIndex((other, i) => !used.has(i) && tokensMatch(token, other));
    if (index >= 0) { used.add(index); matched++; }
  }
  const union = a.length + b.length - matched;
  return { similarity: union === 0 ? 0 : matched / union, matched, tokensA: a.length, tokensB: b.length };
}

export const digitsOf = (phone: string): string => phone.replace(/\D/g, "");
/** Blocking key for phones: the last 10 digits (or all digits when shorter). */
export const phoneKey = (phone: string) => { const d = digitsOf(phone); return d.length >= PHONE_SUFFIX ? d.slice(-PHONE_SUFFIX) : d; };

export function phoneRelation(a: string, b: string): "exact" | "suffix" | null {
  const x = digitsOf(a); const y = digitsOf(b);
  if (!x || !y) return null;
  if (x === y) return "exact";
  return x.length >= PHONE_SUFFIX && y.length >= PHONE_SUFFIX && x.slice(-PHONE_SUFFIX) === y.slice(-PHONE_SUFFIX) ? "suffix" : null;
}

export const bandFor = (score: number): ConfidenceBand => (score >= 0.85 ? "high" : score >= 0.6 ? "medium" : "low");

const shareBranch = (a: DuplicateCandidate, b: DuplicateCandidate) => a.branchIds.some((id) => b.branchIds.includes(id));

/** Scores one pair; null when no signal applies. */
export function scorePair(a: DuplicateCandidate, b: DuplicateCandidate): { score: number; reasons: DuplicateReason[] } | null {
  const reasons: DuplicateReason[] = [];
  const weights: number[] = [];

  const relation = phoneRelation(a.phoneNormalized || a.phone, b.phoneNormalized || b.phone);
  if (relation) { reasons.push({ kind: "phone", detail: b.phone, exact: relation === "exact" }); weights.push(relation === "exact" ? WEIGHT.phoneExact : WEIGHT.phoneSuffix); }

  const keysB = new Set(b.vehicles.map((vehicle) => vehicle.key));
  const plates = a.vehicles.filter((vehicle) => vehicle.key && keysB.has(vehicle.key));
  if (plates.length) { reasons.push({ kind: "plate", detail: plates.map((p) => p.plate).join(", ") }); weights.push(WEIGHT.plate); }

  if (shareBranch(a, b)) {
    const { similarity, matched, tokensA, tokensB } = nameSimilarity(a.name, b.name);
    if (matched >= 2 && tokensA >= 2 && tokensB >= 2 && similarity >= 0.67) {
      reasons.push({ kind: "name", detail: `${Math.round(similarity * 100)}%`, similarity });
      weights.push(similarity >= 1 ? WEIGHT.nameExact : 0.2 + 0.4 * similarity);
    }
  }

  if (!weights.length) return null;
  const score = 1 - weights.reduce((product, weight) => product * (1 - weight), 1);
  return { score: Math.round(score * 100) / 100, reasons };
}

/** Which record to keep by default: the one with more history, then the older one. */
export function suggestSurvivor(a: DuplicateCandidate, b: DuplicateCandidate): string {
  const weight = (c: DuplicateCandidate) => c.bookings + c.vehicles.length;
  if (weight(a) !== weight(b)) return weight(a) > weight(b) ? a.id : b.id;
  return a.createdAt <= b.createdAt ? a.id : b.id;
}

export function findDuplicatePairs(customers: DuplicateCandidate[], limit = MAX_PAIRS): DuplicatePair[] {
  const candidatePairs = new Set<string>();
  const buckets = new Map<string, number[]>();
  const add = (key: string, index: number) => { const list = buckets.get(key); if (list) list.push(index); else buckets.set(key, [index]); };
  customers.forEach((customer, index) => {
    const phone = phoneKey(customer.phoneNormalized || customer.phone);
    if (phone) add(`p:${phone}`, index);
    for (const vehicle of new Set(customer.vehicles.map((v) => v.key))) if (vehicle) add(`v:${vehicle}`, index);
    for (const token of new Set(nameTokens(customer.name))) if (token.length >= 3) add(`n:${token}`, index);
  });
  for (const list of buckets.values()) {
    if (list.length < 2 || list.length > MAX_BUCKET) continue;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) candidatePairs.add(`${list[i]}|${list[j]}`);
  }
  const pairs: DuplicatePair[] = [];
  for (const key of candidatePairs) {
    const [i, j] = key.split("|").map(Number);
    const a = customers[i]; const b = customers[j];
    if (a.id === b.id) continue;
    const scored = scorePair(a, b);
    if (!scored || scored.score < MIN_SCORE) continue;
    pairs.push({ key: [a.id, b.id].sort().join(":"), a, b, score: scored.score, band: bandFor(scored.score), reasons: scored.reasons, suggestedSurvivorId: suggestSurvivor(a, b) });
  }
  pairs.sort((x, y) => y.score - x.score || x.key.localeCompare(y.key));
  return pairs.slice(0, limit);
}
