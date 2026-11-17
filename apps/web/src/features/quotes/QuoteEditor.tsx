import { useState } from "react";
import type { QuoteDraftInput, QuoteVersionRef } from "@garage/domain";
import { quoteApi } from "../../shared/store";

export function QuoteEditor({ lang, onSaved, initial }: { lang:"ar"|"en"; onSaved:(ref:QuoteVersionRef)=>void; initial?:QuoteDraftInput }) {
  const t=(en:string,ar:string)=>lang==="ar"?ar:en;
  const [text,setText]=useState(initial?JSON.stringify(initial,null,2):"");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  async function save(state:"draft"|"offered") {
    setBusy(true); setMessage("");
    try { const parsed=JSON.parse(text) as QuoteDraftInput; const ref=await quoteApi.createRevision({ ...parsed,state }); onSaved(ref); setMessage(t("Revision saved. Review its exact terms before acceptance.","تم حفظ المراجعة. راجع الشروط والمبالغ قبل القبول.")); }
    catch(e) { setMessage(e instanceof Error?e.message:String(e)); }
    finally { setBusy(false); }
  }
  return <section className="panel section-gap" dir={lang==="ar"?"rtl":"ltr"}>
    <h2>{t("Quote editor","محرر عرض السعر")}</h2>
    <p>{t("Enter the complete structured scope and approved policy references. A draft may remain incomplete; an offer requires configured pricing, tax, validity and acceptance terms.","أدخل النطاق الكامل ومراجع السياسات المعتمدة. يمكن أن تبقى المسودة ناقصة، أما العرض فيحتاج سعراً وضريبة وصلاحية وشروط قبول معتمدة.")}</p>
    <label>{t("Structured quote input","بيانات عرض السعر المنظمة")}<textarea className="field-input" rows={18} value={text} onChange={e=>setText(e.target.value)} /></label>
    <button className="btn" disabled={busy||!text.trim()} onClick={()=>void save("draft")}>{t("Save draft revision","حفظ مراجعة مسودة")}</button>{" "}
    <button className="btn btn-primary" disabled={busy||!text.trim()} onClick={()=>void save("offered")}>{t("Record offered revision","تسجيل مراجعة العرض")}</button>
    {message&&<p role="status">{message}</p>}
  </section>;
}
