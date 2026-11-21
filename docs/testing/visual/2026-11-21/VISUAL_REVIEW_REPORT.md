# Garage OS - Consolidated Visual Review (run of 21 Nov 2026)

For: product owner. Sources: five screenshot reviews (A owner 1280, B owner 768, C owner 360, D branch manager, E receptionist/technician/flows) plus the automated `report.md` (222 pages, 0 FAIL, 222 WARN; flows 6 pass, 9 fail, 4 skipped).

Conventions
- Screenshot paths are relative to the zip's `checks/screenshots/` folder, shaped `role/locale/width/page.png` (for example `owner/en/1280/overview.png`). Only 16 key shots are committed under `docs/testing/visual/2026-11-21/screenshots/` (flat names such as `owner_en_1280_overview.png`); the rest come from the 14-day GitHub run artifact.
- Source paths are relative to `apps/web/src/` and were checked with Grep/Glob.
- Severity: P1 = blocks daily use or looks broken, P2 = clearly unprofessional or costly, P3 = polish.
- Honesty note: the reviewers did not open every shot. Reviews of AR pages at 768/360 and several tall pages are partly inferred from the EN twin. Items marked (inferred) must be spot-checked.

---

## 1. Executive verdict

What is good
- The visual identity is calm and coherent: dark teal sidebar, warm off-white cards, one accent colour, sober status colours. All five reviewers say the shell looks professional at 1280.
- Finance is the strongest page (clear cards, deltas, source links). Customers, Settings and Catalogue read well at desktop width.
- RTL mirroring is structurally correct everywhere that was opened (sidebar right, columns reversed, tabs mirrored, bottom nav order).
- The phone card layout (`DataTable` cards) is readable and consistent. The global search plate dropdown (`owner/en/360/flows/search-plate`) works well. The quote print drawer is clear.
- Tab bars have 44 px hit areas and count badges (Warranties) are a good pattern.

What is not good enough
1. Numbers overflow. Large money values on the Overview tiles are clipped or spill out of their card on desktop, tablet and phone, in English and Arabic.
2. Nothing is paged. Pages are 9,000 to 144,000 px tall (Arabic quotes at 360 px: 144,396 px). The home screen is a 157-191 row wall of near-identical "Booking review" rows.
3. Sizes are not in a system. Page titles, section titles, KPI values, table text and captions all use different sizes; the topbar "Sign out" is larger than anything around it.
4. The same thing is built several ways: page title and tabs order, filter bars, action buttons, plates, dates, customer names.
5. Tablet (768 px) is broken: the sidebar still takes 220 px, five pages are wider than the screen, words wrap one letter per line, buttons wrap ("Con/firm").
6. Mixed Arabic and Latin text in one row (names, plates, dates, services) looks broken in both languages. Much of this is seed data, but the bidi (text-direction) handling is also genuinely weak.
7. Several screens look unfinished: Quotes > Promotions (a lone picker), the unavailable settings, Customer 360 / drawer (failed to load), the empty Technician screen.

Overall readiness
- Owner on desktop: usable demo, not yet launch-quality (P1 overview overflow, no paging).
- Receptionist and branch manager: usable but not "front-desk ready" (history dumps instead of a today queue, wrapped Confirm button, crushed WhatsApp composer).
- Tablet and phone: not ready.
- Technician: cannot be judged (0 jobs seeded); likely not ready for workshop-floor use.
- Arabic: acceptable layout, but number, sign, phone and plate direction bugs.
- Accessibility: about 70 pages fail axe colour-contrast (README open item).

Disagreements between reviewers and my decision
- Sidebar not reaching the bottom of tall full-page captures (A-10). Not a defect: `.sidebar` is `position: fixed` (`shared/styles/layout.css:3-4`). Decision: capture artefact; ignore.
- Bottom nav overlapping content in full-page shots (C-02, D-03, E-02). Likely a capture artefact (a fixed bar painted once at viewport position), and `.main-area` already pads the bottom by 82 px (`layout.css:127`). Decision: verify with viewport screenshots (section 10); the real, fixable defect is the truncated label "Quotes & ..." (nav label `Quotes & offers`, `app/navigation.ts:56`).
- Overview scope: D counts 157 rows (manager scope), A/C count 191 (owner scope). Not a conflict; same defect.
- Bookings EN at 1280 for the owner is "Loading page..." only (A-04, C-12). Receptionist and manager bookings render fine. Decision: capture-timing problem plus a weak loading state (`app/RouteChunk.tsx:37` renders plain text); fix both.
- Overflow at 768: B says the overflow is still present; the README says CSS was already constrained and needs a rerun. Decision: treat as unresolved until the next run (the numbers in B and D, 863-1019 px wide, come from the same run as the fix commit and are therefore pre-fix).
- Finance number format: D says 0 decimals vs 2 decimals is mixed; A says drop cents on KPIs. Decision: whole EGP on KPIs and compact notation on small tiles, 2 decimals only in money tables where cents matter (rule in section 2.2).
- A rates Customers the best-aligned list; D and E rate its filter row as misaligned. Both true: table good, filter row (QR input plus disabled "Find") is the problem.
- Whether managers should see Quotes: D-21 found `branch-manager` lacks quote capabilities in `shared/capabilities.ts:12` while the UI shows Quotes. Decision: needs product-owner call (section 9, D1); until then it is a test/permission mismatch.

---

## 2. Top cross-cutting problems (ranked)

