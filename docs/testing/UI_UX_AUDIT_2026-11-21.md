# UI/UX Audit - 21 November 2026

Read-only audit of `apps/web/src`. Paths are relative to `apps/web/src`. Line numbers are from commit 802a8dc. Priority: P0 = blocks usability or violates a stated rule; P1 = clear friction; P2 = polish.

## 0. Headline findings

1. **Three UI generations coexist.** (a) Carbon-like pages using `PageHeading`, `.toolbar`, `.table-wrap`, `.form-panel` (Bookings, Customers, Workshop, Staff, Settings, Overview). (b) Phase-1 "compliance" pages written as minified one-line JSX with raw `<h1>/<h2>/<p>/<label>` stacks and `<button>` lists instead of tables (Reservations, Benefits, Finance, Promotions, Quotes, most `*Detail.tsx`, Catalogue). (c) Warranty and WhatsApp, each with their own CSS vocabulary (`w-*` in `WarrantiesPage.css`, `wa-*`).
2. **Bloat is structural.** Pages open with eyebrow + title + 1-2 line subtitle + an explanatory banner, then a panel with its own title + description, then fields each with a hint. The same fact is stated 3 times on one screen (e.g. Warranties 811, 822, 836, 929).
3. **Records render as buttons or `<p>` lines, not tables** (Reservations:29, Benefits:19, Transport:30, Finance list, Catalogue:202-214, Quotes:26-31), with raw ids (`item.id · customerId · vehicleId · status`).
4. **Internal ids and engineering vocabulary leak into the UI**: "minor units", `private:...`, policy id + version free-text pairs, `quoteId:revision` comma lists, `JSON.stringify(expiryRule)` (BenefitDetail:52,54). This violates DESIGN_SYSTEM.md section 6 ("Do not ask staff to type internal row IDs").
5. **Navigation is triplicated**: sidebar groups (`app/App.tsx:~190`), `workspace-tabs` strip (`App.tsx:234`), mobile "More" menu with group descriptions (`styles.css:623-657`). Group descriptions (`navigation.ts:42,49,56`) render in the tab strip and mobile menu.
6. **Owner-only configuration is scattered**: Settings (8 operating rules + 11 policy editors + availability + hold list + history), Catalogue, Finance attestation, Warranty policies, Warranty QR verification settings.

## 1. Per-page problems

### 1.0 Shared shell (`shared/styles.css`, `shared/ui.tsx`, `app/navigation.ts`)

- P0 No shared sortable table, drawer, skeleton, or badge registry. `.status.*` (`styles.css:138-144`) covers only booking/job stages; `proposed`, `active`, `on-hold` set in `ui.tsx:161-163` have no CSS and render grey. Features invented their own badges: `.member-status` (405-407), `.w-badge`, `.hold-badge` (387), `.tag` (151), `.setting-version` (373).
- P0 `styles.css` is an append-only override stack. Sizes are declared small then re-declared larger at 476-515 and 556-565 (td 12px -> 13px, `.status` 11px -> 12px, `.btn`); `.mobile-nav` is defined at 216, 256, 525, 664. Any size change must touch 2-3 copies.
- P1 `ui.tsx:143` `PageHeading` makes `eyebrow` and `subtitle` required, pushing every page to add two lines of copy. `SectionTitle` (147) description is optional but used almost everywhere.
- P1 Pages bypass `PageHeading`: Reservations:18, Benefits:14, Catalogue:193, Promotions (QualificationForm:19), WhatsApp:301-314. They are styled only by the hack at `styles.css:607-613` (`.page-wrap > div[dir] > h1:first-child`), which needs each page to wrap itself in `<div dir>`.
- P1 `ui.tsx:54-102` holds 13 decision records; 5 (branch-model, intake-photos, technician-assignment, job-lifecycle, customer-updates) are on hold and never rendered (`SettingsPage.tsx:44-53`): dead copy. `Status` (155-169) cannot render quote, warranty, reservation, transport, or benefit states.
- P1 Arabic mixes Egyptian colloquial (`ui.tsx:34-41` "اتحجزت", "ماجاش") with MSA (`navigation.ts:43`, Quotes/Reservations/Benefits). DESIGN_SYSTEM section 7 labels differ ("محجوزة", "لم يحضر") and say "Do not translate differently in separate screens."
- P1 Many pages use bare `<label><input>` (Reservations:20-25, Benefits:56-65, Transport detail:17, Promotions:22-27, Finance, ReservationDetail), which get only the `.page-wrap :where(input...)` fallback (614-619): no min-height, no width:100%, no grid alignment.
- P2 Nav hover `translateX` (58), page entrance animation on every route (76-77, no reduced-motion guard for it; only 675-677 covers nav). Hard-coded colours instead of tokens; no dark mode.
- P2 a11y: focus styles are good (34-37, 617-619) and `Status` pairs colour with text. Gaps: `.btn:disabled` (91) with no reason on most buttons (exceptions: Workshop assignment 143, Warranty issue 944); modals have no focus trap; `<details>` summaries unstyled outside `.panel`.
- `navigation.ts`: `CalendarDays` used for both Bookings (64) and Reservations (71); `CircleDollarSign` for both Promotions (70) and Finance (74). **Bug**: `primaryNavigationByRole.receptionist` includes `workshop` (81) but Workshop's `roles` (65) excludes receptionist, so it is silently dropped.

