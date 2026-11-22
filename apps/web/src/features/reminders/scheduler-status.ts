import type { Locale } from "@garage/domain";
import type { SchedulerStatus } from "./reminders-api";

export interface SchedulerLine { tone: "info" | "warning"; text: string }

/** One compact line for the follow-ups header. Null when the server sends no status. */
export function schedulerLine(s: SchedulerStatus | undefined | null, lang: Locale, fmt: (iso: string) => string = (iso) => iso): SchedulerLine | null {
  if (!s) return null;
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  if (s.lastError) return { tone: "warning", text: t("The automatic check failed last time. Use Check now to run it yourself.", "فشل الفحص التلقائي في المرة الأخيرة. استخدم افحص الآن لتشغيله بنفسك.") };
  if (!s.enabled) return { tone: "warning", text: t("Automatic check is off. Use Check now to run it.", "الفحص التلقائي متوقف. استخدم افحص الآن لتشغيله.") };
  const minutes = Math.max(1, Math.round(s.intervalSeconds / 60));
  const last = s.lastRunAt ? fmt(s.lastRunAt) : t("not yet", "لم يتم بعد");
  const next = s.running ? t("running now", "قيد التشغيل الآن") : s.nextRunAt ? fmt(s.nextRunAt) : "-";
  return { tone: "info", text: t(`Automatic check every ${minutes} min, last run ${last}, next ${next}.`, `فحص تلقائي كل ${minutes} دقيقة، آخر تشغيل ${last}، التالي ${next}.`) };
}
