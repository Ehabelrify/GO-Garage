import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSavedLocale } from "../../../shared/locale";
import "./PublicWhatsAppDemoPage.css";

type Scenario = "booking" | "handoff";
type MessageKind = "customer" | "assistant" | "human";
type Message = { id: string; kind: MessageKind; text: string; time: string };
type BranchOption = { id: string; en: string; ar: string };
type DayOption = { id: string; en: string; ar: string };
type SlotOption = { id: string; en: string; ar: string };

const branches: BranchOption[] = [
  { id: "garden-city", en: "Garden City", ar: "جاردن سيتي" },
  { id: "new-cairo", en: "New Cairo", ar: "القاهرة الجديدة" },
];
const services = [
  { id: "inspection", en: "General inspection", ar: "فحص عام", price: "EGP 350" },
  { id: "oil", en: "Oil & filter change", ar: "تغيير الزيت والفلتر", price: "EGP 1,250" },
  { id: "brakes", en: "Brake check", ar: "فحص الفرامل", price: "EGP 450" },
];
const times: SlotOption[] = [
  { id: "10", en: "10:30 AM", ar: "١٠:٣٠ صباحًا" },
  { id: "12", en: "12:00 PM", ar: "١٢:٠٠ ظهرًا" },
  { id: "14", en: "2:30 PM", ar: "٢:٣٠ مساءً" },
];