| # | Problem | Sev | Root cause | Affected pages (examples) | Recommended fix | Shared source |
|---|---|---|---|---|---|---|
| 1 | Money and number overflow | P1 | Tile value is 26 px (22 px mobile) with no shrink or wrap; auto-fit tiles are only `minmax(170px,1fr)`; `Money` renders raw full string with decimals | Overview all roles/widths/locales; Search-plate flow (owner/en/360) | Section 2.2 | `features/overview/overview.css:1-8,20`, `shared/components/Money.tsx`, `shared/format.ts:31`, `shared/styles/components.css:9` (`.stat-value`) |
| 2 | No paging; "Needs attention" is an unbounded wall | P1 | `DataTable` has sorting but no paging; Overview passes all rows (`OverviewPage.tsx:174-180`) | Overview, Bookings, Quotes, Warranties, Reservations, Benefits, Transport, Workshop (757 jobs), Customers | Paged `DataTable` (25/50/100, "Showing 1-25 of 415"), sticky header; Overview shows top 10 grouped by type with counts and "View all" | `shared/components/DataTable.tsx`, `features/overview/OverviewPage.tsx` |
| 3 | Tablet breakpoint gap and page overflow at 768 | P1 | Sidebar hides only at <=760 (`layout.css:124`), so 768 keeps a 220 px sidebar (`layout.css:118-122`) leaving about 548 px; tables have `min-width: 650px` (`components.css:26`); cards only below 760 (`components.css:57`) | Quotes, Reservations, Benefits, Transport, WhatsApp (page 780-1019 px wide), Bookings (crushed Branch/Service columns) | Raise the table-to-cards switch to about 1000 px; icon-rail or drawer sidebar at <=1024 | `shared/styles/layout.css`, `shared/styles/components.css`, `shared/components/DataTable.tsx` |
| 4 | Typography not in sync | P2 | Font sizes hard-coded per class; h1 `clamp(25px,3vw,32px)` (`base.css:14`); no scale tokens | All pages | Section 2.1 type scale | `shared/styles/tokens.css`, `base.css`, `components.css`, `layout.css` |
| 5 | Mixed-direction text (plates, phones, dates, composite strings) | P2 (P1 in Arabic phone/finance sign) | Composite strings built by concatenation; no `Plate`/`Phone`/`DateText` component; Arabic plate letters displayed in different orders | Transport "Booking" column, Overview, Quotes, Customers (AR phone `1046 000 122 20+`), Finance AR deltas, WhatsApp bubble dates | Section 6 | `shared/components/RecordRef.tsx`, `features/transport/transport-logic.ts`, `TransportPanel.tsx`, `shared/format.ts`, `shared/ui.tsx:90-103` |
| 6 | Topbar crowded and duplicated | P2 | Role chip, "Role preview account", email, language toggle, Sign out all in the topbar; Sign out again in the sidebar footer (`app/App.tsx:193,216`); header takes about 150-165 px at 768/360 | Every page, every role | Single row plus avatar menu (email, role, language, sign out); preview notice as one thin banner | `app/App.tsx:193-216`, `shared/styles/layout.css:31,50,124-142` |
| 7 | Page structure differs per page (title, tabs, actions) | P2 | `PageHeader`/`TabBar` exist but are used inconsistently; Customers and Transport place tabs above the title, Transport has no H1, "New request" is a 105 px tall slab | Customers, Bookings-Transport, Quotes, Warranties, Catalogue, Finance | One contract: title -> subtitle -> actions on the right -> tabs -> filter bar | `shared/components/PageHeader.tsx`, `TabBar.tsx`, per-feature pages |
| 8 | Filter bars and control sizes disagree | P2 | Inputs 42 px, selects 39-40 px, buttons 42-50 px (`base.css:22,41`, `components.css:23`); native selects; disabled "Find" always shown | Customers, Catalogue, Workshop, Warranties, Finance, Inbox | One `--control-h`; styled select; hide "Find" until text | `shared/components/FilterBar.tsx`, `shared/styles/base.css`, `components.css` |
| 9 | Low contrast and tiny captions | P2 | `--muted: #65777b`, table th `#5f7476` at 12 px, captions 11-12 px, amber on cream | About 70 pages fail axe contrast | Section 7 | `shared/styles/tokens.css`, `components.css:27,63-75` |
| 10 | Table and card cells wrap letter by letter / buttons wrap | P1 at 768, P2 at 1280 | Narrow columns with no `min-width`; Confirm column too narrow; workshop footer shrinks | Bookings "Confirm" -> "Con/firm" (EN and AR), Overview Type column at 768, Workshop footer "Unassig/ned", Catalogue "Edit price" | `white-space: nowrap`, min column widths, fixed action column | `features/bookings/BookingsPage.tsx`, `bookings.css`, `features/workshop/WorkshopPage.css:17`, `features/catalogue/catalogue.css` |
| 11 | Seed data unrealistic and mixed-language | P2 | Seeds mix Arabic and Latin names, "(example)", duplicates, DEMO plates, raw keys | Everywhere | Section 8 seed checklist | `apps/server/features/seed/*` |
| 12 | Unfinished surfaces | P1/P2 | Promotions tab is only a picker; customer/vehicle 360 returned HTTP 500 (fixed in 8b79b75, not re-run); `/api/promotions` 404; consents 404 shown as error | Quotes > Promotions, Customer 360, Drawer, WhatsApp consent badge | Section 8 | `features/promotions/*`, `features/quotes/QuoteWorkspace.tsx`, `features/customers/Record360View.tsx` |

### 2.1 Typography - findings and proposed scale

Observed (from the reviews and the CSS)
- Page H1: `clamp(25px,3vw,32px)` (about 32 px at 1280, 24 px at 768/360).
- KPI values: Overview `.ov-tile-value` 26 px (22 px mobile); Finance cards about 26-28 px bold; `.stat-value` 28 px weight 600; Workshop counts small; `data-card` values 13 px.
- Section titles: `.panel-title` 16 px bold; `.ov-section-head h2` 16 px; Finance "Money in and out" 13 px muted grey (same role, different look); `.form-section-title` 15 px.
- Body: `body` 16 px, tables 13 px (`td`), primary cell 14 px, captions 11-12 px. Table header 12 px (11 px in the AR/1280 captures).
- Topbar: email and "Role preview account" 11-12 px, but "Sign out" button about 16-17 px.
- WhatsApp bubbles about 16-17 px against list previews 13 px and meta 10 px.
- Arabic body text looks lighter and bigger than Latin at the same size (A, E).

Proposed type scale (tokens in `shared/styles/tokens.css`; every listed size is a minimum on touch widths)

| Token | Desktop (>=1024) | Tablet | Phone | Use |
|---|---|---|---|---|
| `--fs-display` | 28 / 1.15, 600 | 26 | 22 | Page title (H1) only |
| `--fs-kpi` | 24 / 1.1, 600, tabular | 22 | 20 | KPI numbers on every page (Overview, Finance, Workshop counts) |
| `--fs-h2` | 18 / 1.3, 600 | 18 | 17 | Section/panel titles, drawer titles |
| `--fs-h3` | 15 / 1.35, 600 | 15 | 15 | Card titles, form section titles, table primary cell |
| `--fs-body` | 14 / 1.5, 400 | 14 | 14 | Table cells, form controls, bubbles, buttons |
| `--fs-label` | 12 / 1.4, 600 | 12 | 12 | Table headers (uppercase optional), field labels, status badges, meta |
| `--fs-caption` | 12 / 1.4, 400, muted AA | 12 | 12 | Hints, timestamps (never below 12; nav labels 11 only if unavoidable) |

Rules
- No `font-size` in feature CSS except via these tokens (add a CI grep check).
- Arabic: `--lh-ar: 1.65` for body and `font-weight` one step lighter than Latin only if design confirms; use the same tokens, tune line-height only.
- Topbar buttons (Sign out, language) use `--fs-body` / `--fs-label`, never larger than neighbours.
- Customer/record names: same weight and colour in Latin and Arabic (`RecordRef`, `shared/components/RecordRef.tsx`).
- Files to touch: `shared/styles/tokens.css` (define), `base.css:14` (h1), `components.css:8-15,27-32,53-56,63-75,83-90` (apply), `features/overview/overview.css:5-6,20`, `features/workshop/WorkshopPage.css:4,16-17`, `features/whatsapp/WhatsAppSimulationPage.css` (bubbles).

