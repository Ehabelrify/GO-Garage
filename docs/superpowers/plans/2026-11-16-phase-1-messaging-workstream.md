# Phase 1 Messaging Workstream Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement the reviewed integrated plan task-by-task. Checkboxes track proposed work; this document authorizes no implementation, commit, database write, or provider connection.

**Goal:** Deliver an operational six-channel central inbox and confirmed-booking journey, with a genuinely isolated auxiliary scenario using the same business rules.

**Architecture:** A central-team capability scopes messaging-specific access, while the shared operations booking service owns atomic capacity and persistence. A transport-neutral conversation engine feeds a separately isolated scenario transport and a gated provider adapter; durable inbound deduplication and transactional outbound intents preserve truthful delivery states.

**Tech stack:** TypeScript, Express, PostgreSQL, React/Vite, Vitest, `@garage/domain`.

**Spec:** [Accepted direction](../../product/PRODUCT_DIRECTION_AND_RELEASES.md), [tracker](../../testing/PHASE_1_ISSUES_TRACKER.md), [WhatsApp spec](../../engineering/WHATSAPP_SPEC.md), [scenario proposal](../../product/WHATSAPP_DEMO_FLOW_PROPOSAL.md), [security](../../engineering/SECURITY_PRIVACY.md), [handover](../../operations/PHASE_1_FULL_PLAN_HANDOVER.md).

## Global constraints

- Operational product is primary; a fictional scenario is auxiliary. Preserve actual role/branch authorization, Clerk, Replit paths, and Arabic/English RTL/LTR.
- Six receiving channels share one central team. Reply via the receiving channel; selected branch controls capacity; changing branch does not change owner/channel.
- Customer confirmation triggers an atomic confirmed booking without routine staff approval. No confirmation before commit. Do not activate unapproved business policies, prices, service claims, timers or templates.
- No live sending until separately approved provider readiness is verified; sandbox and scenario cannot emit external effects. Do not treat this plan as evidence of live connectivity.
- Number migrations below are proposed: coordinator assigns unique ordered migration names across workstreams immediately before implementation; never modify previously applied migrations.

## Fresh source findings (inspection only, 2026-11-16)

- `apps/server/features/whatsapp/whatsapp.ts` is a simulation-only, branch-filtered router. It independently implements capacity and booking mutations; confirmation locks draft and branch/date and may create a job. The shared operations route in `apps/server/features/operations/api.ts` has another capacity path and a configurable `booking-confirmation` policy. Their semantics must converge, with explicit source-aware automatic customer confirmation, never a bypass of capacity.
- `0005_whatsapp_simulation.sql` restricts conversations/messages to `mode = 'simulation'`; its records reference ordinary customer, vehicle, booking and job rows. A simulation flag alone does not isolate those rows or reports. Migrations are applied by full filename in sorted order (`apps/server/infrastructure/database/migrate.ts`); two existing `0005` files are distinct. Existing records cannot be silently relabeled operational.
- `whatsapp-policy.ts` permits simulation writes only outside production and hard-disables provider delivery. `authz.ts` provides role plus branch checks and assigned-user reply checks; no explicit central membership exists. `App.tsx` shows a simulation page only to owner/manager/receptionist. `WhatsAppSimulationPage.tsx` has selection-independent transient state and requests, the historical P1-007 risk; its current symptoms were not rerun.
- `whatsapp.integration.test.ts` has one broad simulation integration test; `whatsapp-policy.test.ts` covers both safety gates. Domain `rules.ts` computes daily capacity from confirmed bookings. These are useful baselines, not proof of current production behavior or issue closure. `git status` contains pre-existing user changes; preserve them.

## Review focus

1. A delayed A request resolves after switching to B: no A content or action leaks into B (M01).
2. Membership is revoked during an open transcript or queued action: subsequent requests fail and cached data clears (M02/M05).
3. Two customers confirm the final slot or one retries: at most one booking per confirmation and capacity remains valid (M03).
4. Provider request times out after possible acceptance: no unsafe automatic duplicate; visible reconciliation state (M07).
5. Reset or reporting crosses scenario boundary: live rows, sends and aggregates remain untouched (M04).

