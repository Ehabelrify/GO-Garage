import "./_group.css";
import { useState } from "react";
import { ArrowLeftRight, Check, Clock3, Users, Wrench } from "lucide-react";
import { AppLayout, Hold, PageHeading, PanelTitle, Stage, useGarageLang } from "./_shared/AppLayout";

type Work = { id:string; plate:string; vehicle:string; service:string; customer:string; stage:string; assigned:string; timing:string; delayed?:boolean };
const base: Work[] = [
  {id:"w1",plate:"س ن ج ٤٨٢١",vehicle:"Toyota Corolla 2022",service:"تظليل نوافذ",customer:"مروان السيد",stage:"قيد التنفيذ",assigned:"محمود علي",timing:"تسليم ١٢:٣٠",delayed:true},
  {id:"w2",plate:"د ط ب ٣٠٦٥",vehicle:"Kia Sportage 2021",service:"طلاء سيراميك",customer:"كريم عادل",stage:"فحص الجودة",assigned:"يوسف سامح",timing:"تسليم ١٤:٠٠"},
  {id:"w3",plate:"ع ص م ٨٤٤٠",vehicle:"Mercedes C200 2020",service:"فحص أولي",customer:"هبة مجدي",stage:"بانتظار الفني",assigned:"غير معيّن",timing:"استلام ١١:٠٠"},
  {id:"w4",plate:"م و س ٩٢٥٤",vehicle:"Peugeot 3008 2022",service:"حماية واجهة PPF",customer:"سلمى أمين",stage:"قيد التنفيذ",assigned:"عمر شريف",timing:"تسليم ١٦:٣٠"},
];
export function BranchManager() {
  const [items,setItems]=useState(base);
  const [notice,setNotice]=useState("");
  const ar=useGarageLang()==="ar";
  const move=(id:string)=>{setItems(list=>list.map(item=>item.id===id?{...item,assigned:item.assigned==="غير معيّن"?"محمود علي":"يوسف سامح",stage:item.stage==="بانتظار الفني"?"قيد التنفيذ":item.stage}:item));setNotice(ar?"تم تحديث توزيع الفريق لهذا العرض.":"Team assignment updated in this view.");};
  return <AppLayout page="BranchManager" branch={ar?"الفرع أ":"Branch A"}>
    <PageHeading eyebrow={ar?"مسؤول الفرع · الفرع أ":"BRANCH MANAGER · BRANCH A"} title={ar?"تشغيل الفرع أ":"Branch A operations"} subtitle={ar?"تابع ضغط الورشة، المركبات المتأخرة، وتسليم العمل بين الاستقبال والفنيين." : "Track workshop load, delayed vehicles, and handoffs between reception and technicians."} />
    <div className="go-grid go-stats">
      <Stat icon={Wrench} label={ar?"مركبات في الورشة":"Vehicles in workshop"} value="٧" foot={ar?"من ٨ استلامات مسموحة اليوم":"7 of 8 daily drop-offs"} />
      <Stat icon={Clock3} label={ar?"تحتاج متابعة":"Needs attention"} value="٢" foot={ar?"مركبة متأخرة · مهمة غير معيّنة":"1 late · 1 unassigned"} />
      <Stat icon={Users} label={ar?"الفريق على المناوبة":"Team on shift"} value="٥" foot={ar?"٣ فنيين · استقبال · مدير":"3 technicians · reception · manager"} />
      <Stat icon={Check} label={ar?"جاهزة للتسليم":"Ready for pickup"} value="٢" foot={ar?"تم إغلاق فحص الجودة":"QC completed"} />
    </div>
    <div className="go-grid go-columns">
      <section className="go-panel"><PanelTitle title={ar?"طابور الورشة":"Workshop queue"} detail={ar?"الأعمال المفتوحة مرتبة حسب أولوية التسليم":"Open work ordered by pickup priority"} /><div className="go-handoff">{items.map(item=><article className="go-work-card" key={item.id}><div><div className="go-work-title go-mono">{item.plate}<span style={{fontFamily:"inherit",marginInlineStart:9,fontSize:12}}>{item.vehicle}</span></div><div className="go-work-meta"><span>{item.service}</span><span>{ar?"العميل":"Customer"}: {item.customer}</span><span>{item.timing}</span><span>{ar?"الفني":"Assigned"}: {ar?item.assigned:translateEmployee(item.assigned)}</span></div><div className="go-steps"><Step active={item.stage==="بانتظار الفني"} done /><Step active={item.stage==="قيد التنفيذ"} done={item.stage!=="بانتظار الفني"} /><Step active={item.stage==="فحص الجودة"} done={item.stage==="جاهز للتسليم"} /></div></div><div className="go-work-actions"><Stage tone={item.delayed?"warn":item.stage==="فحص الجودة"?"ok":"info"}>{ar?item.stage:translateStage(item.stage)}</Stage></div></article>)}</div></section>
      <div className="go-grid">
        <section className="go-panel"><PanelTitle title={ar?"تأخيرات وتسليمات":"Delays & handoffs"} detail={ar?"تواصل مباشر بين الأدوار قبل وعد العميل":"Coordinate before committing to a customer"} /><Handoff title={ar?"Corolla · متأخرة ٤٥ دقيقة":"Corolla · 45 minutes late"} detail={ar?"محمود علي → مدير الفرع · تحديث موعد الاستلام":"Mahmoud Ali → branch manager · revise pickup time"} tone="warn" /><Handoff title={ar?"فحص أولي ينتظر التعيين":"Inspection awaiting assignment"} detail={ar?"الاستقبال سلّم المفتاح · يلزم تعيين فني":"Reception handed over the key · assign a technician"} tone="info" /></section>
        <section className="go-panel"><PanelTitle title={ar?"تغطية الفريق":"Team coverage"} detail={ar?"توزيع العمل المفتوح حالياً":"Current open-job assignment"} /><Team name="محمود علي" en="Mahmoud Ali" work={ar?"تظليل · ٢ مركبة":"Tint · 2 vehicles"} /><Team name="يوسف سامح" en="Youssef Sameh" work={ar?"سيراميك · ١ مركبة":"Ceramic · 1 vehicle"} /><Team name="عمر شريف" en="Omar Sherif" work={ar?"PPF · ١ مركبة":"PPF · 1 vehicle"} /></section>
      </div>
    </div>
    <section className="go-panel go-section-gap"><PanelTitle title={ar?"طلبات تحتاج تسليماً":"Handoffs to complete"} detail={ar?"إجراءات مدير الفرع التالية":"Next actions for the branch manager"} /><div className="go-grid go-columns"><div className="go-setting"><div className="go-setting-title">{ar?"تعيين الفحص الأولي":"Assign the initial inspection"}</div><p className="go-setting-desc">{ar?"Mercedes C200 · هبة مجدي · تم الاستلام ١٠:١٢":"Mercedes C200 · Heba Magdy · received 10:12"}</p><button className="go-button" onClick={()=>move("w3")}><ArrowLeftRight size={14}/>{ar?"تعيين للفريق":"Assign to team"}</button></div><div className="go-setting"><div className="go-setting-title">{ar?"تأكيد موعد تسليم Corolla":"Confirm Corolla pickup time"}</div><p className="go-setting-desc">{ar?"تجاوزت الخدمة الموعد المتوقع بـ٤٥ دقيقة.":"Service is 45 minutes past the expected completion."}</p><button className="go-button" onClick={()=>setNotice(ar?"تم تسجيل المتابعة لمدير الفرع.":"Follow-up noted for the branch manager.")}><Check size={14}/>{ar?"تسجيل المتابعة":"Log follow-up"}</button></div></div>{notice&&<div className="go-form-notice" role="status">{notice}</div>}</section>
    <section className="go-panel go-section-gap"><PanelTitle title={ar?"قنوات غير متاحة":"Unavailable workflows"} detail={ar?"لا تؤثر في تسليم المركبات داخل هذا الفرع حالياً.":"These do not affect the branch vehicle handoff today."} /><div className="go-grid go-columns"><Hold title={ar?"الضمان":"Warranty"} detail={ar?"معالجة المطالبات غير متاحة في مساحة العمل الحالية.":"Claims handling is unavailable in this workspace."}/><Hold title={ar?"المخزون":"Inventory"} detail={ar?"متابعة القطع والمواد لم تُفعّل بعد.":"Parts and materials tracking is not enabled yet."}/></div></section>
  </AppLayout>;
}
function Stat({icon:Icon,label,value,foot}:{icon:typeof Wrench;label:string;value:string;foot:string}){return <div className="go-stat"><div className="go-stat-top"><span>{label}</span><span className="go-stat-icon"><Icon size={16}/></span></div><div><div className="go-stat-value">{value}</div><div className="go-stat-foot">{foot}</div></div></div>}
function Handoff({title,detail,tone}:{title:string;detail:string;tone:"warn"|"info"}){return <div className="go-handoff-row"><span className="go-handoff-mark"><Clock3 size={14}/></span><div className="go-handoff-copy"><strong>{title}</strong><span>{detail}</span></div><Stage tone={tone}>{tone==="warn"?"متأخر":"متابعة"}</Stage></div>}
function Step({active,done}:{active:boolean;done:boolean}){return <span className={`go-step ${done?"done":""} ${active?"current":""}`}>{active?"قيد التنفيذ":done?"تم":"لاحقاً"}</span>}
function Team({name,en,work}:{name:string;en:string;work:string}){return <div className="go-branch-row"><div className="go-branch-main"><div className="go-brand-mark" style={{width:31,height:31,color:"var(--garage-teal)",borderColor:"var(--garage-line)"}}>{name.slice(0,1)}</div><div><div className="go-branch-name">{name}<span className="go-secondary-cell go-ltr-data"> · {en}</span></div><div className="go-branch-detail">{work}</div></div></div><Stage tone="ok">متاح</Stage></div>}
function translateStage(value:string){return value==="قيد التنفيذ"?"In service":value==="فحص الجودة"?"Quality check":value==="بانتظار الفني"?"Awaiting technician":"Ready for pickup";}
function translateEmployee(value:string){return value==="غير معيّن"?"Unassigned":value==="محمود علي"?"Mahmoud Ali":value==="يوسف سامح"?"Youssef Sameh":"Omar Sherif";}
