# Garage OS — Data Model Specification

This is a conceptual model. Adapt naming and normalization to the inspected repository. Use migrations and enforce constraints in PostgreSQL.

## Current implementation slice

The current meeting build persists branches, services, staff memberships, verified Owner bootstrap state, customer/vehicle records, customer-to-branch access, bookings, jobs, job-stage events, operating settings, setting versions, and setting-audit events. Clerk user IDs are the identity reference; the application does not store passwords. The broader entities below remain design references unless a module is explicitly active in the UI.

## Additions of 21 November 2026 (migrations 0026-0030, not yet applied)

- `staff_memberships.status` now allows `invited` (owner pre-approval; placeholder `clerk_user_id` `invited:<uuid>` until the matching Google sign-in claims it), plus `invited_by` and `permissions jsonb` (per-user capability overrides; sanitised on read, owner-only capabilities never overridable).
- `record_archives (entity_kind, entity_id, archived_by, archived_at, reason)`: Owner soft archive for customer, vehicle, quote, reservation, catalogue package/grade, commercial policy and warranty policy. Archived records are hidden from lists and search; immutable version tables are never edited. Restoring deletes the row.
- `owner_record_audit`: append-only trail (archived / restored / deleted, actor, reason, snapshot) enforced by a trigger that rejects UPDATE and DELETE.
- Lookup indexes for relations queries: normalised vehicle plate, reversed customer phone digits, and customer/vehicle indexes on bookings, quote heads, warranties, promotion reservations, benefit entitlements, transport requests and WhatsApp conversations.
- `customer_purchases` (migration 0028): read-only VIEW, one row per accepted quote (label from the accepted package version or service, quantity, `amount_minor` + `currency` from the accepted snapshot, purchase date from the acceptance event, status accepted|delivered) plus one unpriced row per delivered job that had no quote; carries booking, job, warranty and invoice ids resolved from existing keys. No second source of truth. Branch scope and archive filtering are applied by the reading query.
- `special_requests` (0028): free-text custom work for one vehicle (customer, vehicle required; optional branch), `source` staff|customer-app, `status` new|under-review|needs-info|accepted|declined|closed, requested date or range plus time and budget notes. Customer-visible reply columns (`reply_decision`, `reply_message`, `quoted_price_minor` + `quoted_currency`, `duration_days` + `duration_note`, `available_from`, `offer_valid_until`) are separate from internal `owner_notes`, `decided_by`, `decided_at`. Accepting requires price, currency, duration and available-from (CHECK). Nullable `quote_id` is the hook for quote generation. `revision` gives optimistic concurrency.
- `warranty_invoice_drafts.currency` (0029): ISO code of the invoice, default `EGP`, CHECK `^[A-Z]{3}$`. The allowed set (EGP, SAR, USD today) is the single list in `packages/domain/src/currencies.ts` (code, English/Arabic name, symbol, `minorUnitExponent`, order); the server validates against it, rejects line currencies that differ from the invoice, and refuses a currency change once `paid_amount > 0`. Amounts stay `numeric(12,2)` major units on draft invoices; they are never converted.
- `catalogue_package_versions.price_change` (0029): jsonb on an Owner price-edit DRAFT only (`price`, `tax`, `effectiveFrom`, `reason`, the kept or chosen tax rule and work-aggregation rule, and the `previous` price/tax). Publishing writes an approved, activated `catalogue-pricing` policy `catalogue-pricing:<packageId>-v<version>` and a new published version whose `price`/`tax` are the proposed Money (non-negative integer minor units, one supported currency). History stays append-only; published versions are never edited.
- `catalogue_package_versions.kind = 'product'` (0033): a catalogue PRODUCT (part, accessory, care product). Same versioning, publish, retire, archive (`catalogue-package`) and Owner price-edit machinery as a package; `product_category` jsonb `{ar,en}`; `work = []` (no bay time, no occupancy rule, no work aggregation needed); one scope item whose `serviceId` is the placeholder `product`, `productId` = the package id (the stable product id) and `label` = its bilingual name. `vehicle_category_ids`, `vehicle_models` and `branch_ids` are optional filters (an empty category list means every vehicle). Stock is intentionally absent: quantity on hand, reorder level, per-branch stock and movements arrive with the customer app in separate tables keyed by the product id, so quotes never carry stock.
- `whatsapp_conversations` without a customer (0033): `customer_id` and `vehicle_id` are nullable; an operational conversation from an unsaved number has `contact_label` (neutral, "New contact (#<last 4 of hash>)"), `provider_contact_hash` and optionally `contact_phone` (only when the provider event supplied it). Linking (`POST /api/whatsapp/conversations/:id/link`) fills `customer_id`/`vehicle_id`, writes `messaging_contact_links`, sets `customer_label` to the customer's name and clears `contact_phone`. Inbox projections add `linked`, `contactLabel` and `contactPhone?`.
- `intake_requests` (0033): idempotency and audit of `POST /api/intake`, unique per `(actor_id, idempotency_key)`; keeps the request hash, the outcome, the ids it produced, the free-text notes, the chosen items and the replayable response.
- `customer_merges` and `customer_merge_moves` (0035): the record and per-row reversible move log of an owner merge of two customers (survivor, merged-away, reason, 30-day undo). The merged-away customer stays as an archived stub in `record_archives`; append-only histories keep pointing at it and are never rewritten.
- `invoices` (0030): generic invoice for a job. `environment_id`, `branch_id`, `customer_id`, `vehicle_id` required; optional `booking_id`, `job_id`, `quote_id`, `warranty_id`; `source` auto|manual; `idempotency_key` (`job:<jobId>`, unique per environment); `number` (`INV-<branch>-<year>-<5 digits>`, taken at issue, unique); `status` draft|issued|partial|paid|void; one `currency` per invoice (central list, CHECK shape only); `tax_rate_percent` nullable (no approved tax policy); `subtotal_minor`, `discount_minor`, `tax_minor`, `total_minor` (null while unpriced), `paid_minor`; `issue_date`, notes, terms, optimistic `revision`, issue/void actor and time, `void_reason`.
- `invoice_lines` (0030): kind package|service|add-on|transport|fee|other, bilingual description, quantity, `unit_minor` (null = not priced), `discount_minor`, `tax_minor` (null = not confirmed). Editable only while the invoice is a draft (trigger).
- `invoice_events` (0030): append-only history (generated, created, edited, issued, payment-recorded, voided) with optional snapshot; trigger rejects UPDATE and DELETE.
- `invoice_payment_references` (0030): payments recorded as references only (amount, currency, method cash|card|transfer|instapay|other, reference, received date); append-only; unique `(invoice_id, reference)`. Not a finance money event.
- `invoice_number_sequences` (0030): `(branch_id, year) -> last_value`, advanced at issue time inside the issuing transaction, so drafts never consume numbers (a voided invoice keeps its number).
- Finance boundary: the Finance report reads only accepted quotes and `operational_money_events`. Invoices and warranty invoice drafts are NOT sources, so a job invoice and a warranty invoice draft for the same work cannot be double counted. A warranty invoice draft remains a separate warranty-work document; an invoice's `warranty_id` is a link for navigation only.
- `special_request_events`: append-only history (created, review-started, accepted, declined, needs-info, info-added, quote-linked, closed) with trigger rejecting UPDATE/DELETE.
- Dummy data (seed) and its purge plan live in `apps/server/features/seed/`; no schema is added for them. Neither the seed nor the purge has been run.

