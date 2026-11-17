import { useEffect, useState } from "react";
import type { AcceptedQuoteSnapshot, QuoteDraftInput, QuoteFollowup, QuoteRevision, QuoteVersionRef } from "@garage/domain";
import { quoteApi } from "../../shared/store";
import { QuoteEditor } from "./QuoteEditor";
import { QuoteReview } from "./QuoteReview";

export function QuoteWorkspace({ lang }: { lang:"ar"|"en" }) {
  const t=(en:string,ar:string)=>lang==="ar"?ar:en;
  const [quotes,setQuotes]=useState<Array<QuoteRevision&{followup:QuoteFollowup}>>([]);
  const [selected,setSelected]=useState<QuoteRevision|null>(null);
  const [initial,setInitial]=useState<QuoteDraftInput|undefined>();
  const [accepted,setAccepted]=useState<AcceptedQuoteSnapshot|null>(null);
  const [message,setMessage]=useState("");
  async function refresh() { setQuotes(await quoteApi.list()); }
  useEffect(()=>{ void refresh().catch(e=>setMessage(String(e))); },[]);
  async function saved(ref:QuoteVersionRef) { try { setSelected(await quoteApi.readRevision(ref)); await refresh(); } catch(e) { setMessage(String(e)); } }
  async function followup(q:QuoteRevision,nextStatus:QuoteFollowup["status"]) { try { await quoteApi.followup({quoteId:q.ref.quoteId,expectedRevision:q.ref.revision,nextStatus}); await refresh(); } catch(e) { setMessage(String(e)); } }
  return <div dir={lang==="ar"?"rtl":"ltr"}>
    <h1>{t("Quotes and follow-up","عروض الأسعار والمتابعة")}</h1>
    <p>{t("A recorded offer does not create a booking or mark follow-up answered. Review each revision and explicitly record acceptance evidence.","تسجيل العرض لا ينشئ حجزاً ولا ينهي المتابعة. راجع كل مراجعة وسجل دليل القبول صراحة.")}</p>
    {message&&<p role="status">{message}</p>}
    <QuoteEditor key={`${initial?.quoteId ?? "new"}:${initial?.priorRevision?.revision ?? "new"}`} lang={lang} initial={initial} onSaved={ref=>void saved(ref)} />
    <section className="panel section-gap"><h2>{t("Current quotes","العروض الحالية")}</h2>
      {quotes.map(q=><div key={q.ref.quoteId}><button className="btn" onClick={()=>{setSelected(q);setAccepted(null);}}>{q.ref.quoteId} · {t("revision","المراجعة")} {q.ref.revision} · {q.state}</button>{" "}
        <span>{t("Follow-up","المتابعة")}: {q.followup.status}</span>{" "}
        {q.state!=="accepted"&&<button className="btn" onClick={()=>setInitial({...q.input,priorRevision:q.ref,quoteId:q.ref.quoteId,state:"draft"})}>{t("Revise","مراجعة جديدة")}</button>}{" "}
        {q.state==="offered"&&q.followup.status!=="answered"&&<button className="btn" onClick={()=>void followup(q,"answered")}>{t("Record response answered","تسجيل الرد المكتمل")}</button>}
      </div>)}
    </section>
    {selected&&<QuoteReview quote={selected} lang={lang} onAccepted={snapshot=>{setAccepted(snapshot);void refresh();}} />}
    {accepted&&<p role="status">{t("Accepted snapshot","نسخة العرض المقبولة")}: {accepted.ref.quoteId} · {accepted.ref.revision} · {accepted.total.minor} {accepted.total.currency}</p>}
  </div>;
}
