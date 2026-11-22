import type { Locale, WarrantyRecord } from "@garage/domain";
import { dateLabel } from "../../shared/ui";
import { policyDisplayName } from "./warranty-logic";

export type CardVariant = "card" | "a5";
export type CardQr =
  | { state: "live"; url: string }
  | { state: "unavailable"; reason: "verification-off" | "not-prepared" };

export interface WarrantyCardInput {
  record: Pick<WarrantyRecord, "id" | "policyName" | "startDate" | "expiresOn" | "terminatedOn" | "coverageKind" | "lifetimeDefinition" | "issuedAt" | "status" | "verificationTokenActive">;
  lang: Locale;
  customerName: string;
  plate: string;
  vehicleDescription?: string;
  serviceLabel: string;
  branchLabel: string;
  /** True only when the Owner enabled public verification with the required fields (verificationReady). */
  verificationEnabled: boolean;
  /** Plain token, known only right after it was prepared in this browser session. Never persisted. */
  token: string | null;
  origin: string;
  /** Vite BASE_URL; trailing slash tolerated. */
  basePath: string;
}

const copy = {
  en: {
    title: "Warranty card", number: "Warranty no.", customer: "Customer", vehicle: "Vehicle", coverage: "Coverage", service: "Service",
    branch: "Branch", issued: "Issued", lifetime: "Lifetime coverage", validUntil: "Valid until", from: "From", ended: "Ended",
    scan: "Scan to verify", qrOff: "Online verification is not available for this card.",
    backTitle: "How to claim",
    steps: ["Keep this card with your invoice.", "Contact the branch that issued this card.", "Bring the vehicle and this card."],
    placeholder: "[Claim instructions: wording to be confirmed]",
    subtitle: "Workshop services",
  },
  ar: {
    title: "بطاقة الضمان", number: "رقم الضمان", customer: "العميل", vehicle: "المركبة", coverage: "التغطية", service: "الخدمة",
    branch: "الفرع", issued: "تاريخ الإصدار", lifetime: "تغطية مدى الحياة", validUntil: "صالح حتى", from: "من", ended: "انتهت في",
    scan: "امسح للتحقق", qrOff: "التحقق عبر الإنترنت غير متاح لهذه البطاقة.",
    backTitle: "كيف تقدم مطالبة",
    steps: ["احتفظ بهذه البطاقة مع فاتورتك.", "تواصل مع الفرع الذي أصدر البطاقة.", "أحضر المركبة وهذه البطاقة."],
    placeholder: "[تعليمات المطالبة: الصياغة قيد الاعتماد]",
    subtitle: "خدمات الورشة",
  },
} as const;

export type CardLabels = { [K in keyof (typeof copy)["en"]]: K extends "steps" ? readonly string[] : string };
export const cardLabels = (lang: Locale): CardLabels => copy[lang];

export interface WarrantyCardModel {
  lang: Locale;
  labels: CardLabels;
  business: { name: string; subtitle: string };
  number: string;
  customerName: string;
  plate: string;
  vehicleDescription: string | null;
  product: string;
  serviceLabel: string;
  coverageKind: "fixed" | "lifetime";
  /** Short heading of the term: "Lifetime coverage" or "Valid until <date>". */
  termHeading: string;
  /** Lifetime wording exactly as issued (the issued public wording), else null. */
  termDetail: string | null;
  startLabel: string;
  branch: string;
  issueDate: string;
  qr: CardQr;
  qrNote: string | null;
  void: boolean;
}

/** Short, stable display reference derived from the stored id so raw ids never print. Not a sequence number. */
export function warrantyDisplayNumber(id: string, issuedAt: string): string {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) { hash ^= id.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
  const year = /^\d{4}/.test(issuedAt) ? issuedAt.slice(0, 4) : "0000";
  return `WC-${year}-${hash.toString(36).toUpperCase().padStart(7, "0").slice(-6)}`;
}

/** The public verification URL a printed code resolves to. */
export function buildVerifyUrl(origin: string, basePath: string, token: string): string {
  return `${origin.replace(/\/$/, "")}${basePath.replace(/\/$/, "")}/warranty/verify/${encodeURIComponent(token)}`;
}

/** Pure card model: no store access. QR only when verification is enabled AND a fresh token exists for an active code. */
export function buildWarrantyCard(input: WarrantyCardInput): WarrantyCardModel {
  const { record, lang } = input;
  const c = copy[lang];
  const lifetime = record.coverageKind === "lifetime";
  const wording = lifetime ? record.lifetimeDefinition?.publicWording?.[lang]?.trim() || null : null;
  let termHeading: string;
  if (lifetime) termHeading = record.terminatedOn ? `${c.ended} ${dateLabel(record.terminatedOn, lang)}` : c.lifetime;
  else termHeading = `${c.validUntil} ${record.expiresOn ? dateLabel(record.expiresOn, lang) : "—"}`;
  let qr: CardQr;
  if (!input.verificationEnabled) qr = { state: "unavailable", reason: "verification-off" };
  else if (input.token && record.verificationTokenActive && record.status !== "void") qr = { state: "live", url: buildVerifyUrl(input.origin, input.basePath, input.token) };
  else qr = { state: "unavailable", reason: "not-prepared" };
  return {
    lang, labels: c,
    business: { name: "Go Stores", subtitle: c.subtitle },
    number: warrantyDisplayNumber(record.id, record.issuedAt),
    customerName: input.customerName, plate: input.plate, vehicleDescription: input.vehicleDescription ?? null,
    product: policyDisplayName(record.policyName), serviceLabel: input.serviceLabel,
    coverageKind: record.coverageKind, termHeading, termDetail: wording,
    startLabel: `${c.from} ${dateLabel(record.startDate, lang)}`,
    branch: input.branchLabel, issueDate: dateLabel(record.issuedAt || record.startDate, lang),
    qr, qrNote: qr.state === "live" ? null : c.qrOff, void: record.status === "void",
  };
}

/** In-memory (this tab only) plain tokens right after preparing a code; the server keeps only a hash. */
const liveTokens = new Map<string, string>();
export const liveToken = (warrantyId: string) => liveTokens.get(warrantyId) ?? null;
export const rememberLiveToken = (warrantyId: string, token: string) => { liveTokens.set(warrantyId, token); };
export const forgetLiveToken = (warrantyId: string) => { liveTokens.delete(warrantyId); };
export const clearLiveTokens = () => { liveTokens.clear(); };
