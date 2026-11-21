import type { Locale } from "@garage/domain";
import { statusLabel } from "./invoice-model";
import type { Invoice } from "./invoices-api";

const tone: Record<Invoice["status"], string> = { draft: "neutral", issued: "info", partial: "warning", paid: "success", void: "danger" };

/** Status pill for the generic invoice lifecycle (draft / issued / part paid / paid / void). */
export function InvoiceStatusBadge({ status, lang }: { status: Invoice["status"]; lang: Locale }) {
  return <span className={`status ${status}`} data-tone={tone[status]}>{statusLabel(status, lang)}</span>;
}
