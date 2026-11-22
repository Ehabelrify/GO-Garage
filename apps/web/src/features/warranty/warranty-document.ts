import type { Locale, WarrantyRecord } from "@garage/domain";
import type { DocumentModel } from "../../shared/components";
import { dateLabel } from "../../shared/ui";
import { policyDisplayName } from "./warranty-logic";

export interface CoverageDocumentInput {
  record: Pick<WarrantyRecord, "id" | "policyName" | "policyVersion" | "startDate" | "expiresOn" | "terminatedOn" | "coverageKind" | "status">;
  lang: Locale;
  customerName: string;
  plate: string;
  vehicleDescription?: string;
  serviceLabel: string;
  branchLabel: string;
  statusLabel: string;
}

const copy = {
  en: { title: "Warranty coverage", customer: "Customer", vehicle: "Vehicle", lifetime: "Lifetime", from: "From", until: "until", service: "Service", subtitle: "Workshop services",
    disclaimer: "Coverage terms follow the published policy. This sheet is a record of coverage, not a tax invoice.", issued: "Issued by", holder: "Customer signature" },
  ar: { title: "تغطية الضمان", customer: "العميل", vehicle: "المركبة", lifetime: "مدى الحياة", from: "من", until: "حتى", service: "الخدمة", subtitle: "خدمات الورشة",
    disclaimer: "تخضع التغطية لشروط السياسة المنشورة. هذه الورقة سجل للتغطية وليست فاتورة ضريبية.", issued: "أصدرها", holder: "توقيع العميل" },
} as const;

/** Printable coverage sheet for the shared DocumentSheet. Pure: no store access, no amounts (coverage is not priced). */
export function buildCoverageDocument(input: CoverageDocumentInput): DocumentModel {
  const { record, lang } = input;
  const c = copy[lang];
  const end = record.coverageKind === "lifetime"
    ? (record.terminatedOn ? dateLabel(record.terminatedOn, lang) : c.lifetime)
    : record.expiresOn ? dateLabel(record.expiresOn, lang) : "—";
  return {
    lang,
    business: { name: "Go Stores", subtitle: c.subtitle },
    title: c.title,
    number: null,
    statusLabel: input.statusLabel,
    branch: input.branchLabel,
    issueDate: dateLabel(record.startDate, lang),
    customer: { label: c.customer, name: input.customerName },
    vehicle: { label: c.vehicle, plate: input.plate, ...(input.vehicleDescription ? { description: input.vehicleDescription } : {}) },
    lines: [{
      description: `${policyDisplayName(record.policyName)} · v${record.policyVersion}`,
      detail: `${c.service}: ${input.serviceLabel} · ${c.from} ${dateLabel(record.startDate, lang)} ${c.until} ${end}`,
      quantity: 1, unitMinor: null, amountMinor: null, currency: "EGP",
    }],
    totals: [],
    disclaimer: c.disclaimer,
    signatures: [{ label: c.issued }, { label: c.holder }],
  };
}
