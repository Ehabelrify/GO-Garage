import { useEffect, useState } from "react";
import type { Locale } from "@garage/domain";
import { summariseOutcomes, type BulkOutcome } from "../selection";
import { ConfirmDialog } from "./ConfirmDialog";

export interface BulkRunDialogProps {
  open: boolean;
  lang: Locale;
  title: string;
  body?: string;
  danger?: boolean;
  confirmLabel: string;
  /** Runs the per-item work (existing single-item endpoints) and resolves with one outcome per item. */
  run: () => Promise<BulkOutcome[]>;
  /** Human label for a row key (never a raw id): used in the failure list. */
  label: (key: string) => string;
  /** Human text for an error code. */
  errorText?: (code: string | undefined) => string;
  /** Called once with the outcomes when the person closes the result. */
  onFinished: (outcomes: BulkOutcome[]) => void;
  onCancel: () => void;
}

const text = {
  en: {
    done: (done: number, total: number) => `${done} of ${total} done.`, failed: (n: number) => `${n} could not be changed:`, close: "Close",
    working: "Working...", allDone: "All done.",
  },
  ar: {
    done: (done: number, total: number) => `تم ${done} من ${total}.`, failed: (n: number) => `تعذر تغيير ${n}:`, close: "إغلاق",
    working: "جارٍ التنفيذ...", allDone: "تم كل شيء.",
  },
};

/** Confirm, run one request per item, then show a per-item summary. Existing endpoints only; failures never stop the rest. */
export function BulkRunDialog({ open, lang, title, body, danger, confirmLabel, run, label, errorText, onFinished, onCancel }: BulkRunDialogProps) {
  const copy = text[lang];
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<BulkOutcome[] | null>(null);
  useEffect(() => { if (!open) { setBusy(false); setOutcomes(null); } }, [open]);
  if (!open) return null;

  if (outcomes) {
    const summary = summariseOutcomes(outcomes);
    const failures = outcomes.filter((item) => !item.ok);
    return <ConfirmDialog open lang={lang} title={title} confirmLabel={copy.close} cancelLabel={copy.close}
      onCancel={() => onFinished(outcomes)} onConfirm={() => onFinished(outcomes)}>
      <div className="bulk-result" role="status" aria-live="polite">
        <p>{summary.failed === 0 ? copy.allDone : copy.done(summary.done, summary.total)}</p>
        {failures.length > 0 && <>
          <p>{copy.failed(failures.length)}</p>
          <ul>{failures.map((item) => <li key={item.key}><bdi>{label(item.key)}</bdi>{errorText ? ` - ${errorText(item.error)}` : ""}</li>)}</ul>
        </>}
      </div>
    </ConfirmDialog>;
  }

  return <ConfirmDialog open lang={lang} title={title} body={body} danger={danger} confirmLabel={busy ? copy.working : confirmLabel} busy={busy}
    onCancel={() => { if (!busy) onCancel(); }}
    onConfirm={() => { setBusy(true); void run().then((result) => setOutcomes(result)).finally(() => setBusy(false)); }} />;
}
