import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, Check, FileText, Search, Settings2, ShieldAlert } from "lucide-react";
import { useGarageStore } from "../store";
import type { AuditEvent, BranchId, Decision, DecisionDraft } from "../types";
import {
  categoryNames, dateLabel, decisionCopy, decisionNames, EmptyState, PageHeading, SectionTitle, Status,
  valueLabel, type BranchPageProps, type Lang,
} from "../ui";

interface DecisionsPageProps extends BranchPageProps {}
interface DecisionCardProps {
  decision: Decision;
  lang: Lang;
  t: BranchPageProps["t"];
  branchName: BranchPageProps["branchName"];
  activeScope?: BranchId;
  setActiveScope: (scope: BranchId) => void;
  getDraft: (decision: Decision, scope: BranchId | "business") => DecisionDraft | undefined;
  onSave: (decision: Decision, scope: BranchId | "business", value: string, effectiveDate: string) => void;
  onApprove: (decision: Decision, scope: BranchId | "business") => void;
  onDiscard: (scope: BranchId | "business") => void;
  onPreview: (scope: BranchId | "business", value: string, effectiveDate: string) => void;
}

export function DecisionsPage({ lang, t, state, notify, branchName }: DecisionsPageProps) {
  const store = useGarageStore();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [preview, setPreview] = useState<{ decision: Decision; scopeKey: BranchId | "business"; value: string; effectiveDate: string } | null>(null);
  const [activeScope, setActiveScope] = useState<Record<string, BranchId>>({});
  const decisions = useMemo(
    () => state.decisions.filter((decision) =>
      (category === "all" || decision.category === category) &&
      `${decision.title} ${decision.question} ${decision.category}`.toLowerCase().includes(query.toLowerCase())),
    [state.decisions, category, query],
  );
  const categories = [...new Set(state.decisions.map((decision) => decision.category))];

  const exportSummary = () => {
    const rows = state.decisions.map((decision) => {
      const scopes: Array<BranchId | "business"> = decision.scope === "business" ? ["business"] : decision.branches ?? [];
      return scopes.map((scope) =>
        `${decision.category} | ${decision.title} | ${scope === "business" ? "Business-wide" : branchName(scope)} | Current: ${decision.valueByScope[scope] ?? "—"} | Effective: ${decision.effectiveDateByScope?.[scope] ?? "—"} | Status: ${decision.statusByScope[scope] ?? "proposed"} | Draft: ${store.getDraft(decision.id, scope)?.value ?? "—"} | Draft effective: ${store.getDraft(decision.id, scope)?.effectiveDate ?? "—"}`,
      ).join("\n");
    }).join("\n");
    const history = state.auditEvents.map((event) =>
      `${event.occurredAt} | ${event.action} | ${event.settingTitle} | ${event.previousValue} → ${event.newValue} | Effective: ${event.effectiveDate ?? "—"}`,
    ).join("\n");
    const text = `GARAGE OS — SAMPLE DECISION SUMMARY\nGo Stores · Egypt\nDemo only. This is not an owner policy approval.\nSample records are stored only on this device.\n\n${rows}\n\nHistory\n${history || "No history yet."}`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "garage-os-demo-decisions.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(t("Decision summary exported.", "تم تصدير ملخص القرارات."));
  };

  const getDraft = (decision: Decision, scope: BranchId | "business") => store.getDraft(decision.id, scope);
  const save = (decision: Decision, scope: BranchId | "business", value: string, effectiveDate: string) => {
    if (!value) return;
    const saved = store.saveDecisionDraft(decision.id, scope, value, effectiveDate);
    notify(saved
      ? t("Draft saved. It is not active policy.", "تم حفظ المسودة. لم تصبح سياسة فعالة.")
      : t("Could not save this draft. Choose one of the listed options.", "تعذر حفظ المسودة. اختر أحد الخيارات المعروضة."));
  };
  const approve = (decision: Decision, scope: BranchId | "business") => {
    notify(store.approveDecisionForDemo(decision.id, scope)
      ? t("Demo approval recorded locally. This is not a real owner approval.", "تم تسجيل الموافقة التجريبية محلياً. هذه ليست موافقة فعلية من المالك.")
      : t("Save a draft before demo approval.", "احفظ مسودة قبل الموافقة التجريبية."));
  };

  return <>
    <PageHeading eyebrow={t("Owner decision center", "مركز قرارات المالك")} title={t("Policies before they become rules", "السياسات قبل أن تصبح قواعد")} subtitle={t("Review a proposal, compare its impact, and save a local draft. Approval here is for this demo only.", "راجع المقترح وأثره واحفظ مسودة محلية. الموافقة هنا للعرض التجريبي فقط.")} action={<button className="btn" onClick={exportSummary}><ArrowDownToLine size={16} />{t("Export summary", "تصدير الملخص")}</button>} />
    <div className="warning-banner"><ShieldAlert size={17} /><div><strong>{t("A demo approval is not a real owner policy approval.", "الموافقة التجريبية ليست اعتماداً فعلياً لسياسة من المالك.")}</strong> {t("No change is sent to a live system. Drafts and history stay in local browser storage on this device.", "لا يتم إرسال أي تغيير إلى نظام فعلي. تبقى المسودات والسجل في التخزين المحلي لهذا المتصفح على هذا الجهاز.")}</div></div>
    <div className="toolbar"><div className="toolbar-start"><label className="search-wrap"><Search size={16} /><span className="sr-only">{t("Search decisions", "البحث في القرارات")}</span><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search proposals…", "ابحث في المقترحات…")} /></label><select className="filter-select" style={{ width: "auto" }} value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">{t("All categories", "كل الفئات")}</option>{categories.map((item) => <option key={item} value={item}>{lang === "ar" ? categoryNames[item]?.ar ?? item : item}</option>)}</select></div><span className="top-meta">{decisions.length} {t("proposals", "مقترحات")}</span></div>
    <div className="decision-list">
      {decisions.map((decision) => <DecisionCard
        key={decision.id}
        decision={decision}
        lang={lang}
        t={t}
        branchName={branchName}
        activeScope={activeScope[decision.id]}
        setActiveScope={(scope) => setActiveScope((previous) => ({ ...previous, [decision.id]: scope }))}
        getDraft={getDraft}
        onSave={save}
        onApprove={approve}
        onDiscard={(scope) => { store.discardDecisionDraft(decision.id, scope); notify(t("Draft discarded.", "تم تجاهل المسودة.")); }}
        onPreview={(scope, value, effectiveDate) => setPreview({ decision, scopeKey: scope, value, effectiveDate })}
      />)}
      {!decisions.length && <EmptyState title={t("No matching proposals", "لا توجد مقترحات مطابقة")} text={t("Try another search or category.", "جرّب بحثاً أو فئة أخرى.")} />}
    </div>
    <section className="panel section-gap">
      <SectionTitle title={t("Decision history", "سجل القرارات")} description={t("Local demo actions only; no external policy system is connected.", "إجراءات تجريبية محلية فقط؛ لا يوجد اتصال بنظام سياسات خارجي.")} />
      {state.auditEvents.length
        ? <div className="history-list">{state.auditEvents.map((event: AuditEvent) => <div className="history-item" key={event.id}><div className="history-date">{new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurredAt))}</div><div className="history-event"><strong>{event.settingTitle}</strong> · {event.scopeLabel}<br /><span>{event.action === "draft-saved" ? t("Draft saved", "حُفظت مسودة") : t("Demo-approved", "موافقة تجريبية")} — {event.previousValue || "—"} → {event.newValue}</span>{event.effectiveDate && <div className="form-hint">{t("Effective date:", "تاريخ السريان:")} {dateLabel(event.effectiveDate, lang)}</div>}</div></div>)}</div>
        : <EmptyState title={t("No changes recorded", "لم يتم تسجيل تغييرات")} text={t("Saved drafts and demo approvals will appear here.", "ستظهر المسودات المحفوظة والموافقات التجريبية هنا.")} />}
    </section>
    {preview && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}><section className="modal" role="dialog" aria-modal="true">
      <div className="eyebrow">{t("Change preview", "معاينة التغيير")}</div><h2>{lang === "ar" ? decisionNames[preview.decision.id]?.ar ?? preview.decision.title : decisionNames[preview.decision.id]?.en ?? preview.decision.title}</h2>
      <p>{t("This preview compares the current sample value with your proposed draft. Nothing is published to a live system.", "تقارن هذه المعاينة القيمة التجريبية الحالية بالمسودة المقترحة. لا يتم نشر أي شيء إلى نظام فعلي.")}</p>
      <div className="branch-row"><div>{t("Current value", "القيمة الحالية")}</div><strong>{valueLabel(preview.decision, preview.decision.valueByScope[preview.scopeKey] ?? "", lang)}</strong></div>
      <div className="branch-row"><div>{t("Draft value", "قيمة المسودة")}</div><strong>{valueLabel(preview.decision, preview.value, lang)}</strong></div>
      <div className="branch-row"><div>{t("Draft effective date", "تاريخ سريان المسودة")}</div><strong>{preview.effectiveDate ? dateLabel(preview.effectiveDate, lang) : t("Not set", "غير محدد")}</strong></div>
      <div className="impact">{lang === "ar" ? decisionCopy[preview.decision.id]?.impact ?? preview.decision.impact : preview.decision.impact}</div>
      <div className="modal-actions"><button className="btn" onClick={() => setPreview(null)}>{t("Close preview", "إغلاق المعاينة")}</button></div>
    </section></div>}
  </>;
}

