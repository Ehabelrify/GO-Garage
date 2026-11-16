# Garage OS — Phase 1 Issues Tracker

**Created / last updated:** 15 November 2026 / 16 November 2026
**Purpose:** Single working tracker for Phase 1 defects, investigation, implementation handoff, and retesting.  
**Initial intake:** 25 entries: 7 code-review findings, 15 UI-test findings, and 3 engineering follow-ups.  
**Current intake:** 44 entries: the original 25, 6 user-feedback/discovery follow-ups, 6 cross-industry research improvements, and 7 approved business/product additions recorded on 16 November 2026.
**Next available ID:** `P1-045`
**Current ownership:** All 44 entries are unassigned and Open. The user approved all researched recommendations/additions and the operational-product direction. This update records requirements and the next-session full-plan handover; no implementation or new runtime retests were performed.

## Sources and application context

This document combines the [repository code review](REPOSITORY_CODE_REVIEW.md) and [cleaned UI test report](GARAGE_OS_UI_TEST_REPORT.md), including the code review's three build/workflow concerns. The [original UI PDF](Garage_OS_UI_Test_Report.pdf) and both reports remain historical evidence. Add future issues and progress here; do not rewrite the original reports to imply that their findings were retested.

Garage OS uses React/Vite, Express, PostgreSQL, Clerk, and `@garage/domain`. It implements role/branch access, customer and vehicle records, bookings, workshop stages, staff assignment, operating settings, warranty policies/records/claims/evidence, invoice drafts, and gated public verification. Arabic/RTL and English/LTR are supported. WhatsApp is a development simulator. Inventory, full accounting/POS, and live/scheduled messaging remain outside implemented scope.

**Accepted scope update — 16 November 2026:** Garage OS is the full operational product; fictional demonstration/training is an isolated auxiliary layer. Future capabilities ship in phases/versions. [Accepted direction](../product/PRODUCT_DIRECTION_AND_RELEASES.md) maps the approved additions. The next session must create the [full plan covering P1-001–P1-044](../operations/PHASE_1_FULL_PLAN_HANDOVER.md), including every original defect and finding. Earlier demo-first intake remains historical; current requirements below supersede its product framing without claiming fixes. Feature approval does not approve researched prices, warranties or other business policies.

## How to maintain this tracker

- Assign each new issue the next unused `P1-###` ID. The prefix means **Phase 1**, not priority. Never renumber, reuse, or delete an ID. Update the next-ID pointer after intake.
- Keep the index and detailed entry synchronized. Preserve original `CR`/`GO` IDs, evidence, severity, and reported dates. Record new facts as dated updates.
- Update the header's last-updated date, counts/ownership summary, and change log whenever intake or status changes. Once an entry differs from the inherited defaults, put its explicit status, owner, implementation, and retest fields in that entry.
- New user observations start as Open / Reported, even when incomplete. Record missing browser, role, URL, steps, and screenshots as unknown; do not invent them.
- Each issue gets one accountable owner when assigned. Model or tool names may be recorded as contributors; they do not replace ownership.
- Search existing entries before adding a duplicate. Attach new examples to the existing entry; keep a separate ID when the user-visible failure or closure test differs.
- Keep related issues separate even when one patch addresses several. Link dependencies, and verify each entry's acceptance criteria independently.
- Solution approaches below are proposals, not implemented fixes or permission to change operating policy, authorization, Replit configuration, or database data.
- For an implementation, record the commit/PR if one exists, affected files, migration requirements, checks, and known limits. Never mark Verified from a passing build alone.
- Store only sanitized evidence. Do not include secrets, session cookies, customer records, or production database details.

### Status, evidence, severity, and priority

**Status:** Open → In progress → Ready for retest → Verified. Use Blocked with a named dependency, Deferred with a reason, Duplicate with a canonical ID, or Reopened with failed-retest evidence. Ready for retest means an implementation exists; Verified requires recorded acceptance evidence. Updating documentation does not advance implementation status.

**Evidence:** Reproduced = a recorded execution demonstrates the behavior; Source = static code supports the mechanism; Reported = original UI observation, not reproduced in this consolidation; Risk = engineering concern requiring contextual assessment. Original local reproductions are historical evidence, not new deployed tests.

**Severity:** High = core workflow/integrity failure; Medium = functional, access, or operational problem; Low = presentation/usability concern. Original severities are preserved. The three engineering follow-up severities are proposed triage assessments.

**Priority:** P1 = investigate/address before Phase 1 closure; P2 = normal functional follow-up; P3 = presentation/performance follow-up. Priorities are proposed ordering, independent of evidence confidence. Owner decisions may change priority without changing the historical severity.

## Issue index

