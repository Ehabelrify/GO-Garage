-- Additive issuance bindings. Existing coverage, invoices, claims and QR history stay intact.
ALTER TABLE commercial_policy_versions DROP CONSTRAINT commercial_policy_versions_family_check;
ALTER TABLE commercial_policy_versions ADD CONSTRAINT commercial_policy_versions_family_check CHECK (family IN ('catalogue-pricing','quote-acceptance','reservation-deposit','benefit-eligibility','transport-availability','promotion-qualification','finance-definition','work-occupancy','pickup-commitment','warranty-issuance'));
ALTER TABLE warranties ADD COLUMN component_id text;
ALTER TABLE warranties ADD COLUMN accepted_quote_id text;
ALTER TABLE warranties ADD COLUMN accepted_quote_revision integer;
ALTER TABLE warranties ADD COLUMN accepted_quote_digest text;
ALTER TABLE warranties ADD COLUMN issuance_authority jsonb;
ALTER TABLE warranties ADD CONSTRAINT warranties_quote_ref_pair CHECK ((accepted_quote_id IS NULL) = (accepted_quote_revision IS NULL));
ALTER TABLE warranties ADD CONSTRAINT warranties_accepted_quote_ref FOREIGN KEY (accepted_quote_id, accepted_quote_revision) REFERENCES quote_versions(quote_id, revision);
ALTER TABLE warranties DROP CONSTRAINT warranties_job_id_policy_id_key;
CREATE UNIQUE INDEX warranties_legacy_job_policy_unique ON warranties(job_id, policy_id) WHERE component_id IS NULL;
CREATE UNIQUE INDEX warranties_component_job_policy_unique ON warranties(job_id, component_id, policy_id) WHERE component_id IS NOT NULL;
CREATE INDEX warranties_quote_ref_idx ON warranties(accepted_quote_id, accepted_quote_revision) WHERE accepted_quote_id IS NOT NULL;
CREATE OR REPLACE FUNCTION warranty_coverage_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.policy_id IS DISTINCT FROM OLD.policy_id OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
     OR NEW.coverage_kind IS DISTINCT FROM OLD.coverage_kind OR NEW.lifetime_definition IS DISTINCT FROM OLD.lifetime_definition
     OR NEW.start_date IS DISTINCT FROM OLD.start_date OR NEW.expires_on IS DISTINCT FROM OLD.expires_on
     OR NEW.component_id IS DISTINCT FROM OLD.component_id OR NEW.accepted_quote_id IS DISTINCT FROM OLD.accepted_quote_id
     OR NEW.accepted_quote_revision IS DISTINCT FROM OLD.accepted_quote_revision
     OR NEW.accepted_quote_digest IS DISTINCT FROM OLD.accepted_quote_digest
     OR NEW.issuance_authority IS DISTINCT FROM OLD.issuance_authority THEN
    RAISE EXCEPTION 'Issued warranty terms and bindings are immutable';
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

ALTER TABLE warranty_invoice_drafts ADD COLUMN accepted_quote_id text;
ALTER TABLE warranty_invoice_drafts ADD COLUMN accepted_quote_revision integer;
ALTER TABLE warranty_invoice_drafts ADD COLUMN component_id text;
ALTER TABLE warranty_invoice_drafts ADD COLUMN sale_source text NOT NULL DEFAULT 'legacy-unlinked'
  CHECK (sale_source IN ('legacy-unlinked', 'accepted-quote-component'));
ALTER TABLE warranty_invoice_drafts ADD CONSTRAINT warranty_invoice_quote_ref_pair CHECK ((accepted_quote_id IS NULL) = (accepted_quote_revision IS NULL));
ALTER TABLE warranty_invoice_drafts ADD CONSTRAINT warranty_invoice_quote_ref FOREIGN KEY (accepted_quote_id, accepted_quote_revision) REFERENCES quote_versions(quote_id, revision);

CREATE TABLE warranty_issuance_requests (
  environment_id text NOT NULL,
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  warranty_id text NOT NULL REFERENCES warranties(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment_id, actor_id, idempotency_key)
);
CREATE TRIGGER warranty_issuance_requests_immutable BEFORE UPDATE OR DELETE ON warranty_issuance_requests
FOR EACH ROW EXECUTE FUNCTION reject_quote_history_change();
