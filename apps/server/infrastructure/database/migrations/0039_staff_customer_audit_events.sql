-- Phase 2 (P2T-008): append-only audit trail for staff access changes, customer create/edit and reminder-rule changes.
-- summary holds names, ids and changed FIELD NAMES only; never phone numbers, emails or message text.
-- Idempotent; not applied anywhere locally. Rollback: DROP TABLE IF EXISTS staff_customer_audit_events; DROP FUNCTION IF EXISTS reject_staff_customer_audit_change();
CREATE TABLE IF NOT EXISTS staff_customer_audit_events (
  id text PRIMARY KEY,
  entity_kind text NOT NULL CHECK (entity_kind IN ('staff','customer','reminder-rule')),
  entity_id text NOT NULL,
  action text NOT NULL,
  branch_id text,
  summary text NOT NULL DEFAULT '',
  actor_user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_customer_audit_time_idx ON staff_customer_audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS staff_customer_audit_entity_idx ON staff_customer_audit_events (entity_kind, entity_id);

CREATE OR REPLACE FUNCTION reject_staff_customer_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Staff and customer audit is append-only'; END $$;
DROP TRIGGER IF EXISTS staff_customer_audit_immutable ON staff_customer_audit_events;
CREATE TRIGGER staff_customer_audit_immutable BEFORE UPDATE OR DELETE ON staff_customer_audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_staff_customer_audit_change();
