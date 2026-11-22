import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Download } from "lucide-react";
import type { Locale } from "@garage/domain";
import { EmptyState, Skeleton } from "./EmptyState";
import { csvFilename, downloadCsv, hasCsvColumns, tableToCsv, type CsvColumn } from "../csv";
import { registerList } from "../list-state";
import { isTypingTarget, nextRowIndex, normaliseKey } from "../shortcuts";
import { pageSelectionState, pruneSelection, selectAll, selectedRows, toggleKey, togglePage } from "../selection";
import { canExportLists, useViewer } from "../viewer";

/** Columns also describe their CSV cell: `csv` (text or number) or `csvMoney` ({minor,currency}, adds a currency column). Columns with neither are not exported. */
export interface Column<Row> extends CsvColumn<Row> {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
  /** Enables sorting. Uses sortValue when given, otherwise the rendered-free fallback of `row[key]`. */
  sortable?: boolean;
  sortValue?: (row: Row) => string | number | null | undefined;
  /** Right-aligned (logical end) tabular numbers. */
  numeric?: boolean;
  /** LTR-isolated cell (plates, phones, refs). */
  mono?: boolean;
  /** Bold first-line cell; also the card title on mobile. Defaults to the first column. */
  primary?: boolean;
  /** Skip this column in the mobile card layout. */
  hideOnCard?: boolean;
}

export type SortState = { key: string; direction: "asc" | "desc" } | null;

export interface BulkContext<Row> {
  keys: string[];
  rows: Row[];
  count: number;
  clear: () => void;
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  lang: Locale;
  /** Accessible table name (visually hidden caption). */
  caption: string;
  onRowClick?: (row: Row) => void;
  /** Highlights the row whose key matches (e.g. the open drawer record). */
  selectedKey?: string | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Rendered when rows is empty and not loading/error. Pass <EmptyState .../> (no-data or no-results variant). */
  empty?: ReactNode;
  initialSort?: SortState;
  /** Below about 1000px render compact cards instead of a horizontally scrolling table. Default true. */
  cards?: boolean;
  /** Classic paging (default on). Pass false to render every row. */
  paging?: boolean;
  /** Initial rows per page (default 25). */
  pageSize?: number;
  /** Selectable page sizes (default 25, 50, 100). */
  pageSizes?: number[];
  /** Max height of the scrolling area; header stays sticky. */
  maxHeight?: string;
  /**
   * Opt-in row selection (checkbox column, select page / all matching, count bar with `actions`). Pass only to viewers who may
   * write. Rows rejected by `isSelectable` get a disabled checkbox.
   */
  bulk?: { actions: (context: BulkContext<Row>) => ReactNode; isSelectable?: (row: Row) => boolean };
  /** Shows "Export CSV" (file name base) when columns define `csv`/`csvMoney` and the viewer is not a technician. */
  exportName?: string;
  /** Stable id so saved views can read and restore this list's sort and page size. */
  listId?: string;
}

export const DEFAULT_PAGE_SIZES = [25, 50, 100];

/** Pure paging maths (1-based range for display). Exported for tests. */
export function pageWindow(total: number, page: number, size: number): { page: number; pages: number; start: number; end: number } {
  const pages = Math.max(1, Math.ceil(total / size));
  const safe = Math.min(Math.max(0, page), pages - 1);
  const start = total === 0 ? 0 : safe * size + 1;
  return { page: safe, pages, start, end: Math.min(total, (safe + 1) * size) };
}

const text = {
  en: { selectRow: "Select row", selectPage: "Select all rows on this page", selected: (n: number) => `${n} selected`, selectAllMatching: (n: number) => `Select all ${n}`, clearSelection: "Clear selection", bulkBar: "Selected rows", exportCsv: "Export CSV", exportPage: "This page", exportAll: (n: number) => `All ${n} loaded rows`, currency: "Currency", retry: "Retry", loading: "Loading", errorTitle: "Could not load this list", sortBy: "Sort by", asc: "ascending", desc: "descending", showing: (a: number, b: number, n: number) => `Showing ${a}-${b} of ${n}`, perPage: "Rows per page", prev: "Previous page", next: "Next page", pageOf: (p: number, n: number) => `Page ${p} of ${n}` },
  ar: { selectRow: "تحديد الصف", selectPage: "تحديد كل صفوف هذه الصفحة", selected: (n: number) => `${n} محدد`, selectAllMatching: (n: number) => `تحديد كل ${n}`, clearSelection: "إلغاء التحديد", bulkBar: "الصفوف المحددة", exportCsv: "تصدير CSV", exportPage: "هذه الصفحة", exportAll: (n: number) => `كل الصفوف المحملة ${n}`, currency: "العملة", retry: "إعادة المحاولة", loading: "جارٍ التحميل", errorTitle: "تعذر تحميل القائمة", sortBy: "ترتيب حسب", asc: "تصاعدي", desc: "تنازلي", showing: (a: number, b: number, n: number) => `عرض ${a}-${b} من ${n}`, perPage: "صفوف في الصفحة", prev: "الصفحة السابقة", next: "الصفحة التالية", pageOf: (p: number, n: number) => `صفحة ${p} من ${n}` },
};

