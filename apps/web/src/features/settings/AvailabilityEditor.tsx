import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Locale } from "@garage/domain";
import { EmptyState, Field, FormSection, Notice, RequiredNote, Skeleton } from "../../shared/components";
import {
  availabilityComplete, availabilityFromApi, availabilityPayload, type AvailabilityForm,
} from "./availability-form";
import "./settings.css";

type Load = "loading" | "error" | "ready";

const timezones = ["Africa/Cairo", "Asia/Riyadh", "Asia/Dubai", "Europe/London", "UTC"];

/**
 * Hours and capacity for one branch. This is the single source of truth for working days,
 * opening hours, daily intake and bay counts (the old duplicate "decision" controls were removed).
 */
export function AvailabilityEditor({ branches, lang, notify }: { branches: { id: string; name: string }[]; lang: Locale; notify?: (message: string) => void }) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [form, setForm] = useState<AvailabilityForm | null>(null);
  const [load, setLoad] = useState<Load>("loading");
  const [unconfigured, setUnconfigured] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const read = useCallback(async (live: () => boolean) => {
    setLoad("loading");
    setForm(null);
    setMessage("");
    try {
      const response = await fetch(`/api/availability/config/${encodeURIComponent(branchId)}`, { credentials: "same-origin" });
      if (!response.ok) throw new Error("read");
      const data = await response.json();
      if (!live()) return;
      setUnconfigured(data.status === "unconfigured");
      setForm(availabilityFromApi(data));
      setLoad("ready");
    } catch {
      if (live()) setLoad("error");
    }
  }, [branchId]);

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!branchId) return;
    let alive = true;
    void read(() => alive);
    return () => { alive = false; };
  }, [branchId, reloadKey, read]);

  const patch = (next: Partial<AvailabilityForm>) => setForm((current) => current ? { ...current, ...next } : current);
  const dayName = (day: number) => new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1 + day)));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || busy) return;
    const body = availabilityPayload(form);
    if (!body) {
      setMessage(t("Give each closure a date and a reason, or remove it.", "اكتب تاريخ وسبب لكل إغلاق، أو احذفه."));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/availability/config/${encodeURIComponent(branchId)}`, {
        method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({})) as { code?: string; version?: number };
      if (!response.ok) throw new Error(data.code ?? "SAVE_FAILED");
      patch({ version: data.version ?? form.version, reason: "" });
      setUnconfigured(false);
      notify?.(t("Hours and capacity saved.", "اتحفظت المواعيد والسعة."));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(code === "STALE_VERSION" || code === "STALE_CONFIG_VERSION"
        ? t("Another owner changed this. Reload and try again.", "غيّر مالك آخر الإعدادات. حدّث الصفحة وحاول مرة أخرى.")
        : t("Not saved. Check the values and try again.", "لم يُحفظ. راجع القيم وحاول مرة أخرى."));
    } finally {
      setBusy(false);
    }
  };

  if (!branches.length) return <EmptyState title={t("No branches yet", "لا توجد فروع")} />;

  return <section className="st-section" aria-label={t("Hours and capacity", "المواعيد والسعة")}>
    <div className="st-toolbar">
      <label className="st-inline-field">
        <span className="field-label">{t("Branch", "الفرع")}</span>
        <select className="field-select" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>
    </div>
    {load === "loading" && <Skeleton rows={5} label={t("Loading", "جارٍ التحميل")} />}
    {load === "error" && <EmptyState variant="error" title={t("Could not load hours and capacity", "تعذر تحميل المواعيد والسعة")}
      action={<button type="button" className="btn" onClick={() => setReloadKey((key) => key + 1)}>{t("Retry", "إعادة المحاولة")}</button>} />}
    {load === "ready" && form && <form onSubmit={(event) => void save(event)} className="st-form">
      {unconfigured && <Notice tone="info">{t("This branch is not set up yet. Fill in the required fields to start taking bookings.", "لم يُعدّ الفرع بعد. املا الحقول المطلوبة عشان يستقبل حجوزات.")}</Notice>}
      <FormSection title={t("Working time", "وقت العمل")} columns={3}>
        <Field label={t("Opens", "يفتح")} required><input className="field-input" type="time" value={form.opensAt} onChange={(event) => patch({ opensAt: event.target.value })} /></Field>
        <Field label={t("Closes", "يقفل")} required><input className="field-input" type="time" value={form.closesAt} onChange={(event) => patch({ closesAt: event.target.value })} /></Field>
        <Field label={t("Time zone", "المنطقة الزمنية")} required>
          <input className="field-input" list="st-timezones" value={form.timezone} onChange={(event) => patch({ timezone: event.target.value })} placeholder="Africa/Cairo" dir="ltr" />
        </Field>
        <datalist id="st-timezones">{timezones.map((zone) => <option key={zone} value={zone} />)}</datalist>
        <Field label={t("Working days", "أيام العمل")} full required>
          <div className="st-weekdays" role="group" aria-label={t("Working days", "أيام العمل")}>
            {[0, 1, 2, 3, 4, 5, 6].map((day) => <label key={day} className="st-chip" data-on={form.workingWeekdays.includes(day) ? "true" : "false"}>
              <input type="checkbox" checked={form.workingWeekdays.includes(day)} onChange={(event) => patch({
                workingWeekdays: event.target.checked ? [...form.workingWeekdays, day] : form.workingWeekdays.filter((item) => item !== day),
              })} />
              <span>{dayName(day)}</span>
            </label>)}
          </div>
        </Field>
      </FormSection>
      <FormSection title={t("Capacity", "السعة")} columns={3}>
        <Field label={t("Cars per day", "عربيات في اليوم")} required><input className="field-input" type="number" min={1} value={form.dailyIntakeLimit} onChange={(event) => patch({ dailyIntakeLimit: event.target.value })} /></Field>
        <Field label={t("Clean bays", "بايات نظيفة")} required><input className="field-input" type="number" min={0} value={form.cleanBays} onChange={(event) => patch({ cleanBays: event.target.value })} /></Field>
        <Field label={t("General bays", "بايات عامة")} required><input className="field-input" type="number" min={0} value={form.generalBays} onChange={(event) => patch({ generalBays: event.target.value })} /></Field>
        <Field label={t("Slot length (min)", "مدة الموعد (دقيقة)")} required><input className="field-input" type="number" min={1} value={form.slotMinutes} onChange={(event) => patch({ slotMinutes: event.target.value })} /></Field>
        <Field label={t("Effective from", "ساري من")} required><input className="field-input" type="date" value={form.effectiveFrom} onChange={(event) => patch({ effectiveFrom: event.target.value })} /></Field>
      </FormSection>
      <FormSection title={t("Closed dates", "أيام الإغلاق")} columns={1}>
        <div className="st-closures">
          {form.closures.length === 0 && <p className="form-hint">{t("No closed dates.", "لا توجد أيام إغلاق.")}</p>}
          {form.closures.map((closure, index) => <div className="st-closure-row" key={index}>
            <input className="field-input" type="date" aria-label={t("Date", "التاريخ")} value={closure.date} onChange={(event) => patch({ closures: form.closures.map((item, i) => i === index ? { ...item, date: event.target.value } : item) })} />
            <input className="field-input" aria-label={t("Reason", "السبب")} placeholder={t("Reason", "السبب")} value={closure.reason} onChange={(event) => patch({ closures: form.closures.map((item, i) => i === index ? { ...item, reason: event.target.value } : item) })} />
            <button type="button" className="icon-button" aria-label={t("Remove closed date", "احذف يوم الإغلاق")} onClick={() => patch({ closures: form.closures.filter((_, i) => i !== index) })}><Trash2 size={16} /></button>
          </div>)}
          <div><button type="button" className="btn btn-sm" onClick={() => patch({ closures: [...form.closures, { date: "", reason: "" }] })}><Plus size={14} />{t("Add closed date", "أضف يوم إغلاق")}</button></div>
        </div>
      </FormSection>
      <FormSection title={t("Approval", "الاعتماد")} columns={1}>
        <Field label={t("Reason for this change", "سبب التغيير")} required><input className="field-input" value={form.reason} onChange={(event) => patch({ reason: event.target.value })} /></Field>
      </FormSection>
      <RequiredNote text={t("Required", "مطلوب")} />
      {message && <div className="form-error" role="alert">{message}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={busy || !availabilityComplete(form)}>{busy ? t("Saving…", "بنحفظ…") : t("Save hours and capacity", "احفظ المواعيد والسعة")}</button>
      </div>
    </form>}
  </section>;
}
