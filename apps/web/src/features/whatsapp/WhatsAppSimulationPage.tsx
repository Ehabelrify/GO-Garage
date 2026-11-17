import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import {
  AlertTriangle, ArrowRightLeft, Check, MessageSquareText, RefreshCw,
  Send, ShieldCheck, UserRound, Wrench,
} from "lucide-react";
import type { BranchId, GarageRole, GarageState } from "@garage/domain";
import type { BranchName, Lang, Translator } from "../../shared/ui";
import { useGarageStore } from "../../shared/store";
import "./WhatsAppSimulationPage.css";

type ConversationStatus = "open" | "pending" | "resolved";
type MessageKind = "customer" | "reply" | "bot" | "internal-note";
type InboxBranchId = BranchId | "all";
interface Conversation {
  id: string;
  branchId: BranchId;
  customerLabel: string;
  status: ConversationStatus;
  assignedUserId?: string | null;
  assignedTo: string | null;
  unreadCount: number;
  updatedAt: string;
  simulation: boolean;
  preview: string;
  relatedBookingId?: string | null;
  verificationCode?: string;
  version: number;
}
interface ConversationMessage {
  id: string;
  kind: MessageKind;
  text: string;
  createdAt: string;
  authorLabel: string;
}
interface ConversationEvent {
  id: string;
  eventType: string;
  details: string;
  createdAt: string;
  actorLabel: string;
}
interface StaffOption { userId: string; name: string; role: GarageRole }
interface Detail {
  conversation: Conversation;
  messages: ConversationMessage[];
  events: ConversationEvent[];
}
interface ApiErrorBody { message?: string }
interface WhatsAppSimulationPageProps {
  lang: Lang;
  t: Translator;
  state: GarageState;
  notify: (message: string) => void;
  branchName: BranchName;
  role: GarageRole;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({})) as T & ApiErrorBody;
  if (!response.ok) throw new Error(body.message || `Request failed (${response.status})`);
  return body;
}

// Values are retained only for the lifetime of this mounted, authenticated page.
// A setter closes over its conversation key, so an old request cannot write into
// the conversation selected while that request was in flight.
function useConversationValue<T>(key: string | null, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [values, setValues] = useState<Record<string, T>>({});
  const fallback = useRef<T | null>(null);
  if (fallback.current === null) fallback.current = typeof initial === "function" ? (initial as () => T)() : initial;
  const value = key && Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback.current;
  const setValue: Dispatch<SetStateAction<T>> = (next) => {
    if (!key) return;
    setValues((previous) => {
      const current = Object.prototype.hasOwnProperty.call(previous, key) ? previous[key] : fallback.current as T;
      return { ...previous, [key]: typeof next === "function" ? (next as (value: T) => T)(current) : next };
    });
  };
  return [value as T, setValue];
}

export function WhatsAppSimulationPage(props: WhatsAppSimulationPageProps) {
  const actor = useGarageStore().actor;
  return <WhatsAppSimulationContent key={`${actor?.userId ?? "anonymous"}:${props.role}:${props.state.currentBranch}`} {...props} />;
}

