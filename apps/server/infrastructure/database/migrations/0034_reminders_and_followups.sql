-- Reminders and follow-ups (Wave 6, package U-A). Idempotent. SIMULATED outbox only: a reminder row is the
-- simulated message; nothing here talks to a provider. Rules are per environment; a rule row is created lazily
-- from code defaults the first time rules are read or reminders are generated.

CREATE TABLE IF NOT EXISTS reminder_rules (
  environment_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'booking_day_before', 'booking_morning_of', 'ready_for_pickup', 'warranty_expiry', 'quote_followup', 'post_service_checkin')),
  enabled boolean NOT NULL DEFAULT true,
  -- Days before the source date (booking day-before, warranty expiry) or after the event (quote offered, job delivered).
  lead_days integer NOT NULL DEFAULT 0 CHECK (lead_days BETWEEN 0 AND 365),
  -- When true the runner marks due reminders as sent-simulated itself; otherwise staff press Send now.
  auto_send boolean NOT NULL DEFAULT false,
  template_en text NOT NULL CHECK (length(btrim(template_en)) BETWEEN 1 AND 1000),
  template_ar text NOT NULL CHECK (length(btrim(template_ar)) BETWEEN 1 AND 1000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment_id, kind)
);

CREATE TABLE IF NOT EXISTS reminders (
  id text PRIMARY KEY,
  environment_id text NOT NULL,
  rule_kind text NOT NULL CHECK (rule_kind IN (
    'booking_day_before', 'booking_morning_of', 'ready_for_pickup', 'warranty_expiry', 'quote_followup', 'post_service_checkin')),
  -- source + rule (+ date or revision where the source can change); reruns never duplicate.
  dedupe_key text NOT NULL CHECK (length(btrim(dedupe_key)) > 0),
  branch_id text NOT NULL REFERENCES branches(id),
  customer_id text NOT NULL REFERENCES customers(id),
  vehicle_id text REFERENCES vehicles(id),
  booking_id text REFERENCES bookings(id),
  job_id text REFERENCES jobs(id),
  warranty_id text REFERENCES warranties(id),
  quote_id text REFERENCES quote_heads(id),
  source_date date,
  source_revision integer,
  language text NOT NULL CHECK (language IN ('ar', 'en')),
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'sent-simulated', 'skipped', 'cancelled')),
  -- no-consent | staff-skipped | source-changed
  reason text,
  snoozed_until timestamptz,
  sent_at timestamptz,
  handled_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment_id, dedupe_key),
  CHECK (status NOT IN ('skipped', 'cancelled') OR reason IS NOT NULL),
  CHECK ((status = 'sent-simulated') = (sent_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS reminders_branch_due_idx ON reminders (environment_id, branch_id, due_at);
CREATE INDEX IF NOT EXISTS reminders_customer_idx ON reminders (customer_id, due_at DESC);
CREATE INDEX IF NOT EXISTS reminders_open_idx ON reminders (environment_id, rule_kind, due_at) WHERE status = 'due';

CREATE TABLE IF NOT EXISTS reminder_events (
  id bigserial PRIMARY KEY,
  reminder_id text NOT NULL REFERENCES reminders(id),
  action text NOT NULL CHECK (action IN ('generated', 'sent-simulated', 'skipped', 'snoozed', 'cancelled')),
  actor_id text NOT NULL,
  details text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reminder_events_reminder_idx ON reminder_events (reminder_id, occurred_at);
