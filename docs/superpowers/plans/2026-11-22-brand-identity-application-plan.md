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
| D3 | **Sidebar becomes Graphite** `#17191D` (soft `#2A2E33` for hover), active item = Warm White pill with a 3 px red marker on the inline-start edge (mirrors in RTL). Replaces the teal. Mobile bottom nav and the 64 px rail follow. | The brand's foundation colours are graphite and warm white; the teal belongs to the old identity. |
| D4 | **App canvas Warm White `#F6F4EF`, cards White**, lines Warm Gray `#D6D4CF`. Replaces the cool green-grey page background. | Matches the brand sheet and prints consistently. |
| D5 | **Text colours:** ink stays near-black graphite (`#17191D`); muted `#676B70` is the brand value but fails AA at 12 px on warm white, so keep our AA-tuned muted (`#52646a`, retuned to a neutral `#585d62`) for small text. Red text smaller than 18 px uses Deep Red `#98171B` (AA on white); gold is never used as text on white, only Bronze Gold `#A86F00` for gold text/borders. | Contrast was a top review finding (about 70 pages); the brand must not undo that work. |
| D6 | **Focus ring** is gold: `3px solid rgba(243,182,31,.55)` plus a 1px graphite inner outline, so focus is visible on white, warm white and graphite. | Gold detail is exactly what the brand sheet assigns it; gives a distinctive accessible focus state. |
| D7 | **Selection / "premium" markers:** selected row/tab underline and filter chip in gold; premium StatusBadge tone (new `premium` tone) in gold-tint with Bronze Gold text for lifetime and top packages. | Gives gold a consistent, limited job. |
| D8 | **Type:** keep IBM Plex Sans / Plex Sans Arabic for UI (mixed-script reliability). The wordmark is artwork (SVG), never typed in a font. | Matches Codex's recommendation and keeps Arabic quality. |
| D9 | **Logo placements:** sidebar header = compact mark + "Garage OS" product name (not the full wordmark, which is too wide for 250 px and a 64 px rail shows the mark only); login page = primary logo above the title; browser favicon + PWA/app icon from the kit; print `DocumentSheet` header logo slot = primary logo (reversed variant never in print); Clerk sign-in `logoImageUrl` = primary logo. Product name stays "Garage OS", the business is "GO Stores". | Prevents the nav from needing a re-layout while still showing the identity everywhere. |
| D10 | **Dark/other modes:** not introduced (out of scope). | Avoid scope creep. |
| D11 | **Status tones unchanged** except `premium` is added and the teal-based "info/neutral selected" accents switch to graphite/gold. | Keep semantic meaning stable across the app. |

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
Owns: `apps/web/src/shared/styles/*`, `apps/web/public/*` (favicon, logo, app icons), `apps/web/index.html`,
`apps/web/src/app/App.tsx` (brand block + loading screen), `apps/web/src/app/AuthApp.tsx` + `login.css` (logo/title/colours),
`apps/web/src/shared/print/*` (logo slot), new `apps/web/src/shared/brand/*` (a `BrandMark` component, asset imports),
`docs/product/DESIGN_SYSTEM.md` and `docs/product/UI_PATTERNS.md` (brand section). Does not touch feature folders except to remove
hard-coded teal hex values (list them first).
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
