# Garage OS — Security, Privacy, and Operational Safety

## 1. Access control

Roles:
- Owner
- Branch Manager
- Receptionist
- Technician

Requirements:
- Enforce permissions on the server/API, not just by hiding UI controls.
- Branch managers and staff are restricted to assigned branches unless explicitly granted cross-branch access.
- Owner has cross-branch visibility and configuration permissions.
- Technicians see only assigned/relevant jobs and the minimum customer information needed.
- Receptionists see customer/contact and booking information needed for their work.
- Sensitive actions (refund/correction, override, reopen delivered job, warranty change, user management) require explicit permissions.
- Revoke access promptly when staff leave.

## 2. Authentication and sessions

- Use a proven authentication implementation.
- Enforce strong password or supported identity-provider practices.
- Support session revocation.
- Shared tablets use technician selection plus PIN **[ASSUMED]**, with inactivity lock.
- Personal devices use authenticated sessions with timeout and revocation.
- Avoid shared generic accounts; every action must identify the individual.
- Rate-limit login and PIN attempts.

## 3. Customer and vehicle privacy

- Collect only data needed to operate the service.
- Public warranty pages must not show customer name, phone, full plate, address, or internal notes by default.
- Mask plate number on public pages.
- Use unguessable public warranty tokens.
- Do not expose sequential internal IDs.
- Restrict VIN and financial details.
- Avoid PII in logs, analytics, URLs, and error messages.
- Define retention and deletion procedures with the owner and applicable legal requirements.

## 4. Media and documents

- Store photos/PDFs in private object storage by default.
- Use short-lived signed access URLs for private files.
- Validate file type and size; do not trust file extensions.
- Scan or otherwise safely process uploads where practical.
- Publicly accessible files must be explicitly approved and scoped.
- Preserve intake evidence and record uploader/time.
- Do not allow a technician to silently replace or delete required intake evidence.

## 5. Auditability

Record:
- Login/security events.
- User/role/branch changes.
- Booking create/edit/cancel/override.
- Capacity override.
- Job stage changes and backward transitions.
- Intake/QC completion and override.
- Warranty creation/change/void/transfer.
- Inventory adjustments.
- Payment creation/correction/reversal.
- Conversation assignment and status changes.
- Automation setting changes.
- Integration connection/health changes.

Audit records should be append-only for ordinary users. Corrections should create new records referencing the original.

## 6. Financial safety

- Store amount, currency, payment method, date, and recorder.
- Correct errors through reversal/correction records, not silent edits.
- Restrict payment access by role.
- Clearly label totals as operationally recorded payments unless reconciliation/accounting is implemented.
- Do not claim tax invoice compliance without professional/local validation.

## 7. Warranty safety

- Warranty policy and terms must be approved by Go Stores and reviewed for applicable legal requirements.
- Store a terms version with each warranty.
- Define exclusions, start date, duration, transferability, and void conditions before production.
- Do not infer that a warranty automatically transfers to a new owner; make the policy explicit.
- Public verification page should reveal only approved fields.

## 8. Reliability and continuity

- Automated database backups with documented retention.
- Demonstrated restore procedure before production.
- Export capability for customers, vehicles, jobs, bookings, warranties, inventory, and payment records.
- Monitor database, worker, storage, and WhatsApp health.
- Define incident contact and fallback process.
- Do not make the system dependent on WhatsApp availability for internal workshop operations.
- Document how staff operate during internet/provider outages.

## 9. Production readiness checklist

- [ ] Production secrets configured securely.
- [ ] Role and branch permission tests passed.
- [ ] Public warranty privacy review completed.
- [ ] Backup and restore tested.
- [ ] File upload validation configured.
- [ ] Webhook signatures verified.
- [ ] Webhook idempotency tested.
- [ ] Queue retries and failure visibility tested.
- [ ] Audit events verified.
- [ ] Data export tested.
- [ ] Incident and manual fallback procedures documented.
- [ ] Owner-approved warranty and customer message wording loaded.
