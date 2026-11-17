import { Component, Suspense, lazy, useMemo, type ComponentType, type ReactNode } from "react";
import type { Lang } from "../shared/ui";

type Loader = () => Promise<{ default: ComponentType<any> }>;

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
    return <section role="alert" dir={lang === "ar" ? "rtl" : "ltr"}>
      <p>{lang === "ar" ? "تعذر تحميل الصفحة. إعادة المحاولة ستعيد تحميل الصفحة، وقد تضيع التعديلات غير المحفوظة." : "This page could not be loaded. Trying again will reload the page, and unsaved edits may be lost."}</p>
      <button type="button" className="btn btn-primary" onClick={retry}>
        {lang === "ar" ? "إعادة تحميل الصفحة" : "Reload page"}
      </button>
    </section>;
  }
}

export function RouteChunk({ loader, lang, pageProps }: {
  loader: Loader;
  lang: Lang;
  pageProps: Record<string, unknown>;
}) {
  const Page = useMemo(() => lazy(loader), [loader]);
  return <ChunkErrorBoundary lang={lang} retry={() => window.location.reload()}>
    <Suspense fallback={<div role="status" dir={lang === "ar" ? "rtl" : "ltr"}>
      {lang === "ar" ? "جارٍ تحميل الصفحة..." : "Loading page..."}
    </div>}>
      <Page {...pageProps} />
    </Suspense>
  </ChunkErrorBoundary>;
}