## Shared contracts and ordering

Release mapping: M01 is R0 (correctness/access/build); M02–M05 are R1 (operational central inbox, shared booking, commercial context and isolation); M06–M08 are R3 (provider and operational pilot). R2 commercial fulfillment supplies subsequent references without blocking the baseline journey. Operations owns shared guided-form behavior (P1-037); messaging consumes it rather than building a competing form system. M01 may precede foundations. M02 and the coordinator's auth/session and scenario-isolation foundation precede M04/M05. M03 depends on O01 and O14, P1-001/002 date and capacity correctness, and P1-039 catalogue/quote contracts. O14 owns configured time-slot and occupancy availability plus atomic reschedule/cancel; B01 must configure branch timezone, opening/closing times, calendar and slot grid or availability returns unconfigured. A generated list of hours is not proof of capacity. M05 consumes M02–M04; M06–M08 follow M05, with live cutover a separate operational gate. The coordinator must agree exact exported names with the operations/commercial owners before implementation; do not create parallel booking, capacity, catalogue, quote, reservation, or identity services.

Canonical operations interface (owned by O01): `BookingActor = {kind:'staff'; userId:string} | {kind:'customer-confirmation'; channelId:string; confirmationId:string}`; `ConfirmedBookingInput = {branchId:string; customerId:string; vehicleId:string; serviceId:string; dropoffDate:string; dropoffTime:string; idempotencyKey:string; confirmationRef?:string; pendingBookingId?:string; quoteRef?:QuoteVersionRef; reservationId?:string}`; `BookingReservationResult = {status:'confirmed'|'replayed'; bookingId:string; jobId:string} | {status:'capacity-conflict'; reason:'closed'|'daily-cap'|'bay-capacity'} | {status:'forbidden'|'invalid'; code:string}`. Call `reserveConfirmedBooking(client: PoolClient, actor: BookingActor, input: ConfirmedBookingInput): Promise<BookingReservationResult>` within the caller-owned transaction. O01 locks the branch/canonical date, validates verified customer confirmation and idempotency payload, checks capacity from server-derived commercial work, writes one booking/job on the same client, and owns branch authorization, date-only serialization and lock ordering. O14 `listAvailableSlots` returns an advisory snapshot, not a reservation; M03 consumes only O14 validated availability and atomic change operations. Expected pickup is read from the committed booking record after O01 succeeds, not inferred from its booking/job ID result. Commercial C04 owns getBookingOfferContext(actor: BookingActor, input: {branchId:string;customerId:string;vehicleId:string;quoteRef?:QuoteVersionRef;reservationId?:string}): Promise<BookingOfferContext> in `apps/server/features/commercial/quote-booking.ts`. QuoteVersionRef = {quoteId:string;revision:number}. BookingOfferContext is {state:'ready';quoteRef:QuoteVersionRef|null;reservationId:string|null;vehicle:{vehicleId:string;model:string;categoryId:string|null};scope:ScopeItem[];work:WorkComponent[];summary:{ar:string;en:string}} | {state:'requires-human';reasons:string[];quoteRef:QuoteVersionRef|null;reservationId:string|null} from packages/domain/src/quotes.ts. Scope preserves service/grade/areas/roof/add-ons/exclusions; expose only authorized approved context, never private evidence or unauthorized prices. C04 resolves staff membership or verifies the customer-confirmation association internally; never fabricate a staff actor. Capacity receives no raw amounts; authorized accepted quote display reads the snapshot through the scoped quote service. Never duplicate quote or promotion services.

## M01 — Consume operations selection and session corrections

**Owned implementation:** O03 owns selection state in `apps/web/src/features/whatsapp/WhatsAppSimulationPage.tsx` and its tests; O04 owns independent Receptionist/Technician session diagnosis and correction in demo auth/bootstrap and their tests. This messaging task does not duplicate their implementation or test fixtures.

**Interfaces:** O03 guarantees conversation/branch/session-keyed state and rejects stale async results; O04 supplies independently verified identity, role and branch-scoped sessions. M04/M05 consume these contracts.

