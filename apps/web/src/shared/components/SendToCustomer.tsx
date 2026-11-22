import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import type { Locale } from "@garage/domain";
import { Notice } from "./Notice";
import { documentDeliveryApi, DeliveryApiError } from "./send-to-customer-api";
import {
  keepKeyOnRetry, lastSentLine, nextSendState, sendErrorCopy, type DeliveryEntry, type SendDocumentKind, type SendState,
} from "./send-to-customer-logic";

export interface SendToCustomerProps {
  lang: Locale;
  documentKind: SendDocumentKind;
  documentId: string | null;
  /** Disable when the document is not in a sendable state (draft invoice, void warranty). */
  disabled?: boolean;
  /** Warranty cards only: the live QR token still held by the browser, so the message can link the verification page. */
  verificationToken?: string | null;
}

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const formatWhen = (iso: string, lang: Locale) => new Date(iso).toLocaleString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

/** Send a document to the customer's WhatsApp. Messaging is simulated until a provider is connected, and the copy says so. */
export function SendToCustomer({ lang, documentKind, documentId, disabled, verificationToken }: SendToCustomerProps) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [state, setState] = useState<SendState>({ kind: "idle" });
  const [history, setHistory] = useState<DeliveryEntry[]>([]);
  const [mode, setMode] = useState<"simulated" | "live">("simulated");
  const key = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!documentId) return;
    try { const result = await documentDeliveryApi.history(documentKind, documentId); setHistory(result.deliveries); setMode(result.deliveryMode); } catch { /* history is a convenience */ }
  }, [documentKind, documentId]);
  useEffect(() => { setState({ kind: "idle" }); key.current = null; setHistory([]); void load(); }, [load]);

  const send = async () => {
    if (!documentId || state.kind === "sending") return;
    key.current = key.current ?? newKey();
    setState((s) => nextSendState(s, { type: "start" }));
    try {
      const result = await documentDeliveryApi.send({ documentKind, documentId, channel: "whatsapp", idempotencyKey: key.current, ...(verificationToken ? { verificationToken } : {}) });
      key.current = null;
      setState((s) => nextSendState(s, { type: "done", entry: result.entry, replayed: result.replayed }));
      void load();
    } catch (failure) {
      const code = failure instanceof DeliveryApiError ? failure.code : "REQUEST_FAILED";
      if (!keepKeyOnRetry(code)) key.current = null;
      setState((s) => nextSendState(s, { type: "fail", code }));
    }
  };

  const last = lastSentLine(history, lang, (iso) => formatWhen(iso, lang));
  return <span className="no-print" data-testid={`send-${documentKind}`}>
    <button type="button" className="btn btn-sm" disabled={disabled || !documentId || state.kind === "sending"} onClick={() => void send()}>
      <Send size={14} aria-hidden="true" />{state.kind === "sending" ? t("Sending…", "جارٍ الإرسال…") : t("Send to customer", "إرسال للعميل")}
    </button>
    {mode === "simulated" && <span className="form-hint"> {t("WhatsApp is simulated: nothing reaches the customer.", "واتساب تجريبي: لا شيء يصل إلى العميل.")}</span>}
    {state.kind === "error" && <div role="alert"><Notice tone="warning">{sendErrorCopy(state.code, lang)}</Notice></div>}
    {state.kind === "sent" && <div role="status"><Notice tone="info">{state.replayed ? t("Already sent with this request. ", "أُرسل سابقاً بهذا الطلب. ") : ""}{lastSentLine([state.entry], lang, (iso) => formatWhen(iso, lang))}</Notice></div>}
    {state.kind !== "sent" && last && <div className="form-hint">{last}</div>}
  </span>;
}
