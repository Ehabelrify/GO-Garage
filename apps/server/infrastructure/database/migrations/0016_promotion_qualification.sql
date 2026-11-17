-- No promotion is activated by this migration. All rules are approved commercial policy versions.
CREATE TABLE promotion_pools (
  environment_id text NOT NULL, promotion_id text NOT NULL, policy_version integer NOT NULL CHECK (policy_version > 0),
  branch_id text REFERENCES branches(id), maximum_units integer NOT NULL CHECK (maximum_units > 0),
  reserved_units integer NOT NULL DEFAULT 0 CHECK (reserved_units >= 0), consumed_units integer NOT NULL DEFAULT 0 CHECK (consumed_units >= 0),
  PRIMARY KEY (environment_id,promotion_id,policy_version), CHECK (reserved_units + consumed_units <= maximum_units),
  FOREIGN KEY (promotion_id,policy_version) REFERENCES commercial_policy_versions(policy_id,version)
);
CREATE TABLE promotion_qualifications (
  id text PRIMARY KEY, environment_id text NOT NULL, promotion_id text NOT NULL, policy_version integer NOT NULL,
  branch_id text NOT NULL REFERENCES branches(id), beneficiary_id text NOT NULL REFERENCES customers(id),
  vehicle_ids text[] NOT NULL, state text NOT NULL CHECK (state IN ('eligible','review-required','unconfigured')),
  decision_reasons text[] NOT NULL DEFAULT '{}', created_by text NOT NULL REFERENCES staff_memberships(clerk_user_id), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (promotion_id,policy_version) REFERENCES commercial_policy_versions(policy_id,version)
);
CREATE TABLE promotion_evidence (
  id bigserial PRIMARY KEY, qualification_id text NOT NULL REFERENCES promotion_qualifications(id),
  kind text NOT NULL CHECK (kind IN ('warranty-reference','membership-verification','grouped-vehicles')),
  reference_id text NOT NULL CHECK (length(btrim(reference_id)) > 0),
  verified_by text REFERENCES staff_memberships(clerk_user_id), verified_at timestamptz,
  CHECK ((verified_by IS NULL) = (verified_at IS NULL)), UNIQUE (qualification_id,kind,reference_id)
);
CREATE TABLE promotion_membership_verifications (
  id text PRIMARY KEY, environment_id text NOT NULL, promotion_id text NOT NULL, policy_version integer NOT NULL,
  beneficiary_id text NOT NULL REFERENCES customers(id), branch_id text NOT NULL REFERENCES branches(id),
  source_ref text NOT NULL CHECK (source_ref ~ '^private:[A-Za-z0-9/_-]+$'),
  verified_by text NOT NULL REFERENCES staff_memberships(clerk_user_id), verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz, revoked_at timestamptz, revoked_by text REFERENCES staff_memberships(clerk_user_id),
  FOREIGN KEY (promotion_id,policy_version) REFERENCES commercial_policy_versions(policy_id,version),
  UNIQUE (environment_id,promotion_id,policy_version,source_ref),
  CHECK (expires_at IS NULL OR expires_at > verified_at),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
CREATE TABLE promotion_membership_verification_events (
  id bigserial PRIMARY KEY, verification_id text NOT NULL REFERENCES promotion_membership_verifications(id),
  action text NOT NULL CHECK (action IN ('verified','revoked')),
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id), occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (verification_id,action)
);
CREATE TABLE promotion_evidence_consumption (
  environment_id text NOT NULL, promotion_id text NOT NULL, kind text NOT NULL, reference_id text NOT NULL,
  qualification_id text NOT NULL REFERENCES promotion_qualifications(id), allocation_id text,
  PRIMARY KEY (environment_id,kind,reference_id), UNIQUE (allocation_id,kind,reference_id)
);
CREATE TABLE promotion_allocations (
  id text PRIMARY KEY, environment_id text NOT NULL, promotion_id text NOT NULL, policy_version integer NOT NULL,
  qualification_id text NOT NULL REFERENCES promotion_qualifications(id), quote_id text NOT NULL, quote_revision integer NOT NULL,
  beneficiary_id text NOT NULL REFERENCES customers(id), vehicle_id text NOT NULL REFERENCES vehicles(id),
  discount_minor bigint NOT NULL CHECK (discount_minor >= 0), currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  units integer NOT NULL CHECK (units > 0), status text NOT NULL CHECK (status IN ('reserved','consumed','reversed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (quote_id,quote_revision) REFERENCES quote_versions(quote_id,revision),
  FOREIGN KEY (environment_id,promotion_id,policy_version) REFERENCES promotion_pools(environment_id,promotion_id,policy_version),
  UNIQUE (environment_id,promotion_id,quote_id,quote_revision,vehicle_id)
);
ALTER TABLE promotion_evidence_consumption ADD CONSTRAINT promotion_evidence_allocation_fk FOREIGN KEY (allocation_id) REFERENCES promotion_allocations(id);
CREATE TABLE promotion_allocation_events (
  id bigserial PRIMARY KEY, allocation_id text NOT NULL REFERENCES promotion_allocations(id), action text NOT NULL CHECK (action IN ('reserved','consumed','reversed')),
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id), reason text, evidence_ref text,
  occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE (allocation_id,action)
);
CREATE TABLE promotion_idempotency (
  environment_id text NOT NULL, actor_id text NOT NULL, action text NOT NULL, entity_id text NOT NULL,
  idempotency_key text NOT NULL, request_hash text NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment_id,actor_id,action,entity_id,idempotency_key)
);
CREATE FUNCTION reject_promotion_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Promotion history is append-only'; END $$;
CREATE TRIGGER promotion_qualifications_immutable BEFORE UPDATE OR DELETE ON promotion_qualifications FOR EACH ROW EXECUTE FUNCTION reject_promotion_history_change();
CREATE TRIGGER promotion_evidence_immutable BEFORE UPDATE OR DELETE ON promotion_evidence FOR EACH ROW EXECUTE FUNCTION reject_promotion_history_change();
CREATE TRIGGER promotion_allocation_events_immutable BEFORE UPDATE OR DELETE ON promotion_allocation_events FOR EACH ROW EXECUTE FUNCTION reject_promotion_history_change();
CREATE TRIGGER promotion_idempotency_immutable BEFORE UPDATE OR DELETE ON promotion_idempotency FOR EACH ROW EXECUTE FUNCTION reject_promotion_history_change();
CREATE TRIGGER promotion_membership_verification_events_immutable BEFORE UPDATE OR DELETE ON promotion_membership_verification_events FOR EACH ROW EXECUTE FUNCTION reject_promotion_history_change();