function DecisionCard({ decision, lang, t, branchName, activeScope, setActiveScope, getDraft, onSave, onApprove, onDiscard, onPreview }: DecisionCardProps) {
  const scopes: Array<BranchId | "business"> = decision.scope === "business" ? ["business"] : decision.branches ?? [];
  const scope: BranchId | "business" = decision.scope === "business"
    ? "business"
    : activeScope && scopes.includes(activeScope) ? activeScope : scopes[0];
  const savedDraft = getDraft(decision, scope);
  const [selected, setSelected] = useState(savedDraft?.value ?? decision.valueByScope[scope] ?? "");
  const [effectiveDate, setEffectiveDate] = useState(savedDraft?.effectiveDate ?? decision.effectiveDateByScope?.[scope] ?? "");
  useEffect(() => {
    setSelected(savedDraft?.value ?? decision.valueByScope[scope] ?? "");
    setEffectiveDate(savedDraft?.effectiveDate ?? decision.effectiveDateByScope?.[scope] ?? "");
  }, [scope, savedDraft?.value, savedDraft?.effectiveDate, decision.valueByScope[scope], decision.effectiveDateByScope?.[scope]]);
  const title = lang === "ar" ? decisionNames[decision.id]?.ar ?? decision.title : decisionNames[decision.id]?.en ?? decision.title;
  const scopeName = scope === "business" ? t("Business-wide", "على مستوى الشركة") : branchName(scope);
  const option = decision.options.find((item) => item.value === selected);

  return <article className="decision-card">
    <div className="decision-top"><div><div className="eyebrow">{lang === "ar" ? categoryNames[decision.category]?.ar ?? decision.category : decision.category}</div><h2 className="decision-title">{title}</h2><div className="decision-question">{lang === "ar" ? decisionCopy[decision.id]?.question ?? decision.question : decision.question}</div></div><Status status={decision.statusByScope[scope] ?? "proposed"} lang={lang} /></div>
    <div className="decision-meta"><span className="tag"><Settings2 size={12} />{scopeName}</span><span className="tag"><FileText size={12} />{t("Version", "الإصدار")} {decision.versionByScope[scope] ?? 1}</span>{decision.ownerDecision && <span className="tag">{t("Owner decision", "قرار المالك")}</span>}</div>
    <div className="current-line"><span>{t("Current sample value:", "القيمة التجريبية الحالية:")}</span><strong>{valueLabel(decision, decision.valueByScope[scope] ?? "", lang)}</strong>{savedDraft && <><span>·</span><span>{t("Draft saved", "مسودة محفوظة")}</span></>}</div>
    <div className="form-hint">{t("Current effective date:", "تاريخ السريان الحالي:")} {decision.effectiveDateByScope?.[scope] ? dateLabel(decision.effectiveDateByScope[scope]!, lang) : t("Not set", "غير محدد")}</div>
    <div className="impact"><strong>{t("Operational impact: ", "الأثر التشغيلي: ")}</strong>{lang === "ar" ? decisionCopy[decision.id]?.impact ?? decision.impact : decision.impact}</div>
    <div className="decision-controls">
      {decision.scope === "branch" && <div><label className="field-label">{t("Branch scope", "نطاق الفرع")}</label><select className="field-select" value={scope} onChange={(event) => setActiveScope(event.target.value as BranchId)}>{scopes.map((id) => <option key={id} value={id}>{branchName(id as BranchId)}</option>)}</select></div>}
      <div><label className="field-label" htmlFor={`choice-${decision.id}`}>{t("Proposed value", "القيمة المقترحة")}</label><select id={`choice-${decision.id}`} className="field-select" value={selected} onChange={(event) => setSelected(event.target.value)}>{decision.options.map((item) => <option key={item.value} value={item.value}>{valueLabel(decision, item.value, lang)}</option>)}</select></div>
      <div><label className="field-label" htmlFor={`effective-${decision.id}`}>{t("Effective date", "تاريخ السريان")}</label><input id={`effective-${decision.id}`} className="field-input" type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></div>
    </div>
    {option?.explanation && <div className="form-hint">{lang === "ar" ? decisionCopy[decision.id]?.options[selected] ?? option.explanation : option.explanation}</div>}
    <div className="action-row" style={{ marginTop: 13 }}>
      <button className="btn btn-sm" onClick={() => onSave(decision, scope, selected, effectiveDate)}><Check size={14} />{t("Save draft", "حفظ المسودة")}</button>
      <button className="btn btn-sm" onClick={() => onPreview(scope, selected, effectiveDate)}>{t("Preview", "معاينة")}</button>
      {savedDraft && <><button className="btn btn-sm btn-primary" onClick={() => onApprove(decision, scope)}>{t("Approve for demo", "موافقة تجريبية")}</button><button className="btn btn-sm btn-quiet" onClick={() => onDiscard(scope)}>{t("Discard draft", "تجاهل المسودة")}</button></>}
    </div>
  </article>;
}
