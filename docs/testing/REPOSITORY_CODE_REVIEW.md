# Garage OS — Repository Code Review

**Ongoing tracking:** Use the [Phase 1 issues tracker](PHASE_1_ISSUES_TRACKER.md) for technical approaches, implementation progress, retests, and new issues. This report remains the original review snapshot.

**Review date:** 14 November 2026  
**Recorded:** 15 November 2026  
**Scope:** Repository source, configuration, documentation, and safe local validation.  
**Related report:** [UI test report](GARAGE_OS_UI_TEST_REPORT.md).

## Assessment

Garage OS has a coherent architecture and substantial implemented workflows, but booking defects should be addressed before relying on it for live operations. This review does not establish production readiness.

The review used a lower-cost model for repository mapping, a coding model for frontend review, and a frontier model for backend authorization and data integrity. The coordinating reviewer cross-checked the findings.

No source or configuration files were changed during the review. No database was accessed, and no migrations, seeds, commits, or deployments were performed. Local validation generated ignored build output only. This document records the prior review; creating it did not constitute a new test run.

## Application overview

Garage OS is an internal operations application for an automotive business in Egypt.

| Area | Current implementation |
|---|---|
| Foundation | React/Vite, Express, PostgreSQL, Clerk, and a shared TypeScript domain package |
| Access | Owner, Branch Manager, Receptionist, and Technician roles, with server-enforced branch restrictions |
| Operations | Customers, vehicles, bookings, capacity rules, workshop stages, and assignments |
| Warranties | Versioned policies, records, claims, private evidence, invoice drafts, and gated public verification |
| Languages | Arabic/RTL and English/LTR |
| WhatsApp | Development simulator; live delivery is disabled |

Inventory, full accounting/POS, and live or scheduled messaging are not implemented. The prototype in `artifacts/mockup-sandbox/` is separate from the application entry point.

## Priority findings

Source line references describe the reviewed snapshot and may change with later edits. Frontend findings are supported by source inspection; they were not browser-tested during this review. Findings remain unresolved in this report unless a later retest explicitly establishes otherwise.

### CR-01 — Booking date conversion undermines capacity checks and confirmation

**Severity:** High  
**Evidence:** [Booking date mapping](../../apps/server/features/operations/api.ts), reviewed line 133; confirmation path, reviewed lines 456–458; [capacity rule](../../packages/domain/src/rules.ts), reviewed lines 99–106.

The API converts PostgreSQL dates using `String(value).slice(0, 10)`. The installed database parser produces a JavaScript `Date`, making the result something like `Sun Nov 15` instead of `2026-11-15`.

Existing bookings then fail the capacity rule's date comparison, allowing overbooking. The same conversion in pending-booking confirmation supplies malformed dates to subsequent queries.

**Verification:** Reproduced locally without a database. Using the installed parser and actual domain rule, an already-full branch returned no capacity issue with the API mapping, versus `daily-cap` with the correct calendar date.

**Recommended direction:** Preserve SQL date-only values consistently. Address CR-02 at the same time; converting everything through UTC is insufficient.

### CR-02 — Calendar dates can shift one day earlier on Cairo-time hosts

**Severity:** Medium  
**Evidence:** [Bootstrap date conversion](../../apps/server/features/operations/bootstrap.ts), reviewed lines 12–13, booking mappings at 161–163, and warranty mappings at 357–358.

Bootstrap converts date-only values through UTC. Under `Africa/Cairo`, the installed parser converted `2026-11-15` into `2026-11-14` through this mapping. Booking, pickup, and warranty dates are affected. UTC hosting can conceal the issue.

**Verification:** Reproduced using the installed PostgreSQL parser without accessing a database.

**Recommended direction:** Maintain a date-only representation across database reads, domain rules, and responses, with coverage for UTC and Cairo time zones.

### CR-03 — Printing one invoice can include other expanded invoices

**Severity:** Medium  
**Evidence:** [Invoice print styles](../../apps/web/src/features/warranty/WarrantiesPage.css), reviewed lines 227–229; [print action](../../apps/web/src/features/warranty/WarrantyInvoicePanel.tsx), reviewed lines 91–95.

Print styles reveal every expanded invoice and position them together. With two invoices expanded, printing either can overlap customer documents.

**Recommended direction:** Identify and print only the selected invoice element.

### CR-04 — A successful save can be followed by a false failure message

