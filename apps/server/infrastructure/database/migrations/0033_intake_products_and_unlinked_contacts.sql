-- Wave 5 (quick intake): catalogue products, WhatsApp conversations that exist before a customer is known, and
-- the idempotency record of the quick-intake endpoint. Idempotent. Not applied anywhere.

-- 1. PRODUCTS in the catalogue. kind gains 'product' (parts, accessories, care products): a name, a bilingual category,
--    a price and a tax, versioned and published like every other catalogue item. A product has no bay work (work = [])
--    and exactly one scope item that carries the stable product id (= package_id). No stock columns on purpose:
--    stock, reorder levels, per-branch quantity and movements arrive later in their own tables keyed by package_id.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'catalogue_package_versions'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%standalone%'
  LOOP
    EXECUTE format('ALTER TABLE catalogue_package_versions DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE catalogue_package_versions
  ADD CONSTRAINT catalogue_package_versions_kind_check CHECK (kind IN ('package','standalone','product'));
ALTER TABLE catalogue_package_versions ADD COLUMN IF NOT EXISTS product_category jsonb;
ALTER TABLE catalogue_package_versions DROP CONSTRAINT IF EXISTS catalogue_package_versions_product_shape_check;
ALTER TABLE catalogue_package_versions
  ADD CONSTRAINT catalogue_package_versions_product_shape_check
  CHECK (kind <> 'product' OR (work = '[]'::jsonb AND jsonb_array_length(scope) = 1 AND jsonb_typeof(product_category) = 'object'));

-- 2. WHATSAPP conversations without a customer. An unsaved number still arrives in the inbox as "New contact".
--    contact_label is a neutral label (never the number); contact_phone holds the number ONLY when the provider event
--    legitimately carried it (never logged, never copied into events/audit, cleared when the chat is linked).
ALTER TABLE whatsapp_conversations ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE whatsapp_conversations ALTER COLUMN vehicle_id DROP NOT NULL;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS contact_label text;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS provider_contact_hash text;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE whatsapp_conversations DROP CONSTRAINT IF EXISTS whatsapp_conversations_unlinked_contact_check;
ALTER TABLE whatsapp_conversations
  ADD CONSTRAINT whatsapp_conversations_unlinked_contact_check
  CHECK (customer_id IS NOT NULL OR (length(btrim(contact_label)) > 0 AND length(btrim(provider_contact_hash)) > 0));
ALTER TABLE whatsapp_conversations DROP CONSTRAINT IF EXISTS whatsapp_conversations_vehicle_needs_customer_check;
ALTER TABLE whatsapp_conversations
  ADD CONSTRAINT whatsapp_conversations_vehicle_needs_customer_check CHECK (vehicle_id IS NULL OR customer_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_unlinked_contact_idx
  ON whatsapp_conversations (channel_id, provider_contact_hash) WHERE customer_id IS NULL;
-- A link can be made before the customer has a vehicle.
ALTER TABLE messaging_contact_links ALTER COLUMN vehicle_id DROP NOT NULL;
-- Branch that receives conversations from numbers nobody has linked yet (falls back to the first branch when unset).
ALTER TABLE messaging_channels ADD COLUMN IF NOT EXISTS default_branch_id text REFERENCES branches(id);

-- 3. PURCHASES view: a product line of an accepted quote is labelled with its own name (same columns as 0028).
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
  CASE WHEN j.stage = 'delivered' THEN 'delivered' ELSE 'accepted' END AS status
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
WHERE j.stage IS NULL OR j.stage NOT IN ('cancelled', 'no-show')
UNION ALL
SELECT
  'job:' || j.id, NULL::text, b.customer_id, b.vehicle_id, b.branch_id,
  NULL::text, NULL::integer,
  b.id, j.id, w.id, wi.id,
  sv.name_en, sv.name_ar, 1, NULL::bigint, NULL::text,
  (j.updated_at AT TIME ZONE 'Africa/Cairo')::date, 'delivered'
FROM bookings b
JOIN jobs j ON j.booking_id = b.id
JOIN services sv ON sv.id = b.service_id
LEFT JOIN LATERAL (SELECT x.id FROM warranties x WHERE x.job_id = j.id ORDER BY x.issued_at LIMIT 1) w ON true
LEFT JOIN LATERAL (SELECT d.id FROM warranty_invoice_drafts d WHERE d.warranty_id = w.id LIMIT 1) wi ON true
WHERE b.accepted_quote_id IS NULL AND j.stage = 'delivered';

-- 4. QUICK INTAKE idempotency: one row per (actor, client key). request_hash detects a reused key with a different body;
--    response replays the first outcome. notes keeps the free text of the intake for every outcome.
CREATE TABLE IF NOT EXISTS intake_requests (
  actor_id text NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 120),
  request_hash text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('quote','booking','customer-only')),
  branch_id text NOT NULL REFERENCES branches(id),
  customer_id text REFERENCES customers(id),
  vehicle_id text REFERENCES vehicles(id),
  quote_id text,
  booking_id text REFERENCES bookings(id),
  conversation_id text REFERENCES whatsapp_conversations(id),
  notes text,
  items jsonb,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS intake_requests_customer_idx ON intake_requests (customer_id, created_at DESC);
