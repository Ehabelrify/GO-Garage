CREATE TABLE transport_requests (
  id text PRIMARY KEY,
  environment_id text NOT NULL,
  booking_id text NOT NULL REFERENCES bookings(id),
  job_id text REFERENCES jobs(id),
  branch_id text NOT NULL REFERENCES branches(id),
  customer_id text NOT NULL REFERENCES customers(id),
  vehicle_id text NOT NULL REFERENCES vehicles(id),
  direction text NOT NULL CHECK (direction IN ('pickup','return','courtesy')),
  mode text NOT NULL CHECK (mode IN ('tow','driver','courtesy-car')),
  status text NOT NULL CHECK (status IN ('proposed','requested','confirmed','pickup-in-progress','in-custody','completed','cancelled','exception')),
  provider_id text,
  policy_id text,
  policy_version integer,
  policy_snapshot jsonb,
  fee jsonb,
  committed_starts_at timestamptz,
  committed_ends_at timestamptz,
  missing text[] NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((committed_starts_at IS NULL) = (committed_ends_at IS NULL)),
  CHECK (committed_ends_at IS NULL OR committed_ends_at > committed_starts_at),
  CHECK ((policy_id IS NULL) = (policy_version IS NULL))
);
CREATE INDEX transport_requests_scope_idx ON transport_requests(environment_id,branch_id,status);
CREATE INDEX transport_requests_provider_window_idx ON transport_requests(environment_id,provider_id,committed_starts_at,committed_ends_at);
CREATE UNIQUE INDEX transport_requests_booking_direction_idx ON transport_requests(environment_id,booking_id,direction);

CREATE TABLE transport_private_contacts (
  transport_id text PRIMARY KEY REFERENCES transport_requests(id),
  contact text NOT NULL,
  location text NOT NULL,
  instructions text NOT NULL
);

CREATE TABLE transport_events (
  id bigserial PRIMARY KEY,
  transport_id text NOT NULL REFERENCES transport_requests(id),
  revision integer NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  reason text,
  evidence_ref text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transport_id,revision)
);

CREATE TABLE transport_requests_idempotency (
  environment_id text NOT NULL,
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  operation text NOT NULL,
  entity_id text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (environment_id,actor_id,operation,entity_id,idempotency_key)
);

CREATE FUNCTION reject_transport_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Transport coordination history is append-only'; END $$;
CREATE TRIGGER transport_events_immutable BEFORE UPDATE OR DELETE ON transport_events FOR EACH ROW EXECUTE FUNCTION reject_transport_history_change();
CREATE TRIGGER transport_private_contact_no_delete BEFORE DELETE ON transport_private_contacts FOR EACH ROW EXECUTE FUNCTION reject_transport_history_change();
