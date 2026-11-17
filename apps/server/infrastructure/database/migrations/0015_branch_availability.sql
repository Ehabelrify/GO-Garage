-- Configuration is deliberately empty at migration time. Historical visits have no
-- trustworthy bay occupancy snapshot and must be reconciled before availability opens.
CREATE TABLE branch_availability_versions (
  branch_id text NOT NULL REFERENCES branches(id),
  version integer NOT NULL CHECK (version > 0),
  timezone text NOT NULL,
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  working_weekdays integer[] NOT NULL,
  slot_minutes integer NOT NULL CHECK (slot_minutes > 0 AND slot_minutes <= 1440),
  daily_intake_limit integer NOT NULL CHECK (daily_intake_limit > 0),
  bay_counts jsonb NOT NULL,
  effective_from date NOT NULL,
  approved_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  PRIMARY KEY (branch_id, version),
  CHECK (opens_at < closes_at),
  CHECK (working_weekdays <@ ARRAY[0,1,2,3,4,5,6]),
  CHECK (jsonb_typeof(bay_counts) = 'object')
);
CREATE TABLE branch_availability_active (
  branch_id text PRIMARY KEY REFERENCES branches(id),
  version integer NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  activated_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  FOREIGN KEY (branch_id, version) REFERENCES branch_availability_versions(branch_id, version)
);
CREATE TABLE branch_availability_closures (
  branch_id text NOT NULL,
  version integer NOT NULL,
  closed_date date NOT NULL,
  reason text NOT NULL,
  PRIMARY KEY (branch_id, version, closed_date),
  FOREIGN KEY (branch_id, version) REFERENCES branch_availability_versions(branch_id, version)
);
CREATE TABLE branch_availability_audit (
  id text PRIMARY KEY,
  branch_id text NOT NULL REFERENCES branches(id),
  version integer NOT NULL,
  action text NOT NULL,
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE booking_occupancy (
  booking_id text NOT NULL REFERENCES bookings(id),
  occupied_date date NOT NULL,
  bay_type text NOT NULL,
  required_minutes integer NOT NULL CHECK (required_minutes > 0),
  configuration_version integer NOT NULL,
  PRIMARY KEY (booking_id, occupied_date, bay_type)
);
CREATE INDEX booking_occupancy_day_idx ON booking_occupancy (occupied_date, bay_type);
CREATE TABLE branch_occupancy_reconciliation (
  branch_id text NOT NULL REFERENCES branches(id),
  occupied_date date NOT NULL,
  verified_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, occupied_date)
);
CREATE TABLE booking_change_idempotency (
  origin text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  action text NOT NULL,
  booking_id text NOT NULL REFERENCES bookings(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (origin, idempotency_key)
);
