-- P2T-004 / P2T-012: supplementary adjustment invoices and payment reversals/refunds. Idempotent.
-- An adjustment is a separate DRAFT invoice linked to the issued original; the original is never rewritten.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS parent_invoice_id text REFERENCES invoices(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard', 'adjustment'));
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_adjustment_parent_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_adjustment_parent_check CHECK ((kind = 'adjustment') = (parent_invoice_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS invoices_parent_idx ON invoices (parent_invoice_id) WHERE parent_invoice_id IS NOT NULL;

-- Widen the invoice_events action list (the original CHECK has a generated name, so it is dropped by lookup).
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'invoice_events'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%payment-recorded%'
  LOOP EXECUTE format('ALTER TABLE invoice_events DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
ALTER TABLE invoice_events DROP CONSTRAINT IF EXISTS invoice_events_action_v2_check;
ALTER TABLE invoice_events ADD CONSTRAINT invoice_events_action_v2_check CHECK (action IN
  ('generated', 'created', 'edited', 'issued', 'payment-recorded', 'voided', 'payment-reversed', 'refunded', 'adjustment-created'));

-- One reversal per payment. The finance reversal row (when the payment had a collection event) is referenced, not duplicated.
CREATE TABLE IF NOT EXISTS invoice_payment_reversals (
  id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(id),
  payment_id text NOT NULL UNIQUE REFERENCES invoice_payment_references(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 3),
  evidence_ref text NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  money_event_reversal_id text REFERENCES operational_money_event_reversals(id),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  reversed_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS invoice_refunds (
  id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 3),
  evidence_ref text NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  money_event_id text REFERENCES operational_money_events(id),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  refunded_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS invoice_refunds_invoice_idx ON invoice_refunds (invoice_id, created_at);

DROP TRIGGER IF EXISTS invoice_payment_reversals_immutable ON invoice_payment_reversals;
CREATE TRIGGER invoice_payment_reversals_immutable BEFORE UPDATE OR DELETE ON invoice_payment_reversals
  FOR EACH ROW EXECUTE FUNCTION reject_invoice_history_change();
DROP TRIGGER IF EXISTS invoice_refunds_immutable ON invoice_refunds;
CREATE TRIGGER invoice_refunds_immutable BEFORE UPDATE OR DELETE ON invoice_refunds
  FOR EACH ROW EXECUTE FUNCTION reject_invoice_history_change();
