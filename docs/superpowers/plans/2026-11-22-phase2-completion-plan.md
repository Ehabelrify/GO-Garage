# Phase 2 completion plan (22 Nov 2026, evening)

**Goal:** close every open item that can be closed from source in this window (23:10 to 01:30), and leave an exact list of what
only a database, a browser or an owner decision can close. Source of truth for status: [Phase 2 tracker](../../testing/PHASE_2_TESTING_TRACKER.md)
(progress table), [Phase 1 tracker](../../testing/PHASE_1_ISSUES_TRACKER.md), [handoff](../../operations/RESUME_HANDOFF.md).

**Constraints (unchanged):** no database locally, never run migrations or seeds, never push unless asked, commit with the repo-local
identity, no Replit control point changes, one integrated typecheck + tests + build per stage, Visual checks are run by the owner at the end.

## Work packages (disjoint file ownership)
| Pkg | Scope | Owns |
|---|---|---|
| W1 | P2T-013 central inbox: confirm code matches "all branches see each other", fix drift, tests. Consents route: known customer with an unregistered simulation channel returns `missing`, not 404 (Visual finding). Auto-send hooks for quote offered/accepted and warranty issuance (P2T-006/007). | `features/whatsapp/*`, `commercial/quote-service.ts`, `warranty/issuance-service.ts`, `document-delivery/*` |
| W2 | Web: pickup commitment screen (P2T-026), scheduler status in the reminders screen (P2T-005), cancel category and reason polish and workshop-cancel reason (P2T-009 web part). | `apps/web/src/features/{reminders,bookings,overview,workshop}`, new pickup component |
| W3 | P2T-010: shared invalidation so related screens refresh after mutations (finance, quotes, invoices, reservations, benefits, transport, customers) and a polling refresh for revoked access. | `apps/web/src/shared/store.tsx`, `hooks.ts`, new `shared/invalidation.ts` |
| W4 | Server hardening: P2T-014 production migration runner script (advisory lock, explicit confirmation, never auto-runs), P2T-018 CSP in report-only mode with a violation sink, P1-050 archive eligibility, P1-074/P1-075 fresh checklist, P2T-009 server part (workshop cancel reason), P2T-001 remaining demo guard tests. | `apps/server/index.ts`, `operations/api.ts`, `scripts/` (new files only), relations archive code, `workshop-tech/*` |
| W5 | Tests and runner: route-level RBAC tests generated from the capability registry (P2T-016), demo-actor route tests (P2T-001), Visual runner flows that open the changed drawers (Send to customer, cancel dialog, Staff permissions Invoices group, audit filters, no-access message). | new `*.test.ts` files, `scripts/visual/*` |

## Cannot be closed in this window (needs the owner, a database or a browser)
- Every Verified status: needs a disposable database, the 11 end-to-end suites and the owner's Visual and Replit runs.
- CI proof of migrations 0038, 0039, 0040 and all new SQL.
- Contrast (one element per page on Overview, Catalogue, Workshop, WhatsApp): the runner now names it; fix after the next run.
- P1-030/P1-031 discovery items: owner selects improvements.
- Real Meta adapter, approved templates, status webhooks (production wiring).
- P2T-017 module refactors: only if measured coupling justifies it.
- P2T-025 budgets and measurements; P2T-012 refund/reversal workflow; customer mobile app (Phase 5 product) and inventory.
- Logo approval by Maher.

## Close-out (me, at the end)
Integrated typecheck, tests, build; commit per package; update the Phase 2 progress table, Phase 1 log, handoff status board and
activity log, MIGRATIONS.md and this plan's status below.

## Status (23:45)
- W1, W2, W3, W4, W5 done and committed. Gate: typecheck, 1817 tests, build; CI on `873d92a` green including the database job.
- Remaining from this plan: nothing that can be closed from source without an owner decision, a database or a browser. The "cannot be closed" list above is the backlog.
- Next session: push, run Visual checks (new flows included), add database integration tests for the new queries, fix contrast from the named elements, then re-assess statuses toward Verified.
