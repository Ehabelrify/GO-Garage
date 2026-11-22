# Garage OS - Resume and handoff record

**Purpose:** if a session is cut off, any agent (Claude, Codex, Replit, Lovable) can read this file and continue where work
stopped. It records the user's standing instructions, decisions, the agreed sequence, what is done, what is running and what
is next. **Update it at every milestone** (it is cheap: edit the "Status board" and append to the "Activity log").
It complements, and never overrides, the root [AGENT_INSTRUCTIONS.md](../../AGENT_INSTRUCTIONS.md).

Last updated: 22 November 2026 (end of Wave 4 commits, Wave 5 not started).

## 1. How to resume (read in this order)
1. [AGENT_INSTRUCTIONS.md](../../AGENT_INSTRUCTIONS.md) (+ [apps](../../apps/AGENT_INSTRUCTIONS.md), [docs](../AGENT_INSTRUCTIONS.md) guides).
2. This file, sections 2-6.
3. The plan: [2026-11-21-hardening-access-ui-data-plan.md](../superpowers/plans/2026-11-21-hardening-access-ui-data-plan.md)
   (waves, decisions, agreed sequence) and the design [spec](../superpowers/specs/2026-11-21-production-hardening-and-access-design.md).
4. The visual review: [VISUAL_REVIEW_REPORT.md](../testing/visual/2026-11-21/VISUAL_REVIEW_REPORT.md) and its
   [README](../testing/visual/2026-11-21/README.md) (findings and their status).
5. [Phase 1 tracker](../testing/PHASE_1_ISSUES_TRACKER.md) (next free ID is in its header) and [MIGRATIONS](../engineering/MIGRATIONS.md).
6. `git log --oneline -30` and `git status` to see the real state; trust the repo over this file if they disagree, then fix this file.

## 2. Standing instructions from the user (always apply)
- **Do not break the other agents' instructions** (Replit, Codex, Claude, maybe Lovable all work here). Keep Replit control
  points: `.replit`, port 5000, `npm run dev`/`npm start`, the migrate/seed facades, `scripts/post-merge.sh`.
- **Git identity:** repo-local `Ehab Elrify <ehab.elrify@gmail.com>`; never the machine's global account. Commits end with
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. **Never push unless the user asks** (the user usually pushes
  with the VS Code Sync button). Do not push while an agent is mid-work.
- **No IBM tooling on this project:** the Vault Radar commit/push hooks are disabled for this repo only
  (`git config --local hook.ciso-vr.enabled false`, `hook.ciso-vr-prepush.enabled false`). Do not touch global/system git config.
  Never write literal bidi/zero-width/direction-control characters in source files (scanners flag them as Trojan Source);
  build them from code points, e.g. `String.fromCodePoint(0x2067)`.
- **Do not install anything on the user's machine.** Replit owns the database; there is **no database locally**, so nothing
  here has run against Postgres except what CI does. Never run migrations or seeds against a database without the user's say-so.
- **Production mindset, features unlocked in phases.** Demo layer is cleaned up, not the product's identity. Dummy data lives in
  the same database and is purged at go-live (`npm run db:purge:demo`, dry run by default).
- **Login:** Google sign-in only (Apple later), no sign-up, staff are invite-only (owner pre-approves a work email, role and
  branches). The login page also has the "Enter as a role" widget, which stays on the live app until go-live
  (`GARAGE_ROLE_WIDGET_ENABLED`). Magic-link invites come later.
- **Owner** has full add/modify/delete/archive. **Branch manager** has limited options; managers can SEE quotes, reservations,
  benefits and promotions but not add/edit/remove (`quotes.view` vs `quotes.manage`). The owner edits every user's
  permissions on the Staff page.
- **Everything interlinks:** from a customer, a plate or a warranty QR you can reach quotes, jobs, bookings, chats, warranties,
  purchases, special requests (Customer 360 / Vehicle 360). Smooth UX: side drawers, expand/collapse, no raw ids.
- **Currencies:** EGP, SAR, USD from one list (`packages/domain/src/currencies.ts`); never mix currencies in a total.
- **Money display:** whole EGP and compact (11.8M) on dashboards, 2 decimals in tables, plus a per-viewer "Show full precision".
- **Names** are shown exactly as entered, never translated; interface text follows the UI language. Arabic copy review is
  done by the user later (do not block on it).
- **Printable quotes and invoices:** generic template now (`DocumentSheet`), the confirmed template will be supplied later.
- **Visual checks workflow is manual-only.** After ANY UI change, remind the user to run it from the Actions tab and say which
  pages/roles changed. The user downloads the artifact (the local `gh` token is invalid; the user can put the zips in the
  repo root, which is git-ignored) and Claude reads the screenshots with the slicer helper (see section 7).
