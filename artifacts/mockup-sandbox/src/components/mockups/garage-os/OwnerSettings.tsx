import "./_group.css";
import { useState } from "react";
import { Check, CircleHelp, RotateCcw, Settings2 } from "lucide-react";
import { AppLayout, PageHeading, Stage, useGarageLang } from "./_shared/AppLayout";

type Config = { id: string; title: string; category: string; scope: "business" | "branch"; values: Record<string,string>; unit?: string; options?: string[]; detail: string };
const initial: Config[] = [
  { id:"booking-confirmation",title:"تأكيد الحجز",category:"الحجوزات",scope:"business",values:{business:"مراجعة الاستقبال"},options:["تأكيد فوري عند توفر السعة","مراجعة الاستقبال","مراجعة مدير الفرع"],detail:"تُراجع طلبات الحجز قبل تثبيت موعد العميل." },
  { id:"daily-dropoff-limit",title:"الحد الأقصى للاستلام اليومي",category:"السعة",scope:"branch",values:{branchA:"8",branchB:"6"},unit:"مركبات / يوم",detail:"يحد من قبول المركبات الجديدة بصرف النظر عن ساعات الباي." },
  { id:"branch-working-hours",title:"ساعات العمل التشغيلية",category:"السعة",scope:"branch",values:{branchA:"10",branchB:"10"},unit:"ساعة / يوم",detail:"ميزانية ساعات العمل المستخدمة في احتساب سعة البايات." },
  { id:"clean-bays",title:"البايات النظيفة",category:"السعة",scope:"branch",values:{branchA:"2",branchB:"1"},unit:"باي",detail:"تُستخدم لخدمات السيراميك وحماية الطلاء التي تتطلب مساحة نظيفة." },
  { id:"general-bays",title:"البايات العامة",category:"السعة",scope:"branch",values:{branchA:"4",branchB:"3"},unit:"باي",detail:"تُستخدم للفحص والتظليل وترقيات الصوت." },
  { id:"weekly-day-off",title:"يوم الإغلاق الأسبوعي",category:"السعة",scope:"branch",values:{branchA:"الجمعة",branchB:"الجمعة"},options:["الجمعة","الأحد","لا يوجد"],detail:"يُستبعد من مواعيد الاستلام المتاحة." },
  { id:"tint-hours",title:"مدة خدمة تظليل النوافذ",category:"الخدمات",scope:"business",values:{business:"3"},unit:"ساعات باي",detail:"المدة المحجوزة للباي العام عند جدولة خدمة التظليل." },
  { id:"ceramic-hours",title:"مدة خدمة الطلاء السيراميكي",category:"الخدمات",scope:"business",values:{business:"20"},unit:"ساعة باي",detail:"المدة المحجوزة للباي النظيف. يمكن أن تمتد الخدمة لأكثر من يوم." },
];
const scopeLabels: Record<string,string> = {business:"على مستوى الشركة",branchA:"الفرع أ",branchB:"الفرع ب"};
const onHold = [
  { ar:"نموذج مشاركة الفروع", en:"Branch-sharing model", arDetail:"مشاركة الموارد بين الفرعين غير مفعلة.", enDetail:"Sharing resources between branches is inactive." },
  { ar:"متطلبات صور الاستلام", en:"Intake-photo requirements", arDetail:"اشتراط صور محددة قبل الاستلام غير مفعل.", enDetail:"Required photo capture at intake is inactive." },
  { ar:"التعيين الآلي للفنيين", en:"Automated technician assignment", arDetail:"خيارات التعيين الآلي للفنيين غير متاحة.", enDetail:"Automated technician assignment choices are inactive." },
  { ar:"مراحل مخصصة لأمر العمل", en:"Custom job lifecycle stages", arDetail:"إضافة مراحل انتظار أو إعادة عمل غير متاحة.", enDetail:"Custom hold or rework stages are inactive." },
  { ar:"رسائل حالة العميل", en:"Customer status messaging", arDetail:"الرسائل التلقائية للعملاء غير مفعلة.", enDetail:"Automated customer status messages are inactive." },
  { ar:"واتساب", en:"WhatsApp", arDetail:"قناة واتساب غير متصلة.", enDetail:"WhatsApp is not connected." },
  { ar:"الضمان", en:"Warranty", arDetail:"إدارة مطالبات الضمان غير متاحة.", enDetail:"Warranty claims are unavailable." },
  { ar:"المخزون", en:"Inventory", arDetail:"متابعة القطع والمواد غير متاحة.", enDetail:"Parts and materials tracking is unavailable." },
  { ar:"المدفوعات", en:"Payments", arDetail:"تسجيل المدفوعات غير متاح.", enDetail:"Payment processing is unavailable." },
];
const english:Record<string,string>={
  "تأكيد الحجز":"Booking confirmation","الحجوزات":"Bookings","مراجعة الاستقبال":"Reception review","تأكيد فوري عند توفر السعة":"Instant when capacity fits","مراجعة مدير الفرع":"Branch manager review","الحد الأقصى للاستلام اليومي":"Maximum daily drop-offs","السعة":"Capacity","مركبات / يوم":"vehicles / day","ساعات العمل التشغيلية":"Operating hours","ساعة / يوم":"hours / day","البايات النظيفة":"Clean bays","باي":"bays","البايات العامة":"General bays","يوم الإغلاق الأسبوعي":"Weekly closure","الجمعة":"Friday","الأحد":"Sunday","لا يوجد":"None","مدة خدمة تظليل النوافذ":"Window tint duration","الخدمات":"Services","ساعات باي":"bay-hours","مدة خدمة الطلاء السيراميكي":"Ceramic coating duration",
  "تُراجع طلبات الحجز قبل تثبيت موعد العميل.":"Reception reviews booking requests before confirming a customer appointment.",
  "يحد من قبول المركبات الجديدة بصرف النظر عن ساعات الباي.":"Caps new vehicle intake independently of available bay-hours.",
  "ميزانية ساعات العمل المستخدمة في احتساب سعة البايات.":"Operating-hour budget used to calculate bay capacity.",
  "تُستخدم لخدمات السيراميك وحماية الطلاء التي تتطلب مساحة نظيفة.":"Used for ceramic coating and paint protection services requiring a clean space.",
  "تُستخدم للفحص والتظليل وترقيات الصوت.":"Used for inspections, tint, and audio upgrades.",
  "يُستبعد من مواعيد الاستلام المتاحة.":"Excluded from available drop-off dates.",
  "المدة المحجوزة للباي العام عند جدولة خدمة التظليل.":"General-bay time reserved when scheduling a window tint service.",
  "المدة المحجوزة للباي النظيف. يمكن أن تمتد الخدمة لأكثر من يوم.":"Clean-bay time reserved for the service. Work can span more than one day.",
};
const tx=(value:string,ar:boolean)=>ar?value:english[value]??value;

