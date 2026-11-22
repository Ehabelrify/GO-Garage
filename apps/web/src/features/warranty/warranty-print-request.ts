import { useCallback, useEffect, useState } from "react";
import { printDocument } from "../../shared/components";

/**
 * Mounts a PrintHost only while a print is in progress, so two print sheets on one screen (coverage sheet and
 * draft invoice) never print together. `request()` mounts the host, the effect opens the print dialog, and the
 * host is removed again after printing (afterprint, or a 60 s fallback).
 */
export function usePrintRequest(): [boolean, () => void] {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const fallback = window.setTimeout(done, 60_000);
    try { printDocument(); } catch { done(); }
    return () => { window.removeEventListener("afterprint", done); window.clearTimeout(fallback); };
  }, [printing]);
  const request = useCallback(() => setPrinting(true), []);
  return [printing, request];
}