**Severity:** Medium  
**Evidence:** [Store refresh and mutations](../../apps/web/src/shared/store.tsx), reviewed lines 145–149 and 193–204; [workspace error message](../../apps/web/src/app/App.tsx), reviewed line 73.

A failed refresh becomes a global workspace error even when the preceding mutation committed successfully. Mutation helpers still return success after awaiting the refresh, while the error screen says no changes were saved. This can cause confusion and unnecessary retries.

**Trigger:** A POST/PATCH succeeds, then its follow-up `GET /api/bootstrap` fails.

**Recommended direction:** Distinguish mutation outcome from refresh outcome and preserve the loaded workspace when appropriate.

### CR-05 — Mobile users lose the workspace sign-out button

**Severity:** Medium  
**Evidence:** [Sidebar sign-out](../../apps/web/src/app/App.tsx), reviewed line 187 and mobile navigation at 223–227; [responsive styles](../../apps/web/src/shared/styles.css), reviewed line 192.

The workspace sign-out button lives inside the sidebar, which is hidden below 760px. Mobile navigation provides no replacement.

**Recommended direction:** Provide an accessible account/sign-out action in the mobile layout.

### CR-06 — Receptionists see sample service durations after Owner changes

**Severity:** Medium  
**Evidence:** [Bootstrap settings](../../apps/server/features/operations/bootstrap.ts), reviewed lines 65–95; [booking service selector](../../apps/web/src/features/bookings/BookingsPage.tsx), reviewed line 122.

Bootstrap loads saved operating settings only for owners and managers. Receptionists receive seeded durations, while server booking calculations use the updated settings. For example, changing tint or ceramic service hours does not update the receptionist's displayed bay-hours.

The reviewed booking page does not perform a client-side capacity check, so this finding concerns misleading displayed durations rather than client-side rejection of valid bookings.

**Recommended direction:** Allow booking staff to read the effective operating values required for their work while preserving Owner-only editing.

### CR-07 — Conversation-specific state carries between WhatsApp conversations

**Severity:** Medium; development simulator only  
**Evidence:** [Conversation selection](../../apps/web/src/features/whatsapp/WhatsAppSimulationPage.tsx), reviewed lines 220–229, draft rendering at 724 and lookup results at 755.

Changing conversations does not reset booking drafts, lookup results, or composer text. This can display another conversation's working state or carry unsent text into the wrong transcript.

The server rejects mismatched booking drafts. No authorization bypass was established.

**Recommended direction:** Scope working state by conversation or reset it when selection changes.

## Existing strengths

- Frontend, backend, infrastructure, and shared business rules have clear boundaries.
- Authorization is enforced by the server; technician data is restricted to assigned work, with customer phone numbers suppressed.
- Important writes use transactions, and uniqueness constraints protect against duplicate records in key workflows.
- Public warranty verification uses hashed tokens and an approved field list behind Owner-controlled settings.
- Evidence handling includes permission, size, and file-signature checks.
- [Canonical contributor instructions](../../AGENT_INSTRUCTIONS.md) provide shared rules for Replit, Copilot, Claude, Codex, and Lovable, including stable Replit entry points and application boundaries.

## Build and workflow concerns

1. [The post-merge script](../../scripts/post-merge.sh), reviewed line 7, automatically migrates the configured database before the build succeeds. Verify the intended database and migration compatibility before relying on this hook. A failed build does not undo an already-applied migration.
2. `npm run build` does not type-check the server: [TypeScript build references](../../tsconfig.json) include the app and node configurations. Deployment validation should also run `npm run typecheck`.
3. The production JavaScript bundle is above Vite's advisory threshold. Route-level code splitting is a reasonable follow-up after correctness issues.

## Validation recorded during the review

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm test -- --run` | 44 passed; 2 database integration tests deliberately skipped |
| `npm run build` | Passed |
| Production JavaScript bundle | 654.68 kB minified; Vite size warning |
| Git-tracked changes from the review | None |

The sandbox initially blocked Vite configuration loading. Tests and build passed when rerun outside that restriction. `GARAGE_TEST_DATABASE_URL` was cleared for the test process so database-writing integration suites remained disabled.

There were no frontend test files in the application source. Deployed authentication, database integrations, storage, backups, and complete browser workflows remain unverified. Passing local checks do not establish production readiness.

## Recommended first change

Make a narrowly scoped date-handling fix with regression coverage for capacity limits, pending confirmation, and Cairo calendar dates. Preserve Replit configuration and unrelated workflows while doing that work. This report records recommendations; it does not implement them.
