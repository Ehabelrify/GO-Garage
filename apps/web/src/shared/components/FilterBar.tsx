import type { ReactNode } from "react";
import { Search } from "lucide-react";
import type { CSSProperties } from "react";
import type { Locale } from "@garage/domain";
import { SavedViewsMenu } from "./SavedViews";

export interface FilterOption { value: string; label: string }
export interface FilterDef {
  key: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  /** Value meaning "no filter". Default "all". */
  allValue?: string;
}

export interface FilterBarProps {
  lang: Locale;
  search?: { value: string; onChange: (value: string) => void; placeholder: string; label?: string };
  /** Up to three inline filters. */
  filters?: FilterDef[];
  /** Called by "Clear filters" (shown only when something is active). Should reset search and filters. */
  onClear?: () => void;
  /** Number of visible results; announced politely. */
  resultCount?: number;
  /** Extra controls (date input, toggles). */
  children?: ReactNode;
  /** Stable list id: adds the per-user "Views" menu (save, rename, delete, default, reset) for this list. */
  viewsId?: string;
}

export function activeFilterCount(search: FilterBarProps["search"], filters: FilterDef[] = []): number {
  return (search && search.value.trim() ? 1 : 0) + filters.filter((filter) => filter.value !== (filter.allValue ?? "all")).length;
}

const text = {
  en: { clear: "Clear filters", results: (n: number) => `${n} ${n === 1 ? "result" : "results"}` },
  ar: { clear: "مسح التصفية", results: (n: number) => `${n} نتيجة` },
};

export function FilterBar({ lang, search, filters = [], onClear, resultCount, children, viewsId }: FilterBarProps) {
  const copy = text[lang];
  const active = activeFilterCount(search, filters);
  const shown = filters.slice(0, 3);
  return <div className="filter-bar" role="search" style={{ "--filter-count": shown.length } as CSSProperties}>
    {search && <label className="search-wrap">
      <span className="sr-only">{search.label ?? search.placeholder}</span>
      <Search size={15} aria-hidden="true" />
      <input className="search-input" type="search" value={search.value} placeholder={search.placeholder} onChange={(event) => search.onChange(event.target.value)} />
    </label>}
    {shown.map((filter) => <label key={filter.key}>
      <span className="sr-only">{filter.label}</span>
      <select className="select filter-select" value={filter.value} onChange={(event) => filter.onChange(event.target.value)}>
        {filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>)}
    {children && <div className="filter-bar-extra">{children}</div>}
    {viewsId && <SavedViewsMenu lang={lang} listId={viewsId} binding={{
      search: search ? { value: search.value, onChange: search.onChange } : undefined,
      filters: shown.map((filter) => ({ key: filter.key, value: filter.value, options: filter.options, onChange: filter.onChange, allValue: filter.allValue })),
      onReset: onClear,
    }} />}
    {((active > 0 && onClear) || resultCount !== undefined) && <div className="filter-bar-end">
      {active > 0 && onClear && <button type="button" className="btn btn-quiet btn-sm" onClick={onClear}>{copy.clear}</button>}
      {resultCount !== undefined && <span className="filter-bar-count" role="status" aria-live="polite">{copy.results(resultCount)}</span>}
    </div>}
  </div>;
}
