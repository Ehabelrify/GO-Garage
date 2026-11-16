# Garage OS — accepted product direction and release scope

**Recorded:** 16 November 2026. **Authority:** direct user approval of all researched recommendations/additions and instruction to build a full functional product with auxiliary demonstration layers and phased future versions.

## Accepted direction

Garage OS is the operational product for Go Stores. Demonstration/training is an isolated auxiliary layer over its real workflows, with fictional users, customers and external events. It must reuse operational domain services, authorization and validation; it must not define a simplified alternative product, mix live and fictional records, or claim simulated external success as real delivery. Future modules ship in explicitly scoped phases/versions.

Product approval establishes feature scope, **not** the owner's prices, warranty contract, calendar, capacity, discount eligibility or staff permissions. [Research facts](GO_STORES_FACTS_2026-11-16.md) document sources and limits. The [dossier](GO_STORES_MEETING_DOSSIER_2026-11-16.md) supplies analysis. Unknown operating policy remains configurable or explicitly unconfigured.

## Approved capability map

| Accepted capability | Canonical tracker owner | Boundary |
|---|---|---|
| Functional product, auxiliary demonstration/training, phased delivery | P1-038 | Real persistence, authorization and external-status truth; no fake completion. |
| Go Stores catalogue, vehicle/coverage-aware packages and versioned accepted quotations | P1-039 | Grade, thickness, vehicle category, roof, add-ons, currency and agreement evidence. |
| Deferred promotion reservations | P1-040 | Preserve offer/price/eligibility separately from installation capacity; deposit reference is not accounting. |
| Fixed-term and owner-defined lifetime warranty support | P1-041; P1-028/P1-035 | Preserve issued terms; do not replace lifetime with an arbitrary fixed expiry. |
| Included-benefit and aftercare entitlements | P1-042 | Record promises, limits, eligibility and redemption without inventing unlimited service. |
| Transport/VIP coordination | P1-043 | Collection/return, provider/responsibility, timing and state; no implicit full fleet platform. |
| Referral, warranty-card, membership and multi-car promotion qualification/redemption | P1-044 | Auditable entitlement; discount transfer does not imply warranty transfer. |
| Six-number central WhatsApp inbox, structured enquiry, booking and handoff | P1-026/P1-027/P1-032; P1-039 | One central team; receiving number is reply channel; selected branch determines availability. |
| Owner exceptions, useful filters/drill-down and truthful finance definitions | P1-029/P1-033/P1-034/P1-036 | Reliable sources; drafts/quotes are not collections, revenue or profit. |
| Recognizable service content, business reference and role journeys | P1-031/P1-038/P1-039 | No real staff accounts/permissions or live business rules inferred from social profiles. |

All original defects and research findings remain in the [Phase 1 tracker](../testing/PHASE_1_ISSUES_TRACKER.md). Feature acceptance does not close an issue. Current source still has role/branch operations, bookings/capacity, jobs, settings, warranties/claims/evidence and invoice drafts; WhatsApp remains simulated with provider delivery disabled. Inventory, full accounting/POS and live/scheduled messaging are not established as implemented. Product intent does not establish production readiness.

## Planning and release requirements

The next-session task is to create the full plan, following the [handover](../operations/PHASE_1_FULL_PLAN_HANDOVER.md), before implementation. Cover **P1-001–P1-044** with an explicit coverage/dependency matrix, coherent vertical slices, release assignment and acceptance checks. No requirement may disappear because it is scheduled for a later version. Tracker prefix means intake, not a promise every enhancement ships in the first release; deferrals need an explicit reason and recorded authority.

Recommended dependency order, for the planner to refine:

1. Verify baseline; address booking/date/access/build/data-integrity dependencies and operational/demo isolation.
2. Establish catalogue/package/quote contracts and central inbox context; distinguish reserved offers from scheduled workshop slots.
3. Deliver quotation/reservation-to-job-to-warranty flows with historical terms and fixed/lifetime compatibility.
4. Layer benefit redemption, transport and promotion qualification over those records.
5. Complete owner exception/reporting slices, configured provider delivery and operational pilot gates for each release.

Keep the six-number central inbox as a core accepted requirement. Preserve automatic booking after customer confirmation; do not restore routine staff approval as the normal successful path. Reuse existing domain, booking, job, warranty-version, claim/evidence and RBAC foundations. Preserve React/Vite, Express, PostgreSQL, Clerk, `@garage/domain`, Replit control paths and port configuration unless separately justified and approved.

No timeline or implementation completion is implied. Test against fictional fixtures and disposable databases; verify intended environments before migrations/seeds. No external messaging activation, production publication, Git commit or push is authorized by this documentation task. No new feature shortlist approval is needed: the user already approved the scope. Exact business parameters and later plan review remain distinct from that approval.