### 2.2 Number and currency overflow - findings and numeric-formatting rule

Evidence
- Overview: "EGP 293,470.40" cut at the tile edge, "EGP 11,805,270.40" clipped to "EGP 11,805,27", "EGP 208,301.72" sticks out; the lone seventh tile sits under the fixed nav. `owner/en/1280/overview.png` y 240-510; `owner/ar/1280/overview.png` y 240-480 ("ج.م." drops outside the card); `owner/en/768/overview.png` y~540; `owner/ar/360/overview.png` y 540-600; `owner/en/360/flows/search-plate` y 570-590. (Screenshot in repo: `screenshots/owner_en_1280_overview.png`, `owner_en_360_overview.png`, `owner_ar_1280_overview.png`.)
- Finance fits only because its cards are wider; Finance and Overview use different size and weight for the same figure.
- Mixed decimals: "EGP 5,511,178" next to "EGP 186,971.40" (`formatMoney` drops decimals only for whole numbers, `shared/format.ts:31-41`).
- AR finance deltas show reversed sign/parentheses: "ج.م.-219,224.80 (-42.8%-)".
- Cause chain: fixed 26 px font, tile minimum 170 px, no `min-width: 0`, no wrapping, value and currency in one unbreakable `bdi`, full cents on KPI tiles.

Numeric-formatting rule (one `Money`/`Amount` component, used everywhere)
1. Always `font-variant-numeric: tabular-nums lining-nums`; money inside a `<bdi dir="ltr">` with `unicode-bidi: isolate` (Arabic currency suffix stays attached on the correct side; negative sign uses a real minus U+2212 placed before the number in both locales).
2. Latin digits in both locales (already the app convention; fix WhatsApp AR timestamps that use Arabic-Indic digits, C).
3. KPI tiles and cards: whole EGP only (no cents). If the value has more than 7 digits, or the tile is narrower than 220 px, use compact notation (`EGP 11.8M`, `EGP 293K`) and put the full value in `title` and `aria-label`.
4. Tables and detail views: full value, 2 decimals always (never mix 0 and 2 decimals in one column), right-aligned (start-aligned header must match the cell alignment), `white-space: nowrap`, column `min-width: 9ch`.
5. Currency symbol: smaller (0.6em) prefix/suffix on KPI tiles; on phone, value and currency may stack on two lines but never overflow.
6. Tile containers: `min-width: 0; overflow: hidden; text-overflow: clip`; value font `clamp(18px, 1.9vw, 24px)` (phone `clamp(16px, 5vw, 20px)`); money tiles span 2 columns on phone and tablet; the grid is 4+3 or 3+4 balanced (no orphan 7th tile), or use a "money row" and a "counts row".
7. Deltas: sign, number, percent in one `bdi dir="ltr"` string; colour logic is semantic (higher outstanding balance or cost is red, not green).
8. Add a visual test: for each KPI element assert `scrollWidth <= clientWidth` at 360/768/1280 in both locales.

Files: `shared/components/Money.tsx`, `shared/format.ts`, `features/overview/overview.css:1-8,20`, `features/overview/OverviewPage.tsx`, `shared/components/` new `Amount` helpers, `features/finance/finance.css`, `finance-ui.tsx`.

---

## 3. Component compatibility audit and recommended single standard

| Component | What is inconsistent today | Recommended single standard | Where |
|---|---|---|---|
| Buttons | Heights 36/42/50 px; Sign out about 16 px text; "New request" stretches to 105 px tall; primary full-width on phone for some pages and half-width for others; "Open claim" outlined while other primaries are filled; "Confirm" wraps | Three sizes: sm 32 (desktop only), md 40 (default, 44 on touch), lg 48 (technician). Primary filled teal, secondary outlined, ghost for text actions. `white-space: nowrap`; never stretch (`align-self: flex-start`). One primary per page header, right-aligned (left in AR). Full-width primary on phone only when it is the page's main action | `shared/styles/base.css:22-37`, `components.css`, `legacy.css` |
| Badges/status | Neutral (grey on grey) and amber on cream below 4.5:1; "Pending" "Expired" weakest; "Lifetime" plain text; chips glued to titles ("Accessories Service"); tab counts only on Warranties | One `StatusBadge` with tone tokens re-tuned to AA, 12 px, 600, icon + text; fixed 4 px gap when beside a title; counts badges (same style as `.tab-count`) on every tab that has a list | `shared/components/StatusBadge.tsx`, `tokens.css:41-50`, `components.css:63-75,135` |
| Tables vs cards | Tables at 768 (crushed) while 360 cards are good (D: "good pattern to reuse"); cards are heavy (about 185 px each, label/value per row) | Table at >=1000 px; below, compact cards (title line = main identity + status; 2 meta lines; no repeated labels). Always paged | `shared/components/DataTable.tsx`, `components.css:35-60` |
| Tabs | Tabs above title on Customers/Transport, below on Quotes; clipped tabs on phone with no affordance; active "Promotions" tab clipped | Always directly under the page header; on phone, scroll-snap with edge fade and auto-scroll to active tab (or a select under 400 px) | `shared/components/TabBar.tsx`, `components.css:130-135` |
| Drawers/dialogs | Print drawer: "Benefits" accordion cut by sticky Print footer with no scroll hint; Customer drawer flow failed to capture | Footer actions in a sticky bar with `padding-bottom` on the scroll area; scroll shadow; same drawer width (480 desktop, full-height sheet on phone) | `shared/components/DetailDrawer.tsx`, `components.css:151-159` |
| Filter bars | Different layouts; selects native; second search ("Plate or warranty QR") staggered; "Find" disabled-looking; "/" hint on touch | Single row grid: search (flex), up to 3 selects, result count at the right; secondary filters in "More" popover; scan field becomes a "Scan" icon button; hide "/" hint on touch | `shared/components/FilterBar.tsx`, `components.css:21-23,212-227` |
| Empty/loading/error | "Loading page..." text only; "No jobs assigned to you" without action; "0 jobs" at 11 px; Unavailable tiles unexplained | `EmptyState` with icon, one sentence reason, one action (Refresh / View unassigned); skeleton rows while loading; timeout error with Retry at 10 s | `shared/components/EmptyState.tsx`, `app/RouteChunk.tsx` |
| Page header | See problem 7 | `PageHeader` with fixed slots | `shared/components/PageHeader.tsx` |
| Record refs (names/plates) | Names teal bold with icon in some tables, plain bold black elsewhere; Arabic names regular weight | One `RecordRef` style; one `Plate` component (section 6) | `shared/components/RecordRef.tsx` |
| Selects | Native OS chrome; settings selects 530 px wide for "3 hours" | Styled select with one chevron; width by content (max 240 px) in settings | `shared/styles/base.css:41`, `features/settings/settings.css` |

