CREATE TABLE quote_heads (
  id text PRIMARY KEY,
  environment_id text NOT NULL,
  branch_id text NOT NULL REFERENCES branches(id),
  customer_id text NOT NULL REFERENCES customers(id),
  vehicle_id text NOT NULL REFERENCES vehicles(id),
  current_revision integer NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  accepted_revision integer,
  created_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (accepted_revision IS NULL OR accepted_revision <= current_revision)
);
CREATE INDEX quote_heads_environment_branch_idx ON quote_heads(environment_id,branch_id);
CREATE TABLE quote_versions (
  quote_id text NOT NULL REFERENCES quote_heads(id),
  revision integer NOT NULL CHECK (revision > 0),
  state text NOT NULL CHECK (state IN ('draft','offered','accepted','superseded','cancelled')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  digest text NOT NULL,
  valid_through date,
  created_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quote_id, revision)
);
CREATE TABLE quote_acceptance_events (
  id bigserial PRIMARY KEY,
  quote_id text NOT NULL,
  revision integer NOT NULL,
  environment_id text NOT NULL,
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  method text NOT NULL CHECK (method IN ('staff-recorded','customer-confirmed')),
  evidence_ref text NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  accepted_snapshot jsonb NOT NULL CHECK (jsonb_typeof(accepted_snapshot) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (quote_id, revision) REFERENCES quote_versions(quote_id, revision),
  UNIQUE (quote_id),
  UNIQUE (environment_id, actor_id, quote_id, idempotency_key)
);
CREATE TABLE quote_customer_confirmations (
  id text PRIMARY KEY,
  quote_id text NOT NULL,
  revision integer NOT NULL,
  customer_id text NOT NULL REFERENCES customers(id),
  evidence_ref text NOT NULL UNIQUE,
  verified_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  verified_at timestamptz NOT NULL,
  FOREIGN KEY (quote_id, revision) REFERENCES quote_versions(quote_id, revision)
);
CREATE TABLE quote_followups (
  quote_id text PRIMARY KEY REFERENCES quote_heads(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  responsible_user_id text REFERENCES staff_memberships(clerk_user_id),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','preparing','answered','cancelled')),
  answered_at timestamptz,
  promised_response_at timestamptz,
  CHECK ((status = 'answered') = (answered_at IS NOT NULL))
);
CREATE TABLE quote_audit (
  id bigserial PRIMARY KEY,
  quote_id text NOT NULL REFERENCES quote_heads(id),
  revision integer NOT NULL,
  action text NOT NULL,
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION reject_quote_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Quote history is append-only'; END $$;
CREATE TRIGGER quote_versions_immutable BEFORE UPDATE OR DELETE ON quote_versions FOR EACH ROW EXECUTE FUNCTION reject_quote_history_change();
CREATE TRIGGER quote_acceptance_immutable BEFORE UPDATE OR DELETE ON quote_acceptance_events FOR EACH ROW EXECUTE FUNCTION reject_quote_history_change();
CREATE TRIGGER quote_customer_confirmations_immutable BEFORE UPDATE OR DELETE ON quote_customer_confirmations FOR EACH ROW EXECUTE FUNCTION reject_quote_history_change();
CREATE TRIGGER quote_audit_immutable BEFORE UPDATE OR DELETE ON quote_audit FOR EACH ROW EXECUTE FUNCTION reject_quote_history_change();
