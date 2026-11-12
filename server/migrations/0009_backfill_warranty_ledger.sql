INSERT INTO warranty_invoice_drafts
  (id, warranty_id, branch_id, created_by, updated_by)
SELECT 'warranty-invoice-backfill-' || w.id, w.id, w.branch_id, w.issued_by, w.issued_by
FROM warranties w
ON CONFLICT (warranty_id) DO NOTHING;

INSERT INTO warranty_invoice_draft_items
  (id, invoice_id, description, quantity, unit_amount, sort_order)
SELECT 'warranty-invoice-item-backfill-' || w.id,
       invoice.id,
       s.name_en || ' / ' || s.name_ar,
       1,
       NULL,
       0
FROM warranties w
JOIN warranty_invoice_drafts invoice ON invoice.warranty_id = w.id
JOIN services s ON s.id = w.service_id
WHERE NOT EXISTS (
  SELECT 1 FROM warranty_invoice_draft_items item WHERE item.invoice_id = invoice.id
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO warranty_qr_print_events
  (id, warranty_id, token_id, action, actor_user_id, created_at)
SELECT 'warranty-qr-prepared-backfill-' || token.id,
       token.warranty_id,
       token.id,
       'prepared',
       token.created_by,
       token.created_at
FROM warranty_verification_tokens token
WHERE NOT EXISTS (
  SELECT 1 FROM warranty_qr_print_events event
  WHERE event.token_id = token.id AND event.action IN ('prepared', 'replaced')
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO warranty_qr_print_events
  (id, warranty_id, token_id, action, actor_user_id, created_at)
SELECT 'warranty-qr-revoked-backfill-' || token.id,
       token.warranty_id,
       token.id,
       'revoked',
       token.revoked_by,
       token.revoked_at
FROM warranty_verification_tokens token
WHERE token.revoked_at IS NOT NULL
  AND token.revoked_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM warranty_qr_print_events event
    WHERE event.token_id = token.id AND event.action = 'revoked'
  )
ON CONFLICT (id) DO NOTHING;
