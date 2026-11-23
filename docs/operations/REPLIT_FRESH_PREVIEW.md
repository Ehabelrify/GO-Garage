# Replit: fresh preview (purge the old seed, migrate, seed again)

**For:** the Replit agent (or whoever runs the Replit shell) setting up a new preview of Garage OS for the owner to look at.
**When:** after every push that adds migrations or changes the seed. Last updated 23 Nov 2026 (migrations up to 0041, QR secret added).
**Read first:** [AGENT_INSTRUCTIONS.md](../../AGENT_INSTRUCTIONS.md) section "Replit control points". Do not change `.replit`, port 5000, `npm run dev` / `npm start`, the `db:migrate` and `db:seed:dev` scripts or `scripts/post-merge.sh`.

> **This is a preview database. Never run any step below against production or a shared database.** Every destructive step
> prints the target database first and needs two explicit safeguards. If the printed target is not the preview database, stop.

## 0. What you need before starting (one time)

Replit **Secrets** (the padlock tool), not code:

| Secret | Value | Why |
|---|---|---|
| `DATABASE_URL` | the **preview** Postgres 16 database (Replit's built-in one is fine) | every command below uses it |
| `WARRANTY_QR_SECRET` | any long random string, for example 40+ characters from a password generator | customer warranty QR codes are computed from it. **Without it the QR cards cannot be shown in production-like runs.** Keep the same value for the life of the preview: changing it makes every existing QR unrecoverable (staff would have to replace each code) |
| `SESSION_SECRET` | any long random string | signs the role-widget session cookie |
| `GARAGE_DATASET_CLASS` | `scenario` | marks the database as sample data so the app and seed accept it. **Never `operational` for a preview** |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` | the owner's Clerk development keys | sign-in (Google) |

The `.replit` run button already starts the app with the role widget (`GARAGE_DEMO_AUTH_ENABLED=true npm run dev`). The widget needs `SESSION_SECRET`.

## 1. Stop the app

Stop the running workflow (the Stop button). The app should not hold the database open while you purge.

## 2. Pull the latest code and install

```sh
git pull
npm ci --no-audit --no-fund
```

## 3. Check the target (always)

```sh
npm run db:purge:demo
```

This is a **dry run**: it prints `Target database: <name> @ <host>` and how many seeded rows it *would* delete, and deletes nothing.
Confirm the database name is the preview database. If a row count looks like real data rather than sample data, **stop and ask the owner**.

## 4. Purge the old seed

```sh
GARAGE_CONFIRM_PURGE=yes npm run db:purge:demo -- --execute
```

- Removes only rows the seeder created (customers `seed-cust-*`, everything hanging off them, `seed-*` catalogue and policy rows, seeded staff).
- Keeps real configuration: branches, operating settings, the owner bootstrap row, the dataset marker.
- Add `--keep-demo-accounts` to keep the `demo-*` role-widget staff accounts (usually **do** add it for a preview, so the role widget keeps working):

```sh
GARAGE_CONFIRM_PURGE=yes npm run db:purge:demo -- --execute --keep-demo-accounts
```

It prints `Purge complete: N rows removed.` A step that cannot be removed because non-seeded data references it is listed as "kept" and is not an error.

> If you want a completely empty database instead (not just the seed gone), create a new empty Postgres database in Replit, point `DATABASE_URL` at it and skip this step. Do that only when the owner asks, because it also deletes real configuration.

## 5. Apply the migrations

```sh
npm run db:migrate
```

- Applies every file in `apps/server/infrastructure/database/migrations/` that is not yet recorded in `schema_migrations`, in order, each in its own transaction. Safe to run again: applied files are skipped.
- Current head when this guide was written: **0041_invoice_adjustments.sql**. Migrations 0038 to 0041 are new on a preview that predates 23 Nov 2026.
- It refuses to run with `NODE_ENV=production`. If it stops on an error, **do not edit the database by hand**: copy the file name and the error and report it.

It prints one line, `Applied development migration: <file>`, for each file it applies, and nothing at all for files already applied. Check it worked by running it a second time: it must finish without printing any `Applied development migration` line and without an error. To see the last applied file:

```sh
psql "$DATABASE_URL" -c "SELECT name, applied_at FROM schema_migrations ORDER BY name DESC LIMIT 3;"
```

The newest name must be `0041_invoice_adjustments.sql` (or newer if more migrations were added after this guide).

## 6. Seed the sample data

```sh
GARAGE_DATASET_CLASS=scenario npm run db:seed:dev
```

- Writes the bilingual 12-month dataset (about 110 customers, bookings, jobs, quotes, warranties with **QR codes**, invoices with payments, reversals, refunds and supplementary invoices, claims, finance, sent-document history for the Send to customer "Last sent" line, staff, customer and reminder-rule audit events, follow-up reminders in every state, and pickup promises including revised and cancelled ones).
- It is idempotent: if `seed-cust-001` already exists it says so and does nothing. That is why step 4 comes first.
- Dates are relative to today. To reproduce the exact dataset the owner reviewed in a visual run, add `GARAGE_SEED_NOW=2026-11-21T10:00:00Z`.
- It refuses `NODE_ENV=production` and refuses a database marked `operational`.
- `WARRANTY_QR_SECRET` **must be set when you seed**: the seeded QR codes are derived from it, and the app recomputes them with the same value. Seed and app must use the same secret.

## 7. Start the app and check

Press Run (workflow "Project"). Then, signed in through the role widget as **Owner**:

1. **Warranties → QR cards:** open any row. The drawer shows a QR code and a Print button. (If it says the code "was created before codes could be shown again", the database was seeded with a different secret: purge, set the secret, seed again.)
2. **Customers:** about 110 customers; open one: vehicles, quotes, warranties, purchases, invoices tabs have data.
3. **Bookings → Invoices:** open an invoice that is paid or part paid: **Refund** and, on each payment, **Reverse** buttons appear. The seed now includes about 22 reversed payments, 11 refunds and 9 supplementary (adjustment) invoices, so look for a **Reversed** tag, a **Refunds** list and an "Original invoice" link on an adjustment.
4. **Quotes & offers**, **Finance**, **Settings → Staff access** (Invoices group), **Activity log** (filters Customer records and Reminder rules now have rows), **Follow-ups** (due, snoozed, sent, skipped, cancelled), and an invoice or quote drawer's **Send to customer** button with a "Last sent" line.
5. As **Technician**, open `/workspace/finance`: you land on the Workshop and see a message "You do not have access to Finance. Ask the owner to grant it."

Report back with: the target database name from step 3, rows removed in step 4, the last migration applied in step 5, rows written in step 6, and which of the checks in step 7 passed. If anything failed, include the exact error text and do not retry destructive steps.

## One-shot version (after the first time, when nothing is surprising)

```sh
git pull && npm ci --no-audit --no-fund \
 && npm run db:purge:demo \
 && GARAGE_CONFIRM_PURGE=yes npm run db:purge:demo -- --execute --keep-demo-accounts \
 && npm run db:migrate \
 && GARAGE_DATASET_CLASS=scenario npm run db:seed:dev
```

Read the dry-run output before letting the destructive line run; do not paste this blind.

## Things this does NOT do

- It does not touch production. Production migrations use the separate guarded command `npm run db:migrate:production` (see [MIGRATIONS.md](../engineering/MIGRATIONS.md)).
- It does not delete the schema or the migration history, so a purge never needs migrations to be re-run.
- It does not set up Clerk, Meta/WhatsApp or any external service. Messaging stays simulated.
- It does not push, merge or change any Git setting.

## If something goes wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| `--execute needs GARAGE_CONFIRM_PURGE=yes as well; listing counts only.` | the second safeguard is missing | add `GARAGE_CONFIRM_PURGE=yes` in front of the command |
| `Sample data cannot be seeded into an operational dataset` | `GARAGE_DATASET_CLASS=operational` or the database marker says operational | stop; this is not a preview database |
| `Extended bilingual history is already seeded; nothing to do` | step 4 was skipped or purged nothing | run step 4, then step 6 again |
| QR drawer says the code cannot be shown again | seeded with another secret, or the secret changed | set `WARRANTY_QR_SECRET` once, purge, seed again |
| `QR_SECRET_MISSING` (503) on the QR tab | `WARRANTY_QR_SECRET` not set where the app runs | add the secret and restart |
| A migration fails | a file ran partly or the database is not the expected shape | report the file name and error; do not hand-edit |
