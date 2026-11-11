# Product Requirements Document — Garage OS

**Product:** Garage OS  
**Business:** Go Stores  
**Market:** Egypt  
**Branches:** Two branches initially  
**Product type:** Internal operations platform with WhatsApp customer interface  
**Document status:** Baseline PRD; assumptions require owner validation

## 1. Executive summary

Garage OS is a unified operations platform for Go Stores, a two-branch car protection and modification agency. It connects customer conversations, bookings, workshop execution, quality checks, delivery, warranties, and management visibility in one system.

Customers primarily interact through WhatsApp. Staff use a responsive internal PWA. The product should reduce missed enquiries, booking conflicts, avoidable delays, lost service records, warranty disputes, and the need for managers to chase updates manually.

The product is not intended to be a generic CRM or a full ERP. It should reflect the real flow of a vehicle through the business.

## 2. Problem statement

The product is intended to address these likely operational problems. Their frequency and financial impact are **not yet verified**:

- Customer enquiries are spread across multiple reception WhatsApp numbers.
- Conversations can be missed, duplicated, or left without a clear staff owner.
- Reception may promise a drop-off or pickup date without a reliable view of workshop capacity.
- Staff and managers may lack one current view of where each vehicle stands.
- Intake condition and work evidence may be difficult to retrieve during disputes.
- Warranty details may be stored on paper or scattered records and difficult to verify.
- The owner may need to contact staff to understand daily performance and exceptions.

Do not claim specific savings or current failure rates until Go Stores supplies baseline data.

## 3. Goals and measurable outcomes

### Product goals

1. One reliable customer and vehicle record across both branches.
2. One shared inbox across configured reception numbers.
3. Clear ownership and response accountability for every human-required conversation.
4. Capacity-aware bookings with realistic expected pickup estimates.
5. A simple and auditable workshop job lifecycle.
6. Consistent intake evidence and quality-control records.
7. Searchable warranty records and privacy-safe QR verification.
8. Owner visibility into exceptions and daily operations.
9. Arabic-first usability with English support.
10. A system that remains understandable and usable by non-technical staff.

### Proposed KPIs (targets to be agreed)

- Percentage of conversations receiving a first human response within the agreed SLA.
- Number of unassigned and overdue conversations.
- Booking conflicts prevented.
- No-show rate and reminder confirmation rate.
- Jobs delivered by expected pickup date.
- Average time spent in each job stage.
- Percentage of jobs with complete intake photos and QC checklist.
- Warranty lookups completed successfully.
- Inventory items below reorder level.
- Daily reconciliation difference between recorded and actual payments (if the business adopts the process).

Do not fabricate baselines or targets. Capture baseline values during owner discovery.

## 4. Users and roles

### Owner
Needs a concise overview of both branches, business exceptions, performance trends, and critical alerts. Can configure business rules, roles, branches, services, capacity, warranty policy, and integrations.

### Branch manager
Runs one branch day-to-day. Oversees staff, workload, booking capacity, delayed jobs, complaints, QC, and branch-level reports. May manage operational settings if the owner grants permission.

### Receptionist
Handles customer conversations, customer and vehicle records, bookings, rescheduling, cancellations, check-in coordination, and payment recording where authorized. Needs a fast, simple interface.

### Technician
Works on vehicles and updates job progress. Needs a minimal mobile/tablet interface with clear assigned work, vehicle identification, service instructions, photos, checklists, and simple stage actions.

### Customer
Uses WhatsApp to ask questions, request a booking, confirm/reschedule/cancel, check progress, and request a human agent. Customer does not need an app account for MVP.

## 5. Product principles

### Configurable proposal pending owner discovery
The owner has not yet confirmed detailed operating policies. Garage OS must therefore demonstrate options rather than encode assumptions as facts. The product must include an Owner Decision Center for configuring and approving branch operations, services, pricing, bookings, assignment, workflow, warranty, inventory, finance, WhatsApp, automations, permissions, and reporting. Every material policy must be marked as a proposed default, awaiting owner decision, or owner-approved. See `OWNER_MEETING_PLAYBOOK.md`.


