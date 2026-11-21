-- Purchases read model and special requests (Wave 2.5). Idempotent.

-- PURCHASES: a read-only view, so nothing is entered twice. One row per accepted quote (the sale, priced from the
-- accepted snapshot in its own currency) plus one row per delivered legacy job that never had a quote (unpriced).
-- Links resolve through existing keys: bookings.accepted_quote_id, jobs.booking_id, warranties.accepted_quote_id /
-- job_id and warranty_invoice_drafts.warranty_id. Cancelled / no-show jobs are not purchases.
-- Archive filtering (record_archives) and branch scoping are applied by the reading query, not here.
CREATE OR REPLACE VIEW customer_purchases AS
SELECT
  'quote:' || h.id AS id,
  h.environment_id::text AS environment_id,
  h.customer_id, h.vehicle_id, h.branch_id,
  h.id AS quote_id, e.revision AS quote_revision,
  b.id AS booking_id, j.id AS job_id, w.id AS warranty_id, wi.id AS invoice_id,
  COALESCE(pv.name->>'en', sv.name_en, 'Custom work') AS label_en,
  COALESCE(pv.name->>'ar', sv.name_ar, 'عمل مخصص') AS label_ar,
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

-- SPECIAL REQUESTS: free-text custom work asked for a specific vehicle. Staff create them on a customer's behalf
-- (source 'staff'); the customer app will insert with source 'customer-app'. The reviewer's reply is split into
-- customer-visible columns (reply_*, quoted_*, duration_*, available_from, offer_valid_until) and the internal
-- owner_notes column, which must never be sent to a customer client.
CREATE TABLE IF NOT EXISTS special_requests (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id),
  vehicle_id text NOT NULL REFERENCES vehicles(id),
  branch_id text REFERENCES branches(id),
  source text NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'customer-app')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 4000),
  requested_from date NOT NULL,
  requested_to date,
  preferred_time_note text NOT NULL DEFAULT '' CHECK (length(preferred_time_note) <= 300),
  budget_note text NOT NULL DEFAULT '' CHECK (length(budget_note) <= 300),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'under-review', 'needs-info', 'accepted', 'declined', 'closed')),
  -- customer-visible reply
  reply_decision text CHECK (reply_decision IN ('accepted', 'declined', 'needs-info')),
  reply_message text NOT NULL DEFAULT '',
  quoted_price_minor bigint CHECK (quoted_price_minor IS NULL OR quoted_price_minor >= 0),
  quoted_currency text CHECK (quoted_currency IS NULL OR quoted_currency ~ '^[A-Z]{3}$'),
  duration_days integer CHECK (duration_days IS NULL OR duration_days > 0),
  duration_note text NOT NULL DEFAULT '',
  available_from date,
  offer_valid_until date,
  -- internal only
  owner_notes text NOT NULL DEFAULT '',
  decided_by text REFERENCES staff_memberships(clerk_user_id),
  decided_at timestamptz,
  quote_id text REFERENCES quote_heads(id),
  created_by text REFERENCES staff_memberships(clerk_user_id),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requested_to IS NULL OR requested_to >= requested_from),
  CHECK (source = 'customer-app' OR created_by IS NOT NULL),
  CHECK (reply_decision IS DISTINCT FROM 'accepted'
    OR (quoted_price_minor IS NOT NULL AND quoted_currency IS NOT NULL AND duration_days IS NOT NULL AND available_from IS NOT NULL)),
  CHECK (reply_decision IS NULL OR reply_decision = 'accepted' OR length(btrim(reply_message)) > 0),
  CHECK (quote_id IS NULL OR status IN ('accepted', 'closed'))
);
CREATE INDEX IF NOT EXISTS special_requests_customer_idx ON special_requests (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS special_requests_vehicle_idx ON special_requests (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS special_requests_queue_idx ON special_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS special_requests_branch_idx ON special_requests (branch_id, status);

-- Append-only history: creation, review start, every decision, staff answers to a question, quote link, close.
CREATE TABLE IF NOT EXISTS special_request_events (
  request_id text NOT NULL REFERENCES special_requests(id),
  seq integer NOT NULL CHECK (seq > 0),
  action text NOT NULL CHECK (action IN ('created', 'review-started', 'accepted', 'declined', 'needs-info', 'info-added', 'quote-linked', 'closed')),
  from_status text,
  to_status text NOT NULL,
  actor_id text REFERENCES staff_memberships(clerk_user_id),
  reason text NOT NULL DEFAULT '',
  snapshot jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, seq)
);

CREATE OR REPLACE FUNCTION reject_special_request_event_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Special request history is append-only'; END $$;
DROP TRIGGER IF EXISTS special_request_events_immutable ON special_request_events;
CREATE TRIGGER special_request_events_immutable BEFORE UPDATE OR DELETE ON special_request_events
  FOR EACH ROW EXECUTE FUNCTION reject_special_request_event_change();
