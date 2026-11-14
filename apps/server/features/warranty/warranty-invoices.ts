import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

function makeId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
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
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO warranty_invoice_drafts (id, warranty_id, branch_id, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT (warranty_id) DO NOTHING
     RETURNING id`,
    [invoiceId, input.warrantyId, input.branchId, input.actorUserId],
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
