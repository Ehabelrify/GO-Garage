-- Catalogue snapshots are append-only. A later publication changes only the active pointer.
CREATE TABLE catalogue_vehicle_categories (
  id text PRIMARY KEY,
  name jsonb NOT NULL CHECK (jsonb_typeof(name) = 'object'),
  created_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE vehicles ADD COLUMN category_id text REFERENCES catalogue_vehicle_categories(id);

CREATE TABLE catalogue_grade_versions (
  grade_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  revision integer NOT NULL CHECK (revision > 0),
  state text NOT NULL CHECK (state IN ('draft','published','retired')),
  name jsonb NOT NULL CHECK (jsonb_typeof(name) = 'object'),
  thickness_micrometres integer CHECK (thickness_micrometres > 0),
  provenance text NOT NULL DEFAULT '',
  approval jsonb,
  created_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grade_id, version),
  CHECK (state = 'draft' OR approval IS NOT NULL)
);
CREATE TABLE catalogue_grade_active (
  grade_id text PRIMARY KEY,
  version integer NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  FOREIGN KEY (grade_id, version) REFERENCES catalogue_grade_versions(grade_id, version)
);

CREATE TABLE catalogue_package_versions (
  package_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  revision integer NOT NULL CHECK (revision > 0),
  kind text NOT NULL CHECK (kind IN ('package','standalone')),
  state text NOT NULL CHECK (state IN ('draft','published','retired')),
  name jsonb NOT NULL CHECK (jsonb_typeof(name) = 'object'),
  vehicle_category_ids text[] NOT NULL DEFAULT '{}',
  vehicle_models text[] NOT NULL DEFAULT '{}',
  branch_ids text[] NOT NULL DEFAULT '{}',
  effective_from date,
  effective_through date,
  scope jsonb NOT NULL CHECK (jsonb_typeof(scope) = 'array'),
  work jsonb NOT NULL CHECK (jsonb_typeof(work) = 'array'),
  price jsonb NOT NULL,
  tax jsonb NOT NULL,
  work_aggregation jsonb NOT NULL,
  provenance text NOT NULL DEFAULT '',
  approval jsonb,
  created_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (package_id, version),
  CHECK (effective_through IS NULL OR (effective_from IS NOT NULL AND effective_through >= effective_from)),
  CHECK (state = 'draft' OR approval IS NOT NULL)
);
CREATE TABLE catalogue_package_active (
  package_id text PRIMARY KEY,
  version integer NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  FOREIGN KEY (package_id, version) REFERENCES catalogue_package_versions(package_id, version)
);
CREATE TABLE catalogue_audit (
  id bigserial PRIMARY KEY,
  entity_kind text NOT NULL CHECK (entity_kind IN ('package','grade')),
  entity_id text NOT NULL,
  version integer NOT NULL,
  action text NOT NULL CHECK (action IN ('draft-saved','published','retired')),
  actor_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  reason text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION reject_catalogue_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Catalogue history is immutable'; END $$;
CREATE TRIGGER catalogue_package_versions_immutable BEFORE UPDATE OR DELETE ON catalogue_package_versions FOR EACH ROW EXECUTE FUNCTION reject_catalogue_history_change();
CREATE TRIGGER catalogue_grade_versions_immutable BEFORE UPDATE OR DELETE ON catalogue_grade_versions FOR EACH ROW EXECUTE FUNCTION reject_catalogue_history_change();
CREATE TRIGGER catalogue_audit_immutable BEFORE UPDATE OR DELETE ON catalogue_audit FOR EACH ROW EXECUTE FUNCTION reject_catalogue_history_change();