## 1. Core entities

### Branch
- `id`
- `name_ar`, `name_en`
- `address`
- `timezone`
- `working_calendar_id`
- `is_active`

### User
- `id`
- `name`
- `email` or phone-based login identifier
- `password/auth provider reference`
- `preferred_language`
- `is_active`
- timestamps

### Role / Permission
Roles: Owner, Branch Manager, Receptionist, Technician.
Permissions should be granular enough to control sensitive actions. A role is not a substitute for branch scope.

### UserBranch
Maps users to one or more branches, with assigned role/scope.

### Customer
- `id`
- `display_name`
- `normalized_phone` (unique where business rules allow)
- `phone_display`
- optional email
- preferred language
- consent/preferences metadata
- timestamps

Do not store unnecessary personal data.

### Vehicle
- `id`
- `customer_id`
- plate number (normalized and display forms)
- make/model/year/color where available
- VIN optional and access-restricted
- notes
- timestamps

A vehicle may change owner. Keep historical customer/job relationships; do not rewrite past job ownership.

### Service
- `id`
- code/name in Arabic and English
- category
- active status
- default bay type
- estimated bay-hours
- elapsed lead/cure time rules if applicable
- customer-facing starting price/range optional
- QC checklist template
- warranty template reference
- timestamps

### BranchCapacity
- `branch_id`
- bay type
- bay count
- daily drop-off cap
- operating hours/calendar
- effective date/version