- WhatsApp-first for customer communication; internal PWA for staff.
- One source of truth for customer, vehicle, booking, and job records.
- Branch-aware operations, with owner-level visibility across branches.
- A booking is a capacity commitment, not merely a calendar entry.
- The system should prevent errors rather than rely on staff remembering rules.
- Staff interfaces should show only what the role needs.
- Important changes must be attributable to a person or system process.
- Automation should be quiet by default and escalate only meaningful exceptions.
- All business assumptions must be configurable and visibly provisional until confirmed.
- Arabic and English are first-class, including correct RTL/LTR behavior.

## 6. Scope

### MVP / first production release

- Owner Decision Center with configurable business-wide defaults and branch-level overrides.
- Settings catalogue with proposed defaults, alternatives, impact notes, approval status, effective dates, and audit history.
- Draft/preview/publish workflow for high-impact settings; preserve historical records when rules change.

**Foundation**
- Authentication and role-based access.
- Two branch records and branch-scoped permissions.
- Arabic and English UI.
- Customer and vehicle records.
- Service catalogue and configurable service rules.
- Persistent booking and job records.
- Audit/event history.
- Responsive PWA.

**Reception and customer handling**
- Shared inbox across connected WhatsApp numbers.
- Conversation assignment, status, internal notes, and response timer.
- Customer matching by normalized phone number.
- Human handoff from bot.
- Booking creation, rescheduling, cancellation, and confirmation.
- Search for customers, vehicles, bookings, and jobs.

**Workshop**
- Job board by branch and stage.
- Technician assignment.
- Drop-off and expected pickup information.
- Intake checklist and required intake photos.
- Simple progress actions.
- QC checklist and QC failure/rework path.
- Ready and delivered confirmation.
- Job history and delay visibility.

**Capacity and scheduling**
- Bay types and counts per branch.
- Service duration/bay-hour configuration.
- Working days and hours per branch.
- Daily drop-off cap.
- Capacity validation before confirming a booking.
- Earliest feasible alternative when the requested date is full.
- Manual manager override with reason and audit record.

**Warranty**
- Warranty record linked to vehicle and completed job.
- Warranty start/end, covered service, terms reference, and status.
- QR code and public verification page.
- Public page privacy defaults.
- Owner-configurable warranty policy; legal terms require approval.

**Management**
- Owner dashboard across both branches.
- Branch dashboard.
- Critical alerts and daily digest.
- Basic operational reports: workload, overdue jobs, stage duration, bookings, delivery, and unanswered conversations.

**Stock and finance (limited operational scope)**
- Inventory item catalogue, quantity, reorder level, branch location, and adjustment history.
- Low-stock list/digest.
- Manual deposit/payment entries and outstanding balance view.
- Basic Arabic/English invoice or receipt PDF if confirmed as required.
- No accounting ledger, tax filing, payroll, commissions, or payment gateway in MVP.

### Explicitly out of scope for initial release

- Multi-tenancy or selling Garage OS as a SaaS to unrelated businesses.
- Payment gateway, online checkout, or POS.
- Factory/manufacturer integration.
- Automated stock consumption by service recipes.
- Full accounting, payroll, commissions, tax, or ERP functions.
- Native iOS/Android apps; use responsive PWA.
- Customer self-service mobile app.
- AI-generated diagnosis, pricing, or service recommendations.
- Unapproved public disclosure of vehicle/customer data.
- Complex technician productivity scoring.

## 7. Core workflows