export function OwnerSettings() {
  const ar=useGarageLang()==="ar";
  const [configs,setConfigs]=useState(initial);
  const [saved,setSaved]=useState(initial);
  const [dirty,setDirty]=useState(false);
  const [message,setMessage]=useState("");
  const patch=(id:string,scope:string,value:string)=>{setConfigs(list=>list.map(item=>item.id===id?{...item,values:{...item.values,[scope]:value}}:item));setDirty(true);setMessage("");};
  const save=()=>{setSaved(configs.map(item=>({...item,values:{...item.values}})));setDirty(false);setMessage(ar?"تم حفظ التغييرات في إعدادات مساحة العمل.":"Changes saved to workspace settings.");};
  const reset=()=>{setConfigs(saved.map(item=>({...item,values:{...item.values}})));setDirty(false);setMessage(ar?"تم التراجع عن التغييرات غير المحفوظة.":"Unsaved changes reverted.");};
  return <AppLayout page="OwnerSettings">
    <PageHeading eyebrow={ar?"إعدادات الحساب · المالك":"ACCOUNT SETTINGS · OWNER"} title={ar?"إعدادات التشغيل":"Operating settings"} subtitle={ar?"القواعد الحالية التي تنظّم السعة والحجوزات والخدمات وسير العمل في فرعي جو ستورز.":"Current rules for capacity, bookings, services, and workshop flow at both Go Stores branches."} extra={<button className="go-button" type="button" onClick={reset} disabled={!dirty}><RotateCcw size={14} />{ar?"تراجع":"Undo"}</button>} />
    <div className="go-toolbar"><div className="go-context"><Settings2 size={15} /> {ar?"٨ إعدادات يطبقها الخادم":"8 server-enforced settings"}</div><Stage tone={dirty?"warn":"ok"}>{dirty?(ar?"تغييرات غير محفوظة":"Unsaved changes"):(ar?"الإعدادات محفوظة":"Settings saved")}</Stage></div>
    <div className="go-setting-list">{configs.map(item=><Setting key={item.id} config={item} onChange={patch} ar={ar} />)}</div>
    <div className="go-savebar"><div className={`go-save-copy ${!dirty?"saved":""}`}><Check size={15} />{message || (dirty?(ar?"هناك تغييرات لم تحفظ بعد":"Changes are not saved"):(ar?"لا توجد تغييرات معلقة":"No pending changes"))}</div><button className="go-button primary" type="button" onClick={save} disabled={!dirty}><Check size={14} />{ar?"حفظ الإعدادات":"Save settings"}</button></div>
    <section className="go-panel go-section-gap"><div className="go-panel-title"><div><h2>{ar?"غير مفعّل حالياً":"Not active yet"}</h2><p>{ar?"هذه الوظائف ظاهرة للوضوح فقط، ولا توجد لها إعدادات أو إجراءات متاحة.":"Visible for clarity only; these areas have no controls or available actions."}</p></div></div><div className="go-grid go-columns">{onHold.map(item=><div key={item.en} className="go-onhold"><div><strong>{ar?item.ar:item.en}</strong><p>{ar?item.arDetail:item.enDetail}</p></div><span className="go-hold-label">ON HOLD</span></div>)}</div></section>
  </AppLayout>;
}

