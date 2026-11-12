import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle, ArrowRightLeft, Check, Clock3, MessageSquareText, Plus, RefreshCw,
  Send, ShieldCheck, UserRound, Wrench,
} from "lucide-react";
import type { BranchId, GarageRole, GarageState } from "../types";
import type { BranchName, Lang, Translator } from "../ui";
import { useGarageStore } from "../store";
import "./WhatsAppSimulationPage.css";

type ConversationStatus = "open" | "pending" | "resolved";
type MessageKind = "customer" | "reply" | "bot" | "internal-note";
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
interface ServiceOption {
  id: string;
  nameEn: string;
  nameAr: string;
  priceLabel: string;
  bayHours: number;
}
interface StaffOption { userId: string; name: string; role: GarageRole }
interface Slot { date: string; time: string }
interface Availability {
  available: boolean;
  slots: Slot[];
  alternatives: Slot[];
  reason?: string;
  scheduleNote?: string;
}
interface BookingDraft {
  draftId: string;
  serviceName: string;
  dropoffDate: string;
  dropoffTime: string;
  expectedPickup: string;
  etaReason: string;
  etaAt: string;
}
interface BookingChangeDraft {
  draftId: string;
  action: "reschedule" | "cancel";
  dropoffDate: string;
  dropoffTime: string;
  expectedPickup: string;
  etaReason: string;
  etaAt?: string;
  message: string;
}
interface StatusResult {
  status: string;
  stage: string;
  expectedPickup?: string;
  etaReason?: string;
  etaAt?: string;
  changedFrom?: string;
  milestones?: Array<{ stage: string; occurredAt: string }>;
}
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

function localDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function WhatsAppSimulationPage({ lang, t, state, notify, branchName, role }: WhatsAppSimulationPageProps) {
  const rtl = lang === "ar";
  const msg = (en: string, ar: string) => t(en, ar);
  const currentUserId = useGarageStore().actor?.userId;
  const staffAllowed = role === "owner" || role === "branch-manager" || role === "receptionist";
  const branchOptions = useMemo(() => state.branches, [state.branches]);
  const [branchId, setBranchId] = useState<BranchId>(() => {
    const current = state.currentBranch;
    return current === "all" ? state.branches[0]?.id ?? "branch-a" : current;
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | ConversationStatus>("all");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [staffError, setStaffError] = useState("");
  const [servicesError, setServicesError] = useState("");
  const [servicesLoading, setServicesLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [composerKind, setComposerKind] = useState<MessageKind>("reply");
  const [text, setText] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [bookingDate, setBookingDate] = useState(localDate);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityError, setAvailabilityError] = useState("");
  const [bookingDraft, setBookingDraft] = useState<BookingDraft | null>(null);
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingChangeDraft, setBookingChangeDraft] = useState<BookingChangeDraft | null>(null);
  const [bookingId, setBookingId] = useState("");
  const [changeDate, setChangeDate] = useState(localDate);
  const [changeTime, setChangeTime] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [statusResult, setStatusResult] = useState<StatusResult | null>(null);
  const [lookupMessage, setLookupMessage] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const roleLabel = role === "owner" ? msg("Owner", "المالك")
    : role === "branch-manager" ? msg("Branch manager", "مدير الفرع")
      : role === "receptionist" ? msg("Receptionist", "موظف الاستقبال")
        : msg("Technician", "فني");

  const loadList = async (id: BranchId) => {
    const requestId = ++listRequestRef.current;
    setListLoading(true);
    setListError("");
    try {
      const result = await request<{ conversations: Conversation[] }>(
        `/api/whatsapp/conversations?branchId=${encodeURIComponent(id)}`,
      );
      if (requestId !== listRequestRef.current) return false;
      setConversations(result.conversations);
      setSelectedId((current) => current && result.conversations.some((item) => item.id === current)
        ? current : result.conversations[0]?.id ?? null);
      return true;
    } catch (error) {
      if (requestId !== listRequestRef.current) return false;
      setListError(error instanceof Error ? error.message : msg("Could not load conversations.", "تعذر تحميل المحادثات."));
      return false;
    } finally {
      if (requestId === listRequestRef.current) setListLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    const requestId = ++detailRequestRef.current;
    setDetailLoading(true);
    setDetailError("");
    try {
      const result = await request<Detail>(`/api/whatsapp/conversations/${encodeURIComponent(id)}`);
      if (requestId !== detailRequestRef.current) return false;
      setDetail(result);
      setBookingId(result.conversation.relatedBookingId ?? "");
      setVerificationCode(result.conversation.verificationCode ?? "");
      return true;
    } catch (error) {
      if (requestId !== detailRequestRef.current) return false;
      setDetailError(error instanceof Error ? error.message : msg("Could not load this conversation.", "تعذر تحميل المحادثة."));
      return false;
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  };

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    setConversations([]);
    setListError("");
    setDetailError("");
    setAvailability(null);
    setBookingDraft(null);
    setBookingChangeDraft(null);
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
    let alive = true;
    setServicesLoading(true);
    request<{ services: ServiceOption[] }>("/api/whatsapp/services")
      .then((result) => { if (alive) { setServices(result.services); setServiceId((current) => current || result.services[0]?.id || ""); setServicesError(""); } })
      .catch((error: unknown) => { if (alive) setServicesError(error instanceof Error ? error.message : msg("Could not load services.", "تعذر تحميل الخدمات.")); })
      .finally(() => { if (alive) setServicesLoading(false); });
    return () => { alive = false; };
  // services are fetched once when the page opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (role === "receptionist") {
      setStaff([]);
      setStaffError("");
      return;
    }
    let alive = true;
    request<{ staff: StaffOption[] }>(`/api/whatsapp/staff?branchId=${encodeURIComponent(branchId)}`)
      .then((result) => { if (alive) { setStaff(result.staff); setStaffError(""); } })
      .catch((error: unknown) => { if (alive) setStaffError(error instanceof Error ? error.message : msg("Could not load staff.", "تعذر تحميل قائمة الفريق.")); });
    return () => { alive = false; };
  // Branch changes load a fresh, branch-scoped assignment list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, role]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [detail?.messages.length]);

  const branchConversations = conversations.filter((item) => item.branchId === branchId);
  const filteredConversations = branchConversations.filter((item) => filter === "all" || item.status === filter);
  const selectedDetail = detail?.conversation.id === selectedId && detail.conversation.branchId === branchId ? detail : null;
  const selectedConversation = selectedDetail?.conversation ?? branchConversations.find((item) => item.id === selectedId);
  const formatTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return value;
    return new Intl.DateTimeFormat(rtl ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(date);
  };
  const statusLabel = (status: ConversationStatus) => status === "open"
    ? msg("Open", "مفتوحة") : status === "pending" ? msg("Pending", "معلّقة") : msg("Resolved", "تم الحل");
  const jobStageLabel = (stage: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      booked: { en: "Booked", ar: "تم الحجز" },
      received: { en: "Vehicle received", ar: "تم استلام السيارة" },
      "in-service": { en: "In service", ar: "قيد الخدمة" },
      qc: { en: "Quality check", ar: "فحص الجودة" },
      ready: { en: "Ready for pickup", ar: "جاهزة للاستلام" },
      delivered: { en: "Delivered", ar: "تم التسليم" },
      cancelled: { en: "Cancelled", ar: "ملغي" },
      "no-show": { en: "No-show", ar: "لم يحضر" },
    };
    return msg(labels[stage]?.en ?? stage, labels[stage]?.ar ?? stage);
  };
  const serviceLabel = (service: ServiceOption) => rtl ? service.nameAr : service.nameEn;

  const refresh = async (id = selectedId) => {
    await loadList(branchId);
    if (id) await loadDetail(id);
  };

  const createConversation = async () => {
    if (!staffAllowed) return;
    setBusy("create");
    try {
      const result = await request<{ conversation: Conversation }>("/api/whatsapp/conversations", {
        method: "POST", body: JSON.stringify({ branchId }),
      });
      await loadList(branchId);
      setSelectedId(result.conversation.id);
      notify(msg("Simulated conversation created for this branch.", "تم إنشاء محادثة تجريبية للفرع."));
    } catch (error) {
      setListError(error instanceof Error ? error.message : msg("Could not create a conversation.", "تعذر إنشاء المحادثة."));
    } finally { setBusy(""); }
  };

  const performAction = async (action: "claim" | "resolve" | "pending" | "reopen" | "mark-read" | "handoff") => {
    if (!selectedId || !staffAllowed) return;
    setBusy(action);
    try {
      await request(`/api/whatsapp/conversations/${encodeURIComponent(selectedId)}/action`, {
        method: "POST", body: JSON.stringify({ action }),
      });
      await refresh(selectedId);
      notify(action === "handoff"
        ? msg("Simulated handoff recorded in the branch inbox.", "تم تسجيل تحويل تجريبي في صندوق وارد الفرع.")
        : msg("Conversation updated in simulated data.", "تم تحديث المحادثة في البيانات التجريبية."));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : msg("Could not update the conversation.", "تعذر تحديث المحادثة."));
    } finally { setBusy(""); }
  };

  const assignConversation = async (userId: string) => {
    if (!selectedId || !staffAllowed || role === "receptionist") return;
    setBusy("assign");
    try {
      await request(`/api/whatsapp/conversations/${encodeURIComponent(selectedId)}/action`, {
        method: "POST",
        body: JSON.stringify(userId ? { action: "assign", userId } : { action: "release" }),
      });
      await refresh(selectedId);
      notify(userId
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
      notify(composerKind === "internal-note"
        ? msg("Internal note saved; it is not a customer reply.", "تم حفظ الملاحظة الداخلية؛ دي مش رد للعميل.")
        : msg("Simulated message added to the conversation.", "تمت إضافة رسالة تجريبية للمحادثة."));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : msg("Could not add this message.", "تعذر إضافة الرسالة."));
    } finally { setBusy(""); }
  };

  const checkAvailability = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!serviceId || !bookingDate) return;
    setBusy("availability"); setAvailability(null); setAvailabilityError(""); setBookingDraft(null); setBookingMessage("");
    try {
      const query = new URLSearchParams({ branchId, serviceId, date: bookingDate, lang });
      const result = await request<{ available: boolean; slots: Slot[]; alternatives: Slot[]; reason?: string }>(`/api/whatsapp/availability?${query}`);
      setAvailability(result);
    } catch (error) {
      setAvailabilityError(error instanceof Error ? error.message : msg("Availability could not be checked.", "تعذر التحقق من المواعيد."));
    } finally { setBusy(""); }
  };

  const runGuidedJourney = async () => {
    if (!selectedId || !serviceId || !staffAllowed || busy) return;
    setBusy("walkthrough");
    setAvailability(null);
    setAvailabilityError("");
    setBookingDraft(null);
    setBookingChangeDraft(null);
    setBookingMessage("");
    try {
      await request(`/api/whatsapp/conversations/${encodeURIComponent(selectedId)}/service-question`, {
        method: "POST",
        body: JSON.stringify({ serviceId, lang }),
      });
      const query = new URLSearchParams({ branchId, serviceId, date: bookingDate, lang });
      const result = await request<Availability>(`/api/whatsapp/availability?${query}`);
      setAvailability(result);
      const slot = result.slots[0] ?? result.alternatives[0];
      if (!slot) {
        setBookingMessage(msg(
          "No drop-off suggestion is available in the next two weeks. Staff can review capacity with the customer.",
          "مفيش موعد مقترح متاح خلال الأسبوعين الجايين. يقدر الفريق يراجع السعة مع العميل.",
        ));
        await loadDetail(selectedId);
        return;
      }
      setBookingDate(slot.date);
      const draft = await request<BookingDraft>(`/api/whatsapp/conversations/${encodeURIComponent(selectedId)}/booking-draft`, {
        method: "POST",
        body: JSON.stringify({ serviceId, date: slot.date, time: slot.time, lang }),
      });
      setBookingDraft(draft);
      setBookingMessage(msg(
        "The assistant prepared a booking draft. It will not become a booking until confirmation.",
        "المساعد جهّز مسودة حجز. مش هيتعمل حجز إلا بعد التأكيد.",
      ));
      await loadDetail(selectedId);
      notify(msg("Guided journey ready for review.", "رحلة المحاكاة جاهزة للمراجعة."));
    } catch (error) {
      const message = error instanceof Error ? error.message : msg("The guided journey could not be completed.", "تعذر إكمال رحلة المحاكاة.");
      if (selectedId) await loadDetail(selectedId);
      setBookingMessage(message);
    } finally {
      setBusy("");
    }
  };

  const askServiceQuestion = async () => {
    if (!selectedId || !serviceId || !staffAllowed) return;
    setBusy("service-question");
    try {
      await request(`/api/whatsapp/conversations/${encodeURIComponent(selectedId)}/service-question`, {
        method: "POST",
        body: JSON.stringify({ serviceId, lang }),
      });
      await refresh(selectedId);
      notify(msg("Service answer added from the current Garage OS catalogue.", "تمت إضافة إجابة الخدمة من قائمة Garage OS الحالية."));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : msg("Service information could not be loaded.", "تعذر تحميل معلومات الخدمة."));
    } finally { setBusy(""); }
  };

  const createBookingDraft = async (slot: Slot) => {
    if (!selectedId || !serviceId || !staffAllowed) return;
    setBusy("draft"); setBookingMessage(""); setBookingDraft(null); setBookingChangeDraft(null);
    try {
      const result = await request<BookingDraft>(`/api/whatsapp/conversations/${encodeURIComponent(selectedId)}/booking-draft`, {
        method: "POST", body: JSON.stringify({ serviceId, date: slot.date, time: slot.time, lang }),
      });
      setBookingDraft(result);
      await loadDetail(selectedId);
      notify(msg("A simulated booking draft is ready for staff confirmation.", "مسودة الحجز التجريبية جاهزة لتأكيد الموظف."));
    } catch (error) {
      setAvailabilityError(error instanceof Error ? error.message : msg("Could not prepare this booking draft.", "تعذر تجهيز مسودة الحجز."));
    } finally { setBusy(""); }
  };

  const confirmDraft = async (confirmed: boolean) => {
    if (!selectedId || !bookingDraft || !staffAllowed) return;
    setBusy(confirmed ? "confirm" : "decline");
    try {
      const result = await request<{ ok: boolean; bookingId?: string; status?: string; message: string }>(
        `/api/whatsapp/conversations/${encodeURIComponent(selectedId)}/booking-confirm`,
        { method: "POST", body: JSON.stringify({ draftId: bookingDraft.draftId, confirmed, lang }) },
      );
      setBookingMessage(result.message);
      if (result.bookingId) setBookingId(result.bookingId);
      if (result.ok) setBookingDraft(null);
      await refresh(selectedId);
      notify(msg("Booking confirmation recorded in simulated data.", "تم تسجيل تأكيد الحجز في البيانات التجريبية."));
    } catch (error) {
      setBookingMessage(error instanceof Error ? error.message : msg("Could not confirm this draft.", "تعذر تأكيد المسودة."));
    } finally { setBusy(""); }
  };

  const changeBooking = async (action: "reschedule" | "cancel") => {
    if (!selectedId || !bookingId.trim() || !staffAllowed) return;
    setBusy(action);
    try {
      const payload = action === "reschedule"
        ? { bookingId: bookingId.trim(), action, date: changeDate, time: changeTime, lang, confirmed: false }
        : { bookingId: bookingId.trim(), action, lang, confirmed: false };
      const result = await request<BookingChangeDraft & { ok: boolean; requiresConfirmation?: boolean }>(
        `/api/whatsapp/conversations/${encodeURIComponent(selectedId)}/booking-change`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      if (result.requiresConfirmation) {
        setBookingChangeDraft(result);
        setBookingMessage(result.message);
      }
    } catch (error) {
      setBookingMessage(error instanceof Error ? error.message : msg("Could not update this booking.", "تعذر تحديث الحجز."));
    } finally { setBusy(""); }
  };

  const confirmBookingChange = async (confirmed: boolean) => {
    if (!selectedId || !bookingId.trim() || !bookingChangeDraft) return;
    setBusy(confirmed ? "change-confirm" : "change-decline");
    try {
      const result = await request<{ ok: boolean; message?: string }>(
        `/api/whatsapp/conversations/${encodeURIComponent(selectedId)}/booking-change`,
        {
          method: "POST",
          body: JSON.stringify({
            bookingId: bookingId.trim(),
            action: bookingChangeDraft.action,
            draftId: bookingChangeDraft.draftId,
            confirmed,
            declined: !confirmed,
            lang,
          }),
        },
      );
      setBookingMessage(result.message ?? msg("Booking change recorded.", "تم تسجيل تعديل الحجز."));
      setBookingChangeDraft(null);
      await refresh(selectedId);
    } catch (error) {
      setBookingMessage(error instanceof Error ? error.message : msg("Could not confirm this change.", "تعذر تأكيد التعديل."));
    } finally { setBusy(""); }
  };

  const lookupStatus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId || !bookingId.trim() || !verificationCode.trim() || !staffAllowed) return;
    setBusy("lookup"); setStatusResult(null); setLookupMessage("");
    try {
      const result = await request<StatusResult>(`/api/whatsapp/conversations/${encodeURIComponent(selectedId)}/status-lookup`, {
        method: "POST", body: JSON.stringify({ bookingId: bookingId.trim(), verificationCode: verificationCode.trim(), lang }),
      });
      setStatusResult(result);
      setLookupMessage("");
      await loadDetail(selectedId);
    } catch {
      setStatusResult(null);
      setLookupMessage(msg("We could not verify these details. Check the booking reference and verification code.", "تعذر التحقق من البيانات. راجع رقم الحجز ورمز التحقق."));
    } finally { setBusy(""); }
  };

  return <div className="wa-page" dir={rtl ? "rtl" : "ltr"}>
    <div className="page-heading">
      <div>
        <div className="eyebrow">{msg("BRANCH OPERATIONS · CONVERSATION SIMULATOR", "تشغيل الفروع · محاكاة المحادثات")}</div>
        <h1>{msg("WhatsApp branch inbox", "صندوق وارد واتساب للفروع")}</h1>
        <p className="subtitle">{msg(
          "A staff-owned queue for booking journeys, clear handoffs and safe status checks.",
          "قائمة يديرها الفريق لرحلات الحجز والتحويل الواضح والاستعلام الآمن عن الحالة.",
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
        <strong>{msg("SIMULATED JOURNEYS — no customer delivery", "رحلات تجريبية — لا توجد رسائل للعملاء")}</strong>
        <p>{msg(
          "This branch inbox uses fictional development data only. No WhatsApp provider calls, customer messages or staff alerts are sent.",
          "صندوق الوارد ده بيستخدم بيانات تطوير افتراضية فقط. مافيش اتصال بمزود واتساب أو رسائل للعملاء أو تنبيهات للفريق.",
        )}</p>
      </div>
      <div className="wa-safety-meta"><span>{msg("Branch workspace", "مساحة الفرع")}</span><strong>{branchName(branchId)}</strong></div>
    </section>

    <div className="wa-workspace">
      <section className="wa-card wa-inbox" aria-label={msg("Branch conversation inbox", "صندوق وارد محادثات الفرع")}>
        <header className="wa-inbox-head">
          <div className="wa-inbox-title">
            <h2>{msg("Branch inbox", "وارد الفرع")}</h2>
            <span className="wa-count">{branchConversations.length}</span>
          </div>
          <div className="wa-branch-control">
            <label htmlFor="wa-branch">{msg("Branch ownership", "مسؤولية الفرع")}</label>
            <select id="wa-branch" value={branchId} onChange={(event) => setBranchId(event.target.value as BranchId)}>
              {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branchName(branch.id)}</option>)}
            </select>
          </div>
          <button className="wa-new-thread" type="button" onClick={createConversation} disabled={!staffAllowed || busy === "create"}>
            <Plus size={15} />{busy === "create" ? msg("Creating…", "جاري الإنشاء…") : msg("New simulated conversation", "محادثة تجريبية جديدة")}
          </button>
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
                onClick={() => setSelectedId(conversation.id)}
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
            </div> : !listError && <div className="wa-list-empty">{msg("No conversations in this view yet.", "مفيش محادثات في العرض ده لسه.")}</div>}
      </section>

      <section className="wa-card wa-chat" aria-label={msg("Conversation and transcript", "المحادثة وسجلها")}>
        {selectedConversation ? <>
          <header className="wa-chat-head">
            <div className="wa-contact">
              <span className="wa-contact-mark"><MessageSquareText size={17} /></span>
              <div className="wa-contact-copy">
                <strong>{selectedConversation.customerLabel}</strong>
                <small>{msg("Fictional contact · no phone number", "جهة اتصال افتراضية · من غير رقم موبايل")} · {branchName(selectedConversation.branchId)}</small>
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
                <option value="reply">{msg("Staff reply (simulated)", "رد موظف (تجريبي)")}</option>
                <option value="customer">{msg("Customer message (simulated)", "رسالة عميل (تجريبية)")}</option>
                <option value="internal-note">{msg("Internal note · staff only", "ملاحظة داخلية · للفريق فقط")}</option>
              </select>
            </label>
            <label className="wa-field">
              <span className="sr-only">{msg("Message text", "نص الرسالة")}</span>
              <textarea rows={2} value={text} onChange={(event) => setText(event.target.value)} placeholder={composerKind === "internal-note" ? msg("Add context for staff only…", "أضف تفاصيل للفريق فقط…") : msg("Write a simulated entry…", "اكتب إدخالاً تجريبياً…")} />
            </label>
            <button className="wa-primary" type="submit" disabled={!text.trim() || busy === "message" || (composerKind !== "customer" && selectedConversation.assignedUserId !== currentUserId)}><Send size={14} />{busy === "message" ? msg("Saving…", "جاري الحفظ…") : msg("Add to transcript", "أضف للسجل")}</button>
            <span className="wa-composer-note">{composerKind === "internal-note"
              ? msg("Internal notes are staff-only and never displayed as customer replies.", "الملاحظات الداخلية للفريق فقط ومش بتظهر كردود للعميل.")
              : msg("Development data only. Nothing is delivered to a customer.", "بيانات تطوير فقط. مافيش حاجة بتوصل للعميل.")}</span>
            {composerKind !== "customer" && selectedConversation.assignedUserId !== currentUserId && <span className="wa-composer-note">{msg("Claim or assign this conversation to yourself before sending a staff reply or note.", "استلم المحادثة أو أسندها لنفسك قبل إرسال رد أو ملاحظة للفريق.")}</span>}
          </form> : <div className="wa-permission"><Wrench size={14} /> {msg("Technician access is excluded from this inbox. Owner, branch manager and receptionist roles can manage the simulated journey.", "صلاحية الفني غير متاحة لصندوق الوارد. المالك ومدير الفرع وموظف الاستقبال يقدروا يديروا الرحلة التجريبية.")}</div>}
        </> : <div className="wa-chat-empty">
          <div><MessageSquareText size={23} /><strong>{msg("Select a branch conversation", "اختار محادثة من الفرع")}</strong><p>{msg("Choose an inbox item or create a new fictional conversation to simulate a service journey.", "اختار محادثة أو أنشئ محادثة افتراضية جديدة لمحاكاة رحلة الخدمة.")}</p></div>
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

        <section className="wa-card wa-side-card" aria-labelledby="wa-booking-title">
          <div className="wa-panel-head"><div><h2 id="wa-booking-title">{msg("Booking journey", "رحلة الحجز")} </h2><p>{msg("Check branch availability, then prepare a confirm-only draft.", "راجع مواعيد الفرع وبعدها جهز مسودة لا تتأكد إلا بموافقة.")}</p></div><Clock3 size={16} /></div>
          {staffAllowed && selectedConversation ? <>
            {servicesError && <div className="wa-error-inline" role="alert">{servicesError} <button type="button" className="wa-secondary" onClick={() => { setServicesLoading(true); request<{ services: ServiceOption[] }>("/api/whatsapp/services").then((r) => { setServices(r.services); setServicesError(""); }).catch((e: unknown) => setServicesError(e instanceof Error ? e.message : msg("Could not load services.", "تعذر تحميل الخدمات."))).finally(() => setServicesLoading(false)); }}>{msg("Retry", "إعادة المحاولة")}</button></div>}
            <div className="wa-section-divider"><h3>{msg("Ask about a service", "استفسر عن خدمة")}</h3><p>{msg("The simulated reply reads the active service catalogue and shows labels and estimated work only.", "الرد التجريبي بيقرأ قائمة الخدمات الحالية ويعرض المسميات ومدة الشغل التقديرية فقط.")}</p></div>
            <button className="wa-primary wa-guided-button" type="button" disabled={!serviceId || servicesLoading || !!busy} onClick={() => void runGuidedJourney()}>
              {busy === "walkthrough" ? msg("Running guided journey…", "جاري تشغيل الرحلة…") : msg("Run guided booking journey", "شغّل رحلة الحجز")}
            </button>
            <p className="wa-guided-note">{msg(
              "Uses current branch data, then stops at a draft for confirmation. No message or booking is sent to a customer.",
              "تستخدم بيانات الفرع الحالية وتتوقف عند مسودة للتأكيد. لا يتم إرسال رسائل أو حجوزات للعملاء.",
            )}</p>
            <button className="wa-action" type="button" disabled={!serviceId || servicesLoading || !!busy} onClick={() => void askServiceQuestion()}>
              {busy === "service-question" ? msg("Checking catalogue…", "جاري مراجعة القائمة…") : msg("Ask the simulated assistant", "اسأل المساعد التجريبي")}
            </button>
            <form className="wa-form-stack" onSubmit={checkAvailability}>
              <label className="wa-field"><span>{msg("Service", "الخدمة")}</span>
                <select value={serviceId} onChange={(event) => { setServiceId(event.target.value); setAvailability(null); }} disabled={servicesLoading || !services.length}>
                  {servicesLoading && <option value="">{msg("Loading services…", "تحميل الخدمات…")}</option>}
                  {services.map((service) => <option key={service.id} value={service.id}>{serviceLabel(service)} · {service.priceLabel} · {service.bayHours}h</option>)}
                </select>
              </label>
              <label className="wa-field"><span>{msg("Preferred date", "التاريخ المفضل")}</span><input type="date" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} required /></label>
              <button className="wa-primary" type="submit" disabled={!serviceId || !bookingDate || busy === "availability"}><Clock3 size={14} />{busy === "availability" ? msg("Checking…", "جاري التحقق…") : msg("Check availability", "تحقق من المواعيد")}</button>
            </form>
            {availabilityError && <div className="wa-error-inline" role="alert">{availabilityError}</div>}
            {availability && <div className={`wa-result ${availability.available ? "" : "warning"}`}>
              <strong>{availability.available ? msg("Availability returned", "نتيجة المواعيد") : msg("No available slot on this date", "مفيش موعد متاح في التاريخ ده")}</strong>
              {availability.reason && <div>{availability.reason}</div>}
              {availability.scheduleNote && <div className="wa-provisional-note">{availability.scheduleNote}</div>}
              {availability.slots.length > 0 && <div className="wa-slot-list">{availability.slots.map((slot, index) => <div className="wa-slot" key={`${slot.date}-${slot.time}-${index}`}><span>{slot.date} · {slot.time}</span><button type="button" disabled={!!busy} onClick={() => void createBookingDraft(slot)}>{msg("Prepare draft", "جهّز مسودة")}</button></div>)}</div>}
              {availability.alternatives.length > 0 && <><div className="wa-section-divider"><h3>{msg("Alternative slots", "مواعيد بديلة")}</h3></div><div className="wa-slot-list">{availability.alternatives.map((slot, index) => <div className="wa-slot" key={`${slot.date}-${slot.time}-${index}`}><span>{slot.date} · {slot.time}</span><button type="button" disabled={!!busy} onClick={() => void createBookingDraft(slot)}>{msg("Prepare draft", "جهّز مسودة")}</button></div>)}</div></>}
            </div>}
            {bookingDraft && <div className="wa-draft">
              <strong>{msg("Booking draft · not confirmed", "مسودة حجز · غير مؤكدة")}</strong>
              <p>{bookingDraft.serviceName} · {bookingDraft.dropoffDate} · {bookingDraft.dropoffTime}<br />{msg("Estimated pickup", "موعد الاستلام التقديري")}: {bookingDraft.expectedPickup}<br />{bookingDraft.etaReason}<br />{msg("Estimate calculated", "وقت حساب التقدير")}: {formatTime(bookingDraft.etaAt)}</p>
              <div className="wa-button-row"><button className="wa-primary" type="button" disabled={!!busy} onClick={() => void confirmDraft(true)}>{msg("Simulate customer confirmation", "محاكاة موافقة العميل")}</button><button className="wa-secondary" type="button" disabled={!!busy} onClick={() => void confirmDraft(false)}>{msg("Customer declines draft", "العميل يرفض المسودة")}</button></div>
            </div>}
            {bookingMessage && <div className="wa-result" role="status">{bookingMessage}</div>}
            <div className="wa-section-divider"><h3>{msg("Change an existing booking", "تعديل حجز قائم")}</h3><p>{msg("Reschedule or cancel using the booking reference.", "غيّر الموعد أو ألغِ باستخدام رقم الحجز.")}</p></div>
            <div className="wa-form-stack">
              <label className="wa-field"><span>{msg("Booking reference", "رقم الحجز")}</span><input value={bookingId} onChange={(event) => setBookingId(event.target.value)} placeholder={msg("Enter booking ID", "أدخل رقم الحجز")} /></label>
              <div className="wa-field-row">
                <label className="wa-field"><span>{msg("New date", "التاريخ الجديد")}</span><input type="date" value={changeDate} onChange={(event) => setChangeDate(event.target.value)} /></label>
                <label className="wa-field"><span>{msg("New time", "الوقت الجديد")}</span><input type="time" min="08:00" max="23:00" step={3600} value={changeTime} onChange={(event) => setChangeTime(event.target.value)} /></label>
              </div>
              <div className="wa-button-row"><button className="wa-secondary" type="button" disabled={!bookingId.trim() || !changeTime || !!busy} onClick={() => void changeBooking("reschedule")}>{msg("Reschedule", "إعادة جدولة")}</button><button className="wa-danger" type="button" disabled={!bookingId.trim() || !!busy} onClick={() => void changeBooking("cancel")}>{msg("Cancel booking", "إلغاء الحجز")}</button></div>
            </div>
            {bookingChangeDraft && <div className="wa-draft">
              <strong>{msg("Customer confirmation required", "موافقة العميل مطلوبة")}</strong>
              <p>{bookingChangeDraft.message}<br />
                {bookingChangeDraft.action === "reschedule" && <>{bookingChangeDraft.dropoffDate} · {bookingChangeDraft.dropoffTime}<br />{msg("Estimated pickup", "موعد الاستلام التقديري")}: {bookingChangeDraft.expectedPickup}<br />{bookingChangeDraft.etaReason}{bookingChangeDraft.etaAt && <><br />{msg("Estimate calculated", "وقت حساب التقدير")}: {formatTime(bookingChangeDraft.etaAt)}</>}</>}
                <br />{msg("No booking change is committed until you simulate the customer's confirmation.", "لن يُنفذ التعديل قبل محاكاة موافقة العميل.")}</p>
              <div className="wa-button-row">
                <button className="wa-primary" type="button" disabled={!!busy} onClick={() => void confirmBookingChange(true)}>{msg("Simulate customer confirmation", "محاكاة موافقة العميل")}</button>
                <button className="wa-secondary" type="button" disabled={!!busy} onClick={() => void confirmBookingChange(false)}>{msg("Customer declines", "العميل يرفض")}</button>
              </div>
            </div>}
            <form className="wa-form-stack" onSubmit={lookupStatus}>
              <div className="wa-section-divider"><h3>{msg("Safe status & ETA lookup", "استعلام آمن عن الحالة والموعد")}</h3><p>{msg("Requires booking reference and verification code.", "يتطلب رقم الحجز ورمز التحقق.")}</p></div>
              <label className="wa-field"><span>{msg("Fictional demo verification code", "رمز التحقق الافتراضي")}</span><input autoComplete="off" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} /></label>
              <button className="wa-action" type="submit" disabled={!bookingId.trim() || !verificationCode.trim() || busy === "lookup"}>{busy === "lookup" ? msg("Verifying…", "جاري التحقق…") : msg("Look up status & ETA", "اعرض الحالة والموعد المتوقع")}</button>
            </form>
            {lookupMessage && <div className="wa-result warning" role="alert">{lookupMessage}</div>}
            {statusResult && <div className="wa-result" role="status">
              <strong>{msg("Verified fictional status", "الحالة الافتراضية بعد التحقق")}</strong>
              <br />{statusResult.status === "confirmed" ? msg("Confirmed", "مؤكد") : statusResult.status === "pending" ? msg("Pending staff review", "بانتظار مراجعة الفريق") : msg("Cancelled", "ملغي")}
              {statusResult.stage && <> · {jobStageLabel(statusResult.stage)}</>}
              {statusResult.expectedPickup && <><br />{msg("Estimated pickup", "موعد الاستلام التقديري")}: {statusResult.expectedPickup}</>}
              {statusResult.changedFrom && <><br />{msg("Estimate changed from", "تغير التقدير من")}: {statusResult.changedFrom}</>}
              {statusResult.etaReason && <><br />{statusResult.etaReason}</>}
              {statusResult.etaAt && <><br />{msg("Estimate calculated", "وقت حساب التقدير")}: {formatTime(statusResult.etaAt)}</>}
              {!!statusResult.milestones?.length && <ol className="wa-events">{statusResult.milestones.map((milestone, index) =>
                <li className="wa-event" key={`${milestone.stage}-${index}`}><span className="wa-event-dot" /><div><strong>{milestone.stage}</strong><time>{formatTime(milestone.occurredAt)}</time></div></li>,
              )}</ol>}
            </div>}
          </> : selectedConversation ? <p className="wa-permission">{msg("Technicians cannot run simulated booking or status workflows.", "الفنيون لا يمكنهم تشغيل إجراءات الحجز أو الحالة التجريبية.")}</p>
            : <p className="wa-list-empty">{msg("Select a conversation to start a service journey.", "اختار محادثة لبدء رحلة الخدمة.")}</p>}
          <div className="wa-simulation-caption">{msg("A draft is not a booking. A booking is created only after you simulate the customer's explicit confirmation. All writes are fictional development data.", "المسودة مش حجز. إنشاء الحجز بيحصل بس بعد محاكاة موافقة العميل الصريحة. كل التغييرات بيانات تطوير افتراضية.")}</div>
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
