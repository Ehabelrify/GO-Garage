# UI patterns (living showcase)

Shared client patterns owned by W2-0. Import from `apps/web/src/shared/components` (barrel `index.ts`). Feature code must not add parallel versions; request variants in `shared/`. All CSS uses logical properties, is RTL-safe, and works at 360 / 768 / 1280 px. Styles live in `shared/styles/{tokens,base,layout,components,legacy}.css` (imported by `shared/styles.css`). `legacy.css` holds vocabularies of un-migrated pages; delete rules as modules migrate.

Page recipe: `PageHeader` (title + optional one-line subtitle) + `FilterBar` + `DataTable` (+ `DetailDrawer` for detail/forms), at most one `Notice`. Every list: loading skeleton, empty state with next action, error with Retry, no-results with Clear filters. No raw ids, enums, JSON or minor units in the UI.

| Component | Props (key ones) | Use when |
|---|---|---|
| `PageHeader` | `title`, `eyebrow?`, `subtitle?`, `meta?`, `actions?` | Top of every page. Legacy `PageHeading` (ui.tsx) wraps it with optional eyebrow/subtitle. |
| `FilterBar` | `lang`, `search?{value,onChange,placeholder}`, `filters?` (max 3 `{key,label,value,options,onChange,allValue?}`), `onClear?`, `resultCount?`, `children?` | Above a list. "Clear filters" appears only when active; count is `aria-live`. |
| `DataTable<Row>` | `columns[{key,header,render,sortable?,sortValue?,numeric?,mono?,primary?,hideOnCard?}]`, `rows`, `rowKey`, `lang`, `caption`, `onRowClick?`, `selectedKey?`, `loading?`, `error?`, `onRetry?`, `empty?`, `initialSort?`, `cards?`, `maxHeight?` | Any record list. Sort sets `aria-sort`; rows are keyboard-activatable; under 760px it renders stacked cards (no horizontal scroll). Pass `<EmptyState>` as `empty`. |
| `FormSection`, `Field`, `RequiredNote` | `FormSection{title,description?,columns?}`; `Field{label,required?,hint?,error?,full?,children: one control}` | Forms. `Field` injects `id`, `aria-describedby`, `aria-invalid`, `required` into its single child. 2-column grid, 1 under 760px. Show one `RequiredNote` per form. |
| `DetailDrawer` | `open`, `onClose`, `title`, `subtitle?`, `lang`, `footer?`, `onBack?`, `wide?` | Detail view, create/edit form, reschedule, record preview. Inline-end panel, full screen on mobile; focus trap, Esc, backdrop close, focus restored. For deep links pair with `useUrlState("record", "")`. |
| `Collapsible`, `Accordion` | `Collapsible{title,count?,defaultOpen?|open+onToggle}`; `Accordion{sections[{id,title,count?,content}],lang,defaultOpenIds?}` | Customer 360 / Vehicle sections, long policy editors. Accordion has expand/collapse all. |
| `TabBar`, `TabPanel` | `TabBar{tabs[{id,label,count?,hidden?}],value,onChange,ariaLabel,idPrefix?}` | In-page tabs. Arrow/Home/End keys (mirrored in RTL). Sync with `useUrlState("tab", "first")`. |
| `StatusBadge` | `status`, `lang`, `domain?`, `label?` | Every status. Registry domains: booking, job, quote, reservation, benefit, transport, warranty, claim, policy, decision, staff, message, invoice. EN + AR (MSA) labels, five tones. Legacy `Status` maps to it. Add new states in `statusRegistry`, never new CSS badges. |
| `EmptyState`, `Skeleton` | `EmptyState{title,text?,variant?: no-data/no-results/error,icon?,action?}`; `Skeleton{rows?,label?}` | Empty/no-results (action = Clear filters), error (action = Retry), loading. |
| `Notice` | `tone?: info/warning`, children | One compact notice per page. Hide controls instead of explaining restrictions. |
| `ConfirmDialog` | `open,title,body?,lang,danger?,confirmLabel?,cancelLabel?,onConfirm,onCancel,confirmDisabled?,disabledReason?,busy?,children?` | Required for cancel / no-show / void / revoke / retire. `danger` focuses Cancel first. Put reason/evidence inputs in `children`. The app-level `ModalConfig` now renders through it. |
| `Money` | `minor`, `currency?="EGP"`, `lang` | Any price. Takes minor units, prints "EGP 1,250". Helpers: `formatMoney`, `minorToMajor`, `majorToMinor` (for major-unit inputs). |
| `RecordProvider`, `RecordRef`, `RecordRefList` | `RecordProvider{lang,registry}`; `RecordRef{type,id,label?,subtitle?,badge?,mode?: preview/link,hideIcon?}` | Any mention of customer, vehicle (plate), booking, job, quote, reservation, warranty, claim, invoice or conversation. Renders icon + human label (never the id; falls back to the type name). Click opens a shared drawer with back stack and "Open full page". `mode="link"` navigates directly. |
| `GlobalSearch` | `lang`, `onNavigate(route)`, `fetcher?`, `debounceMs?`, `minLength?` | Mounted in the topbar. `/` (outside inputs) and Ctrl/Cmd+K focus it; 250 ms debounce; results grouped by type; arrow/Enter/Esc. Default fetcher is `fetchSearch`. |
| `DocumentSheet`, `PrintButton` | `DocumentSheet{model: DocumentModel, className?}`; `PrintButton{lang,label?,disabled?}`; `PrintHost{model}` | Any printable business document (invoice, quote). Generic A4 template: header (business, title, number, status stamp), branch / issue date / valid-until, customer + vehicle (plate), line table (description, qty, unit, discount, tax, amount), totals per currency (never mixed), notes/terms, disclaimer, signatures/footer. `dir` follows `model.lang`; logical CSS; `@media print` hides app chrome and prints only `.doc-print-root` on A4. `PrintHost` portals a screen-hidden copy of the sheet to `document.body`; `PrintButton` sets `body.printing-document` and calls `window.print()` (choose Save as PDF), so only the host prints (scoped; the warranty QR print path is untouched). Files: `shared/print/{DocumentSheet.tsx,document-model.ts,print.css}`. |

