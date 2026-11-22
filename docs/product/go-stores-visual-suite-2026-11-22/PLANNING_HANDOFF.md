# Visual-suite planning handoff

## Purpose

This handoff is an input to a later implementation plan. It is intentionally not the final code plan because Claude is changing features concurrently on another machine and the checked-out snapshot may become stale.

## Planning approach

Create separate, independently reviewable workstreams rather than one brand-and-feature mega-change:

1. **Brand foundation and shared shell** — approved assets, tokens, login, shell, print identity, responsive/RTL visual baselines.
2. **Reception and communication** — central inbox, six-channel model, assignment/handoff, provider truth, booking context.
3. **Booking, transport, and workshop** — capacity/date correctness, sequential intake, stage actions, assignment, QC/rework.
4. **Relationship record** — global search, Customer/Vehicle 360, purchases, special requests, archive/restore/audit.
5. **Commercial lifecycle** — catalogue/package versioning, quotes, acceptance evidence, reservations, promotions, benefits.
6. **Warranty and documents** — fixed/lifetime coverage, issued terms, claims, aftercare, invoices, QR/public verification.
7. **Finance and owner reporting** — approved definitions, provenance, filters/trends/drill-down, reversals, truthful unavailable states.
8. **Operational readiness** — migrations, seed/purge, provider E2E, security/permissions, backup/restore, pilot, training and sign-off.
9. **Future inventory/purchasing** — keep separate until Maher assigns it to a release and confirms process scope.

Brand work should not rewrite domain behavior. Feature work should consume shared brand tokens/components rather than adding feature-local styling systems.

## Refresh procedure after Claude finishes

Before writing the final implementation plan:

1. Record `git status --short --branch` and preserve any unrelated work.
2. Fetch the intended remote and identify Claude's branch/commit; do not assume it is `origin/main`.
3. Compare the new `HEAD` with snapshot `8b79b75` using `git diff --stat` and file-specific diffs.
4. Re-read the Phase 1 tracker header/index and every entry changed by Claude. Keep status, implementation and retest evidence synchronized.
5. Reinspect `apps/web/src/app/App.tsx`, `navigation.ts`, shared styles/components, each affected feature, the corresponding server service/routes, migrations and tests.
6. Run no database migration/seed until an explicitly identified disposable development/test target is confirmed.
7. Reproduce or retest only after the final plan identifies the required safe commands and environments.
8. Update this package's traceability paths if code moved. Do not edit the generated boards to imply new verification.

## Decisions required before implementation planning can lock values

| Area | Required evidence/approver | Safe planning behavior while unresolved |
|---|---|---|
| Brand assets | Original vector/logo files and Maher approval | Use concept assets only; do not trace low-resolution social images into production silently |
| Catalogue/prices/tax | Approved package sheet and accountable owner/accountant | Keep values typed as unconfigured/sample; do not copy advertisements into active policy |
| Booking/capacity | Branch calendar, bays, duration, drop-off cap, override authority | Keep configuration explicit and preserve capacity/concurrency controls |
| WhatsApp | Number/channel map, Meta account owner, templates, service windows | Keep provider disconnected and simulation isolated |
| Warranty | Approved blank certificate/terms and policy approver | Preserve fixed/lifetime capability and historical issued terms; do not invent exclusions |
| Promotions/benefits | Eligibility, validity, deposit/refund, limits and redemption authority | Preserve auditable entitlements and prevent duplicate redemption |
| Transport/VIP | Responsibility, provider, timing, charge and exception policy | Model coordination states without promising availability |
| Finance | Maher/accountant metric definitions and source records | Show unavailable/incomplete rather than fabricated revenue/profit |
| Access | Named work emails, roles, branches and capability exceptions | Preserve invite-only server enforcement and least privilege |
| Pilot/readiness | Pilot branches/users, acceptance owner, fallback and support | Do not claim production readiness from tests or visuals alone |

## Final plan requirements

The later implementation plan should follow `docs/operations/PHASE_1_FULL_PLAN_HANDOVER.md` and:

- Include every current tracker ID, not only the visually represented items.
- Preserve stable IDs and independently assessable acceptance evidence.
- Use exact current files and interfaces after the Claude refresh.
- Separate UI branding from feature/domain changes.
- Define migrations, backfills, rollback/recovery, permission, concurrency, retry and historical-version behavior.
- Include English/Arabic, LTR/RTL, 360/768/1280, print and role/capability checks where applicable.
- Specify unit, integration, build, visual and operational verification commands with expected outcomes.
- Keep live-provider, backup/restore, purge and production gates explicit.
- Break execution into session-sized vertical slices and record continuation checkpoints.

## Suggested release discussion

This is a proposal for Maher, not an established schedule:

- **Release A — validate the implemented core:** brand shell, tracker retest, migrations in a safe target, access, Customer/Vehicle 360, commercial records, warranty, invoices and finance evidence.
- **Release B — operate end to end:** central inbox/provider, capacity-aware customer booking, transport, workshop evidence/QC, automations, owner-approved policies, backup/restore and controlled pilot.
- **Release C — expand:** inventory/purchasing, limited payment-record refinements, approved scheduled messaging and deeper reporting.

Do not assign dates until current-source inspection, Maher's decisions, provider dependencies, migration rehearsal and staffing are known.

## Verification for this package

Package verification is limited to file presence, image readability, relative links and traceability against the snapshot. It does not verify application behavior, database state, provider integration or business policy.
