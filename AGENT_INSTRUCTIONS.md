# Instructions for Replit Agent

You are building **Garage OS**, a production-oriented operations platform for Go Stores, a two-branch car protection and modification business in Egypt.

## 1. Start with repository integration and inspection

- Connect this Replit workspace to the user's existing GitHub repository through Replit's native GitHub integration.
- Inspect the full existing repository before editing: framework, package manager, routes, components, database state, migrations, authentication, environment configuration, deployment setup, and existing documentation.
- Do not assume the repository is empty.
- Preserve working code and existing conventions wherever sensible.
- Do not overwrite, delete, or restructure significant existing work without explaining why and obtaining approval.
- Keep the connected GitHub repository synchronized through Replit's supported Git integration. Use clear, meaningful commits. Never expose secrets in commits.
- Do not ask the user to repeat details already stated in these documents.

## 2. Product priorities

### Configurable-by-default rule (critical)
The owner has not yet completed the operational discovery meeting. Therefore, operational policies are **unknown**, not implicitly approved. Do not ask the user to invent answers on the owner's behalf and do not hard-code a single business policy. Build a configurable product that can demonstrate the available choices to the owner. Use `OWNER_MEETING_PLAYBOOK.md` and `DECISIONS_AND_ASSUMPTIONS.md` as the source of truth for options and provisional recommendations.

- Every material operational setting must be editable by an authorized role, with sensible scope (business-wide or branch-specific), validation, audit history, and an explicit default.
- Support business-wide defaults with branch-level overrides where meaningful.
- Distinguish **Proposed default**, **Owner decision required**, **Owner approved**, and **Not applicable**. Never label a proposal as an approved policy.
- Where options affect workflow, permissions, money, customer promises, legal terms, or capacity, expose the alternatives and explain their consequences before activation.
- Provide an Owner Decision Center / setup area that groups unresolved decisions, shows the current proposal, alternatives, impact, selected value, approval status, and change history. It must be usable in a live owner meeting.
- Allow draft configuration and preview before publishing. Record who changed/approved a setting, when, its scope, previous value, new value, and effective date. Support safe rollback where feasible.
- Configuration changes must not silently rewrite historical bookings, quotations, jobs, invoices, payments, or warranties. Use effective dates/versioned rules.
- Do not make fundamental security, data-integrity, or audit safeguards optional merely because operational settings are configurable.


Build a coherent, real product with the following priorities, in order:

1. Reliable customer, vehicle, booking, and job records.
2. Shared WhatsApp inbox with clear ownership and conversation history.
3. Booking and workshop capacity management that prevents overbooking.
4. Simple technician workflow for vehicle intake, progress, quality control, and delivery.
5. Warranty records and privacy-safe public warranty/vehicle page with QR code.
6. Role-based access, branch separation, audit history, and owner visibility.
7. Useful inventory and payment recording without pretending to be a full accounting/POS system.
8. Operational automation that reduces repetitive work and prevents missed actions.

Do not build a large collection of disconnected screens. Implement end-to-end workflows.

## 3. Design requirements are mandatory

Use `DESIGN_SYSTEM.md` as the design authority.

- Aim for a restrained, professional enterprise design inspired by IBM Carbon—not a generic AI-generated SaaS dashboard.
- Prefer clear hierarchy, purposeful whitespace, real tables and lists, restrained color, consistent spacing, and accessible typography.
- Use IBM Plex Sans and IBM Plex Sans Arabic where practical, with a tested fallback stack.
- Arabic is the default staff language. Support proper RTL layout, not merely right-aligned text. English must work in LTR.
- Build distinct role-oriented landing screens for technicians, receptionists, branch managers, and owners.
- Technicians and receptionists are assumed to be non-technical users. Use plain language, large touch targets, short flows, and safe defaults.
- Avoid gradients, excessive cards, decorative illustrations, emoji-based iconography, glassmorphism, fake charts, and unnecessary animation.
- Do not make drag-and-drop the only way to move jobs.
- Support both personal phones and shared branch tablets for technicians.
- Every interactive control must work. No dead buttons, fake links, placeholder charts, or controls that only change appearance.

