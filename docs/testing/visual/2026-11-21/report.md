# Visual checks report

Generated 2026-11-21T23:08:03.141Z against `http://127.0.0.1:5000` (dataset 2026-11-21T10:00:00Z). Duration 684 s.

**Pages:** 222 total, 0 FAIL, 222 WARN, 0 PASS. **Flows:** 6 pass, 9 fail, 4 skipped.

Fail rules: API 5xx, uncaught page error, navigation/render failure, horizontal overflow at 360 px. Everything else (console errors, API 4xx, other-width overflow, axe) is a warning.

## API failures (HTTP 4xx/5xx from /api)

| Status | Request | Count | Seen on | Response snippet |
|---|---|---|---|---|
| **500** | GET `/api/vehicles/seed-veh-001/360` | 5 | flow:customer-360, flow:pdf-customer-360 | {"code":"INTERNAL_ERROR","message":"The request could not be completed."} |
| **500** | GET `/api/customers/seed-cust-008/360` | 1 | flow:drawer | {"code":"INTERNAL_ERROR","message":"The request could not be completed."} |
| **500** | GET `/api/customers/seed-cust-047/360` | 1 | flow:drawer | {"code":"INTERNAL_ERROR","message":"The request could not be completed."} |
| 404 | GET `/api/whatsapp/consents?channelId=&customerId=&purpose=` | 18 | owner/whatsapp, branch-manager/whatsapp, receptionist/whatsapp | {"code":"CONSENT_NOT_FOUND"} |
| 404 | GET `/api/promotions` | 4 | flow:print-quote | {"code":"NOT_FOUND","message":"Route not found."} |

## Flows

| Flow | Variant | Status | Detail |
|---|---|---|---|
| search-plate | en/1280 | PASS | 1 result(s) for the seeded plate (en) |
| customer-360 | en/1280 | FAIL | vehicle seed-veh-001 opened via /workspace/customers?vehicleId=seed-veh-001 (page) [0 page error(s), 1 API 5xx] |
| drawer | en/1280 | FAIL | page.waitForSelector: Timeout 10000ms exceeded. [0 page error(s), 1 API 5xx] |
| search-plate | en/360 | PASS | 1 result(s) for the seeded plate (en) |
| customer-360 | en/360 | FAIL | vehicle seed-veh-001 opened via /workspace/customers?vehicleId=seed-veh-001 (page) [0 page error(s), 1 API 5xx] |
| drawer | en/360 | FAIL | locator.click: Timeout 15000ms exceeded. |
| search-plate | ar/1280 | PASS | 1 result(s) for the seeded plate (ar) |
| customer-360 | ar/1280 | FAIL | vehicle seed-veh-001 opened via /workspace/customers?vehicleId=seed-veh-001 (page) [0 page error(s), 1 API 5xx] |
| drawer | ar/1280 | FAIL | page.waitForSelector: Timeout 10000ms exceeded. [0 page error(s), 1 API 5xx] |
| search-plate | ar/360 | PASS | 1 result(s) for the seeded plate (ar) |
| customer-360 | ar/360 | FAIL | vehicle seed-veh-001 opened via /workspace/customers?vehicleId=seed-veh-001 (page) [0 page error(s), 1 API 5xx] |
| drawer | ar/360 | FAIL | locator.click: Timeout 15000ms exceeded. |
| print-quote | en/1280 | PASS | print control clicked on quotes (same page); pdf pdfs/quotes-print_en_1280.pdf |
| print-invoice | en/1280 | SKIP | no print control found on finance (route or feature not present yet) |
| print-warranty | en/1280 | SKIP | no print control found on warranties (route or feature not present yet) |
| print-quote | ar/1280 | PASS | print control clicked on quotes (same page); pdf pdfs/quotes-print_ar_1280.pdf |
| print-invoice | ar/1280 | SKIP | no print control found on finance (route or feature not present yet) |
| print-warranty | ar/1280 | SKIP | no print control found on warranties (route or feature not present yet) |
| pdf-customer-360 | en/1280 | FAIL | print-to-PDF of /workspace/customers?vehicleId=seed-veh-001 written to pdfs/customer-360.pdf [0 page error(s), 1 API 5xx] |

## Pages (role x locale x width x page)