### Booking
- `id`
- branch/customer/vehicle/service references
- requested drop-off time
- confirmed drop-off time
- expected pickup time
- status: pending, confirmed, rescheduled, cancelled, no-show, checked-in
- source: WhatsApp, staff, other
- assigned receptionist
- notes
- capacity reservation reference
- timestamps

### CapacityReservation
- `id`
- booking/job reference
- branch
- bay type
- start/end occupancy interval(s)
- capacity units consumed
- status
- created/released timestamps

Support multiple occupancy intervals for services that do not occupy a bay continuously.

### Job
- `id`
- booking reference (nullable for walk-in if allowed)
- branch/customer/vehicle/service references
- job number
- stage
- expected pickup
- actual received/started/completed/delivered timestamps
- assigned technician(s)
- intake notes
- priority (controlled)
- created/updated timestamps

### JobEvent (append-only)
- `id`
- job_id
- event type
- previous stage / new stage
- actor type and actor ID
- timestamp
- reason
- metadata (validated, no secrets)

### JobChecklist / ChecklistItem
Supports intake, service-specific work steps, and QC. Persist each answer, actor, and timestamp.

### MediaAsset
- `id`
- related entity type/id
- object storage key
- media type
- size
- checksum
- capture/upload timestamp
- uploaded_by
- visibility classification
- metadata

### Conversation
- `id`
- customer reference (nullable until matched)
- WhatsApp source number/account
- branch
- assigned user
- status: open, pending, resolved
- last customer message time
- last staff response time
- SLA/escalation state
- WhatsApp service-window expiry
- timestamps

### Message
- `id`
- conversation_id
- provider message ID (unique when available)
- direction: inbound/outbound
- sender type
- content type
- text/body reference (protected)
- template name if applicable
- delivery state
- sent/delivered/read/failed timestamps
- error code
- created timestamp

### ConversationEvent / InternalNote
Store assignment, status, and internal notes separately from customer messages.

### Warranty
- `id`
- job_id
- vehicle_id
- warranty reference/public token
- service covered
- start/end dates
- terms version
- status
- transferability policy
- created timestamp

Public token must be random and non-sequential. Public lookup must not expose internal IDs.

### InventoryItem
- `id`
- SKU/code
- name Arabic/English
- unit
- reorder level
- active status

### BranchInventory
- branch_id
- item_id
- quantity
- location/bin optional

### InventoryMovement
- item/branch
- movement type
- quantity delta
- reason
- actor
- timestamp
- reference entity

Do not silently change quantities; record adjustments.

### PaymentRecord
- `id`
- job/booking/customer reference
- branch
- amount minor units
- currency
- method
- payment date
- reference/receipt number
- recorded_by
- notes
- reversal/correction reference

Do not treat this as a complete accounting ledger.

### Notification / ScheduledAction
Tracks intended notifications, schedule, recipient, channel, status, attempts, and provider response.

### AuditLog
Append-only record for security-sensitive and operationally important actions.

### Technician job extras (migration 0037)
`job_notes`, `job_checklist_items` (copied from `job_checklist_templates` per service on first view; moving a job to `ready` needs every mandatory item done unless a manager overrides with a reason), `job_photos` (private object storage, never public), `job_issues` (open or resolved, shown to managers as the Issues badge) and `job_audit_events`. All reference `jobs(id)`; access follows `canAccessJob`.