/** Pure sorter (stable, locale-aware, nulls last). Exported for tests and for pages that sort server-side. */
export function sortRows<Row>(rows: Row[], column: Column<Row> | undefined, direction: "asc" | "desc", lang: Locale): Row[] {
  if (!column?.sortable) return rows;
  const collator = new Intl.Collator(lang === "ar" ? "ar-EG" : "en", { numeric: true, sensitivity: "base" });
  const read = (row: Row) => column.sortValue ? column.sortValue(row) : (row as Record<string, unknown>)[column.key] as string | number | null | undefined;
  const sign = direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: read(row) }))
    .sort((a, b) => {
      const aNil = a.value === null || a.value === undefined || a.value === "";
      const bNil = b.value === null || b.value === undefined || b.value === "";
      if (aNil || bNil) return aNil === bNil ? a.index - b.index : aNil ? 1 : -1;
      const result = typeof a.value === "number" && typeof b.value === "number" ? a.value - b.value : collator.compare(String(a.value), String(b.value));
      return result === 0 ? a.index - b.index : result * sign;
    })
    .map((entry) => entry.row);
}

export function nextSort(current: SortState, key: string): SortState {
  if (!current || current.key !== key) return { key, direction: "asc" };
  return current.direction === "asc" ? { key, direction: "desc" } : null;
}

