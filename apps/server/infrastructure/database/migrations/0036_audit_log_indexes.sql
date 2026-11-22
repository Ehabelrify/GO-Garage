-- Wave 6 (U-C): owner activity log and daily summary. Indexes only; no table, column or data changes.
-- The unified timeline (GET /api/audit) is a UNION ALL over the append-only audit tables ordered by time, and the
-- daily summary filters bookings, customers, warranties, claims and job events by one day. Idempotent; not applied anywhere.
-- Reserved number: 0036. Rollback: DROP INDEX IF EXISTS for each name below.
CREATE INDEX IF NOT EXISTS audit_idx_setting_events_time ON setting_audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_job_events_time ON job_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_job_events_stage_time ON job_events (to_stage, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_warranty_events_time ON warranty_audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_whatsapp_events_time ON whatsapp_conversation_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_policy_audit_time ON commercial_policy_audit (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_catalogue_audit_time ON catalogue_audit (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_quote_audit_time ON quote_audit (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_quote_acceptance_time ON quote_acceptance_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_availability_audit_time ON branch_availability_audit (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_benefit_audit_time ON benefit_audit (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_transport_events_time ON transport_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_reservation_events_time ON promotion_reservation_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_owner_record_time ON owner_record_audit (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_invoice_events_time ON invoice_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_special_request_events_time ON special_request_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_money_events_created ON operational_money_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_idx_bookings_created ON bookings (created_at);
CREATE INDEX IF NOT EXISTS audit_idx_customers_created ON customers (created_at);
CREATE INDEX IF NOT EXISTS audit_idx_warranties_issued ON warranties (issued_at);
CREATE INDEX IF NOT EXISTS audit_idx_warranty_claims_created ON warranty_claims (created_at);
