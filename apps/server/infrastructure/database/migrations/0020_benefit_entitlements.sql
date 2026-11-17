CREATE TABLE benefit_entitlements (
  id text PRIMARY KEY,
  environment_id text NOT NULL,
  source_quote_id text NOT NULL,
  source_revision integer NOT NULL,
  binding_index integer NOT NULL CHECK (binding_index >= 0),
  trigger_kind text NOT NULL CHECK (trigger_kind IN ('accepted','delivered')),
  benefit_id text NOT NULL,
  benefit_version integer NOT NULL,
  customer_id text NOT NULL REFERENCES customers(id),
  vehicle_id text NOT NULL REFERENCES vehicles(id),
  branch_ids text[] NOT NULL,
  promise jsonb NOT NULL CHECK (jsonb_typeof(promise)='object'),
  responsible_team_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','exhausted')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (source_quote_id,source_revision) REFERENCES quote_versions(quote_id,revision),
  UNIQUE (source_quote_id,source_revision,binding_index,trigger_kind)
);
CREATE INDEX benefit_entitlements_environment_branch_idx ON benefit_entitlements(environment_id,status);
CREATE TABLE benefit_windows (
  entitlement_id text NOT NULL REFERENCES benefit_entitlements(id),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  consumed integer NOT NULL DEFAULT 0 CHECK (consumed >= 0 AND consumed <= quantity),
  PRIMARY KEY (entitlement_id,starts_on),
  CHECK (ends_on >= starts_on)
);
CREATE TABLE benefit_redemptions (
  id text PRIMARY KEY,
  entitlement_id text NOT NULL REFERENCES benefit_entitlements(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  on_date date NOT NULL,
  branch_id text NOT NULL REFERENCES branches(id),
  window_starts_on date,
  fulfillment_ref text NOT NULL CHECK (length(btrim(fulfillment_ref)) > 0),
  eligibility_evidence_ref text NOT NULL,
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entitlement_id,fulfillment_ref),
  FOREIGN KEY (entitlement_id,window_starts_on) REFERENCES benefit_windows(entitlement_id,starts_on)
);
CREATE TABLE benefit_reversals (
  id text PRIMARY KEY,
  redemption_id text NOT NULL UNIQUE REFERENCES benefit_redemptions(id),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  evidence_ref text NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  restored_quantity integer NOT NULL DEFAULT 0 CHECK (restored_quantity >= 0),
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE benefit_requests (
  environment_id text NOT NULL,
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  operation text NOT NULL CHECK (operation IN ('redeem','reverse')),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (environment_id,actor_id,operation,idempotency_key)
);
CREATE TABLE benefit_audit (
  id bigserial PRIMARY KEY,
  entitlement_id text NOT NULL REFERENCES benefit_entitlements(id),
  action text NOT NULL,
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  event_ref text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION reject_benefit_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Benefit promise and fulfillment history is append-only'; END $$;
CREATE TRIGGER benefit_redemptions_immutable BEFORE UPDATE OR DELETE ON benefit_redemptions FOR EACH ROW EXECUTE FUNCTION reject_benefit_history_change();
CREATE TRIGGER benefit_reversals_immutable BEFORE UPDATE OR DELETE ON benefit_reversals FOR EACH ROW EXECUTE FUNCTION reject_benefit_history_change();
CREATE TRIGGER benefit_audit_immutable BEFORE UPDATE OR DELETE ON benefit_audit FOR EACH ROW EXECUTE FUNCTION reject_benefit_history_change();
CREATE FUNCTION protect_benefit_promise() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.source_quote_id,OLD.source_revision,OLD.binding_index,OLD.trigger_kind,OLD.benefit_id,OLD.benefit_version,OLD.customer_id,OLD.vehicle_id,OLD.branch_ids,OLD.promise,OLD.responsible_team_id)
     IS DISTINCT FROM
     (NEW.source_quote_id,NEW.source_revision,NEW.binding_index,NEW.trigger_kind,NEW.benefit_id,NEW.benefit_version,NEW.customer_id,NEW.vehicle_id,NEW.branch_ids,NEW.promise,NEW.responsible_team_id)
  THEN RAISE EXCEPTION 'Accepted benefit promise is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER benefit_promise_immutable BEFORE UPDATE ON benefit_entitlements FOR EACH ROW EXECUTE FUNCTION protect_benefit_promise();
