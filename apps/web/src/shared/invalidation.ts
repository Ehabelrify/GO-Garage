import { useEffect, useRef } from "react";

/** Data areas that screens can depend on. */
export type InvalidationTopic =
  | "bookings" | "jobs" | "customers" | "invoices" | "quotes" | "finance" | "transport"
  | "reservations" | "benefits" | "warranties" | "permissions";

export const SAFETY_NET_INTERVAL_MS = 60_000;

type Listener = { topics: ReadonlySet<string>; callback: () => void };
const listeners = new Set<Listener>();
let teardown: (() => void) | null = null;

function visible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function fireAll() {
  for (const listener of [...listeners]) listener.callback();
}

function install() {
  if (teardown || typeof window === "undefined") return;
  const onFocus = () => { if (visible()) fireAll(); };
  const onVisibility = () => { if (visible()) fireAll(); };
  const timer = window.setInterval(() => { if (visible()) fireAll(); }, SAFETY_NET_INTERVAL_MS);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  teardown = () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    teardown = null;
  };
}

/** Tell every screen that depends on these topics to refetch. */
export function invalidate(topics: InvalidationTopic | readonly InvalidationTopic[]) {
  const fired = new Set<string>(typeof topics === "string" ? [topics] : topics);
  for (const listener of [...listeners]) {
    for (const topic of listener.topics) {
      if (fired.has(topic)) { listener.callback(); break; }
    }
  }
}

/**
 * Subscribe without React. The callback runs when one of the topics is invalidated, when the
 * tab regains focus or becomes visible, and every 60 s while visible (never while hidden).
 */
export function subscribeInvalidation(topics: readonly InvalidationTopic[], callback: () => void): () => void {
  const listener: Listener = { topics: new Set(topics), callback };
  listeners.add(listener);
  install();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) teardown?.();
  };
}

export function useInvalidation(topics: readonly InvalidationTopic[], refetch: () => void) {
  const latest = useRef(refetch);
  latest.current = refetch;
  const key = topics.join("|");
  useEffect(
    () => subscribeInvalidation(key ? (key.split("|") as InvalidationTopic[]) : [], () => latest.current()),
    [key],
  );
}

const MUTATION_ROUTES: Array<[RegExp, InvalidationTopic[]]> = [
  [/^\/api\/bookings/, ["bookings", "jobs", "transport", "reservations"]],
  [/^\/api\/jobs/, ["jobs", "bookings", "invoices", "warranties"]],
  [/^\/api\/customers|^\/api\/vehicles/, ["customers", "bookings", "quotes", "invoices"]],
  [/^\/api\/invoices/, ["invoices", "finance", "jobs"]],
  [/^\/api\/quotes/, ["quotes", "reservations", "benefits", "finance", "bookings"]],
  [/^\/api\/reservations/, ["reservations", "bookings", "quotes", "benefits", "finance"]],
  [/^\/api\/benefits/, ["benefits", "reservations", "finance"]],
  [/^\/api\/promotions/, ["reservations", "benefits", "quotes", "finance"]],
  [/^\/api\/transport/, ["transport", "bookings", "jobs", "invoices"]],
  [/^\/api\/finance/, ["finance", "invoices"]],
  [/^\/api\/warranties/, ["warranties", "invoices", "jobs"]],
  [/^\/api\/(settings|staff|users|roles|permissions|auth)/, ["permissions", "bookings", "jobs", "customers", "invoices", "quotes", "finance", "transport", "reservations", "benefits", "warranties"]],
];

/** Topics affected by a successful write to this URL. Empty for reads. */
export function topicsForMutation(url: string, method = "GET"): InvalidationTopic[] {
  if (method.toUpperCase() === "GET") return [];
  const path = url.split("?")[0];
  const hit = MUTATION_ROUTES.find(([pattern]) => pattern.test(path));
  return hit ? hit[1] : [];
}

/** Call after a write succeeded; invalidates every topic the URL touches. */
export function invalidateForMutation(url: string, method = "GET") {
  const topics = topicsForMutation(url, method);
  if (topics.length) invalidate(topics);
}
