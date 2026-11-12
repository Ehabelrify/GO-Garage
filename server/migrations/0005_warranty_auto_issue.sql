ALTER TABLE warranty_policies
  ADD COLUMN IF NOT EXISTS auto_issue boolean NOT NULL DEFAULT false;

ALTER TABLE warranty_policies
  ADD CONSTRAINT warranty_auto_issue_requires_delivery_start
  CHECK (NOT auto_issue OR start_rule = 'job-delivery');
