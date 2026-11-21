import { TabBar, TabPanel, useUrlState } from "../../shared/components";
import { hasCapability } from "../../shared/capabilities";
import { useGarageStore } from "../../shared/store";
import { TransportPanel } from "../transport/TransportPanel";
import { BookingsPage } from "./BookingsPage";

type BookingsProps = Parameters<typeof BookingsPage>[0];

/** Bookings page with a Transport tab (?tab=transport). Transport stays reachable from each booking drawer too. */
export function BookingsAndTransport(props: BookingsProps) {
  const store = useGarageStore();
  const [tab, setTab] = useUrlState("tab", "bookings");
  const canTransport = hasCapability(store.actor, "transport.coordinate");
  const active = tab === "transport" && canTransport ? "transport" : "bookings";
  const { t, lang } = props;
  if (!canTransport) return <BookingsPage {...props} />;
  return <div>
    <TabBar ariaLabel={t("Bookings sections", "أقسام الحجوزات")} idPrefix="bk" value={active} onChange={setTab}
      tabs={[{ id: "bookings", label: t("Bookings", "الحجوزات") }, { id: "transport", label: t("Transport", "النقل") }]} />
    <TabPanel idPrefix="bk" id="bookings" active={active === "bookings"}><BookingsPage {...props} /></TabPanel>
    <TabPanel idPrefix="bk" id="transport" active={active === "transport"}><TransportPanel lang={lang} /></TabPanel>
  </div>;
}
