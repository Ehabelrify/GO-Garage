import { useEffect, useState } from "react";
import { promotionApi } from "../../shared/store";

export function PromotionAllocationDetail({lang,id}:{lang:"ar"|"en";id:string}){
  const t=(en:string,ar:string)=>lang==="ar"?ar:en;
  const [detail,setDetail]=useState<Awaited<ReturnType<typeof promotionApi.detail>>|null>(null);const [message,setMessage]=useState("");
  const [reason,setReason]=useState("");const [evidenceRef,setEvidenceRef]=useState("");
  async function refresh(){setDetail(await promotionApi.detail(id));}
  useEffect(()=>{void refresh().catch(e=>setMessage(String(e)));},[id]);
  async function reverse(){try{await promotionApi.reverse({allocationId:id,reason,evidenceRef,idempotencyKey:crypto.randomUUID()});await refresh();setMessage(t("Correction recorded.","تم تسجيل التصحيح."));}catch(e){setMessage(e instanceof Error?e.message:String(e));}}
  return <section className="panel section-gap" dir={lang==="ar"?"rtl":"ltr"}><h2>{t("Allocation detail","تفاصيل التخصيص")}</h2>{detail&&<><p>{t("Status","الحالة")}: {detail.allocation.status}</p><p>{t("Discount","الخصم")}: {detail.allocation.discount?.minor} {detail.allocation.discount?.currency}</p><p>{t("Reserved units","الوحدات المحجوزة")}: {detail.pool.reservedUnits} · {t("Consumed units","الوحدات المستخدمة")}: {detail.pool.consumedUnits} / {detail.pool.maximumUnits}</p><h3>{t("Correction history","سجل التصحيحات")}</h3><ul>{detail.history.map((e,i)=><li key={i}>{e.action} · {e.at}</li>)}</ul>{detail.allocation.status==="reserved"&&<><label>{t("Correction reason","سبب التصحيح")}<input value={reason} onChange={e=>setReason(e.target.value)}/></label><label>{t("Protected evidence reference","مرجع الدليل المحمي")}<input value={evidenceRef} onChange={e=>setEvidenceRef(e.target.value)}/></label><button className="btn" onClick={()=>void reverse()}>{t("Reverse allocation","عكس التخصيص")}</button></>}</>}{message&&<p role="status">{message}</p>}</section>;
}
