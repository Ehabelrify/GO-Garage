# Visual traceability and update map

**Snapshot:** `8b79b750aa028ec5fcb0d77e6772724e573a522b`. Reinspect after Claude's concurrent branch is merged or pushed. Paths are ownership locations, not instructions to edit before the design and implementation plan are approved.

## Visual-to-scope matrix

| Board | Scope/state | Primary tracker coverage | Current UI ownership | Server/domain ownership | Likely future update locations |
|---|---|---|---|---|---|
| 01 Brand system | Proposed product identity; approved direction pending production assets | P1-015, P1-017, P1-030, P1-047 | `apps/web/public/{logo,favicon}.svg`; `apps/web/src/app/{App,AuthApp}.tsx`; `apps/web/src/shared/styles/*`; `apps/web/src/app/login.css` | None | Add master-brand tokens without replacing semantic danger/warning tokens; create light/dark/compact logo assets; update visual baselines |
| 02 Owner overview | Implemented; ready for retest; branded presentation proposed | P1-029, P1-033, P1-034, P1-036, P1-047 | `features/overview/*`; `shared/components/{PageHeader,DataTable,StatusBadge}.tsx` | `features/finance/*`; `features/operations/work-queues.ts` | Metric-definition approval, trend source validation, drill-down and responsive/RTL visual checks |
| 03 Reception/inbox/booking | Mixed: implemented simulator/inbox and booking foundations; live provider/readiness incomplete | P1-001, P1-002, P1-006-P1-008, P1-011, P1-014, P1-018-P1-020, P1-026, P1-027, P1-032, P1-037, P1-038, P1-045-P1-047 | `features/whatsapp/*`; `features/bookings/*`; `features/transport/*`; `app/navigation.ts` | `server/features/whatsapp/*`; `server/features/operations/{api,availability-service,booking-service}.ts`; `server/features/commercial/{transport-routes,transport-service}.ts`; `packages/domain/src/{whatsapp-journey,transport,rules}.ts` | Provider configuration/status, central membership, number/channel map, atomic booking path, capacity/date retest, message retries, consent and mobile/RTL verification |
| 04 Workshop/technician/QC | Implemented foundations; visual workflow consolidation and retest needed | P1-009, P1-012, P1-013, P1-036-P1-038, P1-047 | `features/workshop/*`; shared form/drawer/dialog/status components | `server/features/operations/{api,work-queue-routes,work-queues}.ts`; `packages/domain/src/{rules,types}.ts` | Intake sequence/evidence contract, assignment explanations, QC/rework ownership, mobile/tablet acceptance and stage-copy approval |
| 05 Customer/Vehicle 360 | Implemented; migrations/seed and runtime retest outstanding | P1-046-P1-053, P1-060 | `features/customers/*`; `features/special-requests/*`; `app/record-registry.tsx`; `shared/components/{GlobalSearch,RecordRef}.tsx` | `server/features/{relations,special-requests,owner-records}/*`; operations customer routes; migrations `0027`, `0028`, `0032` | Apply/rehearse migrations in disposable environment, duplicate/plate/permission retest, archive/restore audit, special-request notification policy |
| 06 Commercial workflow | Implemented foundations; business policy and runtime retest outstanding | P1-039, P1-040, P1-042, P1-044, P1-055-P1-057 | `features/{catalogue,quotes,reservations,benefits,promotions}/*`; `shared/print/*` | `server/features/commercial/*`; `packages/domain/src/{catalogue,quotes,reservations,benefits,qualification,commercial-policy}.ts`; migrations `0011`-`0020` | Approved catalogue/price/tax evidence, historical-version retest, concurrency/duplicate redemption, bilingual print review, reservation-to-installation handoff |
| 07 Warranty/aftercare | Implemented foundations; owner policy, migrations and runtime retest outstanding | P1-021, P1-022, P1-028, P1-035, P1-041, P1-049, P1-054, P1-059 | `features/warranty/*`; `shared/print/*` | `server/features/warranty/*`; `packages/domain/src/warranty-terms.ts`; migrations `0003`-`0009`, `0019` | Fixed/lifetime migration compatibility, issued-term history, claim/QR privacy, invoice currency lock, owner terms and public-field approval |
| 08 Finance/reporting/inventory | Finance implemented with sample definitions; inventory is future concept | P1-029, P1-033, P1-034, P1-047, P1-054, P1-058, P1-059 | `features/{finance,invoices,overview}/*`; `shared/print/*` | `server/features/{finance,invoicing}/*`; migration `0022`, `0030`; seed finance projections | Accountant-approved definitions, source/reversal retest, branch/date/currency drill-down, inventory/purchasing spec if moved into a release |
| 09 Settings/readiness/roadmap | Access/settings implemented; operational gates incomplete; roadmap is discussion material | P1-023-P1-025, P1-030, P1-031, P1-038, P1-045-P1-050 | `features/{settings,staff,demo-auth}/*`; `app/{App,AuthApp,navigation}.tsx` | `server/features/{auth,seed,operations,owner-records}/*`; migrations `0015`, `0026`; `server/index.ts` | Retest and migration rehearsal, provider E2E, go-live purge, backup/restore, policy approval, pilot, training and production sign-off |

