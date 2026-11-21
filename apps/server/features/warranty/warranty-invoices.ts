import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { DEFAULT_CURRENCY, findMixedCurrency, isSupportedCurrency, resolveCurrency } from "@garage/domain";

function makeId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

export type InvoiceCurrencyProblem = "UNSUPPORTED_CURRENCY" | "MIXED_CURRENCY" | "CURRENCY_LOCKED";

/**
 * Validates the currency of an invoice draft update. A supplied currency must be on the central list,
 * every line that names a currency must match the invoice currency (totals never mix currencies),
 * and the currency cannot change once payment has been entered. Returns null when valid.
 */
export function invoiceCurrencyProblem(input: {
  requested: string | undefined;
  stored: string;
  lines: ReadonlyArray<{ currency?: string }>;
  paymentEntered: boolean;
}): InvoiceCurrencyProblem | null {
  if (input.requested !== undefined && !isSupportedCurrency(input.requested)) return "UNSUPPORTED_CURRENCY";
  const effective = input.requested ?? input.stored;
  if (findMixedCurrency(input.lines, effective) !== -1) return "MIXED_CURRENCY";
  if (input.requested !== undefined && input.requested !== input.stored && input.paymentEntered) return "CURRENCY_LOCKED";
  return null;
}

/** Currency for a new draft: the active approved finance definition when it names a supported currency, else EGP. */
export async function defaultInvoiceCurrency(client: PoolClient): Promise<string> {
  const found = await client.query<{ currency: string | null }>(
    `SELECT v.value->>'currency' AS currency
     FROM commercial_policy_active a
     JOIN commercial_policy_versions v ON v.policy_id = a.policy_id AND v.version = a.version
     WHERE v.family = 'finance-definition' AND v.state = 'approved'
     ORDER BY a.activated_at DESC LIMIT 1`,
  );
  return resolveCurrency(found.rows[0]?.currency, DEFAULT_CURRENCY);
}

export async function ensureWarrantyInvoiceDraft(
  client: PoolClient,
  input: { warrantyId: string; branchId: string; serviceId: string; actorUserId: string },
) {
  const existing = await client.query<{ id: string }>(
    "SELECT id FROM warranty_invoice_drafts WHERE warranty_id = $1 FOR UPDATE",
    [input.warrantyId],
  );
  if (existing.rowCount) return existing.rows[0].id;

  const service = await client.query<{ name_en: string; name_ar: string }>(
    "SELECT name_en, name_ar FROM services WHERE id = $1",
    [input.serviceId],
  );
  if (!service.rowCount) throw new Error("A warranty invoice requires an existing service.");

  const invoiceId = makeId("warranty-invoice");
  const currency = await defaultInvoiceCurrency(client);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO warranty_invoice_drafts (id, warranty_id, branch_id, created_by, updated_by, currency)
     VALUES ($1, $2, $3, $4, $4, $5)
     ON CONFLICT (warranty_id) DO NOTHING
     RETURNING id`,
    [invoiceId, input.warrantyId, input.branchId, input.actorUserId, currency],
  );
  if (!inserted.rowCount) {
    const raced = await client.query<{ id: string }>(
      "SELECT id FROM warranty_invoice_drafts WHERE warranty_id = $1",
      [input.warrantyId],
    );
    if (!raced.rowCount) throw new Error("Warranty invoice draft could not be created.");
    return raced.rows[0].id;
  }

  await client.query(
    `INSERT INTO warranty_invoice_draft_items
       (id, invoice_id, description, quantity, unit_amount, sort_order)
     VALUES ($1, $2, $3, 1, NULL, 0)`,
    [makeId("warranty-invoice-item"), invoiceId, `${service.rows[0].name_en} / ${service.rows[0].name_ar}`],
  );
  return invoiceId;
}
