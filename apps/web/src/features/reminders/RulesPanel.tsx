import { useState } from "react";
import { Save } from "lucide-react";
import type { Locale } from "@garage/domain";
import { Collapsible, Field, Skeleton } from "../../shared/components";
import { useLoad } from "../finance/use-load";
import { errorCopy, kindLabel } from "./reminder-model";
import { ReminderApiError, remindersApi, type RuleView } from "./reminders-api";

const placeholderLabel: Record<string, [string, string]> = {
  name: ["customer name", "اسم العميل"], plate: ["plate", "اللوحة"], branch: ["branch", "الفرع"], service: ["service", "الخدمة"],
  date: ["date", "التاريخ"], time: ["time", "الوقت"], expiry: ["warranty end date", "تاريخ انتهاء الضمان"],
};

function RuleEditor({ rule, lang, onSaved }: { rule: RuleView; lang: Locale; onSaved: () => void }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [lead, setLead] = useState(String(rule.leadDays));
  const [auto, setAuto] = useState(rule.autoSend);
  const [en, setEn] = useState(rule.templateEn);
  const [ar, setAr] = useState(rule.templateAr);
  const [preview, setPreview] = useState<{ en: string; ar: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fixedLead = rule.leadMin === rule.leadMax;
  const leadNumber = Number(lead);
  const leadValid = Number.isInteger(leadNumber) && leadNumber >= rule.leadMin && leadNumber <= rule.leadMax;
  const dirty = enabled !== rule.enabled || leadNumber !== rule.leadDays || auto !== rule.autoSend || en !== rule.templateEn || ar !== rule.templateAr;
  const leadLabel = rule.kind === "warranty_expiry" ? t("Days before the warranty ends", "أيام قبل انتهاء الضمان")
    : rule.kind === "booking_day_before" ? t("Days before drop-off", "أيام قبل موعد التسليم")
      : rule.kind === "quote_followup" ? t("Days after the quote was sent", "أيام بعد إرسال العرض") : t("Days after delivery", "أيام بعد التسليم");

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setMessage(null);
    try { await work(); } catch (failure) { setMessage({ tone: "error", text: errorCopy(failure instanceof ReminderApiError ? failure.code : "", lang) }); } finally { setBusy(false); }
  };
  const showPreview = () => run(async () => {
    const [previewEn, previewAr] = await Promise.all([remindersApi.preview(rule.kind, en, "en"), remindersApi.preview(rule.kind, ar, "ar")]);
    setPreview({ en: previewEn.text, ar: previewAr.text });
    const problem = previewEn.problem ?? previewAr.problem;
    if (problem) setMessage({ tone: "error", text: errorCopy(problem, lang) });
  });
  const save = () => run(async () => {
    await remindersApi.saveRule(rule.kind, { expectedRevision: rule.revision, enabled, ...(fixedLead ? {} : { leadDays: leadNumber }), autoSend: auto, templateEn: en, templateAr: ar });
    setMessage({ tone: "ok", text: t("Saved.", "تم الحفظ.") });
    onSaved();
  });

  return <div className="rule-editor">
    <div className="rule-row">
      <label className="rule-check"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />{t("Enabled", "مفعّلة")}</label>
      <label className="rule-check"><input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} />{t("Mark as sent automatically (simulated)", "تسجيلها كمُرسلة تلقائياً (محاكاة)")}</label>
      {!fixedLead && <Field label={leadLabel} error={leadValid ? undefined : t(`Between ${rule.leadMin} and ${rule.leadMax}`, `بين ${rule.leadMin} و${rule.leadMax}`)}>
        <input className="field-input rule-lead" type="number" inputMode="numeric" min={rule.leadMin} max={rule.leadMax} value={lead} onChange={(event) => setLead(event.target.value)} />
      </Field>}
    </div>
    <div className="rule-templates">
      <Field label={t("Message in English", "الرسالة بالإنجليزية")} full><textarea className="field-textarea" dir="ltr" rows={3} maxLength={1000} value={en} onChange={(event) => setEn(event.target.value)} /></Field>
      <Field label={t("Message in Arabic", "الرسالة بالعربية")} full><textarea className="field-textarea" dir="rtl" rows={3} maxLength={1000} value={ar} onChange={(event) => setAr(event.target.value)} /></Field>
    </div>
    <p className="form-hint">{t("You can use: ", "المتاح: ")}{rule.placeholders.map((name) => <code key={name} className="rule-token">{`{${name}}`}<span className="rule-token-name"> {t(...(placeholderLabel[name] ?? [name, name]))}</span></code>)}</p>
    {preview && <div className="rule-preview" aria-live="polite">
      <p dir="ltr">{preview.en}</p>
      <p dir="rtl">{preview.ar}</p>
    </div>}
    {message && <p className={message.tone === "ok" ? "form-hint" : "form-error"} role="status">{message.text}</p>}
    <div className="rule-actions">
      <button type="button" className="btn" disabled={busy} onClick={() => void showPreview()}>{t("Preview", "معاينة")}</button>
      <button type="button" className="btn btn-primary" disabled={busy || !dirty || !leadValid} onClick={() => void save()}><Save size={14} aria-hidden="true" />{t("Save rule", "حفظ القاعدة")}</button>
    </div>
  </div>;
}

/** Owner-only rules panel: toggle, lead times and editable bilingual message text with a preview. */
export function RulesPanel({ lang }: { lang: Locale }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const rules = useLoad(() => remindersApi.rules(), []);
  return <section className="rules-panel" aria-label={t("Reminder rules", "قواعد التذكير")}>
    <h2>{t("Reminder rules", "قواعد التذكير")}</h2>
    <p className="form-hint">{t("The owner controls when each follow-up is created and what it says. Messages stay in the simulated outbox.", "المالك يحدد متى تُنشأ كل متابعة وما نصها. تبقى الرسائل في صندوق المحاكاة.")}</p>
    {rules.loading && <Skeleton rows={3} />}
    {rules.error && <p className="form-error">{t("Rules could not be loaded.", "تعذر تحميل القواعد.")} <button type="button" className="btn btn-sm" onClick={rules.reload}>{t("Retry", "إعادة المحاولة")}</button></p>}
    {rules.data?.rules.map((rule) => <Collapsible key={`${rule.kind}-${rule.revision}`} title={kindLabel(rule.kind, lang)}>
      <RuleEditor rule={rule} lang={lang} onSaved={rules.reload} />
    </Collapsible>)}
  </section>;
}
