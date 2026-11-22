# Garage OS — Design System and UX Specification

## 1. Design direction

Use a restrained enterprise interface inspired by **IBM Carbon Design System**. The goal is operational clarity and trust—not a visual copy of IBM products and not a generic AI-generated dashboard.

Use Carbon components/tokens where compatible with the chosen stack and licensing. If using another component library, preserve the same principles and visual discipline.

## 2. Visual principles

- Clear information hierarchy.
- Neutral backgrounds and restrained color.
- Strong typography and consistent spacing.
- Real tables and structured lists where data comparison matters.
- Cards only when they represent a meaningful grouped task or summary.
- No gradients, glassmorphism, excessive shadows, decorative illustrations, or random accent colors.
- No emoji as interface icons. Use a consistent professional icon set.
- Avoid charts without a real decision purpose.
- Use real vehicle/job information in the UI; do not use stock photos as decoration.
- Keep labels plain and consistent with the workshop's vocabulary.

## 3. Typography and language

Preferred fonts:
- Latin: IBM Plex Sans.
- Arabic: IBM Plex Sans Arabic.
- Fallback: system sans-serif with Arabic-capable fallback.

Arabic is the default staff language. Provide an explicit language switch for English.

RTL requirements:
- Set document direction and language correctly.
- Mirror directional layout patterns, not semantic icons that should remain unchanged.
- Ensure navigation, tables, forms, menus, dialogs, date pickers, breadcrumbs, and notifications work in RTL.
- Use logical CSS properties (`margin-inline`, `padding-inline`, `inset-inline`) rather than hardcoded left/right.
- Test mixed Arabic/English, phone numbers, vehicle plates, serial-like IDs, dates, and currency.
- Do not reverse numeric values or phone numbers.
- Use localized date/time and number formatting with consistent timezone handling.

## 4. Role-based experiences

### Technician — “My cars today”
Primary device: personal phone or shared tablet.

Home screen:
- Today's assigned jobs, sorted by priority/due timing.
- Large vehicle identifier and service name.
- Current stage and next action.
- Expected pickup and delay warning when relevant.
- One large primary action, e.g. “Start work” / “Mark work finished”.
- Secondary actions: add photo, add note, view checklist, report issue.

Rules:
- One vehicle/job is the focus at a time.
- Avoid complex dashboards, dense tables, settings, and multi-level menus.
- Show assigned vehicles in next-action order and expose only the next valid technician action; assignment and exception controls stay with managers.
- Large touch targets; usable with one hand.
- No drag-and-drop.
- Never hide the vehicle identity while the technician is updating it.
- Confirm destructive or backward actions.
- Support both phone and tablet responsive layouts.

### Receptionist — “Inbox and today”
Primary device: desktop/tablet.

Home screen:
- Shared inbox with clear unread/unanswered indicators.
- Today’s drop-offs and pickups.
- Quick customer/vehicle search.
- Booking actions and branch selector where permitted.
- Clear conversation owner and escalation status.

Rules:
- Fast keyboard-friendly workflows on desktop.
- Put the inbox and customer/vehicle lookup before booking entry; reuse a selected branch and existing customer/vehicle records rather than retyping their identity.
- No more than a few primary filters visible at once; advanced filters can be tucked away.
- Make source number and branch visible.
- Show booking capacity warnings before confirmation.
- Use plain action labels.

### Branch manager — “Branch operations”
Home screen:
- Current jobs by stage.
- Delayed/at-risk jobs.
- Unassigned and overdue conversations.
- Today's drop-offs and pickups.
- Team workload and attendance/availability only if operationally approved.
- QC issues and rework.
- Low stock exceptions.

### Owner — “Business overview”
Home screen:
- Both branches at a glance.
- Active vehicles and stage distribution.
- Bookings, received, delivered, overdue.
- Conversation response exceptions.
- Revenue/payment figures only with clear definition and caveat.
- Critical alerts and daily/weekly trends.
- Drill down from summary to the underlying records.

## 5. Navigation

Use role-aware navigation. Do not show every module to every role.

Suggested modules:
- Overview
- Inbox
- Bookings
- Workshop / Jobs
- Customers
- Vehicles
- Warranties
- Inventory
- Payments
- Reports
- Settings (owner/authorized manager only)

Keep navigation stable. On mobile, use a compact bottom navigation or a simple menu with the most frequent actions exposed.

## 6. Components and interaction patterns

- Tables: sortable columns, clear empty states, pagination or progressive loading, responsive treatment.
- Forms: short sections, inline validation, preserve user input after recoverable errors.
- Do not ask staff to type internal row IDs. Generate them in the UI; keep approved pricing, policy references, customer identity, evidence, and other safety/audit inputs explicit when no verified record can supply them.
- Dialogs: use only for decisions that need focus; do not nest dialogs.
- Toasts: brief confirmation for successful actions; errors must explain recovery.
- Status tags: consistent text and color; never rely on color alone.
- Search: support customer name, normalized phone, plate, booking ID, and job ID subject to permission.
- Filters: show active filters and provide clear reset.
- Empty states: explain what the user can do next; no decorative illustration required.
- Loading: skeletons or clear progress indicators for real asynchronous work.
- Error states: explain whether data was saved and what to do next.

## 7. Job stage presentation