## Wave 4 design system (WP0, 22 Nov 2026)

### Type scale (tokens in `shared/styles/tokens.css`; never write a raw `font-size` in feature CSS)

| Token | Desktop / tablet / phone | Use |
|---|---|---|
| `--fs-display` | 28 / 26 / 22 px, 1.15 | Page title (H1) only |
| `--fs-kpi` | 24 / 22 / 20 px, 1.1, tabular | KPI numbers (use `.stat-value` or `clamp(18px, 1.9vw, var(--fs-kpi))`) |
| `--fs-h2` | 18 / 18 / 17 px | Panel, section and drawer titles |
| `--fs-h3` | 15 px | Card titles, form section titles, table primary cell |
| `--fs-body` | 14 px | Table cells, controls, buttons |
| `--fs-label` | 12 px, 600 | Table headers, field labels, badges, meta |
| `--fs-caption` | 12 px | Hints, timestamps (never below 12) |
| `--fs-nav` | 11 px | Phone bottom-nav label only |

Line heights: `--lh-display/kpi/heading/body`, Arabic body uses `--lh-ar` (1.65). Controls: `--control-h` 40 px (44 px on phones), `--control-h-sm` 32, `--control-h-lg` 48. AA colours: `--muted` #52646a, `--tone-neutral-fg` #44575a, `--tone-warning-fg` #7a4f0e, `--nav-fg`, `--banner-fg`, `--fg-placeholder`. `shared/design-system.test.ts` fails if shared CSS adds a raw `font-size` below 12px (run by `npm test`).

### Numbers (numeric rule)

- Money goes through `Amount` (or the `Money` wrapper): tabular lining numbers, `bdi dir="ltr"`, nowrap, real minus sign (U+2212) before the number, Latin digits in both locales.
- `variant="kpi"`: whole EGP; from 100,000 up compact (`EGP 11.8M`, `EGP 293K`) with the full value in `title` and `aria-label`. `variant="table"` (default) and `"detail"`: always 2 decimals, right-aligned, min 9ch, never mixed in a column.
- Viewer option "Show full precision" (avatar menu, `useFullPrecision()` in `shared/preferences.ts`, saved in this browser only) shows exact fractions everywhere and disables compaction.
- `Delta` (`value`, `unit` percent|number|minor, `inverse` for liabilities and costs): sign + number + unit in one LTR isolate, arrow icon plus semantic colour.
- `Plate` (`value`): one chip via `formatPlateDisplay`, Latin digits, isolate with `dir` by script. `Phone` (`value`, `link`, `whatsapp`): LTR isolate, `+20 122 000 1046`. `DateText` (`value`, `lang`, `time?`): `dateLabel`, Latin digits, isolate. `Select` (`options`, `label`): styled native select, one chevron, width by content (max 240px).
- KPI tiles: container `min-width: 0; overflow: hidden`; never concatenate plate, phone, date or amount into one string.

