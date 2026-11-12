# Garage OS — WhatsApp and Shared Inbox Specification

## 1. Purpose

WhatsApp is the primary customer-facing channel. Customers should be able to enquire, learn about services, request bookings, check supported job status, reschedule/cancel, and request a human agent. Staff should manage conversations from Garage OS rather than switching between several reception phones.

## 2. Provider and setup

Use the official WhatsApp Business Platform / Cloud API unless a justified provider alternative is approved.

Before live use:
- Confirm ownership and admin access to Go Stores Meta Business assets.
- Confirm which reception numbers are used and which branch each serves.
- Verify business/account eligibility and number registration requirements.
- Review current Meta rules for number migration and WhatsApp Business App coexistence; do not assume coexistence is available.
- Configure webhook endpoint, verification token, app secret validation, and subscriptions.
- Create and obtain approval for required message templates.
- Document fallback and cutover plan for each number.
- Test inbound, outbound, delivery status, and provider failure cases.

Never promise that an existing app-based number can be moved or used in coexistence until confirmed against current Meta rules and the actual account.

## 3. Unified inbox

The inbox consolidates all connected reception numbers. Every conversation must preserve:
- Source phone number / WhatsApp business number.
- Branch routing context.
- Customer identity match and confidence.
- Assigned staff member.
- Conversation status.
- Last inbound/outbound activity.
- Unanswered timer.
- WhatsApp 24-hour customer-service window status.
- Related booking, vehicle, and job.

### Ownership
- Every human-handled conversation has one accountable owner.
- “Claim conversation” is a one-tap action.
- Reassignment requires a recorded event.
- Prevent conflicting simultaneous assignment/replies where possible.
- Staff can mark themselves unavailable/off-shift.
- Unassigned conversations remain visible to the branch team.

### Status
- Open: needs action.
- Pending: waiting for customer or another internal action.
- Resolved: no current action required.
Reopening a resolved conversation creates a visible event.

### Internal notes
Internal notes must never be sent to the customer and must be visually distinct from messages.

## 4. Response escalation proposal

All thresholds are **[ASSUMED]** and configurable.

| Elapsed unanswered time | Action | Audience |
|---|---|---|
| 0 min | Appears in assigned team queue | Assigned agents |
| 5 min | Visual amber highlight | Branch reception team |
| 10 min | Push/in-app alert: unclaimed or unanswered chat | Reception team |
| 20 min | Escalate | Branch manager |
| 60 min | Persistent dashboard exception | Branch manager |

Timer rules:
- Starts from the customer's latest inbound message when human action is required.
- Pauses when a staff reply is sent.
- Working-hours calendar controls escalation; outside working hours, show the next opening time and bot options.
- Owner is not notified for ordinary unanswered chats. Only serious unresolved exceptions should reach the owner.

## 5. WhatsApp customer-service window

The UI must show the service-window state and time remaining. Follow current WhatsApp policy: free-form replies are generally restricted outside the customer-service window and approved templates may be required. Implement provider error handling and policy checks rather than relying only on a UI timer.

Do not send a template unless it is approved and configured for the relevant language and use case.

## 6. Bot intents and journeys

### Main menu
Offer simple choices:
- Book a service.
- Ask about a service or starting price.
- Check booking/job status.
- Reschedule or cancel.
- Talk to a person.

Support Arabic and English, including language detection with a simple explicit language switch. Do not trap customers in a bot loop; “talk to a person” must always be available.

### Service enquiry
- Ask which service the customer is interested in.
- Explain only owner-approved service descriptions.
- Show starting price ranges only when configured and marked as estimates.
- State that final price may require vehicle inspection.
- Offer human assistance.

### Booking
Collect minimum required information:
- Branch (if multiple branches can perform the service).
- Service.
- Vehicle make/model and plate (only if needed for booking).
- Preferred drop-off date/time.
- Customer confirmation.

Check capacity before offering confirmation. Present a small number of feasible alternatives. Do not promise exact pickup until the capacity model can support it; clearly label it as expected.

### Status enquiry
Authenticate/match safely using the WhatsApp phone number and a secondary verification detail where needed. Do not disclose detailed vehicle or financial data to an unverified person. Return only approved status wording.

### Reschedule/cancel
- Confirm the booking being changed.
- Check new capacity for reschedule.
- Apply cancellation cutoff policy only after owner approval.
- Record source and reason.
- Notify staff and update reservation atomically.

### Human handoff
- Create or reopen a conversation.
- Assign to branch queue.
- Send acknowledgement.
- Provide expected response guidance based on working hours.
- Preserve the full conversation context.

## 7. Customer notification policy

Proposed notifications, subject to owner approval:
- Booking confirmation.
- Reminder one day before drop-off.
- Received.
- Ready for pickup.
- Delivered / warranty information.

Keep notifications useful and limited. Avoid messaging customers for every internal stage change.

## 8. Message delivery lifecycle

Track provider-supported states such as:
- queued
- accepted/sent
- delivered
- read
- failed

Do not mark a message as sent merely because it was placed in an internal queue. Keep provider message IDs and failure reasons. Retry transient failures safely; do not duplicate messages.

## 9. Development and fallback mode

If credentials are unavailable:
- Provide a labelled simulator for inbound/outbound messages.
- Keep simulator messages and state visibly separate from real customer activity; no provider requests or external notifications may be triggered.
- Display “Simulation — not connected to WhatsApp” clearly.
- Keep integration status visible to authorized managers.
- Never show simulated delivery as real customer delivery.

The current meeting build has a persisted development-only simulated inbox. Its records are explicitly marked as simulation data, branch-scoped, and stored separately from provider messages. Simulated bookings use fictional sample profiles and the same server-side availability/capacity rules as Garage OS. Confirmation, rescheduling, and cancellation require an explicit simulated customer confirmation; no provider requests, real customer messages, or staff-device alerts are made.

Live WhatsApp delivery is disabled in every environment until the Owner supplies and approves all of the following:
- Go Stores Meta Business ownership/admin access and verified business assets.
- Approved reception numbers, branch routing, and number migration/coexistence decisions.
- Server-side credentials and webhook verification configuration.
- Approved message templates for every supported language and use case.
- Customer opt-in/consent, message wording, customer-service-window, retention, and fallback rules.
- A documented outage/cutover plan and successful acceptance testing.

The readiness endpoint reports these inputs as not ready and `deliveryEnabled` remains false. Do not turn on sending by changing a UI setting. Before any live implementation, enforce webhook signature validation, provider-event idempotency, explicit queued/accepted/delivered/read/failed states, bounded retry with duplicate protection, and the customer-service window on the server. Keep provider messages distinct from simulation records.

Pickup times in simulation are estimates, not promises. They use configured service bay-hours, branch work-hours and bay counts, active jobs' stages, current queue load, and weekly closure. The timestamp and the reason are shown when the estimate is calculated; internal job notes are not returned by customer status lookup. Status lookup requires the fictional booking reference and a secondary code and reveals only the booking state, approved milestone labels, and estimated pickup.

During a real provider outage:
- Keep all internal jobs and bookings accessible.
- Show WhatsApp outage status.
- Queue safe outbound messages only where policy and expiry permit.
- Give staff a documented manual fallback.
