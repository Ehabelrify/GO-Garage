import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { Locale, QuoteVersionRef } from "@garage/domain";
import { useGarageStore } from "../../shared/store";
import { Amount, DataTable, DateText, DetailDrawer, EmptyState, Field, FilterBar, Notice, PageHeader, Skeleton, StatusBadge, type Column } from "../../shared/components";
import { ReadOnlyNote, useCanManageQuotes } from "../quotes/access";
import { commercialError } from "../quotes/commercial-errors";
import { loadAcceptedQuotes, loadPromotions, useLoader, type PromotionInfo } from "../quotes/commercial-data";
import { buildLookups, tr } from "../quotes/lookups";
import { QuotePicker, type AcceptedChoice } from "../quotes/pickers";
import { QualificationPanel } from "./QualificationPanel";
import { evidenceText, filterPromotions, promotionOrder, promotionValue, validityState, valueNote, vehiclesText, type Validity } from "./promotion-logic";
import "../quotes/commercial.css";

const validityStatus: Record<Validity, { status: string; en: string; ar: string }> = {
  active: { status: "active", en: "Active", ar: "ساري" },
  "ending-soon": { status: "review-required", en: "Ending soon", ar: "ينتهي قريباً" },
  upcoming: { status: "unconfigured", en: "Starts soon", ar: "يبدأ قريباً" },
  ended: { status: "cancelled", en: "Ended", ar: "منتهي" },
};

