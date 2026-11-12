# Garage OS — Acceptance Scenarios

These scenarios define practical outcomes, not a prescribed testing framework. Automate critical scenarios where practical.

## Current meeting-build scope

- Sign-out and unauthenticated API requests do not provide business data.
- An authenticated account without a verified Owner bootstrap or trusted invitation remains pending and receives no workspace data.
- Owner sees all configured branches and can update only the supported Owner settings; changes are persisted, versioned, audited, and used by booking checks.
- Branch Manager access is limited to assigned branches; the role cannot change Owner settings or manage invitations.
- Receptionist can work with customers/bookings in assigned branches but cannot manage Owner settings or staff.
- Technician sees assigned jobs only, receives no customer phone number, and cannot access bookings or settings.
- Booking creation and confirmation enforce configured weekday, daily intake, and bay-hour capacity; concurrent requests are serialized by branch/date.
- Valid job stages and technician assignments persist in PostgreSQL; invalid or out-of-scope updates are rejected.
- An Owner can edit automatic-issuance settings on draft warranty policies; changing policy settings does not alter an existing published version.
- A draft policy cannot issue coverage. An eligible delivered job receives one coverage record from the published policy version, and repeating a delivery transition cannot duplicate it.
- Publishing overlapping automatic policies for the same service is rejected; manual policies are unaffected.
- Expired coverage rejects new claims, and finalized claims reject new evidence uploads.
- Public warranty verification is disabled by default; only the Owner can enable it and approve the customer-visible fields.
- Enabling public verification requires both service and coverage status; settings changes are audited.
- A branch-authorized Owner or Manager can prepare/replace a QR code; replacement invalidates the previous printed code, and only the Owner can revoke it.
- QR tokens are random, stored only as hashes, and returned to staff only when first prepared; public responses never include customer names, contacts, full plates, internal IDs, or notes.
- The staff preview matches the customer page, and the printable card includes the QR code and approved coverage details in Arabic and English.
- Authorized staff can search and filter branch-visible warranty records by active, expired, and void status, with linked customer, vehicle, service, job progress, invoice draft, and QR activity.
- Issuing a real warranty creates one linked invoice draft with its covered service; drafts can be edited and printed, but cannot be finalized or treated as tax invoices.
- Draft tax, payment amount/method, and payment entry actor/time remain clearly provisional until the Owner confirms currency, tax treatment, and the official invoice template.
- QR preparation, print requests, reprints, replacement, and revocation are timestamped and attributed to staff; the audit stores token references, never raw QR values.
- Invalid, revoked, and globally disabled codes return the same generic result; valid expired or void records show only their status and Owner-approved fields.
- Development seed data is fictional, issues no warranty coverage, keeps public verification off, and the application does not send real customer messages.
- `npm run typecheck`, `npm test -- --run`, and `npm run build` are required automated checks. The public landing/sign-in pages are visually reviewed on desktop and mobile; authenticated workspace pages still require a verified Owner account for visual review.
- The health endpoint returns success, and unauthenticated access to protected bootstrap data returns HTTP 401.

The scenarios below describe broader product requirements. Features that remain **On hold** are not claimed as complete or production-ready by this build.

## 1. Access and branch scope
1. A technician assigned to Branch A cannot view Branch B jobs unless explicitly permitted.
2. A receptionist cannot change warranty policy or user permissions.
3. A branch manager sees their branch only by default.
4. Owner can view both branches.
5. Revoking a staff account prevents further access and invalidates active sessions.

## 2. Customer and vehicle records
1. An inbound WhatsApp number matching an existing customer links to that customer.
2. A new number can create a customer without duplicating an existing normalized phone record.
3. Similar names do not cause automatic merging.
4. A customer can have multiple vehicles.
5. Historical jobs remain linked to the customer/vehicle context that existed at the time.

## 3. Shared inbox
1. Inbound messages from each connected reception number appear in one inbox.
2. The source number and branch context remain visible.
3. Two receptionists cannot unknowingly claim the same conversation as separate owners.
4. Internal notes are never sent to customers.
5. Reassignment and resolution are recorded.
6. Unanswered escalation respects branch working hours.
7. A conversation outside the WhatsApp service window cannot send an unauthorized free-form message.

### Development simulator acceptance

