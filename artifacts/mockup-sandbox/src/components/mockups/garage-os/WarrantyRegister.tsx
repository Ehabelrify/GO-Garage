import "./_group.css";
import "./WarrantyRegister.css";
import { BadgeCheck, ClipboardCheck, FileText, ShieldAlert, ShieldCheck, Wrench } from "lucide-react";
import { AppLayout, Hold, PageHeading, useGarageLang } from "./_shared/AppLayout";

const stages = [
  { icon: Wrench, en: "Service completed", ar: "اكتمال الخدمة" },
  { icon: FileText, en: "Coverage record", ar: "سجل التغطية" },
  { icon: ClipboardCheck, en: "Claim review", ar: "مراجعة المطالبة" },
  { icon: BadgeCheck, en: "Owner decision", ar: "قرار المالك" },
];

export function WarrantyRegister() {
  const ar = useGarageLang() === "ar";

  return (
    <AppLayout page="OwnerSettings" branch={ar ? "كل الفروع" : "All branches"}>
      <div className="warranty-page">
        <PageHeading
          eyebrow={ar ? "إعدادات المالك · التغطية" : "OWNER SETTINGS · COVERAGE"}
          title={ar ? "سجل الضمانات" : "Warranty register"}
          subtitle={ar
            ? "تصميم مستقبلي لمسارات التغطية والمطالبات. لم يتم اعتماد سياسة ضمان أو تفعيل سجلات بعد."
            : "A future workspace for coverage and claims. No warranty policy is approved and no records are active."}
          extra={<span className="go-hold-label">{ar ? "غير مفعّل" : "ON HOLD"}</span>}
        />

        <Hold
          title={ar ? "الضمانات غير مفعّلة" : "Warranties are not active"}
          detail={ar
            ? "لا توجد تغطية سارية أو مطالبات محفوظة. لن يصدر النظام وعداً أو شهادة ضمان حتى تعتمد الشروط وآلية المطالبة."
            : "There is no active coverage or saved claim data. Garage OS will not issue a warranty promise or certificate until terms and claims handling are approved."}
        />

        <section className="warranty-overview">
          <div className="warranty-overview-title">
            <div><span className="warranty-kicker">{ar ? "الحالة الحالية" : "CURRENT STATE"}</span><h2>{ar ? "لا توجد سياسات منشورة" : "No published policies"}</h2></div>
            <span className="warranty-lock"><ShieldAlert size={18} />{ar ? "بانتظار اعتماد المالك" : "Owner approval required"}</span>
          </div>
          <div className="warranty-metrics">
            <div><span>{ar ? "تغطيات نشطة" : "Active coverage"}</span><strong>—</strong><small>{ar ? "لم يتم الإعداد" : "Not configured"}</small></div>
            <div><span>{ar ? "مطالبات مفتوحة" : "Open claims"}</span><strong>—</strong><small>{ar ? "لا توجد بيانات" : "No records"}</small></div>
            <div><span>{ar ? "إصدارات السياسة" : "Policy versions"}</span><strong>0</strong><small>{ar ? "لا توجد سياسة معتمدة" : "No approved policy"}</small></div>
          </div>
          <div className="warranty-flow">
            <span className="warranty-kicker">{ar ? "مسار مقترح · غير نشط" : "PROPOSED WORKFLOW · INACTIVE"}</span>
            <div className="warranty-flow-stages">
              {stages.map(({ icon: Icon, en, ar: stageAr }, index) => <div className="warranty-flow-stage" key={en}>
                <div className="warranty-stage-icon"><Icon size={17} /></div>
                <div><span>{String(index + 1).padStart(2, "0")}</span><strong>{ar ? stageAr : en}</strong></div>
              </div>)}
            </div>
          </div>
        </section>

        <div className="warranty-bottom">
          <section className="go-panel">
            <div className="go-panel-title">
              <div><h2>{ar ? "قرارات مطلوبة قبل البناء" : "Decisions needed before build"}</h2><p>{ar ? "تحدد هذه النقاط ما يمكن للنظام أن يعد به العميل." : "These choices define what the system can promise customers."}</p></div>
              <ShieldCheck size={16} color="var(--garage-teal)" />
            </div>
            <div className="warranty-decisions">
              <Decision number="01" title={ar ? "الخدمات المؤهلة" : "Eligible services"} detail={ar ? "الخدمات والمنتجات التي تشملها التغطية." : "Which services and products qualify."} />
              <Decision number="02" title={ar ? "بداية المدة ونهايتها" : "Coverage start and term"} detail={ar ? "تاريخ بدء التغطية ومدتها وآلية انتهائها." : "When coverage starts, how long it lasts, and how it ends."} />
              <Decision number="03" title={ar ? "الاستثناءات وشروط الإبطال" : "Exclusions and void conditions"} detail={ar ? "الأضرار أو الحالات غير المشمولة." : "Damage or situations that are not covered."} />
              <Decision number="04" title={ar ? "المطالبة والمراجعة" : "Claim and review process"} detail={ar ? "المستندات المطلوبة، المسؤول، ووقت الرد." : "Evidence required, who reviews, and response time."} />
            </div>
          </section>
          <section className="warranty-note">
            <div className="warranty-note-icon"><ShieldAlert size={17} /></div>
            <div>
              <span className="warranty-kicker">{ar ? "حدود التصميم" : "SCOPE NOTE"}</span>
              <h2>{ar ? "لا توجد تغييرات حية" : "Nothing is live yet"}</h2>
              <p>{ar
                ? "هذه الشاشة تصور مساحة العمل المستقبلية فقط. لا يوجد سجل عملاء أو تغطية أو مطالبة يمكن تعديله من هنا."
                : "This screen only describes a future workspace. There are no customer, coverage, or claim records to edit here."}</p>
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}

function Decision({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <div className="warranty-decision"><span>{number}</span><div><strong>{title}</strong><p>{detail}</p></div></div>;
}
