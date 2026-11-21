import { useEffect, useState } from "react";
import type { FinancialMetricId, Locale } from "@garage/domain";
import { financeApi } from "../../shared/store";
import { Field, FormSection, RequiredNote } from "../../shared/components";
import { fetchActiveDefinition, type ActiveDefinition } from "./finance-api";
import { allMetricIds, definitionLabel, errorText, metricLabels, toEvidenceRef } from "./finance-logic";
import { makeT } from "./finance-ui";

/** Owner confirms the active approved definition is complete. No ids typed: pick the figure, the active version is resolved. */
export function AttestationPanel({ lang, onDone }: { lang: Locale; onDone: () => void }) {
  const t = makeT(lang);
  const [metric, setMetric] = useState<FinancialMetricId>("collections");
  const [definition, setDefinition] = useState<ActiveDefinition | null>(null);
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let current = true;
    setDefinition(null);
    setMessage(null);
    fetchActiveDefinition(metric).then((result) => { if (current) setDefinition(result); }).catch(() => { if (current) setDefinition({ state: "unconfigured" }); });
    return () => { current = false; };
  }, [metric]);

  async function attest(event: React.FormEvent) {
    event.preventDefault();
    if (definition?.state !== "approved" || !toEvidenceRef(evidence) || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await financeApi.attest({ definition: definition.ref, evidenceRef: toEvidenceRef(evidence) });
      setMessage({ tone: "ok", text: t("Completeness approved.", "تم اعتماد الاكتمال.") });
      setEvidence("");
      onDone();
    } catch (failure) {
      setMessage({ tone: "error", text: errorText(failure, lang) });
    } finally { setBusy(false); }
  }

  return <form className="finance-form" onSubmit={(event) => void attest(event)} noValidate>
    <RequiredNote text={t("Required", "حقل مطلوب")} />
    <FormSection title={t("Definition", "التعريف")}>
      <Field label={t("Figure", "الرقم")} required hint={definition?.state === "approved" ? definitionLabel(definition.ref, lang) : definition ? t("No approved definition. Approve one in Settings.", "لا يوجد تعريف معتمد. اعتمد تعريفاً من الإعدادات.") : undefined}>
        <select className="field-select" value={metric} onChange={(event) => setMetric(event.target.value as FinancialMetricId)}>
          {allMetricIds.map((id) => <option key={id} value={id}>{metricLabels[id][lang]}</option>)}
        </select>
      </Field>
      <Field label={t("Evidence file or reference", "ملف أو مرجع الدليل")} required>
        <input className="field-input mono" value={evidence} onChange={(event) => setEvidence(event.target.value)} />
      </Field>
    </FormSection>
    {message && <p className={message.tone === "error" ? "form-error" : "form-hint"} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>}
    <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy || definition?.state !== "approved" || !toEvidenceRef(evidence)}>{t("Approve completeness", "اعتماد الاكتمال")}</button></div>
  </form>;
}
