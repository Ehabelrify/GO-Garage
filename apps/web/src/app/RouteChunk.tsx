import { Component, Suspense, lazy, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import type { Lang } from "../shared/ui";
import { EmptyState } from "../shared/components/EmptyState";

type Loader = () => Promise<{ default: ComponentType<any> }>;

/** Time after which a stuck page load shows an error with Retry. */
export const ROUTE_TIMEOUT_MS = 10_000;

class ChunkErrorBoundary extends Component<{
  children: ReactNode;
  lang: Lang;
  retry: () => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { lang, retry } = this.props;
    return <section dir={lang === "ar" ? "rtl" : "ltr"}>
      <EmptyState
        variant="error"
        title={lang === "ar" ? "تعذر تحميل الصفحة" : "This page could not be loaded"}
        text={lang === "ar" ? "إعادة المحاولة ستعيد تحميل الصفحة، وقد تضيع التعديلات غير المحفوظة." : "Trying again will reload the page, and unsaved edits may be lost."}
        action={<button type="button" className="btn btn-primary" onClick={retry}>{lang === "ar" ? "إعادة تحميل الصفحة" : "Retry"}</button>}
      />
    </section>;
  }
}

/** Page-shaped skeleton (title, tiles, table rows). After 10 s it turns into an error with Retry. */
export function RouteSkeleton({ lang, timeoutMs = ROUTE_TIMEOUT_MS, onRetry }: { lang: Lang; timeoutMs?: number; onRetry?: () => void }) {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [timeoutMs]);
  const ar = lang === "ar";
  if (timedOut) {
    return <div dir={ar ? "rtl" : "ltr"}><EmptyState
      variant="error"
      title={ar ? "الصفحة تستغرق وقتًا أطول من المعتاد" : "This page is taking too long to load"}
      text={ar ? "تحقق من الاتصال ثم أعد المحاولة." : "Check your connection, then try again."}
      action={<button type="button" className="btn btn-primary" onClick={onRetry ?? (() => window.location.reload())}>{ar ? "إعادة المحاولة" : "Retry"}</button>}
    /></div>;
  }
  return <div className="route-skeleton" role="status" aria-busy="true" aria-label={ar ? "جارٍ تحميل الصفحة" : "Loading page"} dir={ar ? "rtl" : "ltr"}>
    <div className="route-skeleton-head"><span className="skeleton" style={{ width: "32%", height: 28 }} /><span className="skeleton" style={{ width: "52%" }} /></div>
    <div className="route-skeleton-tiles">{[0, 1, 2, 3].map((i) => <div className="route-skeleton-tile" key={i}><span className="skeleton" style={{ width: "50%" }} /><span className="skeleton" style={{ width: "70%", height: 20 }} /></div>)}</div>
    <div className="skeleton-rows">{Array.from({ length: 6 }, (_, i) => <span className="skeleton" key={i} style={{ width: `${96 - (i % 3) * 12}%`, height: 18 }} />)}</div>
  </div>;
}

export function RouteChunk({ loader, lang, pageProps }: {
  loader: Loader;
  lang: Lang;
  pageProps: Record<string, unknown>;
}) {
  const Page = useMemo(() => lazy(loader), [loader]);
  return <ChunkErrorBoundary lang={lang} retry={() => window.location.reload()}>
    <Suspense fallback={<RouteSkeleton lang={lang} />}>
      <Page {...pageProps} />
    </Suspense>
  </ChunkErrorBoundary>;
}
