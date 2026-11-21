import { useCallback, useEffect, useState } from "react";
import { fetch360, RecordError } from "./customers-api";
import type { Parsed360 } from "./customers-logic";

export type Record360State =
  | { status: "loading" }
  | { status: "error"; code: string; forbidden: boolean }
  | { status: "missing" }
  | { status: "ready"; data: Parsed360 };

/** Loads GET /api/{customers|vehicles}/:id/360 with abort-on-change and a reload handle. */
export function useRecord360(kind: "customer" | "vehicle", id: string): { state: Record360State; reload: () => void } {
  const [state, setState] = useState<Record360State>({ status: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch360(kind, id, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setState(data ? { status: "ready", data } : { status: "missing" }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const status = error instanceof RecordError ? error.status : 0;
        setState({ status: "error", code: error instanceof RecordError ? error.code : "NETWORK", forbidden: status === 403 });
      });
    return () => controller.abort();
  }, [kind, id, tick]);
  return { state, reload: useCallback(() => setTick((value) => value + 1), []) };
}
