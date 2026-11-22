-- 0038: customer purchases also link the generic invoice (table invoices, migration 0030), not only warranty invoice drafts.
-- Idempotent. Every existing column keeps its name, type and position (0033); three columns are appended:
-- generic_invoice_id, generic_invoice_number (null while draft), generic_invoice_status. A void invoice is not linked;
-- the newest non-void invoice for the job, booking or accepted quote wins. invoice_id keeps meaning the warranty draft.
CREATE OR REPLACE VIEW customer_purchases AS
SELECT
  'quote:' || h.id AS id,
  h.environment_id::text AS environment_id,
  h.customer_id, h.vehicle_id, h.branch_id,
  h.id AS quote_id, e.revision AS quote_revision,
  b.id AS booking_id, j.id AS job_id, w.id AS warranty_id, wi.id AS invoice_id,
  COALESCE(pv.name->>'en', e.accepted_snapshot->'scope'->0->'label'->>'en', sv.name_en, 'Custom work') AS label_en,
  COALESCE(pv.name->>'ar', e.accepted_snapshot->'scope'->0->'label'->>'ar', sv.name_ar, 'عمل مخصص') AS label_ar,
  GREATEST(COALESCE((e.accepted_snapshot->'lines'->0->>'quantity')::integer, 1), 1) AS quantity,
  (e.accepted_snapshot->'total'->>'minor')::bigint AS amount_minor,
  (e.accepted_snapshot->'total'->>'currency')::text AS currency,
  (e.occurred_at AT TIME ZONE 'Africa/Cairo')::date AS purchased_on,
  CASE WHEN j.stage = 'delivered' THEN 'delivered' ELSE 'accepted' END AS status,
  gi.id AS generic_invoice_id, gi.number AS generic_invoice_number, gi.status AS generic_invoice_status
FROM quote_heads h
JOIN quote_acceptance_events e ON e.quote_id = h.id
LEFT JOIN bookings b ON b.accepted_quote_id = h.id AND b.accepted_quote_revision = e.revision
LEFT JOIN jobs j ON j.booking_id = b.id
LEFT JOIN catalogue_package_versions pv
  ON pv.package_id = e.accepted_snapshot->'packageVersion'->>'id'
 AND pv.version = (e.accepted_snapshot->'packageVersion'->>'version')::integer
LEFT JOIN services sv ON sv.id = e.accepted_snapshot->'scope'->0->>'serviceId'
LEFT JOIN LATERAL (SELECT x.id FROM warranties x WHERE x.accepted_quote_id = h.id ORDER BY x.issued_at LIMIT 1) w ON true
LEFT JOIN LATERAL (SELECT d.id FROM warranty_invoice_drafts d WHERE d.warranty_id = w.id LIMIT 1) wi ON true
LEFT JOIN LATERAL (
  SELECT i.id, i.number, i.status FROM invoices i
  WHERE i.status <> 'void' AND (i.job_id = j.id OR i.booking_id = b.id OR i.quote_id = h.id)
  ORDER BY i.created_at DESC, i.id LIMIT 1
) gi ON true
WHERE j.stage IS NULL OR j.stage NOT IN ('cancelled', 'no-show')
UNION ALL
SELECT
  'job:' || j.id, NULL::text, b.customer_id, b.vehicle_id, b.branch_id,
  NULL::text, NULL::integer,
  b.id, j.id, w.id, wi.id,
  sv.name_en, sv.name_ar, 1, NULL::bigint, NULL::text,
  (j.updated_at AT TIME ZONE 'Africa/Cairo')::date, 'delivered',
  gi.id, gi.number, gi.status
FROM bookings b
JOIN jobs j ON j.booking_id = b.id
JOIN services sv ON sv.id = b.service_id
LEFT JOIN LATERAL (SELECT x.id FROM warranties x WHERE x.job_id = j.id ORDER BY x.issued_at LIMIT 1) w ON true
LEFT JOIN LATERAL (SELECT d.id FROM warranty_invoice_drafts d WHERE d.warranty_id = w.id LIMIT 1) wi ON true
LEFT JOIN LATERAL (
  SELECT i.id, i.number, i.status FROM invoices i
  WHERE i.status <> 'void' AND (i.job_id = j.id OR i.booking_id = b.id)
  ORDER BY i.created_at DESC, i.id LIMIT 1
) gi ON true
WHERE b.accepted_quote_id IS NULL AND j.stage = 'delivered';
