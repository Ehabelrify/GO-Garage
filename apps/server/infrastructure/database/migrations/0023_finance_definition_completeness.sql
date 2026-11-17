-- Finance definitions use the immutable commercial policy registry introduced in 0011.
-- This table records explicit activation attestations without duplicating definition values.
CREATE TABLE finance_definition_attestations (
  environment_id text NOT NULL,
  definition_id text NOT NULL,
  definition_version integer NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  minor_unit_exponent integer NOT NULL CHECK (minor_unit_exponent BETWEEN 0 AND 6),
  completeness_evidence_ref text NOT NULL CHECK (length(btrim(completeness_evidence_ref)) > 0),
  attested_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  attested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment_id,definition_id,definition_version)
);
CREATE FUNCTION reject_finance_attestation_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Finance definition attestations are immutable'; END $$;
CREATE TRIGGER finance_attestations_immutable BEFORE UPDATE OR DELETE ON finance_definition_attestations FOR EACH ROW EXECUTE FUNCTION reject_finance_attestation_change();