---

## 4. Page-by-page findings

Roles: O owner, M branch manager, R receptionist, T technician. Widths: D = 1280, T = 768, P = 360. Locales: EN/AR. "All" = all roles/widths/locales captured.

| Page | Issue | Sev | Fix | Source file(s) | Affected |
|---|---|---|---|---|---|
| Overview | KPI money overflow (see 2.2); orphan 7th tile; same value styles differ from Finance | P1 | 2.2 rule; balance grid | `features/overview/overview.css:1-8,20`, `OverviewPage.tsx` | O,M all widths EN/AR; `owner/en/1280/overview.png` |
| Overview | "Needs attention" 157-191 rows, many identical; Record "—" for Pickup commitment / Quote follow-up / Unassigned job; duplicate rows ("8310 - حسام طارق فوزي" twice); Branches table at the bottom | P1 | Top 10 grouped by type with counts, inline action (Confirm, Assign), show customer/plate/date in Record; move branch summary up; server paging | `OverviewPage.tsx:170-180`, `overview-logic.ts` | O,M; `manager/en/1280/overview.png` y1900-2800 |
| Overview | At 768 Type column breaks "Boo/kin/g review", Status clipped; at 360 card values clipped ("Nasr City Service Cen") | P1 | Min column widths; `min-width:0; overflow-wrap:anywhere` on `.data-card-value`; padding for bottom nav | `components.css:35-60`, `overview.css` | O,M T,P |
| Overview | Duplicate branch select next to title (topbar already has one) | P2 | Remove page-level select or make it the only one | `OverviewPage.tsx`, `layout.css` | O all |
| Overview | Dashboard lacks period/trend/delta on money tiles; no today agenda (owner/manager) | P2 | Add period label, delta, mini trend; Today panel (drop-offs/pickups exist at `OverviewPage.tsx:138-139`, surface them first) | `OverviewPage.tsx` | O,M |
| Inbox (WhatsApp) | Composer crushed (select about 100 px, textarea about 60 px, placeholder wraps "Write / a reply"); composer shown though replies need Claim | P1 | Stack select above textarea; textarea `flex:1`, auto-grow; if not claimed show banner + Claim button instead | `features/whatsapp/WhatsAppSimulationPage.css:49-53,63,73`, `MessagingWorkspacePage.tsx` | O,M,R D; P shows list only |
| Inbox | Bubble text 16-17 px vs list 13 px; bubble times 10 px; action buttons (Claim, Hand off, Mark read, Pending, Resolve) different widths and wrap in 2 ragged rows; "Consent unavailable" unexplained (API 404 `CONSENT_NOT_FOUND`); "Delivery off" shown twice | P2 | 14 px bubbles, 12 px meta; equal-width button group; show "No consent on file"; single delivery notice | `WhatsAppSimulationPage.css`, `WhatsAppSimulationPage.tsx`, server consents route | O,M,R |
| Inbox | AR timestamps use Arabic-Indic digits while amounts use Latin; bubble date garbled ("-11-2026 28"); list previews truncate mid-sentence; 768 page 776-780 px wide, panes squeezed (name wraps one word per line) | P2 | `dateLabel`/`timeLabel` everywhere with LTR isolate; master-detail at <=1024 | `shared/ui.tsx:90-103`, `WhatsAppSimulationPage.css` | O,R T/D; AR |
| Bookings (EN D, O) | Capture shows only "Loading page..." | P1 | Skeleton and timeout state; wait for ready marker in capture | `app/RouteChunk.tsx:37`, `scripts` of visual run | O EN D; O AR P |
| Bookings | Confirm button wraps "Con/firm" / "تأك/يد"; actions column unlabeled; only pending rows have actions; no call/WhatsApp/reschedule/check-in | P1 | `nowrap`, fixed column, row kebab on all rows, add Call/WhatsApp/Check-in | `features/bookings/BookingsPage.tsx`, `bookings.css` | M,R,O D; AR `receptionist/ar/1280/bookings.png` |
| Bookings | 415 rows, 35k px (77k at 360), history not queue; Branch column repeats the same name on every row for single-branch users; services concatenated across languages with misplaced commas | P1/P2 | Default view "Today and upcoming", paging; hide Branch for single-branch; service chips (2 + "+N") in active locale | `BookingsPage.tsx`, `booking-logic.ts` | M,R |
| Bookings | At 768 Branch/Service columns crushed to one word per line (rows about 120 px) | P1 | Cards below about 1000 px | `DataTable.tsx`, `components.css` | M,R,O T |
| Transport | "New request" is a 134x105 px slab; no H1; tabs first; Booking column composite string bidi-scrambled ("Nov 2026 28 - 5678 ..."), duplicates customer; duplicate rows ("Omar Khaled Fawzy" 1357 twice); page 1009 px at 768; 103 rows | P1 | Separate cells: date/time, service, driver, pickup window, address; `align-self:flex-start` button; PageHeader | `features/transport/TransportPage.tsx`, `TransportPanel.tsx`, `transport-logic.ts` | All; `owner/en/1280/bookings-transport.png` y395-900 |
| Quotes | 661 rows (35k px; AR at 360 is 144k px); Follow-up column "—" on every row; Draft rows have three "—"; "Create quote" detached from title; date format "Mon Dec 21" without year; Total header left but cells right; 768 page 965-1019 px wide with Valid until/Status clipped | P1/P2 | Paging; drop empty Follow-up or show only when set; one placeholder "No total yet"; PageHeader with action; `dateLabel`; right-align header | `features/quotes/QuoteWorkspace.tsx`, `quote-logic.ts`, `commercial.css` | O,M,R |
| Quotes | Customer name weight differs Latin vs Arabic; mixed-language names alternate | P3 | `RecordRef` standard; seed per locale | `RecordRef.tsx` | All |
| Quotes > Reservations | Default "Valid until" ascending puts expired items first; "Reserve an offer" button above the search; "21 Sept 2026" non-standard month; 925 px at 768 | P2 | Default sort upcoming first; action in header; `Intl` month | `features/reservations/ReservationsPage.tsx`, `reservation-logic.ts` | O,M,R |
| Quotes > Benefits | Raw keys ("Vip transport", "Fourth car", "Cairo tow") and English in AR; same customer repeated 4-5 times; "1 use in total" unclear; word-break "Handove/r inspectio/n"; 870 px at 768 | P2 | Humanise labels per locale ("VIP transport"); group by customer; show used/remaining (1 of 2) | `features/benefits/BenefitsPage.tsx`, `benefit-logic.ts`, seed | All |
| Quotes > Promotions | Only "Accepted quote *" picker and a list clipped at 6 rows; no title, explanation, promotions list or action; `GET /api/promotions` 404 | P1 | Build real screen (heading, selected quote summary, eligible promotions table, primary action) or hide until ready | `features/promotions/QualificationForm.tsx`, `QualificationPanel.tsx`, `QuoteWorkspace.tsx:145-155`, server route | All; `owner/en/1280/quotes-promotions.png` y300-625 |
| Warranties | 415/237 rows, 27k-91k px; literal "(example)" in coverage names; duplicate rows ("عمر مصطفى الجندي 2816" twice, "Rana Mohamed El-Fakhrany 3001" twice); status almost all "Active"; Invoices tab duplicates Bookings > Invoices; "Open claim" outlined vs filled primaries; AR 14k px longer; 768 first slice shows sidebar overlapping columns (B, capture after horizontal scroll) | P1/P2 | Paging; remove "(example)"; dedupe seed; one tab-count convention; "Lifetime" badge | `features/warranty/WarrantiesPage.tsx`, `CoverageTab.tsx`, `warranty.css`, seed `seed-aftersales.ts` | All |
| Customers | Filter row misaligned (search 42, select 40, QR input floating, disabled "Find" wrapped); tabs above title; AR phone "1046 000 122 20+" and placeholder garbled; phone wraps at 768; no last visit/balance/open jobs; no tel:/WhatsApp links; "59 customers"/"59 results" repeated; owner sees 67 vs receptionist 59 (scope unclear); Vehicles column plates only | P1 (AR phone) / P2 | `Phone` component (`dir=ltr`, nowrap, `tel:`+`wa.me` links); toolbar single row; add columns | `features/customers/CustomersPage.tsx`, `customers.css` | O,M,R; `owner/ar/1280/customers.png` y420-860 |
| Customer/Vehicle 360 | Flow fails: API 500 (fixed `8b79b75`, unverified); title just "Vehicle", duplicate "Customers" back link and tiny Retry | P1 (until rerun) | Rerun; show plate in title; dedupe back link | `features/customers/Record360View.tsx`, `use-record360.ts` | flows customer-360, drawer, pdf-customer-360 |
| Workshop | Board cards cramped: footer wraps mid-word ("Unassig/ned", "Interior nano ceramic", Arabic letters stacked); equal-width columns regardless of count; header "757 jobs / 757 results" under a hidden default filter "Unassigned" (manager: "408 jobs" vs board total 22); mixed AR/EN inside a card; "(Mahmoud Adel)" bilingual naming; no age/priority/due; Board/List tabs below filters | P1 | Footer stacked (service line, assignee line), `overflow-wrap: normal`; Unassigned as a pill with assign action; default filter "All", count follows filter; column scroll with "+N more" | `features/workshop/WorkshopPage.css:9-17`, `WorkshopPage.tsx:123,150,215` | O,M all widths |
| Workshop (technician) | Empty "No jobs assigned to you"; desktop shell on phone (search, role chip); no big touch actions; "0 jobs" 11 px | P1 | Dedicated technician layout (section 8); seed jobs for the technician | `WorkshopPage.tsx`, `WorkshopPage.css:8` (`ws-big-action` exists), `app/App.tsx`, `navigation.ts` | T all; `technician/en/360/workshop.png` |
| Finance | AR sign/percent order reversed; colour semantics wrong for liabilities; "Net profit" row misaligned footer and "No comparison"; "Draft quote value" Unavailable tile unexplained and no sources link; mixed decimals; collections 293k vs revenue 394k with no reconciliation note; "Add money event" button wraps to two lines at 768; trend accordion without preview | P1 (AR sign) / P2 | `Delta` component with LTR isolate; inverse colour for costs/receivables; same slots for every card; tooltip explaining Unavailable | `features/finance/FinancePage.tsx`, `finance-ui.tsx`, `finance.css` | O,M; `owner/ar/1280/finance.png` y560-800 |
| Catalogue | "Edit price" wraps to 2 lines, rows 76 px (210 px at 768); package names wrap per letter; "Price pending" wraps; inline chip glued to name; marketing item "5 November announcement" in package list; List/Price matrix toggle two different button styles | P2 | `nowrap` action column; segmented control; separate promotions from packages | `features/catalogue/CataloguePage.tsx`, `catalogue.css` | O all |
| Settings | Control width 530 px for "3 hours"; "Not available yet 8" and "Change history 0" visible placeholders; tab strip cut at "W..." on phone; page mostly empty | P2 | Fixed 240 px controls; hide roadmap behind a "Coming soon" link or remove; save feedback | `features/settings/SettingsPage.tsx:163`, `settings.css` | O |
| Settings > Access (staff) | Card in card double border; email bold same weight as name; "Role default" meaningless; read-only banner and only a Refresh; mixed-script names "(Islam Fathy)"; no invite/disable actions | P2 | Flatten card; role matrix link; clear "read-only in preview" label | `features/staff/StaffPage.tsx` | O |
| Shell (all) | Topbar duplicates; "Role preview account" and "Owner@noemail.com" (capitalised fake) visible; Sign out twice; search placeholder truncated | P2 | Section 2 problem 6; lowercase emails; hide preview flag outside demo | `app/App.tsx`, `layout.css` | All |
| Shell (phone) | Bottom nav label "Quotes & ..." truncated (EN) and "صندوق الر..." (AR); 10 px labels; More sheet never captured | P2 | Short labels ("Quotes", "الوارد"); labels 11-12 px | `app/navigation.ts:56`, `layout.css:71-77` | R,O P |
| Print quote (drawer) | Benefits accordion cut by sticky Print footer; Catalogue price/Answered labels lack context; Finance and Warranties print controls not found by the flow | P2 | Footer padding; add print controls or remove from the flow | `features/quotes/QuotePrint.tsx`, `shared/print/*`, `DetailDrawer.tsx` | R,O D flows |

