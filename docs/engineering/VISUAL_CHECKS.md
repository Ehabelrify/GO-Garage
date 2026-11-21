# Visual checks (CI)

Workflow: `.github/workflows/visual.yml`. Scripts: `scripts/visual/`. Nothing here is installed locally or added to the root
`package.json`; Playwright, Chromium and axe-core exist only inside the GitHub Actions runner
(`scripts/visual/package.json` is not a workspace and is installed with `npm install` in CI only).

## What the job does
1. Starts a disposable `postgres:16` service, runs `npm ci` and `npm run db:migrate`. This is the first real execution of new SQL, so
   a failing migration shows up here first.
2. Seeds with `GARAGE_SEED_NOW=2026-11-21T10:00:00Z GARAGE_DATASET_CLASS=scenario npm run db:seed:dev`.
3. Boots `npm run dev` (Vite dev middleware, `NODE_ENV=development`) with `GARAGE_ROLE_WIDGET_ENABLED=true`, a CI-only
   `SESSION_SECRET`, `GARAGE_DATASET_CLASS=scenario`, and clearly fake Clerk keys.
4. `scripts/visual/run.mjs` signs in as `demo-owner`, `demo-manager`, `demo-reception`, `demo-technician` through
   `POST /api/demo/session` (cookie `garage_os_demo` set in Playwright), then visits every page of the role (derived from
   `apps/web/src/app/navigation.ts`, plus merged-page tab deep links such as `quotes?tab=reservations`) in English and Arabic
   (RTL) at 360, 768 and 1280 px, full-page screenshots after network idle.
5. Per page it records console errors, failed requests, `/api` 4xx/5xx (with a response snippet), horizontal overflow
   (`scrollWidth > innerWidth`, with the widest offending elements) and the axe-core WCAG A/AA violation count.
6. Flows (owner): `/` focuses global search and a search for plate `أ ب ج 1234`; Customer 360 for that seeded record; a drawer opened
   from the customers list; print views for quotes, finance (invoice) and warranties (skipped with a note if no print control
   exists yet; `window.print` is stubbed, popups are captured); a print-to-PDF of the 360 page.

### Pass / warn / fail
- FAIL (job exits 1): any `/api` 5xx, any uncaught page error, a page that fails to render or is redirected out of the workspace, or
  horizontal overflow at 360 px. A failing page is retried once before it is recorded.
- WARN only: console errors, API 4xx, failed requests, overflow at 768/1280, axe violations.

### Why the Clerk keys are fake and how sign-in works without Clerk
The app wraps everything in `ClerkProvider` and the server mounts `clerkMiddleware`. In CI:
- Server: `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY` are syntactically valid but fake. `clerkMiddleware` needs them to start; with no
  Clerk session token in the request it never calls Clerk, so `getAuth()` is empty and the server falls back to the demo cookie.
- Browser: the two Clerk script requests (`clerk.browser.js`, `ui.browser.js`) are answered by a tiny signed-out stub inside
  `run.mjs`, so there is no network call to Clerk. The app then asks `GET /api/demo/session`, finds the cookie and renders the workspace.
- `GARAGE_API_RATE_LIMIT=100000` lifts the general `/api` per-minute cap (default 300) because one CI IP loads hundreds of pages.
  This is the only server code change; the variable is unset everywhere else.

## Running it
- Automatically on every push/PR to `main`.
- Manually: Actions tab > "Visual checks" > Run workflow, or `GH_HOST=github.com gh workflow run visual.yml`.
- Narrow a run (edit the step env or use `workflow_dispatch` on a branch): `ROLES`, `LOCALES`, `WIDTHS`, `ONLY_PAGES`, `SKIP_FLOWS=true`,
  `CONCURRENCY` are read by `run.mjs`.

## Downloading the artifacts
The local `gh` CLI points at a GitHub Enterprise host, so name the host explicitly:
```sh
GH_HOST=github.com gh run list --workflow visual.yml --limit 5
GH_HOST=github.com gh run download <run-id> --dir visual-download
```
(requires `gh auth login --hostname github.com`). Without that, open the run in the Actions UI and download the
`visual-checks-<n>` artifact. The run page also shows `report.md` in the job summary, which needs no download.
Artifacts: `report.md`, `report.json`, `screenshots/<role>/<locale>/<width>/<page>.png`, `screenshots/flows/*.png`, `pdfs/*.pdf`;
the server log is a separate artifact `visual-server-log-<n>`. Retention is 14 days.

## How Claude should read the results
1. Read `report.md` first. Start with "API failures": any 5xx points at new SQL or a route bug; the response snippet and
   `visual-server-log` give the message. Then "Flows", then the FAIL/WARN detail section.
2. Open screenshots only for rows that need a look. Path pattern: `screenshots/<role>/<locale>/<width>/<page>.png`
   (e.g. `screenshots/owner/ar/360/customers.png`). Check Arabic pages for RTL mirroring, clipped or overlapping text and
   empty states that should hold seeded data; check 360 px for the overflow rows.
3. Use `report.json` for scripted queries, e.g. `jq '.rows[] | select(.status=="FAIL") | {role,locale,width,page,reasons}'`.
   Row fields: `status, reasons, consoleErrors, pageErrors, failedRequests, apiFailures[{status,method,path,body}], overflow{scrollWidth,innerWidth,offenders}, axe{violations,nodes,top}, screenshot`.
4. Pages are full-page captures; very tall pages are normal. Dates are pinned to 2026-11-21 10:00 UTC (seed and browser clock).

## Maintenance
- `routes.mjs` parses `navigation.ts` with regexes; if its shape changes the script throws a clear error. Update it there.
- Pin bumps: `playwright` and `axe-core` versions live in `scripts/visual/package.json`; keep them exact.
- The job does not replace the unit and integration suites in `ci.yml`.
