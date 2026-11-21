# Review E: Receptionist, Technician, Flows

Screenshots root: `...\visual-run-44959215133\checks\screenshots`. Source root: `apps/web/src`.

Coverage honesty: I opened the overview or first slices of receptionist en 1280 (bookings, quotes, customers, whatsapp, warranties, quotes-reservations, quotes-benefits, quotes-promotions, bookings-transport), en 360 (bookings, customers, whatsapp, quotes), ar 1280 bookings, technician en 1280/360, and flows customer-360 en 360, drawer en 360, search-plate en 360, print-quote en 1280. The remaining ar and 768 shots and the other flow variants were not opened; I assume they match their en twins (same components), which is unverified. RTL conclusions rest mainly on ar bookings 1280. Y-offsets refer to slices I viewed (mostly y 0-2000).

## Verdict
The receptionist role works but is not fit for daily front-desk use. List pages have no paging (bookings 35,037 px at 1280 and 77,565 px at 360; quotes 18,392 / 74,134 px; warranties 15,908 px), so the receptionist scrolls a 415-row history to find today's work, and there is no action-first "today" view. Mixed-script rows (Arabic names, Latin service names, Arabic plates) look broken, the Confirm button wraps to "Con / firm", the WhatsApp composer is crushed, and the 360 bottom bar truncates "Quotes & ...". The technician role is an empty page (0 jobs) inside a desktop-style shell, so touch targets and one-hand use cannot be judged and nothing visible is designed for a phone in a workshop. Customer-360 and drawer flow shots are failure captures; the search-plate flow shows a good dropdown over an Owner dashboard whose money KPIs overflow.

## Cross-cutting findings

| ID | Sev | What | Where | Fix | Source |
|---|---|---|---|---|---|
| E-01 | P1 | No pagination/virtualisation: bookings 415 rows, quotes 338, warranties 237, benefits 94. Page heights 15k-77k px. | receptionist/en/1280/bookings.png (35037), en/360/bookings.png (77565), en/360/quotes.png (74134), en/1280/quotes.png (18392), warranties.png (15908) | Paging (25/50) or virtual list, sticky header; bookings default to Today/upcoming ascending. | `shared/components/DataTable.tsx`, `features/bookings/BookingsPage.tsx`, `features/quotes/*`, `features/warranty/*` |
| E-02 | P1 | Mobile bottom nav label "Quotes & ..." truncated on every receptionist 360 page; the fixed bar appears mid-page in full-page captures (y~670), so bottom padding for the last row cannot be verified. | en/360/bookings.png y 670-740; customers.png, whatsapp.png, quotes.png | Shorter label ("Quotes") or 2-line label; ensure main has bottom padding equal to nav height; capture sticky UI via viewport shots. | `shared/styles/layout.css` (.mobile-nav, .mobile-nav-item span) |
| E-03 | P2 | Mixed-direction rows. Arabic and Latin names alternate in one column; Arabic plates render digits-first; Transport "Booking" column reads "Nov 2026 28 · 5678 ر م س · أحمد..." (date parts reversed). | en/1280/bookings-transport.png y 350-1000; bookings.png y 340-960; customers.png y 410 | `<bdi>`/`dir="auto"` on names, one plate chip component with its own direction, locale-aware date inside an LTR isolate. | `shared/components/RecordRef.tsx`, `features/transport/TransportPage.tsx`, `transport-logic.ts` |
| E-04 | P2 | Inline Confirm button wraps to "Con / firm" (EN) and "تأك / يد" (AR); it is the only filled button inside a table and only on pending rows, in an unlabeled column. | en/1280/bookings.png y 335-385; ar/1280/bookings.png y 335-385; en/360 N/A | `white-space:nowrap`, min width, fixed actions column with header. | `features/bookings/BookingsPage.tsx`, `bookings.css` |
| E-05 | P2 | Type scale out of sync: table headers 12 px muted, captions 11 px, page title ~30 px, topbar email/role-preview 11 px but "Sign out" button ~17 px; Arabic text looks lighter and larger than Latin at the same size. | all 1280 shots y 0-60; technician en/1280 | Define 4-5 type tokens and use them in topbar; match Sign out to the language toggle; tune Arabic weight/size. | `shared/styles/tokens.css`, `base.css`, `layout.css`, `app/App.tsx` |
| E-06 | P2 | Duplicate chrome: Sign out twice (topbar + sidebar), role shown in chip and sidebar, "Role preview account" badge permanent. At 360 the header takes ~150 px in three stacked rows before content. | all shots; en/360/bookings.png y 0-150 | One avatar menu; compact mobile header with expanding search; show preview notice as a single thin banner. | `app/App.tsx`, `layout.css`, `features/demo-auth/DemoAccountPanel.tsx` |
| E-07 | P2 | Inconsistent record styling: customer names are teal links with icon in Quotes/Warranties, plain bold black in Customers/Transport, teal bold for Latin vs teal regular for Arabic (looks like two data states). | en/1280/quotes.png y 430-870; customers.png y 410-950; bookings-transport.png | One RecordRef style (weight, colour, icon) everywhere. | `shared/components/RecordRef.tsx`, `base.css` |
| E-08 | P2 | Mobile cards repeat label/value rows per item (~185 px each, 415 of them), values right-aligned in mixed scripts so cards look ragged. | en/360/bookings.png y 465-1000; customers.png y 545-1000 | Compact card: title line (customer + time), plate + service, status chip; drop repeated labels; add paging. | `shared/components/DataTable.tsx`, `components.css` |
| E-09 | P3 | Filter bars and headers differ per page: Customers has a second unrelated "Plate or warranty QR" input and "Find" wrapped on its own line with the result count floating between (y 245-335); tabs sit above the title on Bookings/Customers/Warranties but below on Quotes. | customers.png y 245-335; quotes.png y 100-200 vs bookings.png y 100-180 | One layout: title, tabs, single filter bar; move QR into a "Scan" button or global search. | `shared/components/FilterBar.tsx`, `PageHeader.tsx`, `TabBar.tsx`, `features/customers/CustomersPage.tsx` |
| E-10 | P3 | Control sizes disagree (selects ~40, inputs ~42, buttons 42-50); the "New request" button is stretched to a 105 px tall block next to the filter bar. | bookings-transport.png y 157-262 | Shared control-height token; `align-self:flex-start` on action buttons. | `components.css`, `layout.css`, `features/transport/TransportPage.tsx` |
| E-11 | P1 | Date formats are mixed: "12 Dec 2026 09:00" (bookings), "Mon Dec 21" without year (quotes), "21 Sept 2026" (reservations, non-standard Sept), "Nov 2026 28" (transport). | bookings.png y 340; quotes.png y 440; quotes-reservations.png y 440; bookings-transport.png y 358 | One locale-aware date helper with explicit year. | shared formatters, quote/transport logic |

