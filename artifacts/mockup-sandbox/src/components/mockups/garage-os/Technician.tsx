import "./_group.css";
import { useState } from "react";
import { ArrowRight, Check, Clock3, ClipboardCheck, Wrench } from "lucide-react";
import { AppLayout, Hold, PageHeading, Stage, useGarageLang } from "./_shared/AppLayout";

type Job={id:string;plate:string;vehicle:string;customer:string;customerEn:string;service:string;serviceEn:string;stage:"in-service"|"qc"|"ready";bay:string;bayEn:string;due:string;check:string;checkEn:string};
const initial:Job[]=[
  {id:"t1",plate:"س ن ج ٤٨٢١",vehicle:"Toyota Corolla 2022",customer:"مروان السيد",customerEn:"Marwan El Sayed",service:"تركيب عازل حراري · تظليل نوافذ",serviceEn:"Heat-rejection film · window tint",stage:"in-service",bay:"باي عام ٢",bayEn:"General bay 2",due:"١٢:٣٠",check:"تنظيف الزجاج قبل التركيب",checkEn:"Clean glass before film application"},
  {id:"t2",plate:"د ط ب ٣٠٦٥",vehicle:"Kia Sportage 2021",customer:"كريم عادل",customerEn:"Karim Adel",service:"طبقة سيراميك · فحص اللمعان",serviceEn:"Ceramic layer · gloss inspection",stage:"qc",bay:"باي نظيف ١",bayEn:"Clean bay 1",due:"١٤:٠٠",check:"مراجعة الحواف وتسجيل نتيجة الجودة",checkEn:"Inspect edges and record quality result"},
  {id:"t3",plate:"م و س ٩٢٥٤",vehicle:"Peugeot 3008 2022",customer:"سلمى أمين",customerEn:"Salma Amin",service:"حماية واجهة PPF",serviceEn:"Front-end PPF protection",stage:"in-service",bay:"باي نظيف ٢",bayEn:"Clean bay 2",due:"١٦:٣٠",check:"التحقق من تطابق القالب قبل التثبيت",checkEn:"Verify template alignment before install"},
];
const labels={ "in-service":"قيد التنفيذ",qc:"فحص الجودة",ready:"جاهزة للتسليم" };
export function Technician(){
  const [jobs,setJobs]=useState(initial);const [notice,setNotice]=useState("");const ar=useGarageLang()==="ar";
  const advance=(id:string)=>{setJobs(old=>old.map(job=>job.id===id?{...job,stage:job.stage==="in-service"?"qc":"ready"}:job));setNotice(ar?"تم تحديث مرحلة المركبة.":"Vehicle stage updated.");};
  const next=(stage:Job["stage"])=>stage==="in-service"?(ar?"إرسال لفحص الجودة":"Send to quality check"):stage==="qc"?(ar?"اعتماد الجاهزية":"Mark ready for pickup"):(ar?"تم التسليم":"Delivered");
  return <AppLayout page="Technician" branch={ar?"الفرع أ":"Branch A"}>
    <PageHeading eyebrow={ar?"الفني · الفرع أ":"TECHNICIAN · BRANCH A"} title={ar?"أعمالي اليوم":"My work today"} subtitle={ar?"كل مركبة لها مرحلة تالية واضحة. سجّل الخطوة التالية بعد اكتمالها حتى يعرف الفريق أين وصلت." : "Each vehicle has one clear next stage. Record it when complete so the team knows where the work stands."} />
    <div className="go-toolbar"><span className="go-context"><Wrench size={15}/>{ar?"محمود علي · فني تظليل وسيراميك":"Mahmoud Ali · Tint & ceramic technician"}</span><Stage tone="info">{jobs.filter(job=>job.stage!=="ready").length} {ar?"مهام مفتوحة":"open tasks"}</Stage></div>
    <div className="go-grid">{jobs.map(job=><JobCard key={job.id} job={job} ar={ar} next={next(job.stage)} onAdvance={()=>advance(job.id)}/>)}</div>
    {notice&&<div className="go-form-notice" role="status">{notice}</div>}
    <section className="go-grid go-columns go-section-gap"><div className="go-panel"><PanelTitle title={ar?"تسلسل العمل":"Work sequence"} detail={ar?"لكل أمر عمل خطوة تشغيلية تالية واحدة.":"One valid operational next action per job."}/><Sequence items={ar?["قيد التنفيذ ← فحص الجودة","فحص الجودة ← جاهزة للتسليم","جاهزة للتسليم ← تسليم للعميل"]:["In service → Quality check","Quality check → Ready for pickup","Ready for pickup → Customer handoff"]}/></div><Hold title={ar?"قطع الغيار والمخزون":"Parts & inventory"} detail={ar?"المخزون غير متاح في مساحة الفني. أبلغ مدير الفرع إذا كان جزء مطلوباً غير متوفر.":"Inventory is unavailable in this workspace. Tell the branch manager if a required part is missing."}/></section>
  </AppLayout>;
}
function JobCard({job,ar,next,onAdvance}:{job:Job;ar:boolean;next:string;onAdvance:()=>void}){
  const done=job.stage==="ready";
  return <article className="go-work-card"><div><div className="go-work-title go-mono">{job.plate}<span style={{fontFamily:"inherit",marginInlineStart:10,fontSize:13}}>{job.vehicle}</span></div><div className="go-work-meta"><span>{ar?"العميل":"Customer"}: {ar?job.customer:job.customerEn}</span><span>{ar?job.service:job.serviceEn}</span><span>{ar?"الموقع":"Bay"}: {ar?job.bay:job.bayEn}</span><span>{ar?"موعد التسليم المتوقع":"Expected pickup"}: {ar?job.due:job.due.replace("١٢:٣٠","12:30 PM").replace("١٤:٠٠","2:00 PM").replace("١٦:٣٠","4:30 PM")}</span></div><div className="go-steps"><span className="go-step done">{ar?"تم الاستلام":"Received"}</span><span className={`go-step ${job.stage==="in-service"?"current":"done"}`}>{ar?"قيد التنفيذ":"In service"}</span><span className={`go-step ${job.stage==="qc"?"current":job.stage==="ready"?"done":""}`}>{ar?"فحص الجودة":"Quality check"}</span><span className={`go-step ${job.stage==="ready"?"current":""}`}>{ar?"جاهزة":"Ready"}</span></div><div className="go-handoff-row" style={{marginTop:9,paddingBottom:0}}><span className="go-handoff-mark"><ClipboardCheck size={14}/></span><div className="go-handoff-copy"><strong>{ar?"الخطوة المطلوبة":"Next check"}</strong><span>{ar?job.check:job.checkEn}</span></div></div></div><div className="go-work-actions" style={{flexDirection:"column",alignItems:"flex-end"}}><Stage tone={done?"ok":job.stage==="qc"?"warn":"info"}>{ar?labels[job.stage]:job.stage==="in-service"?"In service":job.stage==="qc"?"Quality check":"Ready"}</Stage><button className="go-button primary" disabled={done} onClick={onAdvance}>{done?<Check size={14}/>:<ArrowRight size={14}/ >}{next}</button></div></article>;
}
function PanelTitle({title,detail}:{title:string;detail:string}){return <div className="go-panel-title"><div><h2>{title}</h2><p>{detail}</p></div></div>}
function Sequence({items}:{items:string[]}){return <div className="go-handoff">{items.map(item=><div className="go-handoff-row" key={item}><span className="go-handoff-mark"><Clock3 size={14}/></span><div className="go-handoff-copy">{item}</div></div>)}</div>}
