import { useState } from "react";
import type { EligibilityResult, PromotionAllocation } from "@garage/domain";
import { promotionApi } from "../../shared/store";
import { PromotionAllocationDetail } from "./PromotionAllocationDetail";

export function QualificationForm({lang,actorId,actorRole}:{lang:"ar"|"en";actorId:string;actorRole:string}){
  const t=(en:string,ar:string)=>lang==="ar"?ar:en;
  const [promotionId,setPromotionId]=useState(""); const [version,setVersion]=useState("");
  const [beneficiaryId,setBeneficiaryId]=useState(""); const [vehicleIdsText,setVehicleIdsText]=useState("");
  const [kind,setKind]=useState<"warranty-reference"|"membership-verification"|"grouped-vehicles">("warranty-reference"); const [referenceId,setReferenceId]=useState("");
  const [branchId,setBranchId]=useState("");const [sourceRef,setSourceRef]=useState("");const [expiry,setExpiry]=useState("");
  const [quoteRefsText,setQuoteRefsText]=useState("");
  const [result,setResult]=useState<EligibilityResult|null>(null); const [allocations,setAllocations]=useState<PromotionAllocation[]>([]); const [message,setMessage]=useState("");
  const promotionRef={id:promotionId,version:Number(version)};
  const vehicleIds=vehicleIdsText.split(",").map(x=>x.trim()).filter(Boolean);
  async function verify(){try{const fact=await promotionApi.verifyMembership({promotionRef,beneficiaryId,branchId,sourceRef,expiresAt:expiry?new Date(expiry).toISOString():null});setReferenceId(fact.verificationId);setKind("membership-verification");setMessage(t("Membership verification recorded. Use its ID to check qualification.","تم تسجيل التحقق من العضوية. استخدم المعرّف لفحص الأهلية."));setSourceRef("");}catch(e){setMessage(e instanceof Error?e.message:String(e));}}
  async function evaluate(){try{setMessage("");setAllocations([]);setResult(await promotionApi.evaluate({promotionRef,beneficiaryId,vehicleIds,evidence:[{kind,referenceIds:kind==="grouped-vehicles"?vehicleIds:[referenceId],verifiedBy:kind==="membership-verification"?null:actorId,verifiedAt:kind==="membership-verification"?null:new Date().toISOString()}]}));}catch(e){setMessage(e instanceof Error?e.message:String(e));}}
  async function allocate(){if(result?.state!=="eligible")return;try{const refs=quoteRefsText.split(",").map(x=>x.trim()).filter(Boolean).map(x=>{const [quoteId,revision]=x.split(":");return {quoteId,revision:Number(revision)};});if(!refs.length||refs.some(x=>!x.quoteId||!Number.isInteger(x.revision)||x.revision<1))throw new Error(t("Enter quote ID:revision pairs.","أدخل أزواج معرّف العرض:المراجعة."));setAllocations(await promotionApi.allocate({promotionRef,qualificationId:result.qualificationId,quoteRef:refs[0],quoteRefs:refs,idempotencyKey:crypto.randomUUID()}));}catch(e){setMessage(e instanceof Error?e.message:String(e));}}
  return <div dir={lang==="ar"?"rtl":"ltr"}><h1>{t("Promotion qualification","التحقق من أهلية العرض")}</h1>
    <p>{t("Only approved rules and verified source records can qualify. A card or photo alone does not qualify; a referral does not transfer warranty coverage.","الأهلية تتطلب قواعد معتمدة وسجلات مصدر تم التحقق منها. البطاقة أو الصورة وحدها لا تكفي، والإحالة لا تنقل الضمان.")}</p>
    <section className="panel section-gap"><h2>{t("Review criteria","مراجعة المعايير")}</h2>
      <label>{t("Promotion policy ID","معرّف سياسة العرض")}<input value={promotionId} onChange={e=>setPromotionId(e.target.value)}/></label>
      <label>{t("Policy version","إصدار السياسة")}<input type="number" min="1" value={version} onChange={e=>setVersion(e.target.value)}/></label>
      <label>{t("Recipient ID","معرّف المستفيد")}<input value={beneficiaryId} onChange={e=>setBeneficiaryId(e.target.value)}/></label>
      <label>{t("Vehicle IDs, comma separated","معرّفات السيارات مفصولة بفواصل")}<input value={vehicleIdsText} onChange={e=>setVehicleIdsText(e.target.value)}/></label>
      <label>{t("Evidence type","نوع الدليل")}<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="warranty-reference">{t("Warranty reference","مرجع الضمان")}</option><option value="membership-verification">{t("Membership verification","التحقق من العضوية")}</option><option value="grouped-vehicles">{t("Grouped vehicles","السيارات المجمّعة")}</option></select></label>
      <label>{t("Source record ID","معرّف سجل المصدر")}<input value={referenceId} onChange={e=>setReferenceId(e.target.value)}/></label>
      <button className="btn" onClick={()=>void evaluate()}>{t("Check qualification","فحص الأهلية")}</button>
    </section>
    {["owner","branch-manager"].includes(actorRole)&&<section className="panel section-gap"><h2>{t("Record membership verification","تسجيل التحقق من العضوية")}</h2><p>{t("Use a protected source reference after checking the membership record. This action records your verification.","استخدم مرجع مصدر محمي بعد فحص سجل العضوية. يسجل هذا الإجراء تحققك.")}</p><label>{t("Branch ID","معرّف الفرع")}<input value={branchId} onChange={e=>setBranchId(e.target.value)}/></label><label>{t("Protected source reference","مرجع المصدر المحمي")}<input value={sourceRef} onChange={e=>setSourceRef(e.target.value)}/></label><label>{t("Expiry, optional","تاريخ الانتهاء، اختياري")}<input type="datetime-local" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label><button className="btn" onClick={()=>void verify()}>{t("Record verification","تسجيل التحقق")}</button></section>}
    {result&&<section className="panel section-gap"><h2>{result.state==="eligible"?t("Eligible","مؤهل"):result.state==="unconfigured"?t("Unconfigured","غير مهيأ"):t("Review required","تتطلب مراجعة")}</h2><ul>{result.criteria.map((x,i)=><li key={i}>{x}</li>)}</ul>{result.state!=="eligible"&&<p>{result.reasons.join(" ")}</p>}</section>}
    {result?.state==="eligible"&&<section className="panel section-gap"><h2>{t("Allocate against accepted quotes","تخصيص العرض لعروض الأسعار المقبولة")}</h2><label>{t("Accepted quote ID:revision pairs, comma separated, one per vehicle","أزواج معرّف العرض:المراجعة مفصولة بفواصل، واحد لكل سيارة")}<input value={quoteRefsText} onChange={e=>setQuoteRefsText(e.target.value)}/></label><button className="btn" onClick={()=>void allocate()}>{t("Reserve promotion units","حجز وحدات العرض")}</button></section>}
    {message&&<p role="alert">{message}</p>}{allocations.map(a=><PromotionAllocationDetail key={a.id} lang={lang} id={a.id}/>)}
  </div>;
}