## Shared visual-system update locations

| Concern | Current authority | Planning note |
|---|---|---|
| Color, radius, shadow, layers | `apps/web/src/shared/styles/tokens.css` | Add brand tokens separately from semantic tones. Red brand emphasis must not make normal actions look destructive; yellow-gold must not replace all warning semantics. |
| Base typography and controls | `apps/web/src/shared/styles/base.css` | Keep IBM Plex Sans/Arabic for UI and mixed-script reliability. Treat the custom wordmark as artwork rather than forcing a display font into Arabic UI. |
| Shell, sidebar, top bar, mobile nav | `apps/web/src/shared/styles/layout.css`; `apps/web/src/app/App.tsx` | Preserve role/capability navigation and mobile overflow behavior. Replace the wrench/“Garage OS” presentation with GO Stores assets after owner approval. |
| Shared components | `apps/web/src/shared/styles/components.css`; `apps/web/src/shared/components/*` | Brand shared primitives first; avoid feature-local parallel buttons, badges, tables, drawers or forms. |
| Login/Clerk | `apps/web/src/app/AuthApp.tsx`; `apps/web/src/app/login.css` | Update logo and appearance variables while preserving invite-only behavior and Arabic localization. |
| Print documents | `apps/web/src/shared/print/*` | Add approved business logo/details to the existing document model. Preserve print isolation and one-currency-per-total rules. |
| Responsive/RTL baselines | `scripts/visual/*`; `docs/testing/visual/*`; `.github/workflows/visual.yml` | Regenerate only after source work; compare 360/768/1280, EN/AR, and relevant roles. Generated concept boards are not regression baselines. |

## Requirement and status sources

- Accepted product direction: `docs/product/PRODUCT_DIRECTION_AND_RELEASES.md`
- Baseline product requirements: `docs/product/PRD.md`
- UX principles: `docs/product/DESIGN_SYSTEM.md`
- Shared interface patterns: `docs/product/UI_PATTERNS.md`
- Current tracker: `docs/testing/PHASE_1_ISSUES_TRACKER.md`
- Delivery phases: `docs/operations/DELIVERY_PLAN.md`
- Full-plan handover: `docs/operations/PHASE_1_FULL_PLAN_HANDOVER.md`
- Owner discovery: `docs/product/OWNER_MEETING_PLAYBOOK.md`
- Evidence limits: `docs/product/GO_STORES_FACTS_2026-11-16.md`

## Tracker caveats

- Do not close an issue because a visual exists.
- Do not mark Ready for retest as Verified without recorded acceptance evidence.
- Do not promote a sample price, warranty term, branch, capacity value, staff identity, or finance definition into product policy.
- P1-030 and P1-031 remain Open. The visual suite organizes discussion but does not complete their discovery or owner approval.
- Claude is modifying features on another machine. Refresh remote refs and redo the source/status inspection before writing the final implementation plan.
