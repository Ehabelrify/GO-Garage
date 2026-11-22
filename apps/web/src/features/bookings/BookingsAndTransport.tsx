import { PageHeader, TabBar, TabPanel, useUrlState } from "../../shared/components";
import { hasCapability } from "../../shared/capabilities";
import { useGarageStore } from "../../shared/store";
import { TransportPanel } from "../transport/TransportPanel";
import { InvoicesPanel } from "../invoices/InvoicesPanel";
import { RemindersPanel } from "../reminders/RemindersPanel";
import { BookingsPage } from "./BookingsPage";

type BookingsProps = Parameters<typeof BookingsPage>[0];

/**
 * Bookings page with Transport and Invoices tabs (?tab=transport / ?tab=invoices). Every tab has the same header:
 * title (H1), one line, actions on the end side, tab strip directly under it. Transport stays reachable from each booking drawer too.
 */
export function BookingsAndTransport(props: BookingsProps) {
  const store = useGarageStore();
  const [tab, setTab] = useUrlState("tab", "bookings");
  const canTransport = hasCapability(store.actor, "transport.coordinate");
  const canInvoices = hasCapability(store.actor, "invoices.view");
  const canFollowups = hasCapability(store.actor, "bookings.manage");
  const active = tab === "transport" && canTransport ? "transport" : tab === "invoices" && canInvoices ? "invoices" : tab === "followups" && canFollowups ? "followups" : "bookings";
  const { t, lang } = props;
  if (!canTransport && !canInvoices) return <BookingsPage {...props} />;
  const tabs = <TabBar ariaLabel={t("Bookings sections", "أقسام الحجوزات")} idPrefix="bk" value={active} onChange={setTab}
    tabs={[{ id: "bookings", label: t("Bookings", "الحجوزات") }, { id: "transport", label: t("Transport", "النقل"), hidden: !canTransport }, { id: "invoices", label: t("Invoices", "الفواتير"), hidden: !canInvoices }, { id: "followups", label: t("Follow-ups", "المتابعات"), hidden: !canFollowups }]} />;
  return <div>
    <TabPanel idPrefix="bk" id="bookings" active={active === "bookings"}><BookingsPage {...props} tabs={tabs} /></TabPanel>
    <TabPanel idPrefix="bk" id="transport" active={active === "transport"}>
      <TransportPanel lang={lang} header={{ title: t("Transport", "النقل"), subtitle: t("Pickup and return requests for bookings.", "طلبات الاستلام والإعادة للحجوزات."), tabs }} />
    </TabPanel>
    <TabPanel idPrefix="bk" id="invoices" active={active === "invoices"}>
      <PageHeader title={t("Invoices", "الفواتير")} subtitle={t("Invoices raised from bookings and jobs.", "الفواتير الصادرة من الحجوزات وأوامر الشغل.")} tabs={tabs} />
      <InvoicesPanel lang={lang} />
    </TabPanel>
    <TabPanel idPrefix="bk" id="followups" active={active === "followups"}><RemindersPanel lang={lang} tabs={tabs} /></TabPanel>
  </div>;
}
