import { useCallback, useSyncExternalStore } from "react";

/**
 * Per-viewer display preferences, stored in this browser only (never sent to the server).
 * Storage access is always wrapped: private windows and blocked storage must not break rendering.
 */
const FULL_PRECISION_KEY = "garage.pref.fullPrecision";
const listeners = new Set<() => void>();
let memory = false;

function read(): boolean {
  try {
    const stored = window.localStorage.getItem(FULL_PRECISION_KEY);
    if (stored !== null) return stored === "1";
  } catch { /* storage unavailable */ }
  return memory;
}

export function getFullPrecision(): boolean {
  return typeof window === "undefined" ? memory : read();
}

export function setFullPrecision(value: boolean): void {
  memory = value;
  try { window.localStorage.setItem(FULL_PRECISION_KEY, value ? "1" : "0"); } catch { /* storage unavailable */ }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === FULL_PRECISION_KEY) listener(); };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** `[showFullPrecision, setShowFullPrecision]`. When on, Amount shows exact fractions and never compacts. */
export function useFullPrecision(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, getFullPrecision, () => false);
  const set = useCallback((next: boolean) => setFullPrecision(next), []);
  return [value, set];
}
