import { dateLabel, timeLabel, type Lang } from "../ui";

export interface DateTextProps {
  /** ISO date or date-time ("2026-11-22" or "2026-11-22T10:30"). */
  value: string | null | undefined;
  lang: Lang;
  /** HH:MM to append; defaults to the time embedded in value. */
  time?: string;
  className?: string;
}

/** Latin digits, LTR isolate, nowrap. Uses dateLabel so every date reads the same ("22 Nov 2026"). */
export function DateText({ value, lang, time, className }: DateTextProps) {
  if (!value) return <span className="date-text">—</span>;
  const clock = time ?? /T(\d{2}:\d{2})/.exec(value)?.[1];
  const text = clock ? `${dateLabel(value, lang)} ${timeLabel(clock, lang)}` : dateLabel(value, lang);
  return <bdi className={`date-text${className ? ` ${className}` : ""}`} dir="ltr">{text}</bdi>;
}
