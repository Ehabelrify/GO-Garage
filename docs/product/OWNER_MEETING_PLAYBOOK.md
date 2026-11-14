# Garage OS — Go Stores Owner Meeting Playbook

## Purpose

This is the working agenda and decision catalogue for the next Go Stores owner meeting. The objective is to validate how the business operates, demonstrate that Garage OS can support the alternatives, and record decisions—not to force the owner into a preselected workflow.

**Discovery status:** no detailed operating policy in this document is owner-approved. Options and recommendations are proposals. Values used in the demo must be labelled **Sample / [ASSUMED]**.

## How to use this document in the meeting

For each topic:
1. Explain the business question in plain language.
2. Show the available options and a short workflow example.
3. Explain the operational consequence and any cost, staffing, customer, or legal implication.
4. Ask the owner which option applies now and whether it may differ by branch.
5. Record the decision, approver, date, scope, exceptions, and follow-up owner.
6. Leave it **Unresolved** if the owner needs to consult staff, accountant, supplier, or legal adviser.

Do not activate a policy merely because the owner likes the demo. Obtain explicit approval for production settings.

## Meeting agenda (suggested 75–90 minutes)

| Time | Topic | Desired outcome |
|---:|---|---|
| 5 min | Business goals and current pain points | Agree what success means |
| 10 min | Branch operations and staff | Map shared vs branch-specific operations |
| 15 min | Services, pricing, quotations and bookings | Confirm catalogue and customer commitment flow |
| 15 min | Workshop, technicians, capacity and QC | Confirm actual job journey and constraints |
| 10 min | WhatsApp and customer experience | Confirm channels, routing, bot boundaries and handoff |
| 10 min | Warranty and after-sales | Confirm service terms and approval owner |
| 10 min | Inventory and finance | Confirm MVP scope and existing systems |
| 5 min | Reports, alerts, access and rollout | Agree priorities and owners for open items |

## 1. Branch operating model

**Question:** How do the two branches operate relative to each other?

Options to support:
- **Independent:** each branch has its own staff, stock, capacity, bookings, and daily operations; central owner can still view both.
- **Shared:** one shared operational pool for some or all staff, inventory, capacity, and reception.
- **Mixed:** selected resources are shared, while other resources remain branch-specific.
- **Centralized with branch execution:** central reception/management controls bookings and assignments; branches execute work.
- **Different by resource:** configure staff, stock, bays, service availability, and booking rules independently.

**Configuration dimensions:** branch identity/contact details; working calendar; service availability; capacity; staff membership; manager visibility; WhatsApp number routing; inventory ownership; transfer permissions; reporting scope; branch-specific pricing or warranty exceptions.

**Proposed product behavior:** business-wide defaults with branch-level overrides. No assumption that branches are either fully isolated or fully shared.

Owner decision: ____________________  Scope/exception: ____________________  Status: Unresolved / Approved

## 2. Services and service catalogue

**Question:** What services are offered, and what variations change the work?

Options/configuration dimensions:
- Service name and category, Arabic/English description, active/inactive state.
- Available at all branches or selected branches.
- Vehicle categories/sizes and compatibility.
- Standard, optional, bundled, add-on, or custom service.
- Required skills/certifications and eligible technicians.
- Required bay type, equipment, materials, and preparation.
- Estimated work time, actual bay occupancy, curing/drying time, waiting time, and expected pickup buffer as separate values.
- Required intake checklist, work checklist, QC checklist, photos, and warranty template.

**Possible catalogue models:** centralized catalogue with branch overrides; completely branch-specific catalogues; shared core services plus local additions.

Owner decision: ____________________  Service list to be supplied by: ____________________

## 3. Pricing, quotations and approvals

**Question:** How is a customer given a price and how does that price become authorization to start work?

Pricing models to support:
- **Fixed:** one fixed amount per service.
- **Vehicle-based:** price varies by vehicle category/size/model.
- **Inspection-based:** final quote after inspecting the vehicle.
- **Mixed:** fixed starting prices plus inspection adjustments/add-ons.
- **Package/bundle:** combined services priced together.
- **Custom/negotiated:** authorized staff create a one-off quote.
- **Price list plus discount:** standard price with controlled discount/override.

Quotation workflow options:
- Staff prepares quote; manager approves above a threshold.
- Reception can issue approved catalogue prices directly.
- Customer receives quote by WhatsApp and approves/rejects/requests changes.
- Signed or in-person approval is recorded by staff.
- Revised quote retains previous versions and approval evidence.
- Work cannot start until required approval/deposit is satisfied, with permission-based exceptions.

