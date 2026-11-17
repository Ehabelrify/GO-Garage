# Phase 1 migration rehearsal record — 2026-11-17

## Outcome

**Completed on two explicitly approved, local disposable databases. No
production or ambient database was accessed.** Migrations reached
`0024_messaging_foundation.sql`; all 47 database-backed tests passed; and a
custom-format backup restored with matching schema, row counts, and
PII-free ID checksums.

## Target and execution

- Rehearsal source: `127.0.0.1:55432/garage_phase1_rehearsal`
- Restore verification target: `127.0.0.1:55432/garage_phase1_restore`
- Both local targets were explicitly approved for this rehearsal.
- PostgreSQL: `16.10`
- Checked: `2026-11-17 13:36 EET`
- Workspace baseline revision: `f6aac78`; verification changes were present in
  the working tree.
- The database migration registry records migration names and application
  times, but not content hashes. The SHA-256 values below identify the exact
  migration source files used.

## Baseline and post-rehearsal data

The disposable database had no legacy business rows before journey fixtures
were added: bookings, jobs, warranties, warranty claims, warranty invoice
drafts, customers, and vehicles each had a count of zero. The empty-ID
checksum for bookings, jobs, warranties, claims, and invoice drafts was
`d41d8cd98f00b204e9800998ecf8427e`. There was therefore no non-empty legacy
dataset against which to measure backfill preservation.

After the synthetic scenarios, the source and restored databases both
contained the following PII-free summary:

| Table | Rows | Ordered ID checksum |
|---|---:|---|
| `bookings` | 11 | `a6ca3908016fde3e6d4e33fbf27334b6` |
| `jobs` | 11 | `83acc5f12230dec76a8c5f5c588c778c` |
| `warranties` | 8 | `9c8e0eb61acd3de9370660cd298252e6` |
| `warranty_claims` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `warranty_invoice_drafts` | 2 | `eacd01491c2600c5f58969bf5d9be689` |
| `customers` | 10 | Count only |
| `vehicles` | 10 | Count only |

The rows are synthetic fixtures in the local disposable databases. Warranty
issuance history is append-only, so its issued warranty and dependent fixture
records were retained rather than deleted by test cleanup.

## Migration result

The requested source set `0010`–`0024` and repair `0017a` were applied in
order. The registry contains 26 migrations in total, including the pre-existing
`0001`–`0009` history, and its latest migration is
`0024_messaging_foundation.sql`. No constraints or foreign keys were
unvalidated after application.

The first attempt at `0018_warranty_coverage_kinds.sql` failed and rolled back
that file: it expected the expiry check to be named
`warranties_expires_on_check`, but the base schema had named it
`warranties_check`. Earlier committed migrations remained applied. A new
forward-only migration, `0017a_warranty_constraint_name_repair.sql`, renamed
the existing check constraint; the ordered migration run then completed
through `0024`. The original migration files were not edited.

