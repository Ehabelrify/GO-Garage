CREATE TABLE messaging_environment_marker (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  dataset_class text NOT NULL CHECK (dataset_class IN ('operational','scenario')),
  environment_id text NOT NULL UNIQUE,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messaging_inbox_memberships (
  staff_user_id text PRIMARY KEY REFERENCES staff_memberships(clerk_user_id),
  status text NOT NULL CHECK (status IN ('active','revoked')),
  granted_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_by text REFERENCES staff_memberships(clerk_user_id),
  revoked_at timestamptz,
  CHECK ((status='active' AND revoked_by IS NULL AND revoked_at IS NULL) OR (status='revoked' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL))
);
CREATE TABLE messaging_inbox_access_audit (
  id text PRIMARY KEY,
  staff_user_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  action text NOT NULL CHECK (action IN ('granted','revoked')),
  actor_user_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messaging_channels (
  id text PRIMARY KEY,
  provider text NOT NULL,
  display_label text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','sandbox','ready','disabled')),
  provider_asset_ref text,
  enabled_at timestamptz,
  CHECK (status='disconnected' OR provider_asset_ref IS NOT NULL)
);

ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS channel_id text REFERENCES messaging_channels(id);
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version>0);
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS bot_state text NOT NULL DEFAULT 'paused' CHECK (bot_state IN ('active','paused'));
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS human_response_required_at timestamptz;
ALTER TABLE whatsapp_conversations DROP CONSTRAINT IF EXISTS whatsapp_conversations_mode_check;
ALTER TABLE whatsapp_conversations ADD CONSTRAINT whatsapp_conversations_mode_check CHECK (mode IN ('simulation','scenario','operational'));
ALTER TABLE whatsapp_messages DROP CONSTRAINT IF EXISTS whatsapp_messages_mode_check;
ALTER TABLE whatsapp_messages ADD CONSTRAINT whatsapp_messages_mode_check CHECK (mode IN ('simulation','scenario','operational'));

CREATE TABLE messaging_contact_links (
  channel_id text NOT NULL REFERENCES messaging_channels(id),
  provider_contact_hash text NOT NULL,
  customer_id text NOT NULL REFERENCES customers(id),
  vehicle_id text NOT NULL REFERENCES vehicles(id),
  branch_id text NOT NULL REFERENCES branches(id),
  approved_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(channel_id,provider_contact_hash)
);

CREATE TABLE messaging_provider_events (
  provider text NOT NULL,
  channel_id text NOT NULL REFERENCES messaging_channels(id),
  provider_event_id text NOT NULL,
  event_kind text NOT NULL,
  provider_message_id text,
  payload_digest text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,channel_id,provider_event_id)
);

CREATE TABLE messaging_outbox (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES whatsapp_conversations(id),
  channel_id text NOT NULL REFERENCES messaging_channels(id),
  recipient_ref text NOT NULL,
  content jsonb NOT NULL CHECK (jsonb_typeof(content)='object'),
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('held','queued','leased','accepted','delivered','read','definite-failure','unknown-outcome','expired')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  next_attempt_at timestamptz,
  lease_until timestamptz,
  expires_at timestamptz NOT NULL,
  provider_message_id text,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messaging_outbox_due_idx ON messaging_outbox(status,next_attempt_at) WHERE status IN ('queued','leased');
CREATE UNIQUE INDEX messaging_outbox_provider_message_channel_unique ON messaging_outbox(channel_id,provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE messaging_delivery_policies (
  channel_id text NOT NULL REFERENCES messaging_channels(id),
  version integer NOT NULL CHECK (version>0),
  language text NOT NULL CHECK (language IN ('ar','en')),
  customer_service_window_hours integer NOT NULL CHECK (customer_service_window_hours>0),
  approved_template_ref text,
  consent_basis_ref text NOT NULL,
  retention_days integer NOT NULL CHECK (retention_days>0),
  approved_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT false,
  PRIMARY KEY(channel_id,version)
);
CREATE UNIQUE INDEX messaging_delivery_policy_one_active ON messaging_delivery_policies(channel_id,language) WHERE active;
