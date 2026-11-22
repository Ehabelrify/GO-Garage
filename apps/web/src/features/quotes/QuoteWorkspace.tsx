import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { BenefitEntitlement, Locale, QuoteDraftInput } from "@garage/domain";
import { benefitApi, quoteApi, reservationApi, useGarageStore } from "../../shared/store";
import { Amount, Collapsible, DataTable, DateText, DetailDrawer, EmptyState, FilterBar, PageHeader, Plate, RecordRef, Skeleton, StatusBadge, TabBar, TabPanel, useUrlState, type Column } from "../../shared/components";
import { BenefitsPage } from "../benefits/BenefitsPage";
import { benefitName } from "../benefits/benefit-logic";
import { PromotionsPage } from "../promotions/PromotionsPage";
import { QualificationPanel } from "../promotions/QualificationPanel";
import { ReservationsPage } from "../reservations/ReservationsPage";
import { ReserveOffer } from "../reservations/ReserveOffer";
import type { ReservationRow } from "../reservations/reservation-logic";
import { ReadOnlyNote, useCanManageQuotes } from "./access";
import { commercialError } from "./commercial-errors";
import { useLoader } from "./commercial-data";
import { buildLookups, tr } from "./lookups";
import { useOffersNav } from "./nav";
import { CreateQuote } from "./CreateQuote";
import { QuotePrintControls } from "./QuotePrint";
import { QuoteForm, type QuoteFormState } from "./QuoteForm";
import { QuoteAcceptance, QuoteSummaryView } from "./QuoteReview";
import { expiresSoonLabel, followupLabels, filterQuotes, hasOpenFollowup, isExpired, latestPerQuote, quoteAttentionKey, type QuoteRow } from "./quote-logic";
import "./commercial.css";

const stateOptions = ["draft", "offered", "accepted", "superseded", "cancelled"] as const;
const stateAr: Record<string, string> = { draft: "مسودة", offered: "معروض", accepted: "مقبول", superseded: "مستبدل", cancelled: "ملغي" };

interface WorkspaceProps {
  lang: Locale;
  /** The parent page owns the title, tabs and primary action. */
  embedded?: boolean;
  /** Controlled "create quote" drawer (the parent header button opens it). */
  creating?: boolean;
  onCreatingChange?: (open: boolean) => void;
}

