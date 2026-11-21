# Database migrations

Migrations live in `apps/server/infrastructure/database/migrations/` and are applied by
`apps/server/infrastructure/database/migrate.ts` (run with `npm run db:migrate`; the
`apps/server/migrate.ts` file is a thin facade).

## Ordering
- The runner lists every `*.sql` file and sorts by filename (plain string sort), then applies
  each one not yet recorded in `schema_migrations` (keyed by filename), one transaction per file,
  under an advisory lock.
- Because ordering is a string sort, the numeric prefix decides the order; a suffix letter
  sorts after the bare number (`0017_*` runs before `0017a_*`, which runs before `0018_*`).
- The runner reads `DATABASE_URL` and refuses `NODE_ENV=production`. Verify the target is a
  development or disposable database first.

## Known irregularities (do not "fix")
- Two files share the `0005_` prefix: `0005_warranty_auto_issue.sql` and
  `0005_whatsapp_simulation.sql`. They apply in filename order (warranty first, then WhatsApp).
  They are independent and both already applied in existing databases.
- `0017a_warranty_constraint_name_repair.sql` was inserted between `0017` and `0018` to
  normalize a generated constraint name (`warranties_check`) that `0018` drops by name.

## Rules
- Never renumber, rename, edit, or delete a migration that may have been applied anywhere.
  The filename is the identity in `schema_migrations`; renaming re-applies it.
- Fix mistakes with a new, later migration.
- Migrations must be safe on both fresh and already-populated databases.

## Recent migrations (written, NOT yet run anywhere)
- `0026_staff_preapproval.sql`: adds the `invited` status to `staff_memberships` (replaces the
  status CHECK), `invited_by`, a unique index on pending invited email, and the per-user
  `permissions` jsonb column (capability overrides). Required for invite-only access.
- `0027_relations_and_owner_records.sql`: lookup indexes for global search and Customer/Vehicle
  360 (normalised plate, reversed phone digits, customer/vehicle indexes on bookings, quotes,
  warranties, reservations, benefits, transport, conversations), the `record_archives`
  soft-archive table and the append-only `owner_record_audit` table with an immutability trigger.
The 0026/0027 files are idempotent (`IF NOT EXISTS`) but have not been applied to any database or exercised by
the integration suites. Apply to a disposable database first.

- `0028_purchases_and_special_requests.sql`: the `customer_purchases` read-only view (accepted
  quotes plus quote-less delivered jobs, linked to booking/job/warranty/invoice; no table to keep
  in sync), the `special_requests` table (vehicle required, free text, status, customer-visible reply
  columns separate from `owner_notes`, nullable `quote_id`, `source` staff|customer-app, optimistic
  `revision`) and the append-only `special_request_events` history with an immutability trigger.
  Idempotent (`CREATE OR REPLACE VIEW`, `IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`); not applied anywhere.

- `0029_invoice_currency_and_price_edits.sql`: `warranty_invoice_drafts.currency` (text, default `EGP`, shape CHECK
  `^[A-Z]{3}$`; the allowed list lives in `packages/domain/src/currencies.ts` and is enforced by the server) and the nullable
  `catalogue_package_versions.price_change` jsonb used by Owner price-edit drafts. Idempotent (`ADD COLUMN IF NOT EXISTS`,
  `DROP CONSTRAINT IF EXISTS`); existing rows keep EGP; not applied anywhere.

## Adding the next migration (0030)
1. Create `0030_<short_snake_case_description>.sql` in the migrations directory (next number
   after `0029_invoice_currency_and_price_edits.sql`; no suffix letters).
2. Write plain SQL; the runner wraps it in a transaction, so do not add `BEGIN`/`COMMIT`.
3. Update `docs/engineering/DATA_MODEL.md` if the schema contract changes.
4. Apply it to a disposable database and run the integration suites with
   `GARAGE_TEST_DATABASE_URL` set (CI does this against a Postgres 16 service).