- [ ] Review O03 evidence for draft/result/composer A→B, branch switches, return to A, delayed requests and mismatched server draft ID; retain its server ownership and provider-off checks.
- [ ] Review O04 evidence for each role independently: session POST, cookie, membership, bootstrap, refresh, sign-out, conflict/disabled account and production gating; verify technician empty/assigned work and forbidden inbox/customer phones, and receptionist branch/owner denials. Do not infer a shared cause.
- [ ] Record linked passing O03/O04 tests and bilingual/mobile retest evidence in the integrated issue matrix; unresolved evidence blocks the messaging scenario. No duplicate implementation or independent test run belongs to this planning revision.
  **O03/O04 production corrections are consumed; tests and bilingual/mobile runtime evidence were skipped by explicit user direction.**
## M02 — Explicit central membership and authorization

**Create:** `apps/server/features/whatsapp/inbox-access.ts`, `inbox-access.test.ts`; migration proposed `apps/server/infrastructure/database/migrations/0010_messaging_access.sql`. **Modify:** `apps/server/features/auth/authz.ts`, `authz.test.ts`, `auth.ts`, `apps/server/features/whatsapp/whatsapp.ts`; authorized staff management surface chosen by the auth owner.

**Interfaces:** `canAccessInbox(actor, membership, conversation): boolean`; `canReadInboxBookingContext(actor, membership, branchId): boolean`. Membership is server-loaded on every protected request, not a client role switch or ordinary branch permission. Central members can read all configured channels and minimum customer/availability/booking context across supported branches; other eligible users remain branch-scoped. No finance, owner settings, warranty approval or workshop privilege follows.

- [ ] Add a membership table keyed by staff membership, active/revoked status, grant/revoke actor and timestamps; owner-only administration with audit events. Existing staff are not automatically enrolled. Explicitly define owner and non-central branch-scoped visibility in tests, and reject inactive/technician membership.
  **Production membership, audit, owner administration and server-side central/branch scope implemented 2026-11-17 in migration 0024 and `inbox-access.ts`; migration not applied.**
- [ ] Add API tests for all six channels, direct conversation/message/context IDs, cross-branch linked data, central agent versus nonmember, and denied unrelated routes. Test revoked membership on next read/write and clear client cache on 401/403. Filtering is server-side, including history and search; unrelated branch context is not leaked via counts.
- [ ] Run `npx vitest run apps/server/features/auth/authz.test.ts apps/server/features/whatsapp/inbox-access.test.ts` plus integration suite with dedicated DB. Expected: pass, no privilege expansion.

## M03 — Confirmed booking conversation

**Create:** `packages/domain/src/whatsapp-journey.ts`, `packages/domain/src/whatsapp-journey.test.ts`, `apps/server/features/whatsapp/booking-journey.ts`, `booking-journey.integration.test.ts`. **Modify:** `packages/domain/src/index.ts`, `apps/server/features/whatsapp/whatsapp.ts`; operations files only under the shared service owner's task.

**Interfaces:** `advanceJourney(state, input): {state, effects}` is a pure deterministic state transition; `confirmJourneyBooking(client, conversationId, confirmationKey): Promise<BookingReservationResult>` calls O01 with a verified `customer-confirmation` actor and caller-owned transaction; a confirmed/replayed result supplies bookingId and jobId. After commit, read the persisted booking to obtain expectedPickup for status and confirmation; do not invent an O01 return field. Consume O14 configured slot availability and atomic reschedule/cancel. State preserves language, source channel, selected branch, service, vehicle category/model, package/coverage/add-ons, slot, quote reference and original enquiry. Server validates all customer-provided values.

- [ ] Test O14 branch/service/time occupancy availability → slot selection → required details → review → explicit confirmation → confirmed booking and job; no staff claim or approval required. Ensure only approved configured catalogue/price/wording is displayed; unconfigured fields and unsupported intents route to human, not invented answers.
- [ ] Test duplicate confirmation/event/restart returns the same booking; simultaneous last-slot confirmations yield one success and one conflict; changing branch/service invalidates stale slot, refreshes alternatives and retains valid input. No partial customer/vehicle/job/confirmation on rollback; confirmation intent is written in the same transaction as the booking and only dispatched after commit (M07). Test date-only values across Cairo and UTC.
- [ ] Test menu/back, explicit language change, immediate human request at every step, ambiguous input clarification then handoff, and context preservation without incomplete booking. Use authorized commercial references, never duplicate quote/promotion services. Support safely verified status and authorized reschedule/cancel using shared operations; leave unapproved cancellation rules inactive.
  **Production deterministic journey and shared booking confirmation adapter implemented 2026-11-17; tests skipped.**
