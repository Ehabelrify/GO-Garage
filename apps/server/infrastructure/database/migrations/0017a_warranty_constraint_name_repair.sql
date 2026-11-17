-- Migration 0018 drops this check by name. PostgreSQL assigned the source
-- check the generated name "warranties_check" because it references two
-- columns, so normalize that name before 0018 runs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'warranties'::regclass
      AND conname = 'warranties_check'
      AND contype = 'c'
  ) THEN
    ALTER TABLE warranties
      RENAME CONSTRAINT warranties_check TO warranties_expires_on_check;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'warranties'::regclass
      AND conname = 'warranties_expires_on_check'
      AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'Expected the fixed-term warranty expiry check constraint';
  END IF;
END
$$;
