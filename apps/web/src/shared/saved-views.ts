/** Per-user, per-list saved views (filters + search + sort + page size) kept in this browser only. Pure helpers plus guarded storage. */
export interface ViewSort { key: string; direction: "asc" | "desc" }
export interface ViewSnapshot { search: string; filters: Record<string, string>; sort: ViewSort | null; pageSize: number | null }
export interface SavedView extends ViewSnapshot { id: string; name: string; isDefault?: boolean }

export const MAX_VIEWS = 20;
export const MAX_NAME = 40;
const PREFIX = "garage.views.v1";

export const viewsStorageKey = (userId: string, listId: string) => `${PREFIX}:${userId}:${listId}`;

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function browserStorage(): StorageLike | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Tolerant parser: anything malformed is dropped, never thrown. */
export function parseViews(raw: string | null | undefined): SavedView[] {
  if (!raw) return [];
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  const list = isRecord(data) && Array.isArray(data.views) ? data.views : [];
  const seen = new Set<string>();
  const views: SavedView[] = [];
  for (const item of list) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string" || !item.name.trim() || seen.has(item.id)) continue;
    const filters: Record<string, string> = {};
    if (isRecord(item.filters)) for (const [key, value] of Object.entries(item.filters)) if (typeof value === "string") filters[key] = value;
    const rawSort = item.sort;
    const sort: ViewSort | null = isRecord(rawSort) && typeof rawSort.key === "string" && (rawSort.direction === "asc" || rawSort.direction === "desc")
      ? { key: rawSort.key, direction: rawSort.direction } : null;
    seen.add(item.id);
    views.push({
      id: item.id, name: item.name.trim().slice(0, MAX_NAME), search: typeof item.search === "string" ? item.search : "", filters, sort,
      pageSize: typeof item.pageSize === "number" && item.pageSize > 0 ? item.pageSize : null, isDefault: item.isDefault === true ? true : undefined,
    });
  }
  const firstDefault = views.findIndex((view) => view.isDefault);
  return views.map((view, index) => (view.isDefault && index !== firstDefault ? { ...view, isDefault: undefined } : view)).slice(0, MAX_VIEWS);
}

export function loadViews(storage: StorageLike | null, userId: string, listId: string): SavedView[] {
  if (!storage || !userId) return [];
  try { return parseViews(storage.getItem(viewsStorageKey(userId, listId))); } catch { return []; }
}

export function persistViews(storage: StorageLike | null, userId: string, listId: string, views: SavedView[]): boolean {
  if (!storage || !userId) return false;
  try { storage.setItem(viewsStorageKey(userId, listId), JSON.stringify({ views })); return true; } catch { return false; }
}

export type ViewError = "EMPTY_NAME" | "DUPLICATE_NAME" | "TOO_MANY";
export type ViewResult = { views: SavedView[]; error?: undefined } | { views: SavedView[]; error: ViewError };

const cleanName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
const sameName = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
let counter = 0;
export const newViewId = () => `v${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Saving under an existing name replaces that view (keeps its id and default flag). */
export function saveView(views: SavedView[], name: string, snapshot: ViewSnapshot, makeId: () => string = newViewId): ViewResult {
  const clean = cleanName(name);
  if (!clean) return { views, error: "EMPTY_NAME" };
  const existing = views.find((view) => sameName(view.name, clean));
  if (existing) return { views: views.map((view) => (view.id === existing.id ? { ...view, ...snapshot, name: clean } : view)) };
  if (views.length >= MAX_VIEWS) return { views, error: "TOO_MANY" };
  return { views: [...views, { id: makeId(), name: clean, ...snapshot }] };
}

export function renameView(views: SavedView[], id: string, name: string): ViewResult {
  const clean = cleanName(name);
  if (!clean) return { views, error: "EMPTY_NAME" };
  if (views.some((view) => view.id !== id && sameName(view.name, clean))) return { views, error: "DUPLICATE_NAME" };
  return { views: views.map((view) => (view.id === id ? { ...view, name: clean } : view)) };
}

export const deleteView = (views: SavedView[], id: string): SavedView[] => views.filter((view) => view.id !== id);

/** Marking the current default again clears it. */
export function setDefaultView(views: SavedView[], id: string | null): SavedView[] {
  const current = views.find((view) => view.isDefault)?.id;
  const target = id === current ? null : id;
  return views.map((view) => ({ ...view, isDefault: view.id === target ? true : undefined }));
}

export const defaultView = (views: SavedView[]): SavedView | undefined => views.find((view) => view.isDefault);

/** Only filters the current page can express: unknown keys or values are skipped so an old view never breaks a list. */
export function applicableFilters(saved: Record<string, string>, available: Record<string, readonly string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(saved)) if (available[key]?.includes(value)) out[key] = value;
  return out;
}

/** The default view applies on first load only when the URL carries no list state of its own (tab and record do not count). */
export function urlHasListState(search: string, ignore: readonly string[] = ["tab", "record"]): boolean {
  const params = new URLSearchParams(search);
  for (const key of params.keys()) if (!ignore.includes(key)) return true;
  return false;
}