1. Owner sees conversations across branches; Branch Manager and Receptionist see only authorized branches; Technician requests are rejected by the API.
2. Conversations, messages, status, unread state, assignment, internal notes, handoffs, and events persist after reload.
3. A second staff member cannot claim an already assigned conversation; a reply or internal note is accepted only from its assigned staff member.
4. Internal notes remain a separate staff-only message kind and are not returned as customer messages.
5. Availability checks reflect the current service catalogue, configured day-off, daily drop-off cap, service bay-hours, and branch bay count.
6. Booking, reschedule, and cancellation drafts leave operational records unchanged until the customer-confirmation action is accepted.
7. A confirmed simulated booking is development-only and references fictional demo customer/vehicle records; production rejects simulation writes.
8. Status lookup with an incorrect reference or verification code returns no booking details; a valid fictional lookup reveals only state, approved milestones, and estimated pickup.
9. Pickup estimates are derived from configured work-hours, service work, bay capacity, queue and job stages, and weekly closures. A changed estimate includes the prior estimate, reason, and calculation time.
10. Handoff, booking changes, and status lookup create fictional inbox events only. No provider call, real customer message, staff-device alert, or real delivery state is generated.
11. Provider readiness remains false until approved business assets, numbers, credentials, templates, consent/message rules, service-window policy, and outage decisions are supplied. Delivery stays disabled.

## 4. Booking and capacity
1. A booking that fits available bay capacity and drop-off cap can be confirmed.
2. A booking that exceeds bay capacity is refused or offered alternatives.
3. A booking that fits bay-hours but exceeds the daily drop-off cap is refused or offered alternatives.
4. Concurrent requests for the final capacity unit cannot both succeed.
5. Rescheduling releases the old reservation and reserves the new one atomically.
6. Manual override requires permission and reason.
7. Expected pickup is recalculated when service or capacity assumptions change, with a visible audit trail.
8. Branch closures and non-working days are respected.

## 5. Workshop lifecycle
1. Confirmed booking can be checked in and converted to a job.
2. Required intake photos prevent completion of intake when missing.
3. A technician can see assigned jobs on phone and tablet.
4. Valid stage transitions succeed and create events.
5. Invalid transitions are rejected.
6. Moving a job backward requires permission, confirmation, and reason.
7. QC pass moves job to Ready.
8. QC fail creates a rework issue and prevents Ready.
9. Delivered jobs cannot be silently edited/reopened.

## 6. Warranty records and claims
1. An Owner can save a draft policy; no coverage is active until the Owner explicitly publishes complete terms.
2. Published terms are immutable; a policy change creates a new version and existing records retain their original version.
3. Automatic coverage is issued exactly once when an eligible job is delivered under one unambiguous Owner-published automatic policy; otherwise, an Owner or branch-authorized Manager can manually issue eligible coverage.
4. Reception can search within assigned branches and open a claim only for active, unexpired coverage.
5. Only the reviewer assigned by that policy version can decide a claim; final decisions require a written resolution.
6. Policy, coverage, and claim actions record the actor and time.
7. Updating a draft policy is Owner-only; a published version and issued coverage retain their original terms.
8. Only open or under-review claims accept evidence attachments.
9. The ledger can be searched and filtered by coverage status without exposing records from another branch.
10. Each issued coverage record links to one editable and printable draft invoice; totals remain pending until line amounts and Owner-approved tax settings are entered.
11. Payment amounts and methods are saved as draft tracking with the recording staff member and time; draft invoices cannot be finalized.
12. QR preparation, print requests, reprints, replacement, and revocation appear in the linked warranty history without storing the raw QR token.

Public QR verification has a development implementation with hashed revocable tokens and an Owner-controlled allowlist. It remains off by default and must not be enabled in production until the Owner approves customer-facing fields and terms and the production privacy review is complete.

## 7. Automations
1. Reminder is scheduled once per booking.
2. Retry does not send duplicate customer messages.
3. A cancelled/rescheduled booking updates or cancels its pending reminder.
4. Owner digest includes the correct branch totals and exceptions.
5. Critical owner alerts do not fire repeatedly for one unresolved incident.
6. Failed scheduled jobs are visible to authorized operators.

## 8. Inventory and payments
1. Inventory adjustment records actor, quantity delta, and reason.
2. Low-stock threshold produces an exception/digest.
3. Payment record updates the job balance consistently.
4. Payment correction creates a reversal/correction trail rather than erasing history.
5. Reports label recorded payments accurately and do not claim to be audited accounting revenue.

## 9. Language and usability
1. Arabic is the default for staff.
2. RTL works in navigation, forms, tables, dialogs, menus, and mobile layouts.
3. English LTR works without broken alignment.
4. Phone numbers, plates, IDs, dates, and currency remain correctly ordered.
5. Technician can identify a vehicle and perform the next action without navigating complex menus.
6. Receptionist can claim a conversation and create a booking without unnecessary steps.

## 10. Reliability and security
1. Invalid webhook signatures are rejected.
2. Duplicate webhook events are processed idempotently.
3. Provider outage does not prevent access to internal jobs/bookings.
4. Private media cannot be accessed without authorization.
5. Backup restore is demonstrated in a non-production environment.
6. Data export produces usable business records.