**Configuration:** currency, tax display, validity period, deposit percentage/fixed amount, discount limits, approval thresholds, quote expiry, add-ons, revision rules, and branch-specific price overrides. Confirm local tax/invoice requirements with the owner's accountant.

Owner decision: ____________________  Approval authority: ____________________

## 4. Booking and capacity

**Question:** What does the business promise when a customer books?

Booking source options: WhatsApp bot, receptionist, phone, website/form, walk-in, referral/other.

Booking policy options:
- Instant confirmation if capacity is available.
- Request submitted and receptionist confirms.
- Manager approval for special services or exceptions.
- Deposit required, optional, or not used.
- Walk-ins accepted, waitlisted, or handled only when capacity permits.
- Reschedule/cancel allowed until a configurable cutoff.
- Reminder and confirmation required or optional.
- No-show marked automatically after a grace period or manually by staff.

Capacity models to support (individually or in combination):
- Daily vehicle/drop-off limit.
- Bay count by type and time interval.
- Service bay-hours.
- Technician availability and skill eligibility.
- Equipment/resource availability.
- Curing/drying space and non-active waiting intervals.
- Branch-specific working hours, breaks, holidays and exceptional closures.
- Manual override with reason and permission.

The system should suggest alternative dates/slots when capacity is unavailable. The owner must confirm the actual constraints and service durations.

Owner decision: ____________________  Capacity data supplied by: ____________________

## 5. Technician assignment and workshop workflow

**Technician assignment options:**
- **Manager/reception assignment:** staff select one or more technicians.
- **Self-claim:** eligible technicians claim available jobs.
- **Automatic:** system assigns based on skill, availability, workload, and branch.
- **Hybrid:** system recommends; manager confirms or changes.
- **Team assignment:** work is assigned to a team/lead rather than one individual.

**Workflow options:**
- Standard stages: Booked → Received → In service → QC → Ready → Delivered.
- Optional stages: Awaiting approval, Awaiting parts, On hold, Rework, Subcontracted, Customer delayed, Awaiting payment.
- Separate internal status from customer-visible status.
- QC pass/fail, rework loop, checklist by service, required photo evidence.
- One technician, multiple technicians, or team ownership.
- Pause/resume with reason; reassignment with history.
- Vehicle collection/delivery or customer pickup.

**Configuration:** enabled stages, allowed transitions, role permissions, required fields/checklists/photos, SLA timers, priority rules, customer notifications, rework behavior, and reopen permissions. Keep event history append-only.

Owner decision: ____________________  Current workflow documented by: ____________________

## 6. WhatsApp and customer communication

**Questions:** Which numbers are used? Which branch receives each enquiry? How much may automation do without a person?

Options to support:
- One number per branch, multiple numbers per branch, or shared central number.
- Central shared inbox with branch routing, or separate branch queues with central oversight.
- Bot handles FAQs/service catalogue/starting prices/booking/status, with configurable allowed intents.
- Bot only collects details and routes to staff.
- Human handoff always available; urgent/complaint intents can bypass bot.
- Staff assignment, conversation ownership, internal notes, tags, unread state and escalation.
- Arabic/English templates, opt-in/opt-out handling, approved templates and quiet hours.
- Customer notifications at selected job stages and on delays.

**Required operational checks:** Meta Business portfolio owner/admin; number ownership; current WhatsApp Business App use; number migration/coexistence eligibility; templates; webhook hosting; provider restrictions and pricing. These must be verified before promising a live connection.

Owner decision: ____________________  Meta account/number contact: ____________________

## 7. Warranty and after-sales

**Configuration dimensions:** warranty by service/product/material; duration; start date; covered vehicle/part; exclusions; void conditions; claim process; required evidence; transferability; renewal/extension; branch handling; customer notifications.

Public QR page options: show service and dates only; masked plate; warranty status; terms summary; claim contact. Do not expose customer name, phone, full plate, or internal notes by default.

**Important:** warranty terms and public wording require explicit owner approval and, where appropriate, legal review. Do not infer legal policy.

Owner decision: ____________________  Warranty terms supplied/approved by: ____________________

## 8. Inventory and purchasing

**Inventory ownership models:**
- Separate stock per branch.
- One central store.
- Hybrid central store plus branch stock.
- Track only selected critical consumables.
- No inventory tracking in initial release (module can remain disabled).

**Stock workflow options:**
- Manual adjustment; receiving/purchase intake; issue to job; reserve for booking; return/waste; transfer between branches; stock count; low-stock alert.
- Deduct on reservation, job start, or actual consumption.
- Reorder point, target quantity, supplier, lead time, unit of measure, lot/batch/expiry where relevant.
- Approval threshold for adjustments/transfers/purchases.

