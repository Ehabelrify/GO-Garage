-- Generic invoices (Wave 2.6). Idempotent. A draft is generated automatically when a job is delivered
-- (stable idempotency key per job) or on demand; issuing assigns a per-branch, per-year number.
-- Payments are recorded as REFERENCES only (no gateway) and are NOT finance money events: invoices never
-- feed the finance report, so a job invoice and a warranty invoice draft cannot be double counted there.

-- Per branch + calendar year counter. The number is taken at ISSUE time so drafts never burn numbers.
CREATE TABLE IF NOT EXISTS invoice_number_sequences (
  branch_id text NOT NULL REFERENCES branches(id),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2999),
  last_value integer NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (branch_id, year)
);

CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  environment_id text NOT NULL,
  branch_id text NOT NULL REFERENCES branches(id),
  customer_id text NOT NULL REFERENCES customers(id),
  vehicle_id text NOT NULL REFERENCES vehicles(id),
  booking_id text REFERENCES bookings(id),
  job_id text REFERENCES jobs(id),
  quote_id text REFERENCES quote_heads(id),
  warranty_id text REFERENCES warranties(id),
  source text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  number text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'partial', 'paid', 'void')),
  currency text NOT NULL DEFAULT 'EGP' CHECK (currency ~ '^[A-Z]{3}$'),
  tax_rate_percent numeric(5, 2) CHECK (tax_rate_percent IS NULL OR tax_rate_percent BETWEEN 0 AND 100),
  subtotal_minor bigint CHECK (subtotal_minor IS NULL OR subtotal_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_minor bigint CHECK (tax_minor IS NULL OR tax_minor >= 0),
  total_minor bigint CHECK (total_minor IS NULL OR total_minor >= 0),
  paid_minor bigint NOT NULL DEFAULT 0 CHECK (paid_minor >= 0),
  issue_date date,
  notes text NOT NULL DEFAULT '',
  terms text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by text REFERENCES staff_memberships(clerk_user_id),
  issued_by text REFERENCES staff_memberships(clerk_user_id),
  issued_at timestamptz,
  voided_by text REFERENCES staff_memberships(clerk_user_id),
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment_id, idempotency_key),
  CHECK (status <> 'draft' OR (number IS NULL AND issue_date IS NULL)),
  CHECK (status NOT IN ('issued', 'partial', 'paid') OR (number IS NOT NULL AND issue_date IS NOT NULL)),
  CHECK ((status = 'void') = (voided_at IS NOT NULL)),
  CHECK (status IN ('draft', 'void') OR total_minor IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_unique ON invoices (environment_id, number) WHERE number IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_customer_idx ON invoices (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_vehicle_idx ON invoices (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_job_idx ON invoices (job_id);
CREATE INDEX IF NOT EXISTS invoices_branch_status_idx ON invoices (branch_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  kind text NOT NULL CHECK (kind IN ('package', 'service', 'add-on', 'transport', 'fee', 'other')),
  description_en text NOT NULL CHECK (length(btrim(description_en)) BETWEEN 1 AND 240),
  description_ar text NOT NULL DEFAULT '' CHECK (length(description_ar) <= 240),
  quantity numeric(10, 2) NOT NULL CHECK (quantity > 0 AND quantity <= 100000),
  unit_minor bigint CHECK (unit_minor IS NULL OR unit_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_minor bigint CHECK (tax_minor IS NULL OR tax_minor >= 0),
  UNIQUE (invoice_id, position)
);

-- Append-only history: generation, every draft edit, issue, payment reference and void.
CREATE TABLE IF NOT EXISTS invoice_events (
  invoice_id text NOT NULL REFERENCES invoices(id),
  seq integer NOT NULL CHECK (seq > 0),
  action text NOT NULL CHECK (action IN ('generated', 'created', 'edited', 'issued', 'payment-recorded', 'voided')),
  from_status text,
  to_status text NOT NULL,
  actor_id text REFERENCES staff_memberships(clerk_user_id),
  reason text NOT NULL DEFAULT '',
  snapshot jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, seq)
);

-- Payment references only: what was paid and how it can be traced. No card data, no gateway.
CREATE TABLE IF NOT EXISTS invoice_payment_references (
  id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  method text NOT NULL CHECK (method IN ('cash', 'card', 'transfer', 'instapay', 'other')),
  reference text NOT NULL CHECK (length(btrim(reference)) BETWEEN 1 AND 120),
  received_on date NOT NULL,
  recorded_by text REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, reference)
);
CREATE INDEX IF NOT EXISTS invoice_payment_references_invoice_idx ON invoice_payment_references (invoice_id, created_at);

CREATE OR REPLACE FUNCTION reject_invoice_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Invoice history and payment references are append-only'; END $$;
DROP TRIGGER IF EXISTS invoice_events_immutable ON invoice_events;
CREATE TRIGGER invoice_events_immutable BEFORE UPDATE OR DELETE ON invoice_events
  FOR EACH ROW EXECUTE FUNCTION reject_invoice_history_change();
DROP TRIGGER IF EXISTS invoice_payment_references_immutable ON invoice_payment_references;
CREATE TRIGGER invoice_payment_references_immutable BEFORE UPDATE OR DELETE ON invoice_payment_references
  FOR EACH ROW EXECUTE FUNCTION reject_invoice_history_change();

-- Issued/paid/void invoices keep their lines and number: lines may only change while the parent is a draft,
-- and an invoice that has left draft cannot be deleted or renumbered.
CREATE OR REPLACE FUNCTION guard_invoice_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text;
BEGIN
  SELECT status INTO parent_status FROM invoices WHERE id = COALESCE(OLD.invoice_id, NEW.invoice_id);
  IF parent_status IS NOT NULL AND parent_status <> 'draft' THEN
    RAISE EXCEPTION 'Lines of an issued invoice cannot change';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS invoice_lines_guard ON invoice_lines;
CREATE TRIGGER invoice_lines_guard BEFORE UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION guard_invoice_lines();

CREATE OR REPLACE FUNCTION guard_invoice_header() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'An issued invoice cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.number IS NOT NULL AND NEW.number IS DISTINCT FROM OLD.number THEN RAISE EXCEPTION 'An invoice number cannot change'; END IF;
  IF OLD.status <> 'draft' AND (NEW.currency IS DISTINCT FROM OLD.currency OR NEW.total_minor IS DISTINCT FROM OLD.total_minor
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.branch_id IS DISTINCT FROM OLD.branch_id) THEN
    RAISE EXCEPTION 'Money and party fields of an issued invoice cannot change';
  END IF;
  IF OLD.status = 'void' AND NEW.status <> 'void' THEN RAISE EXCEPTION 'A void invoice cannot be reopened'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoices_guard ON invoices;
CREATE TRIGGER invoices_guard BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION guard_invoice_header();
