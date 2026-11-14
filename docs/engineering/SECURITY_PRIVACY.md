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
- The public QR response is an explicit allowlist of service, status, dates, and branch; customer identity and vehicle identifiers are not returned.
- Use unguessable public warranty tokens.
- Store only a cryptographic hash of each QR token; show the raw token only once during preparation.
- QR print history stores only opaque token references, the action, staff member, and timestamp; never store or log the raw QR value.
- Keep verification globally disabled by default. The Owner approves public fields, and replacing or revoking a token makes the previous printed QR unusable.
- Public QR pages and responses must be non-cacheable, no-referrer, and excluded from search indexing; invalid, revoked, and disabled codes share one generic response.
- Do not expose sequential internal IDs.
- Restrict VIN and financial details.
- Avoid PII in logs, analytics, URLs, and error messages.
- Define retention and deletion procedures with the owner and applicable legal requirements.

## 4. Media and documents

- Store photos/PDFs in private object storage by default.
- Use short-lived signed URLs or authenticated file-serving routes that recheck record and branch access.
- Validate file type and size; do not trust file extensions.
- Scan or otherwise safely process uploads where practical.
- Publicly accessible files must be explicitly approved and scoped.
- Preserve intake evidence and record uploader/time.
- Do not allow a technician to silently replace or delete required intake evidence.
- Warranty claim evidence uses private App Storage and is returned only through an authenticated, branch-checked download route. The upload UI remains unavailable until this project has a private App Storage bucket configured; see `WARRANTY_EVIDENCE_STORAGE.md`.

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
- Keep warranty-linked invoices as drafts until the Owner confirms the currency, tax treatment, and official template; record draft payment amounts, methods, recorder, and time without presenting them as reconciled payments.

## 7. Warranty safety

- Warranty policy and terms must be approved by Go Stores and reviewed for applicable legal requirements.
- Store a terms version with each warranty.
- Define exclusions, start date, duration, transferability, and void conditions before production.
- Do not infer that a warranty automatically transfers to a new owner; make the policy explicit.
- Policy publication is Owner-only and requires explicit approval; published versions are immutable and each warranty keeps its source version.
- Enforce branch scope and role checks in the server APIs for policy changes, coverage issuance, claim intake, review, and voiding.
- Automatic issuance is service-specific, begins only when an eligible job is delivered, and uses only a published policy version; overlapping published automatic policies for one service are rejected.
- Draft example terms are not approved promises and cannot issue coverage. A claim cannot be opened after its coverage expiry date, and evidence uploads stop when a claim is finalized.
- Development seed data must not create issued warranty coverage. Warranty-linked invoice drafts stay visibly non-final until Owner-approved invoice settings exist.
- Automatic issuance does not approve or deny claims; claim review remains human.
- Public QR verification has a development implementation: token hashes, Owner-approved fields, a generic invalid response, revocation, and a customer-safe allowlist. Keep it off until the Owner approves the final wording and terms; complete a production privacy review before enabling it there.

## 7.1 Development demo accounts

- Temporary role identities are available only when explicitly enabled in the development workflow.
- Demo sessions use a signed, HTTP-only, short-lived cookie and the same server-side role/branch authorization as other accounts.
- Demo identities are not Clerk users, have no shared password, and must be unavailable in production.
- Demo staff management cannot send real Clerk invitations or change real staff memberships.

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
- [ ] Provision private App Storage in every deployment environment and verify claim-scoped upload/download access.
- [ ] Configure malware scanning before storing real customer evidence.
- [ ] Webhook signatures verified.
- [ ] Webhook idempotency tested.
- [ ] Queue retries and failure visibility tested.
- [ ] Audit events verified.
- [ ] Data export tested.
- [ ] Incident and manual fallback procedures documented.
- [ ] Owner-approved warranty and customer message wording loaded.

## 10. Current meeting-build access behavior

- Clerk provides individual authentication. A new authenticated account receives no business access until a verified Owner bootstrap or Owner-issued role/branch invitation is matched.
- Owner has cross-branch access and is the only role that can change operating settings or invite/revoke staff.
- Branch Managers and Receptionists are restricted to their assigned branches. Technicians see only assigned jobs and the customer name/vehicle details needed for those jobs; their bootstrap response omits customer phone numbers.
- The browser role menu is not an authorization mechanism. Protected API routes check membership and access for each request.
- The development seed contains fictional customer records. Do not enter production customer data into the development workspace.
- The first Owner email must be configured before use. Production deployment, backup/restore testing, and staff session policies remain outstanding.

## 11. WhatsApp simulation boundary

- The development inbox stores only fictional simulation conversations and messages; conversation records are scoped to a branch and technicians are denied by the server.
- A claim is exclusive, staff replies and notes require assignment to the acting member, and notes are stored as a distinct staff-only message kind.
- Simulated bookings use fictional seeded profiles, carry an explicit simulation source, and are rejected in production. Capacity is rechecked under a branch/date lock before a booking is committed.
- Customer confirmation is required before a booking, reschedule, or cancellation changes operational records.
- The simulator does not call an external provider or send real messages, alerts, or notifications. Fictional transcript entries are stored only in development sample data. Its readiness response keeps all setup approvals false and delivery disabled.
- Safe simulated status lookup requires both a booking reference and secondary verification code and returns only booking status, approved stage milestones, and an estimated pickup. Internal job notes and customer contact data are excluded.
- Live delivery is not approved. Before enabling it, the Owner must supply Go Stores business assets, verified numbers and branch routing, server credentials, approved language templates, consent/customer-message rules, customer-service-window policy, and an outage/cutover plan. Future webhook signature checks, duplicate-event handling, delivery lifecycle, and retry safety must be server-enforced.