export function DataTable<Row>({
  columns, rows, rowKey, lang, caption, onRowClick, selectedKey, loading, error, onRetry, empty, initialSort = null, cards = true, maxHeight, paging = true, pageSize = 25, pageSizes = DEFAULT_PAGE_SIZES,
  bulk, exportName, listId,
}: DataTableProps<Row>) {
  const copy = text[lang];
  const viewer = useViewer();
  const [sort, setSort] = useState<SortState>(initialSort);
  const sorted = useMemo(
    () => sort ? sortRows(rows, columns.find((column) => column.key === sort.key), sort.direction, lang) : rows,
    [rows, columns, sort, lang],
  );
  const [size, setSize] = useState(pageSize);
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => { setPageIndex(0); }, [rows.length, sort, size]);
  const window_ = pageWindow(sorted.length, pageIndex, size);
  const visible = paging ? sorted.slice(window_.start - 1 < 0 ? 0 : window_.start - 1, window_.end) : sorted;
  const showPager = paging && sorted.length > Math.min(...pageSizes, size);
  const primaryKey = (columns.find((column) => column.primary) ?? columns[0])?.key;

  // Saved views read and restore sort and page size through this handle.
  const live = useRef({ sort, size });
  live.current = { sort, size };
  useEffect(() => {
    if (!listId) return;
    return registerList(listId, {
      get: () => ({ sort: live.current.sort, pageSize: live.current.size }),
      set: (next) => {
        if ("sort" in next) setSort(next.sort ?? initialSort);
        if (next.pageSize) setSize(next.pageSize);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  // Selection (opt-in). Keys outside the current rows are dropped so a filter change never leaves hidden selections.
  const isSelectable = bulk?.isSelectable;
  const hasBulk = bulk !== undefined;
  const selectableKeys = useMemo(
    () => hasBulk ? sorted.filter((row) => !isSelectable || isSelectable(row)).map(rowKey) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasBulk, sorted, isSelectable],
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => { setSelected((current) => (current.size === 0 ? current : pruneSelection(current, selectableKeys))); }, [selectableKeys]);
  const pageKeys = useMemo(
    () => hasBulk ? visible.filter((row) => !isSelectable || isSelectable(row)).map(rowKey) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasBulk, visible, isSelectable],
  );
  const pageState = pageSelectionState(selected, pageKeys);
  const headerBox = useCallback((node: HTMLInputElement | null) => { if (node) node.indeterminate = pageState === "some"; }, [pageState]);

  // Export (opt-in, never for technicians).
  const canExport = Boolean(exportName) && hasCsvColumns(columns) && canExportLists(viewer);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportOpen) return;
    const onPointer = (event: MouseEvent) => { if (exportRoot.current && !exportRoot.current.contains(event.target as Node)) setExportOpen(false); };
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setExportOpen(false); } };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey, true); };
  }, [exportOpen]);
  const exportRows = (scope: "page" | "all") => {
    downloadCsv(csvFilename(exportName ?? "export"), tableToCsv(columns, scope === "page" ? visible : sorted, copy.currency));
    setExportOpen(false);
  };

  // J / K move focus between rows, X toggles the focused row's checkbox. Only the table that holds focus (or the first one) reacts.
  const wrap = useRef<HTMLDivElement>(null);
  const keyboardRows = Boolean(onRowClick) || hasBulk;
  useEffect(() => {
    if (!keyboardRows) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const name = normaliseKey(event);
      if (name !== "j" && name !== "k" && name !== "x") return;
      if (isTypingTarget(event.target as HTMLElement | null) || document.querySelector("[aria-modal='true']")) return;
      const root = wrap.current;
      if (!root) return;
      const active = document.activeElement as HTMLElement | null;
      const owner = active?.closest?.(".data-table-wrap[data-keynav='true']");
      if (owner ? owner !== root : document.querySelector(".data-table-wrap[data-keynav='true']") !== root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>("[data-row-key]")).filter((node) => node.offsetParent !== null);
      const current = active?.closest?.("[data-row-key]") as HTMLElement | null;
      if (name === "x") {
        const key = current?.dataset.rowKey;
        if (!hasBulk || !key || !selectableKeys.includes(key)) return;
        event.preventDefault();
        setSelected((now) => toggleKey(now, key));
        return;
      }
      if (items.length === 0) return;
      const index = nextRowIndex(items.length, current ? items.indexOf(current) : -1, name === "j" ? 1 : -1);
      if (index < 0) return;
      event.preventDefault();
      items[index].focus();
      items[index].scrollIntoView?.({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboardRows, hasBulk, selectableKeys]);

  if (error) {
    return <EmptyState variant="error" title={copy.errorTitle} text={error} action={onRetry && <button type="button" className="btn" onClick={onRetry}>{copy.retry}</button>} />;
  }
  if (loading) return <Skeleton rows={5} label={copy.loading} />;
  if (rows.length === 0) return <>{empty ?? null}</>;

  const activate = (row: Row) => onRowClick?.(row);
  const onKey = (event: KeyboardEvent, row: Row) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(row); }
  };
  const checkbox = (row: Row, key: string) => {
    const allowed = !isSelectable || isSelectable(row);
    return <input type="checkbox" className="row-check" checked={selected.has(key)} disabled={!allowed} aria-label={copy.selectRow}
      onChange={() => setSelected((now) => toggleKey(now, key))} onClick={(event) => event.stopPropagation()} />;
  };
  const clearSelection = () => setSelected(new Set());
  const selectedList = bulk ? selectedRows(sorted, rowKey, selected) : [];
  const rowAttrs = (key: string) => ({ "data-row-key": key, tabIndex: keyboardRows ? 0 : undefined });

  return <div className="data-table-wrap" data-cards={cards ? "true" : "false"} data-keynav={keyboardRows ? "true" : undefined} ref={wrap}>
    {canExport && <div className="data-table-tools">
      <div className="data-table-export" ref={exportRoot}>
        {paging && sorted.length > visible.length
          ? <>
              <button type="button" className="btn btn-sm" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen((value) => !value)}>
                <Download size={14} aria-hidden="true" />{copy.exportCsv}
              </button>
              {exportOpen && <div className="data-table-export-menu" role="menu">
                <button type="button" role="menuitem" className="btn btn-quiet btn-sm" onClick={() => exportRows("page")}>{copy.exportPage}</button>
                <button type="button" role="menuitem" className="btn btn-quiet btn-sm" onClick={() => exportRows("all")}>{copy.exportAll(sorted.length)}</button>
              </div>}
            </>
          : <button type="button" className="btn btn-sm" onClick={() => exportRows("all")}><Download size={14} aria-hidden="true" />{copy.exportCsv}</button>}
      </div>
    </div>}
    {bulk && selected.size > 0 && <div className="bulk-bar" role="region" aria-label={copy.bulkBar}>
      <span className="bulk-count" role="status" aria-live="polite">{copy.selected(selected.size)}</span>
      {selected.size < selectableKeys.length && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSelected(selectAll(selectableKeys))}>{copy.selectAllMatching(selectableKeys.length)}</button>}
      <button type="button" className="btn btn-quiet btn-sm" onClick={clearSelection}>{copy.clearSelection}</button>
      <div className="bulk-actions">{bulk.actions({ keys: selectedList.map(rowKey), rows: selectedList, count: selectedList.length, clear: clearSelection })}</div>
    </div>}
    <div className="table-wrap" style={maxHeight ? ({ "--data-table-max": maxHeight } as React.CSSProperties) : undefined}>
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>
          {hasBulk && <th scope="col" className="select-col">
            <input type="checkbox" className="row-check" ref={headerBox} checked={pageState === "all"} disabled={pageKeys.length === 0} aria-label={copy.selectPage}
              onChange={() => setSelected((now) => togglePage(now, pageKeys))} />
          </th>}
          {columns.map((column) => {
            const active = sort?.key === column.key ? sort.direction : null;
            const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ChevronsUpDown;
            return <th
              key={column.key}
              scope="col"
              className={column.numeric ? "num" : undefined}
              aria-sort={column.sortable ? (active === "asc" ? "ascending" : active === "desc" ? "descending" : "none") : undefined}
            >
              {column.sortable
                ? <button type="button" className="sort-button" data-active={active ? "true" : "false"} onClick={() => setSort(nextSort(sort, column.key))}>
                    <span>{column.header}</span><Icon size={14} className="sort-arrow" aria-hidden="true" />
                    <span className="sr-only">{copy.sortBy} {column.header}</span>
                  </button>
                : column.header}
            </th>;
          })}
        </tr></thead>
        <tbody>
          {visible.map((row) => {
            const key = rowKey(row);
            return <tr
              key={key}
              {...rowAttrs(key)}
              className={onRowClick ? "clickable" : undefined}
              data-selected={selectedKey === key ? "true" : undefined}
              data-checked={selected.has(key) ? "true" : undefined}
              aria-selected={onRowClick && selectedKey === key ? true : undefined}
              onClick={onRowClick ? (event) => { if (!(event.target as HTMLElement).closest("button, a, input, select, textarea")) activate(row); } : undefined}
              onKeyDown={onRowClick ? (event) => onKey(event, row) : undefined}
            >
              {hasBulk && <td className="select-col">{checkbox(row, key)}</td>}
              {columns.map((column) => <td key={column.key} className={column.numeric ? "num" : undefined}>
                {column.mono ? <bdi className="mono">{column.render(row)}</bdi> : column.key === primaryKey ? <span className="primary-cell">{column.render(row)}</span> : column.render(row)}
              </td>)}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    {cards && <div className="data-cards" role="list" aria-label={caption}>
      {visible.map((row) => {
        const key = rowKey(row);
        const meta = columns.filter((column) => column.key !== primaryKey && !column.hideOnCard);
        const body = <>
          {columns.filter((column) => column.key === primaryKey).map((column) => hasBulk
            ? <div className="data-card-top" key={column.key}>{checkbox(row, key)}<div className="data-card-title">{column.render(row)}</div></div>
            : <div className="data-card-title" key={column.key}>{column.render(row)}</div>)}
          {meta.length > 0 && <div className="data-card-meta">
            {meta.map((column) => <span key={column.key} className={column.mono ? "mono" : undefined}>
              <span className="data-card-label">{column.header}</span><span className="data-card-value">{column.render(row)}</span>
            </span>)}
          </div>}
        </>;
        // A card may contain interactive children (RecordRef chips are buttons), so the card itself must not be a
        // <button>: nested buttons are invalid HTML and break keyboard and screen-reader use. Mirror the table row instead.
        return onRowClick
          ? <div
              role="listitem"
              className="data-card clickable"
              key={key}
              data-row-key={key}
              data-selected={selectedKey === key ? "true" : undefined}
              data-checked={selected.has(key) ? "true" : undefined}
              tabIndex={0}
              onClick={(event) => { if (!(event.target as HTMLElement).closest("button, a, input, select, textarea")) activate(row); }}
              onKeyDown={(event) => onKey(event, row)}
            >{body}</div>
          : <div role="listitem" className="data-card" key={key} {...rowAttrs(key)} data-checked={selected.has(key) ? "true" : undefined}>{body}</div>;
      })}
    </div>}
    {showPager && <nav className="table-pager" aria-label={copy.perPage}>
      <span className="table-pager-range" role="status" aria-live="polite">{copy.showing(window_.start, window_.end, sorted.length)}</span>
      <div className="table-pager-controls">
        <label className="table-pager-size">
          <span>{copy.perPage}</span>
          <select className="select" value={size} onChange={(event) => setSize(Number(event.target.value))}>
            {[...new Set([...pageSizes, size])].sort((a, b) => a - b).map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-sm" aria-label={copy.prev} disabled={window_.page === 0} onClick={() => setPageIndex(window_.page - 1)}><ChevronLeft size={16} className="pager-icon" aria-hidden="true" /></button>
        <span className="table-pager-page">{copy.pageOf(window_.page + 1, window_.pages)}</span>
        <button type="button" className="btn btn-sm" aria-label={copy.next} disabled={window_.page >= window_.pages - 1} onClick={() => setPageIndex(window_.page + 1)}><ChevronRight size={16} className="pager-icon" aria-hidden="true" /></button>
      </div>
    </nav>}
  </div>;
}