### 7.0 Owner setup and decision workflow
1. Owner or authorized manager opens the setup/decision center.
2. System lists unresolved decisions by category and marks demo assumptions clearly.
3. Each setting shows the proposed default, alternatives, business impact, scope, and dependencies.
4. Authorized user selects a value, branch scope, exceptions, and effective date.
5. High-impact settings are previewed and approved before publication.
6. The system records approver, timestamp, previous/new value, and reason; historical transactions retain their original rule version.
7. An exportable decision summary is available for meeting notes and follow-up.


### 7.1 New customer enquiry
1. Customer sends a WhatsApp message to any configured Go Stores number.
2. Message appears in the unified inbox with its source number and branch routing context.
3. System matches the customer by normalized phone number or offers safe creation if no match exists.
4. Bot handles supported intents (service information, booking, status, human request).
5. If human help is needed, conversation becomes an assigned staff task.
6. Staff reply from the shared inbox; message status and history are recorded.

### 7.2 Booking
1. Customer chooses branch (if applicable), service, vehicle details, and preferred drop-off date/time.
2. System calculates required capacity from service configuration and branch availability.
3. System checks bay-hours and daily drop-off cap independently.
4. If available, system offers a feasible drop-off and expected pickup.
5. If unavailable, system suggests the earliest feasible alternative(s).
6. Booking is confirmed only after customer confirmation and successful capacity reservation.
7. Confirmation and reminder messages are scheduled.
8. Staff can edit or override with permission and a reason.

### 7.3 Vehicle intake
1. Reception opens the booking and verifies customer, vehicle, service, and promised timing.
2. Staff records odometer and visible condition notes where applicable.
3. Four intake photos are required by default **[ASSUMED]**: front, rear, left, right.
4. Customer belongings/keys/accessories and existing damage can be recorded if relevant.
5. Vehicle is checked in; booking becomes a job and stage becomes `Received`.
6. Intake timestamp and responsible staff member are recorded.

### 7.4 Workshop execution
1. Technician sees assigned jobs in a simple “My work” view.
2. Technician opens one vehicle/job and sees service instructions, due timing, and relevant notes.
3. Technician selects a clear action to start or finish the current step.
4. System validates permitted transitions and records actor, timestamp, previous/new stage, and reason where required.
5. Delay risks are visible to branch manager.
6. Staff can add work photos and notes.

### 7.5 Quality control
1. Job moves to QC when service work is marked complete.
2. Authorized staff complete a service-specific QC checklist.
3. Pass moves the job to `Ready`.
4. Fail creates a QC issue/rework task, records reason and owner, and returns the job to an allowed work stage.
5. QC cannot be bypassed without an authorized override and recorded reason.

### 7.6 Delivery and warranty
1. Reception confirms final work, customer, balance, and vehicle.
2. Delivery evidence and customer acknowledgement are recorded according to policy.
3. Job moves to `Delivered`.
4. Warranty record is created from the completed service and approved terms.
5. QR code links to a public verification page with masked plate and no customer contact details by default.
6. Warranty status can be checked without exposing private account data.

### 7.7 End-of-day owner view
Owner receives a concise digest showing meaningful activity and exceptions, not every event. Initial proposed contents:
- Vehicles received and delivered.
- Active and overdue jobs.
- Bookings for the next working day.
- Unanswered/escalated conversations.
- Critical WhatsApp/integration failures.
- Payments recorded (not a substitute for accounting reconciliation).
- Low-stock exceptions as a digest item.

## 8. Job lifecycle

Primary stages:
- `Booked`
- `Received`
- `In service`
- `QC`
- `Ready`
- `Delivered`

Terminal/exception statuses:
- `No-show`
- `Cancelled`

Rules:
- Stage changes must be validated against an explicit transition map.
- No-show and Cancelled require a reason or a controlled reason code.
- Moving a job backward requires permission, confirmation, and a reason.
- Delivered jobs are not silently reopened; use a formal reopen/after-service issue workflow.
- Every transition creates an immutable event record.
- The UI should offer one obvious next action rather than requiring drag-and-drop.

## 9. Booking and capacity model