Use a consistent stage vocabulary in Arabic and English. Provide a clear status label and one next action. The backend transition map remains authoritative.

Suggested Arabic labels (owner/staff wording must be validated):
- Booked — محجوزة
- Received — تم الاستلام
- In service — تحت التنفيذ
- QC — فحص الجودة
- Ready — جاهزة
- Delivered — تم التسليم
- No-show — لم يحضر
- Cancelled — ملغي

Do not translate differently in separate screens.

## 8. Color and status

Use a Carbon-like neutral palette with semantic status colors:
- Neutral: booked, informational, inactive.
- Blue: active/in-progress or informational.
- Green: passed, ready, delivered, successful.
- Yellow/amber: approaching SLA, delay risk, needs attention.
- Red: failed, critical, blocked, or overdue.
- Purple only where a distinct business concept needs it.

Color must be paired with text/icon. Maintain accessible contrast in light and dark themes if both are supported. A light theme may be the default.

## 9. Responsive and shared-device behavior

- Technician views must work on small phones and shared tablets.
- Reception/management views must work on common laptop and tablet widths.
- Avoid horizontal scrolling for core actions.
- Shared tablet mode: technician selects their name and enters a PIN; session locks after configurable inactivity **[ASSUMED]**.
- Personal device mode: authenticated session with revocation, timeout, and minimal local data.
- Do not store sensitive customer information in unprotected local storage.

## 10. Usability testing

Test with representative non-technical staff:
- Find a vehicle and its current status.
- Claim a conversation and reply.
- Create/reschedule a booking.
- Check in a vehicle and take intake photos.
- Move a job to the next stage.
- Complete QC and record a failure.
- Find a warranty by QR.
Observe completion time, errors, confusion, and requests for help. Revise the interface based on observed behavior.

## Brand (GO Stores identity applied 22 Nov 2026; concept pending Maher approval)
The logo is a concept built by Codex from social references. Maher must approve it and original vector files replace the
files in `apps/web/public/brand/` (same file names, drop-in). Plan: `docs/superpowers/plans/2026-11-22-brand-identity-application-plan.md`.

| Token (tokens.css) | Value | Role |
|---|---|---|
| `--brand-graphite` / `--sidebar` / `--ink` | `#17191D` | Sidebar, toasts, body text, secondary button outline |
| `--brand-graphite-soft` / `--sidebar-soft` | `#2A2E33` | Sidebar and mobile-nav hover |
| `--brand-warm-white` / `--canvas` | `#F6F4EF` | Page background, active nav pill, nav text |
| `--brand-surface` / `--paper` | `#FFFFFF` | Cards, tables, drawers, dialogs |
| `--brand-red` / `--teal` | `#C82127` | Primary button, links, active-nav marker, loading bar (names `--teal*` are internal, rename later) |
| `--brand-red-dark` / `--teal-dark` | `#98171B` | Primary hover |
| `--brand-red-tint` / `--teal-soft` | `#FBEDEE` | Light red tint (rare) |
| `--brand-gold` | `#F3B61F` | Fills with graphite text, focus ring, tab underline, selected markers; never text on light |
| `--brand-gold-text` | `#8A5A00` | Gold-coloured text on white (5.9:1) |
| `--brand-gold-tint` + `--brand-gold-ink` | `#FFF4D6` + `#7A4F0E` | In-progress, selected rows/chips, `premium` tone |
| `--brand-line` / `--line` | `#D6D4CF` | Borders |
| `--brand-muted` / `--muted` | `#676B70` | Secondary text; `--caption-muted` `#585D62` for 12px captions |
| `--red` (danger) | `#B42318` | Errors, negative numbers, destructive actions (separate from brand red) |

- **Radius:** `--radius-sm` 6px controls and buttons, `--radius` 8px cards, tables, drawers, dialogs, `--radius-pill` badges and chips.
- **Buttons:** primary = filled red, white text; secondary = graphite outline on white; quiet unchanged; `btn-danger` = outlined `#B42318`; only the final confirm in a danger `ConfirmDialog` is solid `#B42318`. Red never fills table rows or backgrounds except the existing tinted danger states.
- **Gold rules:** focus ring (3px gold + 1px graphite line), active tab underline, selected chip/row tint, `premium` StatusBadge tone (Crown icon), in-progress status. Never red and gold in one control.
- **Active nav:** warm-white pill with a 4px red marker on the inline-start edge (logical, mirrors in RTL); mobile bottom nav shows a red top bar on the active item.
- **Logo placements:** `shared/brand/BrandMark` (`lockup` reversed in the 250px sidebar, `mark` in the 64px rail and mobile top bar, `logo` on login and loading screens); favicon + apple-touch-icon in `index.html`; print `DocumentSheet` header uses the primary logo; Clerk `logoImageUrl` is the primary logo. Wordmark is artwork only, never typed.
- **Fonts:** IBM Plex Sans and IBM Plex Sans Arabic self-hosted WOFF2 in `apps/web/public/fonts/` (400/500/600/700, `font-display: swap`, unicode-range split, SIL OFL in `OFL.txt`), `@font-face` in `shared/styles/fonts.css`, two preloads in `index.html`. Money and KPI use tabular numerals.
- **Contrast:** `shared/brand/brand-contrast.test.ts` asserts AA for the brand pairs and that tokens.css has no teal values.
