# Commercial migration runbook

## Scope and current evidence

This runbook covers Phase 1 migrations `0010` through `0024`, including the booking-idempotency foundation and messaging foundation. It is an operating procedure, not evidence that a rehearsal or production migration occurred. A dated rehearsal record must identify exactly which migrations were tested.

Never run these migrations automatically against ambient `DATABASE_URL`. Use the repository's explicit disposable-target approval guard, and identify the exact host, port, and database without printing credentials.

## Before any write

1. Stop new commercial writes or place the deployment in its documented maintenance boundary while leaving compatible reads available.
2. Confirm the target is a disposable rehearsal copy or an explicitly approved production target. Record sanitized identity, application version, migration head, operator, and time.
3. Take a restorable database backup and test that backup in a separate disposable environment before production change approval.
4. Run the repository validation gate in order: install integrity, typecheck, required database suites, complete tests, then build. A skip is not a pass. If any gate fails, make zero migration calls.
5. Capture PII-free baseline evidence: row counts and deterministic checksums for legacy bookings, jobs, warranties, claims, invoice drafts, customers/vehicles by count only, and existing migration history. Do not export contact, evidence, message, address, token, or credential values.

## Forward order

Apply exactly one file at a time in numeric order:

- `0010` booking idempotency
- `0011` policy versions and activation
- `0012` catalogue versions
- `0013` quote versions and acceptance
- `0014` accepted work components and pickup commitments
- `0015` branch availability and occupancy
- `0016` qualification and allocation
- `0017` reservations
- `0017a` warranty expiry constraint-name compatibility repair
- `0018` warranty coverage kinds
- `0019` warranty component bindings
- `0020` benefit entitlements
- `0021` transport coordination
- `0022` operational money events and reservation-deposit linkage
- `0023` finance completeness attestations
- `0024` messaging foundation

After each file, record migration identity, success/failure, schema-only checks, constraint/FK validity, and the same PII-free counts/checksums. New commercial foreign keys for legacy rows must remain null unless the migration has an explicit verified source. Never infer catalogue category, currency, quote acceptance, payment, evidence, lifetime wording, benefit, provider, or finance definition.

## Failure and resume

- A transaction failure rolls back only the current migration file. Previously committed files remain applied.
- Stop immediately, preserve logs without secrets/PII, and keep the expansion-compatible reader release in service if safe.
- Repair forward with a new reviewed migration. Do not edit or delete accepted quotes, lifetime coverage, benefit fulfillment, transport custody, money events, reversals, or attestations to make an older binary appear compatible.
- Resume only from the recorded migration head after re-running target identity and validation gates. Recompare counts/checksums before continuing.
- If rollback of application code is required, stop new commercial writes first and deploy only a reader known to tolerate the expanded schema. Database down-migration is not the default rollback.

## Restore decision

Restore the tested backup only after an authorized, recorded cutover/data-loss decision. State the exact recovery point and writes that would be lost. Restore into a disposable target first, validate integrity and application compatibility, then repeat the approved cutover procedure. Append-only commercial history must not be selectively removed.

## Completion evidence

A rehearsal or release record must include sanitized target identity, versions, operator/time, migration results, pre/post counts and checksums, FK/constraint checks, backup-restore result, application validation result, and any forward repairs. It must explicitly distinguish operational and scenario datasets and prove that scenario reset/provider queues did not change operational rows. This document alone does not support a production-ready claim.
