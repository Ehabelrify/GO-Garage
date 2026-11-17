-- A commercial reservation is an entitlement record, never an occupancy hold.
CREATE TABLE promotion_reservations (
  id text PRIMARY KEY, environment_id text NOT NULL, quote_id text NOT NULL,
  quote_revision integer NOT NULL, promotion_id text NOT NULL, promotion_version integer NOT NULL,
  qualification_id text REFERENCES promotion_qualifications(id), allocation_id text REFERENCES promotion_allocations(id),
  branch_id text NOT NULL REFERENCES branches(id), beneficiary_id text NOT NULL REFERENCES customers(id),
  vehicle_id text NOT NULL REFERENCES vehicles(id), accepted_snapshot jsonb NOT NULL,
  policy_id text, policy_version integer, policy_snapshot jsonb,
  effective_on date NOT NULL, expires_on date, expiry_basis text,
  deposit_state text NOT NULL DEFAULT 'unrecorded' CHECK (deposit_state IN ('not-required','unrecorded','reference-only','recorded')),
  deposit_reference text, deposit_money_event_id text,
  status text NOT NULL CHECK (status IN ('enquiry','reserved','scheduled','redeemed','cancelled','expired')),
  booking_id text UNIQUE REFERENCES bookings(id), revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by text NOT NULL REFERENCES staff_memberships(clerk_user_id), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (quote_id,quote_revision) REFERENCES quote_versions(quote_id,revision),
  FOREIGN KEY (promotion_id,promotion_version) REFERENCES commercial_policy_versions(policy_id,version),
  FOREIGN KEY (policy_id,policy_version) REFERENCES commercial_policy_versions(policy_id,version),
  CHECK ((policy_id IS NULL) = (policy_version IS NULL)),
  CHECK (expiry_basis IS NULL OR expiry_basis IN ('approved-date','approved-no-expiry')),
  CHECK (status = 'enquiry' OR (policy_id IS NOT NULL AND expiry_basis IS NOT NULL)),
  CHECK (expiry_basis IS DISTINCT FROM 'approved-date' OR expires_on IS NOT NULL),
  -- C12 replaces this named gate with a foreign key to an audited money-source event.
  CONSTRAINT promotion_reservation_deposit_recording_gate CHECK (deposit_state <> 'recorded'),
  CHECK (booking_id IS NULL OR status IN ('scheduled','redeemed','cancelled'))
);
CREATE UNIQUE INDEX promotion_reservation_firm_quote_unique ON promotion_reservations(environment_id,promotion_id,promotion_version,quote_id,quote_revision) WHERE status <> 'enquiry';
CREATE TABLE promotion_reservation_events (
  id bigserial PRIMARY KEY, reservation_id text NOT NULL REFERENCES promotion_reservations(id),
  revision integer NOT NULL, action text NOT NULL CHECK (action IN ('enquired','reserved','scheduled','redeemed','cancelled','restored','expired','deposit-reference','deposit-recorded','deposit-reversed')),
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id), reason text, evidence_ref text,
  booking_id text REFERENCES bookings(id), occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id,revision)
);
CREATE TABLE promotion_reservation_idempotency (
  environment_id text NOT NULL, actor_id text NOT NULL, action text NOT NULL, entity_id text NOT NULL,
  idempotency_key text NOT NULL, request_hash text NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment_id,actor_id,action,entity_id,idempotency_key)
);
CREATE TABLE promotion_reservation_allocation_events (
  id bigserial PRIMARY KEY, reservation_id text NOT NULL REFERENCES promotion_reservations(id),
  allocation_id text NOT NULL REFERENCES promotion_allocations(id), action text NOT NULL CHECK (action IN ('released','restored')),
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id), reason text NOT NULL,
  evidence_ref text NOT NULL CHECK (evidence_ref ~ '^private:[A-Za-z0-9/_-]+$'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE promotion_reservation_deposit_events (
  id bigserial PRIMARY KEY, reservation_id text NOT NULL REFERENCES promotion_reservations(id),
  state text NOT NULL CHECK (state = 'reference-only'), reference text NOT NULL CHECK (reference ~ '^private:[A-Za-z0-9/_-]+$'),
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id), reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER promotion_reservation_events_immutable BEFORE UPDATE OR DELETE ON promotion_reservation_events FOR EACH ROW EXECUTE FUNCTION reject_promotion_history_change();
CREATE TRIGGER promotion_reservation_idempotency_immutable BEFORE UPDATE OR DELETE ON promotion_reservation_idempotency FOR EACH ROW EXECUTE FUNCTION reject_promotion_history_change();
CREATE TRIGGER promotion_reservation_allocation_events_immutable BEFORE UPDATE OR DELETE ON promotion_reservation_allocation_events FOR EACH ROW EXECUTE FUNCTION reject_promotion_history_change();
CREATE TRIGGER promotion_reservation_deposit_events_immutable BEFORE UPDATE OR DELETE ON promotion_reservation_deposit_events FOR EACH ROW EXECUTE FUNCTION reject_promotion_history_change();
CREATE FUNCTION protect_promotion_reservation_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.environment_id,NEW.quote_id,NEW.quote_revision,NEW.promotion_id,NEW.promotion_version,NEW.qualification_id,
     NEW.allocation_id,NEW.branch_id,NEW.beneficiary_id,NEW.vehicle_id,NEW.accepted_snapshot,NEW.policy_id,
     NEW.policy_version,NEW.policy_snapshot,NEW.effective_on,NEW.expires_on,NEW.expiry_basis,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM
    (OLD.environment_id,OLD.quote_id,OLD.quote_revision,OLD.promotion_id,OLD.promotion_version,OLD.qualification_id,
     OLD.allocation_id,OLD.branch_id,OLD.beneficiary_id,OLD.vehicle_id,OLD.accepted_snapshot,OLD.policy_id,
     OLD.policy_version,OLD.policy_snapshot,OLD.effective_on,OLD.expires_on,OLD.expiry_basis,OLD.created_by,OLD.created_at)
 THEN RAISE EXCEPTION 'Reservation source is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER promotion_reservation_source_immutable BEFORE UPDATE ON promotion_reservations FOR EACH ROW EXECUTE FUNCTION protect_promotion_reservation_source();
