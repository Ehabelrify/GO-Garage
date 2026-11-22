import { currencyExponent } from "@garage/domain";

export type DocumentKind = "invoice" | "quote" | "warranty-card";
export type MessageLanguage = "ar" | "en";

export interface MessageInput {
  kind: DocumentKind;
  lang: MessageLanguage;
  customerName: string;
  /** Invoice number, quote reference or warranty number. */
  reference: string | null;
  status?: string;
  totalMinor?: number | null;
  paidMinor?: number | null;
  currency?: string | null;
  /** YYYY-MM-DD: quote validity or warranty expiry. */
  date?: string | null;
  serviceName?: string | null;
  plate?: string | null;
  /** Only a verifiable public page may be linked (the warranty verification page). Never an internal staff route. */
  link?: string | null;
}

function amount(minor: number | null | undefined, currency: string | null | undefined, lang: MessageLanguage): string | null {
  if (minor === null || minor === undefined || !currency) return null;
  const exponent = currencyExponent(currency);
  const value = (minor / 10 ** exponent).toFixed(exponent);
  return lang === "ar" ? `${value} ${currency}` : `${currency} ${value}`;
}

const copy = {
  en: {
    hello: (name: string) => `Hello ${name},`,
    invoice: (ref: string | null) => `your invoice${ref ? ` ${ref}` : ""} from Go Stores is ready.`,
    quote: (ref: string | null) => `your price quote${ref ? ` ${ref}` : ""} from Go Stores is ready.`,
    warranty: (ref: string | null) => `your warranty${ref ? ` ${ref}` : ""} from Go Stores is active.`,
    total: "Total", paid: "Paid", valid: "Valid until", expires: "Warranty valid until", lifetime: "Coverage", service: "Service", vehicle: "Vehicle",
    link: "Verify online", noLink: "Details are in the printed document. Ask us if you need a copy.", thanks: "Thank you for choosing Go Stores.",
    fallbackName: "customer", lifetimeWord: "lifetime",
  },
  ar: {
    hello: (name: string) => `مرحباً ${name}،`,
    invoice: (ref: string | null) => `فاتورتك${ref ? ` ${ref}` : ""} من جو ستورز جاهزة.`,
    quote: (ref: string | null) => `عرض السعر${ref ? ` ${ref}` : ""} من جو ستورز جاهز.`,
    warranty: (ref: string | null) => `ضمانك${ref ? ` ${ref}` : ""} من جو ستورز ساري.`,
    total: "الإجمالي", paid: "المدفوع", valid: "ساري حتى", expires: "الضمان ساري حتى", lifetime: "التغطية", service: "الخدمة", vehicle: "السيارة",
    link: "التحقق عبر الإنترنت", noLink: "التفاصيل في المستند المطبوع. تواصل معنا إذا احتجت نسخة.", thanks: "شكراً لاختيارك جو ستورز.",
    fallbackName: "عميلنا", lifetimeWord: "مدى الحياة",
  },
} as const;

/** Localized message text. A link is included only when a safe public page was supplied; otherwise the summary stands alone. */
export function buildDocumentMessage(input: MessageInput): { body: string; linkIncluded: boolean } {
  const c = copy[input.lang];
  const intro = input.kind === "invoice" ? c.invoice(input.reference) : input.kind === "quote" ? c.quote(input.reference) : c.warranty(input.reference);
  const lines: string[] = [`${c.hello(input.customerName.trim() || c.fallbackName)} ${intro}`];
  if (input.serviceName) lines.push(`${c.service}: ${input.serviceName}`);
  if (input.plate) lines.push(`${c.vehicle}: ${input.plate}`);
  const total = amount(input.totalMinor, input.currency, input.lang);
  if (total) lines.push(`${c.total}: ${total}`);
  if (input.kind === "invoice") {
    const paid = amount(input.paidMinor, input.currency, input.lang);
    if (paid && (input.paidMinor ?? 0) > 0) lines.push(`${c.paid}: ${paid}`);
  }
  if (input.date) lines.push(`${input.kind === "quote" ? c.valid : c.expires}: ${input.date}`);
  else if (input.kind === "warranty-card") lines.push(`${c.lifetime}: ${c.lifetimeWord}`);
  const linkIncluded = Boolean(input.link);
  lines.push(linkIncluded ? `${c.link}: ${input.link}` : c.noLink);
  lines.push(c.thanks);
  return { body: lines.join("\n"), linkIncluded };
}

/** "+20•••••234": enough for staff to recognize the number, never the full phone. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.length <= 6) return digits;
  return `${digits.slice(0, 3)}${"•".repeat(Math.max(2, digits.length - 6))}${digits.slice(-3)}`;
}
