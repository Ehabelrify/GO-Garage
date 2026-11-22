import type { Locale } from "@garage/domain";
import { StatusBadge } from "../../shared/components";
import { statusLabel } from "./invoice-model";
import type { Invoice } from "./invoices-api";

/** Status badge for the generic invoice lifecycle (draft / issued / part paid / paid / void), on the shared StatusBadge. */
export function InvoiceStatusBadge({ status, lang }: { status: Invoice["status"]; lang: Locale }) {
  return <StatusBadge status={status} domain="invoice" lang={lang} label={statusLabel(status, lang)} />;
}
