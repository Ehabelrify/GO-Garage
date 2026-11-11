# Garage OS — Decisions, Assumptions, and Configuration Register

## 1. Discovery status — read first

**Owner discovery status: NOT YET COMPLETED.** The second meeting is intended to validate the operating model and select policies. The user cannot confirm these policies on the owner's behalf. Therefore, all detailed operating choices below are **unknown / proposed**, not approved.

Product direction and engineering safeguards are established for this brief; operational policy remains configurable. Use `OWNER_MEETING_PLAYBOOK.md` to present the options and record the owner's decisions. Do not continue asking the user to choose unknown business policies.

Status vocabulary:
- **Established direction:** product-level requirement already agreed for this project.
- **Proposed default [ASSUMED]:** safe starting point for demo/development; not a Go Stores policy.
- **Owner decision required:** must be discussed and approved before live operation.
- **Owner approved:** only after an explicit decision is recorded with approver and date.

## 2. Established product direction

| Area | Direction | Status |
|---|---|---|
| Business | Go Stores; two known branches in Egypt | Established |
| Product | Garage OS as a real operations platform | Established |
| Customer channel | WhatsApp-first customer experience | Established |
| Staff interface | Responsive internal PWA | Established |
| Languages | Arabic and English; Arabic default for staff | Established |
| Branch model | Must support independent, shared, or mixed operations | Configurable; owner decision required |
| Roles | Owner, Branch Manager, Receptionist, Technician as baseline roles | Proposed baseline; permissions configurable |
| Inbox | Consolidated inbox for configured reception numbers | Established direction |
| Booking | Record drop-off and expected pickup date/time | Established |
| Job lifecycle | Booked, Received, In service, QC, Ready, Delivered; No-show and Cancelled | Proposed baseline; owner to validate |
| Capacity | Branch/service-aware capacity with overbooking protection | Established; parameters unknown |
| Technician devices | Support personal phones and shared tablets | Established |
| Warranty | Warranty record and QR/public verification concept | Established direction; policy unknown |
| Stock/finance | Operational modules; exact scope unknown and configurable | Established direction |
| Design | Restrained Carbon-inspired interface, Arabic RTL and English LTR | Established |
| GitHub/tooling | Inspect and preserve existing repo; Replit may choose appropriate tools | Established |

## 3. Configuration principles

1. Business-wide defaults with branch-level overrides where appropriate.
2. Typed, validated settings—not scattered hard-coded constants.
3. Every setting has a scope, default, status, effective date, and audit history.
4. Draft changes can be previewed before publishing. High-impact changes require authorized approval.
5. Configuration versions preserve historical meaning. A new price, warranty rule, service duration, or workflow must not rewrite old records.
6. Support rollback or a new corrective version; never erase audit history.
7. The UI must distinguish a suggested default from an owner-approved setting.
8. Keep mandatory security, privacy, financial traceability, and data-integrity controls non-optional.

## 4. Provisional capacity configuration

The following figures are demo-only assumptions to make the prototype usable. Do not present them as measured Go Stores capacity. Every value must be editable per branch and service, with effective dates.

| Setting | Branch 1 | Branch 2 | Status |
|---|---:|---:|---|
| Clean bays | 2 | 1 | [ASSUMED] |
| General bays | 4 | 3 | [ASSUMED] |
| Technicians | 6 | 4 | [ASSUMED] |
| Maximum drop-offs/day | 8 | 6 | [ASSUMED] |
| Working hours/day | 10 | 10 | [ASSUMED] |
| Weekly day off | Friday | Friday | [ASSUMED] |

Illustrative service bay-hour assumptions (editable, not approved):

| Service | Default bay type | Bay-hours | Status |
|---|---|---:|---|
| Inspection | General | 1 | [ASSUMED] |
| Tint | General | 3 | [ASSUMED] |
| Audio | General | 8 | [ASSUMED] |
| Performance | General | 8 | [ASSUMED] |
| Body kit | General | 16 | [ASSUMED] |
| Ceramic | Clean | 20 | [ASSUMED] |
| Full PPF | Clean | 30 | [ASSUMED] |
| Full wrap | Clean | 40 | [ASSUMED] |

Capacity design must distinguish elapsed job duration, actual bay occupancy, technician workload, curing/drying/waiting intervals, and drop-off throughput. Each can be independently enabled/configured as the owner validates the real operation.

## 5. Provisional automation values

| Rule | Demo default | Status / configurable dimensions |
|---|---|---|
| Inbox visual highlight | 5 minutes | [ASSUMED]; threshold, business hours, channel, branch |
| Reception alert | 10 minutes | [ASSUMED]; recipients and threshold |
| Branch manager escalation | 20 minutes | [ASSUMED]; recipients and threshold |
| Persistent manager flag | 60 minutes | [ASSUMED]; threshold and resolution behavior |
| Owner complaint escalation | 24 hours unresolved | [ASSUMED]; severity and working-hours rules |
| Overdue job owner alert | More than 1 day | [ASSUMED]; threshold and recipients |
| Booking reminder | 1 day before | [ASSUMED]; timing, channel, templates |
| Owner digest | Evening | [ASSUMED]; schedule, timezone, contents |
| Intake photos | 4 angles before Received | [ASSUMED]; required by service/branch |
| Customer stage notifications | Received, Ready, Delivered | [ASSUMED]; stages, templates, opt-out |

## 6. Owner decisions required before live operation

The complete owner-facing option catalogue and meeting agenda are in `OWNER_MEETING_PLAYBOOK.md`. Key areas include:

- Branch independence, shared resources, cross-branch staff, and reporting.
- Service catalogue, vehicle categories, skill requirements, bay types, durations, capacity and walk-ins.
- Technician assignment: manager assignment, self-claim, automatic, or hybrid.
- Pricing: fixed, inspection-based, mixed, or custom/negotiated; quotation approval and revisions.
- Booking rules: deposits, confirmation, cancellation, rescheduling, no-shows, walk-ins, and customer data.
- Job workflow: stages, QC, rework, priorities, photos, handoffs, and pickup/delivery.
- WhatsApp numbers, branch routing, bot scope, human handoff, templates, Meta account ownership and integration readiness.
- Warranty duration, start date, exclusions, claims, transferability, and public QR page fields.
- Inventory: per branch, central store, or hybrid; movements, reservations, job consumption, purchasing and reorder alerts.
- Finance: payment capture, deposits/instalments, refunds, discounts, receipts, invoices, reporting and accounting-system boundary.
- Roles, branch access, approvals, overrides, shared devices and session policies.
- Automations, customer communications, escalation recipients and working-hour calendars.
- Reports, KPIs, owner digest, retention, exports, backups and launch readiness.

## 7. Configuration implementation requirements

- Build an Owner Decision Center / Settings area with categories, searchable settings, proposed default, available options, scope, impact explanation, status, owner decision, approver, effective date, and change history.
- Include a meeting/demo mode that visibly labels sample data and provisional values.
- Support draft → preview → approve/publish for high-impact settings.
- Use configuration versioning for service catalogue/pricing, capacity calendars, warranty templates, automation rules, and workflow policies.
- Add branch-level overrides only where the domain supports them; show inherited vs overridden values clearly.
- Export a decision summary for the owner after the meeting.

## 8. Assumption handling

- Seed data and UI must visibly mark provisional values `[ASSUMED]` / “Needs owner confirmation”.
- No assumed value may silently become a legal term, customer promise, payment obligation, or production WhatsApp message.
- Record who approved each setting and when. If no approver/date exists, it is not owner-approved.
- Maintain the decision register as the single source of truth; do not duplicate hard-coded assumptions across modules.
