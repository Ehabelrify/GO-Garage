import { useMemo, useState, type ReactNode } from "react";
import { Globe, Lock, Phone } from "lucide-react";
import type { GarageState, Locale } from "@garage/domain";
import { Accordion, EmptyState, Money, RecordRef, StatusBadge, TabBar, type AccordionSection } from "../../shared/components";
import {
  buildTimeline, describeItem, sectionKeys, shortDate, telHref,
  type DescribeEnv, type Parsed360, type SectionKey, type SectionRow, type TimelineEntry,
} from "./customers-logic";
import "./customers.css";

const sectionTitles: Record<SectionKey, { en: string; ar: string; empty: { en: string; ar: string } }> = {
  quotes: { en: "Quotes", ar: "عروض الأسعار", empty: { en: "No quotes yet", ar: "لا توجد عروض أسعار" } },
  jobs: { en: "Jobs and repairs", ar: "أوامر الشغل والإصلاحات", empty: { en: "No jobs yet", ar: "لا توجد أوامر شغل" } },
  customRequests: { en: "Special requests", ar: "الطلبات الخاصة", empty: { en: "No special requests", ar: "لا توجد طلبات خاصة" } },
  bookings: { en: "Bookings and appointments", ar: "الحجوزات والمواعيد", empty: { en: "No bookings yet", ar: "لا توجد حجوزات" } },
  conversations: { en: "Chats", ar: "المحادثات", empty: { en: "No chats yet", ar: "لا توجد محادثات" } },
  warranties: { en: "Warranties", ar: "الضمانات", empty: { en: "No warranties yet", ar: "لا توجد ضمانات" } },
  claims: { en: "Claims", ar: "المطالبات", empty: { en: "No claims", ar: "لا توجد مطالبات" } },
  invoices: { en: "Invoices", ar: "الفواتير", empty: { en: "No invoices", ar: "لا توجد فواتير" } },
  reservations: { en: "Reservations", ar: "الحجوزات المؤجلة", empty: { en: "No reservations", ar: "لا توجد حجوزات مؤجلة" } },
  benefits: { en: "Benefits", ar: "المزايا", empty: { en: "No benefits", ar: "لا توجد مزايا" } },
  transport: { en: "Transport", ar: "النقل", empty: { en: "No transport requests", ar: "لا توجد طلبات نقل" } },
  purchases: { en: "Purchases", ar: "المشتريات", empty: { en: "No purchases recorded", ar: "لا توجد مشتريات مسجلة" } },
};

export function describeEnvFor(state: GarageState, lang: Locale, extra: Parsed360 | null = null): DescribeEnv {
  const plates = new Map<string, string>();
  for (const customer of state.customers) for (const vehicle of customer.vehicles) plates.set(vehicle.id, vehicle.plate);
  if (extra) {
    for (const vehicle of extra.vehicles) plates.set(vehicle.id, vehicle.plate);
    if (extra.vehicle) plates.set(extra.vehicle.id, extra.vehicle.plate);
  }
  return {
    lang,
    plateOf: (id) => plates.get(id),
    serviceName: (id) => {
      const service = state.services.find((item) => item.id === id);
      return service ? (lang === "ar" && service.nameAr ? service.nameAr : service.name) : undefined;
    },
    bookingServiceId: (id) => state.bookings.find((booking) => booking.id === id)?.serviceId,
  };
}

function ItemRow({ row, lang }: { row: SectionRow; lang: Locale }) {
  return <li className="cust-row">
    <span className="cust-row-main">
      {row.type ? <RecordRef type={row.type} id={row.id} label={row.label} subtitle={row.subtitle} badge={row.status} /> : <strong>{row.label}</strong>}
      {row.subtitle && <span className="cust-row-sub">{row.subtitle}</span>}
    </span>
    {row.links && row.links.length > 0 && <span className="cust-row-links">{row.links.map((link) => <RecordRef key={`${link.type}:${link.id}`} type={link.type} id={link.id} mode="link" />)}</span>}
    {row.amount && <Money minor={row.amount.minor} currency={row.amount.currency} lang={lang} />}
    {row.status && <StatusBadge status={row.status} lang={lang} domain={row.domain} />}
  </li>;
}

function SectionBody({ sectionKey, data, env, lang }: { sectionKey: SectionKey; data: Parsed360["sections"][SectionKey]; env: DescribeEnv; lang: Locale }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const copy = sectionTitles[sectionKey];
  if (data.restricted) return <p className="cust-locked"><Lock size={15} aria-hidden="true" />{t("Not available for your role", "غير متاح لصلاحيتك")}</p>;
  const rows = data.items.map((item) => describeItem(sectionKey, item, env)).filter((row): row is SectionRow => row !== null);
  if (rows.length === 0) return <p className="cust-muted">{data.unavailable ? t("Not available", "غير متاح") : lang === "ar" ? copy.empty.ar : copy.empty.en}</p>;
  return <>
    <ul className="cust-rows">{rows.map((row) => <ItemRow key={`${sectionKey}:${row.id}`} row={row} lang={lang} />)}</ul>
    {data.count > rows.length && <p className="cust-section-note">{t(`Showing latest ${rows.length} of ${data.count}`, `عرض آخر ${rows.length} من ${data.count}`)}</p>}
  </>;
}

