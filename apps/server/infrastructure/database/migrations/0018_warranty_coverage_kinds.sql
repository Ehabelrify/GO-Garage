-- Expansion only. Existing rows remain fixed with their exact stored months and dates.
-- Once lifetime coverage is written, rollback requires a reader that understands both kinds.
-- Stop new creation and forward-fix; restore an old binary only from a verified pre-write backup.
CREATE FUNCTION warranty_lifetime_definition_complete(snapshot jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(
    jsonb_typeof(snapshot) = 'object'
    AND snapshot->>'state' = 'approved'
    AND jsonb_typeof(snapshot->'value') = 'object'
    AND (snapshot->'value'->>'subject') IN ('purchaser', 'vehicle', 'ownership', 'product', 'other')
    AND (snapshot->'policy'->>'id') IS NOT NULL
    AND (snapshot->'policy'->>'version') ~ '^[1-9][0-9]*$'
    AND nullif(btrim(snapshot->'approval'->>'approvedBy'), '') IS NOT NULL
    AND nullif(btrim(snapshot->'approval'->>'approvedAt'), '') IS NOT NULL
    AND nullif(btrim(snapshot->'approval'->>'evidenceRef'), '') IS NOT NULL
    AND nullif(btrim(snapshot->'approval'->>'reason'), '') IS NOT NULL
    AND nullif(btrim(snapshot->'value'->>'subjectDefinition'), '') IS NOT NULL
    AND nullif(btrim(snapshot->'value'->>'terminationConditions'), '') IS NOT NULL
    AND nullif(btrim(snapshot->'value'->>'transferRule'), '') IS NOT NULL
    AND nullif(btrim(snapshot->'value'->>'maintenanceConditions'), '') IS NOT NULL
    AND nullif(btrim(snapshot->'value'->>'issuer'), '') IS NOT NULL
    AND nullif(btrim(snapshot->'value'->>'remedy'), '') IS NOT NULL
    AND nullif(btrim(snapshot->'value'->'publicWording'->>'ar'), '') IS NOT NULL
    AND nullif(btrim(snapshot->'value'->'publicWording'->>'en'), '') IS NOT NULL,
    false
  );
$$;

ALTER TABLE warranty_policies
  ADD COLUMN coverage_kind text NOT NULL DEFAULT 'fixed',
  ADD COLUMN lifetime_definition jsonb;
ALTER TABLE warranty_policies ALTER COLUMN duration_months DROP NOT NULL;
ALTER TABLE warranty_policies DROP CONSTRAINT warranty_policies_duration_months_check;
ALTER TABLE warranty_policies ADD CONSTRAINT warranty_policy_term_shape CHECK (
  (coverage_kind = 'fixed' AND duration_months IS NOT NULL AND duration_months BETWEEN 1 AND 120 AND lifetime_definition IS NULL)
  OR (coverage_kind = 'lifetime' AND duration_months IS NULL AND
      (status = 'draft' OR warranty_lifetime_definition_complete(lifetime_definition)) AND
      (lifetime_definition IS NULL OR jsonb_typeof(lifetime_definition) = 'object'))
);

ALTER TABLE warranties
  ADD COLUMN coverage_kind text NOT NULL DEFAULT 'fixed',
  ADD COLUMN lifetime_definition jsonb,
  ADD COLUMN terminated_on date;
ALTER TABLE warranties ALTER COLUMN expires_on DROP NOT NULL;
ALTER TABLE warranties DROP CONSTRAINT warranties_expires_on_check;
ALTER TABLE warranties ADD CONSTRAINT warranty_coverage_term_shape CHECK (
  (coverage_kind = 'fixed' AND expires_on IS NOT NULL AND expires_on >= start_date
    AND lifetime_definition IS NULL AND terminated_on IS NULL)
  OR (coverage_kind = 'lifetime' AND expires_on IS NULL
    AND warranty_lifetime_definition_complete(lifetime_definition)
    AND (terminated_on IS NULL OR terminated_on >= start_date))
);

CREATE TABLE warranty_termination_events (
  id text PRIMARY KEY,
  warranty_id text NOT NULL REFERENCES warranties(id),
  terminated_on date NOT NULL,
  actor_user_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  evidence_ref text NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warranty_id)
);
CREATE FUNCTION warranty_record_termination() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE warranties SET terminated_on = NEW.terminated_on
  WHERE id = NEW.warranty_id AND coverage_kind = 'lifetime' AND terminated_on IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only active lifetime coverage can be terminated'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER warranty_termination_record AFTER INSERT ON warranty_termination_events
FOR EACH ROW EXECUTE FUNCTION warranty_record_termination();
CREATE FUNCTION warranty_termination_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Warranty termination events are append-only';
END;
$$;
CREATE TRIGGER warranty_termination_no_change BEFORE UPDATE OR DELETE ON warranty_termination_events
FOR EACH ROW EXECUTE FUNCTION warranty_termination_immutable();

CREATE FUNCTION warranty_coverage_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.policy_id IS DISTINCT FROM OLD.policy_id
     OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
     OR NEW.coverage_kind IS DISTINCT FROM OLD.coverage_kind
     OR NEW.lifetime_definition IS DISTINCT FROM OLD.lifetime_definition
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.expires_on IS DISTINCT FROM OLD.expires_on THEN
    RAISE EXCEPTION 'Issued warranty terms are immutable';
  END IF;
  IF NEW.terminated_on IS DISTINCT FROM OLD.terminated_on AND
     (OLD.terminated_on IS NOT NULL OR NEW.terminated_on IS NULL OR
      NOT EXISTS (SELECT 1 FROM warranty_termination_events e
                  WHERE e.warranty_id = OLD.id AND e.terminated_on = NEW.terminated_on)) THEN
    RAISE EXCEPTION 'Termination requires an append-only event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER warranty_coverage_no_term_change BEFORE UPDATE ON warranties
FOR EACH ROW EXECUTE FUNCTION warranty_coverage_immutable();

ALTER TABLE warranty_verification_settings DROP CONSTRAINT warranty_verification_settings_check;
ALTER TABLE warranty_verification_settings ADD CONSTRAINT warranty_verification_settings_check CHECK (
  approved_fields <@ ARRAY['service', 'status', 'startDate', 'expiresOn', 'branch', 'coverage']::text[]
);
