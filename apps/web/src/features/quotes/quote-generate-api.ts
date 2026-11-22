import type { QuoteVersionRef } from "@garage/domain";
import { invalidateForMutation } from "../../shared/invalidation";

export type QuoteSourceRef = { kind: "special-request"; requestId: string } | { kind: "booking"; bookingId: string };
export interface QuoteSourceOption { key: string; kind: "special-request" | "booking"; id: string; date: string; vehicleId: string; serviceId: string | null; title: string | null; status: string; quoteId: string | null }
export interface GeneratedQuote { quote: QuoteVersionRef; created: boolean; warnings: string[]; customerId: string; vehicleId: string }

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) }, ...init });
  } catch {
    throw Object.assign(new Error("NETWORK"), { code: "WRITE_OUTCOME_UNKNOWN" });
  }
  const body = await response.json().catch(() => null) as { code?: string } | null;
  if (!response.ok) throw Object.assign(new Error(body?.code ?? "REQUEST_FAILED"), { code: body?.code ?? "REQUEST_FAILED", status: response.status });
  invalidateForMutation(url, init?.method);
  return body as T;
}

export const listQuoteSources = (customerId: string, vehicleId?: string) =>
  call<QuoteSourceOption[]>(`/api/quotes/sources?customerId=${encodeURIComponent(customerId)}${vehicleId ? `&vehicleId=${encodeURIComponent(vehicleId)}` : ""}`);
export const generateQuote = (source: QuoteSourceRef) => call<GeneratedQuote>("/api/quotes/generate", { method: "POST", body: JSON.stringify(source) });

/** Sources arrive newest first; the picker is skipped when exactly one exists and a blank quote opens when none do. */
export function sourceStep(sources: QuoteSourceOption[]): "blank" | "single" | "pick" {
  return sources.length === 0 ? "blank" : sources.length === 1 ? "single" : "pick";
}

export const sourceRef = (source: QuoteSourceOption): QuoteSourceRef =>
  source.kind === "booking" ? { kind: "booking", bookingId: source.id } : { kind: "special-request", requestId: source.id };

export const warningText: Record<string, { en: string; ar: string }> = {
  "no-catalogue-price": { en: "No approved catalogue price was found. Enter the price before offering.", ar: "لا يوجد سعر كتالوج معتمد. أدخل السعر قبل إرسال العرض." },
  "tax-not-set": { en: "Tax is not set on some lines. Check it before offering.", ar: "الضريبة غير محددة في بعض البنود. راجعها قبل إرسال العرض." },
  "package-ambiguous": { en: "More than one package fits. The first was chosen; check it.", ar: "أكثر من باقة مناسبة. تم اختيار الأولى؛ راجعها." },
  "transport-added": { en: "Transport fees were added as separate lines.", ar: "أُضيفت رسوم النقل كبنود منفصلة." },
  "terms-missing": { en: "Quote terms are not set up, so this can only be saved as a draft.", ar: "شروط العرض غير معدّة، لذا يمكن حفظه كمسودة فقط." },
  "benefit-available": { en: "The customer has active benefits. Check whether a discount applies.", ar: "لدى العميل منافع فعّالة. تحقق من انطباق خصم." },
  "service-guessed": { en: "The service was taken from the vehicle's last booking. Check it.", ar: "الخدمة مأخوذة من آخر حجز للمركبة. راجعها." },
  "price-from-request": { en: "The price comes from the accepted special request.", ar: "السعر مأخوذ من الطلب الخاص المقبول." },
};