/** Quotes tab. Also exported as `Quotes`. `embedded` hides the page title when a parent shell provides tabs. */
export function QuoteWorkspace({ lang, embedded = false, creating: controlledCreating, onCreatingChange }: WorkspaceProps) {
  const t = tr(lang);
  const store = useGarageStore();
  const goTo = useOffersNav();
  const canManage = useCanManageQuotes();
  const lookups = useMemo(() => buildLookups(store.state, lang), [store.state, lang]);
  const list = useLoader(async () => latestPerQuote(await quoteApi.list()), [] as QuoteRow[], (error) => commercialError(error, lang));
  const [record, setRecord] = useUrlState("record", "");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [followup, setFollowup] = useState("all");
  const [form, setForm] = useState<{ base?: QuoteDraftInput } | null>(null);
  const [message, setMessage] = useState("");
  const [ownCreating, setOwnCreating] = useState(false);
  const creating = (controlledCreating ?? ownCreating) && canManage;
  const setCreating = onCreatingChange ?? setOwnCreating;
  const formApi = useRef<QuoteFormState | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const rows = list.data;
  const showFollowup = rows.some(hasOpenFollowup);
  const shown = filterQuotes(rows, { query, status, followup: showFollowup ? followup : "all" }, (row) => `${lookups.customerName(row.input.customerId)} ${lookups.plate(row.input.vehicle.vehicleId)} ${row.input.vehicle.model}`);
  const clear = () => { setQuery(""); setStatus("all"); setFollowup("all"); };
  const open = rows.find((row) => row.ref.quoteId === record) ?? null;
  const startCreate = () => { setMessage(""); setCreating(true); };
  const createButton = canManage ? <button type="button" className="btn btn-primary" onClick={startCreate}><Plus size={16} aria-hidden="true" />{t("Create quote", "إنشاء عرض سعر")}</button> : null;

  const columns: Column<QuoteRow>[] = [
    { key: "customer", header: t("Customer", "العميل"), primary: true, sortable: true, sortValue: (row) => lookups.customerName(row.input.customerId), render: (row) => <RecordRef type="customer" id={row.input.customerId} label={lookups.customerName(row.input.customerId)} /> },
    { key: "vehicle", header: t("Vehicle", "المركبة"), sortable: true, sortValue: (row) => lookups.plate(row.input.vehicle.vehicleId), render: (row) => {
      const plate = lookups.plate(row.input.vehicle.vehicleId);
      const model = lookups.vehicleModel(row.input.vehicle.vehicleId) || row.input.vehicle.model;
      return <span>{plate ? <Plate value={plate} /> : <bdi>{model}</bdi>}{plate && model && <span className="qo-cell-sub"><bdi>{model}</bdi></span>}</span>;
    } },
    { key: "total", header: t("Total", "الإجمالي"), numeric: true, sortable: true, sortValue: (row) => row.total?.minor ?? null, render: (row) => row.total ? <Amount minor={row.total.minor} currency={row.total.currency} lang={lang} /> : <span className="qo-muted">{t("No total yet", "لا إجمالي بعد")}</span> },
    { key: "valid", header: t("Valid until", "صالح حتى"), sortable: true, sortValue: (row) => quoteAttentionKey(row), render: (row) => {
      if (!row.validThrough) return <span className="qo-muted">{t("Not set", "غير محدد")}</span>;
      const soon = row.state === "offered" ? expiresSoonLabel(row.validThrough, lang) : null;
      return <span><DateText value={row.validThrough} lang={lang} />{soon && <span className="qo-cell-sub">{soon}</span>}</span>;
    } },
    ...(showFollowup ? [{ key: "followup", header: t("Follow-up", "المتابعة"), render: (row: QuoteRow) => hasOpenFollowup(row) ? followupLabels[row.followup.status][lang] : "" } satisfies Column<QuoteRow>] : []),
    { key: "status", header: t("Status", "الحالة"), sortable: true, sortValue: (row) => row.state, render: (row) => <StatusBadge status={isExpired(row) ? "expired" : row.state} lang={lang} domain="quote" /> },
  ];

  async function markAnswered(row: QuoteRow) {
    try {
      await quoteApi.followup({ quoteId: row.ref.quoteId, expectedRevision: row.ref.revision, nextStatus: "answered" });
      setMessage(t("Marked as answered.", "تم تحديده كمُجاب عنه."));
      list.reload();
    } catch (error) { setMessage(commercialError(error, lang)); }
  }

  return <div className="qo-page">
    {!embedded && <PageHeader title={t("Quotes", "عروض الأسعار")} meta={!canManage ? <ReadOnlyNote lang={lang} /> : undefined} actions={createButton} />}
    {message && <p role="status" className="qo-muted">{message}</p>}
    <FilterBar lang={lang} search={{ value: query, onChange: setQuery, placeholder: t("Search customer or plate", "ابحث بالعميل أو اللوحة") }}
      filters={[
        { key: "status", label: t("Status", "الحالة"), value: status, onChange: setStatus, options: [{ value: "all", label: t("All statuses", "كل الحالات") }, ...stateOptions.map((value) => ({ value, label: lang === "ar" ? stateAr[value] : value[0].toUpperCase() + value.slice(1) }))] },
        ...(showFollowup ? [{ key: "followup", label: t("Follow-up", "المتابعة"), value: followup, onChange: setFollowup, options: [{ value: "all", label: t("Any follow-up", "أي متابعة") }, ...(["requested", "preparing", "answered"] as const).map((value) => ({ value, label: followupLabels[value][lang] }))] }] : []),
      ]}
      onClear={clear} resultCount={shown.length} />
    <DataTable<QuoteRow> columns={columns} rows={shown} rowKey={(row) => row.ref.quoteId} lang={lang} caption={t("Quotes", "عروض الأسعار")}
      onRowClick={(row) => setRecord(row.ref.quoteId)} selectedKey={record || null} loading={list.loading && rows.length === 0} error={list.error} onRetry={list.reload}
      initialSort={{ key: "valid", direction: "asc" }}
      empty={rows.length === 0
        ? <EmptyState title={t("No quotes yet", "لا توجد عروض أسعار بعد")} text={canManage ? undefined : t("Quotes appear here once they are created.", "تظهر العروض هنا بعد إنشائها.")} action={canManage ? <button type="button" className="btn btn-primary" onClick={startCreate}>{t("Create quote", "إنشاء عرض سعر")}</button> : undefined} />
        : <EmptyState variant="no-results" title={t("No matching quotes", "لا توجد عروض مطابقة")} action={<button type="button" className="btn" onClick={clear}>{t("Clear filters", "مسح التصفية")}</button>} />} />

    <DetailDrawer open={!!record} onClose={() => setRecord("")} lang={lang} wide
      title={open ? lookups.customerName(open.input.customerId) || t("Quote", "عرض سعر") : t("Quote", "عرض سعر")}
      subtitle={open ? `${lookups.plate(open.input.vehicle.vehicleId)} · ${t("Revision", "المراجعة")} ${open.ref.revision}`.replace(/^ · /, "") : undefined}
      footer={open ? <>
        <QuotePrintControls lang={lang} quote={open} lookups={lookups} />
        {canManage && open.state !== "accepted" && <>
          {open.state === "offered" && open.followup.status !== "answered" && <button type="button" className="btn" onClick={() => void markAnswered(open)}>{t("Mark follow-up answered", "تحديد المتابعة كمُجاب عنها")}</button>}
          <button type="button" className="btn btn-primary" onClick={() => { setMessage(""); setForm({ base: { ...open.input, priorRevision: open.ref, quoteId: open.ref.quoteId, state: "draft" } }); }}>{t("Revise", "مراجعة جديدة")}</button>
        </>}
      </> : undefined}>
      {record && !open && (list.loading ? <Skeleton rows={4} label={t("Loading", "جارٍ التحميل")} /> : <EmptyState title={t("Quote not found", "لم يتم العثور على العرض")} />)}
      {open && <QuoteDrawerBody key={open.ref.quoteId} lang={lang} quote={open} lookups={lookups} accepted={rows.filter((row) => row.state === "accepted")} onChanged={list.reload} goTo={goTo} canManage={canManage} />}
    </DetailDrawer>

    {creating && <CreateQuote lang={lang} onClose={() => setCreating(false)}
      onSaved={(ref) => { setCreating(false); list.reload(); setRecord(ref.quoteId); setMessage(t("Quote saved.", "تم حفظ عرض السعر.")); }} />}
    <DetailDrawer open={canManage && form !== null} onClose={() => setForm(null)} lang={lang} wide
      title={form?.base ? t("Revise quote", "مراجعة عرض السعر") : t("New quote", "عرض سعر جديد")}
      footer={<>
        <button type="button" className="btn" onClick={() => setForm(null)}>{t("Cancel", "إلغاء")}</button>
        <button type="button" className="btn" disabled={formBusy} onClick={() => formApi.current?.save("draft")}>{t("Save draft", "حفظ كمسودة")}</button>
        <button type="button" className="btn btn-primary" disabled={formBusy} onClick={() => formApi.current?.save("offered")}>{t("Send offer", "إرسال العرض")}</button>
      </>}>
      {form && <QuoteForm key={form.base?.priorRevision?.revision ?? "new"} lang={lang} base={form.base}
        register={(api) => { formApi.current = api; if (api.busy !== formBusy) setFormBusy(api.busy); }}
        onSaved={(ref) => { setForm(null); list.reload(); setRecord(ref.quoteId); setMessage(t("Quote saved.", "تم حفظ عرض السعر.")); }} onCancel={() => setForm(null)} />}
    </DetailDrawer>
  </div>;
}

