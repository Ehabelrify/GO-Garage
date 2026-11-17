# WhatsApp provider readiness and recovery runbook

Status: disconnected. This document is a cutover gate, not evidence of a live provider connection. The application delivery gate remains hard-disabled and scenario deployments reject provider secrets.

## Required evidence before any activation

- Record the approved primary provider, business ownership/admin evidence, and eligibility/migration/coexistence evidence for each of the six receiving assets. Store references only; never store credentials here.
- Configure six `messaging_channels` rows with non-secret provider asset references only after the responsible administrator verifies ownership. Start each row as `disconnected`.
- Record approved bilingual templates, customer consent basis, service-window and retention rules, and the named privacy/operations approvers. Missing policy keeps outbound intents held.
- Configure the webhook secret in the operational deployment secret store only. The scenario deployment must use a separate database/credentials, `GARAGE_DATASET_CLASS=scenario`, no provider secret and no provider worker.
- Verify the database `messaging_environment_marker` matches the deployment before startup. Never change a request-time DSN or reuse operational credentials in scenario.

## Sandbox acceptance (future authorized session)

Use provider-approved test recipients only. Record sanitized evidence for all six channels: valid inbound, invalid signature, replay deduplication, source-channel reply, accepted outbound, delivered/read receipts, out-of-order receipts, definite failure, timeout/unknown outcome and reconciliation. A queued row is not sent evidence. Unknown outcomes remain held for operator review unless the provider can reconcile the same idempotency/provider identifier.

## Cutover and monitoring

Assign one operator and rollback owner per channel. Enable one channel at a time only after backup/restore rehearsal, inbox membership review and sandbox acceptance. Monitor inbound lag, outbox queued/leased age, unknown outcomes, permanent failures and webhook signature failures. Thresholds and alert recipients require B10 approval; none are inferred here.

## Outage/manual fallback

Disable the provider worker and affected channel, keep inbound/outbox/audit history, and display disconnected status. Do not retry unknown outcomes blindly. The operator reconciles provider identifiers, contacts customers only through an approved fallback, and records the decision. Scenario transport remains available only in its isolated fictional deployment and is never a production fallback.

## Rollback

Stop new enqueue/send, expire or hold unsent intents, reconcile every leased/accepted/unknown row, then restore the previous compatible application. Retain provider events, messages, bookings and audit. Prefer a forward fix after live writes; never drop outbox/provider history. Restore from backup only with a recorded cutover/data-loss decision and verify that restored accepted intents cannot resend.
