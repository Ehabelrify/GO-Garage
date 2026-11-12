CREATE TABLE IF NOT EXISTS warranty_verification_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  approved_fields text[] NOT NULL DEFAULT '{}',
  updated_by text REFERENCES staff_memberships(clerk_user_id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    approved_fields <@ ARRAY['service', 'status', 'startDate', 'expiresOn', 'branch']::text[]
  ),
  CHECK (
    NOT enabled OR (
      'service' = ANY(approved_fields)
      AND 'status' = ANY(approved_fields)
    )
  )
);

INSERT INTO warranty_verification_settings (singleton, enabled, approved_fields)
VALUES (true, false, '{}')
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS warranty_verification_tokens (
  id text PRIMARY KEY,
  warranty_id text NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by text REFERENCES staff_memberships(clerk_user_id),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS warranty_verification_one_active_token_idx
  ON warranty_verification_tokens (warranty_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS warranty_verification_token_hash_idx
  ON warranty_verification_tokens (token_hash)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS warranty_verification_settings_audit (
  id text PRIMARY KEY,
  action text NOT NULL CHECK (action IN ('enabled', 'disabled', 'fields-updated')),
  enabled boolean NOT NULL,
  approved_fields text[] NOT NULL,
  actor_user_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warranty_verification_settings_audit_created_idx
  ON warranty_verification_settings_audit (created_at DESC);
