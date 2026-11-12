CREATE TABLE IF NOT EXISTS branches (
  id text PRIMARY KEY,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  location_label text NOT NULL,
  daily_dropoff_limit integer NOT NULL DEFAULT 6 CHECK (daily_dropoff_limit > 0),
  working_hours numeric(5, 2) NOT NULL DEFAULT 10 CHECK (working_hours > 0),
  clean_bays integer NOT NULL DEFAULT 1 CHECK (clean_bays > 0),
  general_bays integer NOT NULL DEFAULT 2 CHECK (general_bays > 0),
  weekly_day_off text NOT NULL DEFAULT 'Friday',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
  id text PRIMARY KEY,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  bay_type text NOT NULL CHECK (bay_type IN ('general', 'clean')),
  bay_hours numeric(5, 2) NOT NULL CHECK (bay_hours > 0),
  price_label text NOT NULL DEFAULT 'Estimate after inspection',
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS staff_memberships (
  clerk_user_id text PRIMARY KEY,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('owner', 'branch-manager', 'receptionist', 'technician')),
  branch_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_memberships_active_email_idx
  ON staff_memberships (lower(email)) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS owner_bootstrap (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  owner_claimed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO owner_bootstrap (singleton, owner_claimed)
VALUES (true, false)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL,
  phone_normalized text NOT NULL UNIQUE,
  preferred_language text NOT NULL DEFAULT 'ar' CHECK (preferred_language IN ('ar', 'en')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  make text NOT NULL,
  model text NOT NULL,
  year integer,
  plate text NOT NULL,
  color text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vehicles_customer_idx ON vehicles (customer_id);

CREATE TABLE IF NOT EXISTS customer_branches (
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, branch_id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id),
  vehicle_id text NOT NULL REFERENCES vehicles(id),
  service_id text NOT NULL REFERENCES services(id),
  branch_id text NOT NULL REFERENCES branches(id),
  dropoff_date date NOT NULL,
  dropoff_time time NOT NULL,
  expected_pickup date NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_branch_date_idx ON bookings (branch_id, dropoff_date, status);
CREATE INDEX IF NOT EXISTS bookings_customer_idx ON bookings (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  booking_id text NOT NULL UNIQUE REFERENCES bookings(id),
  branch_id text NOT NULL REFERENCES branches(id),
  assigned_user_id text REFERENCES staff_memberships(clerk_user_id),
  stage text NOT NULL CHECK (stage IN ('booked', 'received', 'in-service', 'qc', 'ready', 'delivered', 'cancelled', 'no-show')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_branch_stage_idx ON jobs (branch_id, stage);
CREATE INDEX IF NOT EXISTS jobs_assigned_idx ON jobs (assigned_user_id, stage);

CREATE TABLE IF NOT EXISTS job_events (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES jobs(id),
  from_stage text,
  to_stage text NOT NULL,
  actor_user_id text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_events_job_created_idx ON job_events (job_id, created_at);

CREATE TABLE IF NOT EXISTS operating_settings (
  setting_id text NOT NULL,
  scope_key text NOT NULL,
  value text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (setting_id, scope_key)
);

CREATE TABLE IF NOT EXISTS setting_audit_events (
  id text PRIMARY KEY,
  setting_id text NOT NULL,
  scope_key text NOT NULL,
  old_value text,
  new_value text NOT NULL,
  version integer NOT NULL,
  effective_date date,
  actor_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS setting_audit_history_idx
  ON setting_audit_events (setting_id, scope_key, created_at DESC);
