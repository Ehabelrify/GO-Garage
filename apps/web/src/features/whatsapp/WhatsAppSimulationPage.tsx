import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { hasCapability } from "../../shared/capabilities";
import { ArrowLeft, ArrowRightLeft, Check, MessageSquareText, RefreshCw, Send, UserRound } from "lucide-react";
import type { BranchId, GarageRole, GarageState } from "@garage/domain";
import type { BranchName, Lang, Translator } from "../../shared/ui";
import { useGarageStore } from "../../shared/store";
import {
  Collapsible, ConfirmDialog, DateText, EmptyState, FilterBar, Notice, PageHeader, Phone, RecordRef, Select, Skeleton, StatusBadge,
} from "../../shared/components";
import {
  consentView, eventTitle, filterConversations, groupMessagesByDay, inboxFiltersActive, localStamp, quickReplies, resolveRelatedRecords,
  type ConversationStatus, type InboxFilters, type InboxScope,
} from "./inbox-model";
import { NewContactBanner } from "../intake/NewContactBanner";
import { isNewContact, newContactWord } from "../intake/intake-logic";
import "./WhatsAppSimulationPage.css";
import { invalidateForMutation } from "../../shared/invalidation";

type MessageKind = "customer" | "reply" | "bot" | "internal-note";
type InboxBranchId = BranchId | "all";
interface Conversation {
  id: string;
  branchId: BranchId;
  customerLabel: string;
  /** false = the number is not saved as a customer yet. Absent on older servers (treated as linked). */
  linked?: boolean;
  contactLabel?: string;
  contactPhone?: string;
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
  if (!response.ok) throw Object.assign(new Error(body.message || `Request failed (${response.status})`), { status: response.status });
  invalidateForMutation(url, init.method);
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
  const actorNow = useGarageStore().actor;
  const currentUserId = actorNow?.userId;
  const staffAllowed = hasCapability(actorNow, "whatsapp.use") || role === "owner";
  const [branchOptions,setBranchOptions]=useState<Array<{id:InboxBranchId;label:{en:string;ar:string}}>>(()=>state.branches.map(branch=>({id:branch.id,label:{en:String(branch.name),ar:String(branch.nameAr??branch.name)}})));
  const inboxBranchName=(id:InboxBranchId)=>branchOptions.find(branch=>branch.id===id)?.label[lang]??(id==="all"?msg("All branches","كل الفروع"):branchName(id));
  const [branchId, setBranchId] = useState<InboxBranchId>(() => {
    const current = state.currentBranch;
    return current === "all" ? state.branches[0]?.id ?? "branch-a" : current;
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scopeKey = selectedId ? `${branchId}:${selectedId}` : null;
  const [filters, setFilters] = useState<InboxFilters>({ status: "all", scope: "all", query: "" });
  const [pane, setPane] = useState<"list" | "thread">("list");
  const [confirm, setConfirm] = useState<"handoff" | "resolve" | null>(null);
  const [consent, setConsent] = useState<{ status?: string; expiresAt?: string | null } | null>(null);
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
    setPane("thread");
  };
  const chooseBranch = (id: InboxBranchId) => {
    activeSelectionRef.current = null;
    listRequestRef.current += 1;
    detailRequestRef.current += 1;
    setBranchId(id);
  };

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
      // ?record=<conversationId> deep link (record registry) wins on first load.
      const linked = new URLSearchParams(window.location.search).get("record");
      setSelectedId((current) => linked && !current && result.conversations.some((item) => item.id === linked)
        ? linked
        : current && result.conversations.some((item) => item.id === current)
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

  const related = resolveRelatedRecords(state, detail?.conversation.id === selectedId ? detail?.conversation.relatedBookingId : null);
  const consentCustomerId = related?.customer?.id;
  const consentSimulation = detail?.conversation.simulation;
  useEffect(() => {
    setConsent(null);
    if (!consentCustomerId || !consentSimulation) return;
    let alive = true;
    request<{ consent: { status?: string; expiresAt?: string | null } }>(
      `/api/whatsapp/consents?channelId=whatsapp-simulation&customerId=${encodeURIComponent(consentCustomerId)}&purpose=service`,
    ).then((result) => { if (alive) setConsent(result.consent); }).catch((error: unknown) => { if (alive) setConsent((error as { status?: number })?.status === 404 ? { status: "missing" } : null); });
    return () => { alive = false; };
  }, [consentCustomerId, consentSimulation, selectedId]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [detail?.messages.length]);

  const branchConversations = branchId==="all"?conversations:conversations.filter((item) => item.branchId === branchId);
  const filteredConversations = filterConversations(branchConversations, filters, currentUserId);
  const selectedDetail = detail?.conversation.id === selectedId && (branchId==="all"||detail.conversation.branchId === branchId) ? detail : null;
  const selectedConversation = selectedDetail?.conversation ?? branchConversations.find((item) => item.id === selectedId);
  const contactTitle = (conversation: Conversation) => isNewContact(conversation)
    ? <>{newContactWord(lang)} (<Phone value={conversation.contactPhone} />)</>
    : <bdi>{conversation.contactLabel?.trim() || conversation.customerLabel}</bdi>;
  const avatarText = (conversation: Conversation) => isNewContact(conversation) ? "+" : (conversation.contactLabel?.trim() || conversation.customerLabel).trim().slice(0, 1) || "?";
  const stamp = (value: string) => <DateText value={localStamp(value)} lang={lang} />;
  const statusLabel = (status: ConversationStatus) => status === "open"
    ? msg("Open", "مفتوحة") : status === "pending" ? msg("Pending", "معلّقة") : msg("Resolved", "تم الحل");
  const isMine = !!selectedConversation && selectedConversation.assignedUserId === currentUserId;
  const consentState = consentView(consent);
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
        ? msg("Handed off to staff.", "تم التحويل لموظف.")
        : msg("Conversation updated.", "تم تحديث المحادثة."));
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
        ? msg("Internal note saved.", "تم حفظ الملاحظة الداخلية.")
        : msg("Reply saved. Not sent: provider delivery is off.", "تم حفظ الرد ولم يُرسل: الإرسال متوقف."));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : msg("Could not add this message.", "تعذر إضافة الرسالة."));
    } finally { setBusy(""); }
  };

  const scopes: Array<{ value: InboxScope; label: string }> = [
    { value: "all", label: msg("All", "الكل") }, { value: "mine", label: msg("Mine", "محادثاتي") },
    { value: "unassigned", label: msg("Unassigned", "غير معيّنة") }, { value: "unread", label: msg("Unread", "غير مقروءة") },
  ];
  const clearFilters = () => setFilters({ status: "all", scope: "all", query: "" });
  const blocked = !!busy;
  const personName = (member: StaffOption) => `${member.name} · ${member.role === "owner" ? msg("Owner", "المالك") : member.role === "branch-manager" ? msg("Branch manager", "مدير الفرع") : msg("Receptionist", "موظف الاستقبال")}`;
  const confirmCopy = confirm === "handoff"
    ? { title: msg("Hand off to staff?", "تحويل المحادثة لموظف؟"), body: msg("The conversation is marked for a human to take over.", "ستُعلَّم المحادثة ليتولاها موظف."), label: msg("Hand off", "تحويل") }
    : { title: msg("Resolve this conversation?", "حل هذه المحادثة؟"), body: msg("You can reopen it later.", "يمكنك إعادة فتحها لاحقاً."), label: msg("Resolve", "حل") };
  const isSimulated = selectedConversation ? selectedConversation.simulation : true;

  const actionButtons = selectedConversation && staffAllowed ? <div className="wa-actions">
    {!isMine && <button className="btn btn-primary" type="button" disabled={blocked} onClick={() => void performAction("claim")}><UserRound size={14} aria-hidden="true" />{msg("Claim", "استلام")}</button>}
    <button className="btn btn-sm" type="button" disabled={blocked} onClick={() => setConfirm("handoff")}><ArrowRightLeft size={14} aria-hidden="true" />{msg("Hand off", "تحويل")}</button>
    {selectedConversation.unreadCount > 0 && <button className="btn btn-sm" type="button" disabled={blocked} onClick={() => void performAction("mark-read")}><Check size={14} aria-hidden="true" />{msg("Mark read", "مقروءة")}</button>}
    {selectedConversation.status !== "open" && <button className="btn btn-sm" type="button" disabled={blocked} onClick={() => void performAction("reopen")}>{msg("Reopen", "إعادة فتح")}</button>}
    {selectedConversation.status !== "pending" && <button className="btn btn-sm" type="button" disabled={blocked} onClick={() => void performAction("pending")}>{msg("Pending", "تعليق")}</button>}
    {selectedConversation.status !== "resolved" && <button className="btn btn-sm" type="button" disabled={blocked} onClick={() => setConfirm("resolve")}>{msg("Resolve", "حل")}</button>}
  </div> : null;

  return <div className="wa-page" dir={rtl ? "rtl" : "ltr"}>
    <PageHeader
      title={msg("Inbox", "صندوق الوارد")}
      meta={<span className="wa-meta">{inboxBranchName(branchId)}</span>}
      actions={<>
        <Select label={msg("Branch", "الفرع")} value={branchId} onChange={(event) => chooseBranch(event.target.value as InboxBranchId)} options={branchOptions.map((branch) => ({ value: branch.id, label: branch.label[lang] }))} />
        <button className="btn" type="button" onClick={() => void refresh()}><RefreshCw size={15} aria-hidden="true" />{msg("Refresh", "تحديث")}</button>
      </>}
    />
    <Notice tone="info">{msg("Provider delivery is off. Replies and notes are saved here only and are not sent to customers.", "الإرسال عبر واتساب متوقف. تُحفظ الردود والملاحظات هنا فقط ولا تصل للعملاء.")}</Notice>

    <div className={`wa-workspace pane-${pane}`}>
      <section className="wa-list-pane" aria-label={msg("Conversations", "المحادثات")}>
        <FilterBar
          lang={lang}
          search={{ value: filters.query, onChange: (query) => setFilters((c) => ({ ...c, query })), placeholder: msg("Search conversations", "ابحث في المحادثات") }}
          filters={[
            { key: "scope", label: msg("Show", "عرض"), value: filters.scope, options: scopes, onChange: (value) => setFilters((c) => ({ ...c, scope: value as InboxScope })) },
            { key: "status", label: msg("Status", "الحالة"), value: filters.status, options: [
              { value: "all", label: msg("All statuses", "كل الحالات") }, { value: "open", label: statusLabel("open") },
              { value: "pending", label: statusLabel("pending") }, { value: "resolved", label: statusLabel("resolved") },
            ], onChange: (value) => setFilters((c) => ({ ...c, status: value as InboxFilters["status"] })) },
          ]}
          onClear={clearFilters}
          resultCount={filteredConversations.length}
        />
        {listError && <EmptyState variant="error" title={listError} action={<button className="btn btn-sm" type="button" onClick={() => void loadList(branchId)}>{msg("Retry", "إعادة المحاولة")}</button>} />}
        {!listError && listLoading && branchConversations.length === 0 && <Skeleton rows={5} label={msg("Loading conversations", "تحميل المحادثات")} />}
        {!listError && !listLoading && branchConversations.length === 0 && <EmptyState title={msg("No conversations yet", "لا توجد محادثات بعد")} text={msg("New customer messages will appear here.", "ستظهر رسائل العملاء الجديدة هنا.")} />}
        {!listError && branchConversations.length > 0 && filteredConversations.length === 0 && inboxFiltersActive(filters) &&
          <EmptyState variant="no-results" title={msg("No matching conversations", "لا توجد محادثات مطابقة")} action={<button className="btn btn-sm" type="button" onClick={clearFilters}>{msg("Clear filters", "مسح التصفية")}</button>} />}
        {filteredConversations.length > 0 && <ul className="wa-conversation-list">
          {filteredConversations.map((conversation) => <li key={conversation.id}>
            <button type="button" className={`wa-conversation-item ${selectedId === conversation.id ? "selected" : ""}`} onClick={() => chooseConversation(conversation.id)} aria-current={selectedId === conversation.id ? "true" : undefined}>
              <span className="wa-avatar" aria-hidden="true">{avatarText(conversation)}</span>
              <span className="wa-list-main">
                <span className="wa-list-top"><strong>{contactTitle(conversation)}</strong><span className="wa-time">{stamp(conversation.updatedAt)}</span></span>
                <span className="wa-preview" dir="auto">{conversation.preview}</span>
                <span className="wa-list-foot">
                  <StatusBadge status={conversation.status} lang={lang} label={statusLabel(conversation.status)} />
                  {isNewContact(conversation) && <StatusBadge status="new" domain="request" lang={lang} label={newContactWord(lang)} />}
                  <span>{conversation.assignedTo || msg("Unassigned", "غير معيّنة")}</span>
                  {conversation.unreadCount > 0 && <span className="wa-unread" aria-label={`${conversation.unreadCount} ${msg("unread", "غير مقروءة")}`}>{conversation.unreadCount}</span>}
                </span>
              </span>
            </button>
          </li>)}
        </ul>}
      </section>

      <section className="wa-thread-pane" aria-label={msg("Conversation", "المحادثة")}>
        {selectedConversation ? <>
          <header className="wa-chat-head">
            <button type="button" className="btn btn-quiet btn-sm wa-back" onClick={() => setPane("list")} aria-label={msg("Back to conversations", "العودة إلى المحادثات")}><ArrowLeft size={16} aria-hidden="true" /></button>
            <div className="wa-contact-copy">
              <strong>{contactTitle(selectedConversation)}</strong>
              <small>{inboxBranchName(selectedConversation.branchId)} · {selectedConversation.assignedTo || msg("Unassigned", "غير معيّنة")}</small>
            </div>
            <StatusBadge status={selectedConversation.status} lang={lang} label={statusLabel(selectedConversation.status)} />
          </header>
          {isNewContact(selectedConversation) && <NewContactBanner lang={lang} conversationId={selectedConversation.id} phone={selectedConversation.contactPhone} canAct={staffAllowed}
            onLinked={async () => { await refresh(selectedConversation.id); notify(msg("Chat linked to the customer.", "تم ربط المحادثة بالعميل.")); }} />}
          {actionButtons}
          {detailError && <div className="wa-error-inline" role="alert">{detailError} <button type="button" className="btn btn-sm" onClick={() => selectedId && void loadDetail(selectedId)}>{msg("Retry", "إعادة المحاولة")}</button></div>}
          <div className="wa-thread" ref={threadRef} role="log" tabIndex={0} aria-label={msg("Messages", "الرسائل")} aria-live="polite" aria-relevant="additions text">
            {detailLoading ? <Skeleton rows={4} label={msg("Loading conversation", "تحميل المحادثة")} />
              : selectedDetail?.messages.length ? groupMessagesByDay(selectedDetail.messages, (m) => localStamp(m.createdAt)).map((group) => <div className="wa-day" key={group.day}>
                <div className="wa-day-sep"><DateText value={group.day} lang={lang} /></div>
                {group.items.map((message) => <article className={`wa-message ${message.kind}`} key={message.id}>
                  {message.kind === "internal-note" && <span className="wa-kind-tag">{msg("Internal note · staff only", "ملاحظة داخلية · للفريق فقط")}</span>}
                  {message.kind === "bot" && <span className="wa-kind-tag">{msg("Automated reply", "رد آلي")}</span>}
                  <p dir="auto">{message.text}</p>
                  <div className="wa-message-meta"><strong><bdi>{message.authorLabel}</bdi></strong><span className="wa-time">{stamp(message.createdAt)}</span></div>
                </article>)}
              </div>) : <EmptyState title={msg("No messages yet", "لا توجد رسائل بعد")} />}
          </div>
          {staffAllowed ? (isMine ? <form className="wa-composer" onSubmit={submitMessage}>
            <div className="wa-composer-top">
              <Select label={msg("Entry type", "نوع الإدخال")} value={composerKind} onChange={(event) => setComposerKind(event.target.value as MessageKind)} options={[
                { value: "reply", label: msg("Reply", "رد") }, { value: "internal-note", label: msg("Internal note", "ملاحظة داخلية") },
              ]} />
              {composerKind === "reply" && <div className="wa-quick" role="group" aria-label={msg("Quick replies", "ردود سريعة")}>
                {quickReplies.map((reply) => <button key={reply.id} type="button" className="btn btn-sm wa-quick-btn" onClick={() => setText((current) => current ? `${current} ${reply[lang]}` : reply[lang])}>{reply.short[lang]}</button>)}
              </div>}
            </div>
            <label className="sr-only" htmlFor="wa-text">{msg("Message text", "نص الرسالة")}</label>
            <textarea id="wa-text" className="wa-textarea" rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder={composerKind === "internal-note" ? msg("Note for staff only", "ملاحظة للفريق فقط") : isSimulated ? msg("Write a reply (saved here, not sent)", "اكتب رداً (يُحفظ هنا ولا يُرسل)") : msg("Write a reply", "اكتب رداً")} />
            <div className="wa-composer-foot"><button className="btn btn-primary" type="submit" disabled={!text.trim() || busy === "message"}><Send size={14} aria-hidden="true" />{busy === "message" ? msg("Saving…", "جارٍ الحفظ…") : composerKind === "internal-note" ? msg("Add note", "إضافة ملاحظة") : msg("Send", "إرسال")}</button></div>
          </form> : <div className="wa-claim-banner">
            <p>{msg("Claim this conversation to reply.", "استلم المحادثة للرد عليها.")}</p>
            <button className="btn btn-primary" type="button" disabled={blocked} onClick={() => void performAction("claim")}><UserRound size={14} aria-hidden="true" />{msg("Claim this conversation", "استلام المحادثة")}</button>
          </div>) : null}
        </> : <EmptyState icon={MessageSquareText} title={msg("Select a conversation", "اختر محادثة")} />}
      </section>

      <aside className="wa-context-pane" aria-label={msg("Customer context", "بيانات العميل")}>
        {selectedConversation ? <>
          <Collapsible title={msg("Customer", "العميل")} defaultOpen>
            <div className="wa-context-stack">
              {related?.customer ? <RecordRef type="customer" id={related.customer.id} label={related.customer.name} /> : <span>{contactTitle(selectedConversation)}</span>}
              {related?.vehicle && <RecordRef type="vehicle" id={related.vehicle.id} label={related.vehicle.plate} subtitle={related.vehicle.makeModel} />}
              {related && <RecordRef type="booking" id={related.bookingId} label={`${msg("Booking", "حجز")} ${related.bookingLabel}`} />}
              {related?.quote && <RecordRef type="quote" id={related.quote.id} label={`${msg("Quote", "عرض سعر")} v${related.quote.revision}`} />}
              {!related && <p className="wa-muted">{msg("No linked booking yet.", "لا يوجد حجز مرتبط بعد.")}</p>}
              <div className="wa-consent"><StatusBadge status={consentState} domain="consent" lang={lang} label={consentState === "missing" ? msg("No consent on file", "لا توجد موافقة مسجلة") : undefined} /></div>
            </div>
          </Collapsible>
          {staffAllowed && <Collapsible title={msg("Ownership", "المسؤولية")} defaultOpen>
            <div className="wa-context-stack">
              <span>{msg("Assigned to", "مسندة إلى")}: <strong>{selectedConversation.assignedTo || msg("Nobody", "لا أحد")}</strong></span>
              {role !== "receptionist" && <label className="wa-assign">
                <span>{msg("Assign to", "إسناد إلى")}</span>
                <Select label={msg("Assign to", "إسناد إلى")} value={selectedConversation.assignedUserId ?? ""} disabled={blocked} onChange={(event) => void assignConversation(event.target.value)} options={[{ value: "", label: msg("Unassigned", "غير معيّنة") }, ...staff.map((member) => ({ value: member.userId, label: personName(member) }))]} />
                {staffError && <small className="wa-error-inline" role="alert">{staffError}</small>}
              </label>}
            </div>
          </Collapsible>}
          <Collapsible title={msg("Activity", "النشاط")} count={selectedDetail?.events.length}>
            {detailLoading ? <Skeleton rows={3} /> : selectedDetail?.events.length
              ? <ol className="wa-events">{selectedDetail.events.map((event) => <li className="wa-event" key={event.id}><strong>{eventTitle(event.eventType, lang)}</strong><p>{event.details}</p><span className="wa-time">{stamp(event.createdAt)} · <bdi>{event.actorLabel}</bdi></span></li>)}</ol>
              : <p className="wa-muted">{msg("No activity yet.", "لا يوجد نشاط بعد.")}</p>}
          </Collapsible>
        </> : <p className="wa-muted">{msg("Select a conversation to see context.", "اختر محادثة لعرض البيانات.")}</p>}
      </aside>
    </div>

    {!staffAllowed && <p className="wa-muted">{msg("Your role has read access only.", "دورك للقراءة فقط.")}</p>}
    <ConfirmDialog
      open={confirm !== null}
      lang={lang}
      title={confirmCopy.title}
      body={confirmCopy.body}
      confirmLabel={confirmCopy.label}
      busy={blocked}
      onCancel={() => setConfirm(null)}
      onConfirm={() => { const action = confirm; setConfirm(null); if (action) void performAction(action); }}
    />
  </div>;
}