- Ask before anything hard to reverse or outward-facing. Report honestly: untested-without-database means untested.

## 3. Decisions recorded
| Topic | Decision |
|---|---|
| Owner app | Not separate: the owner is a role in the branch app with a cross-branch Overview. One codebase, one database. |
| Role widget | Real login page side widget; same database; cleared at go-live. Protection (passcode or read-only demo owner) NOT yet decided. |
| Capacity source of truth | The availability configuration (not Settings "decisions"). |
| Paging | Classic pages, default 25 (25/50/100), "Showing x-y of n". |
| Tablet | Icon-only sidebar rail at <=1024 px; tables become cards below ~1000 px. |
| Promotions | Tab is shown; dummy data from the confirmed facts GS-F021..F026 (advertised examples, not approved policy). |
| Receptionist quotes | Currently view-only (`quotes.view`). The user has not said whether receptionists should write quotes: ask. |
| Products (parts/accessories) | Wave 5 adds them as name/category/price/tax only. Stock tracking and inventory monitoring come with the customer app (Phase 5). |
| Unsaved WhatsApp number | Shows as `New contact (<phone>)` for receptionists/managers; linking/creating the customer attaches the conversation. |

## 4. Agreed sequence (user, 22 Nov 2026)
1. Seed agent finishes -> checks -> last Wave 4 commit.
2. **Wave 5 - quick-intake side panel** (walk-in or unsaved WhatsApp number: find/create customer, add vehicle, pick services,
   products or packages from one catalogue; finish as Create quote / Book / Save customer only). Needs migration `0033`
   (product kind in the catalogue, conversations without a linked customer).
3. **UX improvements:** reminders and follow-ups (simulated outbox), duplicate customer detection and merge, owner audit-log
   screen with CSV export and daily summary, saved filters/bulk actions/shortcuts, printable warranty card with QR,
   technician photos/notes/checklists/report issue.
4. User pushes -> user runs the manual **Visual checks** -> Claude reads the artifact and fixes what it shows.
5. User tests on **Replit with Maher** (migrations first, seed on a throwaway database) to settle things BEFORE the customer app.
6. Phase 5 customer mobile app simulation (needs its own design first): sign-up with Google/Apple, book appointments, browse
   products (no ordering), reserve with a deposit (no gateway), special requests to the owner, own vehicles/warranties/quotes;
   **plus stock tracking and inventory monitoring**.
Not scheduled yet (user has not chosen): role-widget protection, health check/monitoring/backups, content-security-policy,
owner two-factor, remaining role-based permission checks, large/dense file refactors, tracker summary header.

## 5. Status board (update me)
| Area | State |
|---|---|
| Wave 1-2.7 (hardening, access, modules, customer 360, special requests, invoices, plates, visual job) | Done, committed, pushed |
| Wave 4 (visual-review fixes: design system + 8 feature packages + server capabilities + seed) | **Done and committed locally** (8 commits ahead of origin, last `514c81c`); **not pushed** (user pushes; hold while agents are mid-work) |
| Seed agent (realism, promotions, technician jobs) | Done, committed (`514c81c`): 110 customers, 31 pending reviews, finance ~5.2M revenue / ~1.7M outstanding, technician has 9 open jobs, 6 promotion policies + rows |
| Wave 5 (quick intake) | **Done and committed locally** (`78c969a`, `7337966`, `7503195`): migration 0033 (product kind, unlinked WhatsApp contacts, intake_requests), GET /api/catalogue/intake-items, POST /api/intake, POST /api/whatsapp/conversations/:conversationId/link, panel in apps/web/src/features/intake, top-bar New button (and key N), WhatsApp 'New contact' banner. Tracker P1-063..P1-067. Quality gate: typecheck clean, 540 tests passed (3 skipped), build ok; untested against a DB and in a browser. 12 commits ahead of origin, not pushed. |
| UX improvements (6 packages) | **Done, committed and pushed** (22 Nov): reminders/follow-ups (0034), customer duplicate merge + undo (0035), owner audit log + CSV + daily summary (0036), technician notes/checklist/photos/issues (0037), printable warranty card, saved views + bulk actions + shortcuts + CSV export. Tracker P1-068..P1-078. Gate: typecheck clean, 659 tests passed (3 skipped), build ok. Nothing run against a DB or in a browser. |
| Codex brand branch | **Merged** into main (`e8db7b6`, no conflicts): docs/product/go-stores-brand-identity-2026-11-22/ and go-stores-visual-suite-2026-11-22/. **Not yet pushed.** |
| Brand shell implementation | **Implemented** (22 Nov, P1-079, uncommitted): fonts self-hosted, tokens, shell, logos, contrast test. Awaiting Visual checks and Maher's logo approval (logo is a concept). |
| UX improvements (section 4 item 3) | Not started |
| Visual checks rerun | Waiting for the user to push and trigger |
| Replit test with Maher | Waiting |
| Unapplied migrations (never run on any DB outside CI) | 0026-0030, 0032-0037 (0031 intentionally unused). CI's Postgres job applies them on every push: check the 'database-integration' job result in GitHub Actions. |
| Quality gate at last commit | typecheck clean, 489 tests passed (3 skipped), build ok; nothing browser- or DB-verified except the first visual run |

