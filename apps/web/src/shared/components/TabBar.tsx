import { useId, type KeyboardEvent, type ReactNode } from "react";

export interface TabDef { id: string; label: string; count?: number; hidden?: boolean }

export interface TabBarProps {
  tabs: TabDef[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  /** Used to build ids so a TabPanel can reference its tab. Default: generated. */
  idPrefix?: string;
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
export function TabBar({ tabs, value, onChange, ariaLabel, idPrefix }: TabBarProps) {
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
  return <div className="tabbar" role="tablist" aria-label={ariaLabel} onKeyDown={onKey}>
    {visible.map((tab) => <button
      key={tab.id}
      type="button"
      role="tab"
      className="tab"
      id={`${prefix}-tab-${tab.id}`}
      aria-selected={tab.id === value}
      aria-controls={`${prefix}-panel-${tab.id}`}
      tabIndex={tab.id === value ? 0 : -1}
      onClick={() => onChange(tab.id)}
    >{tab.label}{tab.count !== undefined && <span className="tab-count">{tab.count}</span>}</button>)}
  </div>;
}

export function TabPanel({ idPrefix, id, active, children }: { idPrefix: string; id: string; active: boolean; children: ReactNode }) {
  return <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} hidden={!active}>{active ? children : null}</div>;
}
