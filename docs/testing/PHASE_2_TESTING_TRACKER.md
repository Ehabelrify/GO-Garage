# Garage OS — Phase 2 Testing Tracker

**Created / last updated:** 22 November 2026 / 22 November 2026 (independent hardening review)  
**Purpose:** Code-based Phase 2 validation of workflows, connectivity, RBAC, automations, functionality, UI, and UX after the Phase 1 implementation work.  
**Source:** Static review of the implemented application code performed on 22 November 2026. These findings are independent of the owner's ongoing manual testing and must not be marked verified until their acceptance tests are executed.  
**Scope note:** “Phase 2 testing” means the second testing cycle. It is not limited to the customer/booking feature phase in `docs/operations/DELIVERY_PLAN.md`.

**Independent hardening review:** A second model independently inspected the implementation at commit `353c70ddddf120415c7f9fdf1f383a0b722b20a7`, challenged P2T-001–P2T-018, and searched for additional issues. The review confirmed the core tracker, narrowed policy-dependent claims, added P2T-019–P2T-028, and did not perform runtime or database verification.

## Testing rules

- Test implementation behavior, API responses, database changes, and user-visible results. Documentation alone is not acceptance evidence.
- Keep every issue separate even when one change fixes several findings.
- Test the server and UI independently. A hidden button does not prove server authorization, and a server rejection does not prove usable UI behavior.
- Run RBAC cases with role defaults, explicit grants, explicit revocations, branch restrictions, and access changes during an active session.
- Use isolated scenario data for demo tests and a disposable database for integration tests.
- Record role, branch, capability overrides, route, request, response, database result, browser result, and screenshots where relevant.
- Status progression is **Open → In progress → Ready for retest → Verified**. Source inspection alone cannot produce Verified status.
- Do not combine financial records manually during testing to conceal a missing application connection.
- Track implementation state separately from test result. Test results are **Not run**, **Pass**, **Fail**, **Blocked**, or **Not applicable with approval**.
- A risk acceptance is not a passing test and cannot produce Verified status. It must identify approver, rationale, mitigation, expiry, and reopen trigger.
- Provider-dependent features must declare their tested release mode: simulated, disabled, misconfigured, or enabled. A disabled-mode result cannot satisfy an enabled-mode case.
- A skipped case, missing fixture, unavailable database, missing provider approval, or untested browser remains visible in the run denominator.

## Mandatory evidence record

Every issue and test run must record:

- Classification: `proven source defect`, `runtime reproduced`, `policy decision`, `release capability`, `environment limitation`, or `engineering risk`.
- Confidence and severity rationale, affected configurations, accountable owner, release gate, dependent decisions, Phase 1 references, evidence permalink/commit, and last-reviewed date.
- Case ID, UTC timestamp, runner, build SHA, migration head, dataset class, synthetic fixture IDs, role, branch, and effective capabilities.
- Preconditions, action, expected result, observed result, privacy-safe API/DB/UI evidence, assertion count, and every skipped assertion.
- For performance/freshness cases: approved threshold, observed value, data volume, concurrency, and test environment.

A screenshot alone cannot establish authorization, transactionality, idempotency, concurrency safety, accounting agreement, or absence of a side effect.

## Environment prerequisites

Before executing this tracker:

1. Run a clean `npm ci`. The 22 November review found `helmet` and `express-rate-limit` declared in the package and lock files but absent from the local installation.
2. Run `npm run typecheck`, `npm test -- --run`, and `npm run build` in an environment where Vite/esbuild may read the repository normally.
3. Provision a disposable PostgreSQL database and apply all migrations.
4. Prepare accounts for Owner, Branch Manager, Receptionist, and Technician in at least two branches.
5. Prepare capability-override variants for explicit grant and explicit revoke testing.
6. Keep operational and scenario datasets physically or logically distinguishable.

## Issue index

