/** Pure row-selection logic for DataTable bulk actions. Keys are row keys; sets are never mutated. */
export type PageSelectionState = "none" | "some" | "all";

export function toggleKey(selected: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

export function pageSelectionState(selected: ReadonlySet<string>, pageKeys: readonly string[]): PageSelectionState {
  if (pageKeys.length === 0) return "none";
  const count = pageKeys.filter((key) => selected.has(key)).length;
  return count === 0 ? "none" : count === pageKeys.length ? "all" : "some";
}

/** Header checkbox: when every row of the page is selected it clears the page, otherwise it selects the page. */
export function togglePage(selected: ReadonlySet<string>, pageKeys: readonly string[]): Set<string> {
  const next = new Set(selected);
  if (pageSelectionState(selected, pageKeys) === "all") pageKeys.forEach((key) => next.delete(key));
  else pageKeys.forEach((key) => next.add(key));
  return next;
}

export function selectAll(keys: readonly string[]): Set<string> {
  return new Set(keys);
}

/** Drops keys that are no longer selectable (filtered out, reloaded). Returns the same set when nothing changed. */
export function pruneSelection(selected: ReadonlySet<string>, valid: Iterable<string>): ReadonlySet<string> {
  const allowed = new Set(valid);
  let changed = false;
  const next = new Set<string>();
  selected.forEach((key) => { if (allowed.has(key)) next.add(key); else changed = true; });
  return changed ? next : selected;
}

/** Rows in display order that are currently selected. */
export function selectedRows<Row>(rows: readonly Row[], rowKey: (row: Row) => string, selected: ReadonlySet<string>): Row[] {
  return rows.filter((row) => selected.has(rowKey(row)));
}

/** Per-item outcome of a bulk run. */
export interface BulkOutcome { key: string; ok: boolean; error?: string }

export function summariseOutcomes(outcomes: readonly BulkOutcome[]): { total: number; done: number; failed: number; failedKeys: string[] } {
  const failed = outcomes.filter((item) => !item.ok);
  return { total: outcomes.length, done: outcomes.length - failed.length, failed: failed.length, failedKeys: failed.map((item) => item.key) };
}

/** Runs one request per item in order (existing single-item endpoints). Never throws: a failure is recorded and the run continues. */
export async function runBulk<Row>(
  rows: readonly Row[], key: (row: Row) => string, work: (row: Row) => Promise<{ ok: boolean; error?: string }>,
): Promise<BulkOutcome[]> {
  const outcomes: BulkOutcome[] = [];
  for (const row of rows) {
    try {
      const result = await work(row);
      outcomes.push({ key: key(row), ok: result.ok, error: result.ok ? undefined : result.error });
    } catch (failure) {
      outcomes.push({ key: key(row), ok: false, error: failure instanceof Error ? failure.message : "REQUEST_FAILED" });
    }
  }
  return outcomes;
}