Open findings from the first visual run still open: axe colour-contrast (about 70 pages; tokens re-tuned in Wave 4, unverified),
Finance/Warranties print buttons (named 'Print' in Wave 4, unverified), screenshot timeouts on very long pages (paging should fix).

## 6. Working method (what has worked)
- Plan -> parallel agents with **disjoint file ownership** -> one shared-files agent first (design system) -> feature agents.
  Give every agent: the files it owns, the files it must not touch, verification commands, and "do not commit".
- After agents finish: run `npm run typecheck`, `npx vitest run`, `npm run build`; grep changed files for invisible
  bidi/zero-width characters; then commit in logical groups with the repo-local identity.
- The tracker (`docs/testing/PHASE_1_ISSUES_TRACKER.md`) gets an entry for each shipped change (next ID in its header).
- Use the right tools: Read/Edit/Grep; avoid shell loops with `sleep` (blocked); a commit/hook command can be refused by the
  permission classifier: keep commands simple and plain (`git add <paths>` then `git commit -m ...`).

## 7. Tools and where things are
- **Screenshot review:** artifact zips go in the repo root (git-ignored). Unzip outside the repo
  (`%LOCALAPPDATA%\Temp\visual-run-<id>\checks`). The slicer is a PowerShell script (`slice.ps1`, parameters `-Src -OutDir
  -SliceHeight -MaxSlices -StartY -Overview`) that cuts tall full-page PNGs into readable pieces; it lives in the temp folder, so
  recreate it if missing (about 40 lines using System.Drawing). Compact reference of the first run:
  `docs/testing/visual/2026-11-21/`.
- **Visual workflow:** `.github/workflows/visual.yml` (manual). It seeds a throwaway Postgres, boots the app with a Clerk stub
  defined in the page, signs in as the four demo roles and captures every page (en/ar x 360/768/1280) plus flows.
- **CI:** `.github/workflows/ci.yml` on every push: typecheck, tests, build, and a Postgres job that runs all migrations and
  the DB integration tests.
- **Demo lookups:** seeded customer Ahmed Mahmoud El-Shazly, plates `أ ب ج 1234` and `س م ر 5678` (see the visual README).

## 7b. Instructions given while the user is away (22 Nov 2026, user away for a few hours)
Standing order, in this sequence, no confirmation needed (the user said "I trust you"):
1. Let the UX improvements workflow finish (reminders, duplicate merge, audit log + CSV + daily summary, technician mode,
   warranty card, then saved filters/bulk actions/shortcuts). Run typecheck + tests + build; fix integration problems; commit
   in logical groups (repo-local identity).
2. **Push** to origin/main (the user allowed pushing on THIS repo only; if the permission rule is not active and a push is
   refused, leave the commits ready locally and say so; never force-push, never delete branches).
3. **Merge `origin/codex/brand-identity`** (Codex's brand identity kit + visual suite; both folders under docs/product/,
   conflict-free in a dry run). Keep its authorship; resolve nothing by overwriting our files.
4. **Write the brand application plan** (docs/superpowers/plans/2026-11-22-brand-identity-application-plan.md): decide the
   red / gold balance (user: "accent colors between performance red and premium gold yellow, make good decisions"), map brand
   tokens into the shared design system, logo/favicon/login/print, contrast checks, rollout and verification.
5. **Implement** the brand shell per that plan as its own work package (do not mix with feature work), commit, push.
6. Then stop and wait for the user: Visual checks run, Replit test with Maher.
Brand notes: the logo is a concept built by Codex from social references (needs Maher's approval and the original vector
files); keep red actions from reading as destructive; gold is attention/selection/premium only; keep IBM Plex for UI text.

### Cost rule (user, 22 Nov 2026)
Do NOT burn tokens/credits on testing and reviewing: keep verification minimal and basic. One integrated typecheck + vitest +
build per stage (not per package), no per-package review agents, no extra reviewer workflows. ONE general review at the very end
of the whole sequence. Keep all trackers, this handoff, docs and pointers updated at every step so another session can resume.

