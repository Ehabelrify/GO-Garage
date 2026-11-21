import { useCallback, useEffect, useState } from "react";

export interface LoadState<T> { data: T | null; loading: boolean; error: string | null; reload: () => void }

/** Loads data on mount / dependency change with loading, error and manual reload. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): LoadState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    load()
      .then((result) => { if (current) setData(result); })
      .catch((failure) => { if (current) { setData(null); setError(failure instanceof Error ? failure.message : String(failure)); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, loading, error, reload };
}
