# Garage OS — Acceptance Scenarios

These scenarios define practical outcomes, not a prescribed testing framework. Automate critical scenarios where practical.

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

## 6. Warranty and QR
1. Delivered eligible job creates a warranty record using the approved terms version.
2. QR opens the correct public warranty page.
3. Public page does not reveal customer name, phone, full plate, internal notes, or financial data.
4. Invalid/expired/revoked tokens do not reveal private information.
5. Warranty changes are audited.

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
