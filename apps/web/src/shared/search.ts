import { toAsciiDigits } from "@garage/domain";
import { isRecordType, recordTypes, type RecordType } from "./record-types";

/** GET /api/search?q=&types= -> { results: SearchResult[] } (implemented by W2-S). */
export interface SearchResult {
  type: RecordType;
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  /** App-relative route (must start with "/"). */
  route: string;
}

export type SearchFetcher = (query: string, options?: { signal?: AbortSignal; types?: RecordType[] }) => Promise<SearchResult[]>;

/** A record linked from a 360 view, normalised for RecordRef. */
export interface LinkedRecord { type: RecordType; id: string; title: string; subtitle?: string; badge?: string }
export interface LinkedSection { key: string; type: RecordType | null; items: LinkedRecord[] }
export interface Record360 { title?: string; subtitle?: string; sections: LinkedSection[] }
export interface ResolvedWarranty { warranty: LinkedRecord | null; vehicle: LinkedRecord | null; customer: LinkedRecord | null }

const asText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : undefined;

export function normaliseSearchResults(json: unknown): SearchResult[] {
  const list = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(list)) return [];
  const out: SearchResult[] = [];
  for (const raw of list) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const id = asText(item.id);
    const title = asText(item.title);
    const route = asText(item.route);
    if (!isRecordType(item.type) || !id || !title || !route || !route.startsWith("/") || route.startsWith("//")) continue;
    out.push({ type: item.type, id, title, route, subtitle: asText(item.subtitle), badge: asText(item.badge) });
  }
  return out;
}

/** Groups results by record type in canonical order, preserving server order inside a group. */
export function groupSearchResults(results: SearchResult[]): Array<{ type: RecordType; items: SearchResult[] }> {
  return recordTypes
    .map((type) => ({ type, items: results.filter((result) => result.type === type) }))
    .filter((group) => group.items.length > 0);
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown | null> {
  const response = await fetch(url, { credentials: "same-origin", signal, headers: { Accept: "application/json" } });
  if (response.status === 404 || response.status === 204) return null;
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json().catch(() => null);
}

/** Tatweel, zero-width and bidi control code points are dropped from search text (kept as numeric ranges, not literals). */
function isInvisibleSearchChar(code: number): boolean {
  return code === 0x640 || code === 0xfeff || (code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
}

/**
 * Normalises typed search text before it is sent: Arabic-Indic/Eastern digits become ASCII (phones, plates, ids),
 * tatweel and zero-width/bidi marks are dropped and whitespace is collapsed. Plate letter variants and order are
 * handled by the server (normalizePlate), so the text is otherwise left as typed.
 */
export function prepareSearchQuery(raw: string): string {
  return [...toAsciiDigits(raw)].filter((ch) => !isInvisibleSearchChar(ch.charCodeAt(0))).join("").replace(/\s+/g, " ").trim();
}

/** Default fetcher. 404/empty body -> []; other failures throw so the UI can show an error. */
export const fetchSearch: SearchFetcher = async (query, options) => {
  const params = new URLSearchParams({ q: prepareSearchQuery(query) });
  if (options?.types?.length) params.set("types", options.types.join(","));
  return normaliseSearchResults(await getJson(`/api/search?${params.toString()}`, options?.signal));
};

const sectionTypes: Record<string, RecordType> = {
  customers: "customer", customer: "customer", vehicles: "vehicle", vehicle: "vehicle",
  bookings: "booking", appointments: "booking", booking: "booking",
  jobs: "job", repairs: "job", job: "job", quotes: "quote", quote: "quote",
  reservations: "reservation", reservation: "reservation",
  warranties: "warranty", warranty: "warranty", claims: "claim", claim: "claim",
  invoices: "invoice", invoice: "invoice",
  conversations: "conversation", chats: "conversation", conversation: "conversation", messages: "conversation",
};

function linked(type: RecordType, raw: unknown): LinkedRecord | null {
  const item = raw as Record<string, unknown> | null;
  const id = asText(item?.id);
  if (!item || !id) return null;
  const title = asText(item.title) ?? asText(item.name) ?? asText(item.label) ?? asText(item.plate) ?? asText(item.reference) ?? asText(item.ref) ?? asText(item.number);
  return { type, id, title: title ?? "", subtitle: asText(item.subtitle) ?? asText(item.summary), badge: asText(item.badge) ?? asText(item.status) };
}

/**
 * Tolerant reader for GET /api/customers/:id/360 and /api/vehicles/:id/360.
 * Accepts { title, subtitle, sections:[{type|key, items}] } or top-level arrays keyed by
 * record kind ({ bookings:[...], quotes:[...] }). Items without an id are dropped.
 */
export function normalise360(json: unknown): Record360 | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const sections: LinkedSection[] = [];
  const push = (key: string, type: RecordType | null, items: unknown) => {
    if (!type || !Array.isArray(items)) return;
    sections.push({ key, type, items: items.map((item) => linked(type, item)).filter((item): item is LinkedRecord => item !== null) });
  };
  if (Array.isArray(root.sections)) {
    for (const raw of root.sections as Array<Record<string, unknown>>) {
      const key = asText(raw.key) ?? asText(raw.type) ?? "";
      push(key, isRecordType(raw.type) ? raw.type : sectionTypes[key.toLowerCase()] ?? null, raw.items);
    }
  } else {
    for (const [key, value] of Object.entries(root)) push(key, sectionTypes[key.toLowerCase()] ?? null, value);
  }
  const owner = (root.customer ?? root.vehicle) as Record<string, unknown> | undefined;
  return { title: asText(root.title) ?? asText(owner?.name) ?? asText(owner?.plate), subtitle: asText(root.subtitle), sections };
}

export async function fetchRecord360(kind: "customer" | "vehicle", id: string, signal?: AbortSignal): Promise<Record360 | null> {
  const path = kind === "customer" ? "customers" : "vehicles";
  return normalise360(await getJson(`/api/${path}/${encodeURIComponent(id)}/360`, signal));
}

/** GET /api/warranties/resolve?code= (QR/serial scan). null when the code is unknown. */
export async function resolveWarrantyCode(code: string, signal?: AbortSignal): Promise<ResolvedWarranty | null> {
  const json = (await getJson(`/api/warranties/resolve?code=${encodeURIComponent(code)}`, signal)) as Record<string, unknown> | null;
  if (!json || typeof json !== "object") return null;
  const warranty = linked("warranty", json.warranty ?? (json.type === "warranty" ? json : null));
  const vehicle = linked("vehicle", json.vehicle);
  const customer = linked("customer", json.customer);
  return warranty || vehicle || customer ? { warranty, vehicle, customer } : null;
}
