import { SEED_REASON } from "./seed-core";

/** Pure purge plan (no database access) so it can be unit tested. */
const SEEDED_CUSTOMERS = "(SELECT id FROM customers WHERE id LIKE 'seed-cust-%' OR id IN ('customer-sample-1','customer-sample-2','customer-sample-3'))";
const BOOKINGS = `(SELECT id FROM bookings WHERE customer_id IN ${SEEDED_CUSTOMERS})`;
const JOBS = `(SELECT id FROM jobs WHERE booking_id IN ${BOOKINGS})`;
const WARRANTIES = `(SELECT id FROM warranties WHERE customer_id IN ${SEEDED_CUSTOMERS})`;
const CLAIMS = `(SELECT id FROM warranty_claims WHERE warranty_id IN ${WARRANTIES})`;
const CONVERSATIONS = `(SELECT id FROM whatsapp_conversations WHERE customer_id IN ${SEEDED_CUSTOMERS} OR id LIKE 'seed-wa-new-%')`;
const QUOTES = `(SELECT id FROM quote_heads WHERE customer_id IN ${SEEDED_CUSTOMERS})`;
const RESERVATIONS = `(SELECT id FROM promotion_reservations WHERE beneficiary_id IN ${SEEDED_CUSTOMERS})`;
const ALLOCATIONS = `(SELECT id FROM promotion_allocations WHERE beneficiary_id IN ${SEEDED_CUSTOMERS})`;
const QUALIFICATIONS = `(SELECT id FROM promotion_qualifications WHERE beneficiary_id IN ${SEEDED_CUSTOMERS})`;
const VERIFICATIONS = `(SELECT id FROM promotion_membership_verifications WHERE beneficiary_id IN ${SEEDED_CUSTOMERS})`;
const ENTITLEMENTS = `(SELECT id FROM benefit_entitlements WHERE customer_id IN ${SEEDED_CUSTOMERS} OR id LIKE 'seed-ben-%')`;
const REDEMPTIONS = `(SELECT id FROM benefit_redemptions WHERE entitlement_id IN ${ENTITLEMENTS})`;
const MONEY = `(SELECT id FROM operational_money_events WHERE customer_id IN ${SEEDED_CUSTOMERS} OR id LIKE 'seed-mev-%')`;
const TRANSPORT = `(SELECT id FROM transport_requests WHERE customer_id IN ${SEEDED_CUSTOMERS})`;
const INVOICES = `(SELECT id FROM invoices WHERE customer_id IN ${SEEDED_CUSTOMERS} OR id LIKE 'seed-inv-%')`;
const REQUESTS = `(SELECT id FROM special_requests WHERE customer_id IN ${SEEDED_CUSTOMERS} OR id LIKE 'seed-sr-%')`;
const SEED_POLICY_VERSIONS = `(SELECT policy_id, version FROM commercial_policy_versions WHERE reason = '${SEED_REASON}')`;
const SEED_AVAILABILITY = `(SELECT branch_id, version FROM branch_availability_versions WHERE reason = '${SEED_REASON}')`;
const SEED_WARRANTY_POLICIES = "(policy_id LIKE 'seed-wp-%' OR policy_id LIKE 'sample-auto-warranty-%' OR policy_id = 'demo-warranty-outline')";

export interface Step { label: string; table: string; where: string; optional?: boolean }