/** Promotions tab of Quotes & offers: the active promotions with their value, validity and a guided qualification check. */
export function PromotionsPage({ lang, embedded = false }: { lang: Locale; embedded?: boolean }) {
  const t = tr(lang);
  const store = useGarageStore();
  const canManage = useCanManageQuotes();
  const lookups = useMemo(() => buildLookups(store.state, lang), [store.state, lang]);
  const list = useLoader(() => loadPromotions(lang), [] as PromotionInfo[], (error) => commercialError(error, lang));
  const [query, setQuery] = useState("");
  const [checking, setChecking] = useState<PromotionInfo | null>(null);
  const [picked, setPicked] = useState<QuoteVersionRef[]>([]);
  const accepted = useLoader(async () => (checking ? await loadAcceptedQuotes() : []), [] as AcceptedChoice[], (error) => commercialError(error, lang));
  const rows = list.data;
  const shown = useMemo(() => promotionOrder(filterPromotions(rows, query, lang), lang), [rows, query, lang]);
  const clear = () => setQuery("");
  const quote = accepted.data.find((item) => picked.some((ref) => ref.quoteId === item.ref.quoteId && ref.revision === item.ref.revision)) ?? null;
  const close = () => { setChecking(null); setPicked([]); };

  const columns: Column<PromotionInfo>[] = [
    { key: "name", header: t("Promotion", "العرض الترويجي"), primary: true, sortable: true, sortValue: (row) => row.name, render: (row) => <span>
      <strong>{row.name}</strong>
      {row.rule && <span className="qo-promo-rule" style={{ display: "block" }}>{row.rule[lang] || row.rule.en}</span>}
    </span> },
    { key: "value", header: t("Value", "القيمة"), numeric: true, sortable: true, sortValue: (row) => (row.perVehicle ?? row.discount)?.minor ?? null, render: (row) => {
      const value = promotionValue(row);
      return value.kind === "package"
        ? <span className="qo-muted">{valueNote(value, lang)}</span>
        : <span><Amount minor={value.amount.minor} currency={value.amount.currency} lang={lang} /><span className="qo-cell-sub">{valueNote(value, lang)}</span></span>;
    } },
    { key: "vehicles", header: t("Vehicles", "المركبات"), render: (row) => vehiclesText(row, lang) },
    { key: "proof", header: t("Proof needed", "الإثبات المطلوب"), render: (row) => evidenceText(row.evidenceKinds, lang) || "—" },
    { key: "units", header: t("Limit", "الحد"), numeric: true, sortable: true, sortValue: (row) => row.maximumUnits, render: (row) => row.maximumUnits === null ? "—" : <bdi dir="ltr">{row.maximumUnits}</bdi> },
    { key: "valid", header: t("Valid", "الصلاحية"), sortable: true, sortValue: (row) => row.validUntil ?? "9999-12-31", render: (row) => {
      if (!row.validFrom && !row.validUntil) return <span className="qo-muted">{t("No end date", "بدون تاريخ انتهاء")}</span>;
      return <span>{row.validFrom && <><DateText value={row.validFrom} lang={lang} /> {t("to", "إلى")} </>}{row.validUntil ? <DateText value={row.validUntil} lang={lang} /> : t("open", "مفتوح")}</span>;
    } },
    { key: "status", header: t("Status", "الحالة"), sortable: true, sortValue: (row) => validityState(row), render: (row) => {
      const state = validityStatus[validityState(row)];
      return <StatusBadge status={state.status} lang={lang} domain="benefit" label={lang === "ar" ? state.ar : state.en} />;
    } },
    ...(canManage ? [{ key: "action", header: t("Action", "إجراء"), hideOnCard: false, render: (row: PromotionInfo) => validityState(row) === "ended" || validityState(row) === "upcoming"
      ? <span className="qo-muted">—</span>
      : <button type="button" className="btn btn-sm" onClick={() => { setPicked([]); setChecking(row); }}><ShieldCheck size={14} aria-hidden="true" />{t("Check qualification", "فحص الأهلية")}</button> } satisfies Column<PromotionInfo>] : []),
  ];

  return <div className="qo-page">
    {!embedded && <PageHeader title={t("Promotions", "العروض الترويجية")} subtitle={t("Active promotions and who qualifies.", "العروض الجارية ومن يستحقها.")} meta={!canManage ? <ReadOnlyNote lang={lang} /> : undefined} />}
    <Notice tone="info">{t("These are advertised examples, not approved policy. Terms are confirmed by the Owner.", "هذه عروض معلنة كأمثلة وليست سياسة معتمدة. يؤكد المالك الشروط.")}</Notice>
    <FilterBar lang={lang} search={{ value: query, onChange: setQuery, placeholder: t("Search promotions", "ابحث في العروض") }} onClear={clear} resultCount={shown.length} />
    <DataTable<PromotionInfo> columns={columns} rows={shown} rowKey={(row) => `${row.ref.id}:${row.ref.version}`} lang={lang} caption={t("Promotions", "العروض الترويجية")}
      loading={list.loading && rows.length === 0} error={list.error} onRetry={list.reload}
      empty={rows.length === 0
        ? <EmptyState title={t("No active promotions", "لا توجد عروض ترويجية جارية")} text={t("An approved promotion rule is needed. Ask the Owner.", "يلزم قاعدة عرض معتمدة. اطلب من المالك.")} />
        : <EmptyState variant="no-results" title={t("No matching promotions", "لا توجد عروض مطابقة")} action={<button type="button" className="btn" onClick={clear}>{t("Clear filters", "مسح التصفية")}</button>} />} />

    <DetailDrawer open={canManage && checking !== null} onClose={close} lang={lang} wide
      title={checking ? checking.name : t("Promotion", "عرض ترويجي")} subtitle={t("Check qualification", "فحص الأهلية")}>
      {checking && <div className="qo-stack qo-drawer-pad">
        {checking.rule && <p className="qo-note">{checking.rule[lang] || checking.rule.en}</p>}
        {accepted.loading && accepted.data.length === 0 ? <Skeleton rows={3} label={t("Loading", "جارٍ التحميل")} />
          : accepted.error ? <EmptyState variant="error" title={t("Could not load quotes", "تعذر تحميل العروض")} text={accepted.error} action={<button type="button" className="btn" onClick={accepted.reload}>{t("Retry", "إعادة المحاولة")}</button>} />
          : <>
              <Field label={t("Accepted quote", "العرض المقبول")} required full><QuotePicker lang={lang} quotes={accepted.data} lookups={lookups} selected={picked} onChange={setPicked} /></Field>
              {quote && <QualificationPanel key={`${checking.ref.id}:${quote.ref.quoteId}:${quote.ref.revision}`} lang={lang} quote={quote} acceptedQuotes={accepted.data} fixedPromotion={checking} />}
            </>}
      </div>}
    </DetailDrawer>
  </div>;
}

export default PromotionsPage;
