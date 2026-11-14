# Codebase Remap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organize Garage OS source by shared domain and existing features, relocate and refresh documentation, and keep Replit's launch/control paths and application behavior intact.

**Architecture:** Add a private npm workspace `@garage/domain` for shared contracts and pure rules; group the existing server and web modules by their current feature boundaries without splitting module bodies. Keep the existing root and Replit-facing command paths stable, update every import/config/map affected by moves, and make the root Replit instructions the authoritative guide to all subordinate instructions and documentation.

**Tech Stack:** TypeScript, React 19, Vite 6, Express 5, PostgreSQL, npm workspaces, Vitest 5, Replit.

**Spec:** `docs/superpowers/specs/2026-11-14-codebase-remap-design.md`

## Global Constraints

- Preserve the `.replit` workflow, port behavior, root npm commands, and `scripts/post-merge.sh`.
- Preserve existing module bodies and externally visible behavior; only relocate code and update imports/configuration.
- Do not split route/page modules or change SQL, API contracts, permissions, authentication, UX, or business rules.
- Do not add external dependencies.
- Do not discard existing uncommitted changes, normalize unrelated changes, stage, commit, or push.
- Keep live integrations clearly distinguished from development simulation and on-hold features.
- Keep the root `AGENT_INSTRUCTIONS.md` authoritative and explicitly map the relocated docs and subordinate instruction files.

## Review Focus

- Vite/Vitest globs resolve the web, server, and shared-domain tests from the configured `apps/web` root — run the full `npm test -- --run` suite after test configuration and each source move.
- Node/tsx and Vite both resolve the local `@garage/domain` TypeScript export without an external runtime dependency — run typecheck, unit tests, and production build after introducing the workspace.
- The migration runner still finds the same ordered SQL files after its move — verify its resolved migration directory and preserve `npm run db:migrate`; do not run against an unknown database.
- The web HTML entry and static assets still build from `apps/web` — verify the production output contains the app entry, logo, and favicon.
- Existing authorization, warranty, and WhatsApp route behavior remains unchanged — run all database-free server tests; DB-backed suites run only when the explicit `GARAGE_TEST_DATABASE_URL` is configured, never from ambient `DATABASE_URL`.

---

## File Structure and Responsibilities

### Shared domain

- Create `packages/domain/package.json` and `packages/domain/src/index.ts`.
- Move `apps/web/src/types.ts` to `packages/domain/src/types.ts`.
- Move `apps/web/src/domain.ts` to `packages/domain/src/rules.ts`.
- Move `apps/web/src/domain.test.ts` to `packages/domain/src/rules.test.ts`.
- Update root `package.json` with the local workspace and `@garage/domain` dependency; update `package-lock.json` only for that workspace link, preserving existing third-party resolutions.

### Server features and infrastructure

- Keep `apps/server/index.ts` as the Replit-facing server composition entry.
- Move `apps/server/auth.ts`, `authz.ts`, `demo-auth.ts`, `demo-auth.test.ts`, `authz.test.ts`, and `middlewares/clerkProxyMiddleware.ts` to `apps/server/features/auth/`.
- Move `apps/server/bootstrap.ts` and `routes/api.ts` to `apps/server/features/operations/` without splitting route handlers.
- Move `claim-evidence.ts` and its test, `warranty-invoices.ts`, `warranty-rules.ts` and its test, `warranty-verification.ts` and its test, `routes/warranties.ts`, and `warranty-ledger.integration.test.ts` to `apps/server/features/warranty/`.
- Move `whatsapp-policy.ts` and its test, `routes/whatsapp.ts`, and `whatsapp.integration.test.ts` to `apps/server/features/whatsapp/`.
- Move `db.ts`, `migrate.ts`, and `migrations/*.sql` to `apps/server/infrastructure/database/`; retain `apps/server/migrate.ts` as a facade for the existing npm script.
- Move `private-storage.ts` to `apps/server/infrastructure/storage/`.
- Move `seed-dev.ts` and the former `apps/web/src/demoData.ts` to `apps/server/features/seed/`; retain `apps/server/seed-dev.ts` as a facade for the existing npm script.