| ID | Source | Issue | Severity | Priority | Status | Evidence |
|---|---|---|---|---|---|---|
| [P1-001](#p1-001) | CR-01 | Booking date mapping breaks capacity and confirmation | High | P1 | Open | Reproduced |
| [P1-002](#p1-002) | CR-02 | Date-only values shift on Cairo-time hosts | Medium | P1 | Open | Reproduced |
| [P1-003](#p1-003) | CR-03 | Printing reveals multiple expanded invoices | Medium | P2 | Open | Source |
| [P1-004](#p1-004) | CR-04 | Refresh failure misreports a successful save | Medium | P2 | Open | Source |
| [P1-005](#p1-005) | CR-05 | Mobile workspace lacks sign-out control | Medium | P2 | Open | Source |
| [P1-006](#p1-006) | CR-06 | Receptionist sees seeded service durations | Medium | P2 | Open | Source |
| [P1-007](#p1-007) | CR-07 | Simulator state follows conversation selection | Medium | P2 | Open | Source |
| [P1-008](#p1-008) | GO-01 | Receptionist demo session fails | High | P1 | Open | Reported |
| [P1-009](#p1-009) | GO-02 | Technician demo session fails | High | P1 | Open | Reported |
| [P1-010](#p1-010) | GO-03 | Published-policy option appears to be a draft | High | P1 | Open | Reported |
| [P1-011](#p1-011) | GO-04 | Account-access page language differs from Arabic journey | Medium | P2 | Open | Reported |
| [P1-012](#p1-012) | GO-05 | Received/delivered Arabic labels are ambiguous | Medium | P2 | Open | Reported |
| [P1-013](#p1-013) | GO-06 | Disabled technician assignment has no clear reason | Medium | P2 | Open | Reported |
| [P1-014](#p1-014) | GO-07 | Vehicle dropdown overlaps/clips labels | Medium | P2 | Open | Reported |
| [P1-015](#p1-015) | GO-08 | Landing header brand alignment | Low | P3 | Open | Reported |
| [P1-016](#p1-016) | GO-09 | Access-model card appears skewed | Low | P3 | Open | Source + Reported |
| [P1-017](#p1-017) | GO-10 | Scrollbar appearance conflicts with theme | Low | P3 | Open | Reported |
| [P1-018](#p1-018) | GO-11 | Booking date/time digits and alignment differ | Low | P3 | Open | Source + Reported |
| [P1-019](#p1-019) | GO-12 | Required marker placement in Arabic booking form | Low | P3 | Open | Reported |
| [P1-020](#p1-020) | GO-13 | Native time field shows English AM text | Low | P3 | Open | Source + Reported |
| [P1-021](#p1-021) | GO-14 | Warranty tabs show stray scroll arrows | Low | P3 | Open | Reported |
| [P1-022](#p1-022) | GO-15 | Disabled warranty issuance lacks prerequisite guidance | Low | P2 | Open | Reported |
| [P1-023](#p1-023) | Review workflow concern 1 | Post-merge migrations precede build validation | Medium | P1 | Open | Risk |
| [P1-024](#p1-024) | Review workflow concern 2 | Build omits server type checking | Medium | P1 | Open | Source |
| [P1-025](#p1-025) | Review workflow concern 3 | Large eagerly loaded JavaScript bundle | Low | P3 | Open | Historical build |
| [P1-026](#p1-026) | User feedback / accepted operational scope | Operational WhatsApp journey and auxiliary scenario entry | Medium | P2 | Open | Reported |
| [P1-027](#p1-027) | User feedback / accepted operational scope | Six-number operational inbox and isolated demonstration layer | Medium | P2 | Open | Reported |
| [P1-028](#p1-028) | User feedback 2026-11-16 | Warranty workspace is overloaded and needs contextual editing | Medium | P2 | Open | Reported |
| [P1-029](#p1-029) | User feedback 2026-11-16 | Owner overview needs financial metrics and monthly trends | Medium | P2 | Open | Reported |
| [P1-030](#p1-030) | User feedback 2026-11-16 | Cross-industry UI/UX and workflow improvement discovery | Low | P2 | Open | Reported |
| [P1-031](#p1-031) | User follow-up 2026-11-16 | Owner and business discovery after product discussion | Low | P2 | Open | Reported |
| [P1-032](#p1-032) | Front research / user intake | Central inbox ownership, handoff, and unanswered-work visibility | Medium | P2 | Open | Reported |
| [P1-033](#p1-033) | Housecall Pro research / user intake | Owner report filters, trend views, and drill-down | Low | P2 | Open | Reported |
| [P1-034](#p1-034) | Jobber research / user intake | Separate quotes, collections, balances, costs, and profit | Medium | P2 | Open | Reported |
| [P1-035](#p1-035) | Fresha research / user intake | Contextual warranty forms and safe template lifecycle | Low | P2 | Open | Reported |
| [P1-036](#p1-036) | RepairDesk research / user intake | Stage-based action queues and optional operational columns | Low | P2 | Open | Reported |
| [P1-037](#p1-037) | Process Street research / user intake | Sequential forms with conditional steps and retained input | Low | P2 | Open | Reported |
| [P1-038](#p1-038) | User approval / product direction | Operational product, isolated demonstration layer and phased delivery | High | P1 | Open | Reported |
| [P1-039](#p1-039) | Approved Go Stores research additions | Structured catalogue, packages and accepted quotation versions | Medium | P2 | Open | Source + Reported |
| [P1-040](#p1-040) | Approved Go Stores research additions | Deferred promotion reservations and later installation | Medium | P2 | Open | Reported |
| [P1-041](#p1-041) | Approved Go Stores research additions | Fixed-term and lifetime warranty coverage semantics | High | P1 | Open | Source + Reported |
| [P1-042](#p1-042) | Approved Go Stores research additions | Included benefits and aftercare entitlement redemption | Medium | P2 | Open | Reported |
| [P1-043](#p1-043) | Approved Go Stores research additions | Vehicle transport and VIP service coordination | Medium | P2 | Open | Reported |
| [P1-044](#p1-044) | Approved Go Stores research additions | Promotion qualification, referral and multi-car redemption | Medium | P2 | Open | Reported |

## Technical issue details

Unless overridden in a dated update, every entry below inherits **Status: Open; Owner: Unassigned; Implementation: None recorded; Retest: Not performed**. Source paths point to the application, not `artifacts/mockup-sandbox/`. Line references in the source reports belong to their reviewed snapshot; use the symbols below when code moves.

<a id="p1-001"></a>

### P1-001 — Booking date mapping breaks capacity and confirmation

**Source:** CR-01; [operations API](../../apps/server/features/operations/api.ts), `capacityIssue` and pending-booking confirmation; [domain rule](../../packages/domain/src/rules.ts), `checkBookingCapacity`.

**Observed / technical basis:** `pg` parses SQL `DATE` as a JavaScript `Date`. `String(value).slice(0, 10)` produces text such as `Sun Nov 15`, while domain filtering requires `YYYY-MM-DD`. Existing confirmed bookings disappear from capacity calculations. Pending confirmation also passes malformed dates to SQL. The prior review reproduced the parser/domain mismatch without a database.

**Solution approach:** With P1-002, establish one server boundary that preserves SQL `DATE` as validated `YYYY-MM-DD` strings. Evaluate an explicit OID 1082 parser at database initialization or explicit SQL date-to-text projection; choose one consistent approach and audit all callers. Keep timestamp types unchanged. Use the same canonical date for capacity queries and advisory-lock keys across direct and simulator booking paths. Preserve transactions and authorization.

**Acceptance:** A full date rejects additional confirmed intake by daily and bay limits; an available date succeeds; cancelled/no-show records do not reserve capacity; a pending booking confirms once with the correct pickup date. Concurrent confirmations respect capacity using a disposable test database. Run existing pure rules and add coverage at the database-to-domain boundary.

**Dependency:** P1-002; both should share the representation change and be retested separately.

<a id="p1-002"></a>

### P1-002 — Date-only values shift on Cairo-time hosts

**Source:** CR-02; [bootstrap](../../apps/server/features/operations/bootstrap.ts), `dateValue`; [simulator date helpers](../../apps/server/features/whatsapp/whatsapp.ts); audit warranty date mappings as well.

**Observed / technical basis:** A SQL calendar date parsed at local midnight becomes the preceding UTC date when sliced through `toISOString()`. The historical `Africa/Cairo` reproduction changed `2026-11-15` into `2026-11-14`. UTC servers can mask the defect.

**Solution approach:** Adopt P1-001's date-only boundary and audit booking, pickup, warranty start/expiry, effective-date, and simulator round trips. Do not convert calendar dates into instants merely to format them. Retain UTC/ISO instant semantics for audit timestamps and other actual timestamps. Do not rewrite persisted business dates without separately establishing that stored values are wrong.

**Acceptance:** The same stored date round-trips unchanged under UTC and Africa/Cairo, including month/year boundaries, leap day, and Cairo offset changes. Warranty expiry remains correct. Date/time display changes in P1-018/P1-020 must not alter canonical stored values.

<a id="p1-003"></a>

### P1-003 — Printing reveals multiple expanded invoices

**Source:** CR-03; [invoice panel](../../apps/web/src/features/warranty/WarrantyInvoicePanel.tsx), `startBrowserPrint`; [print styles](../../apps/web/src/features/warranty/WarrantiesPage.css), `.w-invoice-print-area`.

**Observed / technical basis:** A global body class exposes every expanded invoice and absolutely positions the panels together. The selected invoice ID is not part of print isolation.

**Solution approach:** Track one active print target, reveal only that invoice and its ancestors as necessary, and clean up after print/cancel/unmount. Reuse the existing invoice ID. Keep invoice and QR print modes mutually exclusive and preserve draft disclaimers.

**Acceptance:** Expand at least two invoices with distinct fictional customers; printing either includes only the selected document. Verify print preview/PDF output in Arabic and English, multi-page output, cancellation, subsequent prints, and QR printing.

<a id="p1-004"></a>

### P1-004 — Refresh failure misreports a successful save

**Source:** CR-04; [store](../../apps/web/src/shared/store.tsx), `refresh` and mutation helpers; [app shell](../../apps/web/src/app/App.tsx), `WorkspaceError`.

**Observed / technical basis:** A mutation can commit before the subsequent bootstrap GET fails. `refresh` swallows its failure, sets global error status, and unmounts the workspace. The helper returns success while the error screen says nothing was saved.

**Solution approach:** Represent mutation outcome separately from refresh outcome. Preserve already-loaded data on transient refresh failures with an explicit stale-data warning and refresh-only retry. Replace inaccurate failure copy. Continue to handle actual authentication/authorization failures through the access flow; do not retain usable access after revocation. Avoid replaying a successful mutation automatically.

**Acceptance:** Force only the post-save bootstrap GET to fail: the user sees that saving succeeded, no second POST is sent, and refresh can recover. A failed mutation still reports failure. Initial-load and expired/revoked-session cases remain correct.

<a id="p1-005"></a>

### P1-005 — Mobile workspace lacks sign-out control

**Source:** CR-05; [app shell](../../apps/web/src/app/App.tsx), sidebar sign-out and mobile navigation; [responsive CSS](../../apps/web/src/shared/styles.css).

**Observed / technical basis:** The only ready-workspace sign-out action is inside `.sidebar`, hidden below 760px. Mobile page links do not provide account actions.

**Solution approach:** Add a reachable mobile account/sign-out action that calls the same existing logout handler, including demo-cookie cleanup. Give it a clear accessible name and enough space without covering page content.

**Acceptance:** At 375/768px and desktop, both Clerk and demo users can sign out; a subsequent protected request cannot reuse the ended session. Check keyboard access, Arabic/English copy, and mobile navigation overlap.

<a id="p1-006"></a>

### P1-006 — Receptionist sees seeded service durations

**Source:** CR-06; [bootstrap](../../apps/server/features/operations/bootstrap.ts), operating-settings query; [booking page](../../apps/web/src/features/bookings/BookingsPage.tsx), service selector; shared `configuredServiceHours`.

**Observed / technical basis:** Live setting rows are read only for owners/managers. Receptionists receive seed definitions marked active, although server capacity and pickup calculations use saved operating values. The current booking page does not perform client-side capacity rejection.

**Solution approach:** Provide a read-only, branch-scoped set of effective operating values needed by booking staff. Keep mutation privileges Owner-only. Remove the use of fictional defaults as purported active values when a real configured value exists; make missing configuration explicit.

**Acceptance:** Owner changes tint/ceramic hours; a receptionist refresh shows the same effective durations used by the server. Other-branch/private settings remain inaccessible and PATCH attempts remain forbidden.

<a id="p1-007"></a>

### P1-007 — Simulator state follows conversation selection

**Source:** CR-07; [WhatsApp simulation page](../../apps/web/src/features/whatsapp/WhatsAppSimulationPage.tsx), selection effect, booking drafts, status results, and composer.

**Observed / technical basis:** Draft/result/composer state is independent of selected conversation. Switching A→B can display A's state under B. Server draft ownership checks reject mismatched confirmation; no authorization bypass was established.

**Solution approach:** Either reset transient state on conversation/branch changes or key intentional unsent drafts by conversation. Bind async results and actions to the originating selection and ignore stale completions. Preserve existing server checks and simulator-only delivery restrictions.

**Acceptance:** Create drafts/results/text in A, switch to B, and verify no cross-display or cross-send. Test rapid switching while requests finish, switching branches, return-to-A behavior, and server rejection of deliberately mismatched draft IDs.

<a id="p1-008"></a>

### P1-008 — Receptionist demo session fails

**Source:** GO-01; [screenshot 8](assets/garage-os-ui-test-report/screenshot-08.png); [demo UI](../../apps/web/src/features/demo-auth/DemoAccountPanel.tsx), `startSession`; [session endpoint](../../apps/server/features/operations/api.ts), `POST /demo/session`; [demo provisioning](../../apps/server/features/auth/demo-auth.ts), `provisionDemoActor`.

**Observed:** The original Arabic development session failed for Demo Receptionist while Branch Manager worked. No backend cause was established.

**Technical investigation:** Capture sanitized HTTP status/code at POST, cookie acceptance, then `/api/bootstrap`. Check demo environment gating, branch existence, membership role/email/status, unique constraints, and existing-account conflicts. Provisioning handles conflict on membership ID; an independent unique-email conflict is one possible generic-error path, not an established cause. A generic UI error does not establish a cookie, schema, or permission defect. Compare role payloads against the working manager case; a manager succeeding in an unchanged environment makes a global missing-secret/branch problem less likely.

**Solution approach:** Correct only the reproduced provisioning/session failure and improve safe error-code mapping where needed. Keep production demo access disabled and never silently reactivate disabled identities or overwrite conflicting memberships. Review P1-009 with this shared flow without assuming a shared root cause.

**Acceptance:** Receptionist can start a development session, refresh, and access allowed booking/customer functions. Forbidden Owner/other-branch actions remain blocked. Disabled/conflicting accounts fail intentionally with useful messages; production demo endpoints remain unavailable.

<a id="p1-009"></a>

### P1-009 — Technician demo session fails

**Source:** GO-02; [screenshot 9](assets/garage-os-ui-test-report/screenshot-09.png); same demo flow as P1-008 plus [membership authorization](../../apps/server/features/auth/auth.ts) and technician bootstrap queries.

**Observed:** The original Demo Technician attempt displayed the same generic session error. Further technician testing was blocked.

**Technical investigation / solution approach:** Trace POST, cookie, membership, and bootstrap independently for Technician using P1-008's diagnostic sequence. Check whether failure occurs before or after role-scoped data loading. An empty assigned-job list must be a successful empty workspace, not a login failure. Fix the established cause without granting broader permissions or assigning real work as a workaround.

**Acceptance:** A technician with no jobs signs in and sees an empty state; one with fictional assigned work sees only that work. Other jobs, customer phones, and management actions remain restricted. Refresh, sign-out, disabled/conflicting identities, and production gating pass independently of Receptionist.

<a id="p1-010"></a>

### P1-010 — Published-policy option appears to be a draft

**Source:** GO-03; [screenshot 7](assets/garage-os-ui-test-report/screenshot-07.png); [warranty UI](../../apps/web/src/features/warranty/WarrantiesPage.tsx), `publishedPolicies` and `issue-policy`; [warranty routes](../../apps/server/features/warranty/warranties.ts); [development seed](../../apps/server/features/seed/seed-dev.ts).

**Observed:** The screenshot shows `Sample full PPF coverage · draft · v1` under Published policy. Original High severity is retained pending triage.

**Technical clarification from source inspection:** The current selector already filters `status === "published"` and renders `policy.name` verbatim. The seed gives a sample policy a name containing `· draft`; publishing changes status without necessarily changing that name. A published record retaining that name is a plausible explanation. The server also checks publication status. The screenshot does not prove draft-policy issuance or a filter bypass.

**Solution approach:** First compare screenshot build, actual status, policy name, and selected version using sanitized development data. If the problem is naming, separate lifecycle status from the display name and make status/version explicit; handle existing development sample names deliberately. If a real filtering defect is reproduced, correct it on both relevant boundaries. Do not auto-publish samples, enable draft issuance, or treat sample warranty terms as approved.

**Acceptance:** True drafts never appear as issuable and direct draft issuance is rejected. Published versions display an unambiguous name/status/version. Retired/ineligible versions stay unavailable and Owner publication still requires approved complete terms.

<a id="p1-011"></a>

### P1-011 — Account-access page language differs from Arabic journey

**Source:** GO-04; [screenshot 2](assets/garage-os-ui-test-report/screenshot-02.png); [app shell](../../apps/web/src/app/App.tsx), `AccessPending`; [auth shell](../../apps/web/src/app/AuthApp.tsx); [locale state](../../apps/web/src/shared/store.tsx).

**Observed:** The original account-not-assigned page was English-only in an Arabic journey, with only Sign out and no route back to demo selection.

**Technical clarification:** Current `AccessPending` already has Arabic/English text and reads document language. The landing page is hardcoded Arabic, while workspace locale can persist as English. This is a possible locale-propagation mismatch or older-build observation, not proof that translations are currently absent.

**Solution approach:** Reproduce with clean storage and saved English/Arabic preferences; trace language initialization before bootstrap failure. Use one explicit locale source for auth/access/loading/error states. Provide a deliberate recovery path to sign-out/demo selection only where development demo access is available; never bypass membership checks.

**Acceptance:** The access-pending page follows the chosen locale before and after refresh, including clean and persisted preferences. Arabic remains RTL, English LTR, and the user can recover without receiving unauthorized workspace data.

<a id="p1-012"></a>

### P1-012 — Received/delivered Arabic labels are ambiguous

**Source:** GO-05; [screenshot 3](assets/garage-os-ui-test-report/screenshot-03.png); [shared UI](../../apps/web/src/shared/ui.tsx), stage labels; [workshop page](../../apps/web/src/features/workshop/WorkshopPage.tsx).

**Technical basis:** Received and delivered are rendered as `اتسلمت` and `اتسلّمت`, distinguished by a shadda. Native select highlighting is also noted in the original observation, but it is separate from business-stage ambiguity.

**Solution approach:** Use distinct Arabic phrases describing vehicle receipt by the branch and delivery to the customer. Update shared labels consistently across filters, statuses, history, and actions. Retain stored stage keys and allowed transition rules.

**Acceptance:** A reader can distinguish both states without diacritics; filters match the intended records in both languages; no stage data migration or transition behavior change occurs.

<a id="p1-013"></a>

### P1-013 — Disabled technician assignment has no clear reason

**Source:** GO-06; [screenshot 4](assets/garage-os-ui-test-report/screenshot-04.png); [workshop assignment controls](../../apps/web/src/features/workshop/WorkshopPage.tsx); shared button styles.

**Observed / technical investigation:** The update action is disabled before selection and has low contrast. Inspect selection, available-technician, current-assignment, role, loading, and pending guards separately; do not assume all disabled states indicate missing selection.

**Solution approach:** Show a nearby localized reason for the active guard, associated with the control using `aria-describedby`. Clarify assignment wording and improve readable disabled styling. Do not enable requests with invalid assignment data or weaken server branch/role validation.

**Acceptance:** No selection, no eligible technicians, unchanged selection, and pending save each have accurate guidance. A valid changed selection enables the action. Keyboard and assistive-technology users can discover the explanation.

<a id="p1-014"></a>

### P1-014 — Vehicle dropdown overlaps/clips labels

**Source:** GO-07; [screenshot 6](assets/garage-os-ui-test-report/screenshot-06.png); [booking form](../../apps/web/src/features/bookings/BookingsPage.tsx), native vehicle select; [form styles](../../apps/web/src/shared/styles.css).

**Observed / technical investigation:** An open vehicle list obscures labels and appears to show underlying text. Native dropdown popups can cover content by design and are browser/OS-rendered. Capture browser, OS, zoom, native popup behavior, computed heights/line-height, and clipping/overflow before attributing the screenshot to a z-index defect.

**Solution approach:** Fix measured select/label/layout styling first. If a native-control limitation requires a custom control, use an accessible keyboard-compatible listbox/combobox and constrain that change to the affected field. Avoid global overflow/z-index overrides that break forms or navigation.

**Acceptance:** Open/closed selection remains readable with long fictional vehicle names, keyboard input, zoom, and RTL/LTR at 375/768/1024/1440px. Nearby labels are intact after selection and mobile native selection still works.

<a id="p1-015"></a>

### P1-015 — Landing header brand alignment

**Source:** GO-08; [screenshot 1](assets/garage-os-ui-test-report/screenshot-01.png); [landing markup](../../apps/web/src/app/AuthApp.tsx); shared `.landing-header` and `.brand` styles.

**Observed / technical investigation:** The brand block was flagged against the header divider. Inspect actual font metrics, logo dimensions, flex alignment, header padding, and breakpoint overrides; the original report does not establish a functional defect or desired pixel offset.

**Solution approach:** Align the brand and header action through shared layout spacing and line-height. Limit selectors to landing/auth contexts and review the resulting visual alignment against the design system.

**Acceptance:** Brand, divider, and action align consistently at target widths and 200% zoom without clipping, unintended wrapping, or horizontal overflow.

<a id="p1-016"></a>

### P1-016 — Access-model card appears skewed

**Source:** GO-09; [screenshot 1](assets/garage-os-ui-test-report/screenshot-01.png); shared `.landing-preview` styles.

**Technical basis:** The current stylesheet deliberately applies `transform: rotate(-1.3deg)` on larger layouts and removes it at a mobile breakpoint. The tester perceived that design choice as a rendering bug.

**Solution approach:** Use an unrotated card as the proposed Phase 1 presentation correction, preserving its role-description content and responsive layout. Record the chosen design treatment; do not rewrite access behavior.

**Acceptance:** The agreed card treatment is consistent across desktop/mobile and zoom, with no clipping or layout overflow. The access model remains informational, not a role-switching control.

<a id="p1-017"></a>

### P1-017 — Scrollbar appearance conflicts with theme

**Source:** GO-10; [screenshot 1](assets/garage-os-ui-test-report/screenshot-01.png); global page and scroll-container CSS in [shared styles](../../apps/web/src/shared/styles.css).

**Observed / technical investigation:** The native dark scrollbar differs from the light landing theme. Inspect browser/OS color-scheme and scrollbar settings, distinguishing page scrolling from existing mobile-navigation scrollbar styling.

**Solution approach:** Apply restrained theme-compatible scrollbar styling only where supported, retaining native fallback, visibility, usable width, and high-contrast behavior. Never hide the scrollbar or disable scrolling to satisfy the screenshot.

**Acceptance:** Scrolling remains discoverable and operable with mouse, touch, and keyboard across supported browsers, light/dark OS preferences, and forced-colors mode.

<a id="p1-018"></a>

### P1-018 — Booking date/time digits and alignment differ

**Source:** GO-11; [screenshot 5](assets/garage-os-ui-test-report/screenshot-05.png); [booking table](../../apps/web/src/features/bookings/BookingsPage.tsx), `dateLabel` output beside raw `booking.dropoffTime`; shared numeric and secondary-cell CSS.

**Technical basis:** Dates are localized, but times are rendered as raw `HH:mm` strings. Bidirectional text and differing cell styles can make time alignment inconsistent.

**Solution approach:** Centralize locale-aware time display alongside date display, using the selected numbering convention consistently. Isolate numeric runs with appropriate bidi markup and align the date/time group through logical layout properties. Preserve canonical date-only and `HH:mm` API values; formatting must not introduce timezone conversion.

**Acceptance:** Arabic and English each use a consistent digit/time convention. Single- and double-digit dates align with their times, including narrow tables and zoom. Stored booking dates/times remain unchanged; retest P1-001/P1-002.

<a id="p1-019"></a>

### P1-019 — Required marker placement in Arabic booking form

**Source:** GO-12; [screenshot 6](assets/garage-os-ui-test-report/screenshot-06.png); booking form labels and shared form CSS.

**Observed / technical investigation:** The customer-label asterisk placement is flagged. Current label text and marker can be separate inline content whose placement depends on RTL/bidi and line wrapping. Confirm the intended placement before adjusting all forms.

**Solution approach:** Use a consistent label/required-marker wrapper with logical gap/alignment, keep the marker with the label, and retain native `required` semantics. Provide accessible required information without relying on color or the asterisk alone.

**Acceptance:** Customer, vehicle, service, and date/time required labels have consistent placement in Arabic/English, remain intact when wrapping, and expose correct label/required semantics.

<a id="p1-020"></a>

### P1-020 — Native time field shows English AM text

**Source:** GO-13; [screenshot 6](assets/garage-os-ui-test-report/screenshot-06.png); `booking-time` input in the booking page.

**Technical basis:** The field uses native `input type="time"` with a canonical `HH:mm` value. Its visible picker and AM/PM labels can depend on browser/OS locale and hour-cycle settings; document language alone may not control them.

**Solution approach:** Reproduce on the reported browser when known, set the appropriate language context, and determine whether native presentation meets the agreed Arabic experience. If exact localization is required across supported platforms, use an accessible localized control with explicit hour-cycle handling. Do not store localized AM/PM strings or replace the field with unvalidated free text.

**Acceptance:** Users can enter and understand drop-off time in both languages via keyboard and mobile controls; submission remains valid `HH:mm`. Verify midnight/noon, leading zeros, and validation while keeping P1-018 display consistent.

<a id="p1-021"></a>

### P1-021 — Warranty tabs show stray scroll arrows

**Source:** GO-14; [screenshot 7](assets/garage-os-ui-test-report/screenshot-07.png); [warranty tabs](../../apps/web/src/features/warranty/WarrantiesPage.tsx), `.w-tabs`; [warranty styles](../../apps/web/src/features/warranty/WarrantiesPage.css).

**Observed / technical investigation:** Up/down arrows appear near the horizontal tab strip. Inspect computed overflow on both axes, inherited sizing, zoom, and browser scrollbar rendering. The screenshot does not establish which element owns the arrows.

**Solution approach:** Correct the identified container's height/overflow and retain intentional horizontal navigation for narrow widths. If controls are needed, make them deliberate and accessible; do not suppress all scrolling or clip focus outlines globally.

**Acceptance:** No unintended vertical controls appear, all tabs remain reachable and visibly selected, and focus indicators remain visible at target widths, RTL/LTR, and zoom.

<a id="p1-022"></a>

### P1-022 — Disabled warranty issuance lacks prerequisite guidance

**Source:** GO-15; [screenshot 7](assets/garage-os-ui-test-report/screenshot-07.png); warranty `currentIssuePolicy`, `eligibleIssueJobs`, issuance guards, and submit button.

**Technical basis:** The current button checks pending issuance, available delivered jobs, selected policy, and selected job. The page already explains absence of published policies/eligible work in some states, but missing selections may still leave the action disabled without an adjacent reason. The original screenshot is not a fresh reproduction.

**Solution approach:** Derive one validation/prerequisite result shared by button guidance and submission. Explain policy, eligible delivered job, conditional start date, duplicates, role access, and pending state accurately. Keep published-policy, delivered-job, branch, and server issuance checks intact.

**Acceptance:** Each unmet prerequisite has localized guidance; all valid prerequisites allow exactly one issuance. Draft/ineligible/duplicate/other-branch requests remain rejected. Retest with P1-010, including policies whose names contain lifecycle words.

<a id="p1-023"></a>

### P1-023 — Post-merge migrations precede build validation

**Source:** Repository review workflow concern 1; [post-merge script](../../scripts/post-merge.sh); [Replit hook](../../.replit); [migration runner](../../apps/server/infrastructure/database/migrate.ts).

**Technical basis / risk:** The hook installs dependencies, forces development mode for migration against ambient `DATABASE_URL`, and then builds. The environment label does not verify the actual database target. A later build failure does not undo applied migrations. This is a deployment/data-safety risk, not evidence of an observed production incident.

**Solution approach:** Document the intended hook target and release sequence. Propose validation before database mutation, explicit target verification without logging credentials, and backward-compatible migrations. Assess rollback/restore and running-app compatibility separately from SQL transaction rollback. Preserve the existing hook path and Replit integration; changes to those controls require explicit user direction under canonical instructions.

**Acceptance:** A failed validation cannot trigger a migration in the proposed sequence; an incorrect/unapproved target is rejected before writes. Rehearse successful and failed migrations only against a disposable database. Record a recovery procedure and confirm Replit workflow compatibility.

<a id="p1-024"></a>

### P1-024 — Build omits server type checking

**Source:** Repository review workflow concern 2; [npm scripts](../../package.json), [root references](../../tsconfig.json), and [server TypeScript config](../../tsconfig.server.json).

**Technical basis:** `build` runs `tsc -b` using app/node references; the server config is checked separately by `typecheck`. Build-only validation can therefore miss backend TypeScript failures, even though the historical standalone typecheck passed.

**Solution approach:** Add `npm run typecheck` explicitly to required validation before deployment/post-merge mutation, or integrate a compatible server checking step into the build workflow. Do not add the current server config blindly as a project reference without reviewing composite/no-emit requirements. Keep root start/dev command paths stable.

**Acceptance:** In an isolated fixture or temporary checkout, a deliberate server type error fails the required release gate. A clean repository passes web/server checking and build. No test defect is left in application source.

<a id="p1-025"></a>

### P1-025 — Large eagerly loaded JavaScript bundle

**Source:** Repository review workflow concern 3; historical 654.68 kB minified bundle; [app imports](../../apps/web/src/app/App.tsx) and [Vite config](../../vite.config.ts).

**Technical basis / limit:** Feature pages are eagerly imported, and the recorded build exceeded Vite's 500 kB advisory threshold. That warning alone does not prove unacceptable user latency; no target-device performance budget or runtime profile was recorded.

**Solution approach:** Measure initial transfer/parse time and route usage on representative devices. Introduce route/feature-level lazy loading with localized loading/error handling for heavy screens, then measure again. Consider dependency-specific chunking only where measurements justify it. Do not merely raise the warning threshold or remove required features.

**Acceptance:** Record comparable before/after build and initial-load metrics against an agreed budget. Direct navigation, route switching, auth transitions, and warranty/QR/print workflows still work. Failed chunk loading offers recovery without discarding saved data.

## Proposed execution order and shared work

| Order | Entries | Reason / boundary |
|---|---|---|
| 1 | P1-001, P1-002 | Shared date-only contract; integrity and booking workflow first |
| 2 | P1-008, P1-009 | Restore test access for both affected demo roles; diagnose each independently |
| 3 | P1-010, P1-022 | Resolve policy-name/status ambiguity and accurate issuance prerequisites |
| 4 | P1-023, P1-024 | Establish safe validation/release sequence before integrating fixes |
| 5 | P1-003–P1-007 | Printing, truthful saves, mobile session exit, effective settings, simulator isolation |
| 6 | P1-011–P1-021 | Localized copy, clear stage names, forms, responsive styling; honor individual acceptance checks |
| 7 | P1-025 | Profile and improve loading after correctness is stable |

This is sequencing guidance, not a schedule or authorization to start implementation. If deployment is imminent, resolve P1-023/P1-024 before release activity. Shared localization work can cover P1-011/P1-012/P1-018/P1-019/P1-020; preserve each issue's independent evidence and status.

## Regression baseline and Phase 1 closure

The repository review recorded `npm run typecheck` passing, 44 tests passing with two database integrations deliberately skipped, and a successful build with the bundle warning. These are historical results from 14 November, not evidence that any tracked issue is fixed. No frontend test files were present in the reviewed application source.

For source changes, run required typecheck, unit tests, and build. Add focused regression tests for the behavior being fixed. Database integration coverage requires an explicitly identified disposable `GARAGE_TEST_DATABASE_URL`; never use a shared Replit or production database. No migration or seed is required to edit this tracker.

For UI retests, record build/commit, browser/version, OS, viewport/zoom, role, branch, locale, fictional fixtures, steps, and sanitized screenshots. Cover all four roles, Arabic/RTL and English/LTR, and 375/768/1024/1440px where relevant. Test protected actions through the API as well as visible navigation. Include print preview for P1-003 and request-failure scenarios for P1-004/P1-007.

Preserve the existing server authorization, restricted technician data, transaction/uniqueness safeguards, hashed verification tokens, approved public fields, private evidence controls, Replit port/entry paths, and app/domain dependency boundaries. Keep public verification Owner-gated and WhatsApp provider delivery disabled. Do not silently change draft warranty terms or seeded values into approved business policy.

Before describing Phase 1 as complete, each required entry must have passing acceptance evidence or an explicit Owner-approved deferral with reason. Phase 1 completion does not establish production readiness: deployed Clerk/origin configuration, real database/storage integration, backup/restore, monitoring, and business-policy approval require separate recorded verification. Inventory/POS/live messaging are not implicitly added to this phase.

## New issue intake template

Copy this block outside the code fence, replace placeholders, and append it before the change log. Add an index row and advance the next-ID pointer. If an observation is incomplete, retain it as Open / Reported and state what is missing.

```markdown
<a id="p1-NNN"></a>

### P1-NNN — Short, specific user-visible problem

**Reported:** YYYY-MM-DD; reporter/source  
**Updated:** YYYY-MM-DD  
**Area:** Feature / client / server / workflow  
**Severity:** High / Medium / Low; rationale  
**Priority:** P1 / P2 / P3; proposed or agreed  
**Status:** Open  
**Owner:** Unassigned  
**Evidence:** Reported / Source / Reproduced / Risk  
**Original IDs / related issues:** None or references

**Environment:** Build/commit, browser/OS, role/branch, locale, viewport/zoom;
unknown fields explicitly marked unknown. No secrets or real customer data.

**Steps:** Preconditions and numbered actions using fictional records.

**Expected:** Intended behavior; flag policy/design assumptions.

**Actual / impact:** What happened and who is affected.

**Technical details:** Relative source links, symbols/endpoints, established
mechanism, diagnostic gaps, and separately labeled hypotheses.

**Solution approach:** Smallest safe change, compatibility constraints,
dependencies, and alternatives only where unresolved.

**Acceptance / verification:** Specific passing behavior, negative cases,
roles/locales/widths, and appropriate automated/manual checks.

**Implementation:** None recorded; later add changed files, commit/PR,
migration needs, recovery considerations, and remaining limits.

**Retest:** Not performed; later add date, tester, build, checks/results,
sanitized evidence links, and final status decision.

**History:** YYYY-MM-DD — Intake recorded.
```

## User feedback topics — 16 November 2026

These are product-change requests and discovery tasks, not newly reproduced defects. Severity and priority are provisional triage values. All six inherit **Implementation: None recorded; Retest: Not performed**. Research progress does not mean the requested product behavior exists. The user requested discussion where intent is unclear and will explain the WhatsApp behavior in subsequent steps.

| Topic | Entries | Discussion dependency |
|---|---|---|
| WhatsApp demo and operational inbox | P1-026, P1-027 | Entry, RBAC, and two-sided layout clarified; exact conversation and automation rules pending |
| Warranty usability | P1-028 | Which sections start collapsed and what add/remove actions mean |
| Owner financial overview | P1-029 | Priority metrics, financial definitions, available source data |
| Overall UI/UX and workflow opportunities | P1-030 | Discuss research findings and select improvements |
| Next task: owner and business research | P1-031 | Begin after the preceding topics have been discussed |

**WhatsApp clarification, 2026-11-16:** Outside selection opens the specified demo user's workspace with only that user's permitted data, pages, and actions (RBAC). The WhatsApp demo itself has two sides: customer conversation/input and the selected user's agent dashboard/navigation, showcasing auto-replies and selectable list choices. Synchronizing the same fictional interaction across both sides is the proposed behavior. Exact conversation content and agent handoff triggers remain to be discussed.

### Shared intake evidence and limits

**Reported / updated:** 2026-11-16; direct user feedback in this session.
**Environment:** Build/commit, browser/OS, branch, locale, viewport/zoom, exact URLs, reproduction steps, and screenshots were not supplied. Owner role is explicit for P1-029; affected roles for the other topics remain to be confirmed.
**Evidence:** Reported. Source inspection below provides context only; it does not reproduce the user's experience.
**Status / owner:** Open / Unassigned for each entry. Record answers as dated updates without replacing this original intake.

<a id="p1-026"></a>

### P1-026 — Operational WhatsApp journey and auxiliary scenario entry

**Title updated — 2026-11-16:** Formerly WhatsApp simulator experience and direct demo entry. Historical intake below is preserved; the accepted operational-scope update supersedes its demo-first framing.

**Area:** WhatsApp simulation / external demo-user selection.
**Severity / priority:** Medium / P2, proposed; reported workflow dissatisfaction.
**Related:** P1-007 (conversation isolation), P1-008/P1-009 (demo access), P1-027 (shared inbox).

**Actual / impact:** The user finds the simulation very poor, boring, and functionally different from the intended experience. Specific failed actions have not yet been described.

**Expected — user request:** Improve the simulation and connect it directly from the demo-user selection on the outside page. Apply the detailed behavior the user will explain in subsequent steps.

**Source context:** [Simulator](../../apps/web/src/features/whatsapp/WhatsAppSimulationPage.tsx), [demo-user panel](../../apps/web/src/features/demo-auth/DemoAccountPanel.tsx), and [auth flow](../../apps/web/src/app/AuthApp.tsx). The current selector chooses staff demo identities. The clarification below requests a simulated customer side alongside the staff side; it does not establish a new customer login role.

**Confirmed clarification — 2026-11-16:** Selecting a demo user outside opens that specified user's workspace, respecting RBAC for everything the user can access or see. The WhatsApp demo page is divided into two sides: (1) what the customer sees and inputs, and (2) the agent dashboard, showing what the selected user sees and how to navigate it. Showcase auto-replies and selectable list choices as part of the interaction. The request does not require every role to land directly on WhatsApp or grant inbox access to otherwise unauthorized roles.

**Proposed approach / remaining discussion:** Connect both sides to the same fictional conversation so customer inputs/list selections, automatic responses, and permitted staff replies stay synchronized. Preserve actual selected-user permissions rather than giving the demo a universal agent view. Confirm the initial greeting, list options, reply sequences, handoff trigger, reset behavior, and how the two sides adapt to narrow screens. These details are not yet approved.

**Acceptance — provisional:** The agreed outside selection opens the intended demo journey without redundant setup; chosen role/branch permissions still apply. The user can complete the agreed fictional messaging scenario and see its intended operational result. Conversation state remains isolated under P1-007; no external messages are sent. Confirm behavior in Arabic/English and on mobile/desktop after the journey is agreed.

**Additional acceptance from clarification:** Outside selection starts the specified demo identity's workspace. On the WhatsApp demo page, both customer and agent sides are visible on a wide screen. The customer can type a message and select a demonstrated list choice; the corresponding automatic response is visible to the customer and the same interaction is reflected on the agent side. The agent side supports the selected user's permitted navigation/actions only. Unauthorized roles cannot acquire inbox data or actions through the demo UI, direct routes, or API calls. Exact reply content and timing remain pending.

**History:** 2026-11-16 — Intake recorded; exact demo journey awaits user explanation.

**Update:** 2026-11-16 — User clarified role-based workspace entry, a two-sided customer/agent demo, and demonstration of auto-replies/list choices. Recorded only; no implementation or retest performed.

**Assumed full-flow proposal — 2026-11-16:** The user authorized assuming the greeting, choices, and functional sequence, and explicitly requested **no code changes now**. The [complete demo-flow proposal](../product/WHATSAPP_DEMO_FLOW_PROPOSAL.md) records proposed bilingual greeting/menu, service enquiry, booking and staff approval, verified status lookup, reschedule/cancel, warranty help, branch information, human handoff, and recovery/reset scenarios. Assumptions are demo defaults, not approved business policy. Existing confirmation settings and actual role/branch permissions control outcomes; no universal demo privileges are introduced. This replaces the need to obtain every conversation detail before drafting; the overall proposal remains available for discussion.

**Latest confirmed requirement — 2026-11-16:** The main automated journey is requested branch/service → check actual available booking times at that branch → customer selects a preferred available time → collect required missing customer/vehicle information → customer reviews/confirms → automatically create a confirmed booking in Garage OS. A valid automated booking does **not** require staff approval. Handoff occurs on customer request or an enquiry outside supported options. This supersedes staff approval as the proposed primary path above. The linked flow proposal has been rewritten accordingly; actual settings/code remain unchanged under the user's no-code instruction.

**Additional acceptance / dependencies:** Availability is branch/service-specific, reflects actual time/capacity constraints, and is rechecked atomically at confirmation. Conflicts offer refreshed times while preserving input; repeated confirmation/retries create at most one booking. Confirmation text follows successful persistence. The authorized agent view shows the linked booking; automatic success does not require agent claim. Resolve P1-001/P1-002 and reconcile the current `booking-confirmation` setting with the requested automatic path during future implementation. Handoff preserves source number, requested branch, original enquiry, and collected context without committing an incomplete booking.

**Accepted operational scope update — 2026-11-16:** The user approved the research-derived additions and explicitly replaced demo-first framing with a full functional product. The customer enquiry/availability/automatic-booking/handoff journey is operational behavior; the two-pane fictional customer scenario, selector and reset are auxiliary presentation/training controls under P1-038. Incorporate vehicle category/model, selected package/coverage, standalone services and scoped quote context from P1-039; retain valid input across handoff. Actual prices, durations and policy answers must come from configured approved records, not scraped posts. Preserve six-number central-team behavior, atomic booking and RBAC. Prior no-code notes remain the history of earlier documentation tasks; this tracker update performs no runtime change.

<a id="p1-027"></a>

### P1-027 — Six-number operational inbox and isolated demonstration layer

**Title updated — 2026-11-16:** Formerly shared WhatsApp inbox in production and demo views. Historical intake below is preserved; functional operational behavior is primary and scenario controls are auxiliary.

**Area:** Operational inbox / demo parity / future provider integration.
**Severity / priority:** Medium / P2, proposed; intended operational workspace differs from the simulator.
**Related:** P1-026; [WhatsApp specification](../engineering/WHATSAPP_SPEC.md).

**Expected — user request:** Keep the real WhatsApp shared-inbox experience in both production and demo views, with the integration missing for now. Detailed application will follow the user's next-step explanation.

**Confirmed clarification — 2026-11-16:** The agent side of the two-sided WhatsApp demo shows the selected user's dashboard and navigation under that user's RBAC. The customer side provides the fictional inputs and list selections needed to demonstrate auto-replies and their corresponding agent-visible conversation. The two-sided showcase is requested for the demo; production retains the authorized staff inbox experience with integration disconnected for now.

**Current-state limit:** Repository instructions describe WhatsApp as a development simulator with provider delivery disabled. This intake does not establish that a real shared inbox or live integration already exists. It records the desired operational interface in both views.

**Proposed approach / open discussion:** Treat the staff inbox and simulation controls as distinct responsibilities; agree how the simulator feeds the demo inbox and what disconnected production users can see/do. Assignment, internal notes, filters, customer/job context, and handoff are research candidates, not agreed requirements. Preserve role/branch authorization. Adding the interface does not enable a provider or authorize live delivery.

**Acceptance — provisional:** Authorized staff can reach the agreed shared-inbox interface in production and demo views. Demo conversations drive the agreed inbox workflow with fictional data. An unconnected production inbox clearly reflects its connection state and never presents a simulated send as a delivered provider message. Simulator tools and fictional records cannot leak into real customer activity. Final workflow criteria await the user's explanation.

**History:** 2026-11-16 — Separate intake because inbox parity and demo-entry behavior have different closure checks.

**Update:** 2026-11-16 — Linked the confirmed two-sided demo to the operational inbox and selected-user RBAC. Exact staff interactions and disconnected production behavior still need discussion; implementation remains unstarted.

**Assumed staff sequence — 2026-11-16:** See the [demo-flow proposal](../product/WHATSAPP_DEMO_FLOW_PROPOSAL.md): branch queue → claim → permitted reply/internal note → linked operational navigation → pending/resolved → reopen on customer activity. Bot responses pause during human handling and resume explicitly. The customer and agent panes reflect one fictional interaction; staff-only notes stay private. Production retains a disconnected staff inbox without customer-simulation controls. These are documented assumptions only; no implementation or retest performed.

**Latest confirmed core scope — 2026-11-16:** One shared inbox consolidates conversations from **six WhatsApp business phone numbers**, with the automatic branch-availability booking journey in P1-026 and human handoff for requests/out-of-options enquiries. Preserve the receiving business number and reply through that same number; source number, requested booking branch, operational queue, customer, and assignee are distinct context. The demo uses six fictional channels; no provider connection is made now.

**Additional acceptance — proposed details:** Consolidated and per-number filtered views respect RBAC/branch scope; the inbox does not grant all staff access to all six numbers. Keep the same customer's conversations across numbers distinguishable, prevent duplicate event processing, and preserve context through cross-branch routing. Human handoff pauses automation and requires the normal authorized claim/reply process. Production connection states remain honest and demo traffic stays isolated.

**Confirmed routing answer — 2026-11-16:** **One central team** handles all six WhatsApp numbers across supported booking branches. Human handoffs go to one central queue; the receiving number remains the reply channel, and the requested branch determines booking availability. Changing requested branch preserves the central conversation and assigned agent. This supersedes earlier assumed branch-queue routing and resolves the central-versus-branch-team question.

**Access requirement / implementation gap:** Authorized central-team members need all six channels and necessary cross-branch customer/availability/booking context, while other users keep their role/branch restrictions. Central membership does not grant owner settings, financial reporting, warranty approval, or unrelated workshop controls. Current branch-based authorization must be explicitly adapted during implementation; no access or configuration changes were made now. Verify centralized six-channel handling, branch changes without reassigning the conversation, and denial for users outside authorized coverage.

**Accepted operational scope update — 2026-11-16:** One functional shared inbox is required for the six-number central team; scenario panes are an isolated layer over the same business workflow, not an alternative product. Source number, requested branch, agent, customer/vehicle and accepted quote/package context must persist through navigation and handoff (P1-039/P1-040). Receiving number remains the reply channel. Live provider readiness, webhook validation, idempotent events, retry/failure visibility and truthful delivery states belong in the full plan; approval does not configure credentials or enable sending. The operational UI must report missing connections honestly.

<a id="p1-028"></a>

### P1-028 — Warranty workspace is overloaded and needs contextual editing

**Area:** Warranty policies / coverage / claims / history / verification.
**Severity / priority:** Medium / P2, proposed; information overload affects workflow usability.
**Related:** P1-003 (invoice printing), P1-010 (policy naming/status), P1-021 (tabs), P1-022 (issuance guidance).

**Actual / impact:** The user feels the warranty pages are bloated and expose too much information at once.

**Expected — user request:** Make information expandable; support editing and adding/removing where appropriate, with less visible at once.

**Source context:** [Warranty workspace](../../apps/web/src/features/warranty/WarrantiesPage.tsx) already has policy, coverage, claims, history, and verification tabs. Policy forms can still expose extensive fields. Published policy versions are immutable; editing a draft and changing published terms have different consequences.

**Proposed approach:** Show compact summaries with detail and forms opened on demand. Offer relevant actions near the selected record. Preserve validation, permissions, historical coverage, and policy versioning while improving discoverability.

**Open discussion:** Which content must remain visible at a glance? Does add/remove mean policy terms, evidence items, whole records, or personal screen sections? Confirm behavior by entity; do not interpret the request as permission to delete issued coverage, history, or published terms.

**Acceptance — provisional:** The agreed default view shows summaries and primary actions; users can expand details and access permitted create/edit/remove actions without navigating through unrelated information. Unsaved input and validation remain usable when sections open/close. Published policy changes retain versioning and historical records. Retest issue, claim, invoice/print, evidence, and verification journeys across authorized roles, both languages, and mobile/desktop.

**History:** 2026-11-16 — Intake recorded; editable/removable entities and initial collapsed state need discussion.

<a id="p1-029"></a>

### P1-029 — Owner overview needs financial metrics and monthly trends

**Area:** Owner dashboard / reporting / financial data.
**Severity / priority:** Medium / P2, proposed; missing owner decision support.
**Related:** P1-030; P1-031 for business-specific definitions.

**Actual / impact:** The user wants the owner overview rearranged and corrected, with more monetary figures, profit figures, trend lines, months, and time comparisons.

**Source context:** [Overview](../../apps/web/src/features/overview/OverviewPage.tsx) currently emphasizes active vehicles, pending bookings, ready jobs, handoffs, and workshop status. Two summary cards derive from the same active-job count. Full accounting/POS is not implemented; invoice drafts alone do not establish collected revenue or profit.

**Expected — user request:** A clearer owner overview with financial metrics and trends over time.

**Proposed approach:** Agree the decisions the dashboard should support, then prioritize a concise financial summary, selectable periods, trend charts, and detail access. Revenue, cash collected, unpaid balances, direct costs, gross profit, net profit, branch/service comparisons, and prior-period changes are candidate metrics only. Define each selected metric's inputs and calculation before implementation. Missing data must appear as unavailable; demo values must be labeled fictional.

**Open discussion:** Which money figures matter first? What does the owner mean by profit, and where will costs, payments, refunds, and overhead come from? Confirm month boundaries, currency, branch aggregation, and comparison rules during discovery rather than inventing business policy.

**Acceptance — provisional:** Agreed metrics and charts use consistent period/branch filters and trace to their source records. Agreed monthly trends and comparisons handle empty periods, missing inputs, and a zero comparison base honestly. Owner financial access is enforced by the API as well as the UI. Fictional fixtures validate calculations once definitions are agreed; drafts cannot silently become booked revenue or profit.

**History:** 2026-11-16 — Intake recorded; financial definitions and data availability remain unresolved.

**Accepted business-research extension — 2026-11-16:** Owner visibility must cover real operational exceptions as well as financial summaries: unhandled quote requests, upcoming/missed recorded pickup commitments, outstanding promised benefits, transport exceptions and claims requiring authorized decisions. P1-033 owns shared filters/drill-down, P1-034 monetary definitions and P1-036 work queues. Use persisted source records and agreed due/eligibility semantics from P1-039–P1-043; do not infer a promise from an ETA or manufacture profit from quotes. Avoid duplicate dashboards or implementation tasks for this extension.

<a id="p1-030"></a>

### P1-030 — Cross-industry UI/UX and workflow improvement discovery

**Area:** Product-wide usability / workflow research / feature prioritization.
**Severity / priority:** Low / P2, proposed; discovery opportunity, not a reproduced defect.
**Related:** P1-026–P1-029 and existing localized/mobile usability findings P1-011–P1-022.

**Expected — user request:** Preserve the overall direction while identifying further UI/UX work, useful features, and fixes. Search comparable management/workflow products across automotive and other niches and discuss findings with the user.

**Research record:** [Cross-industry workflow research and discussion notes](../product/WORKFLOW_PRODUCT_RESEARCH_2026-11-16.md). Official product/help sources are linked there; facts are separated from suggested Garage OS adaptations.

**Proposed approach:** Compare patterns against real Garage OS journeys rather than adding features by count. Start with reduced visual density, contextual actions, clear next steps, accountable handoffs, and reporting detail on demand. Keep speculative additions separate from reported defects and accepted requirements.

**Acceptance:** Present sourced comparisons from multiple niches, the problems each pattern solves, relevant Garage OS opportunities, and tradeoffs/dependencies. Discuss the shortlist with the user; record chosen, rejected, and postponed ideas, then create concrete implementation criteria for selected work. Research collection alone does not close this discussion task.

**Progress:** 2026-11-16 — Initial web research recorded; user discussion and selection pending.

**User intake update — 2026-11-16:** The user requested adding **all six researched patterns**, including suggested Garage OS behavior, to Phase 1. Concrete follow-ups are P1-032–P1-037 below. Inclusion in the tracker is confirmed; detailed interaction choices, financial definitions, and business policies remain proposals where noted. This discovery entry remains Open as an umbrella; future progress should be recorded against the specific follow-up criteria without duplicating their implementation work.

**History:** 2026-11-16 — Intake recorded; no product redesign or feature implementation authorized by this discovery entry alone.

<a id="p1-031"></a>

### P1-031 — Owner and business discovery after product discussion

**Area:** Next-task discovery / business operating model.
**Severity / priority:** Low / P2, proposed; planning follow-up, not a defect.
**Dependency:** User requested this as the next task after the preceding topics.

**Expected — user request:** Research the owner and the business itself after this feedback/research discussion.

**Existing context:** [Owner meeting playbook](../product/OWNER_MEETING_PLAYBOOK.md) already covers branches, service catalogue, bookings, workshop/QC, WhatsApp, warranty, finance, reporting, and unresolved decisions. It explicitly does not establish owner-approved operating policy.

**Open discussion for that task:** Confirm the business identity/public links, intended owner context, research questions, and desired outcome before attributing facts to any person or company. Reuse existing discovery material and distinguish public facts, user statements, and hypotheses.

**Acceptance:** Once that task begins, produce a sourced business brief and tailored owner discussion agenda; record confirmed operating facts and unresolved decisions. No operating policies change solely because research suggests them.

**Initial progress (historical):** Queued as an Open follow-up; research had not started at intake. **Updated 2026-11-16:** Sourced research is now saved in the fact register/dossier; unresolved owner-policy validation remains Open. See the accepted research update below.

**History:** 2026-11-16 — Follow-up recorded in the user's requested sequence.

## Research-derived improvement topics — 16 November 2026

The user explicitly requested all six findings and their Garage OS adaptations in Phase 1. These entries break down the broad feedback in P1-027–P1-030 into independently reviewable outcomes; they do not replace the original observations or represent additional reproduced defects. Parent issues keep their overall experience criteria; the specific deliverables below should have one implementation record each, linked back to the parent rather than implemented twice.

**Shared intake:** Reported / updated 2026-11-16; source is the user's request to add the discussed research findings. Status Open; owner Unassigned; implementation None recorded; retest Not performed for all six. Evidence is Reported, with official product documentation as pattern references, not proof of a Garage OS defect. Severity/priority are provisional triage values. Browser, build/commit, OS, exact URL, viewport, reproduction steps, and screenshots were not supplied; these are feature proposals rather than browser-specific failure reports. [Research notes](../product/WORKFLOW_PRODUCT_RESEARCH_2026-11-16.md) preserve the comparison context. No code/configuration changes are authorized by this documentation update.

| Topic | Specific entry | Existing parent / boundary |
|---|---|---|
| Shared-inbox teamwork | P1-032 | P1-027 owns six-number consolidation and central-team access; this entry owns daily triage and accountability |
| Owner reporting interaction | P1-033 | P1-029 owns overall dashboard redesign; this entry owns time filters, chart views, and drill-down |
| Trustworthy financial figures | P1-034 | P1-029 owns presentation; this entry owns definitions, source data, and calculation integrity |
| Warranty information density and lifecycle | P1-035 | P1-028 owns overall warranty usability; this entry owns contextual forms and draft/archive/issued-record behavior |
| Operational work discovery | P1-036 | P1-030 owns broader research; this entry owns stage/action queues across existing workflows |
| Guided task completion | P1-037 | P1-026 owns the WhatsApp journey; this entry owns reusable sequential/conditional interaction rules across booking and warranty tasks |

**Research progress / accepted use — 2026-11-16:** Public and authorized-browser research is collected in the [33-fact register](../product/GO_STORES_FACTS_2026-11-16.md), [meeting dossier](../product/GO_STORES_MEETING_DOSSIER_2026-11-16.md) and linked evidence ledgers. This supersedes the earlier queued/not-started status of the research activity; P1-031 remains Open because current branch roster, approved prices/terms, authority and detailed operating decisions are still unconfirmed. The user approved all recommended feature directions, mapped to P1-038–P1-044 and extensions of existing inbox/reporting work. Published promotions and profile roles are not approved policy or automatic staff access; do not repeat completed research or ask for supplied profile links again.

<a id="p1-032"></a>

### P1-032 — Central inbox ownership, handoff, and unanswered-work visibility

**Reported / updated:** 2026-11-16; user-requested research intake.
**Area:** WhatsApp / central-team triage.
**Severity / priority:** Medium / P2, proposed; handling responsibility can affect customer follow-up.
**Related:** P1-027 (six-number central inbox), P1-026 (customer automation), P1-007 (conversation isolation).

**Finding:** Front documents shared inboxes, conversation assignment, internal comments, tags, snoozing, and rules. [Official reference](https://help.front.com/en/articles/2157).

**Suggested Garage OS behavior:** Give the central team one queue across all six numbers, with practical views for Unassigned, Assigned to me, Waiting, and Resolved. Each conversation shows receiving business number, requested branch, current agent, bot/human state, latest inbound activity, and whether a human response is due. Provide claim, authorized reassignment, pending, resolve, and reopen actions. Keep internal notes visually distinct and staff-only. Preserve the same agent when the customer changes booking branch; reply through the original receiving business number.

**Suggested sequence:** Automation handles supported booking requests → explicit agent request/unsupported enquiry immediately pauses intent auto-replies and enters the central unassigned queue → an agent claims and sees the collected context → agent replies or records a private note → agent marks pending/resolved as appropriate. Bot handling remains paused while queued and during human handling until explicitly resumed. New customer activity reopens resolved work without silently restarting the bot. Fully automated successful bookings do not become unanswered human tasks.

**Dependencies / decisions:** Central-team authorization under P1-027; concurrency-safe assignment; approved definitions of waiting and response due. Distinguish time since last inbound message from time requiring a human reply. Any SLA thresholds, working-hours escalation, snooze, or external alerts remain separate policy choices; do not activate assumed thresholds.

**Acceptance:** Authorized central staff can triage all six channels and find unassigned/human-response-due conversations. Competing claims preserve a single owner; only permitted agents reply. Internal notes never reach the customer side. Handoff carries original enquiry, branch, slot, and booking context; branch changes preserve ownership. Filters do not hide relevant work permanently, automated success is not labeled overdue, and unauthorized users cannot read conversations through UI/API. Cover both languages, keyboard use, and mobile layouts.

**Implementation / retest:** None recorded / Not performed. No new provider integration or alerts enabled.

**Accepted fact-informed handoff — 2026-11-16:** Carry model/category, service intent, chosen grade/package, coverage/roof/add-ons, relevant promotion reservation and prior quote reference into the central queue. Support enquiries outside fixed packages (standalone insulation, modifications, transport/aftercare) without inventing prices or eligibility. Preserve source-channel and selected-branch context; agents see only authorized data. P1-039 owns structured quote data and P1-040 offer reservation, so this issue consumes those interfaces rather than building separate copies.

<a id="p1-033"></a>

### P1-033 — Owner report filters, trend views, and drill-down

**Reported / updated:** 2026-11-16; user-requested research intake.
**Area:** Owner dashboard / reporting interaction.
**Severity / priority:** Low / P2, proposed; owner analysis usability.
**Related:** P1-029 (overall financial overview), P1-034 (trusted metrics).

**Finding:** Housecall Pro documents global date ranges, day/week/month/quarter/year grouping, chart/table views, rearrangeable report cards, and drill-down reports. [Official reference](https://help.housecallpro.com/en/articles/6577580-reporting-dashboard).

**Suggested Garage OS behavior:** Start the owner overview with a compact row of agreed financial summaries and a prominent period/branch filter. Offer month, year-to-date, and custom ranges, with suitable day/week/month trend grouping. A selected metric opens a detailed report using the same filters and showing its source records. Provide a table alternative to charts. Optional card rearrangement/hide/show can let the owner choose emphasis, while retaining a simple useful default rather than exposing every report at once.

**Suggested sequence:** Owner selects a month and branch/all supported branches → summaries and trend charts refresh together → compare with an explicitly labeled previous equivalent period → select a figure or chart period → inspect contributing records → return with filters preserved. Save layout preferences only if customization is included in the agreed implementation.

**Dependencies / decisions:** P1-034 supplies approved calculations and source completeness. Confirm calendar/timezone, default range, comparison behavior, metric shortlist, and whether persistent card customization is needed. Proposed initial currency is the business-configured currency; do not infer it from location. Missing source data is unavailable, not zero.

**Acceptance:** Every card/chart/report uses the same selected filters and states its period, grouping, currency, and comparison. Drill-down reconciles with the selected total under the documented calculation/rounding rules. Empty periods and zero comparison bases do not yield misleading percentages. Optional customization supports reset to default and does not affect calculations. Financial endpoints enforce the approved role permissions. Verify accessible tables, Arabic/RTL, English/LTR, and mobile chart readability.

**Implementation / retest:** None recorded / Not performed. Recording this suggestion does not add reporting endpoints or financial data.

**Accepted exception-reporting extension — 2026-11-16:** Apply the same period/branch filters and record drill-down to approved operational exception cards: unanswered quote work, recorded pickup commitments, pending promised benefits, transport issues and claim decisions. Counts reconcile to P1-036 queues and underlying records, with clear definitions and unavailable states for missing modules/data. Distinguish overdue commitments from changing estimates; do not claim real-time provider data or implement financial calculations twice.

<a id="p1-034"></a>

### P1-034 — Separate quotes, collections, balances, costs, and profit

**Reported / updated:** 2026-11-16; user-requested research intake.
**Area:** Financial definitions / reporting data integrity.
**Severity / priority:** Medium / P2, proposed; misleading monetary figures would affect owner decisions.
**Related:** P1-029, P1-033; P1-031 for owner/business discovery.

**Finding:** Jobber's job-costing documentation distinguishes work-in-progress costs from profitability and warns about double-counting the same cost through line items and expenses. [Official reference](https://help.getjobber.com/en/articles/job-costing/).

**Suggested Garage OS behavior:** Define separate figures for quoted/draft value, recognized revenue if supported, money collected, outstanding balance, direct job costs, and profit. A quote or invoice draft is not proof of collection or recognized revenue. Label in-progress cost/profit estimates separately from finalized results. Provide a visible metric explanation and drill-down to the source records; unavailable inputs prevent a misleading profit total.

**Suggested sequence:** Establish each selected metric's definition with the owner → identify a reliable source and recognition date → map each job/payment/cost once → calculate scoped period totals → reconcile totals to records → expose them to P1-033. Start with the metrics the available records can support; show missing ones as unavailable until their inputs exist.

**Dependencies / decisions:** Full accounting/POS and a complete payment/cost ledger are not currently implemented. Confirm gross versus net profit, revenue recognition, deposits/partial payments, discounts, taxes, refunds, labour/material costs, overhead allocation, currencies, and finalized versus ongoing work. These are business/accounting decisions, not defaults borrowed from another product. Identify any required future data model or integration as scoped work before implementation.

**Acceptance:** Agreed fictional fixtures cover draft-only work, unpaid and partially paid work, cancellation/refund, ongoing jobs, missing costs, and finalized jobs. Each input is counted once; drafts do not inflate collections/revenue. Figures reconcile to drill-down records using approved date/branch/currency rules. Missing cost or payment data is visibly incomplete; net profit is not claimed without its required inputs. Permission checks protect detailed financial records as well as summaries.

**Implementation / retest:** None recorded / Not performed. No accounting module, ledger, payment integration, or policy has been added.

<a id="p1-035"></a>

### P1-035 — Contextual warranty forms and safe template lifecycle

**Reported / updated:** 2026-11-16; user-requested research intake.
**Area:** Warranty / progressive detail / record lifecycle.
**Severity / priority:** Low / P2, proposed; reduced information overload and clearer actions.
**Related:** P1-028 (warranty usability), P1-010 (policy status), P1-022 (issuance prerequisites), P1-037 (shared interaction rules).

**Finding:** Fresha documents service-specific forms, conditional questions, and form edit/duplicate/archive behavior that preserves completed submissions. [Create a form](https://www.fresha.com/help-center/knowledge-base/clients/102340-create-a-client-form), [organize forms](https://www.fresha.com/help-center/knowledge-base/clients/101353-organize-your-forms).

**Suggested Garage OS behavior:** Open warranty pages on compact policy/coverage/claim summaries with status and one clear primary action. Open the relevant detail/editor on selection; show only fields relevant to the chosen service and task. Expand terms, evidence requirements, and history on demand. Offer create, edit draft, duplicate as new draft, and retire/archive where the entity's rules allow. Retain the exact policy version/terms attached to issued coverage. Published terms change through a new version, not inline rewriting.

**Suggested sequence:** Select task and service/record → see its summary and prerequisites → open the relevant form → expand optional detail as needed → validate/save → return to the selected updated record. For a policy revision, duplicate/create a draft, edit it, and follow the existing authorized publication process. Retiring a template must not erase issued warranties or claim history.

**Dependencies / decisions:** Confirm which draft fields can be added/removed, what retire/archive means by entity, and whether a new archive capability is required. Existing published/retired states and immutability take precedence over a generic archive action. P1-037 owns reusable conditional-form behavior; this entry owns the warranty-specific fields and lifecycle. Do not add destructive record deletion by inference.

**Acceptance:** Default screens expose agreed summaries rather than all full forms. Each authorized action is discoverable near its record. Service/task changes reveal relevant fields, keep valid input, and cannot hide blocking validation. Issued coverage still displays its original terms after a template revision/retirement. Unauthorized users cannot change policy status or issue coverage. Retest issue/claim/evidence/invoice-print/verification journeys in both languages and mobile/desktop.

**Implementation / retest:** None recorded / Not performed. No records, terms, or permissions changed.

**Accepted coverage extension — 2026-11-16:** Keep contextual warranty forms and issued-version preservation, and consume P1-041's fixed-term/lifetime model when it is implemented. Explain coverage kind and approved definition without requiring a fake expiry for lifetime. P1-042 owns aftercare entitlement/redemption, distinct from warranty claim approval. This entry owns usability/lifecycle, not a second warranty model.

<a id="p1-036"></a>

### P1-036 — Stage-based action queues and optional operational columns

**Reported / updated:** 2026-11-16; user-requested research intake.
**Area:** Booking / workshop / claims / operational navigation.
**Severity / priority:** Low / P2, proposed; staff work discovery and prioritization.
**Related:** P1-030 (research umbrella), P1-012 (stage wording), P1-013 (assignment prerequisites), P1-032 (inbox-specific triage).

**Finding:** RepairDesk documents staged workflows, workflow/current-step filters, and optional visible workflow columns. [Official reference](https://help.repairdesk.co/portal/en/kb/articles/workflows).

**Suggested Garage OS behavior:** Add useful saved/filterable work views over existing records: booking needs review where applicable, waiting for assignment, ready for QC, ready for pickup, and claim awaiting authorized review. Show stage, next permitted action, responsible person/team, and a recorded waiting reason when available. Keep secondary columns optional so reception, managers, and technicians can focus on their own tasks. Preserve the existing domain stages; do not invent a new workflow engine or new business states just for the view.

**Suggested sequence:** User opens a permitted workflow → chooses a stage/action filter → sees matching scoped records and clear next actions → opens/completes an authorized action → the record moves out of that queue when the underlying state changes. Technician views remain limited to authorized assigned work. Inbox queue behavior remains under P1-032, rather than building two competing inbox triage systems.

**Dependencies / decisions:** Map each view to actual stored stages, permissions, and prerequisite rules. Distinguish a calculated next action from a persisted waiting reason; do not display an inferred reason as fact. Agree which filters/columns are useful by role. Alternative per-service workflows remain a later owner-discovery question, not an automatic requirement from this entry.

**Acceptance:** Queue counts reconcile with matching authorized records; filters neither reveal out-of-scope work nor claim completion prematurely. Actions obey existing transition/QC/assignment rules. Completed actions update the relevant queues, and empty views explain the selected filter. Optional columns do not remove essential identifying/status information. Verify role access, clear bilingual stage labels, keyboard navigation, and mobile usability.

**Implementation / retest:** None recorded / Not performed. No stages or approval rules added.

**Accepted business-work extension — 2026-11-16:** Include useful authorized queues for quote follow-up, due recorded pickup promises, benefit fulfillment, transport exceptions and claim decisions when their source workflows exist. P1-039–P1-043 own records/state and eligibility; queues derive from those persisted facts rather than inventing new completion states. Shared counts reconcile with P1-033 owner drill-down. Same-day social replies do not establish universal due times.

<a id="p1-037"></a>

### P1-037 — Sequential forms with conditional steps and retained input

**Reported / updated:** 2026-11-16; user-requested research intake.
**Area:** Shared task interaction / booking and warranty journeys.
**Severity / priority:** Low / P2, proposed; guided completion without repeated input or irrelevant fields.
**Related:** P1-026 (complete WhatsApp booking flow), P1-028/P1-035 (warranty-specific behavior), P1-004 (truthful save/refresh outcomes).

**Finding:** Process Street documents conditional tasks/headings/fields based on earlier choices and workflow actions. [Official reference](https://www.process.st/help/docs/conditional-logic/).

**Suggested Garage OS behavior:** Use clear sequential steps for longer tasks: select intent/service/record → collect only required relevant details → review → explicitly confirm → show persisted outcome and next action. Let previous choices control visible sections. Retain compatible input when moving back; changing a prerequisite invalidates only affected dependent values. Keep short tasks as short forms rather than forcing every action through a wizard.

**Suggested sequence:** In booking, a branch/service choice determines available dates/times; changing it refreshes availability and requires selecting a still-valid slot. In warranty work, task/service selection reveals the relevant fields and evidence requirements. Show progress, Back, and a clear exit/discard choice; preserve input on recoverable failures. Offer human help in WhatsApp without discarding collected context. P1-026 and P1-035 retain the domain-specific outcomes; this entry owns consistent step, validation, and recovery behavior across them.

**Dependencies / decisions:** Start with fixed, understandable task rules rather than a user-configurable workflow builder. Server validation must enforce requirements independently of hidden controls. Agree draft-retention boundaries; switching identity/conversation/record cannot reuse another user's sensitive input. Avoid new business-policy branches unless separately approved.

**Acceptance:** Forward/Back navigation retains valid values; prerequisite changes clear/revalidate dependent choices and explain why. Irrelevant hidden fields do not block a legitimate task, while malicious requests cannot omit server-required data. Validation identifies the affected step and focuses the error. Final confirmation commits once; save/refresh failures report the real outcome and avoid duplicate mutation. Verify successful completion, exit, retry, conversation/identity isolation, Arabic/English, keyboard use, and narrow screens across the selected booking and warranty tasks.

**Implementation / retest:** None recorded / Not performed. No form components or workflow rules changed.


## Approved operational-product additions — 16 November 2026

The user approved all recommendations and valuable additions derived from the Go Stores research, requested a full functional project with auxiliary demonstration layers and phased versions, and explicitly requested this tracker update and a next-session full-plan handover. [Accepted scope](../product/PRODUCT_DIRECTION_AND_RELEASES.md) is the current direction. These are accepted feature requirements, not reproduced defects or approved business policy.

**Shared intake:** Reported/updated 2026-11-16; Status Open; Owner Unassigned; implementation None recorded; retest Not performed for all seven. Severity/priority below are proposed triage. Browser/build/viewport reproductions are not applicable to scope intake; Source means static code/evidence where stated. The full plan must preserve every earlier issue, assign each new scope to a coherent release, and link overlap to existing owners rather than duplicate work.

<a id="p1-038"></a>

### P1-038 — Operational product, isolated demonstration layer and phased delivery

**Area:** Product architecture / environment isolation / phased scope.
**Severity / priority:** High / P1, proposed; mixing simulated and operational results risks data and trust.
**Evidence:** Reported; direct user approval. Related P1-007–P1-009, P1-026/P1-027, P1-039–P1-044.

**Accepted behavior:** Garage OS is the functional operations product. Persist real workflows with server validation, actual role/branch access, auditability and recoverable outcomes. Demonstration/training supplies isolated fictional identities, datasets and provider events while reusing operational domain behavior. Future versions have explicit boundaries and truthful availability; no button fakes an unimplemented operation. Product direction does not claim current production readiness.

**Planning / dependencies:** Inspect existing demo-auth, seed, simulation and bootstrap paths before deciding isolation changes. Preserve Clerk production auth, Replit controls and domain boundaries. Define environment/data/provider-effect separation and scenario reset scope. Map every tracker entry into releases without marking later work complete. Missing credentials are a readiness condition, not a reason to replace the operational feature with a mock.

**Acceptance:** A fictional walkthrough exercises the same business validations and permissions as the operational workflow. Scenario reset cannot alter live records; real users cannot invoke scenario privileges; sample data/results never contaminate operational reporting or outbound delivery. Failed/unconfigured providers never show successful real delivery. Verify UI and API boundaries, both languages, environment separation and migration/rollback strategy. Document actual current versus implemented/future scope for each release.

**Implementation / retest:** None recorded / Not performed.

<a id="p1-039"></a>

### P1-039 — Structured catalogue, packages and accepted quotation versions

**Area:** Service/product catalogue / quoting / customer agreement.
**Severity / priority:** Medium / P2, proposed.
**Evidence:** Source + Reported. [Facts GS-F014/GS-F016–GS-F020](../product/GO_STORES_FACTS_2026-11-16.md); [current Service/Vehicle/Booking types](../../packages/domain/src/types.ts) currently use a simple service/price label and single service linkage.
**Related:** P1-026/P1-032, P1-034, P1-037, P1-040/P1-041.

**Accepted behavior:** Define products/grades and service packages with vehicle model/category, thickness where applicable, covered areas, roof, add-ons, exclusions, currency and itemized agreed amount. Preserve quote revisions and the customer's accepted scope/price/terms, linked to enquiry, reservation, booking and job. Standalone services remain possible; a bundle is not a textual price label.

**Sequence:** Collect vehicle/intent → choose eligible package and scope → obtain calculated or authorized inspection/manual quote → customer reviews/accepts the current revision → attach its immutable snapshot downstream. Changed scope creates a new revision and acceptance as required; old records retain historical meaning.

**Dependencies / decisions:** Owner supplies current catalogue/prices, tax treatment, vehicle classification, discount/override authority, acceptance evidence and validity. Research prices are dated examples, not active defaults. Define package labor/capacity aggregation and multiple component warranties without double-counting job work. P1-034 owns finance definitions; no accounting/POS added implicitly.

**Acceptance:** Sedan/SUV/roof variants yield explicit scope; missing/unsupported prices cannot silently become zero. Changed catalogue does not rewrite accepted quotes. Unauthorized edits/discounts fail server checks. Retry/double acceptance preserves one outcome; booking/job/warranty show the correct quote revision; Arabic/English and quote correction history are testable.

**Implementation / retest:** None recorded / Not performed.

<a id="p1-040"></a>

### P1-040 — Deferred promotion reservations and later installation

**Area:** Commercial reservation / promotion version / scheduling boundary.
**Severity / priority:** Medium / P2, proposed.
**Evidence:** Reported; facts GS-F020/GS-F021/GS-F023/GS-F025 show deferred execution and reservation/deposit mechanics.
**Related:** P1-001/P1-002, P1-039, P1-044; P1-034 for deposit/collection meanings.

**Accepted behavior:** Persist an accepted offer/quote version, qualifying customer/vehicle, eligibility evidence, reservation/effective dates, agreed amount, deposit reference/state and redemption history. Offer entitlement exists separately from a confirmed installation slot. When installation is scheduled, check live capacity and link the correct reservation; old offers remain traceable after catalogue changes.

**Dependencies / decisions:** Confirm price-lock rules, deposit amount/source, cancellation/refund/expiry, vehicle/package changes, branch redemption and limited-offer allocation. Do not infer a mandatory two-year validity, unlimited availability or payment collection from a promotional post. Deposit reference is not a verified payment gateway/ledger.

**Acceptance:** A reservation can exist without consuming workshop capacity; creating an installation booking reserves capacity atomically. Promotion expiry never rewrites already accepted entitlement under approved rules. Repeated redemption cannot create duplicate jobs/benefits. Cancellation/refund/correction retains audit history; unauthorized changes fail. Limited allocations and simultaneous reservations obey agreed constraints. Preserve compatibility with existing bookings.

**Implementation / retest:** None recorded / Not performed.

<a id="p1-041"></a>

### P1-041 — Fixed-term and lifetime warranty coverage semantics

**Area:** Warranty domain / persistence / issuance / claims / verification.
**Severity / priority:** High / P1, proposed; incorrect expiry changes coverage meaning.
**Evidence:** Source + Reported. Facts GS-F016/GS-F022 advertise lifetime options. [Domain expiry calculation](../../packages/domain/src/rules.ts) and [policy validation](../../apps/server/features/warranty/warranties.ts) restrict durations to 1–120 months; current warranty records require an expiry date.
**Related:** P1-010/P1-022/P1-028/P1-035; P1-039/P1-042.

**Accepted behavior:** Support fixed-term and explicitly defined lifetime coverage without substituting ten years, an arbitrary distant date or unlimited coverage inferred from an advertisement. Preserve the approved policy version/definition at issuance and in claim/verification/print views. Existing fixed-term dates and issued terms must remain unchanged by migration.

**Dependencies / decisions:** The business owner defines lifetime subject, termination conditions, transferability, exclusions, maintenance conditions, issuer/remedy and approved public wording. Model unconfigured definitions honestly and prevent issuance of unsupported policy. Reuse existing policy versioning, issuance prerequisites, claim/evidence, audit and private/public boundaries.

**Acceptance:** Fixed-term calculations still pass leap/month-end/expiry cases; lifetime can be represented without a fabricated date, but cannot bypass approval or eligibility. Claim/status/QR/print/UI/API handle both kinds consistently, preserving customer privacy. Migration retains old policy versions, dates and claim meaning; malformed/unauthorized requests fail. No global reseeding or rewriting of existing warranties.

**Implementation / retest:** None recorded / Not performed.

<a id="p1-042"></a>

### P1-042 — Included benefits and aftercare entitlement redemption

**Area:** Customer promises / fulfillment / aftercare.
**Severity / priority:** Medium / P2, proposed.
**Evidence:** Reported; facts GS-F021–GS-F026 advertise bundled extras, washing, maintenance and services.
**Related:** P1-039–P1-041, P1-043/P1-044, P1-033/P1-036.

**Accepted behavior:** Attach an explicit approved benefit snapshot to the accepted sale/job/customer/vehicle: benefit type, scope, eligibility, duration/frequency/quantity if applicable, responsible team and fulfillment/redemption history. Display outstanding promises and let authorized staff record redemption/correction. Distinguish optional aftercare, included service and warranty claim; completing a wash is not claim approval.

**Dependencies / decisions:** Confirm beneficiary/vehicle transfer, limits, required checkups, eligible branches, scheduling, expiration, partial delivery, cancellation and correction authority. Do not invent unlimited free service or expire a benefit solely because its parent promotion changes. P1-043 owns transport execution; P1-044 qualification/redemption of promotions.

**Acceptance:** Staff can identify the exact promised extras and remaining eligibility; repeated/concurrent redemption cannot exceed approved limits. Corrections retain actor/reason/history. Retired packages do not erase entitlements. Unauthorized access fails; due/exception queues reconcile with records. Test finite, recurring and unconfigured eligibility without fabricated automatic acceptance, and preserve Arabic/English clarity.

**Implementation / retest:** None recorded / Not performed.

<a id="p1-043"></a>

### P1-043 — Vehicle transport and VIP service coordination

**Area:** Collection/return / towing / courtesy transport.
**Severity / priority:** Medium / P2, proposed.
**Evidence:** Reported; facts GS-F026/GS-F032 and current owner replies mention towing and VIP transport.
**Related:** P1-039/P1-040/P1-042, P1-033/P1-036, booking capacity and expected pickup.

**Accepted behavior:** Link transport requests to customer/vehicle/booking/job and any qualifying entitlement. Record pickup versus return, destination, approved contact access, responsible internal/external provider, timing/commitment and progression through completion/cancellation/exception. VIP/courtesy arrangements have their own approved scope and availability. Begin with coordination, not a full fleet/GPS/dispatch platform.

**Dependencies / decisions:** Confirm Cairo/service-area boundaries, return delivery, fees/free eligibility, transport provider responsibility, custody/inspection evidence and access to location/contact details. Workshop slots and transport resources are distinct; a social same-day reply does not establish a universal time promise. Do not send driver/customer notifications without configured approved delivery.

**Acceptance:** Users can distinguish pickup from return and see responsible party/status. Unavailable resources do not become confirmed commitments; conflicting assignments follow approved constraints. Failures/cancellations retain audit/evidence and do not silently mark workshop delivery complete. Authorized scoped users see necessary data; customer/staff/private details are protected. Demonstration requests cannot contact actual providers.

**Implementation / retest:** None recorded / Not performed.

<a id="p1-044"></a>

### P1-044 — Promotion qualification, referral and multi-car redemption

**Area:** Offer qualification / controlled discount allocation.
**Severity / priority:** Medium / P2, proposed.
**Evidence:** Reported; facts GS-F021/GS-F023/GS-F026 describe group-member limits, warranty-card referral and multi-car offers.
**Related:** P1-039/P1-040/P1-042 and P1-034 for financial classification.

**Accepted behavior:** Record which approved promotion/version applies, qualifying evidence (existing warranty reference, membership verification or grouped vehicles), beneficiary, discount/benefit allocation and authorized redemption. Preserve consumption and corrections; do not grant eligibility based only on an uploaded card photo, social group count or unverified customer assertion.

**Dependencies / decisions:** Confirm stackability, recipient/vehicle restrictions, limits, deposits, validity, grouped-car timing/price allocation, membership evidence/minimization and exception authority. Transferable discount does not imply transferable warranty. Qualification is this issue's domain; P1-040 owns reserved offer state and P1-042 downstream service fulfillment.

**Acceptance:** Eligible/invalid/expired/used evidence follows the approved rule version. Concurrent or repeated redemption cannot consume the same entitlement twice or exceed allocation. Reversal is authorized, justified and auditable. Old accepted benefits survive offer edits under recorded rules; unauthorized discount/override fails server checks. Minimize stored identity/card evidence and protect it from unrelated roles.

**Implementation / retest:** None recorded / Not performed.


## Change log

| Date | Change | Runtime verification |
|---|---|---|
| 2026-11-15 | Created unified tracker with P1-001–P1-025; preserved CR/GO IDs and evidence; added technical approaches, acceptance criteria, source clarifications, and intake/status rules | Documentation/source inspection only; no fixes or new runtime tests |
| 2026-11-16 | Added P1-026–P1-031 under WhatsApp, warranty, owner financial overview, cross-industry UX research, and next-task owner/business discovery; linked existing findings and initial research; advanced next ID to P1-032 | Documentation/source inspection and web research only; no implementation or runtime retests |
| 2026-11-16 | Clarified P1-026/P1-027: specified demo-user workspace under RBAC; two-sided customer/agent WhatsApp demo with auto-replies and selectable list choices; synchronized research discussion notes | Documentation only; no implementation or runtime retests |
| 2026-11-16 | Recorded user authorization to assume a full sequential WhatsApp demo; linked the complete flow proposal to P1-026/P1-027 and preserved the user's explicit no-code constraint | Documentation only; no implementation or runtime retests |
| 2026-11-16 | Confirmed six-number shared inbox, requested-branch availability/time selection, automatic confirmed booking, and requested/unsupported-enquiry agent handoff; revised primary flow to remove proposed routine staff approval | Documentation only; no configuration changes, implementation, or runtime retests |
| 2026-11-16 | Recorded one central team for all six numbers; replaced branch-team routing in the active proposal with a central queue and explicit central-team cross-branch access requirements | Documentation only; no code, configuration, or runtime changes |
| 2026-11-16 | Added all six requested cross-industry adaptations as P1-032–P1-037, with source links, suggested Garage OS sequences, boundaries/dependencies, and acceptance criteria; linked P1-030 and advanced next ID to P1-038 | Documentation only; no implementation, configuration changes, or runtime retests |
| 2026-11-16 | Recorded user approval of all Go Stores research additions and full operational-product direction; added P1-038–P1-044; extended existing inbox/reporting/warranty/discovery issues; linked next-session full-plan handover; total44, nextP1-045 | Documentation/source inspection only; no implementation, policy activation, migration, provider connection or runtime retest |