function WhatsAppSimulationContent({ lang, t, state, notify, branchName, role }: WhatsAppSimulationPageProps) {
  const rtl = lang === "ar";
  const msg = (en: string, ar: string) => t(en, ar);
  const currentUserId = useGarageStore().actor?.userId;
  const staffAllowed = role === "owner" || role === "branch-manager" || role === "receptionist";
  const [branchOptions,setBranchOptions]=useState<Array<{id:InboxBranchId;label:{en:string;ar:string}}>>(()=>state.branches.map(branch=>({id:branch.id,label:{en:String(branch.name),ar:String(branch.nameAr??branch.name)}})));
  const inboxBranchName=(id:InboxBranchId)=>branchOptions.find(branch=>branch.id===id)?.label[lang]??(id==="all"?msg("All branches","كل الفروع"):branchName(id));
  const [branchId, setBranchId] = useState<InboxBranchId>(() => {
    const current = state.currentBranch;
    return current === "all" ? state.branches[0]?.id ?? "branch-a" : current;
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scopeKey = selectedId ? `${branchId}:${selectedId}` : null;
  const [filter, setFilter] = useState<"all" | ConversationStatus>("all");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useConversationValue(scopeKey, false);
  const [detailError, setDetailError] = useConversationValue(scopeKey, "");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [staffError, setStaffError] = useState("");
  const [busy, setBusy] = useConversationValue(scopeKey, "");
  const [composerKind, setComposerKind] = useConversationValue<MessageKind>(scopeKey, "reply");
  const [text, setText] = useConversationValue(scopeKey, "");
  const threadRef = useRef<HTMLDivElement>(null);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const activeSelectionRef = useRef(scopeKey);
  activeSelectionRef.current = scopeKey;
  const chooseConversation = (id: string) => {
    activeSelectionRef.current = `${branchId}:${id}`;
    detailRequestRef.current += 1;
    setSelectedId(id);
  };
  const chooseBranch = (id: InboxBranchId) => {
    activeSelectionRef.current = null;
    listRequestRef.current += 1;
    detailRequestRef.current += 1;
    setBranchId(id);
  };
  const roleLabel = role === "owner" ? msg("Owner", "المالك")
    : role === "branch-manager" ? msg("Branch manager", "مدير الفرع")
      : role === "receptionist" ? msg("Receptionist", "موظف الاستقبال")
        : msg("Technician", "فني");

  const loadList = async (id: InboxBranchId) => {
    const requestId = ++listRequestRef.current;
    setListLoading(true);
    setListError("");
    try {
      const result = await request<{ conversations: Conversation[] }>(
        `/api/whatsapp/conversations?branchId=${encodeURIComponent(id)}`,
      );
      if (requestId !== listRequestRef.current || id !== branchId) return false;
      setConversations(result.conversations);
      setSelectedId((current) => current && result.conversations.some((item) => item.id === current)
        ? current : result.conversations[0]?.id ?? null);
      return true;
    } catch (error) {
      if (requestId !== listRequestRef.current || id !== branchId) return false;
      setListError(error instanceof Error ? error.message : msg("Could not load conversations.", "تعذر تحميل المحادثات."));
      return false;
    } finally {
      if (requestId === listRequestRef.current && id === branchId) setListLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    const requestId = ++detailRequestRef.current;
    setDetailLoading(true);
    setDetailError("");
    try {
      const result = await request<Detail>(`/api/whatsapp/conversations/${encodeURIComponent(id)}`);
      if (requestId !== detailRequestRef.current || activeSelectionRef.current !== `${branchId}:${id}` || result.conversation.id !== id) return false;
      setDetail(result);
      return true;
    } catch (error) {
      if (requestId !== detailRequestRef.current || activeSelectionRef.current !== `${branchId}:${id}`) return false;
      setDetailError(error instanceof Error ? error.message : msg("Could not load this conversation.", "تعذر تحميل المحادثة."));
      return false;
    } finally {
      if (requestId === detailRequestRef.current && activeSelectionRef.current === `${branchId}:${id}`) setDetailLoading(false);
    }
  };

  useEffect(() => {
    let alive=true;
    request<{branches:Array<{id:InboxBranchId;label:{en:string;ar:string}}>}>('/api/whatsapp/branches').then(result=>{if(alive){setBranchOptions(result.branches);if(!result.branches.some(branch=>branch.id===branchId)&&result.branches[0])chooseBranch(result.branches[0].id);}}).catch(()=>undefined);
    return()=>{alive=false};
  // actor identity remounts this page; branch discovery is messaging-scoped
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(() => {
    listRequestRef.current += 1;
    detailRequestRef.current += 1;
    setSelectedId(null);
    setDetail(null);
    setConversations([]);
    setListError("");
    setDetailError("");
    void loadList(branchId);
  // branch changes intentionally start a fresh branch inbox
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else {
      detailRequestRef.current += 1;
      setDetail(null);
      setDetailLoading(false);
      setDetailError("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (role === "receptionist") {
      setStaff([]);
      setStaffError("");
      return;
    }
    const assignmentBranchId=branchId==="all"?conversations.find(item=>item.id===selectedId)?.branchId:branchId;
    if(!assignmentBranchId){setStaff([]);setStaffError("");return;}
    let alive = true;
    request<{ staff: StaffOption[] }>(`/api/whatsapp/staff?branchId=${encodeURIComponent(assignmentBranchId)}`)
      .then((result) => { if (alive) { setStaff(result.staff); setStaffError(""); } })
      .catch((error: unknown) => { if (alive) setStaffError(error instanceof Error ? error.message : msg("Could not load staff.", "تعذر تحميل قائمة الفريق.")); });
    return () => { alive = false; };
  // Branch changes load a fresh, branch-scoped assignment list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, role,selectedId,conversations]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [detail?.messages.length]);

  const branchConversations = branchId==="all"?conversations:conversations.filter((item) => item.branchId === branchId);
  const filteredConversations = branchConversations.filter((item) => filter === "all" || item.status === filter);
  const selectedDetail = detail?.conversation.id === selectedId && (branchId==="all"||detail.conversation.branchId === branchId) ? detail : null;
  const selectedConversation = selectedDetail?.conversation ?? branchConversations.find((item) => item.id === selectedId);
  const formatTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return value;
    return new Intl.DateTimeFormat(rtl ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(date);
  };
  const statusLabel = (status: ConversationStatus) => status === "open"
    ? msg("Open", "مفتوحة") : status === "pending" ? msg("Pending", "معلّقة") : msg("Resolved", "تم الحل");
  const refresh = async (id = selectedId) => {
    await loadList(branchId);
    if (id) await loadDetail(id);
  };

  const performAction = async (action: "claim" | "resolve" | "pending" | "reopen" | "mark-read" | "handoff") => {
    if (!selectedId || !selectedConversation || !staffAllowed) return;
    setBusy(action);
    try {
      await request(`/api/whatsapp/conversations/${encodeURIComponent(selectedId)}/action`, {
        method: "POST", body: JSON.stringify({ action,expectedVersion:selectedConversation?.version }),
      });
      await refresh(selectedId);
      if (activeSelectionRef.current === scopeKey) notify(action === "handoff"
        ? msg("Simulated handoff recorded in the branch inbox.", "تم تسجيل تحويل تجريبي في صندوق وارد الفرع.")
        : msg("Conversation updated in simulated data.", "تم تحديث المحادثة في البيانات التجريبية."));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : msg("Could not update the conversation.", "تعذر تحديث المحادثة."));
    } finally { setBusy(""); }
  };

  const assignConversation = async (userId: string) => {
    if (!selectedId || !selectedConversation || !staffAllowed || role === "receptionist") return;
    setBusy("assign");
    try {
      await request(`/api/whatsapp/conversations/${encodeURIComponent(selectedId)}/action`, {
        method: "POST",
        body: JSON.stringify(userId ? { action: "assign", userId,expectedVersion:selectedConversation?.version } : { action: "release",expectedVersion:selectedConversation?.version }),
      });
      await refresh(selectedId);
      if (activeSelectionRef.current === scopeKey) notify(userId
        ? msg("Conversation assigned to branch staff.", "تم إسناد المحادثة لموظف الفرع.")
        : msg("Conversation returned to the unassigned branch queue.", "عادت المحادثة إلى قائمة الفرع غير المسندة."));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : msg("Could not change the assignment.", "تعذر تغيير الإسناد."));
    } finally { setBusy(""); }
  };

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!selectedId || !staffAllowed || !trimmed) return;
    setBusy("message");
    try {
      await request(`/api/whatsapp/conversations/${encodeURIComponent(selectedId)}/messages`, {
        method: "POST", body: JSON.stringify({ kind: composerKind, text: trimmed }),
      });
      setText("");
      await refresh(selectedId);
      if (activeSelectionRef.current === scopeKey) notify(composerKind === "internal-note"
        ? msg("Internal note saved; it is not a customer reply.", "تم حفظ الملاحظة الداخلية؛ دي مش رد للعميل.")
        : msg("Reply added to this inbox. Provider delivery is off.", "اتضاف الرد لصندوق الوارد. إرسال واتساب الفعلي متوقف."));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : msg("Could not add this message.", "تعذر إضافة الرسالة."));
    } finally { setBusy(""); }
  };

  return <div className="wa-page" dir={rtl ? "rtl" : "ltr"}>
    <div className="page-heading">
      <div>
        <div className="eyebrow">{msg("STAFF MESSAGING WORKSPACE", "مساحة رسائل الفريق")}</div>
        <h1>{msg("WhatsApp staff inbox", "صندوق وارد واتساب للفريق")}</h1>
        <p className="subtitle">{msg(
          "Review conversations, manage ownership and keep staff notes separate from customer replies.",
          "راجع المحادثات وحدد المسؤولية وافصل ملاحظات الفريق عن ردود العملاء.",
        )}</p>
      </div>
      <div className="wa-heading-side">
        <span className="wa-state-chip">{msg("Provider disconnected", "مزود الخدمة غير متصل")}</span>
        <span className="wa-role-chip"><UserRound size={14} />{roleLabel}</span>
      </div>
    </div>

    <section className="wa-safety" aria-label={msg("Simulation notice", "تنبيه المحاكاة")}>
      <span className="wa-safety-mark"><ShieldCheck size={18} /></span>
      <div>
        <strong>{msg("PROVIDER DISCONNECTED — no customer delivery", "مزود واتساب غير متصل — لا توجد رسائل للعملاء")}</strong>
        <p>{msg(
          "This staff workspace is separate from the public customer demo. Messages are not delivered through WhatsApp while the provider is disconnected.",
          "مساحة الفريق منفصلة عن العرض العام للعميل. الرسائل مش بتوصل عن طريق واتساب ومزود الخدمة غير متصل.",
        )}</p>
      </div>
      <div className="wa-safety-meta"><span>{msg("Branch workspace", "مساحة الفرع")}</span><strong>{inboxBranchName(branchId)}</strong></div>
    </section>

    <div className="wa-workspace">
      <section className="wa-card wa-inbox" aria-label={msg("Staff conversation inbox", "صندوق وارد محادثات الفريق")}>
        <header className="wa-inbox-head">
          <div className="wa-inbox-title">
            <h2>{msg("Staff inbox", "صندوق وارد الفريق")}</h2>
            <span className="wa-count">{branchConversations.length}</span>
          </div>
          <div className="wa-branch-control">
            <label htmlFor="wa-branch">{msg("Branch ownership", "مسؤولية الفرع")}</label>
            <select id="wa-branch" value={branchId} onChange={(event) => chooseBranch(event.target.value as InboxBranchId)}>
              {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.label[lang]}</option>)}
            </select>
          </div>
        </header>
        <div className="wa-toolbar" aria-label={msg("Filter conversations", "تصفية المحادثات")}>
          {(["all", "open", "pending", "resolved"] as const).map((item) =>
            <button type="button" key={item} className={`wa-filter ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>
              {item === "all" ? msg("All", "الكل") : statusLabel(item)}
            </button>)}
        </div>
        {listError && <div className="wa-error" role="alert">{listError}<button className="wa-secondary" type="button" onClick={() => void loadList(branchId)}><RefreshCw size={13} />{msg("Retry", "إعادة المحاولة")}</button></div>}
        {listLoading && branchConversations.length === 0
          ? <div className="wa-skeleton" aria-label={msg("Loading conversations", "تحميل المحادثات")}><i /><i /><i /></div>
          : filteredConversations.length ? <div className="wa-conversation-list">
              {filteredConversations.map((conversation) => <button
                type="button"
                className={`wa-conversation-item ${selectedId === conversation.id ? "selected" : ""}`}
                key={conversation.id}
                onClick={() => chooseConversation(conversation.id)}
                aria-current={selectedId === conversation.id ? "true" : undefined}
              >
                <span className="wa-avatar">{conversation.customerLabel.trim().slice(0, 1) || "S"}</span>
                <span className="wa-list-main">
                  <span className="wa-list-top"><strong>{conversation.customerLabel}</strong><time>{formatTime(conversation.updatedAt)}</time></span>
                  <span className="wa-preview">{conversation.preview}</span>
                  <span className="wa-list-foot">
                    <span className={`wa-status ${conversation.status}`}>{statusLabel(conversation.status)}</span>
                    <span>{conversation.assignedTo || msg("Unassigned", "غير معيّن")}</span>
                    {conversation.unreadCount > 0 && <span className="wa-unread" aria-label={`${conversation.unreadCount} ${msg("unread", "غير مقروءة")}`}>{conversation.unreadCount}</span>}
                  </span>
                </span>
              </button>)}
        </div> : !listError && <div className="wa-list-empty">{msg("No conversations are available in this branch view.", "لا توجد محادثات متاحة في عرض الفرع ده.")}</div>}
      </section>

      <section className="wa-card wa-chat" aria-label={msg("Conversation and transcript", "المحادثة وسجلها")}>
        {selectedConversation ? <>
          <header className="wa-chat-head">
            <div className="wa-contact">
              <span className="wa-contact-mark"><MessageSquareText size={17} /></span>
              <div className="wa-contact-copy">
                <strong>{selectedConversation.customerLabel}</strong>
                <small>{selectedConversation.simulation ? msg("Fictional contact · no phone number", "جهة اتصال افتراضية · من غير رقم موبايل") : msg("Operational contact · protected details", "جهة اتصال تشغيلية · بيانات محمية")} · {inboxBranchName(selectedConversation.branchId)}</small>
              </div>
            </div>
            <div className="wa-chat-head-meta">
              <span className="wa-sim-chip">{msg("SIMULATED", "محاكاة")}</span>
              <span className={`wa-status ${selectedConversation.status}`}>{statusLabel(selectedConversation.status)}</span>
            </div>
          </header>
          {detailError && <div className="wa-error-inline" role="alert">{detailError} <button type="button" className="wa-secondary" onClick={() => selectedId && void loadDetail(selectedId)}>{msg("Retry", "إعادة المحاولة")}</button></div>}
          <div className="wa-thread" ref={threadRef} role="log" aria-live="polite" aria-relevant="additions text">
            {detailLoading ? <div className="wa-skeleton"><i /><i /><i /></div>
              : selectedDetail?.messages.length ? selectedDetail.messages.map((message) => <article className={`wa-message ${message.kind}`} key={message.id}>
                {message.kind === "internal-note" && <span className="wa-kind-tag">{msg("Internal note · staff only", "ملاحظة داخلية · للفريق فقط")}</span>}
                {message.kind === "customer" && <span className="wa-kind-tag">{msg("Simulated customer message", "رسالة عميل تجريبية")}</span>}
                {message.kind === "reply" && <span className="wa-kind-tag">{msg("Simulated staff reply", "رد موظف تجريبي")}</span>}
                {message.kind === "bot" && <span className="wa-kind-tag">{msg("Simulated bot reply", "رد آلي تجريبي")}</span>}
                <p>{message.text}</p>
                <div className="wa-message-meta"><time>{formatTime(message.createdAt)}</time><strong>{message.authorLabel}</strong></div>
              </article>) : !detailLoading && <div className="wa-thread-empty">
                <span className="wa-thread-empty-mark"><MessageSquareText size={19} /></span>
                <strong>{msg("A clear, accountable transcript", "سجل محادثة واضح ومسؤول")}</strong>
                <p>{msg("Customer messages, staff replies and staff-only notes are kept visibly separate.", "رسائل العميل وردود الفريق والملاحظات الداخلية ظاهرة كأنواع منفصلة.")}</p>
              </div>}
          </div>
          {staffAllowed ? <form className="wa-composer" onSubmit={submitMessage}>
            <label className="wa-field">
              <span>{msg("Entry type", "نوع الإدخال")}</span>
              <select value={composerKind} onChange={(event) => setComposerKind(event.target.value as MessageKind)}>
            <option value="reply">{msg("Staff reply", "رد موظف")}</option>
                <option value="internal-note">{msg("Internal note · staff only", "ملاحظة داخلية · للفريق فقط")}</option>
              </select>
            </label>
            <label className="wa-field">
              <span className="sr-only">{msg("Message text", "نص الرسالة")}</span>
              <textarea rows={2} value={text} onChange={(event) => setText(event.target.value)} placeholder={composerKind === "internal-note" ? msg("Add context for staff only…", "أضف تفاصيل للفريق فقط…") : msg("Write a simulated entry…", "اكتب إدخالاً تجريبياً…")} />
            </label>
            <button className="wa-primary" type="submit" disabled={!text.trim() || busy === "message" || selectedConversation.assignedUserId !== currentUserId}><Send size={14} />{busy === "message" ? msg("Saving…", "جاري الحفظ…") : composerKind === "internal-note" ? msg("Add internal note", "أضف ملاحظة داخلية") : msg("Send reply", "إرسال الرد")}</button>
            <span className="wa-composer-note">{composerKind === "internal-note"
              ? msg("Internal notes are staff-only and never displayed as customer replies.", "الملاحظات الداخلية للفريق فقط ومش بتظهر كردود للعميل.")
              : msg("Development data only. Nothing is delivered to a customer.", "بيانات تطوير فقط. مافيش حاجة بتوصل للعميل.")}</span>
            {selectedConversation.assignedUserId !== currentUserId && <span className="wa-composer-note">{msg("Claim or assign this conversation to yourself before sending a staff reply or note.", "استلم المحادثة أو أسندها لنفسك قبل إرسال رد أو ملاحظة للفريق.")}</span>}
          </form> : <div className="wa-permission"><Wrench size={14} /> {msg("Technician access is excluded from this inbox. Owner, branch manager and receptionist roles can manage the simulated journey.", "صلاحية الفني غير متاحة لصندوق الوارد. المالك ومدير الفرع وموظف الاستقبال يقدروا يديروا الرحلة التجريبية.")}</div>}
        </> : <div className="wa-chat-empty">
          <div><MessageSquareText size={23} /><strong>{msg("Select a conversation", "اختار محادثة")}</strong><p>{msg("Choose an item from the staff inbox to review its transcript and ownership.", "اختار محادثة من صندوق وارد الفريق لمراجعة السجل والمسؤولية.")}</p></div>
        </div>}
      </section>

      <aside className="wa-side">
        <section className="wa-card wa-side-card" aria-labelledby="wa-control-title">
          <div className="wa-panel-head"><div><h2 id="wa-control-title">{msg("Ownership & status", "المسؤولية والحالة")} </h2><p>{msg("Actions are recorded in the branch simulation.", "الإجراءات بتتسجل في محاكاة الفرع.")}</p></div><ArrowRightLeft size={16} /></div>
          {selectedConversation && <>
            <div className="wa-status-actions">
              <button className="wa-action" type="button" disabled={!staffAllowed || !!busy} onClick={() => void performAction("claim")}><UserRound size={13} />{msg("Claim / assign to me", "استلم / عيّن لنفسي")}</button>
              <button className="wa-action" type="button" disabled={!staffAllowed || !!busy} onClick={() => void performAction("handoff")}><ArrowRightLeft size={13} />{msg("Human handoff", "تحويل لموظف")}</button>
              {selectedConversation.unreadCount > 0 && <button className="wa-action" type="button" disabled={!staffAllowed || !!busy} onClick={() => void performAction("mark-read")}><Check size={13} />{msg("Mark as read", "تحديد كمقروءة")}</button>}
              {selectedConversation.status !== "open" && <button className="wa-action" type="button" disabled={!staffAllowed || !!busy} onClick={() => void performAction("reopen")}>{msg("Reopen", "إعادة فتح")}</button>}
              {selectedConversation.status !== "pending" && <button className="wa-action" type="button" disabled={!staffAllowed || !!busy} onClick={() => void performAction("pending")}>{msg("Set pending", "تعليق")}</button>}
              {selectedConversation.status !== "resolved" && <button className="wa-action" type="button" disabled={!staffAllowed || !!busy} onClick={() => void performAction("resolve")}>{msg("Resolve", "حل المحادثة")}</button>}
            </div>
            <div className="wa-context-row"><span>{msg("Assigned to", "مسندة إلى")}</span><strong>{selectedConversation.assignedTo || msg("Unassigned", "غير معيّن")}</strong></div>
            {role !== "receptionist" && <label className="wa-field wa-assignee-select">
              <span>{msg("Assign to branch staff", "إسناد لموظف الفرع")}</span>
              <select
                value={selectedConversation.assignedUserId ?? ""}
                disabled={!!busy}
                onChange={(event) => void assignConversation(event.target.value)}
              >
                <option value="">{msg("Unassigned", "غير معيّن")}</option>
                {staff.map((member) => <option key={member.userId} value={member.userId}>{member.name} · {member.role === "owner" ? msg("Owner", "المالك") : member.role === "branch-manager" ? msg("Branch manager", "مدير الفرع") : msg("Receptionist", "موظف الاستقبال")}</option>)}
              </select>
              {staffError && <small className="wa-error-inline" role="alert">{staffError}</small>}
            </label>}
            {!staffAllowed && <p className="wa-permission">{msg("Technicians are excluded. These controls are available to Owner, branch manager and receptionist.", "الفنيون غير مشمولين. الإجراءات متاحة للمالك ومدير الفرع وموظف الاستقبال.")}</p>}
          </>}
          {!selectedConversation && <p className="wa-list-empty">{msg("Select a conversation to see its ownership controls.", "اختار محادثة لعرض إجراءات المسؤولية.")}</p>}
        </section>

        <section className="wa-card wa-side-card" aria-labelledby="wa-events-title">
          <div className="wa-panel-head"><div><h2 id="wa-events-title">{msg("Accountability log", "سجل المسؤولية")}</h2><p>{msg("Conversation events and acting staff.", "أحداث المحادثة والموظف المسؤول.")}</p></div><AlertTriangle size={16} /></div>
          {detailLoading ? <div className="wa-skeleton"><i /><i /><i /></div>
              : selectedDetail?.events.length ? <ol className="wa-events">{selectedDetail.events.map((event) => <li className="wa-event" key={event.id}><span className="wa-event-dot" /><div><strong>{event.eventType}</strong><p>{event.details}</p><time>{formatTime(event.createdAt)} · {event.actorLabel}</time></div></li>)}</ol>
              : <p className="wa-list-empty">{msg("No recorded events for this conversation.", "مفيش أحداث مسجلة للمحادثة دي.")}</p>}
        </section>
      </aside>
    </div>
  </div>;
}
