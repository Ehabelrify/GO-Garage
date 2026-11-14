# Garage OS - Current Repository Assessment

**Assessment date:** 14 November 2026

**Scope:** Current working-tree source and configuration. This is a repository
map and implementation/readiness assessment, not a security audit or a claim
of production readiness.

## Executive summary

This repository contains a functioning, multi-role Garage OS application, not
the documentation-only project described by older versions of this report.
The current system is a React 19/Vite client, an Express 5 API, PostgreSQL
persistence, Clerk authentication, and a private shared TypeScript domain
workspace. The application includes core branch operations and warranty
workflows, plus a development-only WhatsApp simulator.

The architecture is now grouped by app, feature, infrastructure, and shared
domain. Replit's `.replit` workflow and root command paths remain the control
points. The current test command discovers web, server, and domain tests; the
two database integration suites are safely skipped unless a dedicated
`GARAGE_TEST_DATABASE_URL` is supplied.

**Bottom line:** this is a substantial working operational build, but the
repository alone does not establish production readiness. Live WhatsApp,
production environment setup, restore testing, and owner/legal approval of
operational and warranty policies remain outside the verified scope.

## Architecture and source map

| Path | Responsibility |
|---|---|
| `apps/web/` | React/Vite application, app shell, feature screens, shared client state/UI, styles, and public assets |
| `apps/server/` | Express API and server features |
| `apps/server/features/auth/` | Clerk integration, development demo auth, role/branch authorization, proxy middleware |
| `apps/server/features/operations/` | Core API routes and bootstrap assembly |
| `apps/server/features/warranty/` | Warranty rules, policies, claims, evidence, invoices, and verification routes |
| `apps/server/features/whatsapp/` | Development simulator and delivery policy |
| `apps/server/features/seed/` | Development seed and fictional sample data |
| `apps/server/infrastructure/database/` | PostgreSQL pool, migration runner, and SQL migrations |
| `apps/server/infrastructure/storage/` | Private-storage adapter for claim evidence |
| `packages/domain/` | Shared type contracts and pure booking/job/warranty rules |
| `artifacts/mockup-sandbox/` | Separate prototype; not the production entry point |
| `docs/` | Product, engineering, operations, and repository-report references |

The browser entry remains `apps/web/src/main.tsx`; the server entry remains
`apps/server/index.ts`. `.replit` launches `npm run dev` with the development
demo-auth flag and exposes port 5000. Root migration and seed scripts use thin
facades so their command paths remain stable.

## Implemented workflows

- Clerk-backed sign-in and server-side role/branch authorization for Owner,
  Branch Manager, Receptionist, and Technician workspaces. Replit development
  mode can enable separate demo identities; these are not production accounts.
- Persistent customer, vehicle, booking, operating-setting, job, and related
  operational records in PostgreSQL.
- Booking-capacity checks, editable Owner settings, booking confirmation and
  cancellation, job-stage transitions, and staff assignment.
- Warranty policies and records, claims, claim-evidence handling, invoice
  drafts, and privacy-conscious public verification logic. Public verification
  is controlled by an Owner setting and should remain disabled until approved
  fields and policy are confirmed.
- Arabic RTL and English LTR client layouts.

## Simulated, gated, and unimplemented scope

- **WhatsApp:** the internal inbox/simulator exists for development; provider
  delivery is explicitly disabled. No live Meta integration is verified.
- **Warranty verification:** code paths and QR-related workflows exist, but
  public verification is gated; code presence is not approval to enable it.
- **General inventory and accounting/POS:** not implemented. Warranty invoice
  drafts and payment fields are narrower workflows, not a complete finance
  system.
- **Scheduled messaging/automation:** not established as an active production
  service.
- **Sample data and draft policies:** fictional development fixtures only;
  they are not Owner-approved business rules or customer terms.

## Tests and build

- `npm run typecheck` checks the web, server, and shared domain package.
- `npm test -- --run` discovers 9 test files: the domain rules suite and eight
  server suites. The two DB-backed suites require
  `GARAGE_TEST_DATABASE_URL`; with only ambient `DATABASE_URL`, they remain
  skipped.
- In the current verification run, 44 tests passed and 2 database integration
  tests were skipped. Those integrations write and clean up records and the
  warranty suite temporarily changes a verification setting; use only a
  dedicated disposable test database.
- `npm run build` succeeds. Vite reports a 654.68 kB minified JavaScript chunk,
  above its 500 kB advisory threshold; this is a performance follow-up, not a
  build failure.

## Readiness gaps and risks

1. **Production environment:** validate production Clerk keys/origins, database
   access, Replit secrets, storage configuration, and deployment behavior
   separately from the development workflow.
2. **Recovery and operations:** the repo does not demonstrate a tested
   production backup/restore procedure, incident process, or operational
   monitoring. Verify these before launch.
3. **Policy approval:** branch schedules, capacity assumptions, pricing,
   warranty wording/eligibility, retention, and public verification fields
   require explicit business/legal review.
4. **External integrations:** live WhatsApp requires real provider setup,
   credentials, webhooks, consent/opt-out handling, templates, and an
   end-to-end test. The simulator is not evidence of live delivery.
5. **Database safety:** migrations and the development seed write to
   `DATABASE_URL`. Integration suites are deliberately isolated behind
   `GARAGE_TEST_DATABASE_URL`; never point either at production or a shared
   database.
6. **Client performance:** review code splitting for the main bundle before
   production if the warning is not acceptable for target devices.

The source and unit suite show a real application with meaningful workflows,
but a passing build and unit tests do not verify deployed secrets, restore
readiness, legal policy approval, provider connectivity, or production
operations.
