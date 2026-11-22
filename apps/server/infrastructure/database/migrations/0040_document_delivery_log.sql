-- Phase 2 (P2T-006/P2T-007): durable history of invoice, quote and warranty-card documents sent to a customer.
-- Append-only. In simulated mode a row means "recorded as sent-simulated", never a real delivery.
CREATE TABLE IF NOT EXISTS document_delivery_log (
  id text PRIMARY KEY,
  environment_id text NOT NULL,
  document_kind text NOT NULL CHECK (document_kind IN ('invoice', 'quote', 'warranty-card')),
  document_id text NOT NULL CHECK (length(btrim(document_id)) > 0),
  customer_id text NOT NULL REFERENCES customers(id),
  branch_id text NOT NULL REFERENCES branches(id),
  channel text NOT NULL CHECK (channel IN ('whatsapp')),
  language text NOT NULL CHECK (language IN ('ar', 'en')),
  recipient_masked text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent-simulated', 'held', 'queued', 'accepted', 'definite-failure')),
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('simulated', 'live')),
  trigger text NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'auto')),
  link_included boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  provider_message_id text,
  outbox_id text,
  failure_code text,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  request_hash text NOT NULL,
  sent_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS document_delivery_log_document_idx
  ON document_delivery_log (environment_id, document_kind, document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS document_delivery_log_customer_idx
  ON document_delivery_log (customer_id, created_at DESC);

CREATE OR REPLACE FUNCTION reject_document_delivery_log_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'The document delivery log is append-only'; END $$;
DROP TRIGGER IF EXISTS document_delivery_log_immutable ON document_delivery_log;
CREATE TRIGGER document_delivery_log_immutable BEFORE UPDATE OR DELETE ON document_delivery_log
  FOR EACH ROW EXECUTE FUNCTION reject_document_delivery_log_change();
