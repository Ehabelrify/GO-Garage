import { useEffect, useState } from "react";
import type { AcceptedQuoteSnapshot, QuoteDraftInput, QuoteFollowup, QuoteRevision, QuoteVersionRef } from "@garage/domain";
import { quoteApi, useGarageStore } from "../../shared/store";
import { QuoteEditor } from "./QuoteEditor";
import { QuoteReview } from "./QuoteReview";
import { customerDisplay, PageHeading } from "../../shared/ui";

export function QuoteWorkspace({ lang }: { lang:"ar"|"en" }) {
  const t=(en:string,ar:string)=>lang==="ar"?ar:en;
  const store=useGarageStore();
  const [quotes,setQuotes]=useState<Array<QuoteRevision&{followup:QuoteFollowup}>>([]);
  const [selected,setSelected]=useState<QuoteRevision|null>(null);
  const [initial,setInitial]=useState<QuoteDraftInput|undefined>();
  const [editorOpen,setEditorOpen]=useState(false);
  const [accepted,setAccepted]=useState<AcceptedQuoteSnapshot|null>(null);
  const [message,setMessage]=useState("");
  async function refresh() { setQuotes(await quoteApi.list()); }
  useEffect(()=>{ void refresh().catch(e=>setMessage(String(e))); },[]);
  async function saved(ref:QuoteVersionRef) { try { setSelected(await quoteApi.readRevision(ref)); await refresh(); setEditorOpen(false); } catch(e) { setMessage(String(e)); } }
  async function followup(q:QuoteRevision,nextStatus:QuoteFollowup["status"]) { try { await quoteApi.followup({quoteId:q.ref.quoteId,expectedRevision:q.ref.revision,nextStatus}); await refresh(); } catch(e) { setMessage(String(e)); } }
  return <div dir={lang==="ar"?"rtl":"ltr"}>
    <PageHeading eyebrow={t("Customer care · Pricing","خدمة العملاء · التسعير")} title={t("Quotes and follow-up","عروض الأسعار والمتابعة")} subtitle={t("Review the next customer response first. A quote is not a booking; acceptance still requires the recorded terms and evidence.","ابدأ بمراجعة رد العميل التالي. عرض السعر ليس حجزاً؛ ويظل القبول محتاجاً للشروط المسجلة والدليل.")} action={<button className="btn btn-primary" type="button" onClick={()=>{setInitial(undefined);setEditorOpen(true);setMessage("");}}>{t("Create quote","إنشاء عرض سعر")}</button>}/>
    {message&&<p role="status" className="form-hint">{message}</p>}
    <section className="panel section-gap"><h2>{t("Quote follow-up","متابعة عروض الأسعار")}</h2>
      {quotes.length===0&&<div className="empty-state"><strong>{t("No quotes yet","لا توجد عروض بعد")}</strong><p>{t("Create a quote when a customer needs a written scope and price.","أنشئ عرضاً عندما يحتاج العميل إلى نطاق وسعر مكتوبين.")}</p></div>}
      {quotes.map(q=>{const customer=store.state?.customers.find(item=>item.id===q.input.customerId);const vehicle=customer?.vehicles.find(item=>item.id===q.input.vehicle.vehicleId);return <div className="catalogue-record" key={q.ref.quoteId}><button className="btn" onClick={()=>{setSelected(q);setAccepted(null);}}>{customer?customerDisplay(customer.name,lang):t("Customer record","سجل العميل")}{vehicle?` · ${vehicle.plate}`:""} · {t("Revision","المراجعة")} {q.ref.revision}</button>{" "}
        <span>{t("Follow-up","المتابعة")}: {q.followup.status}</span>{" "}
        <span className="status">{q.state}</span>{" "}
        {q.state!=="accepted"&&<button className="btn" onClick={()=>{setSelected(null);setInitial({...q.input,priorRevision:q.ref,quoteId:q.ref.quoteId,state:"draft"});setEditorOpen(true);}}>{t("Revise","مراجعة جديدة")}</button>}{" "}
        {q.state==="offered"&&q.followup.status!=="answered"&&<button className="btn" onClick={()=>void followup(q,"answered")}>{t("Record response answered","تسجيل الرد المكتمل")}</button>}
      </div>})}
    </section>
    {editorOpen&&<><div className="form-actions"><button className="btn" type="button" onClick={()=>{setEditorOpen(false);setInitial(undefined);}}>{t("Close editor","إغلاق المحرر")}</button></div><QuoteEditor key={`${initial?.quoteId ?? "new"}:${initial?.priorRevision?.revision ?? "new"}`} lang={lang} initial={initial} onSaved={ref=>void saved(ref)} /></>}
    {selected&&<QuoteReview quote={selected} lang={lang} onAccepted={snapshot=>{setAccepted(snapshot);void refresh();}} />}
    {accepted&&<p role="status">{t("Accepted snapshot","نسخة العرض المقبولة")}: {accepted.ref.quoteId} · {accepted.ref.revision} · {accepted.total.minor} {accepted.total.currency}</p>}
  </div>;
}
