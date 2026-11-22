import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TabDef { id: string; label: string; count?: number; hidden?: boolean }

export interface TabBarProps {
  tabs: TabDef[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  /** Used to build ids so a TabPanel can reference its tab. Default: generated. */
  idPrefix?: string;
  /** Set to false when the page switches views without rendering a TabPanel, so tabs do not point at a panel that does not exist. */
  panels?: boolean;
}

/** Next enabled tab index for arrow/Home/End keys. Exported for tests. */
export function nextTabIndex(count: number, current: number, key: string, rtl: boolean): number | null {
  if (count === 0) return null;
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const backward = rtl ? "ArrowRight" : "ArrowLeft";
  if (key === forward) return (current + 1) % count;
  if (key === backward) return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Accessible tablist. Sync with the URL via `useUrlState("tab", "first")` from shared/hooks. */
export function TabBar({ tabs, value, onChange, ariaLabel, idPrefix, panels = true }: TabBarProps) {
  const generated = useId();
  const prefix = idPrefix ?? generated;
  const visible = tabs.filter((tab) => !tab.hidden);
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const current = visible.findIndex((tab) => tab.id === value);
    const next = nextTabIndex(visible.length, current, event.key, rtl);
    if (next === null) return;
    event.preventDefault();
    onChange(visible[next].id);
    event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };
  const listRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ start: false, end: false });
  const measure = () => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft); // scrollLeft is negative in RTL
    setFade((prev) => { const next = { start: max > 1 && pos > 1, end: max > 1 && pos < max - 1 }; return prev.start === next.start && prev.end === next.end ? prev : next; });
  };
  useEffect(() => {
    const el = listRef.current;
    el?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest", inline: "center" });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, visible.length]);
  return <div className="tabbar-wrap" data-fade-start={fade.start ? "true" : "false"} data-fade-end={fade.end ? "true" : "false"}>
    <div className="tabbar" role="tablist" aria-label={ariaLabel} onKeyDown={onKey} ref={listRef} onScroll={measure}>
    {visible.map((tab) => <button
      key={tab.id}
      type="button"
      role="tab"
      className="tab"
      id={`${prefix}-tab-${tab.id}`}
      aria-selected={tab.id === value}
      aria-controls={panels ? `${prefix}-panel-${tab.id}` : undefined}
      tabIndex={tab.id === value ? 0 : -1}
      onClick={() => onChange(tab.id)}
    >{tab.label}{tab.count !== undefined && <span className="tab-count">{tab.count}</span>}</button>)}
    </div>
  </div>;
}

export function TabPanel({ idPrefix, id, active, children }: { idPrefix: string; id: string; active: boolean; children: ReactNode }) {
  return <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} hidden={!active}>{active ? children : null}</div>;
}