| ID | Area | Finding | Classification | Severity | Confidence | Gate | Status |
|---|---|---|---|---|---|---|---|
| [P2T-001](#p2t-001) | Demo/data boundary | Demo actors can reach operational data and mutations | Proven source defect | Critical | High | Yes | Open |
| [P2T-002](#p2t-002) | RBAC/UI | Effective capabilities, navigation, and page gates disagree | Proven source defect | High | High | Yes | Open |
| [P2T-003](#p2t-003) | Finance/connectivity | Invoice payments do not create finance money events | Proven source defect | High | High | Yes | Open |
| [P2T-004](#p2t-004) | Invoicing/transport | Late transport completion does not update an existing invoice | Proven source defect | High | High | Yes | Open |
| [P2T-005](#p2t-005) | Automations | Reminder processing has no scheduler and simulates delivery | Release capability | High | High | Conditional | Open |
| [P2T-006](#p2t-006) | Messaging | WhatsApp delivery status can contradict the selected provider | Proven source defect + release capability | High | High | Yes | Open |
| [P2T-007](#p2t-007) | Invoicing/warranty | Two invoice-like models and purchase links disagree | Proven source defect | High | High | Yes | Open |
| [P2T-008](#p2t-008) | Audit | Sensitive mutations and overrides are not durably audited | Proven source defect | High | High | Yes | Open |
| [P2T-009](#p2t-009) | UX/data quality | Cancellation reasons and downstream effects are incomplete | Proven source defect | Medium | High | Yes | Open |
| [P2T-010](#p2t-010) | State/connectivity | Related modules and sessions do not refresh consistently | Proven source defect | High | High | Yes | Open |
| [P2T-011](#p2t-011) | Data minimization | Bootstrap is oversized and inconsistently capability-filtered | Proven source defect | High | High | Yes | Open |
| [P2T-012](#p2t-012) | Financial RBAC | Invoice authorities and summary-read policy disagree | Proven source defect + policy decision | High | High | Yes | Open |
| [P2T-013](#p2t-013) | Messaging RBAC | Central inbox cross-branch scope requires explicit approval | Policy decision | High | High | Conditional | Open |
| [P2T-014](#p2t-014) | Deployment | Production migration/readiness execution has no repository path | Environment limitation | High | High | Yes | Open |
| [P2T-015](#p2t-015) | UI/UX | Forbidden or revoked access produces redirects/blank content | Proven source defect | Medium | High | Yes | Open |
| [P2T-016](#p2t-016) | Test architecture | RBAC, route, component, accessibility, and visual gates are incomplete | Engineering risk | High | High | Yes | Open |
| [P2T-017](#p2t-017) | Maintainability | Large mixed-responsibility modules increase regression risk | Engineering risk | Medium | Medium | No | Open |
| [P2T-018](#p2t-018) | Security | Application HTML has no enforced CSP | Engineering risk | Medium | High | Conditional | Open |
| [P2T-019](#p2t-019) | Finance integrity | Outstanding balances subtract incompatible currencies | Proven source defect | High | High | Yes | Open |
| [P2T-020](#p2t-020) | Booking integrity | Booking create/change retries are not safe per user intent | Proven source defect | High | High | Yes | Open |
| [P2T-021](#p2t-021) | Workshop integrity | QC authorization and Ready transition commit separately | Proven source defect | High | High | Yes | Open |
| [P2T-022](#p2t-022) | Staff lifecycle | Removed staff cannot claim a new invitation with the same identity | Proven source defect | High | High | Yes | Open |
| [P2T-023](#p2t-023) | Consent | Automatic reminder simulation ignores later consent withdrawal | Proven source defect | High | High | Yes | Open |
| [P2T-024](#p2t-024) | Concurrency | Concurrent reminder-rule edits lose an update | Proven source defect | High | High | Yes | Open |
| [P2T-025](#p2t-025) | Performance | Long finance reports execute thousands of sequential queries | Engineering risk | High | High query-count / runtime unmeasured | Yes for two-year range | Open |
| [P2T-026](#p2t-026) | Workflow connectivity | Pickup commitment writer has no application entry point | Release capability | Medium | High | Conditional | Open |
| [P2T-027](#p2t-027) | Localization/data quality | Arabic-digit phones behave differently across intake paths | Proven source defect | Medium | High | Yes | Open |
| [P2T-028](#p2t-028) | Accessibility | Global search can move focus behind an active modal | Proven source defect | Medium | High | Yes | Open |

**Initial execution metadata for every indexed entry:** owner `Unassigned`; implementation state `Open`; test result `Not run`; evidence baseline `source inspection at 353c70ddddf120415c7f9fdf1f383a0b722b20a7`. These values must be replaced per entry when work is assigned or a test is executed; leaving them implicit is not permitted in a release manifest.

## Detailed test entries

<a id="p2t-001"></a>

### P2T-001 — Demo actors can reach operational data and mutations

**Technical basis:** Demo enablement is not coupled to the dataset class in `apps/server/features/auth/demo-auth.ts` and `apps/server/infrastructure/database/dataset-boundary.ts`. Central operations mutations do not consistently reject `actor.isDemo`, including settings, customers, availability, bookings, job stages, and assignments in `apps/server/features/operations/api.ts`.

**Required tests:**

1. Start with demo authentication enabled against a scenario dataset; confirm permitted demo behavior remains isolated.
2. Attempt startup with demo authentication enabled against an operational dataset; startup must fail closed.
3. Exercise every read and mutation route with a demo Owner, Manager, Receptionist, and Technician, including nominal reads that lazily create records.
4. Test first login/provisioning, existing demo cookies, and both demo feature flags independently.
5. Confirm no operational row, audit row, job event, invoice, message, setting, or membership changes.
6. Confirm disabling the visible role widget alone cannot leave an alternate demo-auth path active.

**Acceptance:** Demo actors cannot mutate operational data under any role or route. Scenario writes are isolated from operational records and provider credentials.

<a id="p2t-002"></a>

### P2T-002 — Effective capabilities, navigation, and page gates disagree

**Technical basis:** The server calculates role defaults and user overrides in `apps/server/features/auth/authz.ts`; the web duplicates defaults in `apps/web/src/shared/capabilities.ts`; navigation uses role matrices in `apps/web/src/app/navigation.ts`; and `apps/web/src/app/App.tsx` plus feature pages add separate role/capability checks.

**Required matrix:** For every role, test default, explicit grant, and explicit revoke for `customers.read`, `bookings.manage`, `whatsapp.use`, `warranty.view`, `finance.view`, `catalogue.manage`, `quotes.manage`, `transport.coordinate`, `staff.manage`, and settings access.

For each combination verify:

- Navigation visibility.
- Direct URL behavior.
- Page rendering and forbidden-state messaging.
- Data returned by bootstrap and feature APIs.
- Button/action visibility.
- Direct mutation rejection.
- Branch restrictions.
- Behavior after permission changes during an active session.

**Acceptance:** One effective policy produces matching navigation, page, data, and mutation behavior. A grant is usable, a revoke is enforced, and no case produces an unexplained blank page.

<a id="p2t-003"></a>

### P2T-003 — Invoice payments do not create finance money events

**Technical basis:** `apps/server/features/invoicing/invoice-service.ts` writes payment references and invoice totals. Finance reports in `apps/server/features/finance/finance-source-adapters.ts` read `operational_money_events`. The payment transaction does not create a finance event.

**Required tests:** Record full and partial payments, refresh invoices and finance reports, retry the same reference, reverse/correct a payment if supported, and simulate a transaction failure between financial writes.

**Acceptance:** One payment action atomically updates the invoice and the appropriate finance collection record exactly once. Reports, customer/job balance, and invoice status agree after retries and failures.

<a id="p2t-004"></a>

### P2T-004 — Late transport completion does not update an existing invoice

**Technical basis:** Invoice drafting includes only transport already marked completed. `generateForContext` returns an existing invoice by job idempotency key without rebuilding its lines.

**Required tests:**

1. Generate an invoice before pickup or return transport completes.
2. Complete transport with a fee after draft creation.
3. Check invoice lines, totals, job balance, finance views, and customer history.
4. Repeat after invoice issue to test adjustment handling.
5. Test a transport fee in a different currency.

**Acceptance:** Draft invoices recalculate deterministically. Issued invoices require an explicit adjustment/supplementary workflow, and every transport request shows whether its fee was invoiced or requires action.

<a id="p2t-005"></a>

### P2T-005 — Reminder processing has no scheduler and simulates delivery

**Technical basis:** `runDueReminders` exists in `apps/server/features/reminders/reminder-service.ts`, while normal execution is exposed through the manual run route/UI. No repository scheduler invokes it. The runner changes records to `sent-simulated`; it does not enqueue provider delivery. A Branch Manager can also trigger environment-wide processing rather than explicitly branch-scoped work.

**Required tests:** Validate automatic due execution without a user opening the screen; duplicate worker safety; cancellation and rescheduling; retry behavior; service restarts; worker downtime; backlog recovery; next-run visibility; and failure alerting.

**Acceptance:** Simulated mode is truthful and safe without a provider. If operational scheduling is approved for the release, due reminders are claimed and processed automatically, idempotently, observably, recoverably, and within an approved scope; “Check now” is a recovery control rather than the normal path.

<a id="p2t-006"></a>

### P2T-006 — WhatsApp delivery status can contradict the selected provider

**Technical basis:** `dispatchDue` exists in `apps/server/features/whatsapp/outbox.ts` with no production caller, and no application caller of `enqueueOutbound` was found. `apps/server/features/whatsapp/provider.ts` always selects a disconnected adapter, while configuration flags can make the WhatsApp status API report `providerConnected: true`.

**Required tests:** First verify disabled and misconfigured modes: reported connection state, reply behavior, side effects, and error copy must agree. If live delivery is approved, enqueue outbound messages through real application workflows and verify automatic dispatch, provider response handling, retries, idempotency, service-window/template rules, permanent failure handling, and delivery transitions.

**Acceptance:** When production messaging is approved and enabled, queued messages are processed by a monitored worker and real provider adapter. When disabled, the UI and API clearly report that delivery is unavailable and never claim a send.

<a id="p2t-007"></a>

### P2T-007 — Two invoice-like models and purchase links disagree

**Technical basis:** Warranty issuance creates a warranty invoice draft in `apps/server/features/warranty/issuance-service.ts`. Job delivery can also create a general invoice through `apps/server/features/invoicing/invoice-service.ts`. The purchases view in migration `0028_purchases_and_special_requests.sql` derives its invoice link only from warranty drafts, so a generic invoice can be omitted from the customer purchase path.

**Required tests:** Deliver jobs with no warranty, one warranty, and multiple component warranties. Verify every financial document, line, total, tax value, payment state, printed output, purchase link, Customer 360 result, and finance report. Test edits and payments in both interfaces.

**Acceptance:** A payable charge has one canonical financial record. If the warranty document is not payable, it is named and presented as a worksheet/estimate and cannot conflict with the canonical invoice.

<a id="p2t-008"></a>

### P2T-008 — Sensitive mutations are missing from the audit trail

**Technical basis:** Staff invitations/permission edits are acknowledged as incomplete in `apps/server/features/audit/audit-sources.ts`. Customer/vehicle writes, job assignments, staff permission/removal actions, and reminder rule changes are not consistently recorded. QC override audit is scheduled after the successful response and errors are discarded, so the business transition and its justification can disagree.

**Required tests:** Perform create/update/remove/assign/grant/revoke actions and confirm actor, time, environment, branch, entity, before/after values or safe change summary, reason where required, and correlation with the committed transaction. Roll back the mutation and confirm no orphan audit event remains.

**Acceptance:** Every security-, PII-, workflow-, and finance-sensitive mutation creates an immutable audit entry in the same transaction without storing secrets or raw private evidence.

<a id="p2t-009"></a>

### P2T-009 — Cancellation reasons and downstream effects are incomplete

**Technical basis:** `apps/web/src/shared/store.tsx` always sends “Cancelled by authorized staff,” which the confirmed-booking path stores. Pending cancellation does not preserve a meaningful supplied reason, and workshop cancellation follows another path. Transport commitments and reminders require explicit downstream testing.

**Required tests:** Cancel pending, confirmed, and workshop bookings from every applicable screen and role; require a category and meaningful reason; test keyboard/mobile/Arabic layouts; verify customer notification choice, deposit/refund consequences, job/transport/reminder cleanup, idempotent retries, and audit/event history.

**Acceptance:** Cancellation records contain the actual user-supplied reason and all downstream effects are explicit and consistent.

<a id="p2t-010"></a>

### P2T-010 — Related modules and sessions do not refresh consistently

**Technical basis:** Core mutations refresh the large bootstrap store, while finance, quotes, invoices, reservations, benefits, and other features keep independent local state. No shared invalidation or multi-user update channel was found.

**Required tests:** Keep related screens open in two browser tabs and two user sessions. Perform quote acceptance, booking changes, transport completion, job delivery, warranty issuance, invoice payment, finance entry, customer edit, and permission changes. Measure when every related screen becomes correct without a full reload.

**Acceptance:** Mutations invalidate all affected views, and multi-user changes become visible within an agreed interval. Revoked access is removed promptly rather than waiting for a later core mutation.

<a id="p2t-011"></a>

### P2T-011 — Bootstrap is oversized and inconsistently capability-filtered

**Technical basis:** `apps/server/features/operations/bootstrap.ts` returns broad operational state. Customers are capability-filtered, but bookings/jobs and warranty policy metadata use different role/capability conditions.

**Required tests:** Capture response fields and sizes for every role/override/branch combination with small and large datasets. Confirm unauthorized domains and metadata are absent, not merely hidden by the UI. Measure bootstrap latency and post-mutation transfer size.

**Acceptance:** The session/bootstrap response is minimal, consistently authorized, and bounded. Large domain collections use feature endpoints and pagination.

<a id="p2t-012"></a>

### P2T-012 — Invoice authorities and summary-read policy disagree

**Technical basis:** `apps/server/features/invoicing/invoice-service.ts` derives invoice read/write/payment/void privileges from `bookings.manage`, `finance.view`, and raw owner role rather than dedicated invoice/payment capabilities. Customer/Vehicle 360 exposes generic invoice number, status, and total under `warranty.view`, even when the invoice endpoint would require booking or finance authority.

**Required tests:** Execute invoice summary, list, drill-through, print, edit, issue, payment, void, and correction actions using every role and override. Confirm UI and direct API behavior. Owner must approve the intended separation of duties before verification.

**Acceptance:** Explicit capabilities govern invoice view/edit/issue, payment recording, voiding, refunds, and reversals. Booking authority alone grants only the financial actions explicitly approved by policy.

<a id="p2t-013"></a>

### P2T-013 — Central inbox cross-branch scope requires explicit approval

**Technical basis:** `apps/server/features/whatsapp/inbox-access.ts` intentionally treats active central-inbox membership as cross-branch conversation access. The grant requires WhatsApp capability and already has transactional grant/revoke audit. The remaining issue is policy clarity and preventing that conversation scope from silently granting underlying customer, booking, finance, or export authority.

**Required tests:** Use users assigned to one branch with inactive/active central membership. Test list, search, direct conversation access, reply, notes, assignment, customer linking, booking actions, exports, and membership changes during a session.

**Acceptance:** The owner approves and can see the cross-branch contract. Grants and revocations are immediate and audited. Conversation access never supplies unrelated customer, booking, finance, or export authority; without membership, reads and mutations obey branch scope.

<a id="p2t-014"></a>

### P2T-014 — Production migration and readiness execution have no repository path

**Technical basis:** `apps/server/infrastructure/database/migrate.ts` refuses to run with `NODE_ENV=production`. The public health endpoint returns constant success after startup and therefore proves liveness, not database/schema readiness. External deployment infrastructure may provide these controls, but it is not established by this repository.

**Required tests:** Inventory any external deployment runner. Rehearse a production-equivalent deployment against a disposable database: initial deployment, forward migration, application/migration version mismatch, concurrent migration attempts, failure rollback, application rollback compatibility, and readiness after a post-start database failure.

**Acceptance:** A documented and automated deployment job can safely apply production migrations with advisory locking, backups/restore planning, observable failure, and no need to mislabel the environment.

<a id="p2t-015"></a>

### P2T-015 — Forbidden or revoked access produces redirects/blank content

**Technical basis:** Navigation resolution redirects unavailable pages, while several `App.tsx` page branches render only when a capability expression passes and provide no forbidden state.

**Required tests:** Open direct URLs without permission, revoke permission while the page is open, use browser back/forward, restore permission, switch language, and repeat on mobile. Verify focus movement and screen-reader messaging.

**Acceptance:** Users receive a clear localized access message and a safe next action. The interface never displays a blank workspace or disguises revocation as missing data.

<a id="p2t-016"></a>

### P2T-016 — RBAC, route, component, and visual coverage is incomplete

**Technical basis:** The repository has substantial unit tests and real PostgreSQL CI suites, but the review found no `.test.tsx` component tests, limited route/integration coverage, no generated full RBAC matrix, and visual checks that are not a required pull-request gate. The visual runner currently reports axe violations as warnings rather than failures.

**Required work/tests:**

- Generate server and UI RBAC tests from the canonical permission registry.
- Add route tests for every protected endpoint and mutation.
- Add component tests for forbidden, loading, empty, error, stale, and success states.
- Add end-to-end tests for the major workflow connections in this tracker.
- Add Arabic/English, RTL/LTR, desktop/mobile, keyboard, and basic accessibility gates.
- Make affected-page visual checks part of pull-request validation.

**Acceptance:** Policy drift between server, navigation, page content, and actions causes an automated failure before merge. The run records executed and skipped case counts, and a deliberate policy or accessibility mismatch demonstrably fails CI.

<a id="p2t-017"></a>

### P2T-017 — Large mixed-responsibility modules increase regression risk

**Technical basis:** Major modules combine multiple workflows, including `warranties.ts`, `whatsapp.ts`, `operations/api.ts`, `operations/bootstrap.ts`, and the web shared store.

**Required assessment:** Map responsibilities, transaction boundaries, public APIs, duplicated rules, test ownership, change coupling, and regression history before deciding whether to split.

**Acceptance:** Stable ownership and contract tests exist for each responsibility. Split modules only where measured coupling or change risk justifies it, while preserving atomic transaction boundaries. File size alone does not block Phase 2.

<a id="p2t-018"></a>

### P2T-018 — Production Content Security Policy is disabled

**Technical basis:** The server disables global Helmet CSP for application HTML in `apps/server/index.ts`. Protected workshop and warranty file endpoints already set restrictive per-response CSP, so those controls must be preserved. A deployment proxy may add HTML policy and must be inspected rather than assumed absent.

**Required tests:** Define separate development and production policies. Exercise authentication, assets, fonts, API calls, public warranty pages, print views, and any provider integrations while collecting CSP violations.

**Acceptance:** Production serves an enforced, least-permissive CSP compatible with approved application resources. Development exceptions do not silently carry into production.

<a id="p2t-019"></a>

### P2T-019 — Outstanding balances subtract incompatible currencies

**Technical basis:** `apps/server/features/finance/finance-service.ts` validates a money event against that event's finance definition, but link validation checks quote identity/branch rather than quote denomination. Outstanding then subtracts linked collection/refund minor units from quote minor units before summary validation. The resulting row retains the quote currency, so a USD collection can numerically reduce an EGP receivable without an approved conversion.

**Required tests:** Use independently attested quote/outstanding and collection definitions; same-currency controls; foreign-currency collection and refund; currencies with different minor-unit exponents; partial payments; and drill-down. Compare results with an independent arithmetic oracle.

**Acceptance:** Outstanding calculations combine only identical currency and exponent bases, or use an explicit approved, evidenced conversion. Unsupported events remain visibly unreconciled and never alter the displayed balance.

<a id="p2t-020"></a>

### P2T-020 — Booking create/change retries are not safe per user intent

**Technical basis:** Pending booking creation passes an idempotency key but `createBookingInTransaction` does not persist/replay it for the pending path. The web client supplies no distinct reschedule intent key; the API derives one from destination. A sequence A→B→C→B can replay the first B action and report success while leaving the booking at C. Cancellation retry handling can return not-found after the original commit.

**Required tests:** Drop responses after commit and retry; submit concurrent identical pending requests; reuse a key with changed input; perform A→B→C→B as three distinct intents; and retry cancellation after commit. Assert returned IDs/state, stored date/time, capacity, job events, and response body.

**Acceptance:** Each user intent has a durable unique key. Retries return the committed outcome exactly once; changed payloads conflict; later intentional moves to the same destination execute independently; and the response always describes persisted state.

<a id="p2t-021"></a>

### P2T-021 — QC authorization and Ready transition commit separately

**Technical basis:** Checklist/QC authorization in `apps/server/features/workshop-tech/tech-routes.ts` releases its lock before the stage transition transaction in `apps/server/features/operations/api.ts`. A concurrent checklist change can land between the checks and the Ready update. QC override audit is written after success with discarded failures.

**Required tests:** Use two database clients and a synchronization barrier to race Ready against checklist untick/QC change. Inject audit-write failure. Cover normal checklist completion, authorized override, stale revision, repeated transition, and rollback.

**Acceptance:** Checklist/QC state, authorization, stage update, job event, and override reason form one serializable business outcome. A job cannot become Ready without committed prerequisites or a durable authorized override.

<a id="p2t-022"></a>

### P2T-022 — Removed staff cannot claim a new invitation with the same identity

**Technical basis:** Staff removal retains an inactive membership row. A later invitation for the same verified identity can be created, but authentication provisioning only handles an entirely missing identity; finding the inactive row leads to denial instead of claiming the new invitation.

**Required tests:** Invite, activate, remove, and re-invite the same Clerk identity with the same and changed branch/role/capabilities. Test old sessions, new sign-in, invitation expiry, duplicate invites, and audit history.

**Acceptance:** Removal immediately prevents operational access. An approved re-invitation can be claimed exactly once with only the new rights, while historical identity/audit records remain intact and stale privileges/sessions are invalidated according to policy.

<a id="p2t-023"></a>

### P2T-023 — Automatic reminder simulation ignores later consent withdrawal

**Technical basis:** Candidate generation checks consent in `apps/server/features/reminders/reminder-service.ts`, but the automatic due update checks only reminder state/time. Manual send rechecks consent. A reminder generated under valid consent can become `sent-simulated` after consent is revoked or expires.

**Required tests:** Generate reminders with valid consent, then revoke or expire consent before manual and automatic execution. Test the exact recipient, channel, and purpose; inspect reminder status/history and any outbox/provider side effect.

**Acceptance:** Consent is revalidated at dispatch for both manual and automatic paths. Invalid consent produces a durable, accurate skip reason and no simulated or live send claim.

<a id="p2t-024"></a>

### P2T-024 — Concurrent reminder-rule edits lose an update

**Technical basis:** `updateRule` reads and checks revision in application code, then performs an unconditional `INSERT ... ON CONFLICT DO UPDATE`. Two transactions can read the same revision, both succeed, and the later complete-row write silently replaces the first.

**Required tests:** Use two database clients to update different fields at the same expected revision for both an absent/default rule and an existing row. Verify response codes, final values, revision sequence, and audit events.

**Acceptance:** Exactly one stale concurrent update succeeds and the other receives a conflict, or an explicitly approved merge preserves both changes with distinct durable revisions. API results, readback, and audit agree.

<a id="p2t-025"></a>

### P2T-025 — Long finance reports execute thousands of sequential queries

**Technical basis:** Finance calculation repeatedly resolves active definitions inside metric and trend loops. The supported 733-day inclusive daily report performs at least 5,880 sequential definition lookups before source/attestation queries; outstanding also repeatedly filters events per quote, and drill-down reads all source rows before slicing.

**Required tests:** Instrument query count, database time, endpoint time, memory, and booking/API latency for 1-, 30-, and 733-day ranges at approved small/medium/large volumes and concurrent report users. Verify result equality after optimization.

**Acceptance:** Before execution, the release owner sets query, latency, memory, volume, and concurrency budgets. The two-year supported range remains within them without starving operational requests, and report/drill-down values remain consistent.

<a id="p2t-026"></a>

### P2T-026 — Pickup commitment writer has no application entry point

**Technical basis:** `recordPickupCommitment` in `apps/server/features/commercial/quote-booking.ts` supports versioned, authorized commitments, while overview/action projections read them and seed data creates examples. No production caller was found, so staff can see seeded promises that normal workflows cannot create, revise, or cancel.

**Required tests:** If pickup commitments are in the release, start without seed rows and record, revise, and cancel a promise through the approved workflow. Verify policy authority, customer-agreement evidence, branch visibility, revision conflict, upcoming/missed queues, replay, and audit.

**Acceptance:** The feature has an approved, reachable workflow with complete lifecycle behavior, or is explicitly removed/hidden from the release with truthful empty-state copy. Seed data must not imply unavailable functionality.

<a id="p2t-027"></a>

### P2T-027 — Arabic-digit phones behave differently across intake paths

**Technical basis:** Quick Intake converts Arabic-Indic digits to ASCII before normalization. Customers create/edit/search uses `value.replace(/\D/g, "")`, which discards Arabic-Indic and Eastern Arabic-Indic digits. Equivalent customer details therefore validate and search differently by entry point.

**Required tests:** Exercise ASCII, Arabic-Indic, Eastern Arabic-Indic, and mixed digits through Quick Intake, Customers create/edit, telephone links, search, and duplicate detection in both locales.

**Acceptance:** All supported entry points produce the same canonical phone identity and search/duplicate behavior while preserving the approved display convention.

<a id="p2t-028"></a>

### P2T-028 — Global search can move focus behind an active modal

**Technical basis:** `GlobalSearch.tsx` installs a window-level Ctrl/Cmd+K shortcut that always focuses the background search. The shared focus trap listens for Tab only on the modal container, so moving focus outside it lets subsequent keyboard events evade the trap.

**Required tests:** In English and Arabic, open a destructive confirmation and a detail drawer; exercise Ctrl/Cmd+K, `/`, Tab, Shift+Tab, Escape, and focus restoration. Include nested/opening transitions and screen-reader announcements.

**Acceptance:** While a modal owns focus, global shortcuts and background actions cannot move focus outside it. Normal shortcuts resume after close, and focus returns to the correct initiating control.

## Inherited Phase 1 regression attachments

These findings belong to existing Phase 1 feature entries and must be included in the Phase 2 run rather than assigned duplicate IDs:

- **P1-074/P1-075 — fresh workshop checklist:** a normal new job's `/extras` response can show “No checklist” because the actual drawer reads only persisted items; a separate checklist endpoint/Ready gate creates templates lazily. Test first view with no preseeded checklist rows.
- **P1-050 — archive eligibility:** delivered jobs can leave bookings confirmed and block customer archive; terminated lifetime warranties may still count as active because archive predicates do not evaluate `terminated_on`. Test each dependency independently.
- **P2T-005 attachment — manual runner scope:** confirm whether a Branch Manager may trigger environment-wide reminder processing and what aggregate counts they may see.
- **P2T-014 attachment — health semantics:** treat the current public health response as liveness only; test a separate DB/schema readiness signal if the deployment depends on one.

## End-to-end workflow suites

These suites test connections rather than isolated screens.

### Suite A — Customer to delivered job

Customer/vehicle creation → quote → accepted snapshot → booking → capacity reservation → check-in/job → assignment → stages/QC → delivery → warranty/benefits → invoice → payment → finance → audit/customer history.

Every state transition must be authorized, branch-scoped, idempotent, auditable, and visible in all affected screens.

### Suite B — Transport and invoicing

Booking with pickup/return transport → transport assignment/status → fee completion before or after draft creation → invoice issue → payment → finance report. Cover currency mismatch, cancellation, reschedule, and issued-invoice adjustment.

### Suite C — Reminders and messaging

Booking/quote/warranty event → reminder schedule → automatic claim → outbox → provider → delivery/failure/retry → status/audit/operations visibility. Cover cancellation, reschedule, duplicate execution, downtime, and service-window constraints.

### Suite D — Permission lifecycle

Invite/activate staff → role and branch assignment → capability grant/revoke → active-session refresh → navigation/page/API behavior → audit → removal/session invalidation. Execute for every role and both branches.

### Suite E — Cross-user consistency

Two users and two tabs observe the same customer, booking, job, conversation, invoice, and finance period. Mutations must appear within the agreed refresh interval without exposing unauthorized details or requiring a full application reload.

### Suite F — Booking lost-response and concurrency

Use distinct user intents and two database clients for pending creation, confirmation, reschedule, cancellation, capacity contention, response loss, and retry. Verify state, capacity, events, returned outcome, and idempotency records.

### Suite G — QC transition race

Race checklist/QC changes against Ready, failure, override, and backward transitions. Verify one serialized stage/prerequisite/audit outcome and inject failure into each write boundary.

### Suite H — Returning-staff lifecycle

Invite → activate → change rights → remove → old-session request → re-invite same verified identity → claim → new-session access. Verify audit history and absence of stale branch/capability/inbox rights.

### Suite I — Consent and reminder-rule concurrency

Generate under valid consent → revoke/expire → automatic/manual due handling, plus two-owner same-revision rule updates. Verify durable skip reasons, no delivery side effects, conflict handling, revisions, and audit.

### Suite J — Reporting load and denomination

Exercise same- and mixed-currency quotes, collections, refunds, outstanding balances, and drill-down under 1-, 30-, and 733-day ranges. Use an independent monetary oracle and record query/latency/pool budgets.

### Suite K — Operational pickup commitment

Without seed commitments, record, revise, miss, fulfill/cancel, and inspect a commitment through its approved UI/API lifecycle. If excluded from the release, verify all projections and seed-dependent affordances are removed or truthfully disabled.

## Recommended execution order

1. P2T-001 demo/operational isolation.
2. P2T-002, P2T-012, P2T-013, and P2T-022 authorization/staff lifecycle.
3. P2T-019 and P2T-020 monetary and booking integrity.
4. P2T-003, P2T-004, and P2T-007 financial synchronization.
5. P2T-021 and P2T-008 workshop transaction/audit integrity.
6. P2T-023, P2T-024, P2T-005, and P2T-006 consent and automation execution.
7. P2T-010, P2T-011, and P2T-025 synchronization, bootstrap, and reporting load.
8. P2T-009, P2T-015, P2T-027, and P2T-028 UX/accessibility/data quality.
9. P2T-014 and P2T-018 production readiness and security headers.
10. P2T-016 and P2T-017 regression prevention and maintainability.
11. Decide and test the conditional P2T-026 pickup-commitment release capability.

## Completion gate

Phase 2 testing is not complete until:

- Every entry has recorded evidence and an explicit disposition.
- All Critical and High findings are Verified or formally accepted with an owner, reason, and mitigation.
- The end-to-end workflow suites pass against a disposable database.
- The RBAC matrix passes at both UI and API layers.
- Invoice, payment, transport, and finance totals reconcile per currency, minor-unit exponent, approved definition, branch, and reporting cutoff.
- Scheduled work runs without manual intervention and exposes health/failure state.
- Cross-user and cross-module refresh behavior is demonstrated.
- Arabic/English, RTL/LTR, mobile/desktop, keyboard, and core accessibility checks pass.
- Typecheck, automated tests, production build, and production-equivalent migration rehearsal pass from a clean install.
- An immutable run manifest identifies the candidate commit, migration head, all applicable cases, executed/skipped assertion counts, tested browser/locale pairs, quantitative thresholds, and approved exceptions.
- Every blocking fix is retested against its original failure case and at least one neighboring regression path.
- A missing provider decision, fixture, database, browser, or test environment remains an explicit blocker or approved conditional exclusion; it cannot silently count as Pass.