---

## 5. Mobile and tablet problems

Tablet (768 px) - not usable as-is (B, D)
1. Breakpoint gap: sidebar 220 px stays until 760; content about 548 px; tables `min-width: 650px` (`layout.css:118-124`, `components.css:26`). Fix: icon rail or off-canvas drawer at <=1024; bottom nav at <=760; cards below about 1000.
2. Page wider than viewport: Quotes 1019/965, Transport 1009/996, Reservations 925/911, Benefits 870/838, WhatsApp 780/776 (EN/AR). `owner/en/768/quotes.png` (in repo as `owner_en_768_quotes.png`). Probably fixed in `8b79b75`; verify (section 10).
3. One-letter wrapping in cells (Type, Branch, Benefit, Package, "مراج/عة").
4. Topbar three stacked rows (about 165 px, 16 % of the first viewport).
5. WhatsApp: three panes squeezed; use list-then-detail.
6. Tap targets under 40 px: language switch about 30, tab links about 34, WhatsApp action buttons about 34, "Find".

Phone (360 px) - not ready (C)
1. Money KPI overflow (2.2).
2. Page heights up to 144k px; 191 near-identical Overview cards at about 185 px each.
3. Chrome about 150-155 px (branch, role, language, Sign out, search over 3 rows); placeholder truncated; `/` keyboard hint on touch.
4. Cards clipped at the right edge (overview, transport); likely `white-space: nowrap` on record chip (`components.css:179`, `.record-ref-label`).
5. Tab bars clip with no cue ("Source r...", "Invoices 4...", "Promo...", "W...").
6. Bottom nav labels truncated; More sheet, forms, dialogs and error states were not captured at all.
7. Technician has the desktop shell.
8. Cards: label/value pairs per row; make compact (E-08, C-13).
9. Control sizes mixed (38/40 px selects, half and full width buttons). Standard: 44 px min height, full-width primary.