### 1.1 Overview (`features/overview/OverviewPage.tsx`, 154 lines)

- P0 Mixes four jobs: action queue (110-121), owner financial report (123-145), branch capacity (147-150), workshop vehicle list (152); the last three are collapsed `<details>` (123, 147, 152) with unstyled `<summary>`. The landing page shows only one table.
- P0 Duplicates Finance: report filters/metrics/trend/drilldown (123-145) vs `FinancePage.tsx:7` "Fail-closed calculation preview". Two implementations of `financeApi.report`, two metric-label sources (`metricLabels` 14-23 vs raw ids).
- P1 No KPI strip although `Stat` (`ui.tsx:171`) and `.stats-grid` exist. DESIGN_SYSTEM section 4 specifies Manager/Owner home content (stage distribution, delayed jobs, today's drop-offs/pickups) that is not shown.
- P1 Subtitle (106-108) and SectionTitle description (111) repeat each other. Queue rows (117) have no link; `queuePath` (93-100) is defined but navigation requires another column. Queue `kind` filter state exists (50) but no visible control in the markup.
- P2 Raw `drilldown.metric` id printed (143); errors are plain `<p role="alert">` (135) vs `.form-error` (112).

### 1.2 Bookings (`features/bookings/BookingsPage.tsx`, 208 lines)

- P1 Best-structured page, still wordy: subtitle (159), form description (164), step paragraph (165), invalidated-choices sentence (166), 24-hour hint (178).
- P1 Create form is a 3-step wizard on one screen for 6 fields (168-182). Customer is a `<select>` of all customers (169), no search; contradicts DESIGN_SYSTEM section 4 ("customer/vehicle lookup before booking entry"). Time is a free `<input type=time>` (178) **and** slot buttons (182), but `create()` (105) rejects anything but a slot: remove the free input.
- P1 Reschedule is a `.form-panel` appended **below the table** (206), out of view for long lists; it should open from the row (drawer). No live region for move availability.
- P1 No booking detail: no link to quote, job, or transport request. Row actions (201) are three small buttons.
- P1 FilterBar (187-189): search + status only; no date filter although the reception question is "today's drop-offs/pickups".
- P2 Inline `style={{width:"auto"}}` (188); counter is bare `.top-meta` (189).

### 1.3 Customers (`features/customers/CustomersPage.tsx`, 88 lines)

- P1 Table is one row per vehicle with repeated customer name/phone (80-83); no customer detail, no bookings/quotes/warranties history, no edit, no add-second-vehicle. A dead-end list.
- P1 Owner on "All branches": add button is enabled (60 disables only when `!branchId`; "all" is truthy) and fails after submit (38-41). Add an inline branch selector or disable with reason.
- P2 Subtitle (59) and panel description (65) are instructional prose; Language column (82) is low value; `makeModel` not bidi-isolated.

### 1.4 Workshop (`features/workshop/WorkshopPage.tsx`, 160 lines)

- P0 Technician view: data model is right (assigned only, one next action, 108-110) but each card shows plate, model, customer, service, quote ref, stage, branch, drop-off, pickup at equal weight (127-130); primary action is `.btn-sm` (146; `min-height:36px` per `styles.css:506`), too small for glove/phone use. No photo/note/checklist/report-issue actions (DESIGN_SYSTEM section 4).
- P1 Manager cards each embed a 4-part assignment control (label, select, button, status text, 133-144): the biggest source of vertical bloat. Use a row-level popover or a table column.
- P1 Search/stage filter only for `canAssign` (99). `fetch("/api/staff")` (43) failure silently yields empty technicians (49) and then shows "No active technician is available" (117): misleading, should show an error.
- P1 Cancel/no-show fire immediately (146-149); DESIGN_SYSTEM: "Confirm destructive or backward actions".
- P2 Stage vocabulary declared three times (`ui.tsx:33`, `Status`, `nextAction` 8-17). No loading state.

### 1.5 Quotes (`QuoteWorkspace.tsx` 37, `QuoteEditor.tsx` 283, `QuoteReview.tsx` 39)

- P0 List (24-32) is buttons plus loose `<span>`s ("Follow-up: offered", raw `q.state`); no customer/vehicle/total/validity columns.
- P0 `QuoteReview` (24-38) is an unformatted run of `<p>`/`<ul>`: totals as "N EGP minor units" (31), lines as `scopeItemId × qty: unitPrice minor` (30), policies as `id vN` (32-33). Staff cannot read a price.
- P0 `QuoteEditor`: 12+ `useState` (79-89), raw "minor" amounts, manual `packageId/version`, `taxId/version`, `acceptanceId/version` text fields inside a `<details>` (229-234), no totals preview, ten distinct validation messages only on submit (148-190).
- P1 Editor opens above the list (33) and Review below (34); all three visible at once. Heading subtitle (22) is a legal caveat; `h2` (24) duplicates the page title.
- P1 No loading/error state; `String(e)` shown raw (18-20); ids not bidi-isolated (26, 35).

### 1.6 Reservations (`ReservationsPage.tsx` 33, `ReservationDetail.tsx` 26)

- P0 Request form (19-27): six bare labels for quote id, revision, promotion id, version, qualification id, date; all of these exist in the system and should be pickers. `Number("")` is sent as NaN; no inline validation.
- P0 List (29) is buttons with `${id} · ${state} · ${vehicleId}`.
- P0 Group scheduling (30) is an 800+ character single JSX line: nested labels, checkboxes, date pickers, slot buttons with no layout.
- P1 Detail (16-23): `<p>` stack plus three forms (schedule, deposit reference, correction) with free-text reason/evidence; correction buttons print raw keys `cancel|expire|restore` (21). Caveats ("No slot held", "Deposit not implied") are repeated at 15, 16, 18, 20, 21.

### 1.7 Benefits (`BenefitsPage.tsx` 24, `BenefitDetail.tsx` 70)

- P0 List is buttons: `benefit.id · customerId · vehicleId · status` (19). Detail prints `JSON.stringify(detail.promise.expiryRule)` and `JSON.stringify(item.limit.value)` (52, 54), raw transfer/cancellation tokens, history `<li>` with snake_case fields (66).
- P1 One form mixes eligibility, fulfilment (56-61) and reversal (64-65) with the reason/evidence inputs far from the Reverse buttons. Empty state is a bare `<p>` (18); errors raw (68).

### 1.8 Transport (`TransportPage.tsx` 33, `TransportDetail.tsx` 19)

- P1 Closest to the standard (uses `PageHeading`, `form-grid`), but list is a row of buttons concatenating booking, direction, mode, status (30). `create()` silently returns on blank fields (18) and the disabled button gives no reason.
- P1 Detail (15-17): `<p>` stack, 5-input "Authorized transition" form (provider id typed as text; datetime inputs needed only for `confirmed`), buttons labelled with raw status keys (17). `nextByStatus` (5) duplicates a domain rule in the UI.
- P1 Transport belongs to a booking but is a top-level nav item (`navigation.ts:67`) with its own booking `<select>` (23).

### 1.9 Finance (`FinancePage.tsx` 7, `FinanceRecordDetail.tsx` 4, `MoneyEventForm.tsx` 10)

- P0 `FinancePage.tsx:7` is a single ~4,000-character line. `MoneyEventForm` has 15 `useState` and 14 inputs on one panel: "Amount in minor units", free-text currency, definition id + version, quote/job/reservation ids (MoneyEventForm:7-9).
- P0 Attestation asks for definition id + version + evidence ref (7), while definitions are authored in Settings (`SettingsPage.tsx:193`): two pages for one concept.
- P1 Order is inverted: two write forms first, report last. Events are buttons `kind · minor currency · date`; report is `<p><strong>metric-id</strong>: state · minor currency</p>`; duplicates Overview 123-145.

### 1.10 Promotions (`QualificationForm.tsx` 35, `PromotionAllocationDetail.tsx` 12)

- P0 Titled "Promotion qualification" (19); no list of promotions, only a checker. Nav label "Promotions" misleads.
- P0 Free-text ids: promotion id, version, "Recipient ID", "Vehicle IDs, comma separated", "Source record ID", "quote ID:revision pairs, comma separated" (22-27, 32). Highest entry-error risk in the app.
- P1 Four stacked panels (criteria, membership verification 30, result 31, allocation 32) with no step indicator; manager-only verification sits in the same flow. Policy statement (20) is a 40-word paragraph.

### 1.11 Catalogue (`CataloguePage.tsx`, 313 lines)

- P0 Packages (202-214): `<article>` + `<p>` prose per record; no table, search, or state badge; configuration hidden in `<details>` (206).
- P0 Package draft (218-265): 9 grid fields + repeated scope sub-forms (7 fields each) + work-component sub-forms, using `<select multiple>` for categories/branches (225, 227) and "one per line" textareas (226, 237-239). Price/tax are not editable here (260), so the longest form omits the most important fields.
- P1 Approval evidence + reason (304-311) sit at the **bottom** of the page and govern publish/retire buttons far above (212-213, 273-274). Four concerns on one page (packages, grades, categories, vehicle classification).
- P1 Internal refs shown (206, 164); `message` (195) uses `role=status` for success and error alike. Raw `<h1>`+`<p>` header (193-194).

### 1.12 Warranties (`WarrantiesPage.tsx` 1178, `WarrantyInvoicePanel.tsx` 280, `WarrantiesPage.css` 248)

- P0 One component with ~45 `useState` (168-245) serving five tabs (policies, coverage, claims, history, verification: 29, 826-832) plus invoice and QR flows. Largest maintainability risk and main source of merge conflicts.
- P0 Wordy: subtitle (810-813), `w-intro` banner (819-824), tab SectionTitle (835-836), form title + description (838-839), template warning (840), lifetime paragraph (846), inline notes (894, 930, 947), hold banners (926, 941, 1176): 25+ explanatory strings in the render path.
- P0 Policy editor (837-896): 20-field flat form; 10 lifetime textareas in one list (849-860). Needs sections: Basics, Duration, Eligibility, Claims, Lifetime (collapsed).
- P1 Coverage tab stacks issue form (927-946) above a list of 60-line expandable cards (957-997: work history, QR ledger, void form, invoice). Needs table + drawer.
- P1 Own vocabulary (`w-badge`, `w-tabs`, `w-hold`, `w-detail-box`, `w-form`, `w-filterbar`) duplicates `.status`, tabs, `.warning-banner`, `.form-panel`, `.toolbar`. `statusText` (105-119) re-implements labels.
- P1 QR tab (1002-1095) mixes **Owner settings** (public verification toggle + approved fields, 1005-1033) with per-record QR printing; owner settings belong in Settings.
- P1 Reception sees banners explaining restrictions (1176, 947) instead of the controls being absent.
- `PolicyEditor.tsx`, `PolicySummary.tsx`, `CoverageDetail.tsx`, `ClaimDetail.tsx` are 7-12 line shells; fine to keep as wrappers but not reusable outside warranty. `PublicWarrantyVerificationPage.tsx` (146): intro (49) and tagline (124) are marketing copy.

### 1.13 Settings (`SettingsPage.tsx` 235, `CommercialPolicyEditor.tsx` 320, `AvailabilityEditor.tsx` 42)

- P0 Page renders 8 setting cards, then **1 quote-policy editor + 1 pickup editor per branch + 8 finance-definition editors + availability editor** (191-194), each a full `.panel`. That is 11+ stacked panels before "On hold" and "History".
- P0 `AvailabilityEditor` (3, 32-37) duplicates operating settings next to it: daily intake limit, clean bays, general bays, working hours, weekly day off exist as decisions (`SettingsPage.tsx:44-53`) and as availability fields. Two sources of truth for the same capacity numbers.
- P1 Each setting card carries eyebrow category, title, question, version chip, select(s), "Current: X", impact footer (148-187): six text elements where a labelled row suffices. Summary banner (134-140), subtitle (128-131) and toolbar (142-145) say the same thing three times.
- P1 "On hold" panel (196-206) duplicates the sidebar hold block (`App.tsx` hold-nav-block, `styles.css:277-281`); eight dead cards.
- P1 History (208-221) is unbounded and last; shows raw `previousValue → newValue` (217) not localised via `valueLabel`. Sticky save bar (223-233) is good.

### 1.14 Staff (`StaffPage.tsx`, 229 lines)

- P1 Good table (201-210) and invitation list. But `security-note` (159-164), subtitle (155), and SectionTitle descriptions (167, 197, 215-217) all restate that access is enforced and invitations are individual.
- P1 No edit of role/branches for an existing member (only Remove, 208); owner must remove and re-invite. All branches preselected (60).
- P2 Demo-mode explanations (161-163, 215-217) are long; replace with one "Demo accounts" tag and hide the invite section.

### 1.15 WhatsApp (`WhatsAppSimulationPage.tsx` 466, `demo/PublicWhatsAppDemoPage.tsx` 352, `MessagingWorkspacePage.tsx` 5)

- P1 The staff inbox is the only true 3-pane workspace (331-460): good structure. Simulation status is stated five times: heading chip (310), `wa-safety` block (316-326), per-message tags (393-395), composer placeholder (414), permission notes (421, 452). One persistent chip suffices.
- P1 Own heading markup (301-314) and `wa-*` chips instead of `PageHeading`/`StatusBadge`. `MessagingWorkspacePage.tsx` is a 5-line alias "for compatibility"; delete if unused.
- P2 The public demo page is an isolated auxiliary layer; exclude from the product sweep other than tokens. `demo-auth/DemoAccountPanel.tsx` (275) likewise.

## 2. Duplication and overlap map

| # | Overlap | Where | Proposed canonical home | Navigation consequence |
|---|---|---|---|---|
| D1 | Financial report (metrics, trend, drilldown) | `OverviewPage.tsx:123-145`, `FinancePage.tsx:7` | Finance > Reports tab (owner). Overview keeps 3-4 KPI tiles linking there | Owner: Overview slimmer, Finance gains tabs |
| D2 | Capacity numbers (daily intake, bays, hours, day off) | Settings decisions (`SettingsPage.tsx:44-53`) and `AvailabilityEditor.tsx:3-40` | One branch capacity form (Settings > Branch capacity); product decision needed on which source wins | None |
| D3 | Policy/definition authoring (quote, pickup, 8 finance definitions, warranty policies, verification settings) | `SettingsPage.tsx:191-194`, `FinancePage.tsx:7` attestation, Warranties policies tab, `QuoteEditor.tsx:229-234` typed refs | Settings > Policies (table + drawer, owner); pickers consumed by Quotes, Reservations, Finance, Promotions | Owner: Settings becomes tabbed (Operations, Branch capacity, Policies, Access, History, Roadmap) |
| D4 | Warranty policy and public-verification settings inside the staff Warranties page | `WarrantiesPage.tsx:834-923, 1005-1033` | Settings > Policies > Warranty; Warranties = Coverage, Claims, QR, History | Reception/manager see a lighter page; owner gets a link |
| D5 | Quote -> Reservation -> Promotion -> Benefit chain, each asking for the others' ids by hand | `navigation.ts:69-72` | "Quotes & offers" page with tabs Quotes / Reservations / Benefits; promotion qualification launched from a quote | Remove top-level Reservations, Benefits, Promotions; one entry. Overview queue deep-links to tabs |
| D6 | Transport vs Bookings | `TransportPage.tsx:23`, `navigation.ts:67` | Booking drawer section + "Transport" tab in Bookings | Remove top-level Transport |
| D7 | Customer/vehicle pick-lists | `BookingsPage.tsx:169`, `QuoteEditor.tsx:221-223`, `TransportPage.tsx:23`, `CataloguePage.tsx:298` | Shared `CustomerVehiclePicker` | None |
| D8 | "On hold" lists | sidebar block (`App.tsx`), `SettingsPage.tsx:55-64,196-206`, WhatsApp banner | One Roadmap list in Settings; remove from sidebar | Owner/manager lose four disabled sidebar rows |
| D9 | Workshop vehicle list | `OverviewPage.tsx:152` | Workshop is canonical; Overview shows stage counts + link | None |
| D10 | Status vocabularies | `ui.tsx:155-169`, `.member-status`, `.w-badge`, `.hold-badge`, `TransportPage.tsx:15`, `WarrantiesPage.tsx:105-119`, `wa-*` chips | One `StatusBadge` registry | None |
| D11 | Finance metric labels | `OverviewPage.tsx:14-23` vs raw ids in Finance | One shared label map | None |
| D12 | Navigation chrome | sidebar + `workspace-tabs` + mobile menu descriptions | Sidebar (desktop) + bottom bar/More (mobile); remove tab strip and group descriptions | Frees ~48px vertical on every page |
| D13 | Messaging alias | `MessagingWorkspacePage.tsx` | Delete after import check | None |

### Proposed navigation per role

- **Owner** (target 9-10 items, was 15): Overview, Inbox, Bookings (Transport tab), Workshop, Customers, Quotes & offers (Quotes/Reservations/Benefits), Warranties, Finance (Reports/Events), Catalogue, Settings (tabs incl. Policies and Staff access).
- **Branch manager** (7, was 12): Overview, Inbox, Bookings, Workshop, Customers, Quotes & offers, Warranties.
- **Receptionist** (5): Inbox, Customers, Bookings, Quotes & offers, Warranties (search + open claims). Decide whether Workshop is read-only for them; today `navigation.ts:81` lists it but `:65` denies it.
- **Technician** (1): Workshop only; phone-first "My cars today", no branch select needed.

## 3. Shared pattern set (build FIRST, one task)

All under `shared/`. Reuse existing CSS classes where listed; add only what is missing.

| Pattern | Reuse / new | Spec |
|---|---|---|
| PageHeader | Reuse `PageHeading` (`ui.tsx:143`) | Make `eyebrow` and `subtitle` optional; add `meta` and `actions` slots; subtitle max one line (~90 chars). Remove the hack at `styles.css:607-613` once all pages comply |
| FilterBar | Wrap `.toolbar/.search-wrap/.filter-select` (`styles.css:121-127`) | search, up to 3 inline filters, "Clear filters" when active, result count with `aria-live`. Replaces Bookings:187-189, Workshop:99-101, Customers:77, Warranty:948-956 |
| DataTable | Build on `.table-wrap/table/.primary-cell/.secondary-cell` (129-137) | columns (label, render, sortable with `aria-sort`, mono), `onRowClick`, `loading`/`error`/`empty` slots, sticky header; below 760px collapses to stacked rows (no horizontal scroll for core actions) |
| FormSection / Field | Reuse `.form-grid/.form-field/.field-label/.form-hint` (154-155, 170-171, 199) | `<FormSection title>` (fieldset + legend), `<Field label required hint error>` wiring `htmlFor`, `aria-describedby`, `aria-invalid`; 2-col grid, 1-col under 760px; one "* required" legend per form |
| DetailDrawer | New | inline-end drawer (full-screen on mobile), focus trap, Esc, focus restore, `aria-labelledby`, URL-addressable (`?record=id`) for Overview deep links; replaces below-the-table panels and `panel section-gap` detail blocks |
| StatusBadge | Extend `Status` (`ui.tsx:155`) | Registry per domain (booking, job, quote, reservation, benefit, transport, warranty, claim, staff, message) with en/ar labels in one register and five tones mapped to existing `.status` colours; replaces `.member-status`, `.w-badge`, `.hold-badge`, `.tag`, `wa-*` chips |
| EmptyState | Reuse (`ui.tsx:151`) | add `action` slot and variants: no-data, no-results (Clear filters), error (Retry); add `Skeleton` for loading (replaces `loading-inline` 416) |
| Notice | Reuse `WarningBanner` (`ui.tsx:175`) | single compact notice, tones info/warning, max one per page; replaces `settings-summary`, `security-note`, `w-intro`, `wa-safety` |
| TabBar | New | accessible tablist with counts, URL-synced; replaces `w-tabs` and `workspace-tabs` |
| ConfirmDialog | Reuse `ModalConfig` (`ui.tsx:26`) | add focus trap; required for cancel/no-show/void/revoke/retire |
| Money / RecordRef | New `shared/format` | `<Money>` converts minor units and shows currency; `<RecordRef>` mono + bdi; reuse `dateLabel/timeLabel` (`ui.tsx:104-117`) |
| Pickers | New | `CustomerVehiclePicker`, `QuotePicker`, `PolicyPicker` (name + version, no typed ids) |

Also in this task: split `styles.css` into tokens/base/components/layout; collapse the duplicate overrides (476-565); remove unused decision copy (`ui.tsx:54-102`); add CSS for `proposed/active/on-hold`; unique nav icons; fix receptionist/workshop mismatch.

## 4. Copy to cut (keep title + at most one useful sentence)

- Subtitles restating the title: Overview 106-108; Bookings 159; Customers 59; Workshop 93-95; Quotes 22; Transport 21; Settings 128-131; Staff 155; Finance 7; Warranties 810-813; WhatsApp 305-308.
- Duplicate banners: `settings-summary` (`SettingsPage.tsx:134-140`), toolbar line (142-145), `security-note` (`StaffPage.tsx:159-164`), `w-intro` (`WarrantiesPage.tsx:819-824`), `wa-safety` (`WhatsAppSimulationPage.tsx:316-326`).
- Panel descriptions that repeat the title: Overview 111; Bookings 164; Customers 65; Settings 211; Warranty 836, 929, 1004, 1109; Staff 167, 197, 215; Catalogue 199, 269; Finance 7; Reservations 18, 30.
- Per-setting question + impact + current line (`SettingsPage.tsx:155,180,185`): keep label + one helper.
- Hints: Bookings 166, 178; Warranty 839, 894, 930, 947; Catalogue 220, 260; Benefits 15; Reservations 30; Transport 23; Promotions 20; Quotes 25.
- Restriction banners (hide the control instead): Warranty 926, 941, 1176; WhatsApp 421, 452; Settings On-hold (196-206); sidebar hold block.
- Repeated disclaimers ("no payment implied", "not a booking", "no slot held", "simulated"): at most one per page. Reservations 15, 16, 18, 20, 21; Quotes 22; Finance 9; Transport 12; WhatsApp 310, 316-320, 393-395, 414.
- Group descriptions `navigation.ts:42,49,56` and their render sites (`App.tsx:237`, `styles.css:593,648`).
- Register mismatch: pick one Arabic register (MSA per DESIGN_SYSTEM section 7) across `ui.tsx:34-41`, Bookings/Workshop (colloquial) and Quotes/Reservations/Benefits (MSA).

## 5. Wave-2 task breakdown

### Ordering rule

1. **W2-0 (serial, first, merge before anything else): shared pattern set.** It owns every shared file: `shared/styles.css` (and its split), `shared/ui.tsx`, new `shared/components/*`, `app/navigation.ts`, and the shell parts of `app/App.tsx`. No module task may edit these; variants are requested into W2-0.
2. **W2-1 to W2-10 (parallel after W2-0)**: each owns one disjoint feature folder. They import only from `shared/components`; feature-specific CSS goes in a colocated file (as Warranty/WhatsApp already do). No server changes unless listed; no server-to-web imports.
3. **W2-11 (serial, last): integration**, because it touches `App.tsx` routing, `navigation.ts`, and cross-feature deep links.

### W2-0 Shared patterns (SERIAL, first)

Files: `shared/styles.css` -> `shared/styles/*`, `shared/ui.tsx`, `shared/components/{PageHeader,FilterBar,DataTable,FormSection,Field,StatusBadge,DetailDrawer,EmptyState,Notice,TabBar,Skeleton,Money,Pickers}.tsx`, `app/navigation.ts`, `app/App.tsx` (shell only).
Acceptance:
- All components in section 3 exist with tests: DataTable (sort, empty, loading, error), DetailDrawer (focus trap, Esc, focus restore), Field (aria wiring), StatusBadge registry (en + ar, every domain).
- `PageHeading` eyebrow/subtitle optional; hack at `styles.css:607-613` removed with no regression on current pages.
- One definition each for `.mobile-nav`, `.status`, `td`, `.btn`; logical CSS properties only.
- `workspace-tabs`, group descriptions and sidebar hold block removed; nav icons unique; receptionist/workshop mismatch resolved.
- `npm run typecheck`, `npm test -- --run`, `npm run build` pass; RTL screenshot of DataTable + Drawer.
- Export contract documented for `PolicyManager({lang,t,state,notify})` (consumed by W2-8, produced by W2-6).

### Parallel module tasks (disjoint ownership)

| Task | Owns (exclusive) | Scope and acceptance |
|---|---|---|
| W2-1 Overview | `features/overview/*` | KPI tiles (`Stat`) + needs-attention DataTable with row links (`?record=`) + stage counts; report removed (moves to W2-7). Role-specific: manager = branch, owner = both with drill-down. Loading/error/empty on queue. No `<details>` for core content |
| W2-2 Bookings + Transport | `features/bookings/*`, `features/transport/*` | FilterBar (search, status, date); DataTable; new booking as drawer with CustomerVehiclePicker + slot buttons only (free time input removed); reschedule in drawer; booking drawer contains Transport section; Transport dispatch list as a tab. Cancel keeps ConfirmDialog. No below-table panels; no typed ids; slots announced via live region |
| W2-3 Customers | `features/customers/*` | One row per customer; drawer with vehicles, add vehicle, recent bookings/quotes/warranties from store; add-customer drawer with inline branch selector for "All branches"; phone/plate LTR-isolated; empty/no-results states |
| W2-4 Workshop | `features/workshop/*` | Technician: "My cars today", large plate, one primary action >= 48px, secondary actions (note/photo/issue as available); manager: DataTable/board with row-level assignment popover, stage FilterBar. Confirm destructive transitions. Visible error if `/api/staff` fails. Phone + tablet checks |
| W2-5 Quotes & offers | `features/quotes/*`, `features/reservations/*`, `features/benefits/*`, `features/promotions/*` | Single page with tabs Quotes/Reservations/Benefits (DataTables with `Money`, StatusBadge). QuoteReview as line-item table + totals. QuoteEditor sectioned (Customer & vehicle, Scope, Pricing, Policies, Review) with pickers for package/tax/acceptance policy. Reservation request picks accepted quote + promotion; group scheduling as stepper in a drawer. Benefit detail formatted (no JSON), reversal beside the history row. Promotion qualification as a drawer action from a quote, pickers instead of typed ids. Zero fields asking for raw ids or "minor units". May be split quotes vs reservations/benefits/promotions if folders stay disjoint |
| W2-6 Warranties | `features/warranty/*` except `PublicWarrantyVerificationPage.tsx` | Split `WarrantiesPage.tsx` into `CoverageTab`, `ClaimsTab`, `QrTab`, `HistoryTab` + hooks (each < 300 lines); extract `PolicyManager` for Settings; replace `w-*` markup with shared patterns; coverage as DataTable + DetailDrawer; issue-coverage as drawer stepper; at most one Notice; reception sees only permitted controls. Existing warranty tests pass unchanged (behaviour-preserving first) |
| W2-7 Finance | `features/finance/*` | Tabs Reports/Events; owns the single report implementation (taken from Overview); events DataTable + drawer with reversal; money form sectioned (Amount, Source, Links, Evidence) with major-unit input and currency select; attestation uses a definition picker. Reading first; no raw metric ids; no minified one-liners |
| W2-8 Settings & Staff | `features/settings/*`, `features/staff/*` | Tabs: Operations (8 settings as compact rows grouped by category), Branch capacity (merged availability, single source), Policies (table + drawer; mounts warranty `PolicyManager` and verification settings), Access (Staff), History (paginated, localised), Roadmap (single on-hold list). At most one Notice per tab; 11 stacked policy panels gone; save bar kept. Staff: one security notice, edit role/branches |
| W2-9 Messaging & public | `features/whatsapp/*`, `features/warranty/PublicWarrantyVerificationPage.tsx` | Inbox on PageHeader + single simulation chip + legend instead of banner and per-message tags; mobile list <-> thread navigation; delete alias if unused; public demo only token updates. Loading/error/empty on inbox; RTL transcripts keep phones/plates LTR |
| W2-10 Catalogue | `features/catalogue/*` | Tabs Packages/Grades/Categories; packages DataTable with state badge/filter; draft editor as drawer with FormSections (Basics, Availability, Scope, Work); checkbox groups replace `select multiple`; evidence + reason collected in the publish/retire ConfirmDialog; names not ids; disabled actions say what is missing |
| W2-11 Integration (SERIAL, last) | `app/App.tsx` routes, `app/navigation.ts`, `app/*.test.*`, `docs/product/DESIGN_SYSTEM.md`, `docs/testing/*`, e2e | Wire consolidated routes (Quotes & offers, Bookings > Transport, Settings tabs incl. Staff, Finance tabs); redirects from old paths; role matrix verified (each role sees exactly the nav in section 2); Overview deep links; axe + keyboard + RTL pass; update AGENT_INSTRUCTIONS source map. typecheck/test/build green; role walk-through recorded under `docs/testing/` |

### Dependency graph

W2-0 -> {W2-1 ... W2-10} in parallel -> W2-11. Soft links are by export only: W2-1 links to W2-7's Reports tab; W2-8 imports `PolicyManager` from W2-6 (signature fixed in W2-0).

### Cross-cutting acceptance for every module task

- Page = PageHeader (title + optional one-line subtitle) + FilterBar + DataTable/Drawer; at most one Notice.
- Every list has loading skeleton, empty state with next action, error state with Retry, no-results state with Clear filters.
- Statuses via StatusBadge only; no raw enums, ids, "minor units", or JSON in the UI.
- Logical CSS only; phones, plates, ids isolated (`.mono`/`bdi`); verified in AR/RTL and EN/LTR at 360, 768, 1280 px.
- Disabled primary buttons state why; destructive actions confirmed; form input preserved after recoverable errors.
- No edits outside the owned folder; tests colocated; `npm run typecheck`, `npm test -- --run`, `npm run build` pass.

## 6. Risks and notes

- Warranty (1178 lines, ~45 states) and the Quotes chain are the riskiest refactors: split by tab with no logic change first, keep behaviour tests green.
- D2 (capacity duplication) needs a product decision on the authoritative source before the UI merge; server reconciliation may be needed.
- Reduced density must not remove approval/evidence safeguards (AGENT_INSTRUCTIONS: no fake approvals, no implied prices); cut copy and relocate controls, do not delete required inputs.
- This audit modified no code. Untracked `docs/superpowers/*` files were not read.
