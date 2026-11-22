# Document delivery (invoice, quote, warranty card)

Status: simulated, provider-ready. Owner decision 22 Nov 2026: a customer has an invoice, a quote and a warranty QR card, all printable and sendable; messaging stays simulated with full functionality until the Meta APIs are connected.

## Flow

`POST /api/document-delivery/send` `{ documentKind: invoice | quote | warranty-card, documentId, channel: whatsapp | app, idempotencyKey, verificationToken? }`

1. `app` answers 501 `CHANNEL_NOT_AVAILABLE` (typed future value). Demo sessions get 403.
2. Capability: `invoices.view` (invoice), `quotes.view` or `quotes.manage` (quote), `warranty.view` (warranty card), plus branch access. Anything else is 403 or 404.
3. Same idempotency key and same request returns the stored entry with `replayed: true`; a different request with that key is 409.
4. The document must be sendable (issued invoice, offered or accepted quote, active warranty).
5. Consent: the same rule as the outbox and reminders (`hasActiveCustomerConsent`, purpose `service`, evidence recorded, not expired). Missing consent returns 422 `CONSENT_REQUIRED` and nothing is written.
6. The message is built in the customer's preferred language. A link is included only for a warranty card whose live QR token is supplied, verification is enabled and `GARAGE_PUBLIC_BASE_URL` is set (public verification page). Invoices and quotes have no safe public page, so they carry summary text only.
7. `deliveryAdapter()` (in `whatsapp/provider.ts`) sends. Without a connected adapter the `SimulatedProviderAdapter` completes the flow and the log row is `sent-simulated`, `delivery_mode = simulated`. The UI labels it "Simulated send (not delivered)".
8. A row is appended to `document_delivery_log` (migration 0040, append-only). `GET /api/document-delivery/history?documentKind=&documentId=` returns the newest 20 (masked recipient, status, time).

## Going live (Meta Cloud API)

Only these change: implement a connected adapter and return it from `providerAdapter()` in `whatsapp/provider.ts`; set the variables. `deliveryAdapter()` then uses it automatically and rows become `accepted` with `delivery_mode = live`.

Expected variables (names only, no values in source): `WHATSAPP_PROVIDER_ENABLED=true`, `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_API_VERSION`, `GARAGE_PUBLIC_BASE_URL`, plus `GARAGE_DATASET_CLASS=operational` and `NODE_ENV=production`.

Still needed for live: approved Meta message templates (business-initiated messages outside the 24 hour window must be templates; the current send uses free-form text), delivery status webhooks updating the log (the log is append-only, so status changes need a status-event table or new rows), and a channel and consent model per document send.

## Automatic send

`autoSendOnIssue(client, kind, documentId, event)` in `document-delivery-service.ts` runs under a savepoint inside the caller's transaction: missing consent or any error never aborts the business action, and the key `auto:<kind>:<id>:<event>` makes it idempotent. It is wired at these call sites (one guarded call each, inside the existing transaction, after the status change):

- invoice issue: `issueInvoice` in `invoicing/invoice-service.ts`, event `issued`
- quote offer: `createQuoteRevisionInTransaction` in `commercial/quote-service.ts` when state is `offered`, event `offered-<revision>`
- quote acceptance: `acceptQuote` in `commercial/quote-service.ts`, event `accepted`
- warranty issuance: `issueCoverageInTransaction` in `warranty/issuance-service.ts`, event `issued` (kind `warranty-card`)

A delivery error is swallowed by the savepoint and never fails the business action (tests: `document-delivery/auto-send-hooks.test.ts`).