Owner decision: ____________________  Stock list/supplier data supplied by: ____________________

## 9. Finance, deposits and documents

**Scope options:**
- Operational payment log only.
- Deposits and partial payments against a job.
- Full payment, balance due, refunds and payment corrections.
- Discounts and manager approval.
- Receipts and bilingual invoices.
- Cash/card/bank transfer/wallet/other payment methods.
- Daily branch cash summary and owner consolidated view.
- Export/integration to an existing accounting system.

Clarify whether Garage OS is the source of truth for payments or only records payments made elsewhere. Define who can record, correct, reverse, refund, discount, close a day, and export data. Confirm tax/invoice requirements with the accountant. Do not position the MVP as a full accounting ledger or POS unless explicitly scoped.

Owner decision: ____________________  Accountant/system contact: ____________________

## 10. Roles, permissions and devices

Baseline roles to demonstrate: Owner, Branch Manager, Receptionist, Technician. Optional roles: Senior Technician/Team Lead, Cashier, Inventory Controller, QC Inspector, Customer Support, Accountant, System Administrator.

Permission dimensions: branch scope; cross-branch visibility; customer/vehicle PII; pricing/discount; quote approval; capacity override; job stage changes; warranty edits; inventory adjustments; payment/refund; reports/export; user administration.

Device options: personal phone, shared tablet, workshop kiosk. Configure PIN/reauthentication, auto-lock, session revocation, minimal local cache, and device assignment. Security controls remain mandatory.

Owner decision: ____________________  Staff/role list supplied by: ____________________

## 11. Automations, alerts and reporting

Automation settings: trigger, delay, business-hours calendar, branch, recipient, channel, severity, retry, escalation, quiet hours, and enable/disable state.

Possible automations: booking confirmation/reminder; unconfirmed booking follow-up; no-show flag; capacity warning; delayed-job alert; awaiting-parts alert; customer stage updates; QC failure/rework; warranty expiry; low-stock digest; unanswered chat escalation; complaint escalation; owner daily digest.

Reporting options: bookings, conversion, no-shows, received/delivered vehicles, work in progress, turnaround time, on-time pickup, bay utilization, technician workload, quote acceptance, revenue/payment collection, outstanding balances, warranty claims, stock consumption, and WhatsApp response time. Define KPI formulas and targets with the owner; do not invent performance targets.

Owner decision: ____________________  Report recipients/cadence: ____________________

## 12. Data, migration, privacy and launch

Confirm existing sources: spreadsheets, WhatsApp histories, accounting software, customer lists, service price lists, stock records, warranty cards, paper job cards. Decide what to import and who validates data.

Agree retention, export, backup, restore, staff offboarding, customer privacy, consent, and access-review policies. Confirm production launch criteria, pilot branch, training owner, support contact, and rollback plan.

## 13. Decision record template

Use one row per decision. Duplicate this table as needed.

| ID | Topic / setting | Selected option/value | Scope (business/branch) | Exceptions | Approver | Effective date | Status | Follow-up owner |
|---|---|---|---|---|---|---|---|---|
| D-001 | Branch operating model |  |  |  |  |  | Unresolved |  |
| D-002 | Pricing / quotation model |  |  |  |  |  | Unresolved |  |
| D-003 | Technician assignment |  |  |  |  |  | Unresolved |  |
| D-004 | Inventory model |  |  |  |  |  | Unresolved |  |
| D-005 | Finance scope |  |  |  |  |  | Unresolved |  |
| D-006 | Booking / deposit / cancellation policy |  |  |  |  |  | Unresolved |  |
| D-007 | Warranty policy |  |  |  |  |  | Unresolved |  |
| D-008 | WhatsApp bot scope and human handoff |  |  |  |  |  | Unresolved |  |
| D-009 | Job stages and QC process |  |  |  |  |  | Unresolved |  |
| D-010 | Roles and permissions |  |  |  |  |  | Unresolved |  |

## 14. Deliverables after the meeting

- Approved branch/service/role configuration.
- Owner-approved booking, pricing, quotation, payment and cancellation policies.
- Confirmed job stages, technician assignment and QC requirements.
- WhatsApp number map, Meta account owner, integration prerequisites and approved bot boundaries.
- Warranty rules and approved customer-facing wording.
- Inventory and finance scope decision.
- Confirmed reporting/KPI definitions and alert recipients.
- Open-issue list with named owner and due date.
- Updated `DECISIONS_AND_ASSUMPTIONS.md`, implementation priorities, and acceptance tests.
