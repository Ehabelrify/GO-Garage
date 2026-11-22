import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import type { Locale } from "@garage/domain";

export interface RowMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Renders a link (tel:, https:). */
  href?: string;
  onSelect?: () => void;
  hidden?: boolean;
}

const MENU_WIDTH = 210;

/** Kebab menu for row actions. Fixed-positioned so a scrolling table wrapper never clips it. */
export function RowMenu({ lang, label, items }: { lang: Locale; label: string; items: RowMenuItem[] }) {
  const visible = items.filter((item) => !item.hidden);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = (restore: boolean) => { setOpen(false); if (restore) trigger.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) {
      const rtl = lang === "ar";
      const left = Math.max(8, Math.min(window.innerWidth - MENU_WIDTH - 8, rtl ? rect.left : rect.right - MENU_WIDTH));
      const height = visible.length * 40 + 12;
      const top = rect.bottom + 4 + height > window.innerHeight ? Math.max(8, rect.top - 4 - height) : rect.bottom + 4;
      setPos({ top, left });
    }
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const onAway = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onAway, true);
    window.addEventListener("resize", onAway);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("scroll", onAway, true); window.removeEventListener("resize", onAway); };
  }, [open]);

  if (visible.length === 0) return null;

  const onKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(true); return; }
    const nodes = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") { event.preventDefault(); nodes[(index + 1) % nodes.length]?.focus(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); nodes[(index - 1 + nodes.length) % nodes.length]?.focus(); }
    else if (event.key === "Home") { event.preventDefault(); nodes[0]?.focus(); }
    else if (event.key === "End") { event.preventDefault(); nodes[nodes.length - 1]?.focus(); }
    else if (event.key === "Tab") setOpen(false);
  };

  return <span className="bk-menu-host" onClick={(event) => event.stopPropagation()}>
    <button ref={trigger} type="button" className="btn btn-sm btn-quiet bk-kebab" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <MoreVertical size={16} aria-hidden="true" />
    </button>
    {open && <div ref={menu} className="bk-menu" role="menu" aria-label={label} style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }} onKeyDown={onKey}>
      {visible.map((item) => item.href
        ? <a key={item.key} role="menuitem" className="bk-menu-item" href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => setOpen(false)}>{item.icon}<span>{item.label}</span></a>
        : <button key={item.key} type="button" role="menuitem" className="bk-menu-item" onClick={() => { setOpen(false); item.onSelect?.(); }}>{item.icon}<span>{item.label}</span></button>)}
    </div>}
  </span>;
}