- [ ] Run `npx vitest run packages/domain/src/whatsapp-journey.test.ts` and `npx vitest run apps/server/features/whatsapp/booking-journey.integration.test.ts` with disposable DB. Expected: pass, including concurrent connections and transaction failure injection.

## M04 — Scenario isolation and two-pane entry

**Create:** `apps/server/features/whatsapp/scenario-transport.ts`, `scenario-isolation.integration.test.ts`; `apps/web/src/features/whatsapp/WhatsAppScenarioPage.tsx`, `WhatsAppScenarioPage.css`; scenario database schema migrations coordinated with the isolation owner. **Modify:** `apps/web/src/app/App.tsx`, `apps/web/src/app/AuthApp.tsx`, `apps/web/src/features/demo-auth/DemoAccountPanel.tsx`, current simulation page/router and coordinator-owned reporting/bootstrap queries.

**Interfaces:** `ScenarioContext { scenarioId, actorId }`; `ScenarioTransport.receive(context, fictionalChannelId, input)` calls the same journey and shared operations behavior against an isolated data context. No provider adapter or live outbox is reachable. Scenario execution uses a separate deployment and dedicated database marked explicitly as demo, with separate credentials and secrets. A production actor cannot select or switch the database DSN; scenario deployment has no provider secrets and no provider transport. Never rely on a `mode` column as the boundary.

- [ ] Define the separate deployment, demo database marker, distinct credentials and guarded connection startup across customers, vehicles, bookings, jobs, audit, queues, settings and reports; fixture creation and reset are scoped to one scenario. Migrate existing simulation records only after identifying their complete linked graph; leave ambiguous records quarantined, never promote them to live. No destructive cleanup without a reviewed backup and explicit target.
  **Dataset marker/startup guard and scenario transport/provider-secret denial implemented 2026-11-17; no deployment, marker write, migration or fixture reset performed.**
- [ ] Test startup rejects absent/wrong demo marker, production DSN selection is impossible, scenario credentials cannot access the operational database, live↔scenario read/write denial, reset with colliding IDs, two simultaneous scenarios, no scenario contribution to operational reports or outbox, no provider call, and the same capacity/RBAC outcomes under corresponding fictional configuration. Scenario privileges never attach to real actors; production simulation writes stay blocked unless a separately isolated training deployment is explicitly approved.
- [ ] Outside selector starts the actual selected identity at its permitted landing page. Six fictional receiving channels feed the same inbox; wide view has customer/agent panes and narrow view labeled tabs/unread indicators. Customer never sees notes/events; technician sees no inbox or scenario controls. Navigation retains context, revocation clears it, and displays label simulation and not-sent status.
- [ ] Run `npx vitest run apps/server/features/whatsapp/scenario-isolation.integration.test.ts` with dedicated disposable DB and UI tests, then manually verify bilingual keyboard/mobile layouts. Expected: isolation and role assertions pass.

## M05 — Central triage and handoff

**Create:** `apps/server/features/whatsapp/inbox.ts`, `inbox.integration.test.ts`, `apps/web/src/features/whatsapp/WhatsAppInboxPage.tsx`, `WhatsAppInboxPage.css`; migration proposed `0012_messaging_inbox.sql`. **Modify:** router, `App.tsx`, domain exports. **Consumes:** M02 access and M03 journey, commercial references. **Produces:** `claimConversation(actor, id, expectedVersion)` and `handoffConversation(tx, id, context)`; conflicts return 409 and refreshed state.

