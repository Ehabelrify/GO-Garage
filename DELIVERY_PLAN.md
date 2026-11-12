# Garage OS — Delivery Plan

The implementation order may change after repository inspection. Avoid building all modules in parallel before the foundations are reliable.

## Phase 0 — Repository and product alignment
- Connect Replit to the existing GitHub repository.
- Inspect current code and report stack, structure, existing features, gaps, and risks.
- Confirm chosen architecture and migration approach.
- Establish environment configuration and project documentation.
- Create a working development environment.

**Exit criteria:** Existing work understood and preserved; architecture plan approved.

## Phase 1 — Foundation
- Authentication and sessions.
- Users, roles, branch membership, and permissions.
- PostgreSQL schema and migrations.
- Arabic/English language framework and RTL/LTR.
- Shared layout and role-based navigation.
- Audit event foundation.
- Basic error handling and observability.

**Exit criteria:** Staff can securely sign in and only access permitted branch/role data.

## Phase 2 — Customers, vehicles, services, bookings, capacity
- Customer and vehicle CRUD/search.
- Service catalogue and branch availability.
- Configurable bay types, capacity, working calendar, and drop-off limits.
- Transaction-safe booking and reservation.
- Reschedule/cancel/no-show flows.
- Alternative date suggestions.
- Booking confirmation state and history.

**Exit criteria:** End-to-end booking workflow works and concurrent booking attempts cannot overbook configured capacity.

## Phase 3 — Workshop jobs
- Booking-to-job conversion and walk-in policy if approved.
- Job board by branch/stage.
- Technician assignments and “My cars today”.
- Intake checklist and required photos.
- Job stage transition rules and append-only events.
- Work notes/photos.
- QC checklist, failure, and rework.
- Ready and delivery workflow.

**Exit criteria:** A vehicle can move through the full workshop lifecycle with evidence and auditability.

## Phase 4 — WhatsApp and shared inbox
- Provider adapter.
- Meta webhook verification and event handling.
- Inbound/outbound messaging.
- Shared inbox and assignment.
- Internal notes and conversation states.
- Customer matching.
- Bot journeys and human handoff.
- Template and 24-hour window handling.
- Provider health and failure handling.
- Simulator only as a clearly labelled development fallback.

**Exit criteria:** Live end-to-end test with approved Meta setup, or a clearly documented blocked integration with simulator separated from production.

## Phase 5 — Warranty and QR
- Warranty generation from delivered job.
- Terms versioning.
- QR token and public verification route.
- Privacy-safe masking.
- Warranty lookup and status.

**Exit criteria:** Public page exposes only approved fields and warranty records are traceable to jobs.

## Phase 6 — Automations and owner visibility
- Reminders and escalation jobs.
- Job delay alerts.
- Critical owner notifications.
- Evening digest.
- Owner and branch dashboards.
- Stage duration and operational reports.

**Exit criteria:** Scheduled work is idempotent, observable, and recoverable after failures.

## Phase 7 — Inventory and payment records
- Inventory catalogue and branch stock.
- Movement/adjustment history.
- Reorder levels and low-stock digest.
- Payment entries, partial payments, balance view.
- Receipt PDF if required and approved.

**Exit criteria:** Records are auditable and clearly distinguished from full accounting.

## Phase 8 — Pilot and production readiness
- Usability sessions with reception and technicians.
- Arabic/English and mobile/tablet testing.
- Permission/security review.
- Load and reliability checks appropriate to expected usage.
- Backup/restore and export tests.
- Staff training and quick-reference guides.
- Meta number cutover plan.
- Owner sign-off on policies and assumptions.

**Exit criteria:** Acceptance scenarios pass; operational fallback and support ownership are documented.

## Ongoing delivery rules
- Ship vertical slices that work end-to-end.
- Keep `PROJECT_LOG.md` and `DECISIONS.md` current.
- Do not use fake data in production.
- Keep demo/seed data clearly separated from real records.
- Do not mark a phase complete based only on visual implementation.


## Owner-meeting readiness

The current meeting build uses a real Owner Settings page, persistent sample operational records, branded individual sign-in, and separate server-enforced role/branch workspaces. Settings changes are saved and applied only to implemented workflows. Do not turn the meeting walkthrough into an option-poll or approval simulation. Unimplemented modules remain visibly **On hold**; publishing, production account provisioning, backups, and restore validation remain separate work.
