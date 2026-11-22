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

## Wave 2.7 (user-approved 21 Nov 2026: visual checks, plate normalisation, all UX improvements)
Start now (disjoint files): **V** visual-check CI job (seed -> boot -> screenshots per role, EN/AR-RTL, 360/768/1280, uploaded
as workflow artifacts; Playwright installed in CI only, nothing added to local machine or package.json unless unavoidable);
**P** plate search normalisation (Arabic/Latin letters, Arabic-Indic digits, spaces/dashes; shared normaliser in
packages/domain used by server search, 360 lookups, web inputs; migration 0032 for the index expression).
After Wave 2.6 (they share App.tsx/navigation/styles): **U1** receptionist fast path + Today board home; **U2** technician mode
(large actions; photo/note/checklist/report-issue need new API+storage); **U3** reminders/follow-ups (booking reminders,
warranty-expiry alerts, ready-for-pickup) on the simulation outbox, scheduled, no live provider; **U4** duplicate customer
detection + merge (owner, audited, reversible window); **U5** owner audit-log screen + exports (CSV) + daily owner summary;
**U6** saved filters, bulk actions, keyboard shortcuts on big lists; **U7** printable warranty card with QR via DocumentSheet.
Planned, awaiting user decision/priority (NOT started): role-widget protection (passcode/allow-list or read-only demo owner),
server-side paging for big lists, health check + error monitoring + backups, CSP once domain known, owner 2FA (Clerk setting),
remaining role-based checks, large/dense file refactors, tracker summary header.

## Wave 4: visual-review fixes (decisions by the user, 22 Nov 2026)
Source: docs/testing/visual/2026-11-21/VISUAL_REVIEW_REPORT.md (work packages WP0-WP10). Decisions:
1. **Branch managers see Quotes, Reservations, Benefits and Promotions but cannot add, edit or remove.** Split the
   capability: `quotes.view` (owner + branch-manager + receptionist read) and `quotes.manage` (owner by default,
   grantable). Server enforces; UI hides write actions for view-only users.
2. **Money:** whole EGP on dashboards/KPIs (compact 11.8M / 293K when large), 2 decimals in tables. PLUS a per-viewer
   option "Show full precision" (exact amounts with fractions everywhere). Stored in the browser only.
3. **Paging (user unsure; my call):** classic pages, default 25 rows, selectable 25/50/100, "Showing 1-25 of N",
   sticky header; Overview "Needs attention" shows the top 10 grouped by type with a View all link.
4. **Tablet:** icon-only sidebar rail at <=1024 px; tables switch to cards below ~1000 px.
5. **Promotions tab is shown** and gets dummy data from the confirmed facts (GS-F021..F026: Ultimate club 44,999,
   Plus lifetime 52,999, Ultimate 39,999, from 32,999 with benefits, referral/warranty-card 10,000 discount,
   multi-car fourth-car-free). Labelled as advertised examples, never approved policy.
6. **Names (user unsure; my call):** customer names are shown exactly as entered, never translated. Interface text and
   service/catalogue labels follow the UI language. Seed data uses one script per customer name, not mixed inside a
   single name.
Packages: WP0 shared design system first (serial). In parallel with WP0 (disjoint files): WP-S server (quotes.view/manage,
consents -> "missing", GET /api/promotions) and WP9 seed data. Then WP1-WP8 feature packages in parallel, then WP10 harness.

## Wave 5: quick intake side panel (user request, 22 Nov 2026; starts after Wave 4 finishes — touches customers, bookings, quotes, whatsapp, catalogue)
One global side panel (top-bar "New" button, also opened from a WhatsApp chat) to handle a walk-in or an unsaved number without
leaving the page: (1) find or create the customer, (2) find or add the vehicle (plate normaliser + duplicate check), (3) pick
requested items from ONE catalogue listing services, packages and products, (4) finish as Create quote (default), Book
appointment or Save customer only. Gaps found in the code: the provider webhook rejects unknown contacts (409
CONTACT_UNMAPPED) and whatsapp_conversations.customer_id / vehicle_id are NOT NULL, so an unsaved number cannot create a
conversation today (needs nullable links + an unlinked-contact state + a "link to customer" action); catalogue_package_versions.kind
only allows 'package' | 'standalone', so parts/accessories need a third kind ('product': name, category, price, tax, no stock;
inventory stays out of scope for Wave 5) and quote lines for products must not need bay time.
**User answers (22 Nov 2026):** (1) Products start as name/category/price/tax only. Stock tracking and inventory monitoring
are REQUIRED later, together with the customer mobile app / storefront launch (Phase 5): design the product record so stock
(quantity on hand, reorder level, per-branch stock, movements) can be added without reshaping it (own product id, branch
availability already in the model, no stock columns hard-coded into quotes). (2) An unsaved WhatsApp number appears in the inbox
as "New contact (<phone number>)" visible to receptionists and managers; once the customer is created or linked through the
side panel, the conversation is linked and the list shows the customer's name from then on.

Phase 5 (customer mobile app) must also include: stock tracking and inventory monitoring (per-branch quantity, reorder alerts,
movements, reservation of stock for quotes/orders), as the user requires before launching the storefront.

## Agreed sequence (user, 22 Nov 2026)
1. Seed agent finishes -> checks -> last Wave 4 commit.
2. Wave 5: quick-intake side panel (customer, vehicle, catalogue incl. products; unsaved WhatsApp numbers as "New contact (<phone>)").
3. UX improvements from the open items: reminders and follow-ups (booking reminders, warranty expiry, ready for pickup, on the
   simulated outbox), duplicate customer detection and merge, owner audit-log screen + CSV export + daily owner summary,
   saved filters / bulk actions / keyboard shortcuts on big lists, printable warranty card with QR, technician photos / notes /
   checklists / report issue.
4. User pushes -> user runs the manual Visual checks -> Claude reads the artifact and fixes what it shows.
5. User runs a test on Replit together with Maher (migrations 0026-0033 first, seed on a throwaway database) to settle things
   BEFORE the customer mobile app (Phase 5).
Not scheduled (user did not pick them): role-widget protection, health check/monitoring/backups, CSP, owner 2FA. Raise again
before the Replit test, since the widget is public on the live URL.

## Wave 3
Stabilization gate (P4): typecheck, test, build, DB-integration run, tracker + docs updates, report to user.

## Rules every agent follows
Read root `AGENT_INSTRUCTIONS.md` + `apps/AGENT_INSTRUCTIONS.md`; keep Replit control points; no server<->web imports;
preserve API URLs/RBAC/migrations; never run migrations/seeds against a non-dev DB; no secrets in code; Arabic/RTL
and English/LTR both supported; run `npm run typecheck` and `npm test -- --run` before reporting; do not commit.