### Lists and paging

`DataTable` pages by default: 25 rows, selectable 25/50/100, footer "Showing 1-25 of N" with previous/next buttons (keyboard accessible, `aria-live` range), sticky header. Props: `paging` (default true), `pageSize`, `pageSizes`. The pager appears only when rows exceed the smallest size. Below about 1000px the table becomes compact cards (title line + wrapped meta line); the wrapper has `min-width: 0` so a table never widens the page. Use `white-space: nowrap` for buttons and badges in cells. Overview "Needs attention" is a feature concern (top 10 grouped by type, View all).

### Shell: topbar and rail

Single-row topbar: branch select, global search, avatar menu (name, email, role, language switch, Show full precision, Sign out; the only Sign out). `Role preview account` is one thin banner above the topbar. Full sidebar above 1024px, icon-only rail (64px) at 1024px and below, bottom navigation at 760px and below (short labels via `shortEn`/`shortAr`, 11px). `PageHeader` slot contract: title, subtitle, meta on the start side, actions on the end side (one primary), `tabs` (or a `TabBar`) directly under. `TabBar` fades the scrolling edge and scrolls the active tab into view. `FilterBar` is one grid row (search, up to 3 selects, Clear and count at the end; extra controls in a second row). `StatusBadge` carries a tone icon. `EmptyState` shows an icon, one-sentence reason and action. `RouteChunk` shows `RouteSkeleton` while a page loads and an error with Retry after 10 s.

## Registering record types (features)

The shell mounts `<RecordProvider lang={lang}>` around the page. Features register how to label, route and preview their record type by passing a `registry` (`{ customer: { label: id => name, route: id => path, preview: (record, lang) => <Preview/> } }`). Until a feature registers, `defaultRecordRoutes` (shared/record-types.ts) and a minimal preview are used. TODO W2-11: build the registry in `App.tsx` from store data and each feature's preview component.

## Server contracts consumed (shared/search.ts)

- `GET /api/search?q=&types=` returns `{results:[{type,id,title,subtitle,badge?,route}]}`. Malformed items and non-relative routes are dropped.
- `GET /api/customers/:id/360`, `GET /api/vehicles/:id/360` via `fetchRecord360(kind,id)`; tolerant parser `normalise360` accepts `{sections:[{type,items}]}` or top-level arrays keyed by record kind.
- `GET /api/warranties/resolve?code=` via `resolveWarrantyCode(code)` returns `{warranty,vehicle,customer}` links.
- 404 and empty bodies resolve to empty results/`null`; other failures throw so the UI shows an error state.

## Navigation (app/navigation.ts)

Owner 10 items, branch manager 8 (with Finance), receptionist 5, technician 1; Quotes & offers shows for `quotes.view` or `quotes.manage`; sidebar and mobile bar render from the same list (bottom bar shows up to 4 plus More when more than 5). Merged pages (`reservations`, `benefits`, `promotions` into Quotes & offers; `transport` into Bookings; `staff` into Settings) are `routeAliases`: hidden from the menu, old URLs still work, shown as a temporary tab strip under the parent via `sectionPagesFor`. TODO W2-11 map is in the header comment of `navigation.ts`; add an alias to `redirectedAliases` once its merged tab exists.

## Not yet built (deferred)

Pickers (`CustomerVehiclePicker`, `QuotePicker`, `PolicyPicker`) and the Customer/Vehicle 360 views belong to the module tasks (W2-3, W2-5, W2-8).

## Printable documents (shared/print)

`DocumentModel` is a pure, template-neutral type: `lang`, `business{name,subtitle?,logoUrl?}`, `title`, `number|null`, `statusLabel?`, `branch`, `issueDate|null`, `validUntil?`, `customer{label,name,lines?}`, `vehicle?{label,plate,description?}`, `lines[{description,detail?,quantity,unitMinor|null,discountMinor?,taxMinor?,amountMinor|null,currency}]`, `totals[{currency,subtotalMinor,discountMinor,taxMinor,totalMinor,paidMinor?,balanceMinor?}]` (one entry per currency), `notes?`, `terms?`, `disclaimer?`, `signatures?`, `footer?`. All amounts are minor units. Callers build the model (rules stay in their module); when the owner's confirmed template arrives, replace `DocumentSheet`/`print.css` and keep the model. The business name and logo are placeholders until the owner supplies them.