### Web features and shared UI

- Keep `apps/web/index.html`, `apps/web/public/`, and `apps/web/src/main.tsx` in place to preserve the Vite entry and static asset paths.
- Move `AuthApp.tsx` and `App.tsx` to `apps/web/src/app/`.
- Move `BookingsPage.tsx`, `CustomersPage.tsx`, `OverviewPage.tsx`, `SettingsPage.tsx`, `StaffPage.tsx`, and `WorkshopPage.tsx` from `pages/` into matching `apps/web/src/features/<feature>/` directories.
- Move `WarrantiesPage.tsx`, `WarrantyInvoicePanel.tsx`, `PublicWarrantyVerificationPage.tsx`, and warranty CSS into `apps/web/src/features/warranty/`.
- Move `WhatsAppSimulationPage.tsx` and its CSS into `apps/web/src/features/whatsapp/`.
- Move `DemoAccountPanel.tsx` and its CSS into `apps/web/src/features/demo-auth/`.
- Move `store.tsx`, `ui.tsx`, and `styles.css` to `apps/web/src/shared/`.

### Documentation and instructions

- Move product docs to `docs/product/`: `PRD.md`, `DESIGN_SYSTEM.md`, `OWNER_MEETING_PLAYBOOK.md`, `DECISIONS_AND_ASSUMPTIONS.md`.
- Move engineering docs to `docs/engineering/`: `ARCHITECTURE.md`, `DATA_MODEL.md`, `SECURITY_PRIVACY.md`, `ACCEPTANCE_TESTS.md`, `AUTOMATIONS.md`, `WHATSAPP_SPEC.md`, `WARRANTY_EVIDENCE_STORAGE.md`.
- Move operating docs to `docs/operations/`: `DELIVERY_PLAN.md`, `DECISIONS.md`, `PROJECT_LOG.md`.
- Move and refresh `REPOSITORY_ASSESSMENT.md` in `docs/reports/`.
- Keep `README.md`, `.replit`, `AGENT_INSTRUCTIONS.md`, `package.json`, TypeScript/Vite configuration, and `scripts/post-merge.sh` at the repository root.
- Create `apps/AGENT_INSTRUCTIONS.md` and `docs/AGENT_INSTRUCTIONS.md`; both defer to root instructions.
- Update `.agents/memory/owner-settings-and-rbac.md` to remove superseded identity/product direction.

## Task 1: Restore Complete Test Discovery

**Files:**
- Modify: `vite.config.ts`
- Modify: `apps/server/warranty-ledger.integration.test.ts`
- Modify: `apps/server/whatsapp.integration.test.ts`
- Test: existing tests under `apps/web/src`, `apps/server`, and later `packages/domain`

**Interfaces:**
- Produces: root `npm test -- --run` discovers the existing web and server test files; DB-backed tests run only when `GARAGE_TEST_DATABASE_URL` is configured.

- [ ] **Step 1: Add explicit test include patterns and a database safety gate**

Configure Vitest to include `src/**/*.test.ts`, `../server/**/*.test.ts`, and `../../packages/domain/**/*.test.ts` relative to the configured Vite root `apps/web`. Change both database-backed suites to skip unless `GARAGE_TEST_DATABASE_URL` is explicitly set. Before dynamically importing the application database pool, point `DATABASE_URL` at that test URL; restore the prior environment value after the suite.

- [ ] **Step 2: Run the suite before moving source**

Run: `npm test -- --run`

Expected: the web suite and all eight server test files are reported; the two integration suites are skipped unless `GARAGE_TEST_DATABASE_URL` is explicitly set. Verify separately that an ambient `DATABASE_URL` with no test URL does not enable them. Record failures before proceeding; do not hide them.