A simple appointment-slot model is insufficient for services that occupy bays for hours or days.

Capacity checks must consider:
- Branch and branch working calendar.
- Bay type required by service.
- Number of bays of that type.
- Estimated bay-hours and occupancy interval.
- Service-specific constraints such as curing/drying time, where applicable.
- Daily drop-off limit.
- Existing bookings and active jobs.
- Holidays, closures, and manual blocks.

Initial assumptions are in `DECISIONS_AND_ASSUMPTIONS.md`. Keep values in editable configuration/database settings—not scattered through business logic.

The system should distinguish:
- **Drop-off time:** when the customer brings the vehicle.
- **Work start/occupancy:** when the bay is needed.
- **Expected pickup:** customer-facing estimate.
- **Actual completion/delivery:** recorded events.

Do not assume that every service occupies a bay continuously for its entire elapsed duration. Support configurable occupancy rules so the business can later model curing or off-bay waiting accurately.

## 10. Shared inbox requirements

Each conversation should display:
- Customer name (if known) and phone number.
- Source WhatsApp number.
- Related branch.
- Last message and timestamp.
- Assigned staff member.
- Conversation status.
- Unanswered duration / SLA indicator.
- WhatsApp 24-hour customer-service window status where applicable.
- Related booking/job/vehicle, if any.

Actions:
- Claim/assign/reassign.
- Mark open, pending, resolved.
- Add internal note (never sent to customer).
- Search and filter.
- Link/create customer.
- Create booking or job from conversation.
- Send approved template when required by WhatsApp policy.
- Escalate to manager.

Prevent simultaneous conflicting ownership/replies where possible. Record reassignment and staff replies.

## 11. Notifications and automation

See `AUTOMATIONS.md`. Initial rules are proposed defaults and must be configurable:
- Booking confirmation.
- Reminder one day before drop-off.
- Confirmation/reschedule/cancel response handling.
- Unanswered conversation escalation.
- Job delay warnings.
- Customer notifications at Received, Ready, and Delivered.
- Critical owner alerts only for service interruption, disconnected/flagged number, unresolved serious complaint, and materially overdue job.
- Evening owner digest.

## 12. Non-functional requirements

- Secure, reliable, maintainable application.
- Mobile-first usability for technician workflows; responsive desktop for reception and management.
- Arabic RTL and English LTR without layout breakage.
- Accessible contrast, keyboard support, visible focus, and adequate touch targets.
- Fast common workflows on ordinary mobile connections.
- Robust handling of duplicate webhooks and retries.
- Data backup and restore.
- Search and export for business-owned records.
- Observability for application, database, background jobs, and WhatsApp integration.
- No customer PII in public pages or unnecessary logs.
- Clear outage states and manual fallback procedures.

## 13. Success criteria

The first release is ready for controlled business use when:
- Both branches can operate with branch-scoped staff accounts.
- A customer conversation can be received, assigned, replied to, and resolved from the shared inbox.
- A booking cannot exceed configured capacity without an authorized override.
- A booking can become a job and move through the complete lifecycle.
- Intake photos and QC rules are enforced as configured.
- Warranty records and public QR verification work with privacy-safe defaults.
- Owner can see cross-branch operational status and critical exceptions.
- Arabic and English workflows work on supported devices.
- Critical acceptance scenarios pass and backup/restore has been demonstrated.
- The owner has approved operational assumptions, warranty wording, and WhatsApp setup.

## 14. Risks and dependencies

- Meta Business verification, WhatsApp number eligibility, templates, and number migration/coexistence.
- Accuracy of service durations, bay types, capacity, and branch calendars.
- Staff adoption and training.
- Device availability and shared-device security.
- Warranty policy/legal wording.
- Data migration and duplicate customer/vehicle records.
- Internet and provider availability at branches.
- Financial process definition and local invoice requirements.

See `DECISIONS_AND_ASSUMPTIONS.md` for owner questions.
