# Garage OS - Go Stores Operations

Garage OS is an internal operations application for a two-branch automotive
business in Egypt. The current build combines a React/Vite web client, an
Express/PostgreSQL API, Clerk authentication, and a shared TypeScript domain
package. Arabic/RTL and English/LTR are supported.

The accepted target is a full operational product with isolated demonstration
and training layers and phased future releases. All researched additions are
approved as product scope, not implemented or approved as operating policy.
See [accepted direction](docs/product/PRODUCT_DIRECTION_AND_RELEASES.md) and
the [next-session full-plan handover](docs/operations/PHASE_1_FULL_PLAN_HANDOVER.md).

## Current application map

- `apps/web/` - React client, application shell, feature screens, shared UI,
  styles, and public assets.
- `apps/server/` - Express API, authentication and authorization, business
  features, database/migration infrastructure, storage adapter, and seed code.
- `packages/domain/` - shared types and pure booking, job, and warranty rules.
- `artifacts/mockup-sandbox/` - separate prototype; it is not the production
  app entry point.

The Replit workflow in `.replit` starts `npm run dev` with development demo
authentication enabled and serves on port 5000. The root npm scripts and
`scripts/post-merge.sh` are retained for Replit.

## Implemented scope and boundaries

The app includes staff sign-in and role/branch access, customer and vehicle
records, bookings and capacity checks, job stages and assignment, Owner
operating settings, warranty policies/records/claims, and warranty invoice
drafts. Warranty public verification is implemented behind an Owner-controlled
setting; do not enable it until the approved fields and customer-facing policy
are confirmed.

The WhatsApp inbox is a development simulator only; provider delivery is
disabled. The Replit workflow can enable separate development demo identities,
which are not production authentication. General inventory, accounting/POS,
live WhatsApp delivery, and scheduled messaging are not implemented.

## Replit and local commands

```sh
npm ci
npm run dev
npm run typecheck
npm test -- --run
npm run build
```

The app needs the appropriate `DATABASE_URL` and Clerk configuration for the
environment. `npm run db:migrate` changes the database selected by
`DATABASE_URL`; confirm that it is the intended development database before
running it. `npm run db:seed:dev` writes fictional sample data and is
development-only.

Two database integration suites perform inserts/deletes and temporarily change
a warranty verification setting. They run only when
`GARAGE_TEST_DATABASE_URL` explicitly identifies a dedicated disposable test
database; an ambient `DATABASE_URL` is not sufficient. Never point either
variable at production or a shared Replit database.

## Documentation

| Area | Documents |
|---|---|
| Product | [PRD](docs/product/PRD.md), [design system](docs/product/DESIGN_SYSTEM.md), [Owner meeting playbook](docs/product/OWNER_MEETING_PLAYBOOK.md), [decisions and assumptions](docs/product/DECISIONS_AND_ASSUMPTIONS.md) |
| Business research | [Sourced Go Stores facts](docs/product/GO_STORES_FACTS_2026-11-16.md), [business and owner meeting dossier](docs/product/GO_STORES_MEETING_DOSSIER_2026-11-16.md) — dated evidence and advertised claims; not approved operating policy |
| Accepted scope and planning | [Product direction and releases](docs/product/PRODUCT_DIRECTION_AND_RELEASES.md), [full Phase 1 planning handover](docs/operations/PHASE_1_FULL_PLAN_HANDOVER.md) |
| Engineering | [Architecture](docs/engineering/ARCHITECTURE.md), [data model](docs/engineering/DATA_MODEL.md), [security and privacy](docs/engineering/SECURITY_PRIVACY.md), [acceptance tests](docs/engineering/ACCEPTANCE_TESTS.md), [automations](docs/engineering/AUTOMATIONS.md), [WhatsApp specification](docs/engineering/WHATSAPP_SPEC.md), [warranty evidence storage](docs/engineering/WARRANTY_EVIDENCE_STORAGE.md) |
| Operations | [Delivery plan](docs/operations/DELIVERY_PLAN.md), [decisions register](docs/operations/DECISIONS.md), [project log](docs/operations/PROJECT_LOG.md) |
| Current-state report | [Repository assessment and quick analysis](docs/reports/REPOSITORY_ASSESSMENT.md) |
| Testing reports | [Phase 1 issues tracker](docs/testing/PHASE_1_ISSUES_TRACKER.md), [repository code review](docs/testing/REPOSITORY_CODE_REVIEW.md), [UI test report](docs/testing/GARAGE_OS_UI_TEST_REPORT.md), [original UI report PDF](docs/testing/Garage_OS_UI_Test_Report.pdf) |
| Contributor guidance | [Root instructions](AGENT_INSTRUCTIONS.md), [application instructions](apps/AGENT_INSTRUCTIONS.md), [documentation instructions](docs/AGENT_INSTRUCTIONS.md) |

Product and engineering references include proposed or future scope. For
implemented behavior and readiness limits, use the repository assessment and
inspect the current source.
