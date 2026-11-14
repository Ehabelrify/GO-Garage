# Application Source Instructions

Follow the repository-root [canonical instructions](../AGENT_INSTRUCTIONS.md)
first. This file is subordinate and applies only to `apps/`.

## Boundaries

- `web/` is the React/Vite client. Keep `src/main.tsx`, `index.html`, and
  `public/` paths stable unless the root instructions and Replit setup are
  updated together.
- `web/src/app/` contains the app shell; `features/` groups screens by product
  feature; `shared/` contains client state, shared UI helpers, and global
  styles.
- `server/index.ts` is the launch/composition entry. Server feature modules
  live under `server/features/`; database and storage adapters live under
  `server/infrastructure/`.
- Both apps consume shared contracts and pure rules from `@garage/domain`.
  Neither app may import source from the other app.
- `artifacts/mockup-sandbox/` is a prototype, not a production app entry.

Preserve API URLs, role and branch enforcement, migration contents, database
semantics, and UI behavior during structural work. Do not split route/page
modules as part of a path-only reorganization.

## Validation and safety

Run `npm run typecheck`, `npm test -- --run`, and `npm run build` after source
changes. The database integration suites require `GARAGE_TEST_DATABASE_URL`
for a dedicated disposable database; never rely on ambient `DATABASE_URL`.
Migration and development-seed commands can write to their configured
database, so verify the target before running them.

When moving code, update imports, tests, and the root source map. Keep
development demo authentication separate from Clerk production auth and keep
WhatsApp provider delivery disabled until it is genuinely configured and
verified.
