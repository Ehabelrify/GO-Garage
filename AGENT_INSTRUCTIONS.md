# Garage OS - Canonical Repository Instructions

This is the single authoritative instruction file for Replit, Copilot, Claude,
Lovable, and other contributors. Read it before changing the repository.
`apps/AGENT_INSTRUCTIONS.md` and `docs/AGENT_INSTRUCTIONS.md` add scoped
guidance only; neither overrides this file or the user's direct instructions.
Do not rely on implicit nested-instruction discovery: this file links to both
subordinate guides explicitly.

## Product and implementation truth

Garage OS is a role-based operations app for Go Stores. It currently uses
React/Vite, Express, PostgreSQL, Clerk, and the private workspace
`@garage/domain`. Arabic/RTL and English/LTR are supported. The Owner's
supported operating controls live in Settings; do not reintroduce a Decision
Center, role-preview switcher, or fake approval controls.

Implemented workflows include customer/vehicle records, bookings and capacity
checks, job stages and assignment, role/branch authorization, warranty records,
claims, and invoice drafts. Public warranty verification is gated by an Owner
setting. WhatsApp is a development simulator with provider delivery disabled.
General inventory, accounting/POS, live messaging, and scheduled messaging are
not implemented. Seed values and draft warranty terms are examples, not
approved business policy. Do not describe the application as production-ready.

## Source map and dependency boundaries

- `apps/web/src/main.tsx` is the Vite entry; `apps/web/index.html` and
  `apps/web/public/` retain the browser entry and public assets.
- `apps/web/src/app/` contains the app/auth shell.
- `apps/web/src/features/<feature>/` contains feature pages and colocated
  styles; `apps/web/src/shared/` contains client state, shared UI, and global
  styles.
- `apps/server/index.ts` is the Replit-facing server composition entry.
- `apps/server/features/auth/`, `operations/`, `warranty/`, `whatsapp/`, and
  `seed/` contain server features; `apps/server/infrastructure/database/` and
  `infrastructure/storage/` contain infrastructure.
- `packages/domain/src/` owns shared TypeScript types and pure domain rules.
- `artifacts/mockup-sandbox/` is separate from the production app.

Both apps import shared types/rules from `@garage/domain`. Do not create
server-to-web or web-to-server source imports. When a path moves, update the
imports, tests, and this map plus the applicable subordinate guide.

## Replit control points - preserve these paths

- `.replit` owns the Replit workflow. It runs
  `GARAGE_DEMO_AUTH_ENABLED=true npm run dev` and exposes local port 5000.
- `npm run dev` and `npm start` target `apps/server/index.ts`.
- `apps/server/index.ts` mounts the API and points Vite at `apps/web/`.
- `npm run db:migrate` and `npm run db:seed:dev` retain root-level scripts and
  thin facades at `apps/server/migrate.ts` and `apps/server/seed-dev.ts`.
- `scripts/post-merge.sh` is the configured post-merge command.

Do not replace `.replit`, change ports, remove these facades, or bypass Replit's
native Git integration without the user's explicit direction. Do not stage,
commit, push, or synchronize changes unless the user asks.

## Commands and data safety

```sh
npm ci
npm run typecheck
npm test -- --run
npm run build
```

`npm run db:migrate` writes to the database selected by `DATABASE_URL`; verify
the target is the intended development database before running it.
`npm run db:seed:dev` is development-only. The warranty-ledger and WhatsApp
integration suites perform database writes and cleanup; they require an
explicit `GARAGE_TEST_DATABASE_URL` for a dedicated disposable test database.
Never use a production or shared Replit database for tests.

Keep credentials, tokens, customer records, and real operational data out of
source, tests, logs, and documentation. Do not claim a provider integration is
live unless its credentials, configuration, and end-to-end operation have
been verified.

## Documentation and instruction map

- Product: [PRD](docs/product/PRD.md), [design system](docs/product/DESIGN_SYSTEM.md),
  [Owner meeting playbook](docs/product/OWNER_MEETING_PLAYBOOK.md), and
  [decisions and assumptions](docs/product/DECISIONS_AND_ASSUMPTIONS.md).
- Engineering: [architecture](docs/engineering/ARCHITECTURE.md),
  [data model](docs/engineering/DATA_MODEL.md),
  [security/privacy](docs/engineering/SECURITY_PRIVACY.md),
  [acceptance tests](docs/engineering/ACCEPTANCE_TESTS.md),
  [automations](docs/engineering/AUTOMATIONS.md),
  [WhatsApp](docs/engineering/WHATSAPP_SPEC.md), and
  [warranty evidence storage](docs/engineering/WARRANTY_EVIDENCE_STORAGE.md).
- Operations: [delivery plan](docs/operations/DELIVERY_PLAN.md),
  [decisions](docs/operations/DECISIONS.md), and
  [project log](docs/operations/PROJECT_LOG.md).
- Current implementation and readiness: [repository assessment](docs/reports/REPOSITORY_ASSESSMENT.md).
- Phase 1 issues and future intake: [unified tracker](docs/testing/PHASE_1_ISSUES_TRACKER.md).
- Scoped guidance: [apps](apps/AGENT_INSTRUCTIONS.md) and
  [docs](docs/AGENT_INSTRUCTIONS.md).

Treat product/engineering reference docs as proposals where they describe
unimplemented work. Keep statements of current behavior aligned with source.
Update README links, this map, scoped instructions, and affected document links
whenever files or responsibilities move. Do not silently drop or duplicate
requirements when relocating documents.
