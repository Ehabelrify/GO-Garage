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

- `0030_invoices.sql` (Wave 2.6): `invoices` (per environment; links to customer, vehicle, booking, job, quote and warranty; status draft|issued|partial|paid|void; unique `(environment_id, idempotency_key)` so a job gets one auto invoice via key `job:<jobId>`; minor-unit totals; number unique per environment once issued), `invoice_lines`, append-only `invoice_events`, append-only `invoice_payment_references` (references only, no gateway) and `invoice_number_sequences` (per branch and year, upserted at issue time). Triggers: history and payment references reject UPDATE/DELETE; lines of a non-draft invoice cannot change; an issued invoice cannot be deleted, renumbered, or have its currency, total, customer or branch changed, and a void invoice cannot reopen. Idempotent (`IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`); not applied anywhere. Numbers 0031 (quotes) and 0032 (plates) come from other agents; the runner sorts by filename so 0030 applies first.

- `0033_intake_products_and_unlinked_contacts.sql` (Wave 5, quick intake): (1) `catalogue_package_versions.kind` CHECK is dropped by lookup (the constraint name was system-generated) and re-added as `package|standalone|product`; new nullable `product_category` jsonb and a shape CHECK (a product has `work = []`, exactly one scope item and an object category). No stock columns: stock, reorder level, per-branch quantity and movements will be separate tables keyed by `package_id` (the stable product id). (2) `whatsapp_conversations.customer_id` and `vehicle_id` lose NOT NULL; new `contact_label`, `provider_contact_hash`, `contact_phone` (nullable text); CHECK: a conversation without a customer must carry a non-blank label and hash, and a vehicle needs a customer; partial index on `(channel_id, provider_contact_hash) WHERE customer_id IS NULL`. `messaging_contact_links.vehicle_id` loses NOT NULL; `messaging_channels.default_branch_id` (nullable, FK branches) names the branch that receives unsaved numbers (else the first branch). (3) `customer_purchases` view re-created with the same columns, labelling a product line from the accepted snapshot. (4) `intake_requests (actor_id, idempotency_key)` primary key: request hash, outcome, branch, resulting customer/vehicle/quote/booking/conversation, notes, items and the replayable response. Idempotent (`DROP CONSTRAINT IF EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE VIEW`, `CREATE TABLE IF NOT EXISTS`); not applied anywhere. Existing rows are unaffected; to roll back, delete unlinked conversations and products first, then restore the NOT NULLs and the old CHECK.

## Adding the next migration (0034)
1. Create `0034_<short_snake_case_description>.sql` in the migrations directory (next number
   after `0033_intake_products_and_unlinked_contacts.sql`; no suffix letters).
2. Write plain SQL; the runner wraps it in a transaction, so do not add `BEGIN`/`COMMIT`.
3. Update `docs/engineering/DATA_MODEL.md` if the schema contract changes.
4. Apply it to a disposable database and run the integration suites with
   `GARAGE_TEST_DATABASE_URL` set (CI does this against a Postgres 16 service).

- `0032_plate_normalization.sql` (Wave 2.7): `garage_normalize_plate(text)` (IMMUTABLE SQL function: `translate()` of Arabic-Indic/Eastern digits to ASCII, a-z to A-Z and Alef/Yeh/Kaf/Heh variants to one canonical Arabic letter, `regexp_replace` stripping whitespace, dashes, dot, underscore, tatweel, zero-width/bidi marks and tashkeel, then letters followed by digits). It is the exact twin of `normalizePlate()` in `packages/domain/src/plate.ts`; `plate.test.ts` parses the literals out of the file and compares. Drops the 0027 `vehicles_plate_normalized_idx` and creates `vehicles_plate_key_idx` on `garage_normalize_plate(plate) text_pattern_ops`. Not unique on purpose (legacy spellings could collide); duplicates per customer/branch are refused by the API with 409 `DUPLICATE_PLATE`. Idempotent; not applied anywhere. Changing the function later means a new migration that also rebuilds the index.