Capture limits: the bottom nav "overlapping content" is a full-page-capture artefact (see section 1); capture viewport shots with the nav visible in addition.

---

## 6. Arabic / RTL problems

Layout mirroring is correct. Problems are in text direction:
1. Phones: "+20 122 000 1046" is rendered `1046 000 122 20+` (`owner/ar/1280/customers.png` y420-860); at 360 it is left-aligned against right-aligned labels; at 768 it wraps. Fix: `<bdi dir="ltr" style="white-space:nowrap">` inside a `Phone` component with `tel:` link.
2. Finance negative amounts and percentages: "ج.م.-219,224.80 (-42.8%-)". Fix with a single LTR-isolated delta string and a real minus sign before the number.
3. Overview AR tiles: "11,805,270.40 ج.م." leaks out left; "ج.م." drops to a second line outside the card (2.2).
4. Plates: three different renderings (bold teal link, plain text, small grey); digits-then-letters order differs between cells ("ط ص ق 8310" vs "8310 ق ص ط"). Decide one convention (recommend: Egyptian plate order digits first on the right in RTL, letters spaced, rendered in a bordered `Plate` chip with `dir="rtl"`, `unicode-bidi: isolate`, fixed width). `features/workshop/WorkshopPage.css:4` uses `direction: ltr` for plates, which contradicts the others - align.
5. Composite strings: Transport "Booking" column and Overview "Record" (`9703 - ع س د - طارق...`) build one string. Use separate spans/cells.
6. Dates: Latin month words in AR rows ("Fri Dec 18"); `dateLabel` uses `ar-EG-u-nu-latn`, but quotes use another formatter. All dates through `dateLabel` (shared/ui.tsx:90) with year. Normalise "Sept".
7. Digits: WhatsApp AR timestamps in Arabic-Indic digits ("ص/م" after time); everywhere else Latin. Pick Latin.
8. Content not localised in AR: benefits ("Fourth car", "Handover inspection"), services ("Full PPF" Latin in an AR row, `receptionist/ar/1280/bookings.png` y520), names alternating AR/EN, staff "(Islam Fathy)". Either render the locale's name with a fallback or add a visible language chip.
9. Bottom nav label "صندوق الوارد" truncated; Arabic line-height in table cells inflates rows; AR text looks lighter and larger than Latin (tune `--lh-ar`).
10. AR confirm button "تأك/يد" wraps; AR search placeholder only just fits; table headers 11-12 px.
11. Placeholder "اللوحة أو ضمان QR" is garbled (mixed script): put "QR" in an isolate.
12. AR pages are generally longer than EN (Warranties +14k px at 768): paging solves it.

Not verified (only EN twins opened): AR at 768/360 for most pages, AR flows, AR technician.

---

## 7. Accessibility and contrast - concrete fixes

Evidence: axe colour-contrast on about 70 pages (README); `nested-interactive` fixed in `8b79b75`.

Concrete values (verify with a contrast checker before merge)
1. `--muted: #65777b` on `#eef2f1` is below 4.5:1 for 12 px text. Change to about `#52646a` (target >= 4.8:1 on `--canvas` and `--paper`). `shared/styles/tokens.css:11`.
2. Table headers `th { color: #5f7476; background: #f2f6f4 }` (`components.css:27`): use `var(--muted)` new value on `#eef3f1`, weight 600, 12 px minimum (D saw 11 px).
3. `.field-label` `#566b6d` and `.tab` `#5c6e71` (`base.css:44`, `components.css:131`): use `--muted`.
4. Status tones: `--tone-warning-fg #8c5d13` on `#f8efd9` is about 4.6:1 (borderline); `--tone-neutral-fg #526467` on `#edf1f0` about 5:1 (OK) but "Pending/Draft/Expired" render weaker in captures - bump warning fg to `#7a4f0e`, neutral fg to `#44575a`; add a leading icon so colour is not the only cue.
5. Amber "Role preview account" on cream, `.warning-banner #74541e` on `#f8f0df` (`components.css:78`): darken to `#5f4310`.
6. Sidebar footer "Sign out" `#bfd0cc` 12 px on `#173b40` (`layout.css:31`): lighten to `#e6efed` and 13 px; inactive nav text likewise.
7. Minimum sizes: nothing under 12 px except icons; mobile nav labels 11 px minimum (now 10 px); "0 jobs" caption and kbd hint 12 px.
8. Placeholder text in inputs: use `#6a7a7e` minimum (A: "very light").
9. Links teal bold without underline (colour only cue): add underline on hover and for in-text links, keep icon in tables.
10. Focus: search shows a teal ring; row links and selects not visible in captures. Add `:focus-visible { outline: 3px solid ... }` to `.btn`, `.tab`, `.data-card`, selects (`tokens.css:--focus-ring` exists, apply universally); capture a focus-state screenshot.
11. Accessible names: icon-only Refresh (Inbox), KPI arrow icons (`.ov-tile` arrows), QR/scan button.
12. Sortable headers need `aria-sort`; data cards are `role="list"` - verify `listitem`.
13. Touch targets: 44 px on tabs (OK), raise selects, language switch, WhatsApp actions, mobile nav items from about 40 to 44.
14. Tooltips for compact numbers (2.2) must also be in `aria-label`.
15. Do not rely on colour for deltas: add up/down arrows and text.

---

## 8. Missing features and UX recommendations