## 2. Relationship overview

- One customer can own or be associated with multiple vehicles over time.
- One vehicle can have many bookings/jobs and warranties.
- One booking may create one job; walk-in jobs may be allowed by permission.
- One job has many JobEvents, checklist answers, and media assets.
- One customer can have many conversations.
- One conversation has many messages and internal events.
- One job can have one or more warranty records depending on service/policy.
- Inventory quantities are derived from recorded movements or maintained with transactional updates plus movement history.
- Payments belong to a job/customer/branch and must be traceable.

## 3. State and integrity rules

- Use explicit enums or lookup tables for controlled states.
- Never rely on free-text stage names.
- Prevent duplicate provider webhook processing with unique provider event/message IDs.
- Prevent invalid transitions in the domain/service layer.
- Ensure all timestamps have timezone semantics.
- Ensure capacity reservation and booking status remain consistent.
- Keep delivered job history immutable except through formal correction/reopen flows.
- Protect warranty public tokens and private customer data.
- Plates (migration 0032): `vehicles.plate` keeps the text as entered (new rows are stored in canonical display form, e.g. `ا ب ج 1234`; seeded values are unchanged). Comparison and lookup always use the key `garage_normalize_plate(plate)` (= `normalizePlate()` in `@garage/domain`): ASCII digits, unified Arabic letter variants, no spaces/dashes/tatweel, letters then digits, typed letter order kept (Latin is not transliterated). Search also tries the reversed letter order; duplicate detection does not. Index `vehicles_plate_key_idx` (non-unique); a second vehicle with the same key for the same customer or in a shared branch is refused by the API (409 `DUPLICATE_PLATE`).

## Reminders and follow-ups (migration 0034, not yet applied)

- `reminder_rules (environment_id, kind)`: one row per rule kind (`booking_day_before`, `booking_morning_of`, `ready_for_pickup`, `warranty_expiry`, `quote_followup`, `post_service_checkin`) with `enabled`, `lead_days`, `auto_send`, `template_en`, `template_ar` (placeholders such as `{name}`, `{plate}`, `{branch}`, `{service}`, `{date}`, `{time}`, `{expiry}`) and `revision`. A missing row means the code default in `reminder-logic.ts`.
- `reminders`: the simulated outbox queue. `(environment_id, dedupe_key)` is unique, where the key is rule kind plus source id plus the source date or quote revision, so a run never duplicates a reminder and a rescheduled booking or new quote revision gets a fresh one. Status `due` becomes `sent-simulated`, `skipped` (reason `no-consent` or `staff-skipped`) or `cancelled` (reason `source-changed`); closed rows are never reopened. Consent is the active `messaging_customer_consents` row with purpose `service`. A lifetime warranty (no `expires_on`) never produces an alert.
- `reminder_events`: who generated, sent (simulated), skipped, snoozed or cancelled each reminder.

## Owner activity log and daily summary (migration 0036, read-only; not yet applied)

No new tables. `GET /api/audit` reads one UNION ALL over the existing append-only history (`setting_audit_events`, `warranty_verification_settings_audit`, `commercial_policy_audit`, `catalogue_audit`, `quote_audit`, `quote_acceptance_events`, `warranty_audit_events`, `warranty_qr_print_events`, `whatsapp_conversation_events`, `job_events`, `job_audit_events`, `owner_record_audit`, `branch_availability_audit`, `invoice_events`, `special_request_events`, `benefit_audit`, `transport_events`, `promotion_reservation_events`, `customer_merges`, `operational_money_events` and reversals, `messaging_customer_consent_events`, `messaging_inbox_access_audit`) normalised to a table-prefixed unique id, time, kind, action, actor, record type and id, branch, detail, before and after, and an extra JSON. Keyset paging on `(occurred_at, uid)`. The daily summary (`GET /api/reports/daily-summary`) counts from bookings, job events, customers, warranties, claims, quote history, special requests and WhatsApp conversations, and sums operational money events (reversed ones excluded) and invoice payment references per currency, never across currencies. Not audited by the product today: staff invitations and permission edits, sign-ins, simulated reminders.
