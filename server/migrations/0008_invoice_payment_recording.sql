ALTER TABLE warranty_invoice_drafts
  ADD COLUMN IF NOT EXISTS payment_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_recorded_by text REFERENCES staff_memberships(clerk_user_id);

ALTER TABLE warranty_invoice_drafts
  DROP CONSTRAINT IF EXISTS warranty_invoice_payment_recorded_pair_check;

ALTER TABLE warranty_invoice_drafts
  ADD CONSTRAINT warranty_invoice_payment_recorded_pair_check
  CHECK ((payment_recorded_at IS NULL) = (payment_recorded_by IS NULL));
