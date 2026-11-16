# Next-session handover — full Phase 1 implementation plan

**Prepared:** 16 November 2026. **Requested task:** create the full plan covering every finding and issue in the [Phase 1 tracker](../testing/PHASE_1_ISSUES_TRACKER.md), for implementation in later sessions. **This handover does not start implementation.**

## Start here

1. Read [root instructions](../../AGENT_INSTRUCTIONS.md), [application instructions](../../apps/AGENT_INSTRUCTIONS.md), [documentation instructions](../AGENT_INSTRUCTIONS.md), and [accepted product direction](../product/PRODUCT_DIRECTION_AND_RELEASES.md).
2. Read the **entire tracker**, not only its latest entries. At handover it has **44 issues, P1-001–P1-044; next unused ID P1-045**. All are Open/Unassigned; none was fixed or retested by this documentation work. If new issues have been added, include them too and update the coverage count.
3. Read [PRD](../product/PRD.md), [architecture](../engineering/ARCHITECTURE.md), [data model](../engineering/DATA_MODEL.md), [WhatsApp specification](../engineering/WHATSAPP_SPEC.md), [warranty evidence storage](../engineering/WARRANTY_EVIDENCE_STORAGE.md), [security/privacy](../engineering/SECURITY_PRIVACY.md), and the existing [delivery plan](DELIVERY_PLAN.md).
4. Read [Go Stores facts](../product/GO_STORES_FACTS_2026-11-16.md), [meeting dossier](../product/GO_STORES_MEETING_DOSSIER_2026-11-16.md), [workflow research](../product/WORKFLOW_PRODUCT_RESEARCH_2026-11-16.md), and [auxiliary WhatsApp scenario proposal](../product/WHATSAPP_DEMO_FLOW_PROPOSAL.md). Follow their source links only when a particular assertion needs checking; do not repeat completed social research.
5. Inspect the current implementation and tests before deciding files/interfaces. [Repository assessment](../reports/REPOSITORY_ASSESSMENT.md) is a historical orientation aid, not fresh verification. Inspect `git status` and preserve existing work; no commit, push, branch reset or database write is requested.

## Decisions already made — do not reopen the shortlist

- Garage OS is the **full functional operational product**. Demonstration/training is an isolated auxiliary layer over the same real business behavior. Future capabilities are delivered in phases/versions; do not make a meeting demo the primary architecture.
- The user approved **all** researched recommendations and valuable additions: structured catalogue/packages/quotes; deferred promotions; lifetime coverage support; included-benefit/aftercare tracking; transport/VIP coordination; promotion/referral/multi-car qualification; richer WhatsApp handoff; owner exception reporting; recognizable fact-informed product content.
- Existing accepted cross-industry adaptations P1-032–P1-037 remain included, as do every original defect and user-experience request.
- Six WhatsApp business numbers feed **one central handling team**. Receiving number determines reply channel; chosen branch determines availability. Central-team permissions do not grant unrelated owner/finance/warranty authority.
- Normal supported automation checks availability, collects required details, gets customer confirmation and atomically creates a confirmed booking. Routine staff approval is **not** the primary successful path. Explicit customer requests/unsupported enquiries hand off to a human with context.
- Real Owner settings remain real settings. No fake approval polls, front-end role privilege switching or silent policy activation. Staff identity and permissions must be enforced server-side.
- Maintain Arabic/RTL and English/LTR; preserve current stack/domain boundaries and Replit entry/port controls unless a concrete alternative is separately justified.

## What approval did not establish

Published prices/technical claims, exact current branches/hours, deposits/refunds, lifetime definition/exclusions/remedies, benefit limits, referral conditions, same-day applicability and financial-recognition rules need business confirmation. Do not ask the user to invent unknown owner policies. Define typed/configurable or unconfigured paths, identify the appropriate approver/evidence needed, and prevent unapproved public promises.

The current source still has a simulator with provider sending disabled; approval did not connect six live numbers. Real Meta setup, approved templates/channel rules, credentials, webhook validation and end-to-end verification remain implementation/readiness work. No customer/private session exports, social messages or production data collection is authorized by this planning task.

## Complete coverage checklist

| Tracker range | Coverage the plan must preserve |
|---|---|
| P1-001–P1-002 | Booking date mapping, date-only timezone correctness, capacity/concurrency and confirmation boundaries. |
| P1-003–P1-007 | Invoice print scope, save/refresh outcome truth, mobile sign-out, service-duration truth, simulator conversation isolation. |
| P1-008–P1-014 | Reception/technician scenario access, policy-status truth, Arabic auth journey, stage wording, assignment prerequisites and vehicle dropdown. |
| P1-015–P1-022 | Branding/layout/scrollbars, Arabic date/time/digits/required markers, warranty tabs and issuance guidance. Do not drop low-severity issues. |
| P1-023–P1-025 | Post-merge migration/build order, server typechecking coverage, bundle-loading performance. |
| P1-026–P1-027 | Operational customer/agent journey, auxiliary scenario entry, six-number central inbox and live-provider boundary. Read dated supersessions. |
| P1-028–P1-031 | Contextual warranty UX, owner financial overview, cross-industry discovery/adaptations and business discovery with unresolved operating facts. Research collection is already saved. |
| P1-032–P1-037 | Accountable central queue; owner filters/trends/drill-down; trustworthy financial metrics; warranty form/version lifecycle; action queues; sequential conditional forms retaining valid input. |
| P1-038 | Full product architecture, operational/demonstration isolation and phased delivery. |
| P1-039 | Structured catalogue, vehicle/coverage-aware packages and accepted quote versions. |
| P1-040 | Reserved promotional entitlement separately from later scheduled installation and capacity. |
| P1-041 | Fixed-term/lifetime coverage, migration compatibility, claims/public verification/printing. Existing validation is1–120months; do not encode lifetime as an arbitrary date. |
| P1-042 | Promised benefit/aftercare records, eligibility, fulfillment and auditable redemption. |
| P1-043 | Vehicle collection/return/tow/VIP coordination, responsibilities, timings, availability and exceptions. |
| P1-044 | Warranty-card/group/multi-car/referral qualification, controlled discount/benefit allocation and duplicate-redemption prevention. |

