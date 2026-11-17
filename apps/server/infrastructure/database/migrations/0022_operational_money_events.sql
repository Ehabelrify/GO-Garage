CREATE TABLE operational_money_events (
  id text PRIMARY KEY,
  environment_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('collection','refund','direct-cost','overhead','recognized-revenue')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  minor_unit_exponent integer NOT NULL CHECK (minor_unit_exponent BETWEEN 0 AND 6),
  effective_at timestamptz NOT NULL,
  branch_id text NOT NULL REFERENCES branches(id),
  customer_id text REFERENCES customers(id),
  job_id text REFERENCES jobs(id),
  quote_id text REFERENCES quote_heads(id),
  reservation_id text REFERENCES promotion_reservations(id),
  source_method text NOT NULL CHECK (length(btrim(source_method)) > 0),
  source_reference text NOT NULL CHECK (length(btrim(source_reference)) > 0),
  definition_id text NOT NULL,
  definition_version integer NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  evidence_ref text NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  recorded_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment_id,kind,source_method,source_reference)
);
CREATE INDEX operational_money_events_report_idx ON operational_money_events(environment_id,branch_id,effective_at,kind);
ALTER TABLE promotion_reservations DROP CONSTRAINT promotion_reservation_deposit_recording_gate;
ALTER TABLE promotion_reservations ADD CONSTRAINT promotion_reservation_deposit_money_event_fk FOREIGN KEY (deposit_money_event_id) REFERENCES operational_money_events(id);
ALTER TABLE promotion_reservations ADD CONSTRAINT promotion_reservation_recorded_deposit_source_check CHECK ((deposit_state='recorded')=(deposit_money_event_id IS NOT NULL));
CREATE TABLE operational_money_event_reversals (
  id text PRIMARY KEY,
  event_id text NOT NULL UNIQUE REFERENCES operational_money_events(id),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  evidence_ref text NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  reversed_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  reversed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE operational_money_requests (
  environment_id text NOT NULL,
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  operation text NOT NULL CHECK (operation IN ('record','reverse')),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (environment_id,actor_id,operation,idempotency_key)
);
CREATE FUNCTION reject_operational_money_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Operational money history is append-only'; END $$;
CREATE TRIGGER operational_money_events_immutable BEFORE UPDATE OR DELETE ON operational_money_events FOR EACH ROW EXECUTE FUNCTION reject_operational_money_history_change();
CREATE TRIGGER operational_money_reversals_immutable BEFORE UPDATE OR DELETE ON operational_money_event_reversals FOR EACH ROW EXECUTE FUNCTION reject_operational_money_history_change();