/** Child-first order. Immutable-history triggers are disabled only for the duration of the transaction. */
export function buildSteps(options: { keepDemoAccounts: boolean }): Step[] {
  const steps: Step[] = [
    { label: "Invoice payment reversals", table: "invoice_payment_reversals", where: `invoice_id IN ${INVOICES}` },
    { label: "Invoice refunds", table: "invoice_refunds", where: `invoice_id IN ${INVOICES}` },
    { label: "Invoice payment references", table: "invoice_payment_references", where: `invoice_id IN ${INVOICES}` },
    { label: "Invoice history", table: "invoice_events", where: `invoice_id IN ${INVOICES}` },
    { label: "Invoice lines", table: "invoice_lines", where: `invoice_id IN ${INVOICES}` },
    { label: "Invoices", table: "invoices", where: `id IN ${INVOICES}` },
    { label: "Invoice number counters (only when no invoice remains for that branch and year)", table: "invoice_number_sequences", where: "NOT EXISTS (SELECT 1 FROM invoices i WHERE i.branch_id = invoice_number_sequences.branch_id AND extract(year FROM i.issue_date)::int = invoice_number_sequences.year)" },
    { label: "Quick intake requests", table: "intake_requests", where: `customer_id IN ${SEEDED_CUSTOMERS}`, optional: true },
    { label: "Special request history", table: "special_request_events", where: `request_id IN ${REQUESTS}` },
    { label: "Special requests", table: "special_requests", where: `id IN ${REQUESTS}` },
    { label: "WhatsApp outbox", table: "messaging_outbox", where: `conversation_id IN ${CONVERSATIONS}` },
    { label: "WhatsApp booking drafts", table: "whatsapp_booking_drafts", where: `conversation_id IN ${CONVERSATIONS}` },
    { label: "WhatsApp conversation events", table: "whatsapp_conversation_events", where: `conversation_id IN ${CONVERSATIONS}` },
    { label: "WhatsApp messages", table: "whatsapp_messages", where: `conversation_id IN ${CONVERSATIONS}` },
    { label: "WhatsApp conversations", table: "whatsapp_conversations", where: `customer_id IN ${SEEDED_CUSTOMERS} OR id LIKE 'seed-wa-new-%'` },
    { label: "Messaging contact links", table: "messaging_contact_links", where: `customer_id IN ${SEEDED_CUSTOMERS}` },
    { label: "Consent events", table: "messaging_customer_consent_events", where: `customer_id IN ${SEEDED_CUSTOMERS}` },
    { label: "Consents", table: "messaging_customer_consents", where: `customer_id IN ${SEEDED_CUSTOMERS}` },
    { label: "Money event reversals", table: "operational_money_event_reversals", where: `event_id IN ${MONEY}` },
    { label: "Money events", table: "operational_money_events", where: `id IN ${MONEY}` },
    { label: "Benefit reversals", table: "benefit_reversals", where: `redemption_id IN ${REDEMPTIONS}` },
    { label: "Benefit redemptions", table: "benefit_redemptions", where: `entitlement_id IN ${ENTITLEMENTS}` },
    { label: "Benefit windows", table: "benefit_windows", where: `entitlement_id IN ${ENTITLEMENTS}` },
    { label: "Benefit audit", table: "benefit_audit", where: `entitlement_id IN ${ENTITLEMENTS}` },
    { label: "Benefit entitlements", table: "benefit_entitlements", where: `id IN ${ENTITLEMENTS}` },
    { label: "Transport events", table: "transport_events", where: `transport_id IN ${TRANSPORT}` },
    { label: "Transport private contacts", table: "transport_private_contacts", where: `transport_id IN ${TRANSPORT}` },
    { label: "Transport requests", table: "transport_requests", where: `id IN ${TRANSPORT}` },
    { label: "Warranty QR print events", table: "warranty_qr_print_events", where: `warranty_id IN ${WARRANTIES}` },
    { label: "Warranty verification tokens", table: "warranty_verification_tokens", where: `warranty_id IN ${WARRANTIES}` },
    { label: "Warranty claim attachments", table: "warranty_claim_attachments", where: `claim_id IN ${CLAIMS}` },
    { label: "Warranty audit events", table: "warranty_audit_events", where: `warranty_id IN ${WARRANTIES} OR claim_id IN ${CLAIMS} OR ${SEED_WARRANTY_POLICIES}` },
    { label: "Warranty claims", table: "warranty_claims", where: `warranty_id IN ${WARRANTIES}` },
    { label: "Warranty invoice items", table: "warranty_invoice_draft_items", where: `invoice_id IN (SELECT id FROM warranty_invoice_drafts WHERE warranty_id IN ${WARRANTIES})` },
    { label: "Warranty invoices", table: "warranty_invoice_drafts", where: `warranty_id IN ${WARRANTIES}` },
    { label: "Warranty termination events", table: "warranty_termination_events", where: `warranty_id IN ${WARRANTIES}` },
    { label: "Warranty issuance requests", table: "warranty_issuance_requests", where: `warranty_id IN ${WARRANTIES}` },
    { label: "Warranties", table: "warranties", where: `id IN ${WARRANTIES}` },
    { label: "Warranty verification settings audit", table: "warranty_verification_settings_audit", where: "id LIKE 'seed-%'" },
    { label: "Reservation allocation events", table: "promotion_reservation_allocation_events", where: `reservation_id IN ${RESERVATIONS}` },
    { label: "Reservation deposit events", table: "promotion_reservation_deposit_events", where: `reservation_id IN ${RESERVATIONS}` },
    { label: "Reservation events", table: "promotion_reservation_events", where: `reservation_id IN ${RESERVATIONS}` },
    { label: "Promotion reservations", table: "promotion_reservations", where: `id IN ${RESERVATIONS}` },
    { label: "Promotion evidence consumption", table: "promotion_evidence_consumption", where: `qualification_id IN ${QUALIFICATIONS}` },
    { label: "Promotion allocation events", table: "promotion_allocation_events", where: `allocation_id IN ${ALLOCATIONS}` },
    { label: "Promotion allocations", table: "promotion_allocations", where: `id IN ${ALLOCATIONS}` },
    { label: "Promotion evidence", table: "promotion_evidence", where: `qualification_id IN ${QUALIFICATIONS}` },
    { label: "Promotion qualifications", table: "promotion_qualifications", where: `id IN ${QUALIFICATIONS}` },
    { label: "Membership verification events", table: "promotion_membership_verification_events", where: `verification_id IN ${VERIFICATIONS}` },
    { label: "Membership verifications", table: "promotion_membership_verifications", where: `id IN ${VERIFICATIONS}` },
    { label: "Promotion pools", table: "promotion_pools", where: "promotion_id LIKE 'promotion-qualification:seed-%'" },
    { label: "Pickup commitments", table: "pickup_commitments", where: `booking_id IN ${BOOKINGS}` },
    { label: "Booking occupancy", table: "booking_occupancy", where: `booking_id IN ${BOOKINGS}` },
    { label: "Job work components", table: "job_work_components", where: `job_id IN ${JOBS}` },
    { label: "Booking work components", table: "booking_work_components", where: `booking_id IN ${BOOKINGS}` },
    { label: "Job events", table: "job_events", where: `job_id IN ${JOBS}` },
    { label: "Booking idempotency", table: "booking_idempotency", where: `booking_id IN ${BOOKINGS}` },
    { label: "Booking change idempotency", table: "booking_change_idempotency", where: `booking_id IN ${BOOKINGS}` },
    { label: "Jobs", table: "jobs", where: `id IN ${JOBS}` },
    { label: "Bookings", table: "bookings", where: `id IN ${BOOKINGS}` },
    { label: "Quote customer confirmations", table: "quote_customer_confirmations", where: `quote_id IN ${QUOTES}` },
    { label: "Quote acceptance events", table: "quote_acceptance_events", where: `quote_id IN ${QUOTES}` },
    { label: "Quote follow-ups", table: "quote_followups", where: `quote_id IN ${QUOTES}` },
    { label: "Quote audit", table: "quote_audit", where: `quote_id IN ${QUOTES}` },
    { label: "Quote versions", table: "quote_versions", where: `quote_id IN ${QUOTES}` },
    { label: "Quote heads", table: "quote_heads", where: `id IN ${QUOTES}` },
    { label: "Customer branch links", table: "customer_branches", where: `customer_id IN ${SEEDED_CUSTOMERS}` },
    { label: "Vehicles", table: "vehicles", where: `customer_id IN ${SEEDED_CUSTOMERS}` },
    { label: "Customers", table: "customers", where: `id IN ${SEEDED_CUSTOMERS}` },
    { label: "Catalogue audit", table: "catalogue_audit", where: "entity_id LIKE 'seed-%'" },
    { label: "Catalogue package pointers", table: "catalogue_package_active", where: "package_id LIKE 'seed-pkg-%'" },
    { label: "Catalogue package versions", table: "catalogue_package_versions", where: "package_id LIKE 'seed-pkg-%'" },
    { label: "Catalogue grade pointers", table: "catalogue_grade_active", where: "grade_id LIKE 'seed-grade-%'" },
    { label: "Catalogue grade versions", table: "catalogue_grade_versions", where: "grade_id LIKE 'seed-grade-%'" },
    { label: "Vehicle categories", table: "catalogue_vehicle_categories", where: "id LIKE 'seed-cat-%'" },
    { label: "Finance attestations", table: "finance_definition_attestations", where: "definition_id LIKE 'finance-definition:seed-%'" },
    { label: "Commercial policy audit", table: "commercial_policy_audit", where: `(policy_id, version) IN ${SEED_POLICY_VERSIONS}` },
    { label: "Commercial policy pointers", table: "commercial_policy_active", where: `(policy_id, version) IN ${SEED_POLICY_VERSIONS}` },
    { label: "Commercial policy versions", table: "commercial_policy_versions", where: `reason = '${SEED_REASON}'` },
    { label: "Branch availability audit", table: "branch_availability_audit", where: "id LIKE 'seed-bav-%'" },
    { label: "Branch availability closures", table: "branch_availability_closures", where: `(branch_id, version) IN ${SEED_AVAILABILITY}` },
    { label: "Branch availability pointers", table: "branch_availability_active", where: `(branch_id, version) IN ${SEED_AVAILABILITY}` },
    { label: "Branch availability versions", table: "branch_availability_versions", where: `reason = '${SEED_REASON}'` },
    { label: "Warranty policies", table: "warranty_policies", where: SEED_WARRANTY_POLICIES },
    { label: "Messaging delivery policies", table: "messaging_delivery_policies", where: "channel_id = 'seed-channel-simulation'" },
    { label: "Inbox access audit", table: "messaging_inbox_access_audit", where: "id LIKE 'seed-mia-%'" },
    { label: "Inbox memberships", table: "messaging_inbox_memberships", where: `staff_user_id LIKE 'seed-%'${options.keepDemoAccounts ? "" : " OR staff_user_id LIKE 'demo-%'"}`, optional: true },
    { label: "Messaging channel", table: "messaging_channels", where: "id = 'seed-channel-simulation'" },
    { label: "Seed services", table: "services", where: "id LIKE 'seed-svc-%'", optional: true },
    { label: "Legacy sample services (when unreferenced)", table: "services", where: `id IN ('inspection','tint','audio','ceramic','full-ppf') AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.service_id = services.id) AND NOT EXISTS (SELECT 1 FROM warranties w WHERE w.service_id = services.id) AND NOT EXISTS (SELECT 1 FROM booking_work_components c WHERE c.service_id = services.id)`, optional: true },
    { label: "Seed staff accounts (when unreferenced)", table: "staff_memberships", where: `clerk_user_id LIKE 'seed-%'${options.keepDemoAccounts ? "" : " OR clerk_user_id LIKE 'demo-%'"}`, optional: true },
  ];
  return steps;
}

const MAGIC = "yes";

export interface PurgeArgs { execute: boolean; keepDemoAccounts: boolean }

export function parseArgs(argv: string[]): PurgeArgs {
  return { execute: argv.includes("--execute"), keepDemoAccounts: argv.includes("--keep-demo-accounts") };
}

export function purgeGate(args: PurgeArgs, env: NodeJS.ProcessEnv): { mode: "dry-run" | "execute"; reason: string } {
  if (!args.execute) return { mode: "dry-run", reason: "No --execute flag; listing counts only." };
  if (env.GARAGE_CONFIRM_PURGE !== MAGIC) return { mode: "dry-run", reason: "--execute needs GARAGE_CONFIRM_PURGE=yes as well; listing counts only." };
  return { mode: "execute", reason: "Both safeguards present." };
}
