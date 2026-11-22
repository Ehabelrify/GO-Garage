import { useEffect, useId, useRef, useState } from "react";
import { Bookmark, Check, Pencil, RotateCcw, Star, Trash2 } from "lucide-react";
import type { Locale } from "@garage/domain";
import { applyListState, readListState } from "../list-state";
import {
  browserStorage, defaultView, deleteView, loadViews, persistViews, renameView, saveView, setDefaultView, urlHasListState,
  type SavedView, type ViewError,
} from "../saved-views";
import { useViewer } from "../viewer";
import { ConfirmDialog } from "./ConfirmDialog";

/** What a saved view can capture and restore. Filters that the page cannot express (no matching option) are skipped on apply. */
export interface SavedViewsBinding {
  search?: { value: string; onChange: (value: string) => void };
  filters: Array<{ key: string; value: string; options: Array<{ value: string }>; onChange: (value: string) => void; allValue?: string }>;
  onReset?: () => void;
}

const text = {
  en: {
    views: "Views", title: "Saved views", none: "No saved views yet.", name: "View name", save: "Save current view", reset: "Reset to default view",
    defaultTag: "Default", setDefault: "Use as default view", clearDefault: "Remove default", rename: "Rename", remove: "Delete", apply: "Apply view",
    ok: "OK", cancel: "Cancel", deleteTitle: "Delete this view?", deleteConfirm: "Delete", hint: "Saves search, filters, sort and page size on this device.",
    EMPTY_NAME: "Enter a name.", DUPLICATE_NAME: "That name is already used.", TOO_MANY: "Delete a view before saving another.",
    unsaved: "Could not save on this device.",
  },
  ar: {
    views: "العروض", title: "العروض المحفوظة", none: "لا توجد عروض محفوظة بعد.", name: "اسم العرض", save: "حفظ العرض الحالي", reset: "العودة إلى العرض الافتراضي",
    defaultTag: "افتراضي", setDefault: "استخدامه كعرض افتراضي", clearDefault: "إزالة الافتراضي", rename: "إعادة تسمية", remove: "حذف", apply: "تطبيق العرض",
    ok: "حسناً", cancel: "إلغاء", deleteTitle: "حذف هذا العرض؟", deleteConfirm: "حذف", hint: "يحفظ البحث والتصفية والترتيب وحجم الصفحة على هذا الجهاز.",
    EMPTY_NAME: "أدخل اسماً.", DUPLICATE_NAME: "هذا الاسم مستخدم.", TOO_MANY: "احذف عرضاً قبل حفظ عرض آخر.",
    unsaved: "تعذر الحفظ على هذا الجهاز.",
  },
};