### Receptionist (front desk)
- "Today" home instead of a history table: arrivals due, bookings to confirm, unanswered WhatsApp, quotes to follow up, cars ready for pickup. The data exists (`OverviewPage.tsx:138-139` already builds drop-offs/pickups); make it the receptionist's landing page.
- One-tap Call, WhatsApp and Copy plate on every customer, booking and quote row (phones are plain text today, E-19).
- Walk-in flow: plate lookup -> customer -> service -> create and check in in one dialog.
- Check-in/arrived, reschedule and no-show actions on bookings (only Confirm exists).
- Bookings default to "today and upcoming, ascending"; saved filters ("Pending", "Tomorrow"); date-grouped sections.
- Inline confirm with a bulk "Confirm selected".

### Owner
- Dashboard answering "how are we doing today": money KPIs with period and delta, today's drop-offs, ready for pickup, aged jobs, overdue quote follow-ups, branch comparison, then a short attention list (A, D).
- Branch comparison near the top; trend sparkline previews; reconciliation note between collections and recognised revenue.
- Quote follow-up reminders with relative expiry badges ("expires in 3 days"), default sort expiring first.
- Staff: invite/disable actions and a permissions matrix (today read-only with a Refresh only).
- Settings: hide "Not available yet 8" or turn it into a roadmap link.

### Branch manager
- A real manager home: technician load (idle vs overloaded), unassigned jobs with one-click assign, SLA risk, pending confirmations with inline Confirm.
- Branch scope shown as a locked chip "Your branch" instead of a one-option dropdown; Team page; branch performance.
- Resolve the capability mismatch (D-21).

### Technician
- Separate lightweight mobile shell: big job cards (plate, service, stage, timer), 48-56 px Start/Done/Photo/Note buttons fixed at the bottom, no global search or role chip. `.ws-big-action` (56 px) already exists in `WorkshopPage.css:8`; use it.
- Seed jobs for the technician so the next run can verify the layout; empty state with Refresh and "view unassigned".

### Workshop and operations
- Card: due time, age, priority, assignee avatar; column WIP counts; overdue highlighting; "Assign" action on the Unassigned pill.
- Transport: pickup window, driver, address, status timeline instead of repeated booking text.

### Inbox
- Unread indicator and day grouping; hide composer until claimed; quick replies; consent state explained ("No consent on file").

### Data/seed realism checklist (server `apps/server/features/seed/*`)
- Remove "(example)" suffixes (found in `seed-aftersales.ts`, `seed-extras.ts`, `seed-messaging.ts`, `seed-orders.ts`, `seed-promos.ts`) and marketing copy ("5 November announcement") from package lists.
- One display name per customer per locale (`name_ar` in AR, `name_en` in EN) with fallback; no mixed-script rows.
- Remove duplicates: warranties "عمر مصطفى الجندي 2816" x2, "Rana Mohamed El-Fakhrany 3001" x2; transport "Omar Khaled Fawzy 1357" x2; overview "8310 - حسام طارق فوزي" x2, "7930 - هدى تامر لطفي" x2; same customers on consecutive days.
- Remove "DEMO A17/A39" plates; phones not ending in "000"; emails lowercase (`Owner@noemail.com`, `Reception@noemail.com`, `seed.tech.a3@example.test`).
- Realistic status spread: not "all Accepted/Active/Unassigned"; include Expired, Cancelled, In progress, Overdue; varied dates including past and near-term; dates with year.
- Humanise benefit names ("VIP transport"), localise seeded service and benefit names.
- Technician jobs and a believable number of rows per page (about 40-80) so screenshots represent the product; keep a separate "load test" dataset for the 400-757 row cases.
- Workshop: counts consistent (757/408 jobs filter count vs board total 22).

---

## 9. Prioritised implementation plan

Rules
- WP0 is serial and must merge first (shared tokens, components, shared styles). Packages WP1-WP9 own disjoint feature folders and may run in parallel after WP0, importing only the new shared APIs. Anyone who needs a shared change asks WP0's owner; no other package edits `shared/`.
- Sizes: S under a day, M 1-3 days, L more than 3 days.

### WP0 (serial, first) - Shared design system and primitives. Size L
Owns: `apps/web/src/shared/styles/*` (tokens.css, base.css, components.css, layout.css, legacy.css, styles.css), `shared/components/*` (DataTable, FilterBar, PageHeader, TabBar, StatusBadge, RecordRef, Money, EmptyState, DetailDrawer, Collapsible, index.ts), `shared/format.ts`, `shared/ui.tsx` (dateLabel/timeLabel), `shared/labels.ts`, `app/App.tsx` + `app/navigation.ts` + `app/RouteChunk.tsx` (topbar, user menu, breakpoints, nav labels, loading skeleton), new `shared/components/Plate.tsx`, `Phone.tsx`, `Amount.tsx`/`Delta`, `Select`.
Deliver: type scale and `--control-h` tokens (2.1), AA colour tokens (7), numeric rule (2.2), table-to-cards at about 1000 px with `min-width:0` wrappers, paged `DataTable` (25/50/100, sticky header, "Showing x-y of n"), single-row topbar plus avatar menu (one Sign out), icon rail at <=1024, compact data-card, styled `Select`, `PageHeader` slot contract, short nav labels, skeleton/timeout in `RouteChunk`.
Acceptance: no horizontal scroll at 360/768/1280 on any page (`scrollWidth <= innerWidth`); all font sizes via tokens (grep check); contrast tokens pass axe on 3 sample pages; unit tests for `Amount`, `Phone`, `Plate`, `dateLabel`; existing tests pass.

### WP1 - Overview (owner and manager home). Size M
Owns: `features/overview/*`.
Acceptance: money tiles never overflow at 360/768/1280 EN/AR; compact notation with tooltip; balanced tile grid; Needs attention shows top 10 grouped by type with counts and "View all"; Record never "—" (customer/plate/date shown); duplicate branch select removed; Today panel first.

### WP2 - Bookings, Transport, receptionist queue. Size M
Owns: `features/bookings/*`, `features/transport/*`.
Acceptance: Confirm never wraps; actions column labeled with kebab on all rows; default "today and upcoming"; Branch column hidden for single-branch users; Booking column split into separate cells; call/WhatsApp quick actions; New request button normal height; PageHeader contract.

### WP3 - Quotes and offers (Quotes, Reservations, Benefits, Promotions). Size L
Owns: `features/quotes/*`, `features/reservations/*`, `features/benefits/*`, `features/promotions/*`.
Acceptance: Promotions screen complete or hidden; empty Follow-up column removed/conditional; dates with year; reservations default sort upcoming first; benefits show used/remaining and humanised localised names; no page wider than viewport at 768; print drawer footer does not hide content.

