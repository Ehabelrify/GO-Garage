-- Invite-only access: the owner pre-approves a Google work email, role and
-- branches. The row carries a placeholder clerk_user_id ('invited:<uuid>') and
-- status 'invited' until the matching verified Google sign-in claims it.
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname FROM pg_constraint c
    WHERE c.conrelid = 'staff_memberships'::regclass AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE staff_memberships DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE staff_memberships
  ADD CONSTRAINT staff_memberships_status_check CHECK (status IN ('active', 'inactive', 'invited'));

ALTER TABLE staff_memberships
  ADD COLUMN IF NOT EXISTS invited_by text;

-- At most one pending pre-approval per email.
CREATE UNIQUE INDEX IF NOT EXISTS staff_memberships_invited_email_idx
  ON staff_memberships (lower(email)) WHERE status = 'invited';

-- Per-user capability overrides layered on role defaults (enforced server-side in authz.ts).
ALTER TABLE staff_memberships
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;