/** Per-user, per-list saved views menu, rendered by FilterBar when `views` is set. */
export function SavedViewsMenu({ lang, listId, binding }: { lang: Locale; listId: string; binding: SavedViewsBinding }) {
  const copy = text[lang];
  const viewer = useViewer();
  const userId = viewer?.userId ?? "";
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<ViewError | "unsaved" | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<SavedView | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const bindingRef = useRef(binding);
  bindingRef.current = binding;
  const formId = useId();

  const apply = (view: SavedView | undefined) => {
    const current = bindingRef.current;
    if (view) {
      current.search?.onChange(view.search);
      for (const filter of current.filters) {
        const saved = view.filters[filter.key];
        const fallback = filter.allValue ?? "all";
        const next = saved !== undefined && filter.options.some((option) => option.value === saved) ? saved : fallback;
        if (next !== filter.value) filter.onChange(next);
      }
      applyListState(listId, { sort: view.sort, pageSize: view.pageSize ?? undefined });
      setActiveId(view.id);
    } else {
      current.onReset?.();
      applyListState(listId, { sort: null });
      setActiveId(null);
    }
  };

  // Load this user's views and apply the default once, unless the URL already carries list state of its own.
  useEffect(() => {
    if (!userId) { setViews([]); return; }
    const loaded = loadViews(browserStorage(), userId, listId);
    setViews(loaded);
    const fallback = defaultView(loaded);
    if (fallback && !urlHasListState(window.location.search)) apply(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, listId]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !removing) { event.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey, true); };
  }, [open, removing]);

  if (!userId) return null;

  const commit = (next: SavedView[]) => {
    setViews(next);
    setError(persistViews(browserStorage(), userId, listId, next) ? null : "unsaved");
  };
  const snapshot = () => {
    const current = bindingRef.current;
    const list = readListState(listId);
    const filters: Record<string, string> = {};
    for (const filter of current.filters) if (filter.value !== (filter.allValue ?? "all")) filters[filter.key] = filter.value;
    return { search: current.search?.value ?? "", filters, sort: list.sort, pageSize: list.pageSize };
  };
  const onSave = () => {
    const result = saveView(views, name, snapshot());
    if (result.error) { setError(result.error); return; }
    commit(result.views);
    setActiveId(result.views.find((view) => view.name.toLocaleLowerCase() === name.trim().replace(/\s+/g, " ").toLocaleLowerCase())?.id ?? null);
    setName("");
  };
  const onRename = () => {
    if (!renaming) return;
    const result = renameView(views, renaming.id, renaming.name);
    if (result.error) { setError(result.error); return; }
    commit(result.views);
    setRenaming(null);
  };
  const message = error ? (error === "unsaved" ? copy.unsaved : copy[error]) : null;

  return <div className="views-menu" ref={root}>
    <button type="button" className="btn btn-sm" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <Bookmark size={14} aria-hidden="true" />{copy.views}{views.length > 0 && <span className="views-note"> ({views.length})</span>}
    </button>
    {open && <div className="views-popover" role="dialog" aria-label={copy.title}>
      {views.length === 0 ? <p className="views-note">{copy.none}</p> : <ul className="views-list">
        {views.map((view) => <li key={view.id} className="views-item">
          {renaming?.id === view.id
            ? <>
                <input className="field-input" value={renaming.name} aria-label={copy.rename} maxLength={40} autoFocus
                  onChange={(event) => setRenaming({ id: view.id, name: event.target.value })}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onRename(); } }} />
                <button type="button" className="btn btn-sm" aria-label={copy.ok} onClick={onRename}><Check size={14} aria-hidden="true" /></button>
              </>
            : <>
                <button type="button" className="btn btn-quiet btn-sm views-apply" aria-pressed={activeId === view.id} title={copy.apply}
                  onClick={() => { apply(view); setOpen(false); }}>
                  {view.name}{view.isDefault && <span className="views-note"> · {copy.defaultTag}</span>}
                </button>
                <button type="button" className="btn btn-quiet btn-sm" aria-pressed={Boolean(view.isDefault)} aria-label={view.isDefault ? copy.clearDefault : copy.setDefault} title={view.isDefault ? copy.clearDefault : copy.setDefault}
                  onClick={() => commit(setDefaultView(views, view.id))}><Star size={14} aria-hidden="true" fill={view.isDefault ? "currentColor" : "none"} /></button>
                <button type="button" className="btn btn-quiet btn-sm" aria-label={`${copy.rename}: ${view.name}`} title={copy.rename}
                  onClick={() => { setError(null); setRenaming({ id: view.id, name: view.name }); }}><Pencil size={14} aria-hidden="true" /></button>
                <button type="button" className="btn btn-quiet btn-sm" aria-label={`${copy.remove}: ${view.name}`} title={copy.remove}
                  onClick={() => setRemoving(view)}><Trash2 size={14} aria-hidden="true" /></button>
              </>}
        </li>)}
      </ul>}
      <form className="views-form" onSubmit={(event) => { event.preventDefault(); onSave(); }} id={formId}>
        <input className="field-input" value={name} placeholder={copy.name} aria-label={copy.name} maxLength={40}
          onChange={(event) => { setName(event.target.value); if (error) setError(null); }} />
        <button type="submit" className="btn btn-sm btn-primary">{copy.save}</button>
      </form>
      {message && <p className="views-error" role="alert">{message}</p>}
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => { apply(defaultView(views)); setOpen(false); }}>
        <RotateCcw size={14} aria-hidden="true" />{copy.reset}
      </button>
      <p className="views-note">{copy.hint}</p>
    </div>}
    <ConfirmDialog open={removing !== null} lang={lang} danger title={copy.deleteTitle} body={removing?.name} confirmLabel={copy.deleteConfirm} cancelLabel={copy.cancel}
      onCancel={() => setRemoving(null)}
      onConfirm={() => { if (removing) { commit(deleteView(views, removing.id)); if (activeId === removing.id) setActiveId(null); } setRemoving(null); }} />
  </div>;
}