### WP4 - Workshop board and technician mode. Size M-L
Owns: `features/workshop/*` (+ technician route layout in `app/navigation.ts` only via WP0 handoff).
Acceptance: no mid-word wrapping on cards at 1280/768/360 in EN/AR; filter default "All" and count matches; Unassigned pill with assign action; technician view shows large job cards and 48-56 px actions at 360; board columns capped with scroll and "+N more".

### WP5 - Customers and Customer/Vehicle 360. Size M
Owns: `features/customers/*`.
Acceptance: single-row toolbar; `Phone` display with tel/wa links, correct in AR; added columns (last visit, open jobs, balance); 360 page loads without 500 and shows plate in title; scope counts explained (59 vs 67).

### WP6 - Finance. Size M
Owns: `features/finance/*`.
Acceptance: `Delta` component renders correctly in AR; inverse colour for liabilities; all cards have the same slots; consistent decimals; "Unavailable" explained; header button does not wrap at 768; reconciliation note between collections and revenue.

### WP7 - Inbox (WhatsApp). Size M
Owns: `features/whatsapp/*`.
Acceptance: composer width and stacked layout correct at 1280/768/360; composer hidden/replaced by a Claim banner until claimed; bubble 14 px, meta 12 px; master-detail at <=1024; timestamps Latin digits and bidi-safe; "No consent on file" instead of an error (coordinate with server consents route).

### WP8 - Warranties, Catalogue, Settings, Staff. Size M
Owns: `features/warranty/*`, `features/catalogue/*`, `features/settings/*`, `features/staff/*`, `features/invoices/*`.
Acceptance: "Edit price" never wraps; segmented List/Matrix control; packages separated from marketing items; settings controls 240 px and roadmap items hidden or labelled; warranties paged with consistent tab counts, no "(example)" text; staff page flattened card, read-only label, role matrix link.

### WP9 - Seed data and server fixes. Size M
Owns: `apps/server/features/seed/*`, plus consents/promotions API routes under `apps/server/**` (server only).
Acceptance: seed checklist in section 8 done (no "(example)", no duplicates, single language per locale, DEMO plates removed, status spread, technician jobs, lowercase emails); `GET /api/promotions` exists or UI no longer calls it; consents return "missing", not 404 error.

### WP10 - Visual test harness. Size S-M
Owns: the visual workflow/scripts (`.github/workflows/*visual*`, the visual runner scripts) and `docs/testing/visual/**`.
Acceptance: section 10 checks implemented (overflow at all widths, ready marker, viewport shots with nav, More sheet, drawer, focus state, technician with jobs, print flows).

Order: WP0, then WP1-WP9 in parallel (WP1, WP2, WP4, WP6 first for visible value), then WP10 and a full Visual checks rerun. Conflicts: `app/navigation.ts` is WP0-only; `features/customers/CustomerVehiclePicker.tsx` and `features/bookings/CustomerVehiclePicker.tsx` are two copies; WP5 and WP2 own their own copies, a shared extraction is a WP0 follow-up.

### Decisions the product owner must make
1. Should branch managers have Quotes/Promotions/Benefits? (`shared/capabilities.ts:12` says no, the UI shows them.)
2. Arabic plate display convention (digits first or letters first), and Latin vs Arabic-Indic digits everywhere (recommendation: Latin digits, one plate chip).
3. Money display: whole EGP and compact (M/K) on dashboards? (recommendation yes); two decimals in tables?
4. Paging approach: classic pages (recommended) or "load more"; default page size 25 or 50.
5. Tablet strategy: icon rail at <=1024 (recommended) vs keep sidebar and switch to cards.
6. Keep or remove the "Role preview account" banner and visible roadmap ("Not available yet").
7. Should names be shown in the UI locale only (recommended), or bilingual?
8. Receptionist landing page: Today board instead of Bookings list? Technician dedicated mobile shell?
9. Is Promotions in scope for the first release (finish it or hide the tab)?
10. Warranty "Invoices" tab duplicates Bookings > Invoices: keep both or cross-link only?
11. Should the workshop "Unassigned" default filter stay for managers (queue-first) or default to All?
12. Seed data policy: replace shipped demo data with a realistic bilingual demo dataset (about 60 rows per list) plus a separate load-test set?

---

## 10. How to re-verify (next Visual checks run)

Run "Visual checks" manually (it is manual-only since `1cd09d0`).

Pages and widths to include
- Owner EN and AR at 360, 768, 1280: Overview, Bookings, Bookings > Transport, Quotes (and Reservations, Benefits, Promotions), Warranties, Finance, Catalogue, Customers, Workshop, Inbox, Settings, Settings > Access.
- Branch manager EN 768 and 360: Overview, Bookings, Workshop, Finance.
- Receptionist EN and AR 1280/360: Bookings, Customers, Inbox, Quotes.
- Technician EN and AR 360 with seeded jobs (job list, job detail, start/done).
- Flows: customer-360 (vehicle and customer), drawer (EN/AR, 360/1280), print quote, print invoice, print warranty (add the missing controls), search-plate, mobile More sheet, create-quote form, add-customer form, error state, empty state, focus state of nav/tab/button.

Automated assertions to add (fail on regression)
1. `document.documentElement.scrollWidth <= innerWidth` at 360, 768, 1280 for every page (the run currently only fails at 360).
2. KPI overflow: for `.ov-tile-value`, `.stat-value`, Finance values, `el.scrollWidth <= el.clientWidth` in EN and AR.
3. No word-level breaks in `.status`, buttons and nav labels (`text-overflow` or height > 1 line for `nowrap` elements).
4. Page height budget per page (for example <= 6,000 px at 1280 with paging).
5. axe: colour-contrast count must trend to 0; keep `nested-interactive` at 0.
6. API 4xx/5xx budget: `vehicles/:id/360` and `customers/:id/360` must be 200; `/api/promotions` and consents must not 404 in normal paths.
7. Wait for a "page ready" marker and fail on text "Loading page..." in a screenshot (`owner/en/1280/bookings.png`, `owner/ar/360/bookings.png` must show data).
8. Capture viewport shots (nav visible) at the end of each page, plus the full page.

Manual checks after fixes
- Compare against this report's evidence: `owner/en/1280/overview.png` y 240-510, `owner/ar/360/overview.png` y 540-600, `receptionist/en/1280/bookings.png` y 335-385 (Confirm), `owner/ar/1280/customers.png` y 420-860 (phone), `owner/ar/1280/finance.png` y 560-800 (deltas), `owner/en/1280/bookings-transport.png` y 395-900, `owner/en/1280/workshop.png` y 770-1000, `owner/en/1280/whatsapp.png` y 895-1000, `owner/en/1280/quotes-promotions.png`.
- Ensure the committed `screenshots/` reference folder is refreshed with the same 16 key pages (plus the new technician-with-jobs and More sheet).
