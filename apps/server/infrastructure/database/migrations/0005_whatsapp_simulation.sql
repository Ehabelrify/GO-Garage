CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id text PRIMARY KEY,
  branch_id text NOT NULL REFERENCES branches(id),
  mode text NOT NULL DEFAULT 'simulation' CHECK (mode = 'simulation'),
  customer_label text NOT NULL,
  customer_id text NOT NULL REFERENCES customers(id),
  vehicle_id text NOT NULL REFERENCES vehicles(id),
  verification_code text NOT NULL DEFAULT '4821',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved')),
  assigned_user_id text REFERENCES staff_memberships(clerk_user_id),
  unread_count integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  related_booking_id text REFERENCES bookings(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_branch_updated_idx
  ON whatsapp_conversations (branch_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'simulation' CHECK (mode = 'simulation'),
  kind text NOT NULL CHECK (kind IN ('customer', 'bot', 'staff', 'internal-note')),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  author_user_id text REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_messages_conversation_created_idx
  ON whatsapp_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS whatsapp_conversation_events (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  details text NOT NULL DEFAULT '',
  actor_user_id text REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_conversation_events_created_idx
  ON whatsapp_conversation_events (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS whatsapp_booking_drafts (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  service_id text NOT NULL REFERENCES services(id),
  dropoff_date date NOT NULL,
  dropoff_time time NOT NULL,
  expected_pickup date NOT NULL,
  eta_reason text NOT NULL,
  change_booking_id text REFERENCES bookings(id),
  change_action text CHECK (change_action IN ('reschedule', 'cancel')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_booking_drafts_conversation_idx
  ON whatsapp_booking_drafts (conversation_id, created_at DESC);