## Per-page findings

### Receptionist Bookings (en 1280/768/360, ar 1280)
- E-12 P2: Service column concatenates mixed-language strings ("حماية كاملة للطلاء, Windshield / screen Glass Guard, Interior nano ceramic", en/1280 y ~840-960) with misplaced commas. Same services appear Arabic in EN and "Full PPF" Latin in AR (ar/1280 y 520). Use service chips (max 2 + "+N"), always in the active locale.
- E-13 P2: Branch column repeats "Nasr City Service Center" on every row, wrapping to 3 lines and inflating row height. Hide when user has one branch.
- E-14 P2: Missing receptionist actions: call, WhatsApp, reschedule, check-in/arrived, walk-in shortcut. Only Confirm exists, for pending rows.
- E-15 P3: Seed realism: same customers recur on consecutive days (8599, 8310, 7930), "DEMO A17/A39" plates among Arabic plates.
- Verdict: data is readable, but at 35k px it is a history dump, not a work queue.

### Quotes (en 1280/360)
- E-16 P2: Drafts show three "—" cells (Total, Valid until, Follow-up) at y 650, 758, 864; the Follow-up column is "—" on every visible row. Show one placeholder ("No total yet"), show follow-up only when set.
- E-17 P3: At 360 the tab bar clips "Promo..." with no scroll affordance (en/360/quotes.png y ~250).
- Verdict: tidy table, unpaged, lots of dead whitespace around the lone Create quote button.

### Quotes sub-pages
- Reservations: good table and status colours; default "Valid until" ascending puts expired Sept/Oct items first so upcoming ones are buried. P3.
- Benefits: raw seeded labels "Fourth car", "Vip transport"; same customer 4x; all Active; "1 use in total" reads oddly (use "1 use left"). P3.
- Promotions (en 1280): E-18 P2: just an "Accepted quote *" picker with a list clipped mid-row at y 573, no explanation, no action button; looks unfinished. `features/promotions/*`.

### Customers (en 1280/360, ar 1280)
- E-19 P2: Phone numbers are plain text; no tel:/wa.me link or WhatsApp button, the receptionist's core task.
- E-20 P3: "59 customers" subtitle and "59 results" repeat; no last-visit, balance or language column though a language filter exists. Owner at 360 sees 67 customers vs receptionist 59 (confirm scope).

### Warranties (en 1280)
- E-21 P2: Literal "(example)" in coverage names ("GO garage Pro PPF - 7 years (example)"), English title over Arabic subtitle. Remove seed text.
- E-22 P3: "Open claim" is outlined while other page primaries are filled. Tab count badges (237/15/237) are a good pattern to reuse.

