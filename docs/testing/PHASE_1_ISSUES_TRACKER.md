# Garage OS — Phase 1 Issues Tracker

**Created / last updated:** 15 November 2026  
**Purpose:** Single working tracker for Phase 1 defects, investigation, implementation handoff, and retesting.  
**Initial intake:** 25 entries: 7 code-review findings, 15 UI-test findings, and 3 engineering follow-ups.  
**Next available ID:** `P1-026`  
**Current ownership:** All entries are unassigned. All entries are Open; no fixes or new runtime tests were performed while creating this tracker.

## Sources and application context

This document combines the [repository code review](REPOSITORY_CODE_REVIEW.md) and [cleaned UI test report](GARAGE_OS_UI_TEST_REPORT.md), including the code review's three build/workflow concerns. The [original UI PDF](Garage_OS_UI_Test_Report.pdf) and both reports remain historical evidence. Add future issues and progress here; do not rewrite the original reports to imply that their findings were retested.

Garage OS uses React/Vite, Express, PostgreSQL, Clerk, and `@garage/domain`. It implements role/branch access, customer and vehicle records, bookings, workshop stages, staff assignment, operating settings, warranty policies/records/claims/evidence, invoice drafts, and gated public verification. Arabic/RTL and English/LTR are supported. WhatsApp is a development simulator. Inventory, full accounting/POS, and live/scheduled messaging remain outside implemented scope.

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

## Change log

| Date | Change | Runtime verification |
|---|---|---|
| 2026-11-15 | Created unified tracker with P1-001–P1-025; preserved CR/GO IDs and evidence; added technical approaches, acceptance criteria, source clarifications, and intake/status rules | Documentation/source inspection only; no fixes or new runtime tests |
