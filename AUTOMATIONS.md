# Garage OS — Automations and Notification Rules

All thresholds and timings marked **[ASSUMED]** must be configurable and owner-approved.

## 1. Booking automations

### Confirmation
Trigger: booking capacity successfully reserved and customer confirms.
Actions:
- Mark booking confirmed.
- Send confirmation through WhatsApp.
- Include branch, drop-off date/time, service, and expected pickup estimate.
- Record message status.

### Reminder
Trigger: one day before drop-off **[ASSUMED]**.
Message includes:
- Booking details.
- Confirm attendance.
- Reschedule.
- Cancel.
If no response, flag the booking for reception; do not automatically cancel unless the owner approves that policy.

### No-show
If drop-off time passes and vehicle is not checked in:
- Flag booking as at risk.
- Notify reception.
- Staff confirms No-show with reason.
Do not auto-mark No-show based solely on elapsed time.

## 2. Capacity and delay automations

- Recalculate expected pickup when booking/service/capacity changes.
- Warn reception before confirming a booking that exceeds capacity.
- Notify branch manager when a job is likely to miss expected pickup.
- Escalate a job overdue by more than one day **[ASSUMED]**.
- Manual capacity override requires permission, reason, and audit event.
- Notify affected customers if a pickup estimate changes, after staff review or according to an approved rule.

## 3. Conversation automations

Proposed escalation ladder:
- 5 minutes: visual amber highlight.
- 10 minutes: reception alert.
- 20 minutes: branch manager escalation.
- 60 minutes: persistent manager dashboard flag.

Rules:
- Working-hours aware.
- Avoid repeated notifications for the same unresolved event.
- Escalate only if no staff response/claim has resolved the condition.
- Owner receives only serious unresolved complaints or critical service disruptions.

## 4. Job lifecycle notifications

Customer-facing notifications should be limited to:
- Received.
- Ready.
- Delivered.

Optional additional notifications must be owner-approved. Internal staff receive operational alerts for assignment, QC failure, and delays.

## 5. Intake and QC controls

- Require four intake photos before the vehicle can be marked Received **[ASSUMED]**.
- If photo upload fails, clearly show that intake is incomplete; do not silently bypass.
- QC checklist must be completed before Ready.
- QC failure creates a rework/issue record and alerts the responsible manager/technician.
- Override requires permission and reason.

## 6. Owner critical alerts

Owner notifications should be rare and meaningful. Initial critical events:
1. WhatsApp number disconnected, account flagged, or sending health critically degraded.
2. Application or core service unavailable.
3. Serious complaint remains unresolved for 24 hours **[ASSUMED]** after manager escalation.
4. Job overdue by more than one day **[ASSUMED]**, where the manager has not resolved or acknowledged it.

Low stock belongs in a daily digest, not an urgent push, unless the owner configures a critical item threshold.

## 7. Owner daily digest

Proposed evening WhatsApp digest **[ASSUMED]**:
- Vehicles received today.
- Vehicles delivered today.
- Active jobs and overdue jobs.
- Tomorrow's confirmed drop-offs and expected pickups.
- Unanswered/escalated conversations.
- Payments recorded today (clearly labelled as recorded payments, not audited revenue).
- Low-stock exceptions.
- Integration/system health if there was an incident.

Digest must be concise, branch-comparable, and link to the relevant internal dashboard where possible. Do not include sensitive customer information.

## 8. Automation reliability

- Store each scheduled action with state and timestamps.
- Use idempotency keys.
- Prevent duplicate reminders and duplicate escalation alerts.
- Retry transient provider failures with bounded backoff.
- Surface permanent failures to authorized staff.
- Support pause/resume for individual automation types.
- Provide an audit trail of configuration changes.
- Provide a manual retry action for authorized users.
