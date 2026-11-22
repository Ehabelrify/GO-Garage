import type { IntakeResult } from "./intake-logic";

/** Options for opening the quick-intake panel from anywhere (top bar, keyboard, a WhatsApp chat). */
export interface OpenIntakeOptions {
  phone?: string;
  name?: string;
  /** Set when opened from an unlinked WhatsApp chat: the conversation is linked on success. */
  conversationId?: string;
  /** Called after a successful submit (the caller can refresh its own lists). */
  onDone?: (result: IntakeResult) => void;
}

type Listener = (options: OpenIntakeOptions) => void;
const listeners = new Set<Listener>();

/** Tiny pub/sub so the top bar and the inbox can open the one panel without prop drilling or a context. */
export function openIntake(options: OpenIntakeOptions = {}): void {
  listeners.forEach((listener) => listener(options));
}

export function subscribeIntake(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** True for the "N" shortcut: no modifier and focus is not in a field or dialog. */
export function isIntakeShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "target" | "defaultPrevented">): boolean {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key !== "n" && event.key !== "N") return false;
  const target = event.target as { tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown } | null;
  const tag = target?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return false;
  if (target?.closest?.("[role=dialog]")) return false;
  return true;
}