function Setting({config,onChange,ar}:{config:Config;onChange:(id:string,scope:string,value:string)=>void;ar:boolean}) {
  const scopes=config.scope==="business"?["business"]:["branchA","branchB"];
  return <article className="go-setting"><div className="go-setting-head"><div><div className="go-setting-title">{tx(config.title,ar)}</div><div className="go-setting-meta"><span className="go-chip">{tx(config.category,ar)}</span><span className="go-chip">{ar?(config.scope==="business"?"نطاق الشركة":"نطاق الفرع"):(config.scope==="business"?"Business-wide":"Branch-specific")}</span></div></div><div style={{display:"grid",gap:7,minWidth:"min(210px,45%)"}}>{scopes.map(scope=><div key={scope} style={{display:"flex",alignItems:"center",gap:7}}><span className="go-setting-unit" style={{width:65}}>{ar?scopeLabels[scope]:scope==="business"?"Business-wide":scope==="branchA"?"Branch A":"Branch B"}</span>{config.options?<select className="go-setting-control" value={config.values[scope]} onChange={e=>onChange(config.id,scope,e.target.value)}>{config.options.map(option=><option key={option} value={option}>{tx(option,ar)}</option>)}</select>:<div className="go-setting-number"><input aria-label={`${tx(config.title,ar)} — ${ar?scopeLabels[scope]:scope}`} type="number" min="0" value={config.values[scope]} onChange={e=>onChange(config.id,scope,e.target.value)} /><span className="go-setting-unit">{tx(config.unit??"",ar)}</span></div>}</div>)}</div></div><div className="go-setting-desc">{tx(config.detail,ar)}</div><div className="go-setting-foot"><span>{ar?"القيمة الحالية من إعدادات جو ستورز":"Current value in Go Stores settings"}</span><span><CircleHelp size={12} style={{verticalAlign:"middle",marginInlineEnd:4}} />{ar?"تُطبق حسب النطاق المحدد":"Applied within selected scope"}</span></div></article>;
}
