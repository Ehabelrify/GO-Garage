# GO Stores brand identity: application plan

**Date:** 22 November 2026. **Author:** Claude (decisions delegated by the user: "make good decisions, I trust you").
**Inputs:** Codex branch `codex/brand-identity` (`docs/product/go-stores-brand-identity-2026-11-22/` and `docs/product/go-stores-visual-suite-2026-11-22/`),
the current design system ([UI_PATTERNS](../../product/UI_PATTERNS.md), `apps/web/src/shared/styles/tokens.css`), and the
[visual review](../../testing/visual/2026-11-21/VISUAL_REVIEW_REPORT.md).
**Status:** plan approved by delegation; implementation is its own work package ("brand shell"), kept separate from feature work.

## 1. Facts about the identity (from Codex's kit)
- Logo: red "GO" with a turbine mark, bold italic "STORES" wordmark; variants: primary, reversed, mono dark/light, compact mark,
  app icon, favicon, premium lockup (crown for premium campaigns only). SVG masters + transparent PNGs.
- Palette: Graphite `#17191D`, Warm White `#F6F4EF`, White `#FFFFFF`, Performance Red `#C82127`, Deep Red `#98171B`,
  Yellow-Gold `#F3B61F`, Bronze Gold `#A86F00`, Brushed Silver `#B9BEC4`, Warm Gray line `#D6D4CF`, Neutral muted `#676B70`.
  Semantic tones are independent of the brand: info `#2D6FA3`, success `#2D7A4F`, warning `#9A6700`, danger `#B42318`.
- **Caveat:** the logo is a concept traced from social references. Maher (brand owner) must approve it and original vector files
  should replace it. So: keep the asset paths stable and name the files so a swap is a drop-in replacement.

## 2. Decisions
| # | Decision | Reason |
|---|---|---|
| D1 | **Red is the brand; gold is the accent.** Red: logo, active-navigation marker, the primary button, key links. Gold: selection, focus detail, premium markers (lifetime warranty, Ultimate/Plus+ packages), attention highlights. Never use red and gold in the same control. | The user asked for an accent balance between red and gold; one dominant colour keeps the interface calm, and gold stays rare so it keeps meaning. |
| D2 | **Red is not the danger colour.** Primary actions: filled Performance Red `#C82127`, hover Deep Red `#98171B`. Destructive actions: outlined, deep crimson text on white with a trash/warning icon and always a ConfirmDialog; only the final confirm button in a danger dialog is solid, in the existing danger tone `#B42318` (darker and bluer than the brand red), with a different icon. Errors and negative numbers stay `#B42318`. | Red primary buttons would otherwise look like warnings; separating by shade, shape (outline vs fill), icon and the dialog step keeps the meaning clear. |
| D3 | **Sidebar becomes Graphite** `#17191D` (soft `#2A2E33` for hover), active item = Warm White pill with a 3 px red marker on the inline-start edge (mirrors in RTL). Replaces the teal. Mobile bottom nav and the 64 px rail follow. Radius: controls 6 px, cards/drawers 8 px, badges pill (replaces the 2 px squared look, per 2b). | The brand's foundation colours are graphite and warm white; the teal belongs to the old identity. |
| D4 | **App canvas Warm White `#F6F4EF`, cards White**, lines Warm Gray `#D6D4CF`. Replaces the cool green-grey page background. | Matches the brand sheet and prints consistently. |
| D5 | **Text colours:** ink stays near-black graphite (`#17191D`); muted `#676B70` is the brand value but fails AA at 12 px on warm white, so keep our AA-tuned muted (`#52646a`, retuned to a neutral `#585d62`) for small text. Red text smaller than 18 px uses Deep Red `#98171B` (AA on white); gold is never used as text on white, only Bronze Gold `#A86F00` for gold text/borders. | Contrast was a top review finding (about 70 pages); the brand must not undo that work. |
| D6 | **Focus ring** is gold: `3px solid rgba(243,182,31,.55)` plus a 1px graphite inner outline, so focus is visible on white, warm white and graphite. | Gold detail is exactly what the brand sheet assigns it; gives a distinctive accessible focus state. |
| D7 | **Selection / "premium" markers:** selected row/tab underline and filter chip in gold; premium StatusBadge tone (new `premium` tone) in gold-tint with Bronze Gold text for lifetime and top packages. | Gives gold a consistent, limited job. |
| D8 | **Type:** keep IBM Plex Sans / Plex Sans Arabic for UI (mixed-script reliability). The wordmark is artwork (SVG), never typed in a font. | Matches Codex's recommendation and keeps Arabic quality. |
| D9 | **Logo placements (revised after the boards, see 2b):** sidebar header = the full GO STORES lockup (fits 250 px; the boards show it); 64 px rail and mobile top bar = compact mark only; login page = primary logo above the title; browser favicon + PWA/app icon from the kit; print `DocumentSheet` header logo slot = primary logo (reversed variant never in print); Clerk sign-in `logoImageUrl` = primary logo. Product name stays "Garage OS", the business is "GO Stores". | Prevents the nav from needing a re-layout while still showing the identity everywhere. |
| D10 | **Dark/other modes:** not introduced (out of scope). | Avoid scope creep. |
| D11 | **Status tones unchanged** except `premium` is added and the teal-based "info/neutral selected" accents switch to graphite/gold. | Keep semantic meaning stable across the app. |

