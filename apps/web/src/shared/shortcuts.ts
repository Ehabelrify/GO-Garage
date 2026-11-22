/** Keyboard shortcut registry: pure matching, sequence handling, labels. The host and dialog live in app/ShortcutsHost. */
export interface KeyLike { key: string; code?: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }

/** Layout-independent key name: letters come from `code` (works on an Arabic keyboard), "?" from Shift+Slash. */
export function normaliseKey(event: KeyLike): string | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.code?.startsWith("Key")) return event.code.slice(3).toLowerCase();
  if (event.code === "Slash" && event.shiftKey) return "?";
  if (event.key === "?") return "?";
  if (event.key.length === 1) return event.key.toLowerCase();
  return event.key;
}

export interface TargetLike { tagName?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null }
/** True while the user is typing, or inside a control that uses letters and arrows itself. */
export function isTypingTarget(target: TargetLike | null | undefined): boolean {
  if (!target) return false;
  const tag = (target.tagName ?? "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  const role = target.getAttribute?.("role");
  return role === "textbox" || role === "combobox" || role === "listbox" || role === "menu";
}

export const SEQUENCE_TIMEOUT_MS = 1500;

export interface SequenceMatcher { feed: (key: string, now: number) => string | null; reset: () => void; pending: () => boolean }
/** Two-key sequences ("g" then "o"). `bindings` maps the second key to an id. */
export function createSequenceMatcher(bindings: Record<string, string>, leader = "g", timeout = SEQUENCE_TIMEOUT_MS): SequenceMatcher {
  let armedAt: number | null = null;
  return {
    feed(key, now) {
      if (armedAt !== null) {
        const fresh = now - armedAt <= timeout;
        armedAt = null;
        if (fresh && Object.prototype.hasOwnProperty.call(bindings, key)) return bindings[key];
      }
      if (key === leader) armedAt = now;
      return null;
    },
    reset() { armedAt = null; },
    pending: () => armedAt !== null,
  };
}

export type Platform = "mac" | "other";
export function detectPlatform(userAgent: string | undefined, platform?: string): Platform {
  return /mac|iphone|ipad|ipod/i.test(`${platform ?? ""} ${userAgent ?? ""}`) ? "mac" : "other";
}
/** Label of the platform modifier used by combos such as Ctrl+K (Cmd on Apple devices). */
export const modLabel = (platform: Platform): string => (platform === "mac" ? "⌘" : "Ctrl");

export interface ShortcutDef { id: string; keys: string[]; group: "global" | "go" | "lists"; en: string; ar: string; mod?: boolean }

export const goTargets: Array<{ key: string; page: string; en: string; ar: string }> = [
  { key: "o", page: "overview", en: "Go to Overview", ar: "الذهاب إلى نظرة عامة" },
  { key: "i", page: "whatsapp", en: "Go to Inbox", ar: "الذهاب إلى صندوق الرسائل" },
  { key: "b", page: "bookings", en: "Go to Bookings", ar: "الذهاب إلى الحجوزات" },
  { key: "w", page: "workshop", en: "Go to Workshop", ar: "الذهاب إلى الورشة" },
  { key: "c", page: "customers", en: "Go to Customers", ar: "الذهاب إلى العملاء" },
  { key: "q", page: "quotes", en: "Go to Quotes", ar: "الذهاب إلى عروض الأسعار" },
  { key: "r", page: "warranties", en: "Go to Warranties", ar: "الذهاب إلى الضمانات" },
  { key: "f", page: "finance", en: "Go to Finance", ar: "الذهاب إلى المالية" },
  { key: "s", page: "settings", en: "Go to Settings", ar: "الذهاب إلى الإعدادات" },
];

/** Go-to bindings limited to the pages this viewer can open (role and capability aware). */
export function goBindings(allowedPages: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const target of goTargets) if (allowedPages.includes(target.page)) out[target.key] = target.page;
  return out;
}

export function shortcutCatalogue(allowedPages: readonly string[], canIntake: boolean): ShortcutDef[] {
  return [
    { id: "search", keys: ["/"], group: "global", en: "Search everything", ar: "البحث في كل شيء" },
    { id: "search-mod", keys: ["k"], mod: true, group: "global", en: "Search everything", ar: "البحث في كل شيء" },
    ...(canIntake ? [{ id: "intake", keys: ["n"], group: "global" as const, en: "New intake", ar: "استقبال جديد" }] : []),
    { id: "help", keys: ["?"], group: "global", en: "Show keyboard shortcuts", ar: "عرض اختصارات لوحة المفاتيح" },
    { id: "close", keys: ["Esc"], group: "global", en: "Close a panel or dialog", ar: "إغلاق اللوحة أو النافذة" },
    ...goTargets.filter((target) => allowedPages.includes(target.page)).map((target): ShortcutDef => ({ id: `go-${target.page}`, keys: ["g", target.key], group: "go", en: target.en, ar: target.ar })),
    { id: "next-row", keys: ["j"], group: "lists", en: "Next row", ar: "الصف التالي" },
    { id: "prev-row", keys: ["k"], group: "lists", en: "Previous row", ar: "الصف السابق" },
    { id: "open-row", keys: ["Enter"], group: "lists", en: "Open the focused row", ar: "فتح الصف المحدد" },
    { id: "select-row", keys: ["x"], group: "lists", en: "Select the focused row (lists with selection)", ar: "تحديد الصف المحدد (القوائم القابلة للتحديد)" },
  ];
}

/** Display text for one key. Letters are upper-cased; Esc and Enter stay words. */
export const keyLabel = (key: string): string => (key.length === 1 ? key.toUpperCase() : key);

/** Index of the row to focus for J/K given the row that has focus now (-1 when none). Stays within bounds. */
export function nextRowIndex(count: number, current: number, delta: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, current + delta));
}