## Task 2: Establish the Shared Domain Workspace

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/src/index.ts`
- Move: `apps/web/src/types.ts`, `apps/web/src/domain.ts`, `apps/web/src/domain.test.ts`
- Modify: root `package.json`, `package-lock.json`, `tsconfig.app.json`, `tsconfig.server.json`
- Modify: shared-domain imports in `apps/web/src/` and `apps/server/`

**Interfaces:**
- Produces: `@garage/domain` exports existing types and pure domain functions with unchanged names and behavior.
- Consumes: root npm workspace resolution; no third-party dependency is added.

- [ ] **Step 1: Define the workspace package entry**

Create private package `@garage/domain` at version `0.1.0`, with `"type": "module"` and `"exports": { ".": "./src/index.ts" }`. Re-export existing types and rules from `src/index.ts`.

- [ ] **Step 2: Move domain code and its tests**

Move the existing shared type file to `src/types.ts`, rename `domain.ts` to `src/rules.ts`, move the existing tests to `src/rules.test.ts`, and update their relative imports without changing assertions.

- [ ] **Step 3: Link the local workspace**

Declare `packages/domain` as an npm workspace and add the matching `@garage/domain` local dependency. Update only the lockfile entries required for the workspace link; do not refresh third-party package versions.

- [ ] **Step 4: Replace cross-app source imports**

Change both server and web consumers to import shared types/rules from `@garage/domain`. Move `demoData.ts` to `apps/server/features/seed/seed-data.ts`; update its type imports and every server consumer. Do not leave server imports from `apps/web/src`.

- [ ] **Step 5: Include shared sources in type checks**

Update the app/server TypeScript configuration to include imported shared package sources as needed; retain strict compiler options.

- [ ] **Step 6: Verify the shared boundary**

Run: `npm run typecheck; npm test -- --run; npm run build`

Expected: all non-database tests pass, DB-backed tests run only against an explicitly configured test database and are otherwise shown as skipped, and both app bundles/typechecks resolve the workspace package.

## Task 3: Group Server Modules by Feature and Infrastructure

**Files:**
- Move: auth, operations, warranty, WhatsApp, database, storage, and seed files listed under File Structure
- Modify: `apps/server/index.ts`, `apps/server/migrate.ts`, `apps/server/seed-dev.ts`, moved module imports, and `tsconfig.server.json`

**Interfaces:**
- Consumes: `@garage/domain` from Task 2.
- Produces: feature-based server source paths with unchanged API URLs, roles, schema, npm commands, and Replit launcher.

- [ ] **Step 1: Move server modules into their feature folders**

Place auth files under `features/auth`, core bootstrap/API under `features/operations`, warranty files/tests under `features/warranty`, and simulator files/tests under `features/whatsapp`. Preserve module bodies; update only relative imports and route mounting imports.

- [ ] **Step 2: Move infrastructure and retain script facades**

Move database access and migrations to `infrastructure/database`, private storage to `infrastructure/storage`, and seed implementation/data to `features/seed`. Keep `apps/server/migrate.ts` and `apps/server/seed-dev.ts` as thin facades used by existing npm scripts. Ensure migration discovery resolves to the relocated SQL directory.

- [ ] **Step 3: Update TypeScript coverage**

Update `tsconfig.server.json` to typecheck all server feature/infrastructure sources and tests that it previously included.

- [ ] **Step 4: Run server and full checks**

Run: `npm run typecheck; npm test -- --run; npm run build`

Expected: database-free server tests pass; DB-backed suites run only against `GARAGE_TEST_DATABASE_URL` and are otherwise reported as skipped; production build remains successful.

## Task 4: Group Web Modules by App, Feature, and Shared UI

**Files:**
- Move: app shell, feature pages, demo account panel, shared client files listed under File Structure
- Modify: `apps/web/src/main.tsx`, all affected imports, and `apps/web/src/App.tsx`/`AuthApp.tsx` consumers

**Interfaces:**
- Consumes: `@garage/domain` and the server API contract.
- Produces: feature-colocated web modules with unchanged routes and UI behavior; Vite's `apps/web` root and `src/main.tsx` entry stay stable.

- [ ] **Step 1: Move app-shell and shared modules**

Move `App.tsx` and `AuthApp.tsx` into `src/app/`; move store, UI helpers, and global styles to `src/shared/`; keep `src/main.tsx` and update its imports.

- [ ] **Step 2: Move feature pages and styles**

Move each existing page into its feature directory, grouping warranty pages/panels together and the WhatsApp simulation separately. Move demo account UI to `features/demo-auth`. Update imports only; do not split components or alter their behavior.

- [ ] **Step 3: Verify browser entry and app checks**

Run: `npm run typecheck; npm test -- --run; npm run build`

Expected: the Vite output includes the app entry and public logo/favicon; all unit tests pass; routes remain unchanged.

## Task 5: Relocate Documentation and Maintain the Multi-Agent Map

**Files:**
- Move: current root product, engineering, operations, and repository-assessment docs to the locations listed under File Structure
- Modify: `README.md`, root `AGENT_INSTRUCTIONS.md`, `docs/AGENT_INSTRUCTIONS.md`, `apps/AGENT_INSTRUCTIONS.md`, `.agents/memory/owner-settings-and-rbac.md`
- Modify: internal relative document links in every moved Markdown file

**Interfaces:**
- Consumes: completed source layout from Tasks 2–4.
- Produces: root Replit instructions as the canonical map for Replit, Copilot, Claude, Lovable, and other contributors; scoped guides link back to root and remain subordinate.

- [ ] **Step 1: Move documents and fix references**

Move each file to its exact category. Update all internal links and references to source paths, scripts, and other documents. Keep the user-facing filenames unchanged.

- [ ] **Step 2: Refresh the README and instruction hierarchy**

Update the root README with the current app map, commands, docs index, and Replit entry points. Update root `AGENT_INSTRUCTIONS.md` to explicitly list the new docs and instruction locations, describe the source map, direct agents to read applicable subordinate files, and require map updates whenever paths change. Create app/doc subordinate instruction files that explicitly defer to the root file.

- [ ] **Step 3: Refresh the repository assessment and memory**

Replace obsolete assessment claims with current facts: React/Vite web app, Express/PostgreSQL server, Clerk auth, implemented workflows, test layout, on-hold integrations, and production-readiness gaps. Remove only superseded claims in the tracked owner-settings memory while retaining current Owner-settings/RBAC guidance.

- [ ] **Step 4: Check every Markdown link**

Run a local link/path check over root README/instructions and all moved docs; expected result is zero missing local targets.

## Task 6: Final Replit and Repository Verification

**Files:**
- Verify: `.replit`, `package.json`, `vite.config.ts`, `tsconfig*.json`, `scripts/post-merge.sh`
- Verify: all source/config/docs changes

**Interfaces:**
- Consumes: all prior tasks.
- Produces: an auditable final map and verification record without staging, committing, or pushing.

- [ ] **Step 1: Verify Replit command invariants**

Confirm `.replit` still starts `npm run dev` on port `5000`; `npm run dev`, `npm run start`, migration, and seed scripts resolve through the existing root paths; `scripts/post-merge.sh` still references valid commands. Do not run migrations against an unknown database.

- [ ] **Step 2: Run final checks**

Run: `npm run typecheck; npm test -- --run; npm run build; git diff --check`

Expected: all configured checks pass, test output identifies skipped database suites unless `GARAGE_TEST_DATABASE_URL` is explicitly configured, and no whitespace errors are reported.

- [ ] **Step 3: Confirm worktree preservation**

Review `git status --short --untracked-files=all`; confirm the pre-existing source relocation and lockfile changes were not reverted, staged, or committed, and no unrelated files were changed.
