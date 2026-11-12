import { useMemo, useState } from "react";
import { CircleHelp, History, RotateCcw, Save, ShieldCheck } from "lucide-react";
import type { BranchId } from "../types";
import { useGarageStore } from "../store";
import { categoryNames, decisionCopy, decisionNames, EmptyState, PageHeading, SectionTitle, valueLabel, type BranchPageProps } from "../ui";

const settingDescriptions: Record<string, { question: string; impact: string }> = {
  "booking-confirmation": {
    question: "Choose who confirms a booking after capacity is checked.",
    impact: "Controls whether a fitting booking is confirmed immediately or waits for staff review.",
  },
  "daily-dropoff-limit": {
    question: "Set the maximum number of vehicle drop-offs for this branch each day.",
    impact: "Limits daily intake independently of the available bay hours.",
  },
  "branch-working-hours": {
    question: "Set the daily operating hours used in the capacity calculation.",
    impact: "Sets the bay-hour budget used when checking booking availability.",
  },
  "clean-bays": {
    question: "Set the number of clean bays available at this branch.",
    impact: "Used by clean-bay services such as ceramic coating and full paint protection.",
  },
  "general-bays": {
    question: "Set the number of general-purpose bays available at this branch.",
    impact: "Used by inspection, tint, audio, and other general-bay services.",
  },
  "weekly-day-off": {
    question: "Choose the weekday when this branch does not accept bookings.",
    impact: "Bookings on the selected day are rejected before capacity is reserved.",
  },
  "tint-hours": {
    question: "Set the bay hours required for a window-tint booking.",
    impact: "Changes how much general-bay capacity a tint booking uses.",
  },
  "ceramic-hours": {
    question: "Set the bay hours required for a ceramic-coating booking.",
    impact: "Changes how much clean-bay capacity a ceramic booking uses.",
  },
};

const activeSettingIds = new Set([
  "booking-confirmation",
  "daily-dropoff-limit",
  "branch-working-hours",
  "clean-bays",
  "general-bays",
  "weekly-day-off",
  "tint-hours",
  "ceramic-hours",
]);

const holdItems = [
  { en: "Branch sharing", ar: "مشاركة الموارد بين الفروع" },
  { en: "Intake photo requirements", ar: "الصور المطلوبة وقت الاستلام" },
  { en: "Automated technician assignment", ar: "توزيع الشغل على الفنيين تلقائياً" },
  { en: "Custom job stages", ar: "مراحل شغل مخصصة" },
  { en: "Customer status messaging", ar: "رسائل تحديث حالة العميل" },
  { en: "WhatsApp live connection", ar: "ربط واتساب الفعلي" },
  { en: "Inventory", ar: "المخزون" },
  { en: "Payments", ar: "المدفوعات" },
];

