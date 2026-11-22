-- Duplicate customer merge (Wave 6, package U-B). Idempotent. Not applied anywhere.
-- A merge moves a customer's records to a surviving customer inside one transaction, keeps the merged-away customer as
-- an archived stub (record_archives) and records every moved row so the merge can be undone within 30 days.

-- 1. owner_record_audit learns two actions (its CHECK was system-named, so it is dropped by lookup).
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'owner_record_audit'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%archived%'
  LOOP
    EXECUTE format('ALTER TABLE owner_record_audit DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE owner_record_audit DROP CONSTRAINT IF EXISTS owner_record_audit_action_check;
ALTER TABLE owner_record_audit
  ADD CONSTRAINT owner_record_audit_action_check CHECK (action IN ('archived','restored','deleted','merged','merge-undone'));

-- 2. The merge record and the reversible move log.
CREATE TABLE IF NOT EXISTS customer_merges (
  id text PRIMARY KEY,
  survivor_id text NOT NULL REFERENCES customers(id),
  merged_id text NOT NULL REFERENCES customers(id),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  merged_by text NOT NULL REFERENCES staff_memberships(clerk_user_id),
  merged_at timestamptz NOT NULL DEFAULT now(),
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  merged_snapshot jsonb NOT NULL,
  undone_at timestamptz,
  undone_by text REFERENCES staff_memberships(clerk_user_id),
  undo_reason text,
  CHECK (survivor_id <> merged_id),
  CHECK ((undone_at IS NULL) = (undone_by IS NULL))
);
-- A customer can be merged away once at a time (undo frees it).
CREATE UNIQUE INDEX IF NOT EXISTS customer_merges_active_merged_idx ON customer_merges (merged_id) WHERE undone_at IS NULL;
CREATE INDEX IF NOT EXISTS customer_merges_survivor_idx ON customer_merges (survivor_id, merged_at DESC);

-- kind 'move' = one column of one row changed from old_value to new_value;
-- kind 'insert' = a row created by the merge (a surviving copy of a consent or customer-branch link), deleted on undo.
CREATE TABLE IF NOT EXISTS customer_merge_moves (
  id bigserial PRIMARY KEY,
  merge_id text NOT NULL REFERENCES customer_merges(id),
  kind text NOT NULL CHECK (kind IN ('move','insert')),
  table_name text NOT NULL,
  pk jsonb NOT NULL,
  column_name text,
  old_value text,
  new_value text
);
CREATE INDEX IF NOT EXISTS customer_merge_moves_merge_idx ON customer_merge_moves (merge_id, id);

-- Append-only, except that customer_merges may be marked undone exactly once.
CREATE OR REPLACE FUNCTION reject_customer_merge_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'customer_merges' AND TG_OP = 'UPDATE' THEN
    IF OLD.undone_at IS NOT NULL
       OR (NEW.id, NEW.survivor_id, NEW.merged_id, NEW.reason, NEW.merged_by, NEW.merged_at, NEW.counts, NEW.merged_snapshot)
          IS DISTINCT FROM
          (OLD.id, OLD.survivor_id, OLD.merged_id, OLD.reason, OLD.merged_by, OLD.merged_at, OLD.counts, OLD.merged_snapshot) THEN
      RAISE EXCEPTION 'Customer merge history is append-only';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Customer merge history is append-only';
END $$;
DROP TRIGGER IF EXISTS customer_merges_immutable ON customer_merges;
CREATE TRIGGER customer_merges_immutable BEFORE UPDATE OR DELETE ON customer_merges
  FOR EACH ROW EXECUTE FUNCTION reject_customer_merge_history_change();
DROP TRIGGER IF EXISTS customer_merge_moves_immutable ON customer_merge_moves;
CREATE TRIGGER customer_merge_moves_immutable BEFORE UPDATE OR DELETE ON customer_merge_moves
  FOR EACH ROW EXECUTE FUNCTION reject_customer_merge_history_change();

-- 3. Triggers that pin the customer/vehicle of an accepted record are relaxed for ONE case: a merge transaction that
--    set the transaction-local flag garage.customer_merge = 'on' (set_config(..., true)). Every other column stays
--    protected and, outside a merge, behaviour is unchanged.
CREATE OR REPLACE FUNCTION protect_promotion_reservation_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE merging boolean := coalesce(current_setting('garage.customer_merge', true), '') = 'on';
BEGIN
 IF (NEW.environment_id,NEW.quote_id,NEW.quote_revision,NEW.promotion_id,NEW.promotion_version,NEW.qualification_id,
     NEW.allocation_id,NEW.branch_id,
     CASE WHEN merging THEN OLD.beneficiary_id ELSE NEW.beneficiary_id END,
     CASE WHEN merging THEN OLD.vehicle_id ELSE NEW.vehicle_id END,
     NEW.accepted_snapshot,NEW.policy_id,
     NEW.policy_version,NEW.policy_snapshot,NEW.effective_on,NEW.expires_on,NEW.expiry_basis,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM
    (OLD.environment_id,OLD.quote_id,OLD.quote_revision,OLD.promotion_id,OLD.promotion_version,OLD.qualification_id,
     OLD.allocation_id,OLD.branch_id,OLD.beneficiary_id,OLD.vehicle_id,OLD.accepted_snapshot,OLD.policy_id,
     OLD.policy_version,OLD.policy_snapshot,OLD.effective_on,OLD.expires_on,OLD.expiry_basis,OLD.created_by,OLD.created_at)
 THEN RAISE EXCEPTION 'Reservation source is immutable'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION protect_benefit_promise() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE merging boolean := coalesce(current_setting('garage.customer_merge', true), '') = 'on';
BEGIN
  IF (OLD.source_quote_id,OLD.source_revision,OLD.binding_index,OLD.trigger_kind,OLD.benefit_id,OLD.benefit_version,OLD.customer_id,OLD.vehicle_id,OLD.branch_ids,OLD.promise,OLD.responsible_team_id)
     IS DISTINCT FROM
     (NEW.source_quote_id,NEW.source_revision,NEW.binding_index,NEW.trigger_kind,NEW.benefit_id,NEW.benefit_version,
      CASE WHEN merging THEN OLD.customer_id ELSE NEW.customer_id END,
      CASE WHEN merging THEN OLD.vehicle_id ELSE NEW.vehicle_id END,
      NEW.branch_ids,NEW.promise,NEW.responsible_team_id)
  THEN RAISE EXCEPTION 'Accepted benefit promise is immutable'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_invoice_header() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE merging boolean := coalesce(current_setting('garage.customer_merge', true), '') = 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'An issued invoice cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.number IS NOT NULL AND NEW.number IS DISTINCT FROM OLD.number THEN RAISE EXCEPTION 'An invoice number cannot change'; END IF;
  IF OLD.status <> 'draft' AND (NEW.currency IS DISTINCT FROM OLD.currency OR NEW.total_minor IS DISTINCT FROM OLD.total_minor
      OR (NOT merging AND NEW.customer_id IS DISTINCT FROM OLD.customer_id) OR NEW.branch_id IS DISTINCT FROM OLD.branch_id) THEN
    RAISE EXCEPTION 'Money and party fields of an issued invoice cannot change';
  END IF;
  IF OLD.status = 'void' AND NEW.status <> 'void' THEN RAISE EXCEPTION 'A void invoice cannot be reopened'; END IF;
  RETURN NEW;
END $$;