This grouped checklist is not a substitute for a **44-row issue coverage matrix** in the resulting plan. Every ID needs tasks, release/slice assignment, dependencies, verification and remaining business decisions. A shared task may close criteria for several IDs, but each ID's closure evidence must remain independently assessable.

## Required planning deliverable

Use the applicable planning skill and save a complete plan under `docs/superpowers/plans/`, with a clear title such as `YYYY-MM-DD-phase-1-full-operational-product-plan.md`. Link the accepted scope and tracker as its requirements. If technical design decisions need a companion spec, save it under `docs/superpowers/specs/` and distinguish already accepted requirements from new proposed implementation decisions.

The plan must contain:

1. **Fresh current-state findings:** source/test paths, existing mechanisms to reuse, actual gaps and historical test limits. Do not assume a tracker item is still reproducible or already fixed.
2. **Issue-to-task/release matrix:** every current tracker ID, scope/acceptance owner, dependencies, proposed slice/version, source files, tests and explicit outstanding decisions. Include original UI bugs and engineering concerns.
   Also map GS-F001–GS-F033 from the fact register to applicable requirements,
   business-confirmation questions or information-only context. Do not force
   every fact into a feature, and do not omit a researched addition without
   stating where its accepted scope is owned. Include all six cross-industry
   adaptations and their existing canonical issues.
3. **Dependency graph/order:** date/capacity/auth/build correctness before dependent automation; catalogue/quotes before promotion entitlement; accepted sale/terms before coverage/benefits; fulfillment data before exception reporting. Avoid duplicate inbox, finance, warranty or queue implementations.
4. **Implementation-ready tasks:** exact files and interfaces after inspection; migration/backfill/rollback requirements; UI/API/domain boundaries; failure/retry/concurrency/permission cases; test commands and observable passing results. A task must be resumable in a later session without rediscovering its dependencies.
5. **Operational/demo separation:** dataset/environment boundary, reset and identity restrictions, shared domain behavior, reporting exclusion and provider-effect containment. Preserve required scenario controls in the auxiliary layer.
6. **Provider integration and real readiness:** number/channel mapping and central permissions, webhook verification, event idempotency, outbound states/retry/failure recovery, policy/time-window handling, secrets outside source, and actual end-to-end verification. Unconfigured provider state is truthful and not a successful live release.
7. **Historical meaning:** immutable accepted quote/offer/coverage versions; old reservations survive catalogue changes according to recorded rules; migration retains existing fixed-term warranties; corrections preserve audit history.
8. **Business questions:** name the unresolved parameter and evidence/approver needed. Do not block unrelated technical work or silently choose contract terms from ads. Financial gaps appear unavailable rather than fabricated profit/revenue.
9. **Validation and release gates:** focused regression coverage, typecheck/unit/build, UI/API authorization, Arabic/English, narrow/mobile/desktop and print where affected; dedicated database integrations; provider and backup/restore operational checks before readiness claims.
10. **Session-sized execution and handoffs:** task ordering, bounded independently verifiable slices, continuation status/checkpoint format, and release acceptance. Keep future-version work visible; no silent deferral or mass closure.

Do not begin implementing during this handover's planning session. Deliver the full plan for review first. Preserve the already approved feature scope; ask only for a genuinely new decision that changes implementation and cannot be settled from the repository or normal engineering judgment.

## Working-tree and environment safeguards

- At handover, `docs/testing/PHASE_1_ISSUES_TRACKER.md` already contains prior user changes. Untracked research/WhatsApp documents also predate this task. Preserve them; do not treat all dirty files as disposable agent output.
- No changes were staged/committed/pushed. No runtime settings, production data, integrations, migrations or sample seeds were changed by these requirement updates.
- Current test/build results in older reports are historical. For source work run `npm run typecheck`, `npm test -- --run`, `npm run build`, plus issue-specific checks. This documentation task did not run them or establish new passing results.
- DB integration suites require an explicitly identified **dedicated disposable** `GARAGE_TEST_DATABASE_URL`. Never use ambient `DATABASE_URL`, shared Replit or production for destructive test fixtures. Check intended migration/seed targets separately.
- Original research agents hit their usage limit during the final bounded checks. Their durable evidence reports and coordinator addenda are saved. No need to restart them or browser research to create the plan. Use available resources judiciously.

## Suggested next-session prompt

> Read docs/operations/PHASE_1_FULL_PLAN_HANDOVER.md and the current Phase 1 tracker. Create the complete implementation plan covering every tracked issue and approved addition, with a per-issue coverage matrix, dependencies, phased releases, source-specific tasks and verification. Treat Garage OS as the functional product with an isolated demonstration layer. Preserve approved decisions and existing changes. Do not implement yet.