| Role | Locale | Width | Page | Status | Overflow | Console errors | API failures | Axe (rules/nodes) | Screenshot |
|---|---|---|---|---|---|---|---|---|---|
| branch-manager | ar | 360 | bookings | WARN | no | 2 | 0 | 2/417 | `screenshots/branch-manager/ar/360/bookings.png` |
| branch-manager | ar | 360 | bookings-transport | WARN | no | 2 | 0 | 2/64 | `screenshots/branch-manager/ar/360/bookings-transport.png` |
| branch-manager | ar | 360 | customers | WARN | no | 0 | 0 | 2/62 | `screenshots/branch-manager/ar/360/customers.png` |
| branch-manager | ar | 360 | finance | WARN | no | 0 | 0 | 1/3 | `screenshots/branch-manager/ar/360/finance.png` |
| branch-manager | ar | 360 | overview | WARN | no | 2 | 0 | 2/50 | `screenshots/branch-manager/ar/360/overview.png` |
| branch-manager | ar | 360 | quotes | WARN | no | 2 | 0 | 2/340 | `screenshots/branch-manager/ar/360/quotes.png` |
| branch-manager | ar | 360 | quotes-benefits | WARN | no | 2 | 0 | 2/96 | `screenshots/branch-manager/ar/360/quotes-benefits.png` |
| branch-manager | ar | 360 | quotes-promotions | WARN | no | 0 | 0 | 2/13 | `screenshots/branch-manager/ar/360/quotes-promotions.png` |
| branch-manager | ar | 360 | quotes-reservations | WARN | no | 2 | 0 | 2/36 | `screenshots/branch-manager/ar/360/quotes-reservations.png` |
| branch-manager | ar | 360 | warranties | WARN | no | 2 | 0 | 2/239 | `screenshots/branch-manager/ar/360/warranties.png` |
| branch-manager | ar | 360 | whatsapp | WARN | no | 0 | 1 | 1/2 | `screenshots/branch-manager/ar/360/whatsapp.png` |
| branch-manager | ar | 360 | workshop | WARN | no | 0 | 0 | 2/4 | `screenshots/branch-manager/ar/360/workshop.png` |
| branch-manager | ar | 768 | bookings | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/ar/768/bookings.png` |
| branch-manager | ar | 768 | bookings-transport | WARN | YES | 2 | 0 | 1/2 | `screenshots/branch-manager/ar/768/bookings-transport.png` |
| branch-manager | ar | 768 | customers | WARN | no | 0 | 0 | 1/4 | `screenshots/branch-manager/ar/768/customers.png` |
| branch-manager | ar | 768 | finance | WARN | no | 0 | 0 | 1/10 | `screenshots/branch-manager/ar/768/finance.png` |
| branch-manager | ar | 768 | overview | WARN | no | 2 | 0 | 1/4 | `screenshots/branch-manager/ar/768/overview.png` |
| branch-manager | ar | 768 | quotes | WARN | YES | 2 | 0 | 1/2 | `screenshots/branch-manager/ar/768/quotes.png` |
| branch-manager | ar | 768 | quotes-benefits | WARN | YES | 2 | 0 | 1/2 | `screenshots/branch-manager/ar/768/quotes-benefits.png` |
| branch-manager | ar | 768 | quotes-promotions | WARN | no | 0 | 0 | 2/14 | `screenshots/branch-manager/ar/768/quotes-promotions.png` |
| branch-manager | ar | 768 | quotes-reservations | WARN | YES | 2 | 0 | 1/2 | `screenshots/branch-manager/ar/768/quotes-reservations.png` |
| branch-manager | ar | 768 | warranties | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/ar/768/warranties.png` |
| branch-manager | ar | 768 | whatsapp | WARN | YES | 0 | 1 | 2/12 | `screenshots/branch-manager/ar/768/whatsapp.png` |
| branch-manager | ar | 768 | workshop | WARN | no | 0 | 0 | 2/7 | `screenshots/branch-manager/ar/768/workshop.png` |
| branch-manager | ar | 1280 | bookings | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/ar/1280/bookings.png` |
| branch-manager | ar | 1280 | bookings-transport | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/ar/1280/bookings-transport.png` |
| branch-manager | ar | 1280 | customers | WARN | no | 0 | 0 | 1/4 | `screenshots/branch-manager/ar/1280/customers.png` |
| branch-manager | ar | 1280 | finance | WARN | no | 0 | 0 | 1/10 | `screenshots/branch-manager/ar/1280/finance.png` |
| branch-manager | ar | 1280 | overview | WARN | no | 2 | 0 | 1/4 | `screenshots/branch-manager/ar/1280/overview.png` |
| branch-manager | ar | 1280 | quotes | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/ar/1280/quotes.png` |
| branch-manager | ar | 1280 | quotes-benefits | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/ar/1280/quotes-benefits.png` |
| branch-manager | ar | 1280 | quotes-promotions | WARN | no | 0 | 0 | 2/14 | `screenshots/branch-manager/ar/1280/quotes-promotions.png` |
| branch-manager | ar | 1280 | quotes-reservations | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/ar/1280/quotes-reservations.png` |
| branch-manager | ar | 1280 | warranties | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/ar/1280/warranties.png` |
| branch-manager | ar | 1280 | whatsapp | WARN | no | 0 | 1 | 2/12 | `screenshots/branch-manager/ar/1280/whatsapp.png` |
| branch-manager | ar | 1280 | workshop | WARN | no | 0 | 0 | 2/7 | `screenshots/branch-manager/ar/1280/workshop.png` |
| branch-manager | en | 360 | bookings | WARN | no | 2 | 0 | 2/416 | `screenshots/branch-manager/en/360/bookings.png` |
| branch-manager | en | 360 | bookings-transport | WARN | no | 2 | 0 | 2/63 | `screenshots/branch-manager/en/360/bookings-transport.png` |
| branch-manager | en | 360 | customers | WARN | no | 0 | 0 | 2/61 | `screenshots/branch-manager/en/360/customers.png` |
| branch-manager | en | 360 | finance | WARN | no | 0 | 0 | 1/8 | `screenshots/branch-manager/en/360/finance.png` |
| branch-manager | en | 360 | overview | WARN | no | 2 | 0 | 2/50 | `screenshots/branch-manager/en/360/overview.png` |
| branch-manager | en | 360 | quotes | WARN | no | 2 | 0 | 2/339 | `screenshots/branch-manager/en/360/quotes.png` |
| branch-manager | en | 360 | quotes-benefits | WARN | no | 2 | 0 | 2/95 | `screenshots/branch-manager/en/360/quotes-benefits.png` |
| branch-manager | en | 360 | quotes-promotions | WARN | no | 0 | 0 | 1/12 | `screenshots/branch-manager/en/360/quotes-promotions.png` |
| branch-manager | en | 360 | quotes-reservations | WARN | no | 2 | 0 | 2/35 | `screenshots/branch-manager/en/360/quotes-reservations.png` |
| branch-manager | en | 360 | warranties | WARN | no | 2 | 0 | 2/238 | `screenshots/branch-manager/en/360/warranties.png` |
| branch-manager | en | 360 | whatsapp | WARN | no | 0 | 1 | 1/4 | `screenshots/branch-manager/en/360/whatsapp.png` |
| branch-manager | en | 360 | workshop | WARN | no | 0 | 0 | 2/4 | `screenshots/branch-manager/en/360/workshop.png` |
| branch-manager | en | 768 | bookings | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/en/768/bookings.png` |
| branch-manager | en | 768 | bookings-transport | WARN | YES | 2 | 0 | 1/3 | `screenshots/branch-manager/en/768/bookings-transport.png` |
| branch-manager | en | 768 | customers | WARN | no | 0 | 0 | 1/4 | `screenshots/branch-manager/en/768/customers.png` |
| branch-manager | en | 768 | finance | WARN | no | 0 | 0 | 1/10 | `screenshots/branch-manager/en/768/finance.png` |
| branch-manager | en | 768 | overview | WARN | no | 2 | 0 | 1/4 | `screenshots/branch-manager/en/768/overview.png` |
| branch-manager | en | 768 | quotes | WARN | YES | 2 | 0 | 1/2 | `screenshots/branch-manager/en/768/quotes.png` |
| branch-manager | en | 768 | quotes-benefits | WARN | YES | 2 | 0 | 1/2 | `screenshots/branch-manager/en/768/quotes-benefits.png` |
| branch-manager | en | 768 | quotes-promotions | WARN | no | 0 | 0 | 2/14 | `screenshots/branch-manager/en/768/quotes-promotions.png` |
| branch-manager | en | 768 | quotes-reservations | WARN | YES | 2 | 0 | 1/2 | `screenshots/branch-manager/en/768/quotes-reservations.png` |
| branch-manager | en | 768 | warranties | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/en/768/warranties.png` |
| branch-manager | en | 768 | whatsapp | WARN | YES | 0 | 1 | 2/12 | `screenshots/branch-manager/en/768/whatsapp.png` |
| branch-manager | en | 768 | workshop | WARN | no | 0 | 0 | 2/7 | `screenshots/branch-manager/en/768/workshop.png` |
| branch-manager | en | 1280 | bookings | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/en/1280/bookings.png` |
| branch-manager | en | 1280 | bookings-transport | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/en/1280/bookings-transport.png` |
| branch-manager | en | 1280 | customers | WARN | no | 0 | 0 | 1/4 | `screenshots/branch-manager/en/1280/customers.png` |
| branch-manager | en | 1280 | finance | WARN | no | 0 | 0 | 1/10 | `screenshots/branch-manager/en/1280/finance.png` |
| branch-manager | en | 1280 | overview | WARN | no | 2 | 0 | 1/4 | `screenshots/branch-manager/en/1280/overview.png` |
| branch-manager | en | 1280 | quotes | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/en/1280/quotes.png` |
| branch-manager | en | 1280 | quotes-benefits | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/en/1280/quotes-benefits.png` |
| branch-manager | en | 1280 | quotes-promotions | WARN | no | 0 | 0 | 2/14 | `screenshots/branch-manager/en/1280/quotes-promotions.png` |
| branch-manager | en | 1280 | quotes-reservations | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/en/1280/quotes-reservations.png` |
| branch-manager | en | 1280 | warranties | WARN | no | 2 | 0 | 1/3 | `screenshots/branch-manager/en/1280/warranties.png` |
| branch-manager | en | 1280 | whatsapp | WARN | no | 0 | 1 | 2/12 | `screenshots/branch-manager/en/1280/whatsapp.png` |
| branch-manager | en | 1280 | workshop | WARN | no | 0 | 0 | 2/7 | `screenshots/branch-manager/en/1280/workshop.png` |
| owner | ar | 360 | bookings | WARN | no | 2 | 0 | 1/1 | `screenshots/owner/ar/360/bookings.png` |
| owner | ar | 360 | bookings-transport | WARN | no | 2 | 0 | 2/105 | `screenshots/owner/ar/360/bookings-transport.png` |
| owner | ar | 360 | catalogue | WARN | no | 0 | 0 | 1/2 | `screenshots/owner/ar/360/catalogue.png` |
| owner | ar | 360 | customers | WARN | no | 0 | 0 | 2/70 | `screenshots/owner/ar/360/customers.png` |
| owner | ar | 360 | finance | WARN | no | 0 | 0 | 1/3 | `screenshots/owner/ar/360/finance.png` |
| owner | ar | 360 | overview | WARN | no | 2 | 0 | 2/74 | `screenshots/owner/ar/360/overview.png` |
| owner | ar | 360 | quotes | WARN | no | 2 | 0 | 2/663 | `screenshots/owner/ar/360/quotes.png` |
| owner | ar | 360 | quotes-benefits | WARN | no | 2 | 0 | 2/96 | `screenshots/owner/ar/360/quotes-benefits.png` |
| owner | ar | 360 | quotes-promotions | WARN | no | 0 | 0 | 2/13 | `screenshots/owner/ar/360/quotes-promotions.png` |
| owner | ar | 360 | quotes-reservations | WARN | no | 2 | 0 | 2/48 | `screenshots/owner/ar/360/quotes-reservations.png` |
| owner | ar | 360 | settings | WARN | no | 0 | 0 | 1/1 | `screenshots/owner/ar/360/settings.png` |
| owner | ar | 360 | settings-access | WARN | no | 0 | 0 | 1/1 | `screenshots/owner/ar/360/settings-access.png` |
| owner | ar | 360 | warranties | WARN | no | 2 | 0 | 2/417 | `screenshots/owner/ar/360/warranties.png` |
| owner | ar | 360 | whatsapp | WARN | no | 0 | 1 | 1/2 | `screenshots/owner/ar/360/whatsapp.png` |
| owner | ar | 360 | workshop | WARN | no | 0 | 0 | 2/4 | `screenshots/owner/ar/360/workshop.png` |
| owner | ar | 768 | bookings | WARN | no | 2 | 0 | 1/2 | `screenshots/owner/ar/768/bookings.png` |
| owner | ar | 768 | bookings-transport | WARN | YES | 2 | 0 | 1/2 | `screenshots/owner/ar/768/bookings-transport.png` |
| owner | ar | 768 | catalogue | WARN | no | 0 | 0 | 1/3 | `screenshots/owner/ar/768/catalogue.png` |
| owner | ar | 768 | customers | WARN | no | 0 | 0 | 1/4 | `screenshots/owner/ar/768/customers.png` |
| owner | ar | 768 | finance | WARN | no | 0 | 0 | 1/10 | `screenshots/owner/ar/768/finance.png` |
| owner | ar | 768 | overview | WARN | no | 2 | 0 | 1/4 | `screenshots/owner/ar/768/overview.png` |
| owner | ar | 768 | quotes | WARN | YES | 2 | 0 | 1/2 | `screenshots/owner/ar/768/quotes.png` |
| owner | ar | 768 | quotes-benefits | WARN | YES | 2 | 0 | 1/2 | `screenshots/owner/ar/768/quotes-benefits.png` |
| owner | ar | 768 | quotes-promotions | WARN | no | 0 | 0 | 2/14 | `screenshots/owner/ar/768/quotes-promotions.png` |
| owner | ar | 768 | quotes-reservations | WARN | YES | 2 | 0 | 1/2 | `screenshots/owner/ar/768/quotes-reservations.png` |
| owner | ar | 768 | settings | WARN | no | 0 | 0 | 1/3 | `screenshots/owner/ar/768/settings.png` |
| owner | ar | 768 | settings-access | WARN | no | 0 | 0 | 1/3 | `screenshots/owner/ar/768/settings-access.png` |
| owner | ar | 768 | warranties | WARN | no | 2 | 0 | 1/3 | `screenshots/owner/ar/768/warranties.png` |
| owner | ar | 768 | whatsapp | WARN | YES | 0 | 1 | 2/12 | `screenshots/owner/ar/768/whatsapp.png` |
| owner | ar | 768 | workshop | WARN | no | 0 | 0 | 2/7 | `screenshots/owner/ar/768/workshop.png` |
| owner | ar | 1280 | bookings | WARN | no | 2 | 0 | 1/3 | `screenshots/owner/ar/1280/bookings.png` |
| owner | ar | 1280 | bookings-transport | WARN | no | 2 | 0 | 1/3 | `screenshots/owner/ar/1280/bookings-transport.png` |
| owner | ar | 1280 | catalogue | WARN | no | 0 | 0 | 1/3 | `screenshots/owner/ar/1280/catalogue.png` |
| owner | ar | 1280 | customers | WARN | no | 0 | 0 | 1/4 | `screenshots/owner/ar/1280/customers.png` |
| owner | ar | 1280 | finance | WARN | no | 0 | 0 | 1/10 | `screenshots/owner/ar/1280/finance.png` |
| owner | ar | 1280 | overview | WARN | no | 2 | 0 | 1/4 | `screenshots/owner/ar/1280/overview.png` |
| owner | ar | 1280 | quotes | WARN | no | 2 | 0 | 1/3 | `screenshots/owner/ar/1280/quotes.png` |
| owner | ar | 1280 | quotes-benefits | WARN | no | 2 | 0 | 1/3 | `screenshots/owner/ar/1280/quotes-benefits.png` |
| owner | ar | 1280 | quotes-promotions | WARN | no | 0 | 0 | 2/14 | `screenshots/owner/ar/1280/quotes-promotions.png` |
| owner | ar | 1280 | quotes-reservations | WARN | no | 2 | 0 | 1/3 | `screenshots/owner/ar/1280/quotes-reservations.png` |
| owner | ar | 1280 | settings | WARN | no | 0 | 0 | 1/3 | `screenshots/owner/ar/1280/settings.png` |
| owner | ar | 1280 | settings-access | WARN | no | 0 | 0 | 1/3 | `screenshots/owner/ar/1280/settings-access.png` |
| owner | ar | 1280 | warranties | WARN | no | 2 | 0 | 1/3 | `screenshots/owner/ar/1280/warranties.png` |
| owner | ar | 1280 | whatsapp | WARN | no | 0 | 1 | 2/12 | `screenshots/owner/ar/1280/whatsapp.png` |
| owner | ar | 1280 | workshop | WARN | no | 0 | 0 | 2/7 | `screenshots/owner/ar/1280/workshop.png` |
| owner | en | 360 | bookings | WARN | no | 2 | 0 | 2/768 | `` |
| owner | en | 360 | bookings-transport | WARN | no | 2 | 0 | 2/104 | `screenshots/owner/en/360/bookings-transport.png` |
| owner | en | 360 | catalogue | WARN | no | 0 | 0 | 1/1 | `screenshots/owner/en/360/catalogue.png` |
| owner | en | 360 | customers | WARN | no | 0 | 0 | 2/69 | `screenshots/owner/en/360/customers.png` |
| owner | en | 360 | finance | WARN | no | 0 | 0 | 1/8 | `screenshots/owner/en/360/finance.png` |
| owner | en | 360 | overview | WARN | no | 2 | 0 | 2/74 | `screenshots/owner/en/360/overview.png` |
| owner | en | 360 | quotes | WARN | no | 2 | 0 | 2/662 | `` |
| owner | en | 360 | quotes-benefits | WARN | no | 2 | 0 | 2/95 | `screenshots/owner/en/360/quotes-benefits.png` |
| owner | en | 360 | quotes-promotions | WARN | no | 0 | 0 | 1/12 | `screenshots/owner/en/360/quotes-promotions.png` |
| owner | en | 360 | quotes-reservations | WARN | no | 2 | 0 | 2/47 | `screenshots/owner/en/360/quotes-reservations.png` |
| owner | en | 360 | settings | WARN | no | 0 | 0 | 1/1 | `screenshots/owner/en/360/settings.png` |
| owner | en | 360 | settings-access | WARN | no | 0 | 0 | 1/1 | `screenshots/owner/en/360/settings-access.png` |
| owner | en | 360 | warranties | WARN | no | 2 | 0 | 2/416 | `screenshots/owner/en/360/warranties.png` |
| owner | en | 360 | whatsapp | WARN | no | 0 | 1 | 1/4 | `screenshots/owner/en/360/whatsapp.png` |
| owner | en | 360 | workshop | WARN | no | 0 | 0 | 2/4 | `screenshots/owner/en/360/workshop.png` |
| owner | en | 768 | bookings | WARN | no | 2 | 0 | 1/2 | `screenshots/owner/en/768/bookings.png` |
| owner | en | 768 | bookings-transport | WARN | YES | 2 | 0 | 1/3 | `screenshots/owner/en/768/bookings-transport.png` |
| owner | en | 768 | catalogue | WARN | no | 0 | 0 | 1/3 | `screenshots/owner/en/768/catalogue.png` |
| owner | en | 768 | customers | WARN | no | 0 | 0 | 1/4 | `screenshots/owner/en/768/customers.png` |
| owner | en | 768 | finance | WARN | no | 0 | 0 | 1/10 | `screenshots/owner/en/768/finance.png` |
| owner | en | 768 | overview | WARN | no | 2 | 0 | 1/4 | `screenshots/owner/en/768/overview.png` |
| owner | en | 768 | quotes | WARN | YES | 2 | 0 | 1/2 | `screenshots/owner/en/768/quotes.png` |
| owner | en | 768 | quotes-benefits | WARN | YES | 2 | 0 | 1/2 | `screenshots/owner/en/768/quotes-benefits.png` |
| owner | en | 768 | quotes-promotions | WARN | no | 0 | 0 | 2/14 | `screenshots/owner/en/768/quotes-promotions.png` |
| owner | en | 768 | quotes-reservations | WARN | YES | 2 | 0 | 1/2 | `screenshots/owner/en/768/quotes-reservations.png` |
| owner | en | 768 | settings | WARN | no | 0 | 0 | 1/3 | `screenshots/owner/en/768/settings.png` |
| owner | en | 768 | settings-access | WARN | no | 0 | 0 | 1/3 | `screenshots/owner/en/768/settings-access.png` |
| owner | en | 768 | warranties | WARN | no | 2 | 0 | 1/3 | `screenshots/owner/en/768/warranties.png` |
| owner | en | 768 | whatsapp | WARN | YES | 0 | 1 | 2/12 | `screenshots/owner/en/768/whatsapp.png` |
| owner | en | 768 | workshop | WARN | no | 0 | 0 | 2/7 | `screenshots/owner/en/768/workshop.png` |
| owner | en | 1280 | bookings | WARN | no | 2 | 0 | 1/2 | `screenshots/owner/en/1280/bookings.png` |
| owner | en | 1280 | bookings-transport | WARN | no | 2 | 0 | 1/3 | `screenshots/owner/en/1280/bookings-transport.png` |
| owner | en | 1280 | catalogue | WARN | no | 0 | 0 | 1/3 | `screenshots/owner/en/1280/catalogue.png` |
| owner | en | 1280 | customers | WARN | no | 0 | 0 | 1/4 | `screenshots/owner/en/1280/customers.png` |
| owner | en | 1280 | finance | WARN | no | 0 | 0 | 1/10 | `screenshots/owner/en/1280/finance.png` |
| owner | en | 1280 | overview | WARN | YES | 2 | 0 | 1/4 | `screenshots/owner/en/1280/overview.png` |
| owner | en | 1280 | quotes | WARN | no | 2 | 0 | 1/3 | `screenshots/owner/en/1280/quotes.png` |
| owner | en | 1280 | quotes-benefits | WARN | no | 2 | 0 | 1/3 | `screenshots/owner/en/1280/quotes-benefits.png` |
| owner | en | 1280 | quotes-promotions | WARN | no | 0 | 0 | 2/14 | `screenshots/owner/en/1280/quotes-promotions.png` |
| owner | en | 1280 | quotes-reservations | WARN | no | 2 | 0 | 1/3 | `screenshots/owner/en/1280/quotes-reservations.png` |
| owner | en | 1280 | settings | WARN | no | 0 | 0 | 1/3 | `screenshots/owner/en/1280/settings.png` |
| owner | en | 1280 | settings-access | WARN | no | 0 | 0 | 1/3 | `screenshots/owner/en/1280/settings-access.png` |
| owner | en | 1280 | warranties | WARN | no | 2 | 0 | 1/3 | `screenshots/owner/en/1280/warranties.png` |
| owner | en | 1280 | whatsapp | WARN | no | 0 | 1 | 2/12 | `screenshots/owner/en/1280/whatsapp.png` |
| owner | en | 1280 | workshop | WARN | no | 0 | 0 | 2/7 | `screenshots/owner/en/1280/workshop.png` |
| receptionist | ar | 360 | bookings | WARN | no | 2 | 0 | 2/417 | `screenshots/receptionist/ar/360/bookings.png` |
| receptionist | ar | 360 | bookings-transport | WARN | no | 2 | 0 | 2/64 | `screenshots/receptionist/ar/360/bookings-transport.png` |
| receptionist | ar | 360 | customers | WARN | no | 0 | 0 | 2/62 | `screenshots/receptionist/ar/360/customers.png` |
| receptionist | ar | 360 | quotes | WARN | no | 2 | 0 | 2/340 | `screenshots/receptionist/ar/360/quotes.png` |
| receptionist | ar | 360 | quotes-benefits | WARN | no | 2 | 0 | 2/96 | `screenshots/receptionist/ar/360/quotes-benefits.png` |
| receptionist | ar | 360 | quotes-promotions | WARN | no | 0 | 0 | 2/13 | `screenshots/receptionist/ar/360/quotes-promotions.png` |
| receptionist | ar | 360 | quotes-reservations | WARN | no | 2 | 0 | 2/36 | `screenshots/receptionist/ar/360/quotes-reservations.png` |
| receptionist | ar | 360 | warranties | WARN | no | 2 | 0 | 2/239 | `screenshots/receptionist/ar/360/warranties.png` |
| receptionist | ar | 360 | whatsapp | WARN | no | 0 | 1 | 1/2 | `screenshots/receptionist/ar/360/whatsapp.png` |
| receptionist | ar | 768 | bookings | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/ar/768/bookings.png` |
| receptionist | ar | 768 | bookings-transport | WARN | YES | 2 | 0 | 1/2 | `screenshots/receptionist/ar/768/bookings-transport.png` |
| receptionist | ar | 768 | customers | WARN | no | 0 | 0 | 1/4 | `screenshots/receptionist/ar/768/customers.png` |
| receptionist | ar | 768 | quotes | WARN | YES | 2 | 0 | 1/2 | `screenshots/receptionist/ar/768/quotes.png` |
| receptionist | ar | 768 | quotes-benefits | WARN | YES | 2 | 0 | 1/2 | `screenshots/receptionist/ar/768/quotes-benefits.png` |
| receptionist | ar | 768 | quotes-promotions | WARN | no | 0 | 0 | 2/14 | `screenshots/receptionist/ar/768/quotes-promotions.png` |
| receptionist | ar | 768 | quotes-reservations | WARN | YES | 2 | 0 | 1/2 | `screenshots/receptionist/ar/768/quotes-reservations.png` |
| receptionist | ar | 768 | warranties | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/ar/768/warranties.png` |
| receptionist | ar | 768 | whatsapp | WARN | YES | 0 | 1 | 2/6 | `screenshots/receptionist/ar/768/whatsapp.png` |
| receptionist | ar | 1280 | bookings | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/ar/1280/bookings.png` |
| receptionist | ar | 1280 | bookings-transport | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/ar/1280/bookings-transport.png` |
| receptionist | ar | 1280 | customers | WARN | no | 0 | 0 | 1/4 | `screenshots/receptionist/ar/1280/customers.png` |
| receptionist | ar | 1280 | quotes | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/ar/1280/quotes.png` |
| receptionist | ar | 1280 | quotes-benefits | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/ar/1280/quotes-benefits.png` |
| receptionist | ar | 1280 | quotes-promotions | WARN | no | 0 | 0 | 2/14 | `screenshots/receptionist/ar/1280/quotes-promotions.png` |
| receptionist | ar | 1280 | quotes-reservations | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/ar/1280/quotes-reservations.png` |
| receptionist | ar | 1280 | warranties | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/ar/1280/warranties.png` |
| receptionist | ar | 1280 | whatsapp | WARN | no | 0 | 1 | 2/6 | `screenshots/receptionist/ar/1280/whatsapp.png` |
| receptionist | en | 360 | bookings | WARN | no | 2 | 0 | 2/416 | `screenshots/receptionist/en/360/bookings.png` |
| receptionist | en | 360 | bookings-transport | WARN | no | 2 | 0 | 2/63 | `screenshots/receptionist/en/360/bookings-transport.png` |
| receptionist | en | 360 | customers | WARN | no | 0 | 0 | 2/61 | `screenshots/receptionist/en/360/customers.png` |
| receptionist | en | 360 | quotes | WARN | no | 2 | 0 | 2/339 | `screenshots/receptionist/en/360/quotes.png` |
| receptionist | en | 360 | quotes-benefits | WARN | no | 2 | 0 | 2/95 | `screenshots/receptionist/en/360/quotes-benefits.png` |
| receptionist | en | 360 | quotes-promotions | WARN | no | 0 | 0 | 1/12 | `screenshots/receptionist/en/360/quotes-promotions.png` |
| receptionist | en | 360 | quotes-reservations | WARN | no | 2 | 0 | 2/35 | `screenshots/receptionist/en/360/quotes-reservations.png` |
| receptionist | en | 360 | warranties | WARN | no | 2 | 0 | 2/238 | `screenshots/receptionist/en/360/warranties.png` |
| receptionist | en | 360 | whatsapp | WARN | no | 0 | 1 | 1/4 | `screenshots/receptionist/en/360/whatsapp.png` |
| receptionist | en | 768 | bookings | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/en/768/bookings.png` |
| receptionist | en | 768 | bookings-transport | WARN | YES | 2 | 0 | 1/3 | `screenshots/receptionist/en/768/bookings-transport.png` |
| receptionist | en | 768 | customers | WARN | no | 0 | 0 | 1/4 | `screenshots/receptionist/en/768/customers.png` |
| receptionist | en | 768 | quotes | WARN | YES | 2 | 0 | 1/2 | `screenshots/receptionist/en/768/quotes.png` |
| receptionist | en | 768 | quotes-benefits | WARN | YES | 2 | 0 | 1/2 | `screenshots/receptionist/en/768/quotes-benefits.png` |
| receptionist | en | 768 | quotes-promotions | WARN | no | 0 | 0 | 2/14 | `screenshots/receptionist/en/768/quotes-promotions.png` |
| receptionist | en | 768 | quotes-reservations | WARN | YES | 2 | 0 | 1/2 | `screenshots/receptionist/en/768/quotes-reservations.png` |
| receptionist | en | 768 | warranties | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/en/768/warranties.png` |
| receptionist | en | 768 | whatsapp | WARN | YES | 0 | 1 | 2/12 | `screenshots/receptionist/en/768/whatsapp.png` |
| receptionist | en | 1280 | bookings | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/en/1280/bookings.png` |
| receptionist | en | 1280 | bookings-transport | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/en/1280/bookings-transport.png` |
| receptionist | en | 1280 | customers | WARN | no | 0 | 0 | 1/4 | `screenshots/receptionist/en/1280/customers.png` |
| receptionist | en | 1280 | quotes | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/en/1280/quotes.png` |
| receptionist | en | 1280 | quotes-benefits | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/en/1280/quotes-benefits.png` |
| receptionist | en | 1280 | quotes-promotions | WARN | no | 0 | 0 | 2/14 | `screenshots/receptionist/en/1280/quotes-promotions.png` |
| receptionist | en | 1280 | quotes-reservations | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/en/1280/quotes-reservations.png` |
| receptionist | en | 1280 | warranties | WARN | no | 2 | 0 | 1/3 | `screenshots/receptionist/en/1280/warranties.png` |
| receptionist | en | 1280 | whatsapp | WARN | no | 0 | 1 | 2/12 | `screenshots/receptionist/en/1280/whatsapp.png` |
| technician | ar | 360 | workshop | WARN | no | 0 | 0 | 1/2 | `screenshots/technician/ar/360/workshop.png` |
| technician | ar | 768 | workshop | WARN | no | 0 | 0 | 1/4 | `screenshots/technician/ar/768/workshop.png` |
| technician | ar | 1280 | workshop | WARN | no | 0 | 0 | 1/4 | `screenshots/technician/ar/1280/workshop.png` |
| technician | en | 360 | workshop | WARN | no | 0 | 0 | 1/1 | `screenshots/technician/en/360/workshop.png` |
| technician | en | 768 | workshop | WARN | no | 0 | 0 | 1/4 | `screenshots/technician/en/768/workshop.png` |
| technician | en | 1280 | workshop | WARN | no | 0 | 0 | 1/4 | `screenshots/technician/en/1280/workshop.png` |