## 2b. Comparison with Codex's reference boards (checked 22 Nov 2026, boards 01, 02, 03, 06, 07)
Reviewed `visuals/01-brand-system.png`, `02-owner-overview`, `03-reception-inbox-booking`, `06-commercial-quotes-offers`,
`07-warranty-aftercare` and `brand-sheet.png`. They are generated concepts: use them for direction, not pixels.

**Confirmed by the boards (plan stays):** graphite sidebar with a warm-white active item and a red marker on the active edge
(board 02 shows exactly the red inline-start marker, and a red-edged "Needs attention" tile); warm-white page canvas with white
cards; filled red primary buttons ("Create Job", "Create quote", "Confirm booking"); outlined secondary buttons; the compact
mark in the sidebar header; gold used for status/attention (In Progress badge, selected states, premium badge); danger/overdue in
a separate red tint style; mobile bottom nav with the red active item; the premium crown lockup only on a campaign banner.

**Differences found, and my decisions**
| Board shows | Plan said | Decision |
|---|---|---|
| Full "GO STORES" wordmark at the top of the sidebar (about 175 px wide) | Compact mark only | **Adopt the full lockup in the 250 px sidebar** (it fits, and it is the most recognisable placement); mark-only in the 64 px rail and the mobile top bar. Keep "Garage OS" as the product name in the page title/browser tab, not under the logo. |
| Active nav item uses a warm-white pill **with a red left edge** | Warm-white pill + 3 px red marker | Same, confirmed. Make the marker 4 px and full pill height. |
| Gold used for the "In Progress" status fill and the selected language toggle outline | Gold = selection/focus/premium only | **Extend gold to "in progress / selected" status tints** (gold-tint background, bronze text); the `premium` tone stays separate with a thin gold border and crown icon only for top-tier packages. |
| Board 07 shows a **green** "Issue coverage" primary button and the green tab underline | Red primary everywhere | Keep one primary colour: red. Green is reserved for success states (Completed, Active, Accepted). Do not copy the green button. Board 06 shows red outlined "Review"-style buttons for destructive-looking actions, which contradicts D2; follow D2. |
| Red is also used for the "Reserve now", "Redeem" and "Schedule installation" call-to-action buttons | Primary = filled red | Consistent with D2 (filled red is primary). The duplicate-redemption warning box uses a red tint: keep it as the danger tone `#B42318`, not brand red. |
| Rounded corners of about 6-10 px on cards and buttons, soft shadows | `--radius: 2px` today | **Raise the radius to 6 px (controls) and 8 px (cards/drawers)**, 999 px for badges/chips. The current 2 px squared look is what the user flagged as "not compatible"; the boards are consistently rounded. Add `--radius-sm 6px`, `--radius 8px`, `--radius-pill`. |
| Metric tiles: big bold number, small grey label, sometimes an icon in a tinted circle | Existing KPI tiles | Keep our `Amount` KPI tiles; add the optional tinted icon circle as an enhancement, not a requirement. |
| Mixed EN/AR labels stacked on two lines in many controls | UI is single-language by locale | **Do not copy bilingual stacked labels** (they are a presentation device in the boards and would clutter every control). |

