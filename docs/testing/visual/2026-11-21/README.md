# Visual check reference - 21 November 2026

First full run of the manual "Visual checks" workflow (run 44959215133, commit `e23a4a9`, seeded dataset dated
2026-11-21T10:00:00Z). 222 pages (4 roles x en/ar x 360/768/1280 px) plus 19 flows.

This folder is a **compact reference**, not the full artifact. The complete set (234 screenshots, about 170 MB, plus the
quote print PDFs) stays in the GitHub run artifacts for 14 days and is not committed. The downloaded zips are git-ignored.

| File | What it is |
|---|---|
| `report.md` / `report.json` | Per page and flow: status, overflow, console errors, API failures, axe counts |
| `server.log` | Server log of the run (it exposed the vehicle and customer 360 HTTP 500) |
| `screenshots/` | Top of 16 key pages: owner en/ar at 1280, owner at 768 and 360, receptionist and technician |

## Findings from this run and their status

| Finding | Status |
|---|---|
| `GET /api/vehicles/:id/360` and `/api/customers/:id/360` returned 500: some section queries sent 4 bind parameters while their SQL used 3 | Fixed (`paramsFor` in relations-service, with a test). Needs a rerun to confirm. |
| 120+ console errors "button cannot contain a nested button" and axe `nested-interactive`: mobile data cards were buttons that contained RecordRef buttons | Fixed in `DataTable` (cards are now keyboard-operable divs). Needs a rerun. |
| Horizontal overflow at 768 px on Quotes (+251 px), Reservations, Benefits, Bookings > Transport and the WhatsApp composer | CSS constrained. Needs a rerun. |
| Axe colour-contrast (about 70 pages) | Open |
| `GET /api/whatsapp/consents` 404 `CONSENT_NOT_FOUND` when a customer has no consent record | Open (should show "missing", not an error) |
| `GET /api/promotions` 404 (no such route; the Quotes page falls back to a workaround) | Open |
| Finance and Warranties print buttons not found by the flow | Open (check the selector or add the buttons) |
| Screenshot timeout on owner/en/360 Bookings and Quotes | Open (very long pages) |
