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

## Registering record types (features)

The shell mounts `<RecordProvider lang={lang}>` around the page. Features register how to label, route and preview their record type by passing a `registry` (`{ customer: { label: id => name, route: id => path, preview: (record, lang) => <Preview/> } }`). Until a feature registers, `defaultRecordRoutes` (shared/record-types.ts) and a minimal preview are used. TODO W2-11: build the registry in `App.tsx` from store data and each feature's preview component.

## Server contracts consumed (shared/search.ts)

- `GET /api/search?q=&types=` returns `{results:[{type,id,title,subtitle,badge?,route}]}`. Malformed items and non-relative routes are dropped.
- `GET /api/customers/:id/360`, `GET /api/vehicles/:id/360` via `fetchRecord360(kind,id)`; tolerant parser `normalise360` accepts `{sections:[{type,items}]}` or top-level arrays keyed by record kind.
- `GET /api/warranties/resolve?code=` via `resolveWarrantyCode(code)` returns `{warranty,vehicle,customer}` links.
- 404 and empty bodies resolve to empty results/`null`; other failures throw so the UI shows an error state.

## Navigation (app/navigation.ts)

Owner 10 items, branch manager 7, receptionist 5, technician 1; sidebar and mobile bar render from the same list (bottom bar shows up to 4 plus More when more than 5). Merged pages (`reservations`, `benefits`, `promotions` into Quotes & offers; `transport` into Bookings; `staff` into Settings) are `routeAliases`: hidden from the menu, old URLs still work, shown as a temporary tab strip under the parent via `sectionPagesFor`. TODO W2-11 map is in the header comment of `navigation.ts`; add an alias to `redirectedAliases` once its merged tab exists.

## Not yet built (deferred)

Pickers (`CustomerVehiclePicker`, `QuotePicker`, `PolicyPicker`) and the Customer/Vehicle 360 views belong to the module tasks (W2-3, W2-5, W2-8).
