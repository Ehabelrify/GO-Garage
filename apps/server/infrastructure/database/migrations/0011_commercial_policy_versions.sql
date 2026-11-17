CREATE TABLE commercial_policy_versions (
  policy_id text NOT NULL,
  family text NOT NULL CHECK (family IN ('catalogue-pricing','quote-acceptance','reservation-deposit','benefit-eligibility','transport-availability','promotion-qualification','finance-definition')),
  version integer NOT NULL CHECK (version > 0),
  value jsonb NOT NULL CHECK (jsonb_typeof(value) = 'object'),
  branch_id text REFERENCES branches(id),
  effective_from date,
  effective_through date,
  state text NOT NULL CHECK (state IN ('draft','approved')),
  evidence_ref text,
  approved_by text REFERENCES staff_memberships(clerk_user_id),
  approved_at timestamptz,
  reason text,
  created_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (policy_id, version),
  CHECK (effective_through IS NULL OR effective_from IS NOT NULL),
  CHECK (effective_through IS NULL OR effective_through >= effective_from),
  CHECK ((state = 'draft' AND evidence_ref IS NULL AND approved_by IS NULL AND approved_at IS NULL AND reason IS NULL)
      OR (state = 'approved' AND length(btrim(evidence_ref)) > 0 AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND length(btrim(reason)) > 0))
);
CREATE TABLE commercial_policy_active (
  policy_id text PRIMARY KEY,
  version integer NOT NULL,
  activated_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  activated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (policy_id, version) REFERENCES commercial_policy_versions(policy_id, version)
);
CREATE TABLE commercial_policy_audit (
  id bigserial PRIMARY KEY,
  policy_id text NOT NULL,
  version integer NOT NULL,
  action text NOT NULL CHECK (action IN ('proposed','approved','activated')),
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  FOREIGN KEY (policy_id, version) REFERENCES commercial_policy_versions(policy_id, version)
);
CREATE FUNCTION reject_commercial_policy_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Commercial policy history is append-only'; END $$;
CREATE TRIGGER commercial_versions_immutable BEFORE UPDATE OR DELETE ON commercial_policy_versions
  FOR EACH ROW EXECUTE FUNCTION reject_commercial_policy_change();
CREATE TRIGGER commercial_audit_immutable BEFORE UPDATE OR DELETE ON commercial_policy_audit
  FOR EACH ROW EXECUTE FUNCTION reject_commercial_policy_change();
