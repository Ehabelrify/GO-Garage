# Codebase Remap and Documentation Design

**Date:** 2026-11-14

**Status:** Revised proposal; the documentation-only scope was approved, then
expanded at the user's request to include behavior-preserving source
organization. Approval of this revised design is required before implementation.

## Intent

Create an accurate, easy-to-navigate map of the current Garage OS repository,
organize application code around shared domain contracts and existing feature
boundaries, put documentation and scoped instructions in predictable
locations, and keep Replit's existing launch and agent-control entry points
working. Correct documentation that still describes an earlier,
documentation-only repository or an obsolete demo direction. Restore test
discovery so the documented test command covers the application.

## Why

The application has since been implemented and is currently organized under
`apps/server` and `apps/web`, but most documentation remains at the repository
root. `REPOSITORY_ASSESSMENT.md` still reports that there is no application,
and `.agents/memory/owner-settings-and-rbac.md` contains superseded product
direction. The server also imports shared types and business rules from
`apps/web/src`, which reverses the intended dependency direction. Several
large modules are currently flat beside one another. Vite's `apps/web` root
currently limits `npm test` to the web test file; the eight server test files
are not discovered.

The working tree already contains an uncommitted source move into `apps/`.
This design treats that work as existing user work and does not undo, stage,
or commit it.

## Goals

- Preserve Replit's root `.replit`, `AGENT_INSTRUCTIONS.md`, package scripts,
  Vite entry point, and post-merge script.
- Keep one root instruction file authoritative and add subordinate, explicitly
  referenced guidance for application code and documentation.
- Establish a shared domain package used by both applications, removing
  server-to-web source imports.
- Group existing application modules by their current feature boundaries while
  preserving their module bodies and behavior.
- Group the existing Markdown references by their actual purpose and update
  every intra-repository link.
- Publish a current repository map and concise application/readiness analysis.
- Ensure `npm test -- --run` discovers web, server, and shared-domain tests.
- Make no application behavior, schema, authentication, deployment, or
  third-party dependency changes.

## Non-goals and anti-goals

- Do not redesign or rewrite application behavior.
- Do not split route/page modules or change SQL, API contracts, permissions,
  authentication, UX, or business rules as part of this organization-only pass.
- Do not delete or relocate Replit's launch configuration or package entry
  points.
- Do not restore prior demo/decision-center behavior or change product scope.
- Do not modify database migration contents, application data, or production
  settings.
- Do not discard existing uncommitted changes, including the lockfile update.
- Do not imply that held modules or external integrations are production-ready.
- Do not commit, push, or synchronize changes to GitHub.

## Current repository map

- `apps/web/`: React 19 and Vite client; role-oriented workspaces, public
  warranty verification, client state, feature pages, and client tests.
- `apps/server/`: Express 5 API, Clerk authentication and access checks,
  PostgreSQL persistence and migrations, warranty and WhatsApp-simulation
  workflows, development seed, and server/integration tests.
- `packages/domain/` (target): shared TypeScript contracts and pure
  booking/job/warranty rules used by both apps.
- `artifacts/mockup-sandbox/`: separate UI mockup/prototype project; not the
  production application entry point.
- Root configuration: `.replit`, `package.json`, TypeScript configs,
  `vite.config.ts`, and `scripts/post-merge.sh`.
- Root instructions: `AGENT_INSTRUCTIONS.md`, retained as the single
  authoritative Replit/project instruction entry point.

## Approaches considered

1. **Keep all documents at the root.** This avoids file moves but leaves the
   root crowded and does not satisfy the requested documentation remap.
2. **Organize documentation and layer instructions while preserving root
   controls — selected.** Keep root launch/configuration and authority files;
   categorize reference documents under `docs/`; add `apps/AGENT_INSTRUCTIONS.md`
   and `docs/AGENT_INSTRUCTIONS.md`, both explicitly subordinate to the root
   instructions. This improves navigation while retaining the current Replit
   control path.
3. **Split large modules into controllers, services, repositories, and many
   smaller UI components now.** This could improve local readability but
   changes more code and is harder to distinguish from behavior changes. Defer
   it to later, independently reviewable work.

## Proposed source layout

- `packages/domain/`: a private npm workspace package named `@garage/domain`.
  Move the existing shared `types.ts`, pure `domain.ts` rules, and their unit
  tests here; expose a small package entry point. Do not introduce external
  packages.
- `apps/server/features/auth/`: authentication, authorization, demo-auth, and
  Clerk proxy middleware modules and tests.
- `apps/server/features/operations/`: bootstrap and current core API routes
  for staff, settings, customers, bookings, and jobs. Keep the existing route
  module intact rather than splitting handlers.
- `apps/server/features/warranty/`: warranty routes, rules, verification,
  invoice and evidence modules and their tests.
- `apps/server/features/whatsapp/`: WhatsApp simulation routes, policy, and
  tests.
- `apps/server/infrastructure/database/`: database connection, migration
  runner, and migrations; keep `apps/server/migrate.ts` as the existing
  command-compatible facade.
- `apps/server/infrastructure/storage/`: private-storage adapter.
- `apps/server/features/seed/`: development seed implementation and sample
  seed data; keep `apps/server/seed-dev.ts` as the existing command-compatible
  facade. Move `demoData.ts` out of the web source because production web code
  does not consume it and server code currently uses it for seed/settings
  defaults.
