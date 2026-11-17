import { useState } from "react";
import type { AcceptedQuoteSnapshot, QuoteRevision } from "@garage/domain";
import { quoteApi } from "../../shared/store";

export function QuoteReview({ lang, quote, onAccepted }: { lang:"ar"|"en"; quote:QuoteRevision; onAccepted:(snapshot:AcceptedQuoteSnapshot)=>void }) {
  const t=(en:string,ar:string)=>lang==="ar"?ar:en;
  const [evidence,setEvidence]=useState("");
  const [key,setKey]=useState<string|null>(null);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const confirmed=quote.state==="offered" && quote.total!==null;
  async function accept() {
    if (!confirmed || !evidence.trim()) return;
    const stableKey=key??crypto.randomUUID(); setKey(stableKey); setBusy(true); setMessage("");
    try { const result=await quoteApi.accept({ ref:quote.ref,expectedDigest:quote.digest,acceptanceEvidenceRef:evidence,idempotencyKey:stableKey }); onAccepted(result); setMessage(t("Acceptance recorded.","تم تسجيل القبول.")); }
    catch(e) {
      if (e instanceof Error && "code" in e && e.code==="WRITE_OUTCOME_UNKNOWN") {
        try { const outcome=await quoteApi.outcome(quote.ref.quoteId,stableKey); onAccepted(outcome); setMessage(t("Original acceptance confirmed.","تم تأكيد القبول الأصلي.")); }
        catch { setMessage(t("Outcome remains unknown. Check this same key before trying again; your evidence and review are preserved.","نتيجة العملية غير مؤكدة. تحقق من المفتاح نفسه قبل المحاولة مجدداً؛ تم الاحتفاظ بالدليل والمراجعة.")); }
      } else setMessage(e instanceof Error?e.message:String(e));
    } finally { setBusy(false); }
  }
  async function check() { if (!key) return; try { onAccepted(await quoteApi.outcome(quote.ref.quoteId,key)); setMessage(t("Original acceptance confirmed.","تم تأكيد القبول الأصلي.")); } catch(e) { setMessage(e instanceof Error?e.message:String(e)); } }
  return <section className="panel section-gap" dir={lang==="ar"?"rtl":"ltr"}>
    <h2>{t("Review offered quote","مراجعة عرض السعر")}: {quote.ref.quoteId} · {t("revision","المراجعة")} {quote.ref.revision}</h2>
    <p>{t("State","الحالة")}: {quote.state} · {t("Valid through","صالح حتى")}: {quote.validThrough??t("Not configured","غير محدد")}</p>
    <p>{t("Vehicle","المركبة")}: {quote.input.vehicle.model} · {t("Branch","الفرع")}: {quote.input.branchId}</p>
    <p>{t("Package version","إصدار الباقة")}: {quote.input.packageVersion?`${quote.input.packageVersion.id} v${quote.input.packageVersion.version}`:t("Standalone","منفرد")}</p>
    <ul>{quote.input.scope.map(s=><li key={s.id}>{s.serviceId} · {s.areas.join(", ")} · {t("Roof","السقف")}: {s.roof} · {t("Excluded","مستثنى")}: {s.exclusions.join(", ")||"—"}</li>)}</ul>
    <ul>{quote.input.lines.map(l=><li key={l.id}>{l.scopeItemId} × {l.quantity}: {l.unitPrice.minor} {l.unitPrice.currency} {t("minor units","وحدات صغرى")} · {t("Discount","خصم")}: {l.discount.minor} · {t("Tax","ضريبة")}: {l.tax?`${l.tax.minor} ${l.tax.currency}`:t("Unconfigured","غير محددة")}</li>)}</ul>
    <p><strong>{t("Exact total","الإجمالي الدقيق")}: {quote.total?`${quote.total.minor} ${quote.total.currency} ${t("minor units","وحدات صغرى")}`:t("Unconfigured; cannot accept","غير محدد؛ لا يمكن القبول")}</strong></p>
    <p>{t("Tax policy","سياسة الضريبة")}: {quote.input.taxTreatment?`${quote.input.taxTreatment.id} v${quote.input.taxTreatment.version}`:t("Unconfigured","غير محددة")} · {t("Acceptance policy","سياسة القبول")}: {quote.input.acceptancePolicy?`${quote.input.acceptancePolicy.id} v${quote.input.acceptancePolicy.version}`:t("Unconfigured","غير محددة")}</p>
    <p>{t("Warranty bindings","روابط الضمان")}: {quote.input.warrantyBindings.map(w=>`${w.componentId}: ${w.policy.id} v${w.policy.version}`).join("; ")||"—"} · {t("Benefit bindings","روابط المزايا")}: {quote.input.benefitBindings.map(b=>`${b.id} v${b.version}`).join("; ")||"—"}</p>
    {confirmed&&<><label>{t("Staff-recorded proof reference (private:…)","مرجع إثبات القبول المسجل من الموظف (private:…)")}<input className="field-input" value={evidence} onChange={e=>{setEvidence(e.target.value);setKey(null);}} /></label>
      <button className="btn btn-primary" disabled={busy||!/^private:[A-Za-z0-9/_-]+$/.test(evidence)} onClick={()=>void accept()}>{t("Confirm customer acceptance","تأكيد قبول العميل")}</button>
      {key&&<button className="btn" disabled={busy} onClick={()=>void check()}>{t("Check original outcome","التحقق من النتيجة الأصلية")}</button>}</>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
