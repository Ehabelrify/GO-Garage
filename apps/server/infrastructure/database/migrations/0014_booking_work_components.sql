ALTER TABLE commercial_policy_versions DROP CONSTRAINT commercial_policy_versions_family_check;
ALTER TABLE commercial_policy_versions ADD CONSTRAINT commercial_policy_versions_family_check CHECK (family IN ('catalogue-pricing','quote-acceptance','reservation-deposit','benefit-eligibility','transport-availability','promotion-qualification','finance-definition','work-occupancy','pickup-commitment'));

ALTER TABLE bookings ADD COLUMN accepted_quote_id text;
ALTER TABLE bookings ADD COLUMN accepted_quote_revision integer;
ALTER TABLE bookings ADD CONSTRAINT bookings_accepted_quote_ref FOREIGN KEY (accepted_quote_id, accepted_quote_revision) REFERENCES quote_versions(quote_id, revision);
ALTER TABLE bookings ADD CONSTRAINT bookings_quote_ref_pair CHECK ((accepted_quote_id IS NULL) = (accepted_quote_revision IS NULL));
CREATE UNIQUE INDEX bookings_accepted_quote_unique ON bookings(accepted_quote_id, accepted_quote_revision) WHERE accepted_quote_id IS NOT NULL;

CREATE TABLE booking_work_components (
  booking_id text NOT NULL REFERENCES bookings(id),
  position integer NOT NULL CHECK (position >= 0),
  component_id text NOT NULL,
  service_id text NOT NULL REFERENCES services(id),
  scope_item_ids text[] NOT NULL,
  occupancy_rule_id text NOT NULL,
  occupancy_rule_version integer NOT NULL CHECK (occupancy_rule_version > 0),
  PRIMARY KEY (booking_id, position),
  UNIQUE (booking_id, component_id),
  FOREIGN KEY (occupancy_rule_id, occupancy_rule_version) REFERENCES commercial_policy_versions(policy_id, version)
);
CREATE TABLE job_work_components (
  job_id text NOT NULL REFERENCES jobs(id),
  position integer NOT NULL CHECK (position >= 0),
  component_id text NOT NULL,
  service_id text NOT NULL REFERENCES services(id),
  scope_item_ids text[] NOT NULL,
  occupancy_rule_id text NOT NULL,
  occupancy_rule_version integer NOT NULL CHECK (occupancy_rule_version > 0),
  PRIMARY KEY (job_id, position),
  UNIQUE (job_id, component_id),
  FOREIGN KEY (occupancy_rule_id, occupancy_rule_version) REFERENCES commercial_policy_versions(policy_id, version)
);
CREATE TRIGGER booking_work_immutable BEFORE UPDATE OR DELETE ON booking_work_components FOR EACH ROW EXECUTE FUNCTION reject_quote_history_change();
CREATE TRIGGER job_work_immutable BEFORE UPDATE OR DELETE ON job_work_components FOR EACH ROW EXECUTE FUNCTION reject_quote_history_change();

CREATE TABLE pickup_commitments (
  id text PRIMARY KEY,
  booking_id text NOT NULL REFERENCES bookings(id),
  job_id text NOT NULL REFERENCES jobs(id),
  revision integer NOT NULL CHECK (revision > 0),
  supersedes_id text REFERENCES pickup_commitments(id),
  promised_at timestamptz,
  branch_timezone text NOT NULL,
  recorded_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  customer_agreement_evidence_ref text,
  reason text NOT NULL,
  cancellation_reason text,
  UNIQUE (booking_id, revision),
  CHECK ((promised_at IS NOT NULL AND customer_agreement_evidence_ref IS NOT NULL AND cancellation_reason IS NULL) OR
         (promised_at IS NULL AND customer_agreement_evidence_ref IS NULL AND cancellation_reason IS NOT NULL))
);
CREATE TRIGGER pickup_commitments_immutable BEFORE UPDATE OR DELETE ON pickup_commitments FOR EACH ROW EXECUTE FUNCTION reject_quote_history_change();
CREATE VIEW active_pickup_commitments AS
  SELECT p.* FROM pickup_commitments p
  WHERE p.promised_at IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM pickup_commitments later WHERE later.supersedes_id = p.id);
CREATE VIEW missed_pickup_commitments AS
  SELECT p.* FROM active_pickup_commitments p JOIN jobs j ON j.id = p.job_id
  WHERE p.promised_at < now() AND j.stage <> 'delivered'
    AND NOT EXISTS (SELECT 1 FROM job_events e WHERE e.job_id = j.id AND e.to_stage = 'delivered');