- `apps/server/index.ts`: retain its current Replit-facing launch path and
  server composition responsibility.
- `apps/web/src/app/`: application shell, auth/router composition, and entry
  module. Keep `apps/web/src/main.tsx` as the Vite-compatible entry facade if
  moving its implementation would require changing the HTML entry path.
- `apps/web/src/features/<feature>/`: colocate each existing page with its
  feature; group warranty pages/panels together, keep feature styles beside
  them, and keep the WhatsApp simulation clearly named.
- `apps/web/src/shared/`: client store, common UI helpers, and global styles.
- Keep public static assets under `apps/web/public/`.

The source organization is intentionally based on existing features. Do not
split the large modules in this pass.

## Proposed documentation locations

- `docs/product/`: `PRD.md`, `DESIGN_SYSTEM.md`,
  `OWNER_MEETING_PLAYBOOK.md`, `DECISIONS_AND_ASSUMPTIONS.md`.
- `docs/engineering/`: `ARCHITECTURE.md`, `DATA_MODEL.md`,
  `SECURITY_PRIVACY.md`, `ACCEPTANCE_TESTS.md`, `AUTOMATIONS.md`,
  `WHATSAPP_SPEC.md`, `WARRANTY_EVIDENCE_STORAGE.md`.
- `docs/operations/`: `DELIVERY_PLAN.md`, `DECISIONS.md`, `PROJECT_LOG.md`.
- `docs/reports/`: the refreshed `REPOSITORY_ASSESSMENT.md` repository map and
  quick analysis.
- `docs/superpowers/specs/`: this design document.
- Root `README.md`: concise current-state overview, setup/check commands,
  prominent links to the categorized documents, and explicit Replit entry
  points.
- Root `AGENT_INSTRUCTIONS.md`: remains authoritative. It must explicitly
  describe the source map, list new documentation and subordinate instruction
  locations, and tell Replit, Copilot, Claude, Lovable, and other contributors
  when to read each one.
- `apps/AGENT_INSTRUCTIONS.md`: app/domain boundaries, current file map, test
  commands, and requirement to update the map when code moves; defers to root
  instructions.
- `docs/AGENT_INSTRUCTIONS.md`: documentation ownership, link/update rules,
  and status accuracy; defers to root instructions.

Update the superseded `.agents/memory/owner-settings-and-rbac.md` to preserve
only current, non-conflicting guidance. Do not remove the memory directory or
change its discovery behavior.

## Package and test discovery

Add the shared package to npm workspaces and update the TypeScript/Vite
configuration to resolve it without external dependencies. Keep existing
root-level development, start, build, typecheck, migration, and seed commands
working. Update Vite/Vitest configuration so the web, server, and shared
domain tests are all discovered by the repository-root `npm test` command.
Require the DB-backed integration suites to use an explicit
`GARAGE_TEST_DATABASE_URL`; an ambient `DATABASE_URL` must never be enough to
run integration tests against an unknown database. Do not alter test
assertions. Report environment-dependent integration skips/failures instead
of masking them.

## Constraints and safety

- Existing `.replit` workflow invokes `npm run dev`, which currently points to
  `apps/server/index.ts`; retain the command and port behavior.
- `scripts/post-merge.sh` runs `npm ci`, database migrations, and the build;
  preserve it and verify its referenced commands remain valid.
- Keep `npm run db:migrate` and `npm run db:seed:dev` working through the
  existing root scripts/facades; update only their internal paths as needed.
- Keep README setup and test commands consistent with `package.json`.
- Preserve the current distinction between active warranty workflows,
  development-only WhatsApp simulation, and on-hold/live integrations.
- Do not revert or normalize unrelated changes. The existing lockfile has
  resolution changes despite an unchanged third-party dependency manifest;
  preserve those versions and make only the local workspace-link changes
  required by `@garage/domain`.

## Validation and success criteria

- Every document link in `README.md`, root instructions, and moved documents
  resolves to an existing path.
- Root `AGENT_INSTRUCTIONS.md` describes the relocated documentation and
  subordinate instruction files so Replit can discover them without relying
  on implicit nested-instruction behavior.
- Root Replit configuration and scripts remain unchanged and target the
  current `apps/` layout.
- The web and server no longer import source files from one another; both use
  the shared domain package for common types and pure rules.
- Existing feature module bodies and externally visible behavior are
  unchanged; only file locations and imports differ.
- Typecheck and production build pass.
- The test runner executes the web test, all server test files, and shared
  domain tests; DB-backed suites are skipped unless the dedicated
  `GARAGE_TEST_DATABASE_URL` is explicitly configured.
- The repository assessment describes current source, persistence, auth,
  workflows, tests, active/on-hold integrations, and production-readiness
  limits; it does not claim a security audit or production readiness.
- The existing worktree changes remain uncommitted and are not overwritten.

## Implementation choices left to the builder

- Use standard npm workspaces for the internal shared package, without adding
  external dependencies.
- Use the smallest Vite/Vitest configuration change that includes
  `apps/web/src`, `apps/server`, and `packages/domain` tests.
- Preserve existing filenames when moving documents; use relative Markdown
  links that work in GitHub and Replit.
- Update every affected import, HTML entry, TypeScript include, Vite root
  integration, test discovery pattern, and package script reference when a
  source file moves.
- Report the exact test count and any failures observed after discovery is
  corrected.
