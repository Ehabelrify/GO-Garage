import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import type { Locale } from "@garage/domain";
import { useDebouncedValue } from "../hooks";
import { recordTypeLabels } from "../record-types";
import { fetchSearch, groupSearchResults, type SearchFetcher, type SearchResult } from "../search";
import { recordIcons } from "./RecordRef";
import { StatusBadge } from "./StatusBadge";

export interface GlobalSearchProps {
  lang: Locale;
  /** Defaults to GET /api/search. Inject for tests or mocks. */
  fetcher?: SearchFetcher;
  /** Called with the chosen result's route (e.g. wouter navigate). */
  onNavigate: (route: string) => void;
  debounceMs?: number;
  /** Minimum characters before searching. */
  minLength?: number;
}

const text = {
  en: { placeholder: "Search name, phone, plate, quote, warranty code", label: "Global search", none: "No matches", error: "Search is unavailable. Try again.", hint: "Type at least 2 characters", loading: "Searching" },
  ar: { placeholder: "ابحث بالاسم أو الهاتف أو اللوحة أو العرض أو كود الضمان", label: "بحث شامل", none: "لا توجد نتائج", error: "البحث غير متاح. حاول مرة أخرى.", hint: "اكتب حرفين على الأقل", loading: "جارٍ البحث" },
};

/** True when the key event should focus the search: "/" outside inputs, or Ctrl/Cmd+K anywhere. Exported for tests. */
export function isSearchShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; target: unknown }): boolean {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") return true;
  if (event.key !== "/" || event.ctrlKey || event.metaKey) return false;
  const target = event.target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = target?.tagName?.toLowerCase();
  return !(tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable);
}

/** True while a modal dialog or drawer owns focus; global shortcuts must not move focus behind it (P2T-028). */
export function isModalOpen(doc: { querySelector: (selector: string) => unknown } | undefined = typeof document === "undefined" ? undefined : document): boolean {
  return Boolean(doc?.querySelector('[aria-modal="true"]'));
}

export function GlobalSearch({ lang, fetcher = fetchSearch, onNavigate, debounceMs = 250, minLength = 2 }: GlobalSearchProps) {
  const copy = text[lang];
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const debounced = useDebouncedValue(query.trim(), debounceMs);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!isSearchShortcut(event)) return;
      if (isModalOpen()) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (debounced.length < minLength) { setResults([]); setState("idle"); return; }
    const controller = new AbortController();
    setState("loading");
    fetcherRef.current(debounced, { signal: controller.signal })
      .then((found) => { if (!controller.signal.aborted) { setResults(found); setActive(0); setState("done"); } })
      .catch(() => { if (!controller.signal.aborted) { setResults([]); setState("error"); } });
    return () => controller.abort();
  }, [debounced, minLength]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const groups = groupSearchResults(results);
  const flat = groups.flatMap((group) => group.items);
  const choose = (result: SearchResult) => { setOpen(false); setQuery(""); onNavigate(result.route); };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { setOpen(false); input.current?.blur(); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => (flat.length ? (index + 1) % flat.length : 0)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (flat.length ? (index - 1 + flat.length) % flat.length : 0)); }
    else if (event.key === "Enter" && open && flat[active]) { event.preventDefault(); choose(flat[active]); }
  };
  const showPanel = open && query.trim().length > 0;
  const optionId = (index: number) => `${listId}-opt-${index}`;
  let index = -1;

  return <div className="global-search" ref={root} role="search">
    <div className="search-wrap" style={{ minWidth: 0 }}>
      <Search size={15} aria-hidden="true" />
      <input
        ref={input}
        className="search-input"
        type="search"
        role="combobox"
        aria-label={copy.label}
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && flat[active] ? optionId(active) : undefined}
        placeholder={copy.placeholder}
        autoComplete="off"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      <kbd className="global-search-kbd" aria-hidden="true">/</kbd>
    </div>
    {showPanel && <div className="global-search-panel" id={listId} role="listbox" aria-label={copy.label}>
      {debounced.length < minLength && <div className="global-search-note">{copy.hint}</div>}
      {state === "loading" && <div className="global-search-note" role="status">{copy.loading}</div>}
      {state === "error" && <div className="global-search-note" role="alert">{copy.error}</div>}
      {state === "done" && flat.length === 0 && <div className="global-search-note" role="status">{copy.none}</div>}
      {state !== "error" && groups.map((group) => <div key={group.type} role="group" aria-label={lang === "ar" ? recordTypeLabels[group.type].pluralAr : recordTypeLabels[group.type].pluralEn}>
        <div className="global-search-group-title" aria-hidden="true">{lang === "ar" ? recordTypeLabels[group.type].pluralAr : recordTypeLabels[group.type].pluralEn}</div>
        {group.items.map((result) => {
          index += 1;
          const position = index;
          const Icon = recordIcons[result.type];
          return <button
            type="button"
            role="option"
            id={optionId(position)}
            key={`${result.type}:${result.id}`}
            className="global-search-option"
            aria-selected={position === active}
            onMouseEnter={() => setActive(position)}
            onClick={() => choose(result)}
          >
            <Icon size={16} aria-hidden="true" />
            <span className="global-search-text"><strong><bdi>{result.title}</bdi></strong>{result.subtitle && <span><bdi>{result.subtitle}</bdi></span>}</span>
            {result.badge && <StatusBadge status={result.badge} lang={lang} />}
          </button>;
        })}
      </div>)}
    </div>}
  </div>;
}
