export type SendDocumentKind = "invoice" | "quote" | "warranty-card";
export type SendChannel = "whatsapp" | "app";

export interface DeliveryEntry {
  id: string; status: string; deliveryMode: "simulated" | "live"; trigger: "manual" | "auto"; recipient: string; language: "ar" | "en"; linkIncluded: boolean; sentAt: string;
}

export type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; entry: DeliveryEntry; replayed: boolean }
  | { kind: "error"; code: string };

/** Truthful label for a history entry: a simulated send is never described as delivered. */
export function deliveryStatusLabel(entry: Pick<DeliveryEntry, "status" | "deliveryMode">, lang: "ar" | "en"): string {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  if (entry.deliveryMode === "simulated" || entry.status === "sent-simulated") return t("Simulated send (not delivered)", "إرسال تجريبي (لم يُسلَّم فعلياً)");
  switch (entry.status) {
    case "accepted": return t("Accepted by WhatsApp", "قبله واتساب");
    case "delivered": return t("Delivered", "تم التسليم");
    case "read": return t("Read", "تمت القراءة");
    case "queued": return t("Queued", "في الانتظار");
    default: return t("Not delivered", "لم يُسلَّم");
  }
}

/** "Last sent" line: the newest entry, recipient as stored (already masked by the server). */
export function lastSentLine(entries: readonly DeliveryEntry[], lang: "ar" | "en", format: (iso: string) => string): string | null {
  const last = entries[0];
  if (!last) return null;
  const when = format(last.sentAt);
  return lang === "ar"
    ? `آخر إرسال إلى ${last.recipient} في ${when} · ${deliveryStatusLabel(last, lang)}`
    : `Last sent to ${last.recipient} at ${when} · ${deliveryStatusLabel(last, lang)}`;
}

const errors: Record<string, [string, string]> = {
  CONSENT_REQUIRED: ["This customer has no recorded WhatsApp consent, so nothing was sent. Record consent first.", "لا توجد موافقة مسجلة من العميل على واتساب، لذلك لم يُرسل شيء. سجّل الموافقة أولاً."],
  CHANNEL_NOT_AVAILABLE: ["Sending to the customer app is not available yet.", "الإرسال إلى تطبيق العميل غير متاح بعد."],
  ROLE_FORBIDDEN: ["Your role cannot send this document.", "دورك لا يسمح بإرسال هذا المستند."],
  DEMO_ACTION_DISABLED: ["Documents cannot be sent in a role preview session.", "لا يمكن إرسال المستندات في جلسة معاينة الدور."],
  DOCUMENT_NOT_FOUND: ["Document not found.", "لم يُعثر على المستند."],
  INVOICE_NOT_SENDABLE: ["Only an issued invoice can be sent.", "يمكن إرسال الفاتورة الصادرة فقط."],
  QUOTE_NOT_SENDABLE: ["Only an offered or accepted quote can be sent.", "يمكن إرسال العرض المقدّم أو المقبول فقط."],
  WARRANTY_NOT_SENDABLE: ["Only an active warranty card can be sent.", "يمكن إرسال بطاقة ضمان فعالة فقط."],
  IDEMPOTENCY_CONFLICT: ["This send is already in progress. Reload to see the history.", "هذا الإرسال قيد التنفيذ. أعد التحميل لرؤية السجل."],
  DELIVERY_FAILED: ["The message could not be delivered.", "تعذّر تسليم الرسالة."],
  NETWORK: ["The server could not be reached. Try again; the same request will not be sent twice.", "تعذّر الوصول إلى الخادم. حاول مرة أخرى؛ لن يُرسل الطلب نفسه مرتين."],
};
export const sendErrorCopy = (code: string, lang: "ar" | "en"): string => (errors[code] ?? ["The document could not be sent.", "تعذّر إرسال المستند."])[lang === "ar" ? 1 : 0];

export type SendEvent = { type: "start" } | { type: "done"; entry: DeliveryEntry; replayed: boolean } | { type: "fail"; code: string } | { type: "reset" };
/** Pure reducer so the button state is testable. */
export function nextSendState(state: SendState, event: SendEvent): SendState {
  switch (event.type) {
    case "start": return state.kind === "sending" ? state : { kind: "sending" };
    case "done": return { kind: "sent", entry: event.entry, replayed: event.replayed };
    case "fail": return { kind: "error", code: event.code };
    case "reset": return { kind: "idle" };
  }
}
/** A retry after a network failure must reuse the key (so it cannot send twice); a fresh send after success or a business error gets a new one. */
export const keepKeyOnRetry = (code: string) => code === "NETWORK";
