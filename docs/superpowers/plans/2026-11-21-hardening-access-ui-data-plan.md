# Plan: hardening, access, UI/UX, dummy data (P0-P4)

Design: [spec](../specs/2026-11-21-production-hardening-and-access-design.md). Complements, not replaces, the
[16 Nov full plan](2026-11-16-phase-1-full-operational-product-plan.md). No commits/pushes unless the user asks.
Local git identity is Ehab Elrify <ehab.elrify@gmail.com> (repo-local config only).

## Findings -> tasks
| # | Review finding | Task |
|---|---|---|
| 1,2 | no helmet / rate limit / trust proxy | W1-A |
| 3,4 | webhook replay window, zod validation | W1-A |
| 8 | dense one-line code | W2 (after W1-A, to avoid edit conflicts) |
| 10 | no CI / lint | W1-B |
| 11 | dependency grouping | W1-A (sole owner of package.json) |
| 12 | duplicate 0005 migration | W1-B documents only; never renumber applied files |
| 13 | skipped integration tests | W1-B CI job with Postgres service + `GARAGE_TEST_DATABASE_URL` |
| 14 | repo hygiene | W1-B |

## Wave 1 (parallel, disjoint file ownership)
- **W1-A server hardening:** `apps/server/index.ts`, `features/whatsapp/provider-webhook.ts`, `package.json`, lockfile.
- **W1-B repo hygiene/CI:** `.gitignore`, `.github/workflows/ci.yml`, a short `docs/engineering/MIGRATIONS.md`.
- **W1-C access + landing:** `apps/web/src/app/*`, `features/demo-auth/*`, `features/staff/StaffPage.tsx`,
  `apps/server/features/auth/*`, staff/demo routes in `operations/api.ts` (sole owner of those).
- **W1-D dummy data:** `apps/server/features/seed/*` + purge script (sole owner); wired through existing `db:seed:dev`.
- **W1-E UI/UX audit (read-only):** per-page findings and de-duplication map for W2.

## Wave 2
Per-module UI/UX rework tasks derived from W1-E (disjoint feature folders), then the formatting pass on dense files.

Wave 2 additions: W2-S (server) = unified search + customer/vehicle relations endpoints + QR resolve, and moving direct
`actor.role` checks to `hasCapability` (catalogue.manage, finance.view), owner delete/void routes with guards; W2-0 also
delivers RecordLink, DetailDrawer, Collapsible, GlobalSearch; W2-3 builds Customer 360 + Vehicle views on them.
Decision (Claude's call): availability config is the single capacity source of truth; remove capacity controls from
Settings "decisions" (W2-8). Docs to update: AGENT_INSTRUCTIONS.md and SECURITY_PRIVACY.md (new flag, pre-approval).
Pending user actions: approve running migration 0026 on a target DB; Clerk dashboard settings.

## Wave 2.5 (user additions, 21 Nov 2026; runs after W2-11 to avoid file collisions)
- **Purchases** (what a customer bought: products/packages/services sold, linked to quote/booking/job/invoice) become a real
  section of Customer 360 and Vehicle view; needs a table/read model (migration 0028+) and seed data.
- **Special requests**: new records tied to customer (+ optional vehicle), accepting FREE TEXT for now, with status
  (new / under review / accepted / declined), owner notes, visible in Customer 360 and an owner review queue. This is also
  the base for the later customer-app "custom work" requests.
- **Warranty layout and currency**: rework the warranty invoice panel with the shared patterns; currency selectable
  EGP / SAR (riyal) / USD, extensible list later; money stored with its currency, never mixed in totals.
- **Owner price editing**: catalogue package/add-on price matrix (sedan/SUV, roof add-on) editable by owner
  (capability catalogue.manage), versioned, with history; seed prices remain "example" labelled.
- Arabic copy review is deferred to the user.

## Wave 2.6 (user additions; after 2.5 finishes)
- **Auto-generated quotes and invoices** wherever possible (accepted special request -> quote; completed job/booking -> invoice;
  warranty invoices), using ONE generic template per document type (confirmed templates come later: keep templates
  swappable/config-driven). Content: customer + vehicle details, line items (products/packages used, service/labour fees,
  transportation when applicable, add-ons, discounts incl. promotions/benefits, tax), totals per currency, validity/terms
  placeholders, document number, branch, issue date. PRINTABLE (print stylesheet / print view, A4, bilingual, RTL-aware)
  and downloadable as PDF via browser print. Special-request owner reply fields: decision, free-text reply, price, time frame,
  available-from, valid-until, internal notes (done in 2.5-A).

- **"Create quote" action (user decision):** wherever it appears (special request, customer 360, vehicle, quotes tab) it
  finds the customer, then their most recent service work (latest booking/job/completed service, or the accepted
  special-request reply: price, time frame) and pre-generates a quote from it (lines, fees, transport, add-ons, tax,
  currency), opened as an editable draft. Auto-generation runs on its own where it can (accepted request, completed job);
  the button is the manual path when nothing was auto-generated. Wire `onCreateQuote` in the Special requests tab.
- Switch the special-request currency field to the central currency dropdown from W2.5-B (packages/domain).

## Wave 3
Stabilization gate (P4): typecheck, test, build, DB-integration run, tracker + docs updates, report to user.

## Rules every agent follows
Read root `AGENT_INSTRUCTIONS.md` + `apps/AGENT_INSTRUCTIONS.md`; keep Replit control points; no server<->web imports;
preserve API URLs/RBAC/migrations; never run migrations/seeds against a non-dev DB; no secrets in code; Arabic/RTL
and English/LTR both supported; run `npm run typecheck` and `npm test -- --run` before reporting; do not commit.