function PublicWhatsAppDemoPage() {
  const { locale, setLocale } = useSavedLocale();
  const isArabic = locale === "ar";
  const [scenario, setScenario] = useState<Scenario>("booking");
  const [mobileView, setMobileView] = useState<"customer" | "agent">("customer");
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [dayId, setDayId] = useState("");
  const [timeId, setTimeId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [handoffStep, setHandoffStep] = useState(0);
  const [customerDraft, setCustomerDraft] = useState("");
  const [typedMessages, setTypedMessages] = useState<Message[]>([]);
  const customerThreadRef = useRef<HTMLDivElement>(null);
  const agentThreadRef = useRef<HTMLDivElement>(null);
  const tr = (en: string, ar: string) => isArabic ? ar : en;
  const days = useMemo<DayOption[]>(() => [1, 2, 3].map((offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const id = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return {
      id,
      en: new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(date),
      ar: new Intl.DateTimeFormat("ar-EG", { weekday: "long", month: "short", day: "numeric" }).format(date),
    };
  }), [isArabic]);
  const selectedBranch = branches.find((item) => item.id === branchId);
  const service = services.find((item) => item.id === serviceId);
  const selectedDay = days.find((item) => item.id === dayId);
  const selectedTime = times.find((item) => item.id === timeId);
  const bookingStep = confirmed ? 5 : timeId ? 4 : dayId ? 3 : serviceId ? 2 : selectedBranch ? 1 : 0;

  const messages = useMemo<Message[]>(() => {
    if (scenario === "booking") {
      const list: Message[] = [
        { id: "opening", kind: "customer", text: tr("Hi, I’d like to book a visit for my Corolla.", "أهلًا، عايز أحجز زيارة لعربيتي كورولا."), time: "10:14" },
        { id: "welcome", kind: "assistant", text: tr("Welcome, Mariam. Which branch would you like to visit?", "أهلًا يا مريم. تحبي تزوري أنهي فرع؟"), time: "10:14" },
      ];
      if (selectedBranch) {
        list.push(
          { id: "branch-choice", kind: "customer", text: tr(`Please book at ${selectedBranch.en}.`, `من فضلك احجزي في فرع ${selectedBranch.ar}.`), time: "10:15" },
          { id: "branch-response", kind: "assistant", text: tr(`${selectedBranch.en} is selected in this sample. Choose a service to continue.`, `تم اختيار فرع ${selectedBranch.ar} في المثال. اختاري الخدمة للمتابعة.`), time: "10:15" },
        );
      }
      if (service) {
        list.push(
          { id: "service-choice", kind: "customer", text: tr(`Please book: ${service.en}.`, `من فضلك احجزي: ${service.ar}.`), time: "10:16" },
          { id: "service-response", kind: "assistant", text: tr(`${service.en} is ${service.price} in this sample. Which day works for you?`, `${service.ar} بسعر ${service.price} في المثال ده. أنهي يوم يناسبك؟`), time: "10:16" },
        );
      }
      if (selectedDay) {
        list.push(
          { id: "day-choice", kind: "customer", text: tr(` ${selectedDay.en} works for me.`, `يوم ${selectedDay.ar} مناسب لي.`), time: "10:17" },
          { id: "day-response", kind: "assistant", text: tr("There are a few sample drop-off times. Pick the one that suits you.", "فيه كذا ميعاد استلام تجريبي. اختاري اللي يناسبك."), time: "10:17" },
        );
      }
      if (selectedDay && selectedTime) {
        list.push(
          { id: "time-choice", kind: "customer", text: tr(`${selectedTime.en}, please.`, `من فضلك ${selectedTime.ar}.`), time: "10:18" },
          { id: "draft", kind: "assistant", text: tr(`Here’s a sample booking summary: ${service?.en}, ${selectedDay.en} at ${selectedTime.en}. Shall I confirm it?`, `ملخص الحجز التجريبي: ${service?.ar}، ${selectedDay.ar} الساعة ${selectedTime.ar}. أأكد الحجز؟`), time: "10:18" },
        );
      }
      if (confirmed) {
        list.push(
          { id: "confirm-choice", kind: "customer", text: tr("Yes, please confirm.", "أيوه، من فضلك أكدي."), time: "10:19" },
          { id: "confirmed", kind: "assistant", text: tr("Sample booking confirmed. The conversation and booking shown here are fictional.", "تم تأكيد الحجز التجريبي. المحادثة والحجز المعروضين هنا خياليان."), time: "10:19" },
        );
      }
      return [...list, ...typedMessages];
    }
    const list: Message[] = [
      { id: "noise-question", kind: "customer", text: tr("There’s a sound from the front wheel. Is it safe to drive?", "فيه صوت من العجلة الأمامية. ينفع أسوق بالعربية؟"), time: "11:06" },
      { id: "safe-answer", kind: "assistant", text: tr("I can’t assess a safety issue over chat. I can connect you with the garage team to help.", "مش هقدر أحدد إذا كانت العربية آمنة من خلال الشات. أقدر أوصلك بفريق الجراج للمساعدة."), time: "11:06" },
    ];
    if (handoffStep >= 1) {
      list.push({ id: "handoff-request", kind: "customer", text: tr("Yes, please connect me with someone.", "أيوه، من فضلك وصلني بحد من الفريق."), time: "11:07" });
    }
    if (handoffStep >= 1) {
      list.push({ id: "handoff-update", kind: "assistant", text: tr("I’ve flagged this for a person on the garage team. This sample handoff is local only.", "حوّلت المحادثة لموظف من فريق الجراج. التحويل ده تجريبي ومحلي فقط."), time: "11:07" });
    }
    if (handoffStep >= 3) {
      list.push({ id: "human-reply", kind: "human", text: tr("Hi Mariam, this is Salma at reception. If the sound is unusual, please avoid driving and call roadside assistance. I can help arrange an inspection.", "أهلًا يا مريم، معاكِ سلمى من الاستقبال. لو الصوت غريب، ياريت متسوقيش واتصلي بالمساعدة على الطريق. أقدر أساعدك في ترتيب فحص."), time: "11:09" });
    }
    return [...list, ...typedMessages];
  }, [scenario, selectedBranch, service, selectedDay, selectedTime, confirmed, handoffStep, isArabic, typedMessages]);

  useEffect(() => {
    [customerThreadRef, agentThreadRef].forEach((threadRef) => {
      if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
    });
  }, [messages.length]);

  const resetScenario = (nextScenario: Scenario = scenario) => {
    setScenario(nextScenario);
    setBranchId("");
    setServiceId("");
    setDayId("");
    setTimeId("");
    setConfirmed(false);
    setHandoffStep(0);
    setCustomerDraft("");
    setTypedMessages([]);
    setMobileView("customer");
  };

  const sendCustomerMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = customerDraft.trim();
    if (!text) return;
    const messageId = `typed-${Date.now()}-${typedMessages.length}`;
    const bookingRequest = /\b(book|booking|appointment|service|price|cost)\b|حجز|موعد|خدمة|سعر|تكلفة/i.test(text);
    const reply = bookingRequest
      ? selectedBranch
        ? tr("I can guide a sample booking. Use the choices in this chat to continue, then confirm the fictional booking.", "أقدر أساعدك في حجز تجريبي. استخدمي الاختيارات في المحادثة للمتابعة وبعدها أكدي الحجز الخيالي.")
        : tr("I can guide a sample booking. Use the choices in this chat to select a branch and continue.", "أقدر أساعدك في حجز تجريبي. استخدمي الاختيارات في المحادثة لاختيار الفرع والمتابعة.")
      : tr("This question needs a person. I’ve moved this sample conversation to the staff handoff queue.", "السؤال ده محتاج موظف. حولت المحادثة التجريبية لفريق الجراج.");
    setTypedMessages((messages) => [
      ...messages,
      { id: `${messageId}-customer`, kind: "customer", text, time: scenario === "booking" ? "10:19" : "11:08" },
      { id: `${messageId}-assistant`, kind: "assistant", text: reply, time: scenario === "booking" ? "10:19" : "11:08" },
    ]);
    if (!bookingRequest) {
      setScenario("handoff");
      setHandoffStep(1);
      setServiceId("");
      setDayId("");
      setTimeId("");
      setConfirmed(false);
    }
    setCustomerDraft("");
  };

  const progressSteps = scenario === "booking"
    ? [
      { title: tr("Choose a branch", "اختيار الفرع"), detail: selectedBranch ? (isArabic ? selectedBranch.ar : selectedBranch.en) : tr("Pick a sample location", "اختاري موقعًا تجريبيًا") },
      { title: tr("Choose a service", "اختيار الخدمة"), detail: service ? (isArabic ? service.ar : service.en) : tr("From the sample menu", "من قائمة الخدمات التجريبية") },
      { title: tr("Choose a day", "اختيار اليوم"), detail: selectedDay ? (isArabic ? selectedDay.ar : selectedDay.en) : tr("Show sample availability", "عرض المواعيد التجريبية") },
      { title: tr("Choose a time", "اختيار الساعة"), detail: selectedTime ? (isArabic ? selectedTime.ar : selectedTime.en) : tr("Customer selects a slot", "العميل يختار ميعادًا") },
      { title: tr("Confirm the draft", "تأكيد المسودة"), detail: confirmed ? tr("Sample only · not a real booking", "تجريبي فقط · مش حجز حقيقي") : tr("Nothing is booked before confirmation", "لا يتم الحجز قبل التأكيد") },
    ]
    : [
      { title: tr("Safety-sensitive question", "سؤال متعلق بالسلامة"), detail: tr("Automation avoids a diagnosis", "النظام يتجنب التشخيص") },
      { title: tr("Customer requests a person", "العميل يطلب موظفًا"), detail: handoffStep >= 1 ? tr("Handoff requested", "تم طلب التحويل") : tr("Customer can choose to hand off", "العميل يقدر يطلب التحويل") },
      { title: tr("Agent takes the conversation", "الموظف يستلم المحادثة"), detail: handoffStep >= 2 ? tr("Salma · Reception", "سلمى · الاستقبال") : tr("Waiting for an agent", "في انتظار موظف") },
      { title: tr("Human reply", "رد من موظف"), detail: handoffStep >= 3 ? tr("A person responds in the same thread", "موظف يرد في نفس المحادثة") : tr("No automated diagnosis", "لا يوجد تشخيص آلي") },
    ];

  const renderMessages = (agent = false) => (
    <div ref={agent ? agentThreadRef : customerThreadRef} className={`demo-thread${agent ? " demo-agent-thread" : ""}`} aria-live="polite" aria-label={tr("Conversation messages", "رسائل المحادثة")}>
      <div className="demo-date-separator">{tr("Today · sample conversation", "اليوم · محادثة تجريبية")}</div>
      {messages.map((message) => {
        const author = message.kind === "customer" ? tr("Mariam · customer", "مريم · العميلة")
          : message.kind === "human" ? tr("Salma · garage team", "سلمى · فريق الجراج")
            : tr("Garage OS assistant", "مساعد Garage OS");
        return <div className={`demo-message ${message.kind}`} key={message.id}>
          <p>{message.text}</p>
          <div className="demo-message-meta"><strong>{author}</strong><time>{message.time}</time></div>
        </div>;
      })}
    </div>
  );

  const renderCustomerActions = () => {
    if (scenario === "booking" && !confirmed) {
      return <div className="demo-chat-actions" role="group" aria-label={tr("Customer choices", "اختيارات العميل")}>
        <div className="demo-choice-group">
          {!selectedBranch && <>
            <span className="demo-choice-label">{tr("Choose a branch", "اختاري الفرع")}</span>
            {branches.map((option) => <button type="button" className="demo-choice" aria-pressed={branchId === option.id} key={option.id} onClick={() => { setBranchId(option.id); setServiceId(""); setDayId(""); setTimeId(""); setConfirmed(false); }}>
              {isArabic ? option.ar : option.en}
            </button>)}
          </>}
          {selectedBranch && !service && <>
            <span className="demo-choice-label">{tr("Choose a service", "اختاري الخدمة")}</span>
            {services.map((option) => <button type="button" className="demo-choice" aria-pressed={serviceId === option.id} key={option.id} onClick={() => { setServiceId(option.id); setDayId(""); setTimeId(""); setConfirmed(false); }}>
              {isArabic ? option.ar : option.en}
            </button>)}
          </>}
          {service && !selectedDay && <>
            <span className="demo-choice-label">{tr("Choose a day", "اختاري اليوم")}</span>
            {days.map((option) => <button type="button" className="demo-choice" aria-pressed={dayId === option.id} key={option.id} onClick={() => { setDayId(option.id); setTimeId(""); setConfirmed(false); }}>
              {isArabic ? option.ar : option.en}
            </button>)}
          </>}
          {selectedDay && !selectedTime && <>
            <span className="demo-choice-label">{tr("Choose a time", "اختاري الموعد")}</span>
            {times.map((option) => <button type="button" className="demo-choice" aria-pressed={timeId === option.id} key={option.id} onClick={() => { setTimeId(option.id); setConfirmed(false); }}>
              {isArabic ? option.ar : option.en}
            </button>)}
          </>}
          {selectedTime && <button type="button" className="demo-choice" onClick={() => setConfirmed(true)}>
            {tr("Confirm this sample booking", "أكدي الحجز التجريبي")}
          </button>}
        </div>
      </div>;
    }
    if (scenario === "handoff" && handoffStep === 0) {
      return <div className="demo-chat-actions" role="group" aria-label={tr("Customer choices", "اختيارات العميل")}>
        <button className="demo-choice" type="button" onClick={() => setHandoffStep(1)}>
          {tr("Connect me with a person", "وصلني بموظف")}
        </button>
      </div>;
    }
    return null;
  };

  return <div className="public-wa-demo" dir={isArabic ? "rtl" : "ltr"} lang={locale}>
    <header className="demo-header">
      <div className="demo-brand" aria-label="Garage OS">
        <div className="demo-brand-mark" aria-hidden="true">G</div>
        <div className="demo-brand-copy"><strong>Garage OS</strong><span>{tr("Garage operations", "إدارة الجراج")}</span></div>
      </div>
      <div className="demo-header-actions">
        <span className="demo-simulation-flag">{tr("SIMULATED · NOT CONNECTED", "محاكاة · غير متصل")}</span>
        <div className="demo-locale-switch" role="group" aria-label={tr("Choose language", "اختاري اللغة")}>
          <button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
          <button type="button" aria-pressed={locale === "ar"} onClick={() => setLocale("ar")}>عربي</button>
        </div>
      </div>
    </header>

    <main className="demo-main">
      <section className="demo-intro">
        <div className="demo-intro-copy">
          <div className="demo-eyebrow">{tr("A guided product preview", "جولة تفاعلية في المنتج")}</div>
          <h1>{tr("One conversation. Two clear perspectives.", "محادثة واحدة. صورتان واضحتان.")}</h1>
          <p>{tr("See how a garage conversation can move from a customer’s WhatsApp to an organized team workspace — with a person ready to step in when it matters.", "شوفي إزاي محادثة العميل على واتساب ممكن تظهر في مساحة عمل منظمة لفريق الجراج، مع إمكانية تدخل موظف وقت الحاجة.")}</p>
        </div>
        <aside className="demo-local-note">
          <strong>{tr("A safe, local-only preview", "معاينة آمنة ومحلية")}</strong>
          {tr("Mariam, her Corolla, availability and every message are fictional. Choices update this page only; no messages are sent.", "مريم وسيارتها والمواعيد وكل الرسائل خيالية. اختياراتك تحدث الصفحة فقط ولا ترسل أي رسائل.")}
        </aside>
      </section>

      <div className="demo-scenario-bar">
        <div className="demo-scenario-switch" role="group" aria-label={tr("Choose a demo scenario", "اختاري سيناريو العرض")}>
          <button type="button" aria-pressed={scenario === "booking"} onClick={() => resetScenario("booking")}>
            <span className="demo-scenario-num">01</span>{tr("Book a visit", "حجز زيارة")}
          </button>
          <button type="button" aria-pressed={scenario === "handoff"} onClick={() => resetScenario("handoff")}>
            <span className="demo-scenario-num">02</span>{tr("Talk to a person", "التحدث لموظف")}
          </button>
        </div>
        <button className="demo-reset" type="button" onClick={() => resetScenario()}>{tr("Start over", "ابدئي من جديد")}</button>
      </div>

      <div className="demo-mobile-view-switch" role="group" aria-label={tr("Switch perspective", "التبديل بين العرضين")}>
        <button type="button" aria-pressed={mobileView === "customer"} onClick={() => setMobileView("customer")}>{tr("Customer view", "عرض العميل")}</button>
        <button type="button" aria-pressed={mobileView === "agent"} onClick={() => setMobileView("agent")}>{tr("Agent workspace", "مساحة الموظف")}</button>
      </div>

      <section className="demo-views" aria-label={tr("Mirrored customer and agent views", "عرض العميل ومساحة الموظف")}>
        <article className={`demo-view-card demo-customer-card${mobileView === "customer" ? " mobile-active" : ""}`}>
          <header className="demo-view-head">
            <div className="demo-view-label"><span className="demo-view-icon">01</span><div><strong>{tr("Customer view", "عرض العميل")}</strong><span>{tr("A WhatsApp-style conversation", "محادثة على نمط واتساب")}</span></div></div>
            <span className="demo-mode-pill">{tr("CUSTOMER", "العميل")}</span>
          </header>
          <div className="demo-chat-profile">
            <div className="demo-wa-avatar">M</div>
            <div className="demo-profile-copy"><strong>{tr("Mariam Hassan", "مريم حسن")}</strong><span>{tr("Sample customer · Toyota Corolla", "عميلة تجريبية · تويوتا كورولا")}</span></div>
            <span className="demo-online">{tr("Preview", "معاينة")}</span>
          </div>
          {renderMessages()}
          {renderCustomerActions()}
          <form className="demo-customer-composer" onSubmit={sendCustomerMessage}>
            <input aria-label={tr("Type a customer message", "اكتبي رسالة للعميل")} value={customerDraft} onChange={(event) => setCustomerDraft(event.target.value)} placeholder={tr("Type a message…", "اكتبي رسالة…")} />
            <button type="submit" disabled={!customerDraft.trim()}>{tr("Send", "إرسال")}</button>
          </form>
          <div className="demo-chat-foot"><span>{tr("Conversation preview", "معاينة المحادثة")}</span><strong>{tr("No message is being sent", "لا يتم إرسال أي رسالة")}</strong></div>
        </article>

        <article className={`demo-view-card demo-agent-card${mobileView === "agent" ? " mobile-active" : ""}`}>
          <header className="demo-view-head">
            <div className="demo-view-label"><span className="demo-view-icon">02</span><div><strong>{tr("Agent workspace", "مساحة الموظف")}</strong><span>{tr("The same conversation, with useful context", "نفس المحادثة مع سياق مفيد للفريق")}</span></div></div>
            <span className="demo-mode-pill">{tr("SAMPLE INBOX", "صندوق تجريبي")}</span>
          </header>
          <div className="demo-chat-profile">
            <div className="demo-wa-avatar">M</div>
            <div className="demo-profile-copy"><strong>{tr("Mariam Hassan", "مريم حسن")}</strong><span>{tr("WhatsApp · Fictional customer", "واتساب · عميلة خيالية")}</span></div>
            <span className="demo-online">{scenario === "handoff" && handoffStep > 0 ? tr("Needs a person", "تحتاج لموظف") : tr("Open sample", "مفتوحة · تجريبي")}</span>
          </div>
          <div className="demo-agent-layout">
            <div className="demo-agent-thread-wrap">
              {renderMessages(true)}
              <div className="demo-chat-foot"><span>{tr("Mirrors the customer thread", "تعكس محادثة العميل")}</span><strong>{tr("Local demo data", "بيانات تجريبية محلية")}</strong></div>
            </div>
            <aside className="demo-workspace-side">
              <div className="demo-side-title"><span>{tr("Contact context", "بيانات العميل")}</span><strong>{tr("Mariam Hassan", "مريم حسن")}</strong></div>
              <div className="demo-contact-facts">
                <div className="demo-fact"><span>{tr("Vehicle", "السيارة")}</span><strong>{tr("Toyota Corolla", "تويوتا كورولا")}</strong></div>
                <div className="demo-fact"><span>{tr("Branch", "الفرع")}</span><strong>{selectedBranch ? `${isArabic ? selectedBranch.ar : selectedBranch.en} · ${tr("sample", "تجريبي")}` : scenario === "handoff" ? tr("Garden City · sample", "جاردن سيتي · تجريبي") : tr("Not selected", "لم يتم الاختيار")}</strong></div>
                <div className="demo-fact"><span>{tr("Conversation", "المحادثة")}</span><strong>{scenario === "handoff" && handoffStep >= 1 ? tr("Human handoff", "تحويل لموظف") : tr("Booking request", "طلب حجز")}</strong></div>
              </div>
              {scenario === "booking" && confirmed && service && selectedDay && selectedTime && <div className="demo-booking-card" role="status">
                <strong>{tr("Sample booking · confirmed", "حجز تجريبي · مؤكد")}</strong>
                <span>{tr("Reference: DEMO-2048", "رقم الحجز: DEMO-2048")}</span>
                <p>{isArabic ? selectedBranch?.ar : selectedBranch?.en}<br />{isArabic ? service.ar : service.en}<br />{isArabic ? selectedDay.ar : selectedDay.en} · {isArabic ? selectedTime.ar : selectedTime.en}</p>
              </div>}
              <div className="demo-progress">
                <h3>{tr("Automation journey", "مسار المحادثة")}</h3>
                <ol className="demo-progress-list">
                  {progressSteps.map((step, index) => {
                    const activeIndex = scenario === "booking" ? Math.min(bookingStep, 4) : Math.min(handoffStep, 3);
                    const complete = index < activeIndex || (scenario === "booking" ? confirmed && index === 4 : handoffStep >= 3 && index === 3);
                    return <li className={`demo-progress-step${complete ? " complete" : ""}${!complete && index === activeIndex ? " active" : ""}`} key={step.title}>
                      <span className="demo-step-mark" aria-hidden="true" />
                      <div><strong>{step.title}</strong><small>{step.detail}</small></div>
                    </li>;
                  })}
                </ol>
                {scenario === "handoff" && handoffStep === 1 && <button className="demo-agent-action primary" type="button" onClick={() => setHandoffStep(2)}>{tr("Take over as Salma", "استلام المحادثة · سلمى")}</button>}
                {scenario === "handoff" && handoffStep === 2 && <button className="demo-agent-action primary" type="button" onClick={() => setHandoffStep(3)}>{tr("Send sample human reply", "إرسال رد موظف تجريبي")}</button>}
                {scenario === "handoff" && handoffStep >= 1 && <div className="demo-handoff-card"><strong>{tr("Human handoff", "تحويل لموظف")}</strong><p>{handoffStep >= 2 ? tr("Assigned locally to Salma · Reception.", "تم الإسناد محليًا إلى سلمى · الاستقبال.") : tr("Waiting for a team member to take over.", "في انتظار استلام أحد أفراد الفريق.")}</p></div>}
              </div>
            </aside>
          </div>
        </article>
      </section>

      <div className="demo-footnote"><span aria-hidden="true">i</span><span><strong>{tr("Fictional demonstration data.", "بيانات عرض خيالية.")}</strong> {tr("This preview is not connected to WhatsApp, a live inbox, branch availability or booking records. Nothing is sent, saved or changed outside this page.", "المعاينة غير متصلة بواتساب أو بصندوق وارد حقيقي أو بمواعيد الفرع أو بسجلات الحجز. لا يتم إرسال أو حفظ أو تغيير أي شيء خارج الصفحة.")}</span></div>
    </main>
  </div>;
}

export { PublicWhatsAppDemoPage };
export default PublicWhatsAppDemoPage;
