ALTER TABLE messaging_outbox
  ADD COLUMN lease_token text,
  ADD COLUMN reconciliation_ref text;

CREATE TABLE messaging_customer_consents (
  channel_id text NOT NULL REFERENCES messaging_channels(id),
  customer_id text NOT NULL REFERENCES customers(id),
  purpose text NOT NULL CHECK (purpose IN ('service','marketing')),
  status text NOT NULL CHECK (status IN ('granted','revoked')),
  evidence_ref text,
  consented_at timestamptz NOT NULL,
  expires_at timestamptz,
  consented_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  revoked_at timestamptz,
  revoked_by text REFERENCES staff_memberships(clerk_user_id),
  revision integer NOT NULL CHECK (revision > 0),
  PRIMARY KEY (channel_id,customer_id,purpose),
  CHECK (evidence_ref IS NULL OR evidence_ref ~ '^private:[A-Za-z0-9/_-]+$'),
  CHECK (
    (status='granted' AND evidence_ref IS NOT NULL AND revoked_at IS NULL AND revoked_by IS NULL)
    OR
    (status='revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  )
);

CREATE INDEX messaging_customer_consent_active_idx
  ON messaging_customer_consents(channel_id,customer_id,purpose,expires_at)
  WHERE status='granted';

CREATE TABLE messaging_customer_consent_events (
  id text PRIMARY KEY,
  channel_id text NOT NULL,
  customer_id text NOT NULL,
  purpose text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  action text NOT NULL CHECK (action IN ('granted','revoked')),
  evidence_ref text,
  reason text,
  actor_user_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id,customer_id,purpose,revision),
  FOREIGN KEY (channel_id,customer_id,purpose)
    REFERENCES messaging_customer_consents(channel_id,customer_id,purpose),
  CHECK (evidence_ref IS NULL OR evidence_ref ~ '^private:[A-Za-z0-9/_-]+$')
);
