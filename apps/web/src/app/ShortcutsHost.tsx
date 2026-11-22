import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Locale } from "@garage/domain";
import { useFocusTrap, useLockBodyScroll } from "../shared/hooks";
import {
  createSequenceMatcher, detectPlatform, goBindings, isTypingTarget, keyLabel, modLabel, normaliseKey, shortcutCatalogue,
  type ShortcutDef,
} from "../shared/shortcuts";

const text = {
  en: { title: "Keyboard shortcuts", close: "Close", global: "Anywhere", go: "Go to (press G, then a letter)", lists: "In lists", then: "then", hint: "Shortcuts are ignored while you type in a field." },
  ar: { title: "اختصارات لوحة المفاتيح", close: "إغلاق", global: "في أي مكان", go: "الانتقال (اضغط G ثم حرفاً)", lists: "في القوائم", then: "ثم", hint: "تُتجاهل الاختصارات أثناء الكتابة في حقل." },
};

export interface ShortcutsHostProps {
  lang: Locale;
  /** Page ids the signed-in viewer can open (from navigationForRole). */
  allowedPages: string[];
  canIntake: boolean;
  navigate: (path: string) => void;
}

/** Global shortcuts: G then a letter to go to a page, ? for the help dialog. "/", Ctrl/Cmd+K and N are owned by GlobalSearch and IntakeHost. */
export function ShortcutsHost({ lang, allowedPages, canIntake, navigate }: ShortcutsHostProps) {
  const copy = text[lang];
  const [open, setOpen] = useState(false);
  const bindings = useMemo(() => goBindings(allowedPages), [allowedPages]);
  const matcher = useMemo(() => createSequenceMatcher(bindings), [bindings]);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (isTypingTarget(event.target as HTMLElement | null)) { matcher.reset(); return; }
      const name = normaliseKey(event);
      if (!name) { matcher.reset(); return; }
      if (document.querySelector("[aria-modal='true']")) { matcher.reset(); return; }
      if (name === "?") { event.preventDefault(); setOpen(true); return; }
      const page = matcher.feed(name, Date.now());
      if (page) { event.preventDefault(); navigateRef.current(`/workspace/${page}`); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [matcher]);

  if (!open) return null;
  return <ShortcutsDialog lang={lang} copy={copy} allowedPages={allowedPages} canIntake={canIntake} onClose={() => setOpen(false)} />;
}

function KeyChips({ def, platform, then }: { def: ShortcutDef; platform: "mac" | "other"; then: string }) {
  const keys = def.mod ? [modLabel(platform), ...def.keys.map(keyLabel)] : def.keys.map(keyLabel);
  return <span className="shortcuts-keys">
    {keys.map((key, index) => <span key={`${key}-${index}`} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {index > 0 && <span className="shortcuts-then">{def.mod ? "+" : then}</span>}<kbd>{key}</kbd>
    </span>)}
  </span>;
}

function ShortcutsDialog({ lang, copy, allowedPages, canIntake, onClose }: { lang: Locale; copy: (typeof text)["en"]; allowedPages: string[]; canIntake: boolean; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  useFocusTrap(panel, true, onClose);
  useLockBodyScroll(true);
  const platform = detectPlatform(typeof navigator === "undefined" ? undefined : navigator.userAgent, typeof navigator === "undefined" ? undefined : navigator.platform);
  const catalogue = shortcutCatalogue(allowedPages, canIntake);
  const groups: Array<[ShortcutDef["group"], string]> = [["global", copy.global], ["go", copy.go], ["lists", copy.lists]];
  return createPortal(
    <div className="overlay dialog" dir={lang === "ar" ? "rtl" : "ltr"} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panel} className="dialog-panel shortcuts-panel" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <h2 id="shortcuts-title">{copy.title}</h2>
        {groups.map(([group, heading]) => {
          const items = catalogue.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return <div className="shortcuts-group" key={group}>
            <h3>{heading}</h3>
            <ul className="shortcuts-list">
              {items.map((item) => <li key={item.id}><span>{lang === "ar" ? item.ar : item.en}</span><KeyChips def={item} platform={platform} then={copy.then} /></li>)}
            </ul>
          </div>;
        })}
        <p className="shortcuts-then" style={{ marginBlockStart: 12 }}>{copy.hint}</p>
        <div className="dialog-actions">
          <button type="button" className="btn" data-autofocus onClick={onClose}><X size={14} aria-hidden="true" />{copy.close}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