## Details for FAIL and WARN rows

### WARN: branch-manager / ar / 360px / bookings
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function bookingsPage} lang="ar" pageProps={{lang:"ar", ...}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x415, color-contrast[serious]x2

### WARN: branch-manager / ar / 360px / bookings-transport
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function bookingsPage} lang="ar" pageProps={{lang:"ar", ...}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x62, color-contrast[serious]x2

### WARN: branch-manager / ar / 360px / customers
- 2 axe rule(s) violated
- axe: nested-interactive[serious]x59, color-contrast[serious]x3

### WARN: branch-manager / ar / 360px / finance
- 1 axe rule(s) violated
- axe: color-contrast[serious]x3

### WARN: branch-manager / ar / 360px / overview
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <RouteChunk loader={function overviewPage} lang="ar" pageProps={{lang:"ar", ...}}>       <ChunkErrorBoundary lang="ar" retry={function retry}>         <Suspense fallback={<div>}>           <...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x48, color-contrast[serious]x2

### WARN: branch-manager / ar / 360px / quotes
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="ar" pageProps={{lang:"ar"}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x338, color-contrast[serious]x2

### WARN: branch-manager / ar / 360px / quotes-benefits
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="ar" pageProps={{lang:"ar"}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x94, color-contrast[serious]x2

### WARN: branch-manager / ar / 360px / quotes-promotions
- 2 axe rule(s) violated
- axe: listitem[serious]x12, color-contrast[serious]x1

### WARN: branch-manager / ar / 360px / quotes-reservations
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="ar" pageProps={{lang:"ar"}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x34, color-contrast[serious]x2

### WARN: branch-manager / ar / 360px / warranties
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function warrantiesPage} lang="ar" pageProps={{lang:"ar", ...}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>         ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x237, color-contrast[serious]x2

### WARN: branch-manager / ar / 360px / whatsapp
- 1 API 4xx response(s)
- 1 axe rule(s) violated
- API 404 GET /api/whatsapp/consents?channelId=&customerId=&purpose= {"code":"CONSENT_NOT_FOUND"}
- axe: color-contrast[serious]x2

### WARN: branch-manager / ar / 360px / workshop
- 2 axe rule(s) violated
- axe: color-contrast[serious]x3, aria-valid-attr-value[critical]x1

### WARN: branch-manager / ar / 768px / bookings
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function bookingsPage} lang="ar" pageProps={{lang:"ar", ...}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / ar / 768px / bookings-transport
- horizontal overflow at 768px
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function bookingsPage} lang="ar" pageProps={{lang:"ar", ...}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- overflow: scrollWidth 988 > 768; offenders: div.action-row (+220px), button.btn.btn-primary (+220px), div.data-table-wrap (+220px), div.table-wrap (+220px), table.data-table (+219px), thead (+219px)
- axe: color-contrast[serious]x2

### WARN: branch-manager / ar / 768px / customers
- 1 axe rule(s) violated
- axe: color-contrast[serious]x4

### WARN: branch-manager / ar / 768px / finance
- 1 axe rule(s) violated
- axe: color-contrast[serious]x10

### WARN: branch-manager / ar / 768px / overview
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <RouteChunk loader={function overviewPage} lang="ar" pageProps={{lang:"ar", ...}}>       <ChunkErrorBoundary lang="ar" retry={function retry}>         <Suspense fallback={<div>}>           <...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x4

### WARN: branch-manager / ar / 768px / quotes
- horizontal overflow at 768px
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="ar" pageProps={{lang:"ar"}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- overflow: scrollWidth 965 > 768; offenders: header.page-heading (+197px), div.tabbar (+197px), div#offers-panel-quotes (+197px), div.qo-page (+197px), div.qo-row (+197px), div.filter-bar (+197px)
- axe: color-contrast[serious]x2

### WARN: branch-manager / ar / 768px / quotes-benefits
- horizontal overflow at 768px
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="ar" pageProps={{lang:"ar"}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- overflow: scrollWidth 831 > 768; offenders: header.page-heading (+63px), div.tabbar (+63px), div#offers-panel-benefits (+63px), div.qo-page (+63px), div.filter-bar (+63px), span.filter-bar-count (+63px)
- axe: color-contrast[serious]x2

### WARN: branch-manager / ar / 768px / quotes-promotions
- 2 axe rule(s) violated
- axe: listitem[serious]x12, color-contrast[serious]x2

### WARN: branch-manager / ar / 768px / quotes-reservations
- horizontal overflow at 768px
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="ar" pageProps={{lang:"ar"}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- overflow: scrollWidth 904 > 768; offenders: header.page-heading (+136px), div.tabbar (+136px), div#offers-panel-reservations (+136px), div.qo-page (+136px), div.qo-row (+136px), div.filter-bar (+136px)
- axe: color-contrast[serious]x2

### WARN: branch-manager / ar / 768px / warranties
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function warrantiesPage} lang="ar" pageProps={{lang:"ar", ...}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>         ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / ar / 768px / whatsapp
- horizontal overflow at 768px
- 1 API 4xx response(s)
- 2 axe rule(s) violated
- API 404 GET /api/whatsapp/consents?channelId=&customerId=&purpose= {"code":"CONSENT_NOT_FOUND"}
- overflow: scrollWidth 776 > 768; offenders: p.wa-composer-note (+8px), div.wa-composer-row (+8px), button.btn.btn-primary (+8px)
- axe: color-contrast[serious]x11, scrollable-region-focusable[serious]x1

### WARN: branch-manager / ar / 768px / workshop
- 2 axe rule(s) violated
- axe: color-contrast[serious]x6, aria-valid-attr-value[critical]x1

### WARN: branch-manager / ar / 1280px / bookings
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function bookingsPage} lang="ar" pageProps={{lang:"ar", ...}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / ar / 1280px / bookings-transport
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function bookingsPage} lang="ar" pageProps={{lang:"ar", ...}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / ar / 1280px / customers
- 1 axe rule(s) violated
- axe: color-contrast[serious]x4

### WARN: branch-manager / ar / 1280px / finance
- 1 axe rule(s) violated
- axe: color-contrast[serious]x10

### WARN: branch-manager / ar / 1280px / overview
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <RouteChunk loader={function overviewPage} lang="ar" pageProps={{lang:"ar", ...}}>       <ChunkErrorBoundary lang="ar" retry={function retry}>         <Suspense fallback={<div>}>           <...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x4

### WARN: branch-manager / ar / 1280px / quotes
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="ar" pageProps={{lang:"ar"}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / ar / 1280px / quotes-benefits
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="ar" pageProps={{lang:"ar"}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / ar / 1280px / quotes-promotions
- 2 axe rule(s) violated
- axe: listitem[serious]x12, color-contrast[serious]x2

### WARN: branch-manager / ar / 1280px / quotes-reservations
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="ar" pageProps={{lang:"ar"}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / ar / 1280px / warranties
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function warrantiesPage} lang="ar" pageProps={{lang:"ar", ...}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>         ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / ar / 1280px / whatsapp
- 1 API 4xx response(s)
- 2 axe rule(s) violated
- API 404 GET /api/whatsapp/consents?channelId=&customerId=&purpose= {"code":"CONSENT_NOT_FOUND"}
- axe: color-contrast[serious]x11, scrollable-region-focusable[serious]x1

### WARN: branch-manager / ar / 1280px / workshop
- 2 axe rule(s) violated
- axe: color-contrast[serious]x6, aria-valid-attr-value[critical]x1

### WARN: branch-manager / en / 360px / bookings
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function bookingsPage} lang="en" pageProps={{lang:"en", ...}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x415, color-contrast[serious]x1

### WARN: branch-manager / en / 360px / bookings-transport
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function bookingsPage} lang="en" pageProps={{lang:"en", ...}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x62, color-contrast[serious]x1

### WARN: branch-manager / en / 360px / customers
- 2 axe rule(s) violated
- axe: nested-interactive[serious]x59, color-contrast[serious]x2

### WARN: branch-manager / en / 360px / finance
- 1 axe rule(s) violated
- axe: color-contrast[serious]x8

### WARN: branch-manager / en / 360px / overview
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <RouteChunk loader={function overviewPage} lang="en" pageProps={{lang:"en", ...}}>       <ChunkErrorBoundary lang="en" retry={function retry}>         <Suspense fallback={<div>}>           <...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x48, color-contrast[serious]x2

### WARN: branch-manager / en / 360px / quotes
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="en" pageProps={{lang:"en"}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x338, color-contrast[serious]x1

### WARN: branch-manager / en / 360px / quotes-benefits
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="en" pageProps={{lang:"en"}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x94, color-contrast[serious]x1

### WARN: branch-manager / en / 360px / quotes-promotions
- 1 axe rule(s) violated
- axe: listitem[serious]x12

### WARN: branch-manager / en / 360px / quotes-reservations
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="en" pageProps={{lang:"en"}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x34, color-contrast[serious]x1

### WARN: branch-manager / en / 360px / warranties
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function warrantiesPage} lang="en" pageProps={{lang:"en", ...}}>         <ChunkErrorBoundary lang="en" retry={function retry}>         ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x237, color-contrast[serious]x1

### WARN: branch-manager / en / 360px / whatsapp
- 1 API 4xx response(s)
- 1 axe rule(s) violated
- API 404 GET /api/whatsapp/consents?channelId=&customerId=&purpose= {"code":"CONSENT_NOT_FOUND"}
- axe: color-contrast[serious]x4

### WARN: branch-manager / en / 360px / workshop
- 2 axe rule(s) violated
- axe: color-contrast[serious]x3, aria-valid-attr-value[critical]x1

### WARN: branch-manager / en / 768px / bookings
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function bookingsPage} lang="en" pageProps={{lang:"en", ...}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / en / 768px / bookings-transport
- horizontal overflow at 768px
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function bookingsPage} lang="en" pageProps={{lang:"en", ...}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- overflow: scrollWidth 1009 > 768; offenders: div.action-row (+241px), button.btn.btn-primary (+241px), div.data-table-wrap (+241px), div.table-wrap (+241px), table.data-table (+240px), thead (+240px)
- axe: color-contrast[serious]x3

### WARN: branch-manager / en / 768px / customers
- 1 axe rule(s) violated
- axe: color-contrast[serious]x4

### WARN: branch-manager / en / 768px / finance
- 1 axe rule(s) violated
- axe: color-contrast[serious]x10

### WARN: branch-manager / en / 768px / overview
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <RouteChunk loader={function overviewPage} lang="en" pageProps={{lang:"en", ...}}>       <ChunkErrorBoundary lang="en" retry={function retry}>         <Suspense fallback={<div>}>           <...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x4

### WARN: branch-manager / en / 768px / quotes
- horizontal overflow at 768px
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="en" pageProps={{lang:"en"}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- overflow: scrollWidth 1019 > 768; offenders: header.page-heading (+251px), div.tabbar (+251px), div#offers-panel-quotes (+251px), div.qo-page (+251px), div.qo-row (+251px), div.filter-bar (+251px)
- axe: color-contrast[serious]x2

### WARN: branch-manager / en / 768px / quotes-benefits
- horizontal overflow at 768px
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="en" pageProps={{lang:"en"}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- overflow: scrollWidth 863 > 768; offenders: header.page-heading (+95px), div.tabbar (+95px), div#offers-panel-benefits (+95px), div.qo-page (+95px), div.filter-bar (+95px), span.filter-bar-count (+95px)
- axe: color-contrast[serious]x2

### WARN: branch-manager / en / 768px / quotes-promotions
- 2 axe rule(s) violated
- axe: listitem[serious]x12, color-contrast[serious]x2

### WARN: branch-manager / en / 768px / quotes-reservations
- horizontal overflow at 768px
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="en" pageProps={{lang:"en"}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- overflow: scrollWidth 918 > 768; offenders: header.page-heading (+150px), div.tabbar (+150px), div#offers-panel-reservations (+150px), div.qo-page (+150px), div.qo-row (+150px), div.filter-bar (+150px)
- axe: color-contrast[serious]x2

### WARN: branch-manager / en / 768px / warranties
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function warrantiesPage} lang="en" pageProps={{lang:"en", ...}}>         <ChunkErrorBoundary lang="en" retry={function retry}>         ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / en / 768px / whatsapp
- horizontal overflow at 768px
- 1 API 4xx response(s)
- 2 axe rule(s) violated
- API 404 GET /api/whatsapp/consents?channelId=&customerId=&purpose= {"code":"CONSENT_NOT_FOUND"}
- overflow: scrollWidth 780 > 768; offenders: p.wa-composer-note (+12px), div.wa-composer-row (+12px), button.btn.btn-primary (+12px)
- axe: color-contrast[serious]x11, scrollable-region-focusable[serious]x1

### WARN: branch-manager / en / 768px / workshop
- 2 axe rule(s) violated
- axe: color-contrast[serious]x6, aria-valid-attr-value[critical]x1

### WARN: branch-manager / en / 1280px / bookings
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function bookingsPage} lang="en" pageProps={{lang:"en", ...}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / en / 1280px / bookings-transport
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function bookingsPage} lang="en" pageProps={{lang:"en", ...}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / en / 1280px / customers
- 1 axe rule(s) violated
- axe: color-contrast[serious]x4

### WARN: branch-manager / en / 1280px / finance
- 1 axe rule(s) violated
- axe: color-contrast[serious]x10

### WARN: branch-manager / en / 1280px / overview
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <RouteChunk loader={function overviewPage} lang="en" pageProps={{lang:"en", ...}}>       <ChunkErrorBoundary lang="en" retry={function retry}>         <Suspense fallback={<div>}>           <...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x4

### WARN: branch-manager / en / 1280px / quotes
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="en" pageProps={{lang:"en"}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / en / 1280px / quotes-benefits
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="en" pageProps={{lang:"en"}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / en / 1280px / quotes-promotions
- 2 axe rule(s) violated
- axe: listitem[serious]x12, color-contrast[serious]x2

### WARN: branch-manager / en / 1280px / quotes-reservations
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="en" pageProps={{lang:"en"}}>         <ChunkErrorBoundary lang="en" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / en / 1280px / warranties
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function warrantiesPage} lang="en" pageProps={{lang:"en", ...}}>         <ChunkErrorBoundary lang="en" retry={function retry}>         ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x3

### WARN: branch-manager / en / 1280px / whatsapp
- 1 API 4xx response(s)
- 2 axe rule(s) violated
- API 404 GET /api/whatsapp/consents?channelId=&customerId=&purpose= {"code":"CONSENT_NOT_FOUND"}
- axe: color-contrast[serious]x11, scrollable-region-focusable[serious]x1

### WARN: branch-manager / en / 1280px / workshop
- 2 axe rule(s) violated
- axe: color-contrast[serious]x6, aria-valid-attr-value[critical]x1

### WARN: owner / ar / 360px / bookings
- 2 console error(s)
- 1 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function bookingsPage} lang="ar" pageProps={{lang:"ar", ...}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: color-contrast[serious]x1

### WARN: owner / ar / 360px / bookings-transport
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function bookingsPage} lang="ar" pageProps={{lang:"ar", ...}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           ...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x103, color-contrast[serious]x2

### WARN: owner / ar / 360px / catalogue
- 1 axe rule(s) violated
- axe: color-contrast[serious]x2

### WARN: owner / ar / 360px / customers
- 2 axe rule(s) violated
- axe: nested-interactive[serious]x67, color-contrast[serious]x3

### WARN: owner / ar / 360px / finance
- 1 axe rule(s) violated
- axe: color-contrast[serious]x3

### WARN: owner / ar / 360px / overview
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <RouteChunk loader={function overviewPage} lang="ar" pageProps={{lang:"ar", ...}}>       <ChunkErrorBoundary lang="ar" retry={function retry}>         <Suspense fallback={<div>}>           <...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x72, color-contrast[serious]x2

### WARN: owner / ar / 360px / quotes
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="ar" pageProps={{lang:"ar"}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x661, color-contrast[serious]x2

### WARN: owner / ar / 360px / quotes-benefits
- 2 console error(s)
- 2 axe rule(s) violated
- console: In HTML, %s cannot be a descendant of <%s>. This will cause a hydration error.%s <button> button     ...     <main className="page-wrap">       <RouteChunk loader={function quotesPage} lang="ar" pageProps={{lang:"ar"}}>         <ChunkErrorBoundary lang="ar" retry={function retry}>           <Suspen...
- console: <%s> cannot contain a nested %s. See this log for the ancestor stack trace. button <button>
- axe: nested-interactive[serious]x94, color-contrast[serious]x2

(142 more rows in report.json)
