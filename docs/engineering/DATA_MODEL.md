# Garage OS — Data Model Specification

This is a conceptual model. Adapt naming and normalization to the inspected repository. Use migrations and enforce constraints in PostgreSQL.

## Current implementation slice

The current meeting build persists branches, services, staff memberships, verified Owner bootstrap state, customer/vehicle records, customer-to-branch access, bookings, jobs, job-stage events, operating settings, setting versions, and setting-audit events. Clerk user IDs are the identity reference; the application does not store passwords. The broader entities below remain design references unless a module is explicitly active in the UI.

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