function QuoteDrawerBody({ lang, quote, lookups, accepted, onChanged, goTo, canManage }: {
  lang: Locale; quote: QuoteRow; lookups: ReturnType<typeof buildLookups>; accepted: QuoteRow[]; onChanged: () => void; goTo: ReturnType<typeof useOffersNav>; canManage: boolean;
}) {
  const t = tr(lang);
  const isAccepted = quote.state === "accepted";
  const reservations = useLoader(async () => isAccepted ? (await reservationApi.list()).filter((row) => row.reservation?.acceptedQuote.quoteId === quote.ref.quoteId) : [], [] as ReservationRow[], (error) => commercialError(error, lang));
  const benefits = useLoader(async () => isAccepted ? (await benefitApi.list()).filter((row) => row.sourceQuote.quoteId === quote.ref.quoteId) : [], [] as BenefitEntitlement[], (error) => commercialError(error, lang));
  const [justAccepted, setJustAccepted] = useState(false);
  const [reserving, setReserving] = useState(false);
  return <div className="qo-stack qo-drawer-pad">
    <div className="qo-row"><StatusBadge status={isExpired(quote) ? "expired" : quote.state} lang={lang} domain="quote" />{!canManage && <ReadOnlyNote lang={lang} />}</div>
    <QuoteSummaryView lang={lang} quote={quote} lookups={lookups} />
    {canManage && !isAccepted && !justAccepted && <QuoteAcceptance lang={lang} quote={quote} onAccepted={() => { setJustAccepted(true); onChanged(); }} />}
    {justAccepted && <p role="status" className="qo-muted">{t("Accepted. Reload the list to continue with promotions.", "تم القبول. أعد تحميل القائمة لمتابعة العروض الترويجية.")}</p>}
    {isAccepted && <>
      <Collapsible title={t("Promotion and reservation", "العرض الترويجي والحجز")} count={reservations.data.length} defaultOpen={reservations.data.length > 0}>
        <div className="qo-stack">
          {reservations.data.length > 0 && <ul className="qo-history">{reservations.data.map((row) => <li key={row.id}>
            <RecordRef type="reservation" id={row.id} label={t("Reservation", "حجز")} mode="link" />
            <StatusBadge status={row.reservation?.status ?? "enquiry"} lang={lang} domain="reservation" label={row.reservation ? undefined : t("Enquiry", "استفسار")} />
          </li>)}</ul>}
          {reservations.data.length === 0 && !canManage && <p className="qo-muted">{t("No reservation for this quote.", "لا يوجد حجز لهذا العرض.")}</p>}
          {canManage && (reserving
            ? <ReserveOffer lang={lang} quote={quote} onReserved={(id) => { setReserving(false); reservations.reload(); goTo("reservations", id); }} />
            : <div><button type="button" className="btn" onClick={() => setReserving(true)}>{t("Check a promotion and reserve", "افحص عرضاً ترويجياً واحجز")}</button></div>)}
        </div>
      </Collapsible>
      <Collapsible title={t("Benefits", "المنافع")} count={benefits.data.length} defaultOpen={benefits.data.length > 0}>
        {benefits.loading && benefits.data.length === 0 ? <Skeleton rows={2} />
          : benefits.data.length === 0 ? <p className="qo-muted">{t("This quote has no benefits.", "لا توجد منافع لهذا العرض.")}</p>
          : <ul className="qo-history">{benefits.data.map((row) => <li key={row.id}><button type="button" className="record-ref" onClick={() => goTo("benefits", row.id)}><bdi className="record-ref-label">{benefitName(row.benefit, lang)}</bdi></button><StatusBadge status={row.status} lang={lang} domain="benefit" /></li>)}</ul>}
      </Collapsible>
      {/* Standalone qualification check kept for promotions that do not need a reservation. */}
      {canManage && <Collapsible title={t("Check promotion qualification", "فحص أهلية عرض ترويجي")}>
        <QualificationPanel lang={lang} quote={quote} acceptedQuotes={accepted} />
      </Collapsible>}
    </>}
  </div>;
}