## 4. Product behavior

- WhatsApp is the primary customer-facing channel. Staff use Garage OS internally.
- The internal application must support multiple WhatsApp reception numbers through one shared inbox.
- Match customers primarily by normalized WhatsApp phone number; handle duplicate or ambiguous matches safely.
- A booking represents a vehicle drop-off date/time and an expected pickup date/time/date—not just a generic calendar slot.
- Capacity must account for bay type, bay-hours, branch, service duration, working days, and a separate daily drop-off limit.
- All capacity values and business hours must be configurable. Initial values are provisional and marked [ASSUMED].
- Job stage transitions must be validated and recorded in an append-only event history.
- A technician should normally see only their assigned/current work and use simple actions such as “Start work” and “Mark finished”.
- Warranty rules and legal wording must be owner-approved before production use.
- Public warranty pages must not expose customer name, phone number, or full plate number by default.
- Stock and finance must be honest, limited operational modules—not misleadingly presented as a complete ERP or accounting system.

## 5. Technical freedom and engineering standards

The user has withdrawn earlier implementation/tooling restrictions. You may choose appropriate frameworks, libraries, testing methods, containers, Git workflows, and deployment services.

Choose a maintainable architecture that suits the inspected repository. Do not force a rewrite simply to match a previously proposed stack. TypeScript end-to-end is preferred if it fits the existing project.

Production-quality expectations:
- Persistent relational database and versioned migrations.
- Server-side authorization on every protected operation.
- Input validation at API boundaries.
- Secure authentication and session management.
- Reliable background processing for reminders and scheduled jobs.
- Idempotent handling of external webhooks and message delivery events.
- Structured logs, error monitoring, and operational health checks.
- Automated tests for critical booking, permissions, lifecycle, and integration logic.
- Backups and a documented restore procedure.
- Environment variables/secrets managed securely.
- No hardcoded credentials, tokens, or production customer data in fixtures.
- Graceful handling of provider outages and partial failures.

## 6. Integration honesty

- Do not claim WhatsApp is connected until credentials, Meta configuration, webhook verification, and a real end-to-end test succeed.
- If Meta credentials are not yet available, build a clearly labelled integration setup state and a development simulator that exercises the same internal message workflow. Do not silently substitute simulation for live messaging.
- Do not claim a message was sent unless the provider confirms acceptance. Track queued, sent, delivered, read, and failed states where available.
- Do not invent Meta template approvals, phone-number coexistence support, or pricing. Verify current platform requirements when implementing the integration.
- Keep the app useful if WhatsApp is temporarily unavailable: staff must still access jobs, bookings, customer records, and operational data.

## 7. Build process

1. Inspect repository and report findings.
2. Propose the architecture and implementation sequence based on what exists.
3. Establish database schema and authentication foundations.
4. Implement core workflows with working persistence.
5. Implement role-specific interfaces and Arabic/English behavior.
6. Implement integrations and background automations.
7. Add operational safeguards, tests, and documentation.
8. Validate the acceptance scenarios in `ACCEPTANCE_TESTS.md`.
9. Prepare deployment configuration and a production-readiness checklist.

Keep `PROJECT_LOG.md` and `DECISIONS.md` in the repository. If they do not exist, create them. Record meaningful implementation decisions, completed work, unresolved issues, and assumptions. Do not create repetitive diary entries.

## 8. Completion standard

A feature is complete only when:
- The intended user can complete the whole workflow.
- Data persists and is correctly related.
- Role and branch permissions are enforced on the server.
- Validation and error states are handled.
- Important actions appear in the audit history.
- Arabic RTL and English LTR have been checked.
- The interface works on mobile and tablet where relevant.
- Acceptance scenarios pass.
- Documentation reflects the actual implementation.

Start by inspecting the connected GitHub repository and summarizing what is already present. Do not begin with a blind rewrite.
