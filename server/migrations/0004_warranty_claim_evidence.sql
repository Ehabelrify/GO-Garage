CREATE TABLE IF NOT EXISTS warranty_claim_attachments (
  id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES warranty_claims(id) ON DELETE CASCADE,
  object_name text NOT NULL UNIQUE,
  original_filename text NOT NULL CHECK (length(btrim(original_filename)) BETWEEN 1 AND 180),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 8388608),
  uploaded_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warranty_claim_attachments_claim_idx
  ON warranty_claim_attachments (claim_id, created_at DESC);