**Typography (the user asked to update the font if it is clear). Findings**
- Board 01 shows "Typography (EN / AR): English (primary) = **Agency Square**; Arabic (companion) = a geometric Arabic display face".
  That is an AI-generated sample, and it contradicts Codex's own written brand guide (README and USAGE_GUIDE: UI Latin =
  **IBM Plex Sans**, UI Arabic = **IBM Plex Sans Arabic**, wordmark = outlined artwork, "Do not substitute an aggressive Latin
  display font for Arabic interface text"). The board's own app panels (sidebar, tables, buttons) are set in a clean grotesque, not
  a squared display face. "Agency Square" is not a standard licensed web font and has no Arabic companion.
- **Decision: the font is NOT clear, so the UI font stays IBM Plex Sans + IBM Plex Sans Arabic** (matches the written guide,
  has full Arabic support and tabular numerals). The italic squared look in "STORES" is logo artwork (outlined SVG), never typed text.
- **Real defect found while checking:** the app declares IBM Plex but **never loads it** (no `@font-face`, no `<link>`, nothing in
  `public/` or `node_modules`). Every user sees the system fallback (Segoe UI/Arial on Windows, which also changes Arabic shapes and
  digit widths). This is a hidden cause of the "font sizes not in sync" feeling. **Fix in the brand shell:** self-host the two
  families (WOFF2 subsets: Latin + Arabic, weights 400/500/600/700, `font-display: swap`, `unicode-range` split) under
  `apps/web/public/fonts/` with `@font-face` in `shared/styles/base.css`, preload the two most-used files in `index.html`, and
  enable tabular numerals (`font-variant-numeric: tabular-nums`) on money/KPI. Font files are SIL OFL: add the licence text next to them.
  (Needs the font files: download from the IBM Plex GitHub releases or `@fontsource/ibm-plex-sans(-arabic)`; adding the npm
  packages is a new dependency, so prefer copying the WOFF2 files into `public/fonts/` and ask the user if a package is preferred.)
- Optional later: if the owner wants a display face for headings only, test **Rajdhani** (Latin + Devanagari, no Arabic) or
  **Saira Semi Condensed** for H1/KPI Latin text with Plex Arabic as the Arabic fallback: only after Maher approves; not in this package.

**Contrast check of the palette (computed with WCAG formula, 22 Nov 2026)**
| Pair | Ratio | Verdict |
|---|---|---|
| Red `#C82127` text on white / warm white | 5.67 / 5.16 | AA for all text sizes; so red text is fine, Deep Red is only needed for hover/pressed |
| White on red button / on Deep Red hover | 5.67 / 8.49 | AA / AAA |
| Gold `#F3B61F` on white / warm white | 1.82 / 1.66 | **Fails**: gold is never text or a thin line on light surfaces; use it as a fill with graphite text (9.66:1), or a 2-4 px bar next to text |
| Bronze Gold `#A86F00` on white / warm white | 4.25 / 3.87 | Fails AA for small text: **use `#8A5A00` (5.93:1) for gold text**, and `#7A4F0E` on the gold tint (6.49:1) |
| Brand muted `#676B70` on white / warm white | 5.37 / 4.88 | AA: **the brand muted can be used as is** (the earlier plan note to keep a darker grey is dropped; keep `#585D62` only for 12 px captions) |
| Red marker/icon on graphite | 3.10 | OK for the 4 px marker and 20 px icons (UI 3:1); never red text on graphite |
| Warm white / silver on graphite | 16.0 / 9.4 | AAA |
| Danger `#B42318` on white | 6.57 | AA |
Updates to the decisions: D5 (use `#8A5A00` for gold text, brand muted is acceptable) and D6 (the focus ring is a 3 px gold ring
**plus** a 1 px graphite inner line so it is visible on white; gold alone would be 1.8:1 and fail).

