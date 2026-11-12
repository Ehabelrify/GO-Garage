# Garage OS — Architecture Specification

## 1. Architecture approach

The current meeting build uses a TypeScript React/Vite client, an Express API, PostgreSQL as the system of record, and Clerk for authentication. The API enforces membership, role, branch, and assigned-job access. Browser storage is limited to the language preference; customer and operational records are loaded from PostgreSQL.

This is a deliberately narrow operating application, not the complete PRD. It is not yet configured for production deployment, backups, file storage, scheduled workers, or customer messaging. Keep future modules isolated and inactive until their workflows and integrations are implemented.

## 2. Logical modules

Provide an authenticated **Owner Settings** page for real operating configuration. The current active settings cover booking confirmation, daily drop-offs, operating hours, bay counts, the weekly day off, and the implemented service durations. Validate changes on the server, apply them to booking-capacity behavior, and record setting history. Do not present illustrative options as owner approvals.

1. Identity and access
2. Branches and staff
3. Customers and vehicles
4. Service catalogue and capacity
5. Bookings and scheduling
6. Jobs and workshop workflow
7. Media and documents
8. WhatsApp integration and shared inbox
9. Warranty
10. Inventory
11. Payments/receipts
12. Notifications and automation
13. Reporting and owner dashboard
14. Audit and system operations

Modules should have clear boundaries and avoid circular dependencies.

### Configuration architecture

Model configuration by domain rather than one untyped JSON settings blob. Use typed settings or versioned domain records for at least: branch calendars and hours; services and service eligibility; pricing and quotation rules; capacity resources and service occupancy; booking/deposit/cancellation rules; job workflow and QC; technician assignment; WhatsApp routing/templates/bot permissions; warranty templates; inventory policy; payment methods/approval thresholds; roles and branch scopes; automation rules; notification preferences; reporting/KPI definitions.

Each configurable policy should support, as applicable: business/branch scope, value and validation schema, status (`proposed`, `draft`, `approved`, `active`, `retired`), effective-from/to, version, created/updated/approved by, approval timestamp, and audit/change reason. Support inherited business defaults and explicit branch overrides. Use immutable versions for rules that affect historical customer or financial records. Provide preview and impact summary before activation.

For the current build, only the eight implemented operating settings are editable. Other policies are visibly marked **On hold** without active controls. Settings save immediately and create an audit entry; a draft/approval workflow is not part of this application.

Do not make security controls, audit integrity, authorization enforcement, or privacy protections optional settings.

## 3. Data and persistence

- PostgreSQL is the authoritative data store.
- Use migrations for every schema change.
- Use foreign keys, unique constraints, indexes, and transactions where appropriate.
- Store timestamps in UTC and render in the configured branch/business timezone.
- Store money as integer minor units (or a carefully defined decimal strategy), with currency code.
- Normalize phone numbers to a canonical international format; preserve the display form separately if needed.
- Store uploaded files in object storage, not as database blobs. Keep metadata and access controls in the database.
- Soft deletion may be appropriate for business records, but never silently erase financial/audit history.
- Design data export and backup/restore from the start.

## 4. Background processing

Use a reliable job queue or equivalent for:
- WhatsApp outbound messages and retries.
- Booking reminders.
- Escalation timers.
- Owner daily digest.
- Job delay checks.
- Warranty expiry notifications if enabled.
- PDF generation and media processing where needed.

Requirements:
- Idempotency keys for jobs and webhook events.
- Retry with bounded exponential backoff for transient errors.
- Dead-letter/failure visibility and an operator retry path.
- Avoid duplicate customer messages after retries.
- Store scheduled job state and delivery result.
- A failed background worker must not corrupt booking/job records.

## 5. WhatsApp integration boundary

Create a provider adapter so internal application logic is not tightly coupled to one transport implementation. The adapter should support:
- Webhook verification and inbound events.
- Message normalization.
- Outbound text and approved template messages.
- Delivery status updates.
- Provider error mapping.
- Number/account health status.

A development simulator may be used before Meta credentials exist, but it must be visibly labelled and must not be confused with live WhatsApp.

## 6. API and validation

- Validate all incoming data on the server.
- Enforce authorization at the API/service layer, not only in the UI.
- Use consistent error shapes and stable error codes.
- Apply pagination and filtering to lists.
- Protect against duplicate submissions and race conditions.
- Use database transactions for capacity reservation and job stage transitions where needed.
- Avoid exposing internal IDs or sensitive data unnecessarily.

## 7. Capacity reservation consistency

Booking creation must be concurrency-safe:
1. Begin transaction.
2. Read relevant branch calendar, service capacity rules, and active reservations.
3. Calculate remaining capacity for the requested interval.
4. Validate daily drop-off cap.
5. Reserve capacity using locking/constraint strategy appropriate to the model.
6. Commit booking and reservation atomically.
7. If capacity is unavailable, return feasible alternatives.

Two receptionists or a bot and receptionist must not be able to reserve the same final capacity simultaneously.

## 8. Audit and event model

Important actions should create append-only audit or domain-event records:
- Actor (user/system/integration).
- Action/event type.
- Entity type and ID.
- Previous and new values where appropriate.
- Timestamp.
- Reason/comment where required.
- Source (UI, bot, integration, background job).

Do not allow ordinary users to edit or delete audit records. Keep customer-visible conversation content separate from internal audit notes.

## 9. Deployment and environments

Maintain distinct development, staging/test, and production configurations where practical.
- Never commit secrets.
- Use environment variables or secret manager.
- Configure health checks.
- Configure database backups and retention.
- Document deploy, rollback, and restore procedures.
- Monitor application errors, database connectivity, worker health, and WhatsApp integration.
- Provide an exit/migration plan for database and object storage.

## 10. Suggested environment variables

Names are illustrative; adapt to the selected framework:
- `DATABASE_URL`
- `APP_BASE_URL`
- `AUTH_SECRET`
- `STORAGE_ENDPOINT`
- `STORAGE_BUCKET`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `DEFAULT_TIMEZONE`
- `OWNER_DIGEST_TIME`

Never include real values in documentation or commits.

## 11. Observability

Track:
- API error rates and latency.
- Database connectivity and slow queries.
- Queue depth, retries, and failed jobs.
- WhatsApp webhook failures and outbound delivery failures.
- Scheduled reminder execution.
- Capacity conflicts and manual overrides.
- Authentication failures and suspicious access patterns.

Logs should use correlation IDs and avoid full message bodies, phone numbers, customer names, or other PII unless explicitly necessary and protected.
