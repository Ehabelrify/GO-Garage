import type { Lang } from "../../shared/ui";
import { TransportPanel } from "./TransportPanel";

/** Standalone Transport page (still routable; also embedded as the Transport tab and in each booking drawer). */
export function TransportPage({ lang }: { lang: Lang }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  return <div dir={lang === "ar" ? "rtl" : "ltr"}>
    <TransportPanel lang={lang} header={{ title: t("Transport", "النقل"), subtitle: t("Pickup and return requests for bookings.", "طلبات الاستلام والإعادة للحجوزات.") }} />
  </div>;
}
