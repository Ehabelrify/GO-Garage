import type { ViewSort } from "./saved-views";

/** Lets a saved view read and restore a DataTable's sort and page size without the page owning that state. */
export interface ListState { sort: ViewSort | null; pageSize: number | null }
interface Handle { get: () => ListState; set: (state: Partial<ListState>) => void }

const handles = new Map<string, Handle>();
const pending = new Map<string, Partial<ListState>>();

export function registerList(id: string, handle: Handle): () => void {
  handles.set(id, handle);
  const waiting = pending.get(id);
  if (waiting) { pending.delete(id); handle.set(waiting); }
  return () => { if (handles.get(id) === handle) handles.delete(id); };
}

export const readListState = (id: string): ListState => handles.get(id)?.get() ?? { sort: null, pageSize: null };

/** Applied at once when the table is mounted, otherwise as soon as it registers. */
export function applyListState(id: string, state: Partial<ListState>): void {
  const handle = handles.get(id);
  if (handle) handle.set(state); else pending.set(id, state);
}