export { QuoteWorkspace as Quotes };

type OffersTab = "quotes" | "reservations" | "benefits" | "promotions";

/** Tabbed Quotes & offers page (quote -> reservation -> benefit). The shell can mount this or the tab components. */
export function QuotesAndOffers({ lang }: { lang: Locale }) {
  const t = tr(lang);
  const canManage = useCanManageQuotes();
  const [tab, setTab] = useUrlState("tab", "quotes");
  const active: OffersTab = tab === "reservations" || tab === "benefits" || tab === "promotions" ? tab : "quotes";
  const [creating, setCreating] = useState(false);
  const [reserving, setReserving] = useState(false);
  const action = !canManage ? null
    : active === "quotes" ? <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />{t("Create quote", "إنشاء عرض سعر")}</button>
    : active === "reservations" ? <button type="button" className="btn btn-primary" onClick={() => setReserving(true)}><Plus size={16} aria-hidden="true" />{t("Reserve an offer", "احجز عرضاً")}</button>
    : null;
  return <div className="qo-page">
    <PageHeader title={t("Quotes & offers", "عروض الأسعار والعروض")}
      subtitle={t("From quote to reservation to benefits.", "من عرض السعر إلى الحجز ثم المنافع.")}
      meta={!canManage ? <ReadOnlyNote lang={lang} /> : undefined}
      actions={action}
      tabs={<TabBar ariaLabel={t("Quotes and offers", "عروض الأسعار والعروض")} idPrefix="offers" value={active} onChange={(id) => setTab(id)}
        tabs={[{ id: "quotes", label: t("Quotes", "عروض الأسعار") }, { id: "reservations", label: t("Reservations", "الحجوزات") }, { id: "benefits", label: t("Benefits", "المنافع") }, { id: "promotions", label: t("Promotions", "العروض الترويجية") }]} />} />
    <TabPanel idPrefix="offers" id="quotes" active={active === "quotes"}><QuoteWorkspace lang={lang} embedded creating={creating} onCreatingChange={setCreating} /></TabPanel>
    <TabPanel idPrefix="offers" id="reservations" active={active === "reservations"}><ReservationsPage lang={lang} embedded adding={reserving} onAddingChange={setReserving} /></TabPanel>
    <TabPanel idPrefix="offers" id="benefits" active={active === "benefits"}><BenefitsPage lang={lang} embedded /></TabPanel>
    <TabPanel idPrefix="offers" id="promotions" active={active === "promotions"}><PromotionsPage lang={lang} embedded /></TabPanel>
  </div>;
}

export default QuoteWorkspace;
