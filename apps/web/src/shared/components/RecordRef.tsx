import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Bookmark, CalendarClock, Car, ExternalLink, FileText, Gift, MessageSquare, Package, Receipt, Truck, ShieldCheck, Sparkles, TriangleAlert, UserRound, Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Locale } from "@garage/domain";
import { defaultRecordRoutes, recordTypeLabels, type RecordType } from "../record-types";
import { DetailDrawer } from "./DetailDrawer";

export const recordIcons: Record<RecordType, LucideIcon> = {
  customer: UserRound,
  vehicle: Car,
  booking: CalendarClock,
  job: Wrench,
  quote: FileText,
  reservation: Bookmark,
  warranty: ShieldCheck,
  claim: TriangleAlert,
  invoice: Receipt,
  conversation: MessageSquare,
  benefit: Gift,
  transport: Truck,
  "catalogue-package": Package,
  "special-request": Sparkles,
};

export interface RecordSummary { type: RecordType; id: string; label: string; subtitle?: string; badge?: string }

export interface RecordResolver {
  /** Full-page route. Defaults to defaultRecordRoutes[type]. */
  route?: (id: string) => string;
  /** Human label when the caller did not pass one (e.g. look up the plate in the store). Never return the raw id. */
  label?: (id: string) => string | undefined;
  /**
   * Body of the preview drawer. Receive the summary; fetch or read from the store as needed.
   * When absent a default preview (type, label, subtitle, badge) is shown.
   */
  preview?: (record: RecordSummary, lang: Locale) => ReactNode;
}

export type RecordRegistry = Partial<Record<RecordType, RecordResolver>>;

interface RecordContextValue {
  lang: Locale;
  registry: RecordRegistry;
  open: (record: RecordSummary) => void;
  routeFor: (type: RecordType, id: string) => string;
  labelFor: (type: RecordType, id: string, given?: string) => string;
}

const RecordContext = createContext<RecordContextValue | null>(null);

const text = {
  en: { openFull: "Open full page", unavailable: "No preview available for this record.", type: "Type" },
  ar: { openFull: "فتح الصفحة الكاملة", unavailable: "لا توجد معاينة لهذا السجل.", type: "النوع" },
};

/**
 * Mount once near the app shell. Features register how to route and preview each record type:
 *   <RecordProvider lang={lang} registry={{ customer: { label: id => name(id), preview: (r) => <CustomerPreview .../> } }}>
 * RecordRef clicks open one shared DetailDrawer with a back stack and an "Open full page" link.
 */
export function RecordProvider({ lang, registry = {}, children }: { lang: Locale; registry?: RecordRegistry; children: ReactNode }) {
  const [stack, setStack] = useState<RecordSummary[]>([]);
  const routeFor = useCallback((type: RecordType, id: string) => (registry[type]?.route ?? defaultRecordRoutes[type])(id), [registry]);
  const labelFor = useCallback((type: RecordType, id: string, given?: string) => {
    const label = given?.trim() || registry[type]?.label?.(id)?.trim();
    return label || (lang === "ar" ? recordTypeLabels[type].ar : recordTypeLabels[type].en);
  }, [registry, lang]);
  const open = useCallback((record: RecordSummary) => setStack((previous) => [...previous, record]), []);
  const value = useMemo(() => ({ lang, registry, open, routeFor, labelFor }), [lang, registry, open, routeFor, labelFor]);
  const current = stack.at(-1);
  const copy = text[lang];
  return <RecordContext.Provider value={value}>
    {children}
    {current && <DetailDrawer
      open
      lang={lang}
      title={current.label}
      subtitle={lang === "ar" ? recordTypeLabels[current.type].ar : recordTypeLabels[current.type].en}
      onClose={() => setStack([])}
      onBack={stack.length > 1 ? () => setStack((previous) => previous.slice(0, -1)) : undefined}
      footer={<Link className="btn btn-primary" href={routeFor(current.type, current.id)} onClick={() => setStack([])}><ExternalLink size={15} aria-hidden="true" />{copy.openFull}</Link>}
    >
      {registry[current.type]?.preview
        ? registry[current.type]!.preview!(current, lang)
        : <div className="record-preview">
            {current.subtitle && <p>{current.subtitle}</p>}
            {current.badge && <div><span className="tag">{current.badge}</span></div>}
            {!current.subtitle && !current.badge && <p className="form-hint">{copy.unavailable}</p>}
          </div>}
    </DetailDrawer>}
  </RecordContext.Provider>;
}

export function useRecords(): RecordContextValue | null {
  return useContext(RecordContext);
}

export interface RecordRefProps {
  type: RecordType;
  id: string;
  /** Human label (plate, customer name, quote number). Falls back to the registry, then the type name; never the raw id. */
  label?: string;
  subtitle?: string;
  badge?: string;
  /** "link" navigates directly to the full page instead of opening the preview. */
  mode?: "preview" | "link";
  /** Hide the type icon (tables where the column already says the type). */
  hideIcon?: boolean;
}

/** Human-readable link to any record. Plates and phones inside labels are isolated with bdi. */
export function RecordRef({ type, id, label, subtitle, badge, mode = "preview", hideIcon }: RecordRefProps) {
  const ctx = useContext(RecordContext);
  const Icon = recordIcons[type];
  const fallbackLang: Locale = ctx?.lang ?? "en";
  const shown = ctx ? ctx.labelFor(type, id, label) : (label?.trim() || recordTypeLabels[type][fallbackLang === "ar" ? "ar" : "en"]);
  const typeName = recordTypeLabels[type][fallbackLang === "ar" ? "ar" : "en"];
  const content = <>{!hideIcon && <Icon size={14} aria-hidden="true" />}<bdi className="record-ref-label">{shown}</bdi></>;
  if (!ctx) return <span className="record-ref plain" title={typeName}>{content}</span>;
  if (mode === "link") return <Link className="record-ref" href={ctx.routeFor(type, id)} title={typeName}>{content}</Link>;
  return <button type="button" className="record-ref" title={typeName} aria-haspopup="dialog" onClick={() => ctx.open({ type, id, label: shown, subtitle, badge })}>{content}</button>;
}

/** Vertical list of RecordRefs with optional subtitle/badge: for "related records" sections. */
export function RecordRefList({ items, empty }: { items: Array<{ type: RecordType; id: string; label?: string; subtitle?: string; badge?: string }>; empty?: ReactNode }) {
  if (items.length === 0) return <>{empty ?? null}</>;
  return <ul className="record-ref-list">
    {items.map((item) => <li className="record-ref-row" key={`${item.type}:${item.id}`}>
      <span><RecordRef {...item} />{item.subtitle && <div className="record-ref-sub">{item.subtitle}</div>}</span>
      {item.badge && <span className="tag">{item.badge}</span>}
    </li>)}
  </ul>;
}
