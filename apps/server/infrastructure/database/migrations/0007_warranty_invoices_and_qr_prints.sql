CREATE TABLE IF NOT EXISTS warranty_invoice_drafts (
  id text PRIMARY KEY,
  warranty_id text NOT NULL UNIQUE REFERENCES warranties(id),
  branch_id text NOT NULL REFERENCES branches(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  tax_rate_percent numeric(5, 2) CHECK (tax_rate_percent IS NULL OR tax_rate_percent BETWEEN 0 AND 100),
  paid_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  payment_method text CHECK (payment_method IS NULL OR payment_method IN ('cash', 'card', 'transfer', 'other')),
  notes text NOT NULL DEFAULT '',
  created_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  updated_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warranty_invoice_drafts_branch_updated_idx
  ON warranty_invoice_drafts (branch_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS warranty_invoice_draft_items (
  id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES warranty_invoice_drafts(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 240),
  quantity numeric(8, 2) NOT NULL CHECK (quantity BETWEEN 0.01 AND 10000),
  unit_amount numeric(12, 2) CHECK (unit_amount IS NULL OR unit_amount >= 0),
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS warranty_invoice_draft_items_invoice_idx
  ON warranty_invoice_draft_items (invoice_id, sort_order);

CREATE TABLE IF NOT EXISTS warranty_qr_print_events (
  id text PRIMARY KEY,
  warranty_id text NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
  token_id text NOT NULL REFERENCES warranty_verification_tokens(id),
  action text NOT NULL CHECK (action IN ('prepared', 'printed', 'reprinted', 'replaced', 'revoked')),
  replaces_token_id text REFERENCES warranty_verification_tokens(id),
  actor_user_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((action = 'replaced') = (replaces_token_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS warranty_qr_print_events_history_idx
  ON warranty_qr_print_events (warranty_id, created_at DESC);

CREATE INDEX IF NOT EXISTS warranty_qr_print_events_token_idx
  ON warranty_qr_print_events (token_id, created_at DESC);
