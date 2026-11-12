import "./_group.css";
import "./SharedInbox.css";
import { type ReactNode } from "react";
import { ArrowUpRight, Check, LockKeyhole, MessageCircle, Send, ShieldCheck, Smartphone } from "lucide-react";
import { AppLayout, PageHeading, useGarageLang } from "./_shared/AppLayout";

export function SharedInbox() {
  const ar = useGarageLang() === "ar";

  return (
    <AppLayout page="Receptionist" branch={ar ? "الفرع أ" : "Branch A"}>
      <div className="receptionist-scope inbox-page">
        <PageHeading
          eyebrow={ar ? "قنوات العملاء · قيد التجهيز" : "CUSTOMER CHANNELS · ON HOLD"}
          title={ar ? "صندوق واتساب المشترك" : "Shared WhatsApp inbox"}
          subtitle={ar
            ? "واجهة مستقبلية لتجميع خطوط الفروع في مساحة موحدة، مع بقاء الوصول محدداً حسب دور الموظف والفرع."
            : "A future shared workspace for branch lines, with visibility limited by staff role and branch."}
          extra={<span className="go-hold-label">{ar ? "غير متصل" : "NOT CONNECTED"}</span>}
        />

        <section className="inbox-hold-banner">
          <div className="inbox-hold-icon"><MessageCircle size={18} /></div>
          <div>
            <span className="inbox-kicker">{ar ? "لا توجد رسائل مرتبطة" : "NO MESSAGES CONNECTED"}</span>
            <h2>{ar ? "القنوات غير مفعّلة بعد" : "Channels are not active yet"}</h2>
            <p>{ar
              ? "لن تظهر رسائل عملاء هنا ولن تُرسل أي ردود حتى اعتماد وربط خطوط واتساب للأعمال. هذه الواجهة لا ترسل رسائل."
              : "Customer messages will not appear, and replies cannot be sent until approved WhatsApp Business lines are connected. This screen does not send messages."}</p>
          </div>
          <a className="inbox-jump-link" href="#inbox-setup">{ar ? "متطلبات الربط" : "Connection requirements"} <ArrowUpRight size={14} /></a>
        </section>

        <div className="inbox-layout">
          <section className="inbox-panel inbox-lines">
            <div className="inbox-panel-head">
              <div><h2>{ar ? "خطوط الفروع" : "Branch lines"}</h2><p>{ar ? "كل خط يرتبط بفرع ونطاق وصول." : "Each line belongs to a branch and an access scope."}</p></div>
              <span className="inbox-count">0 / 2</span>
            </div>
            <LineCard branch={ar ? "الفرع أ · القاهرة الجديدة" : "Branch A · New Cairo"} detail={ar ? "لم يتم اعتماد الرقم" : "Number not approved"} status={ar ? "غير متصل" : "Not connected"} />
            <LineCard branch={ar ? "الفرع ب · الشيخ زايد" : "Branch B · Sheikh Zayed"} detail={ar ? "لم يتم اعتماد الرقم" : "Number not approved"} status={ar ? "غير متصل" : "Not connected"} />
            <div className="inbox-scope-foot"><LockKeyhole size={14} /><span>{ar ? "الموظف يرى خطوط فرعه فقط" : "Staff see their branch line only"}</span></div>
          </section>

          <section className="inbox-panel inbox-conversation" aria-label={ar ? "معاينة صندوق الوارد" : "Inbox preview"}>
            <div className="inbox-toolbar">
              <div className="inbox-toolbar-start">
                <div className="inbox-avatar"><MessageCircle size={17} /></div>
                <div><h2>{ar ? "المحادثات" : "Conversations"}</h2><span>{ar ? "كل الخطوط · الفرع أ" : "All lines · Branch A"}</span></div>
              </div>
              <div className="inbox-tabs">
                <button type="button" disabled>{ar ? "الكل" : "All"}</button>
                <button type="button" disabled>{ar ? "غير مقروء" : "Unread"}</button>
              </div>
            </div>
            <div className="inbox-empty">
              <div className="inbox-empty-mark"><MessageCircle size={22} /></div>
              <span className="inbox-kicker">{ar ? "الصندوق غير نشط" : "INBOX INACTIVE"}</span>
              <h3>{ar ? "لا توجد محادثات للعرض" : "No conversations to show"}</h3>
              <p>{ar ? "بعد اعتماد الربط ستظهر هنا محادثات الخطوط المصرح بها فقط." : "Once connected, only conversations from lines this account is allowed to access will appear here."}</p>
              <div className="inbox-safe-note"><ShieldCheck size={14} />{ar ? "لا نعرض بيانات أو رسائل افتراضية." : "No sample customer messages are shown."}</div>
            </div>
            <div className="inbox-compose">
              <span>{ar ? "الرد غير متاح قبل ربط واتساب." : "Replies stay unavailable until WhatsApp is connected."}</span>
              <button type="button" disabled aria-label={ar ? "إرسال غير متاح" : "Send unavailable"}><Send size={15} /></button>
            </div>
          </section>
        </div>

        <section className="inbox-panel inbox-setup" id="inbox-setup">
          <div className="inbox-panel-head">
            <div><span className="inbox-kicker">{ar ? "قبل التفعيل" : "BEFORE ACTIVATION"}</span><h2>{ar ? "متطلبات ربط آمنة" : "Connection checklist"}</h2></div>
            <span className="go-hold-label">{ar ? "بانتظار الموافقة" : "AWAITING APPROVAL"}</span>
          </div>
          <div className="inbox-checklist">
            <SetupItem icon={<Smartphone size={15} />} title={ar ? "اعتماد أرقام واتساب للأعمال" : "Approve WhatsApp Business lines"} detail={ar ? "تحديد ملكية الأرقام والفرع المسؤول عن كل خط." : "Confirm line ownership and assign each number to a branch."} />
            <SetupItem icon={<ShieldCheck size={15} />} title={ar ? "تأكيد صلاحيات الموظفين" : "Confirm staff access"} detail={ar ? "الموظف يستقبل رسائل فرعه فقط، والمالك يراجع الإعدادات." : "Reception sees their branch; the owner controls line settings."} />
            <SetupItem icon={<Check size={15} />} title={ar ? "اعتماد سياسة الرد والاحتفاظ" : "Approve reply and retention policy"} detail={ar ? "الموافقة على قوالب الرد، موافقة العميل، وفترة حفظ المحادثات." : "Agree reply templates, customer consent, and conversation retention."} />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function LineCard({ branch, detail, status }: { branch: string; detail: string; status: string }) {
  return <div className="inbox-line-card">
    <div className="inbox-line-icon"><Smartphone size={16} /></div>
    <div className="inbox-line-copy"><strong>{branch}</strong><span>{detail}</span></div>
    <span className="inbox-line-state"><i />{status}</span>
  </div>;
}

function SetupItem({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="inbox-setup-item"><span className="inbox-setup-icon">{icon}</span><div><strong>{title}</strong><p>{detail}</p></div></div>;
}
