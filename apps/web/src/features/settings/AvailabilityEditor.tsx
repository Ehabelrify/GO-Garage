import {useEffect,useState,type FormEvent} from "react";

type Form={version:number;timezone:string;opensAt:string;closesAt:string;workingWeekdays:number[];slotMinutes:string;dailyIntakeLimit:string;cleanBays:string;generalBays:string;effectiveFrom:string;closures:string;reason:string};
const blank:Form={version:0,timezone:"",opensAt:"",closesAt:"",workingWeekdays:[],slotMinutes:"",dailyIntakeLimit:"",cleanBays:"",generalBays:"",effectiveFrom:"",closures:"",reason:""};
export function AvailabilityEditor({branches,lang}:{branches:{id:string;name:string}[];lang:"ar"|"en"}){
  const [branchId,setBranchId]=useState(branches[0]?.id??"");
  const [form,setForm]=useState<Form|null>(null);
  const [state,setState]=useState("");
  const [busy,setBusy]=useState(false);
  const t=(en:string,ar:string)=>lang==="ar"?ar:en;
  useEffect(()=>{let live=true;setForm(null);if(!branchId)return;
    void fetch(`/api/availability/config/${encodeURIComponent(branchId)}`,{credentials:"same-origin"}).then(async r=>{if(!r.ok)throw Error("read");return r.json()}).then(data=>{
      if(!live)return;
      setForm(data.status==="unconfigured"?{...blank}:{version:data.version,timezone:data.timezone,opensAt:String(data.opensAt).slice(0,5),closesAt:String(data.closesAt).slice(0,5),workingWeekdays:data.workingWeekdays,slotMinutes:String(data.slotMinutes),dailyIntakeLimit:String(data.dailyIntakeLimit),cleanBays:String(data.bayCounts?.clean??""),generalBays:String(data.bayCounts?.general??""),effectiveFrom:String(data.effectiveFrom).slice(0,10),closures:(data.closures??[]).map((c:{closed_date:string;reason:string})=>`${c.closed_date}: ${c.reason}`).join("\n"),reason:""});
      setState(data.status==="unconfigured"?t("Unconfigured. Complete every required field before saving.","غير مهيأ. أكمل جميع الحقول المطلوبة قبل الحفظ."):"");
    }).catch(()=>{if(live)setState(t("Configuration could not be loaded.","تعذر تحميل الإعدادات."));});return()=>{live=false};
  },[branchId,lang]);
  const save=async(event:FormEvent)=>{event.preventDefault();if(!form||busy)return;setBusy(true);setState("");
    const closures=form.closures.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{const match=/^(\d{4}-\d{2}-\d{2}):\s*(.+)$/.exec(line);return match?{date:match[1],reason:match[2]}:null});
    if(closures.some(c=>!c)){setState(t("Use YYYY-MM-DD: reason for each closure.","اكتب كل يوم إغلاق بصيغة YYYY-MM-DD: السبب."));setBusy(false);return;}
    try{const response=await fetch(`/api/availability/config/${encodeURIComponent(branchId)}`,{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({expectedVersion:form.version,timezone:form.timezone,opensAt:form.opensAt,closesAt:form.closesAt,workingWeekdays:form.workingWeekdays,closures,slotMinutes:Number(form.slotMinutes),dailyIntakeLimit:Number(form.dailyIntakeLimit),bayCounts:{clean:Number(form.cleanBays),general:Number(form.generalBays)},effectiveFrom:form.effectiveFrom,reason:form.reason})});
      const data=await response.json();if(!response.ok)throw Error(data.code??"SAVE_FAILED");setForm({...form,version:data.version,reason:""});setState(t("Availability configuration saved.","تم حفظ إعدادات المواعيد المتاحة."));}
    catch(error){setState(t("Configuration was not saved. Refresh if another owner changed it.","لم تُحفظ الإعدادات. حدّث الصفحة إذا غيّرها مالك آخر.")+` (${String(error)})`);}finally{setBusy(false);}
  };
  const field=(key:keyof Form,value:string)=>setForm(current=>current?{...current,[key]:value}:current);
  return <section className="panel section-gap" dir={lang==="ar"?"rtl":"ltr"}><h2>{t("Branch availability","مواعيد الفرع المتاحة")}</h2><p>{t("Approved local hours, calendar and capacity. No values are assumed.","ساعات العمل والتقويم والسعة المعتمدة. لا توجد قيم مفترضة.")}</p>
    <label>{t("Branch","الفرع")}<select className="field-select" value={branchId} onChange={e=>setBranchId(e.target.value)}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    {form&&<form onSubmit={event=>void save(event)}><div className="form-grid">
      <label className="form-field">{t("IANA timezone","المنطقة الزمنية IANA")}<input className="field-input" required value={form.timezone} onChange={e=>field("timezone",e.target.value)} placeholder="Africa/Cairo"/></label>
      <label className="form-field">{t("Opening time","وقت الفتح")}<input className="field-input" type="time" required value={form.opensAt} onChange={e=>field("opensAt",e.target.value)}/></label>
      <label className="form-field">{t("Closing time","وقت الإغلاق")}<input className="field-input" type="time" required value={form.closesAt} onChange={e=>field("closesAt",e.target.value)}/></label>
      <label className="form-field">{t("Slot grid (minutes)","الفاصل بين المواعيد بالدقائق")}<input className="field-input" type="number" min="1" required value={form.slotMinutes} onChange={e=>field("slotMinutes",e.target.value)}/></label>
      <label className="form-field">{t("Daily vehicle intake","عدد السيارات اليومي")}<input className="field-input" type="number" min="1" required value={form.dailyIntakeLimit} onChange={e=>field("dailyIntakeLimit",e.target.value)}/></label>
      <label className="form-field">{t("Clean bays","البايات النظيفة")}<input className="field-input" type="number" min="0" required value={form.cleanBays} onChange={e=>field("cleanBays",e.target.value)}/></label>
      <label className="form-field">{t("General bays","البايات العامة")}<input className="field-input" type="number" min="0" required value={form.generalBays} onChange={e=>field("generalBays",e.target.value)}/></label>
      <label className="form-field">{t("Effective from","ساري من")}<input className="field-input" type="date" required value={form.effectiveFrom} onChange={e=>field("effectiveFrom",e.target.value)}/></label>
      <fieldset className="form-field"><legend>{t("Working weekdays","أيام العمل")}</legend>{[0,1,2,3,4,5,6].map(day=><label key={day}><input type="checkbox" checked={form.workingWeekdays.includes(day)} onChange={e=>setForm(current=>current?{...current,workingWeekdays:e.target.checked?[...current.workingWeekdays,day]:current.workingWeekdays.filter(d=>d!==day)}:current)}/>{new Intl.DateTimeFormat(lang==="ar"?"ar-EG":"en",{weekday:"short",timeZone:"UTC"}).format(new Date(Date.UTC(2023,0,1+day)))}</label>)}</fieldset>
      <label className="form-field">{t("Dated closures, one per line: YYYY-MM-DD: reason","أيام الإغلاق، سطر لكل يوم: YYYY-MM-DD: السبب")}<textarea className="field-input" value={form.closures} onChange={e=>field("closures",e.target.value)}/></label>
      <label className="form-field">{t("Approval reason","سبب الاعتماد")}<input className="field-input" required value={form.reason} onChange={e=>field("reason",e.target.value)}/></label>
    </div><p role="status">{state}</p><button className="btn btn-primary" type="submit" disabled={busy}>{t("Save availability","حفظ المواعيد المتاحة")}</button></form>}
  </section>;
}
