# Production hardening, access model, UI/UX pass and customer-app roadmap — design

**Date:** 21 November 2026. **Author:** Claude (Sonnet 5.5), on direct user instruction.
**Status:** approved by the user in conversation (answers recorded below). Extends, and does not replace,
the [accepted product direction](../../product/PRODUCT_DIRECTION_AND_RELEASES.md) and the
[Phase 1 tracker](../../testing/PHASE_1_ISSUES_TRACKER.md). Root `AGENT_INSTRUCTIONS.md` still binds every contributor.

## Intent
Treat Garage OS as one production product whose features unlock in phases. Remove the "demo app" framing,
clean the UI/UX, make access invite-only, fill the database with realistic bilingual data so every view and tab
reflects activity, then (after current features are solid) simulate a native customer mobile app.

## User decisions (verbatim intent)
1. There is **no separate owner app**: the owner is a role in the branch app with a cross-branch overview.
   One codebase, one big database.
2. Login page: **Sign in with Google** (Apple ID later) plus a **side widget** to enter as a chosen role
   (Owner / Branch manager / Receptionist / Technician) and see that role's real interface.
3. **No sign-up and no user creation.** Staff are invite-only: the owner pre-approves a work email, role and
   branches; first Google sign-in must match. Unknown emails are refused. Magic-link invites come later for people
   without Google. Customers (mobile phase) may sign up with Google/Apple.
4. The role widget **stays on the live application** and uses the **same database** (no separate DB/schema).
   Dummy data fills it so entries show across all views; **the whole database is cleared at go-live**.
5. Dummy data is bilingual (Arabic + English), Egyptian/automotive flavoured, both branches, ~12 months of history.
6. Customer mobile simulation (later phase): book appointments, browse products (no ordering), reserve with
   deposit (no payment gateway), send special/custom requests routed to the owner to accept or review.
7. Process: subagent-driven, parallel where file ownership is disjoint.

## Goals / non-goals / anti-goals
- Goals: hardened server, invite-only Google auth, clean forms/tables instead of paragraph pages, de-duplicated
  features, realistic data, a documented stabilization gate before the customer app.
- Non-goals now: real payment gateway, live WhatsApp provider, general inventory, Apple sign-in, magic links,
  the customer app itself (Phase 5).
- Anti-goals: granting any real account extra privileges via the widget; breaking Replit control points
  (`.replit`, port 5000, `npm run dev`, db facades, `scripts/post-merge.sh`); committing/pushing without being asked;
  claiming production readiness; changing business policy (prices/warranty terms stay "examples").

## Documented deviations from existing agent rules (user-approved 21 Nov 2026)
- Root rule "isolated demonstration layer / do not mix live and fictional records" is **superseded for the
  pre-launch period**: dummy data lives in the main database and is purged at go-live. A purge script is a Phase 3
  deliverable and must be runnable once to guarantee a clean launch.
- Root rule "do not reintroduce a role-preview switcher": the login-page role widget is a **sign-in as a seeded
  demo identity** with that role's real RBAC, not an in-session switcher and not extra privilege for real accounts.
  The previous in-app prohibition on switching roles inside a session stands.
- Production guard: `isDemoAuthEnabled()` currently refuses `NODE_ENV=production`. The widget on the live app
  needs a new explicit flag (e.g. `GARAGE_ROLE_WIDGET_ENABLED`) so it can be turned off at go-live with one setting.

## Approaches considered
A. Phase-ordered (chosen): hardening -> access/landing -> UI/UX + de-dup -> dummy data -> stabilization gate -> customer app.
   Each phase testable; other agents can keep working.
B. UI-first: polishes screens before access model and data exist; rework risk. Rejected.
C. Big-bang rewrite. Rejected: breaks Replit/Codex collaboration.

## Phases
- **P0 Hardening:** helmet/security headers, rate limiting (public verify + webhook + auth), `trust proxy`,
  zod-validated webhook body with replay window, `.gitignore`/CI/formatting, dependency grouping, migration-numbering doc.
- **P1 Access and landing:** Google-only Clerk sign-in, remove sign-up route and any account-creation UI, invite-only
  membership matching, role widget on the live login page behind the new flag.
- **P2 UI/UX + de-duplication:** audit every page; convert paragraph layouts to form/table patterns; merge duplicates;
  owner cross-branch overview improvements. One module per task.
- **P3 Dummy data:** idempotent bilingual seeder across all modules + purge script for go-live.
- **P4 Stabilization gate:** typecheck, tests (incl. DB integration on a disposable `GARAGE_TEST_DATABASE_URL`), build,
  tracker updated; user sign-off.
- **P5 Customer app simulation:** separate design/spec when P4 passes.

## Interlinked records (user requirement, 21 Nov 2026)
Everything ties back to the customer. From one customer, one vehicle plate, or a scanned warranty QR, staff can
see every related record: quotes, repairs/jobs, custom requests, purchases, bookings/appointments, WhatsApp chats,
warranties/claims/invoices, reservations, benefits, transport. Each record keeps its own home page; elsewhere it
appears as a linked summary. UX rules: a global search (name, phone, plate, warranty/QR code, quote/booking ref),
"Customer 360" and "Vehicle" detail views with expand/collapse sections, a record-link component (never raw ids)
that opens a side drawer/pop-up preview with "open full page", back-links from every record to its customer and
vehicle, and QR scan resolving to the warranty with its vehicle/customer. Role/branch permissions still apply to
every linked section (hide or lock what the actor cannot see; never leak via links). Delivered by W2-0 (shared
RecordLink/Drawer/Search patterns), W2-S (server lookup/relations API) and W2-3 (Customers 360).

## Left to the builder
Component patterns, CSS details, seeder volumes, rate-limit numbers (state them in the PR/notes).
