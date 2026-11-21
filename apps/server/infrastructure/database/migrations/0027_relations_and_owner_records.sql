-- Relations lookup indexes (global search, Customer 360, Vehicle 360, warranty resolve)
-- and owner record control (soft archive + append-only audit).

-- Plate lookup is on a normalised form (upper-case, no spaces or dashes).
CREATE INDEX IF NOT EXISTS vehicles_plate_normalized_idx
  ON vehicles (upper(regexp_replace(plate, '[\s-]', '', 'g')) text_pattern_ops);
-- "Last digits of phone" lookup: match the reversed digits as a prefix.
CREATE INDEX IF NOT EXISTS customers_phone_reversed_idx
  ON customers (reverse(phone_normalized) text_pattern_ops);

CREATE INDEX IF NOT EXISTS bookings_vehicle_idx ON bookings (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quote_heads_customer_idx ON quote_heads (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quote_heads_vehicle_idx ON quote_heads (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS warranties_vehicle_idx ON warranties (vehicle_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS promotion_reservations_beneficiary_idx ON promotion_reservations (beneficiary_id, created_at DESC);
CREATE INDEX IF NOT EXISTS promotion_reservations_vehicle_idx ON promotion_reservations (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS benefit_entitlements_customer_idx ON benefit_entitlements (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS benefit_entitlements_vehicle_idx ON benefit_entitlements (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transport_requests_customer_idx ON transport_requests (customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS transport_requests_vehicle_idx ON transport_requests (vehicle_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_customer_idx ON whatsapp_conversations (customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_vehicle_idx ON whatsapp_conversations (vehicle_id, updated_at DESC);

-- Soft archive. Immutable history tables (quote/catalogue/policy versions) are never touched;
-- an archived record is simply hidden from lists and search. Restoring deletes the row.
CREATE TABLE IF NOT EXISTS record_archives (
  entity_kind text NOT NULL CHECK (entity_kind IN (
    'customer','vehicle','quote','reservation','catalogue-package','catalogue-grade','commercial-policy','warranty-policy')),
  entity_id text NOT NULL,
  archived_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  PRIMARY KEY (entity_kind, entity_id)
);

-- Append-only trail of owner archive / restore / hard-delete actions.
CREATE TABLE IF NOT EXISTS owner_record_audit (
  id bigserial PRIMARY KEY,
  entity_kind text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('archived','restored','deleted')),
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  reason text NOT NULL DEFAULT '',
  snapshot jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS owner_record_audit_entity_idx ON owner_record_audit (entity_kind, entity_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_owner_record_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Owner record audit is append-only'; END $$;
DROP TRIGGER IF EXISTS owner_record_audit_immutable ON owner_record_audit;
CREATE TRIGGER owner_record_audit_immutable BEFORE UPDATE OR DELETE ON owner_record_audit
  FOR EACH ROW EXECUTE FUNCTION reject_owner_record_audit_change();