## 8. Activity log (newest first; append here)
- **22 Nov 2026 (brand shell pushed, CI finding):** brand shell committed and pushed (`72c921c`): self-hosted IBM Plex, brand tokens, graphite sidebar with red marker, premium tone, contrast test, tracker P1-079; `.btn` edge lightened to `--btn-border` (#8A8F95). The CI run for the UX push (`f7289ad`) PASSED typecheck/tests/build and applied migrations 0001-0037 on a real Postgres (the DB job got as far as the integration suites, so the new migrations apply cleanly), but the 'Run integration suites' step failed with one assertion in `commercial-migration-rehearsal` (bookings/jobs snapshot expected 3, got 1): a race with the other suites sharing the database. Fix applied in `.github/workflows/ci.yml`: `--no-file-parallelism`. Confirm on the next CI run; if it still fails, read the job log (the local `gh` cannot read logs: 403) via the Actions UI.
- **22 Nov 2026 (brand shell):** implemented per the brand plan (P1-079): IBM Plex self-hosted, brand tokens re-pointed, graphite sidebar with red marker, BrandMark logos, red primary / outlined danger buttons, gold focus and tabs, print logo, contrast test. Not committed. Next: Visual checks (all roles, en/ar, 360/768/1280, Login, Overview, Quotes > Promotions, Warranties, print preview) and Maher approval of the logo.
- **22 Nov 2026 (UX done, pushed, brand merged):** all six UX packages finished; one integrated check passed; 7 feature/doc commits pushed to origin/main (`f7289ad`). `origin/codex/brand-identity` merged locally (`e8db7b6`). Next: brand shell. Note: push worked unattended with the stored credentials (no sign-in window).
- **22 Nov 2026 (user away):** Plan comparison with Codex boards committed (`815c0bb`): fonts are declared (IBM Plex) but never
  loaded (fix in brand shell: self-host); Agency Square on board 01 contradicts Codex's own guide, so UI font unchanged; gold fails
  contrast on light surfaces (use fill + graphite text, bronze `#8A5A00` for gold text); radius moves to 6/8 px; full lockup in the
  sidebar. UX workflow running (3 of 5 packages reported, the sixth, lists/bulk/shortcuts, starts after). Local branch 15 commits
  ahead of origin. Push permission rules are in `.claude/settings.local.json` (git-ignored; allow add/commit/push, deny force/delete).
- **22 Nov 2026 (Wave 5 done):** Wave 5 server and web agents finished and were committed after an integrated check (the web calls match the server routes: intake-items, /api/intake, conversations/:id/link). Notes from the reports: a quote created by intake has no acceptance policy/tax treatment until the owner sets terms, so it cannot be offered yet; booking from intake books the chosen service but records chosen items only in `intake_requests`; an unsaved WhatsApp number goes to the channel's `default_branch_id` (set it per channel, else the first branch); product seed labels end in "- example price". UX improvements launched next.
- **22 Nov 2026 (later):** Seed realism agent finished and was committed (`514c81c`). Wave 5 launched as two parallel agents (server and web). Resume note: if Wave 5 files exist uncommitted in the working tree, check `git status`, run typecheck/tests/build, read the two agent reports in the workflow transcripts, then commit in logical groups. After Wave 5 come the UX improvements (section 4 item 3).
- **22 Nov 2026:** Visual review of all 234 screenshots by five reviewers -> consolidated report and work packages. Decisions
  taken (section 3). Wave 4 implemented in parallel: shared design system (WP0), server capabilities/consent/promotions (WP-S),
  seed realism (WP9), eight feature packages (WP1-WP8). Committed locally as 6 commits (`aac4e45`..`3aad6e6`). Quick-intake
  side panel designed and planned as Wave 5. Agreed sequence recorded. This handoff file created.
- **21-22 Nov 2026:** First Visual checks run: found the vehicle/customer 360 HTTP 500 (extra bind parameter), nested buttons in
  mobile cards, 768 px overflow; fixed in `8b79b75`. Clerk stub fixed (defined in the page, `e23a4a9`); runner pinned to
  Ubuntu 24.04; IBM scanner disabled for this repo; workflows kept in `.github/workflows`.
- **21 Nov 2026:** Waves 1-2.7: security hardening and CI; invite-only Google access with 13+2 capabilities and per-user
  permissions; relations API, Customer/Vehicle 360, QR lookup, owner archive; ten modules on shared patterns; purchases and
  special requests; owner price editing and invoice currency; quote auto-generation, generic invoices, printable
  `DocumentSheet`; plate normalisation (migration 0032); bilingual seeder with confirmed Go Stores prices and a purge script;
  manual visual-check workflow. Pushed to GitHub (`origin/main`).
- **Before:** Replit/Codex built Phase 1 per the tracker (P1-001..P1-044); see [PROJECT_LOG](PROJECT_LOG.md).