/** Sections (default) or one merged timeline over everything the actor may see. */
export function SectionsView({ data, state, lang }: { data: Parsed360; state: GarageState; lang: Locale }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [view, setView] = useState("sections");
  const env = useMemo(() => describeEnvFor(state, lang, data), [state, lang, data]);
  const keys = sectionKeys.filter((key) => !(data.sections[key].unavailable && (key === "purchases" || key === "customRequests")));
  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = [];
    for (const key of keys) {
      for (const item of data.sections[key].items) {
        const row = describeItem(key, item, env);
        if (row) entries.push({ ...row, section: key });
      }
    }
    return buildTimeline(entries);
  }, [data, env, keys]);

  const sections: AccordionSection[] = keys.map((key) => ({
    id: key,
    title: lang === "ar" ? sectionTitles[key].ar : sectionTitles[key].en,
    count: data.sections[key].restricted ? undefined : data.sections[key].count,
    content: <SectionBody sectionKey={key} data={data.sections[key]} env={env} lang={lang} />,
  }));
  const defaultOpen = keys.filter((key) => data.sections[key].count > 0 && !data.sections[key].restricted).slice(0, 2);

  return <div>
    <div className="cust-view-tools">
      <TabBar ariaLabel={t("View", "العرض")} value={view} onChange={setView}
        tabs={[{ id: "sections", label: t("Sections", "الأقسام") }, { id: "timeline", label: t("Timeline", "الخط الزمني") }]} />
    </div>
    {view === "sections"
      ? <Accordion sections={sections} lang={lang} defaultOpenIds={defaultOpen} />
      : timeline.dated.length + timeline.undated.length === 0
        ? <EmptyState title={t("Nothing recorded yet", "لا توجد سجلات بعد")} />
        : <>
            <ol className="cust-timeline">
              {timeline.dated.map((entry) => <TimelineItem key={`${entry.section}:${entry.id}`} entry={entry} lang={lang} />)}
            </ol>
            {timeline.undated.length > 0 && <>
              <h3 className="form-section-title" style={{ marginBlockStart: 16 }}>{t("No date", "بدون تاريخ")}</h3>
              <ol className="cust-timeline">{timeline.undated.map((entry) => <TimelineItem key={`${entry.section}:${entry.id}`} entry={entry} lang={lang} />)}</ol>
            </>}
          </>}
  </div>;
}

function TimelineItem({ entry, lang }: { entry: TimelineEntry; lang: Locale }) {
  const type = lang === "ar" ? sectionTitles[entry.section].ar : sectionTitles[entry.section].en;
  return <li className="cust-timeline-item">
    <span className="cust-timeline-date">{shortDate(entry.date, lang) ?? "—"}</span>
    <span className="cust-timeline-type">{type}</span>
    {entry.type ? <RecordRef type={entry.type} id={entry.id} label={entry.label} subtitle={entry.subtitle} badge={entry.status} /> : <strong>{entry.label}</strong>}
    {entry.status && <StatusBadge status={entry.status} lang={lang} domain={entry.domain} />}
  </li>;
}

export function PlateChips({ vehicles, lang }: { vehicles: Array<{ id: string; plate: string; make?: string; model?: string }>; lang: Locale }) {
  if (vehicles.length === 0) return <span className="cust-muted">{lang === "ar" ? "لا توجد مركبات" : "No vehicles"}</span>;
  return <div className="plate-chips">{vehicles.map((vehicle) => <RecordRef key={vehicle.id} type="vehicle" id={vehicle.id} label={vehicle.plate} mode="link" />)}</div>;
}

export function Fact({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return <span className="cust-fact">{icon}{children}</span>;
}

export function ContactFacts({ phone, language, lang, consent }: { phone: string | null; language?: string; lang: Locale; consent?: string }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  return <p className="cust-facts">
    <Fact icon={<Phone size={15} aria-hidden="true" />}>{phone ? <a href={telHref(phone)} dir="ltr" className="mono">{phone}</a> : <span className="cust-muted">{t("Hidden", "مخفي")}</span>}</Fact>
    {language && <Fact icon={<Globe size={15} aria-hidden="true" />}>{language === "ar" ? t("Arabic", "العربية") : t("English", "الإنجليزية")}</Fact>}
    {consent && <Fact>{t("Messaging", "المراسلة")}: <StatusBadge status={["granted", "revoked", "expired", "missing"].includes(consent) ? consent : "unknown"} domain="consent" lang={lang} /></Fact>}
  </p>;
}