## 3. Token map (shared/styles/tokens.css is the single place)
Add (brand tokens), keep semantic tokens separate:
```
--brand-graphite #17191D; --brand-graphite-soft #2A2E33; --brand-warm-white #F6F4EF; --brand-surface #FFFFFF;
--brand-red #C82127; --brand-red-dark #98171B; --brand-gold #F3B61F; --brand-gold-dark #A86F00;
--brand-silver #B9BEC4; --brand-line #D6D4CF;
```
Re-point existing semantic tokens (so feature CSS needs no edits): `--teal` -> `--brand-red`, `--teal-dark` -> `--brand-red-dark`,
`--teal-soft` -> a red tint `#FBEDEE`, `--sidebar` -> graphite, `--paper`/page background -> warm white/white, `--line` -> brand line,
`--focus-ring` -> gold. Rename-free: keep the token names the code uses (`--teal` etc.) pointing at brand values for this
package, and open a follow-up to rename `--teal*` to `--accent*` once everything is verified (names are internal).
Hard-coded colours found in shared CSS (`#153e3d`, `#d9ebe5`, `#c9dfd6`, `#21545a`, `#c8e0da`, teal rgba focus) must be replaced
by tokens in the same package. Feature CSS must not hard-code teal/green hex values (grep check; list leftovers).

## 4. Work package "Brand shell" (one agent, serial, owns the shared files)
Owns: `apps/web/src/shared/styles/*`, `apps/web/public/*` (favicon, logo, app icons, fonts), `apps/web/index.html`,
`apps/web/src/app/App.tsx` (brand block + loading screen), `apps/web/src/app/AuthApp.tsx` + `login.css` (logo/title/colours),
`apps/web/src/shared/print/*` (logo slot), new `apps/web/src/shared/brand/*` (a `BrandMark` component, asset imports),
`docs/product/DESIGN_SYSTEM.md` and `docs/product/UI_PATTERNS.md` (brand section). Does not touch feature folders except to remove
hard-coded teal hex values (list them first).
0. **Fonts (first):** self-host IBM Plex Sans and IBM Plex Sans Arabic (WOFF2, weights 400/500/600/700, `font-display: swap`) in `apps/web/public/fonts/` with `@font-face` in `base.css`, preload in `index.html`, licence file, tabular numerals on money/KPI. Currently the fonts are declared but never loaded.
1. Copy the needed assets from the Codex folders into `apps/web/public/brand/` (logo-primary, logo-reversed, mark-primary, app-icon,
   favicon) and wire `index.html` (favicon svg + png, apple-touch-icon, theme-color graphite).
2. Add brand tokens, re-point semantic tokens, add `premium` tone and the gold focus ring, replace hard-coded teal/green values.
3. `BrandMark` component (mark only at rail width, mark + name in the sidebar, logo on login), replace the wrench icon and
   "Garage OS / GO STORES · EGYPT" lockup; update the loading and auth-loading screens.
4. Buttons: primary = red; secondary = graphite outline; quiet; danger rules from D2; verify `.btn-primary`, `.btn-danger*`, links,
   tabs (active underline), filter chips, badges, table header/hover, toasts, drawers.
5. Print: logo slot in `DocumentSheet` (primary logo, business name "GO Stores"), keep monochrome-safe (red prints fine; hairlines graphite).
6. Contrast verification script/test: compute WCAG ratios for the token pairs (text/bg, red text, gold text, focus) and fail below
   4.5:1 (3:1 for large text/UI), as a unit test over tokens.css values.
7. Docs: brand section in DESIGN_SYSTEM.md, UI_PATTERNS.md, a "brand assets" README in `apps/web/public/brand/` stating the
   concept/approval status, and tracker entries (next free ID).
Acceptance: no teal hex left in shared styles; sidebar graphite with red marker in EN/AR; login shows the logo; favicon and
title updated; AA contrast test passes; typecheck, tests and build pass; manual Visual checks planned for next run.

## 5. Verification (after implementation; the user runs it)
- Visual checks run: owner at 360/768/1280 en/ar for Overview, Bookings, Quotes (Promotions tab: gold markers), Customers,
  Finance, Settings, Login; check: red primary buttons not mistaken for danger, destructive dialogs, focus ring visible on
  graphite and white, premium badges, print preview of a quote/invoice/warranty card with the logo.
- Compare against the Codex boards (`docs/product/go-stores-visual-suite-2026-11-22/visuals/01-brand-system.png` and 02..09) as
  intent, not pixels.

## 6. Risks and open items for the user
- Logo approval by Maher and replacement with original vector files.
- Red as the primary colour on data-dense pages can feel loud: keep red to buttons, the active marker and links; keep tables neutral.
- The Codex boards were generated against `8b79b75`; they predate the Wave 4 UI. Treat as direction only.
- Rename `--teal*` tokens later; do not do it inside the brand shell.
