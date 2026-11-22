import { lazy, Suspense, useMemo, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import type { BranchId } from "@garage/domain";
import { unknownWriteOutcomeCopy, useGarageStore } from "../../shared/store";
import { decisionNames, valueLabel, type BranchPageProps } from "../../shared/ui";
import {
  Collapsible, DataTable, EmptyState, PageHeader, Select, Skeleton, TabBar, TabPanel, useUrlState,
} from "../../shared/components";
import { AvailabilityEditor } from "./AvailabilityEditor";
import { CommercialPolicyEditor } from "./CommercialPolicyEditor";
import { buildPolicyCatalog, policyGroupLabels, policyLabel, type PolicyGroup } from "./policy-catalog";
import { fmtDateTime, isOperatingRule } from "./settings-format";
import "./settings.css";

const PolicyManager = lazy(() => import("../warranty/PolicyManager").then((m) => ({ default: m.PolicyManager })));
const StaffPage = lazy(() => import("../staff/StaffPage").then((m) => ({ default: m.StaffPage })));

const ruleHelp: Record<string, { en: string; ar: string }> = {
  "booking-confirmation": { en: "Who confirms a booking once capacity is checked.", ar: "مين بيأكد الحجز بعد فحص السعة." },
  "tint-hours": { en: "Bay hours a window-tint booking uses.", ar: "ساعات الباي التي يستهلكها حجز التظليل." },
  "ceramic-hours": { en: "Bay hours a ceramic-coating booking uses.", ar: "ساعات الباي التي يستهلكها حجز السيراميك." },
};

const roadmap = [
  { en: "Branch sharing", ar: "مشاركة الموارد بين الفروع" },
  { en: "Intake photo requirements", ar: "الصور المطلوبة وقت الاستلام" },
  { en: "Automated technician assignment", ar: "توزيع الشغل على الفنيين تلقائياً" },
  { en: "Custom job stages", ar: "مراحل شغل مخصصة" },
  { en: "Customer status messaging", ar: "رسائل تحديث حالة العميل" },
  { en: "WhatsApp live connection", ar: "ربط واتساب الفعلي" },
  { en: "Inventory", ar: "المخزون" },
  { en: "Payments", ar: "المدفوعات" },
];

type HistoryRow = { id: string; occurredAt: string; setting: string; scope: string; change: string };

export function SettingsPage({ lang, t, state, notify, branchName }: BranchPageProps) {
  const store = useGarageStore();
  const isOwner = store.actor?.role === "owner";
  const [tab, setTab] = useUrlState("tab", "general");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [policyId, setPolicyId] = useState("quote-acceptance:default");

  const rules = useMemo(() => state.decisions.filter((item) => isOperatingRule(item.id)), [state.decisions]);
  const dirtyEntries = Object.entries(drafts);
  const scopesFor = (setting: (typeof rules)[number]) => setting.scope === "business"
    ? ["business" as const]
    : (setting.branches ?? []).filter((scope) => state.branches.some((branch) => branch.id === scope));
  const draftKey = (settingId: string, scopeKey: string) => `${settingId}:${scopeKey}`;
  const settingTitle = (settingId: string, fallback: string) => decisionNames[settingId]?.[lang] ?? fallback;
  const scopeName = (scope: string) => scope === "business" ? t("Business-wide", "على مستوى الشركة") : branchName(scope);

  const saveChanges = async () => {
    if (!dirtyEntries.length || saving) return;
    setSaving(true);
    setSaveError("");
    let completed = 0;
    for (const [key, value] of dirtyEntries) {
      const divider = key.lastIndexOf(":");
      const result = await store.updateSetting(key.slice(0, divider), key.slice(divider + 1) as BranchId | "business", value);
      if (!result.ok) {
        setSaveError(unknownWriteOutcomeCopy(result.error, lang) ?? (result.error === "SETTING_ON_HOLD"
          ? t("This setting is not active yet.", "هذا الإعداد غير مفعّل بعد.")
          : t("A setting could not be saved. Review access and try again.", "تعذر حفظ أحد الإعدادات. راجع صلاحياتك وحاول مرة أخرى.")));
        break;
      }
      completed += 1;
      setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
    }
    setSaving(false);
    if (completed && completed === dirtyEntries.length) notify(t("Settings saved.", "اتحفظت الإعدادات."));
  };

  const history: HistoryRow[] = useMemo(() => state.auditEvents.map((event) => ({
    id: event.id,
    occurredAt: event.occurredAt,
    setting: settingTitle(event.settingTitle, event.settingTitle),
    scope: event.scopeLabel === "business" ? t("Business-wide", "على مستوى الشركة") : branchName(event.scopeLabel),
    change: `${event.previousValue || "—"} → ${event.newValue}`,
  })), [state.auditEvents, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const catalog = useMemo(() => buildPolicyCatalog(state.branches.map((branch) => branch.id)), [state.branches]);
  const selectedPolicy = catalog.find((entry) => entry.id === policyId) ?? catalog[0];
  const policyName = (entry: (typeof catalog)[number]) => policyLabel(entry, lang, branchName);

  const tabs = [
    { id: "general", label: t("General", "عام") },
    { id: "hours", label: t("Hours & capacity", "المواعيد والسعة") },
    { id: "policies", label: t("Policies", "السياسات"), hidden: !isOwner },
    { id: "warranty", label: t("Warranty", "الضمان"), hidden: !isOwner },
    { id: "access", label: t("Staff & permissions", "الفريق والصلاحيات"), hidden: !isOwner },
  ];
  const activeTab = tabs.some((item) => item.id === tab && !item.hidden) ? tab : "general";
  const prefix = "settings";

  return <>
    <PageHeader title={t("Settings", "الإعدادات")} subtitle={t("Owner-only rules. Changes apply immediately and are logged.", "قواعد للمالك فقط. التغييرات بتتطبق فوراً وبتتسجل.")}
      tabs={<TabBar tabs={tabs} value={activeTab} onChange={setTab} ariaLabel={t("Settings sections", "أقسام الإعدادات")} idPrefix={prefix} />} />

    <TabPanel idPrefix={prefix} id="general" active={activeTab === "general"}>
      <section className="panel" aria-label={t("Operating rules", "قواعد التشغيل")}>
        {rules.length === 0
          ? <EmptyState title={t("No operating rules", "لا توجد قواعد تشغيل")} />
          : rules.map((setting) => {
            const help = ruleHelp[setting.id];
            return <div className="st-rule-row" key={setting.id}>
              <div>
                <div className="st-rule-title">{settingTitle(setting.id, setting.title)}</div>
                {help && <p className="st-rule-help">{help[lang]}</p>}
              </div>
              <div className="st-rule-scopes">
                {scopesFor(setting).map((scope) => {
                  const key = draftKey(setting.id, scope);
                  const current = setting.valueByScope[scope as BranchId | "business"] ?? "";
                  return <label key={scope}>
                    {setting.scope !== "business" && <span className="st-scope">{scopeName(scope)}</span>}
                    <Select
                      label={`${settingTitle(setting.id, setting.title)} — ${scopeName(scope)}`}
                      data-dirty={key in drafts ? "true" : "false"}
                      value={drafts[key] ?? current}
                      disabled={saving}
                      options={setting.options.map((option) => ({ value: option.value, label: valueLabel(setting, option.value, lang) }))}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSaveError("");
                        setDrafts((existing) => {
                          const next = { ...existing };
                          if (value === current) delete next[key]; else next[key] = value;
                          return next;
                        });
                      }}
                    />
                  </label>;
                })}
              </div>
            </div>;
          })}
      </section>

      <div className="section-gap">
        {history.length > 0 && <Collapsible title={t("Change history", "سجل التغييرات")} count={history.length}>
          <DataTable<HistoryRow>
            lang={lang}
            caption={t("Change history", "سجل التغييرات")}
            rows={history}
            pageSize={10}
            rowKey={(row) => row.id}
            columns={[
              { key: "setting", header: t("Setting", "الإعداد"), render: (row) => row.setting, primary: true },
              { key: "scope", header: t("Scope", "النطاق"), render: (row) => row.scope },
              { key: "change", header: t("Change", "التغيير"), render: (row) => row.change },
              { key: "occurredAt", header: t("When", "امتى"), render: (row) => fmtDateTime(row.occurredAt, lang) },
            ]}
            empty={<EmptyState title={t("No changes yet", "لا توجد تغييرات")} text={t("Saved changes appear here.", "ستظهر التغييرات المحفوظة هنا.")} />}
          />
        </Collapsible>}
        <Collapsible title={t("Planned for later", "مخطط لاحقاً")}>
          <p className="st-later">{t("Not active yet. Nothing here can be changed.", "غير مفعّلة بعد. لا يمكن تغيير أي منها.")}</p>
          <ul className="st-roadmap">{roadmap.map((item) => <li key={item.en}>{t(item.en, item.ar)}</li>)}</ul>
        </Collapsible>
      </div>

      {dirtyEntries.length > 0 && <div className="st-savebar" role="region" aria-label={t("Unsaved changes", "تغييرات غير محفوظة")}>
        <span>{saveError ? <span role="alert">{saveError}</span> : `${dirtyEntries.length} ${t("unsaved", "غير محفوظ")}`}</span>
        <div className="st-savebar-actions">
          <button className="btn" type="button" onClick={() => { setDrafts({}); setSaveError(""); }} disabled={saving}><RotateCcw size={15} />{t("Discard", "تجاهل")}</button>
          <button className="btn btn-primary" type="button" onClick={() => void saveChanges()} disabled={saving}><Save size={15} />{saving ? t("Saving…", "بنحفظ…") : t("Save", "احفظ")}</button>
        </div>
      </div>}
    </TabPanel>

    <TabPanel idPrefix={prefix} id="hours" active={activeTab === "hours"}>
      <section className="panel">
        <AvailabilityEditor lang={lang} notify={notify} branches={state.branches.map((branch) => ({ id: branch.id, name: branchName(branch.id) }))} />
      </section>
    </TabPanel>

    <TabPanel idPrefix={prefix} id="policies" active={activeTab === "policies" && isOwner}>
      <section className="panel st-split">
        <nav className="st-policy-list" aria-label={t("Policies", "السياسات")}>
          {(["quote", "pickup", "finance"] as PolicyGroup[]).map((group) => <div className="st-policy-group" key={group}>
            <h3>{policyGroupLabels[group][lang]}</h3>
            {catalog.filter((entry) => entry.group === group).map((entry) => <button
              key={entry.id}
              type="button"
              className="st-policy-item"
              aria-current={entry.id === selectedPolicy.id ? "true" : undefined}
              onClick={() => setPolicyId(entry.id)}
            >{policyName(entry)}</button>)}
          </div>)}
        </nav>
        <div className="st-policy-body">
          <label className="st-policy-select">
            <span className="sr-only">{t("Policy", "السياسة")}</span>
            <select className="select field-select" value={selectedPolicy.id} onChange={(event) => setPolicyId(event.target.value)}>
              {(["quote", "pickup", "finance"] as PolicyGroup[]).map((group) => <optgroup key={group} label={policyGroupLabels[group][lang]}>
                {catalog.filter((entry) => entry.group === group).map((entry) => <option key={entry.id} value={entry.id}>{policyName(entry)}</option>)}
              </optgroup>)}
            </select>
          </label>
          <h2>{policyGroupLabels[selectedPolicy.group][lang]} · {policyName(selectedPolicy)}</h2>
          <CommercialPolicyEditor key={selectedPolicy.id} lang={lang} policyId={selectedPolicy.id} notify={notify} />
        </div>
      </section>
    </TabPanel>

    <TabPanel idPrefix={prefix} id="warranty" active={activeTab === "warranty" && isOwner}>
      <Suspense fallback={<Skeleton rows={5} />}>
        <PolicyManager lang={lang} t={t} state={state} notify={notify} />
      </Suspense>
    </TabPanel>

    <TabPanel idPrefix={prefix} id="access" active={activeTab === "access" && isOwner}>
      <Suspense fallback={<Skeleton rows={5} />}>
        <StaffPage embedded lang={lang} t={t} state={state} notify={notify} />
      </Suspense>
    </TabPanel>
  </>;
}
