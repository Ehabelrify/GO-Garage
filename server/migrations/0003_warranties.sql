CREATE TABLE IF NOT EXISTS warranty_policies (
  policy_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  name text NOT NULL,
  eligible_service_ids text[] NOT NULL CHECK (cardinality(eligible_service_ids) > 0),
  start_rule text NOT NULL CHECK (start_rule IN ('job-delivery', 'owner-selected-date')),
  duration_months smallint NOT NULL CHECK (duration_months BETWEEN 1 AND 120),
  exclusions text NOT NULL CHECK (length(btrim(exclusions)) > 0),
  evidence_requirements text NOT NULL CHECK (length(btrim(evidence_requirements)) > 0),
  review_role text NOT NULL CHECK (review_role IN ('owner', 'branch-manager')),
  response_days smallint NOT NULL CHECK (response_days BETWEEN 1 AND 365),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  created_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  published_by text REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  PRIMARY KEY (policy_id, version),
  CHECK (
    (status = 'draft' AND published_by IS NULL AND published_at IS NULL)
    OR (status IN ('published', 'retired') AND published_by IS NOT NULL AND published_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS warranty_policy_one_published_version_idx
  ON warranty_policies (policy_id) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS warranties (
  id text PRIMARY KEY,
  policy_id text NOT NULL,
  policy_version integer NOT NULL,
  job_id text NOT NULL REFERENCES jobs(id),
  customer_id text NOT NULL REFERENCES customers(id),
  vehicle_id text NOT NULL REFERENCES vehicles(id),
  branch_id text NOT NULL REFERENCES branches(id),
  service_id text NOT NULL REFERENCES services(id),
  start_date date NOT NULL,
  expires_on date NOT NULL CHECK (expires_on >= start_date),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  void_reason text,
  issued_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (policy_id, policy_version) REFERENCES warranty_policies(policy_id, version),
  UNIQUE (job_id, policy_id),
  CHECK (status = 'active' OR length(btrim(coalesce(void_reason, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS warranties_branch_expiry_idx
  ON warranties (branch_id, expires_on DESC);
CREATE INDEX IF NOT EXISTS warranties_customer_idx
  ON warranties (customer_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS warranty_claims (
  id text PRIMARY KEY,
  warranty_id text NOT NULL REFERENCES warranties(id),
  summary text NOT NULL CHECK (length(btrim(summary)) > 0),
  evidence text NOT NULL CHECK (length(btrim(evidence)) > 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under-review', 'approved', 'denied', 'closed')),
  resolution text,
  opened_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  reviewed_by text REFERENCES staff_memberships(clerk_user_id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    status NOT IN ('approved', 'denied', 'closed')
    OR (length(btrim(coalesce(resolution, ''))) > 0 AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS warranty_claims_warranty_idx
  ON warranty_claims (warranty_id, created_at DESC);

CREATE TABLE IF NOT EXISTS warranty_audit_events (
  id text PRIMARY KEY,
  policy_id text,
  policy_version integer,
  warranty_id text REFERENCES warranties(id),
  claim_id text REFERENCES warranty_claims(id),
  action text NOT NULL,
  details text NOT NULL DEFAULT '',
  actor_user_id text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(policy_id, warranty_id, claim_id) = 1),
  CHECK ((policy_id IS NULL) = (policy_version IS NULL)),
  FOREIGN KEY (policy_id, policy_version) REFERENCES warranty_policies(policy_id, version)
);
CREATE INDEX IF NOT EXISTS warranty_audit_policy_idx
  ON warranty_audit_events (policy_id, policy_version, created_at DESC)
  WHERE policy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS warranty_audit_warranty_idx
  ON warranty_audit_events (warranty_id, created_at DESC)
  WHERE warranty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS warranty_audit_claim_idx
  ON warranty_audit_events (claim_id, created_at DESC)
  WHERE claim_id IS NOT NULL;
