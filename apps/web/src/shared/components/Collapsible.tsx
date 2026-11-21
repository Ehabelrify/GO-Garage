import { useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { Locale } from "@garage/domain";

export interface CollapsibleProps {
  title: string;
  count?: number;
  /** Uncontrolled initial state. */
  defaultOpen?: boolean;
  /** Controlled state. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}

export function Collapsible({ title, count, defaultOpen = false, open: controlled, onToggle, children }: CollapsibleProps) {
  const [inner, setInner] = useState(defaultOpen);
  const open = controlled ?? inner;
  const id = useId();
  const toggle = () => { const next = !open; if (controlled === undefined) setInner(next); onToggle?.(next); };
  return <section className="collapsible" data-open={open ? "true" : "false"}>
    <h3><button type="button" className="collapsible-head" aria-expanded={open} aria-controls={id} onClick={toggle}>
      <ChevronRight className="chevron" size={16} aria-hidden="true" />
      <span className="collapsible-title">{title}</span>
      {count !== undefined && <span className="collapsible-count">{count}</span>}
    </button></h3>
    <div className="collapsible-body" id={id} hidden={!open}>{children}</div>
  </section>;
}

export interface AccordionSection { id: string; title: string; count?: number; content: ReactNode }

const text = { en: { expand: "Expand all", collapse: "Collapse all" }, ar: { expand: "توسيع الكل", collapse: "طي الكل" } };

/** Stack of Collapsible sections with expand/collapse-all (Customer 360, Vehicle, policy editors). */
export function Accordion({ sections, lang, defaultOpenIds = [] }: { sections: AccordionSection[]; lang: Locale; defaultOpenIds?: string[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(defaultOpenIds));
  const allOpen = sections.length > 0 && sections.every((section) => openIds.has(section.id));
  const copy = text[lang];
  return <div className="accordion">
    <div className="accordion-tools">
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpenIds(allOpen ? new Set() : new Set(sections.map((section) => section.id)))}>
        {allOpen ? copy.collapse : copy.expand}
      </button>
    </div>
    {sections.map((section) => <Collapsible
      key={section.id}
      title={section.title}
      count={section.count}
      open={openIds.has(section.id)}
      onToggle={(open) => setOpenIds((previous) => { const next = new Set(previous); if (open) next.add(section.id); else next.delete(section.id); return next; })}
    >{section.content}</Collapsible>)}
  </div>;
}