- [ ] Model distinct receiving channel, customer, selected branch, central queue, assignee, bot/human state, `open|pending|resolved`, last inbound, human-response-required timestamp and version. Show Unassigned, Assigned to me, Waiting and Resolved, searchable filters and permitted context. Human handoff pauses automation, queues once, retains source/enquiry/slot/quote context; new inbound reopens resolved without resuming the bot. Automatic success is not human-response-due.
- [ ] Under transaction row lock or compare-and-swap, allow exactly one competing claim; only assignee can reply; authorized reassignment records actor/from/to; internal notes remain staff-only and are never transport payloads. Branch change retains owner and source. Test simultaneous claim/reassignment/reply, unauthorized direct API reads/writes, revoked access, filter completeness, note privacy, bot pause/resume and duplicate handoff.
  **Production versioned row-lock claim/handoff, assignment and note privacy paths implemented 2026-11-17; tests skipped.**
- [ ] No assumed SLA, escalation, snooze or external alert activation. Show elapsed inbound separately from human waiting and an unconfigured due state until the owner approves definitions and working calendar.
- [ ] Run `npx vitest run apps/server/features/whatsapp/inbox.integration.test.ts` with dedicated disposable DB and UI tests; verify keyboard and Arabic/English at mobile/desktop widths. Expected: pass.

## M06 — Provider adapter and inbound webhook

**Create:** `apps/server/features/whatsapp/provider.ts`, `provider-webhook.ts`, `provider.test.ts`, `provider.integration.test.ts`; migration proposed `0013_messaging_provider_events.sql`. **Modify:** server composition and inbox connection-status UI. **Produces:** `ProviderAdapter.send({channelId, recipient, content, idempotencyKey}) -> accepted(providerMessageId) | definiteFailure | unknownOutcome`; `ingestVerifiedEvent(rawBody, headers) -> duplicate | persisted`. M07 owns dispatch and policy.

- [ ] Store channel configuration without credentials, inbound event ID unique per provider/channel, provider message IDs and delivery status events. Verify webhook signature on raw body before processing; reject invalid signatures, deduplicate concurrent replay, and make out-of-order receipts non-regressing. No PII or secrets in logs.
  **Production channel/event/contact-link schema, raw-body signature verification, deduplication, operational inbound persistence and non-regressing receipts implemented 2026-11-17; provider remains disconnected.**
- [ ] Test invalid and duplicate webhooks, simultaneous replay, out-of-order/duplicate receipts, missing channel mapping and disabled provider. Use a fake adapter; no external delivery. Run `npx vitest run apps/server/features/whatsapp/provider.test.ts` and `npx vitest run apps/server/features/whatsapp/provider.integration.test.ts` with a dedicated disposable DB. Expected: pass.

## M07 — Transactional outbox and delivery policy

**Create:** `apps/server/features/whatsapp/outbox.ts`, `outbox.integration.test.ts`; migration proposed `0014_messaging_outbox.sql`. **Modify:** `whatsapp-policy.ts`, `whatsapp-policy.test.ts`, messaging transaction callers and inbox delivery UI. **Consumes:** M06 provider adapter. **Produces:** `dispatchDue(now)` claims leased outbox entries and applies policy immediately before sending.

- [ ] Persist message and outbox intent in one transaction with unique logical idempotency key, attempts, next attempt, lease and expiry. `queued` is not sent; only provider evidence moves to accepted/delivered/read/failed. Bound retries with backoff and expiration for definite transient failures; expose permanent failures. After unknown acceptance, reconcile via provider-supported identifiers/idempotency before retry; otherwise hold for operator review. Crash/lease recovery cannot cause an unreviewed duplicate.
- [ ] Enforce verified customer-service window, consent, approved template/language and expiry on server at enqueue and send. Unknown window, missing template or policy fails closed with actionable UI. Test exact boundary, skew, expiry in queue, duplicate intent, crash before/after acceptance, 429/5xx/permanent error, outage and recovery. Default delivery gate remains false.
  **Production delivery-policy/outbox schema, enqueue/send gates, leases, bounded backoff and unknown-outcome hold implemented 2026-11-17; adapter is disconnected and tests skipped.**
- [ ] Run `npx vitest run apps/server/features/whatsapp/whatsapp-policy.test.ts` and `npx vitest run apps/server/features/whatsapp/outbox.integration.test.ts` with dedicated disposable DB. Expected: pass; no live calls.

