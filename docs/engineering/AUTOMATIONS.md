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

In the development simulator, handoff and unread state are persisted in the branch inbox and recorded in its event history. They are not push notifications or provider sends. The demo does not run scheduled escalation timers.

## 3.1 Simulated booking and ETA behavior

- Availability checks and final confirmation both use the shared branch capacity rules, including configured weekday closure, drop-off cap, service bay-hours, and bay counts.
- Booking drafts, reschedules, and cancellations do not change booking records until the fictional customer confirmation step is explicitly accepted.
- Simulation bookings reference only fictional development profiles and are marked with the `whatsapp-simulation` source; they cannot be created in production.
- Pickup estimates account for configured service work, active jobs and their stages, bay capacity, working hours, and weekly closure. Show the estimate timestamp and inputs/reason; do not promise an exact pickup time.
- Simulation delivery state is `not-sent`. No customer notification is queued or triggered.

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

## 9. Reminders and follow-ups (implemented, simulated delivery only)

Built on the simulated outbox: a reminder row is the simulated message. **Nothing is delivered to a provider** and the UI says so ("Sent (simulated)"). Code: `apps/server/features/reminders/`; web: Bookings > Follow-ups; migration `0034`.

| Rule | Created | Default lead | Skipped when |
|---|---|---|---|
| `booking_day_before` | confirmed booking, due 09:00 Cairo, 1 day before drop-off (1-7) | 1 day | booking is today or past, cancelled, or moved |
| `booking_morning_of` | due 08:00 Cairo on the drop-off day | fixed | booking past or changed |
| `ready_for_pickup` | job stage `ready`, due when it became ready | fixed | job moved on |
| `warranty_expiry` | active fixed warranty, due 09:00 Cairo, N days before `expires_on` (1-180) | 30 days | lifetime (no expiry), void, expired |
| `quote_followup` | current revision `offered`, not accepted, follow-up not answered or cancelled, N days after it was offered (1-60) | 3 days | quote expired, answered, accepted, superseded or archived |
| `post_service_checkin` | job `delivered`, N days after delivery (1-60), not older than 14 days past due | 7 days | none |

Behaviour:
- **Idempotent.** `runDueReminders(now)` computes candidates, then inserts with `ON CONFLICT (environment_id, dedupe_key) DO NOTHING`; the key is rule + source + date (or quote revision). Run it as often as you like. It only looks at most 36 hours ahead so staff see "Upcoming" items without a flood.
- **Consent.** No active `service` consent for the customer: the row is created as `skipped` with reason `no-consent` (shown in the UI). Consent is checked again when staff press Send now.
- **Language.** The body is rendered once, when generated, in the customer's `preferred_language` from the rule's template for that language.
- **Cancel stale.** Each run cancels open rows whose source changed (reason `source-changed`). Closed rows are never reopened.
- **Auto send.** A rule with `auto_send` marks its due rows `sent-simulated` during the run (still simulated). Default is off: staff press Send now.
- **Snooze** hides a due item for 1-30 days (UI offers 1, 2, 3, 7).

Triggers:
- **Manual:** `POST /api/reminders/run` (owner or branch manager, not demo identities), also the "Check now" button. Returns `{now, generated, skippedNoConsent, autoSent, cancelled, byKind}`.
- **Scheduled (hook for the Replit scheduled task or any timer):** `apps/server/index.ts` is owned by another package and is not edited here. Call the exported function from a small script run on a schedule (hourly is enough):
  ```ts
  // e.g. apps/server/run-reminders.ts (not created: add it when the schedule is agreed)
  import { runDueReminders } from "./features/reminders/reminder-service";
  const summary = await runDueReminders(new Date(), "scheduler");
  console.log(JSON.stringify(summary));
  process.exit(0);
  ```
  Or, inside `index.ts`, `setInterval(() => void runDueReminders(new Date(), "scheduler"), 3_600_000)`. Both are safe to repeat and safe if two instances overlap (the unique key decides).
- **Rules:** `GET /api/reminders/rules` (any `bookings.manage` role), `PUT /api/reminders/rules/:kind` (owner; optimistic `expectedRevision`), `POST /api/reminders/rules/preview`.
- **Queue:** `GET /api/reminders`, `POST /api/reminders/:id/send|skip|snooze` (`bookings.manage`, branch scoped, demo identities read-only).

Not built: real provider sends (provider delivery stays disabled), retries/backoff (nothing is sent), per-customer opt-out beyond consent, working-hours aware send windows, branch-specific rules (rules are per environment).
