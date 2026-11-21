import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { Locale } from "@garage/domain";
import { EmptyState, Skeleton } from "./EmptyState";

export interface Column<Row> {
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
  /** Below 760px render stacked cards instead of a horizontally scrolling table. Default true. */
  cards?: boolean;
  /** Max height of the scrolling area; header stays sticky. */
  maxHeight?: string;
}

const text = {
  en: { retry: "Retry", loading: "Loading", errorTitle: "Could not load this list", sortBy: "Sort by", asc: "ascending", desc: "descending" },
  ar: { retry: "إعادة المحاولة", loading: "جارٍ التحميل", errorTitle: "تعذر تحميل القائمة", sortBy: "ترتيب حسب", asc: "تصاعدي", desc: "تنازلي" },
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
  columns, rows, rowKey, lang, caption, onRowClick, selectedKey, loading, error, onRetry, empty, initialSort = null, cards = true, maxHeight,
}: DataTableProps<Row>) {
  const copy = text[lang];
  const [sort, setSort] = useState<SortState>(initialSort);
  const sorted = useMemo(
    () => sort ? sortRows(rows, columns.find((column) => column.key === sort.key), sort.direction, lang) : rows,
    [rows, columns, sort, lang],
  );
  const primaryKey = (columns.find((column) => column.primary) ?? columns[0])?.key;

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

  return <div className="data-table-wrap" data-cards={cards ? "true" : "false"}>
    <div className="table-wrap" style={maxHeight ? ({ "--data-table-max": maxHeight } as React.CSSProperties) : undefined}>
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>
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
          {sorted.map((row) => {
            const key = rowKey(row);
            return <tr
              key={key}
              className={onRowClick ? "clickable" : undefined}
              data-selected={selectedKey === key ? "true" : undefined}
              aria-selected={onRowClick && selectedKey === key ? true : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? (event) => { if (!(event.target as HTMLElement).closest("button, a, input, select, textarea")) activate(row); } : undefined}
              onKeyDown={onRowClick ? (event) => onKey(event, row) : undefined}
            >
              {columns.map((column) => <td key={column.key} className={column.numeric ? "num" : undefined}>
                {column.mono ? <bdi className="mono">{column.render(row)}</bdi> : column.key === primaryKey ? <span className="primary-cell">{column.render(row)}</span> : column.render(row)}
              </td>)}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    {cards && <div className="data-cards" role="list" aria-label={caption}>
      {sorted.map((row) => {
        const key = rowKey(row);
        const body = <>
          {columns.filter((column) => column.key === primaryKey).map((column) => <div className="data-card-title" key={column.key}>{column.render(row)}</div>)}
          {columns.filter((column) => column.key !== primaryKey && !column.hideOnCard).map((column) => <div className="data-card-row" key={column.key}>
            <span className="data-card-label">{column.header}</span>
            <span className={`data-card-value${column.mono ? " mono" : ""}`}>{column.render(row)}</span>
          </div>)}
        </>;
        // A card may contain interactive children (RecordRef chips are buttons), so the card itself must not be a
        // <button>: nested buttons are invalid HTML and break keyboard and screen-reader use. Mirror the table row instead.
        return onRowClick
          ? <div
              role="listitem"
              className="data-card clickable"
              key={key}
              data-selected={selectedKey === key ? "true" : undefined}
              tabIndex={0}
              onClick={(event) => { if (!(event.target as HTMLElement).closest("button, a, input, select, textarea")) activate(row); }}
              onKeyDown={(event) => onKey(event, row)}
            >{body}</div>
          : <div role="listitem" className="data-card" key={key}>{body}</div>;
      })}
    </div>}
  </div>;
}