| Migration | SHA-256 |
|---|---|
| `0010_booking_idempotency.sql` | `3caf6676e5b20d50c4a335271fc82bc9fdd6eb7d729e15a02f69347790378abb` |
| `0011_commercial_policy_versions.sql` | `4bbe2d50f6ad77366f475d133ffcb5bee3acd9ec7ce1567298d1156741429bd4` |
| `0012_catalogue_versions.sql` | `ad8d9a9fc48b74bf4dfdbec0f4971456f03a2c11427d3796f2f28604be8d69a5` |
| `0013_quote_versions.sql` | `aab5ce152d873ef6e78e10a47090af89eb817af2a6607ebdd1c8e02a14ed6e0e` |
| `0014_booking_work_components.sql` | `470d97e2dde637e04765f05c620559afc6c0d48e4efedf6c203843f3354f3270` |
| `0015_branch_availability.sql` | `388914648004ab6810595bc684fb22fd058299dc8fc1bb3890661367ce5b64c5` |
| `0016_promotion_qualification.sql` | `e9697a670d1f5587bc5ce22c0a4922c8a9e2a77448bb6ec29c0b61947b458940` |
| `0017_promotion_reservations.sql` | `6cb81e3a9d52984da6f7e356cde088d752907b450167dfe3406d40bae4ba332a` |
| `0017a_warranty_constraint_name_repair.sql` | `7a0b250decdb9ea1b0d8ac560e596673812277d672afceb046ef915ed740fe2d` |
| `0018_warranty_coverage_kinds.sql` | `3ec2d8cd23a2d707e3527c3adf0946f7e2e6d196ab3bf3ecc46a5c290e771ac5` |
| `0019_warranty_component_bindings.sql` | `b181c193b72ef00bb628bb6c7149e1369c02ac10f163b310a65963941f822937` |
| `0020_benefit_entitlements.sql` | `6bc93bae979f21d125ff2cebd93b5fa2aec8ba77d59714d9dc6240290f1b6fdc` |
| `0021_transport_coordination.sql` | `7b72ad5fcd729872db78ba2f05c5afec9f053640ea84d3fb4db5df4666ec87d4` |
| `0022_operational_money_events.sql` | `61ef60d24b60bd953b3f10bd7793aa7caac5f1f480fccf173a464b12c8b17838` |
| `0023_finance_definition_completeness.sql` | `eea36cfcb72cc69f935e21d93399d11f93b0ef174ddd08cf6969e9a28e7ec86e` |
| `0024_messaging_foundation.sql` | `a0f80efa2e26a682b52539bc3d0e9b4dd628d3773b0531b3afda9477d96ad438` |

## Exercised scenarios

- Availability returned configured slots; explicit customer confirmation
  created a confirmed booking and the WhatsApp simulation assertions passed.
- A staff-recorded quote acceptance was verified at EGP 11,400, qualified for a
  synthetic promotion, reserved without claiming capacity, then scheduled into
  availability with its expected 120-minute occupancy.
- Finance reporting reconciled the accepted-quote source and a recorded EGP
  2,500 collection; drilldowns returned the matching source records.
- Warranty issuance and the associated invoice/QR/privacy assertions passed.
- The scenario dataset-boundary check passed. Operational-environment quote,
  reservation, and money-event counts, bookings/jobs outside the synthetic
  branch, messaging outbox rows, and provider-event rows were unchanged by the
  scenario test. Both outbox and provider-event counts remained zero.
- No scenario-reset operation was present in the current codebase, so a reset
  exercise was not run. The rehearsal and restore targets themselves were
  disposable and isolated from production.

## Validation and failures

| Check | Result |
|---|---|
| `npm ci --no-audit --no-fund` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `env -u GARAGE_TEST_DATABASE_URL npm test -- --run` | 44 passed; 3 database suites skipped |
| Database-backed `npm test -- --run --maxWorkers=1` | 47 passed; 0 skipped |
| Schema constraints and foreign keys | 0 unvalidated |
| Production data | Not accessed or changed |

The booking journey exposed a missing booking insert parameter, and quote
scheduling exposed an unused PostgreSQL bind parameter while copying accepted
work components. Both application SQL issues were corrected and the journeys
then passed. The warranty suite initially failed during cleanup because the
new immutable `warranty_issuance_requests` record correctly prevents deleting
the issued warranty. Test cleanup now preserves that immutable record and its
synthetic dependencies; the full database-backed suite passes.

## Backup and restore evidence

- Source backup: custom-format `pg_dump` from the approved rehearsal target.
- Archive listing: `pg_restore --list` succeeded; 657 TOC entries.
- Archive size: 336 KB.
- Archive SHA-256: `e4a5faa6b92d89dd6dbf2fbb3ba1146416b4f157d9b02ab53077e5afd17444a1`.
- Restored into the separately approved disposable target
  `127.0.0.1:55432/garage_phase1_restore`; `pg_restore --exit-on-error`
  completed successfully.
- Source and restore matched on migration count/head, listed table counts and
  ordered ID checksums, customer/vehicle counts, scenario marker, outbox and
  provider-event counts, and constraint validation.

This is rehearsal evidence only. It does not authorize running the migrations
against production or establish preservation behavior for a non-empty legacy
dataset.
