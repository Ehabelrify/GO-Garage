import { PageHeader } from "../../shared/components";
import type { Lang } from "../../shared/ui";
import { TransportPanel } from "./TransportPanel";

/** Standalone Transport page (still routable; also embedded as a booking tab). */
export function TransportPage({ lang }: { lang: Lang }) {
  return <div dir={lang === "ar" ? "rtl" : "ltr"}>
    <PageHeader title={lang === "ar" ? "النقل" : "Transport"} subtitle={lang === "ar" ? "طلبات الاستلام والإعادة للحجوزات القائمة." : "Pickup and return requests for existing bookings."} />
    <TransportPanel lang={lang} />
  </div>;
}
