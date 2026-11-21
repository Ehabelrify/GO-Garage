import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useSearchParams } from "wouter";

export function useMediaQuery(query: string, fallback = false): boolean {
  const read = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : fallback);
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export const FOCUSABLE_SELECTOR =
  "a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

/**
 * Pure focus-trap rule. `current` is the index of the focused element among the
 * focusable list (-1 when focus is outside). Returns the index to focus, or null
 * when the browser's default Tab movement stays inside the container.
 */
export function nextTrapIndex(count: number, current: number, backwards: boolean): number | null {
  if (count <= 0) return null;
  if (backwards) return current <= 0 ? count - 1 : null;
  return current < 0 || current >= count - 1 ? 0 : null;
}

/**
 * Traps Tab inside `ref`, calls onEscape for Esc, focuses `[data-autofocus]` (or the
 * first focusable) on open and restores focus to the previously focused element on close.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void) {
  const escape = useRef(onEscape);
  escape.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const first = container.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0] ?? container;
    if (!container.hasAttribute("tabindex")) container.setAttribute("tabindex", "-1");
    first.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && escape.current) {
        event.stopPropagation();
        escape.current();
        return;
      }
      if (event.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) { event.preventDefault(); container.focus(); return; }
      const target = nextTrapIndex(list.length, list.indexOf(document.activeElement as HTMLElement), event.shiftKey);
      if (target !== null) { event.preventDefault(); list[target].focus(); }
    };
    container.addEventListener("keydown", onKey);
    return () => {
      container.removeEventListener("keydown", onKey);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [active, ref]);
}

export function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [active]);
}

/** Keeps one string value in the URL query (`?tab=claims`) so views are linkable. */
export function useUrlState(key: string, fallback: string): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;
  const set = useCallback((next: string) => {
    setParams((previous) => {
      const copy = new URLSearchParams(previous);
      if (next === fallback) copy.delete(key); else copy.set(key, next);
      return copy;
    }, { replace: true });
  }, [fallback, key, setParams]);
  return [value, set];
}