### WhatsApp Inbox (en 1280/360)
- E-23 P1: Composer is crushed at 1280: reply-type select ~100 px, textarea ~60 px wide with placeholder wrapping "Write / a reply" (y 890-945); Send disabled. Stack the select above the textarea, textarea flex:1. `features/whatsapp/WhatsAppSimulationPage.css`, `MessagingWorkspacePage.tsx`.
- E-24 P2: Chat bubble text is larger than list previews; bubble date "-11-2026 28" is garbled by bidi (y 680-760). Wrap dates/numbers in LTR isolates.
- E-25 P2: "Consent unavailable" badge unexplained; "Delivery off" shown twice (status dot + info notice).
- E-26 P2: At 360 only the conversation list is shown (no way to see the reply view in the capture), so the mobile reply flow is unverified.

### Technician Workshop (en/ar 1280, 768, 360)
- E-27 P1: Empty "No jobs assigned to you"; no evidence of large touch targets or job cards. At 360 it is the desktop shell: role chip, language, Sign out and a global customer/quote search (placeholder truncated "...quote, war") that a technician does not need; a single wide nav button. Needs big job cards (plate, service, stage, timer), 48-56 px Start/Done/Photo/Note buttons, one-hand bottom actions. Seed jobs for the technician so the run can verify it.
- E-28 P2: "0 jobs" caption is ~11 px, low contrast; empty state gives no action (Refresh, view unassigned jobs).
- E-29 P3: Large blank area below the empty state at 1280 (y 330-800).

### Flows
- customer-360 (en 360, failure): "Could not load this record", title just "Vehicle" with no plate, back link "Customers" duplicated (header and next to Retry), Retry small. P3: dedupe, keep context.
- drawer (en/ar, 360/1280 failure): at 360 the capture is the Owner Customers list (9004 px) with no drawer; not informative. Recapture after the fix. Owner list repeats "67 customers"/"67 results".
- search-plate (en 360): dropdown (VEHICLES group, plate + car + owner) works well. E-30 P1: beneath it the Owner KPI money values overflow their tiles ("EGP 293,470.40", "EGP 11,805,270" cut at tile edge, y 570-590); the 7th tile sits alone and under the fixed nav. Fix: clamp font size, compact notation on mobile, one money tile per row. `features/overview/*`, `shared/components/Money.tsx`.
- print-quote (en 1280): drawer is clear (items table, subtotal/total, accordions). E-31 P2: "Benefits" accordion is cut by the sticky Print footer (y ~725) with no scroll hint; "Catalogue price" / "Answered" values lack context; the area below y 800 is the unmodal page (capture artefact). No print stylesheet output was captured.
- ar flow variants not opened.

## RTL (ar bookings 1280 only)
Layout mirrors correctly (sidebar right, columns reversed, sort icons). Issues: Confirm wraps "تأك / يد"; table headers 11-12 px; Latin service name "Full PPF" in an Arabic row; long search placeholder only just fits. Other ar pages unverified.

## Colour and accessibility
- Muted grey meta text (about #5f7476 at 11-12 px) on off-white and tinted header rows; "Role preview account" amber on pale amber ~4:1; Pending (amber) and Expired (grey) badges are the weakest.
- Links are teal bold with no underline; colour is the only cue.
- Search shows a clear teal focus ring (good); focus on row links and selects not visible in captures.
- Touch targets: tabs 44 px (good), selects ~40, mobile nav ~40, "Find" ~40. Technician sizes unknown.

## Recommendations beyond bug fixing
1. Receptionist home as a Today board (arrivals, bookings to confirm, unanswered WhatsApp, quotes to follow up); lists become search tools.
2. Paging, saved filters, date-grouped sections, sticky table header, 48-56 px rows.
3. One-tap call / WhatsApp / copy plate on customer, booking and quote rows.
4. Walk-in flow: plate lookup, customer, service, create and check in in one dialog.
5. One formatter module for dates, money, plates, phones with bidi isolation, used by pages and chat bubbles.
6. Type scale and control-height tokens; single Sign out; collapsed mobile header.
7. Separate lightweight technician mobile shell with big job cards and a fixed bottom action; seed jobs.
8. Clean seed data: remove "(example)", duplicates, DEMO plates and raw benefit keys.
9. Visual run: capture sticky UI separately from full-page, recapture drawer after the fix, add print and technician-with-jobs shots.

## Per-page one-liners
- bookings: 415 unpaged rows, wrapped Confirm, mixed-script cells.
- quotes: tidy table, unpaged, dashes in drafts.
- quotes-reservations: good; sort hides upcoming.
- quotes-benefits: fine; raw seed labels.
- quotes-promotions: nearly empty, purpose unclear.
- bookings-transport: bidi/date mess in Booking column; oversized New request button.
- customers: clean, no contact actions, odd filter bar.
- whatsapp: crushed composer, garbled bidi date.
- warranties: good structure, "(example)" seeds, unpaged.
- technician workshop: empty, desktop shell on a phone.
- flows: capture-limited; search dropdown good; owner KPI overflow visible.