export function SettingsPage({ lang, t, state, notify, branchName }: BranchPageProps) {
  const store = useGarageStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const allSettings = useMemo(
    () => state.decisions.filter((item) => activeSettingIds.has(item.id)),
    [state.decisions],
  );
  const dirtyEntries = Object.entries(drafts);
  const scopesFor = (setting: (typeof allSettings)[number]) => setting.scope === "business"
    ? ["business" as const]
    : (setting.branches ?? []).filter((scope) => state.branches.some((branch) => branch.id === scope));
  const getDraftKey = (settingId: string, scopeKey: string) => `${settingId}:${scopeKey}`;
  const shownValue = (setting: (typeof allSettings)[number], scopeKey: string) =>
    drafts[getDraftKey(setting.id, scopeKey)] ?? setting.valueByScope[scopeKey as BranchId | "business"] ?? "";
  const change = (settingId: string, scopeKey: string, value: string) => {
    setDrafts((current) => ({ ...current, [getDraftKey(settingId, scopeKey)]: value }));
    setSaveError("");
  };

  const discardChanges = () => {
    setDrafts({});
    setSaveError("");
  };

  const saveChanges = async () => {
    if (!dirtyEntries.length || saving) return;
    setSaving(true);
    setSaveError("");
    let completed = 0;
    for (const [key, value] of dirtyEntries) {
      const divider = key.lastIndexOf(":");
      const settingId = key.slice(0, divider);
      const scopeKey = key.slice(divider + 1) as BranchId | "business";
      const result = await store.updateSetting(settingId, scopeKey, value);
      if (!result.ok) {
        setSaveError(result.error === "SETTING_ON_HOLD"
          ? t("This setting is not active yet.", "الإعداد ده لسه مش شغّال.")
          : t("A setting could not be saved. Review access and try again.", "ماقدرناش نحفظ أحد الإعدادات. راجع صلاحيتك وجرّب تاني."));
        break;
      }
      completed += 1;
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
    setSaving(false);
    if (completed && completed === dirtyEntries.length) {
      notify(t("Operating settings saved and applied.", "إعدادات التشغيل اتحفظت واتطبقت."));
    }
  };

  const settingTitle = (settingId: string, fallback: string) =>
    lang === "ar" ? decisionNames[settingId]?.ar ?? fallback : decisionNames[settingId]?.en ?? fallback;

  return <>
    <PageHeading
      eyebrow={t("Owner account · Configuration", "حساب المالك · الإعدادات")}
      title={t("Operating settings", "إعدادات التشغيل")}
      subtitle={t(
        "Update the rules used by booking and workshop workflows. Saved changes take effect immediately and appear in the settings history.",
        "غيّر القواعد اللي بتستخدمها الحجوزات والورشة. التغييرات بتتطبق أول ما تحفظها وبتظهر في سجل الإعدادات.",
      )}
    />

    <section className="settings-summary">
      <div className="settings-summary-icon"><ShieldCheck size={19} /></div>
      <div><strong>{t("Owner-controlled and enforced", "المالك هو اللي بيتحكم فيها")}</strong>
        <p>{t("Only the Owner can change these values. The server checks access and applies capacity rules before confirming bookings.", "المالك بس يقدر يغيّر القيم دي. النظام بيتأكد من الصلاحية وبيطبق قواعد السعة قبل ما يأكد أي حجز.")}</p>
      </div>
      <span className="settings-live-tag"><span />{t("Active", "شغّالة")}</span>
    </section>

    <div className="settings-toolbar">
      <div><span className="eyebrow">{t("Current configuration", "الإعدادات الحالية")}</span><strong>{allSettings.length} {t("enforced settings", "إعدادات شغّالة")}</strong></div>
      <span className="top-meta"><History size={14} />{t("Saved changes are audited", "التغييرات المحفوظة بتتسجل")}</span>
    </div>

    <div className="settings-list">
      {allSettings.map((setting) => {
        const scopes = scopesFor(setting);
        return <article className="setting-card" key={setting.id}>
          <div className="setting-card-heading">
            <div>
              <div className="eyebrow">{lang === "ar" ? categoryNames[setting.category]?.ar ?? setting.category : setting.category}</div>
              <h2>{settingTitle(setting.id, setting.title)}</h2>
               <p>{lang === "ar" ? decisionCopy[setting.id]?.question ?? setting.question : settingDescriptions[setting.id]?.question ?? setting.question}</p>
            </div>
            <span className="setting-version">{t("Version", "الإصدار")} {Math.max(1, ...scopes.map((scope) => setting.versionByScope[scope] ?? 1))}</span>
          </div>
          <div className={`setting-values ${setting.scope === "business" ? "single" : ""}`}>
            {scopes.map((scope) => {
              const scopeName = scope === "business"
                ? t("Business-wide", "على مستوى الشركة كلها")
                : branchName(scope);
              const label = settingTitle(setting.id, setting.title);
              const currentValue = shownValue(setting, scope);
              return <label className="setting-field" key={scope}>
                <span className="setting-field-title">{scopeName}</span>
                <select
                  className="field-select"
                  aria-label={`${label} — ${scopeName}`}
                  value={currentValue}
                  onChange={(event) => change(setting.id, scope, event.target.value)}
                  disabled={saving}
                >
                  {setting.options.map((option) => <option key={option.value} value={option.value}>
                    {valueLabel(setting, option.value, lang)}
                  </option>)}
                </select>
                <span className="setting-current">
                  {t("Current", "الحالي")}: <strong>{valueLabel(setting, setting.valueByScope[scope as BranchId | "business"] ?? "", lang)}</strong>
                </span>
              </label>;
            })}
          </div>
          <div className="setting-card-foot"><CircleHelp size={14} /><span>{lang === "ar" ? decisionCopy[setting.id]?.impact ?? setting.impact : settingDescriptions[setting.id]?.impact ?? setting.impact}</span></div>
        </article>;
      })}
      {!allSettings.length && <EmptyState title={t("No operating settings are configured", "لسه مافيش إعدادات تشغيل")} text={t("The workspace owner can initialize the branch setup before using booking rules.", "المالك يقدر يجهز الفروع قبل استخدام قواعد الحجز.")} />}
    </div>

    <section className="panel section-gap">
      <SectionTitle
        title={t("On hold", "لسه مش متاح")}
        description={t("Live WhatsApp connection remains on hold; the separate labelled simulator is available for review. Other listed areas have no active controls yet.", "ربط واتساب الفعلي لسه موقوف؛ تقدر تراجع المحاكاة المنفصلة. باقي الأقسام دي لسه مافيهاش أدوات شغالة.")}
      />
      <div className="hold-grid">
        {holdItems.map((item) => <div className="hold-card" key={item.en}>
          <span className="hold-dot" /><strong>{t(item.en, item.ar)}</strong><span className="hold-badge">ON HOLD</span>
        </div>)}
      </div>
    </section>

    <section className="panel section-gap">
      <SectionTitle
        title={t("Settings history", "سجل الإعدادات")}
        description={t("Each saved update records the previous value, new value, scope, and time.", "كل تغيير محفوظ بيسجل القيمة القديمة والجديدة والنطاق والوقت.")}
      />
      {state.auditEvents.length
        ? <div className="history-list">{state.auditEvents.map((event) => <div className="history-item" key={event.id}>
            <div className="history-date">{new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurredAt))}</div>
            <div className="history-event"><strong>{settingTitle(event.settingTitle, event.settingTitle)}</strong> · {event.scopeLabel === "business" ? t("Business-wide", "على مستوى الشركة") : branchName(event.scopeLabel as BranchId)}<br />
            <span>{event.previousValue || "—"} → {event.newValue}</span>
          </div>
        </div>)}</div>
        : <EmptyState title={t("No settings changes yet", "لسه مافيش تغييرات")} text={t("Saved updates will appear here.", "التغييرات المحفوظة هتظهر هنا.")} />}
    </section>

    {dirtyEntries.length > 0 && <div className="settings-savebar" role="region" aria-label={t("Unsaved settings", "إعدادات لسه ماتحفظتش")}>
      <div><strong>{dirtyEntries.length} {t("unsaved changes", "تغييرات غير محفوظة")}</strong>
        <span>{saveError || t("Changes apply when you save.", "التغييرات هتتطبق لما تحفظها.")}</span>
      </div>
      <div className="settings-save-actions">
        <button className="btn" type="button" onClick={discardChanges} disabled={saving}><RotateCcw size={15} />{t("Discard", "الغِ التغييرات")}</button>
        <button className="btn btn-primary" type="button" onClick={() => void saveChanges()} disabled={saving}>
          <Save size={15} />{saving ? t("Saving…", "بنحفظ…") : t("Save settings", "احفظ الإعدادات")}
        </button>
      </div>
    </div>}
  </>;
}