## M08 — Provider readiness and operational handoff

**Create:** `docs/operations/WHATSAPP_PROVIDER_RUNBOOK.md`. **Modify:** provider readiness status and affected operational documentation. **Consumes:** M06/M07 and the operations owner's backup/restore procedure; this task does not authorize activation.

- [ ] Document current primary provider rules only after future implementation-time verification, actual ownership/admin and six-number eligibility/migration/coexistence, webhook secrets/signatures, approved templates and consent/retention, server configuration, sandbox end-to-end inbound/outbound/receipts/failures, and scoped permissions. Record evidence and responsible operator without secrets. Document manual fallback, per-number cutover/rollback, monitored backlog/failure and alert ownership.
  **Disconnected-state cutover, evidence, monitoring, fallback and rollback runbook implemented 2026-11-17; no provider claims or activation recorded.**
- [ ] Test disconnected state and absent configuration fail closed. Owner approval of policy and each number, demonstrated backup/restore and recovery, and all readiness evidence are separate live-cutover gates. Run `npm run typecheck`, `npm test -- --run`, and `npm run build` after implementation; integration suites use only an explicitly identified disposable `GARAGE_TEST_DATABASE_URL`. Expected: pass.
## Migration, recovery and release gates

Apply reviewed forward migrations only to an explicitly identified disposable development database first; migration runner selects `DATABASE_URL`, rejects production and tracks full filenames. Back up and verify restore before any approved deployment migration. Add nullable fields/tables first, validate constraints after safe backfill, and record row counts and collision/quarantine results. Do not copy simulated conversations or their linked fictional records into operational tables; no assumed central-team grants or six real number values. Rollback before cutover disables adapter/workers, drains or safely holds outbox, restores previous compatible application; retain event/audit and bookings. After live writes, use a forward corrective migration or tested backup/restore with reconciliation, never drop new data blindly. Simulate upgrade, interrupted migration, repeated migration and restoration on disposable database. The operations owner supplies cross-workstream backup/restore and reconciliation procedure; no production DB action is authorized here.

Provider cutover is blocked until the runbook has named ownership, six-channel account evidence, an outage/manual fallback and per-channel rollback, monitored backlog/failures, alert ownership, and successful backup/restore and recovery exercise. Business owner must configure/approve branches/hours, service/package data, prices, template text, privacy/retention, consent, working-hours and response-due definitions. Missing information remains visibly unconfigured; no live Meta claim is made here.

## Owned issue coverage and closure evidence

| ID | Slice/tasks and source | Independent verification | Dependencies / decisions |
|---|---|---|---|
| P1-007 | O03 selection page/router; M01 evidence | A/B rapid switch, stale request, branch, mismatch tests | Existing server ownership preserved |
| P1-008 | O04 demo auth/operations/bootstrap; M01 evidence | Receptionist session, refresh, conflicts, production and branch denials | Diagnose independently; auth owner integrates |
| P1-009 | O04 demo auth/bootstrap; M01 evidence | Technician empty/assigned job, privacy, refresh, production denial | No assumption of shared cause with 008 |
| P1-026 | M03–M05 journey/scenario/inbox | Automatic confirmed booking, context, bilingual two-pane/handoff | O01/O14 and P1-001/002 capacity/time; P1-037 forms; P1-039/040 commercial; approved content |
| P1-027 | M02/M04–M08 access, channels, provider | Six channels, central scope, source reply, no scenario leakage, disconnected truth | Membership administration; provider gates and business configuration |
| P1-032 | M02/M05 triage | Concurrent claims, ownership, private notes, waiting and bot behavior | Due definition, calendar and any escalation approval |
| P1-038 | M04 plus coordinator-wide isolation/release tasks | Cross-boundary/report/outbox/reset/role tests and restored backup | Coordinator owns whole-product isolation, release matrix, all other modules |

P1-007/008/009 and P1-038 have non-messaging aspects owned by the integrated plan; these rows do not claim their entire closure. P1-026/027 require operational and auxiliary acceptance, not a provider connection claim. All IDs remain open until implementation and dated evidence are recorded in the tracker.












