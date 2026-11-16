# WhatsApp demo flow proposal

> **Scope supersession — 16 November 2026:** The user now requires the full
> operational product with auxiliary demonstration/training. Fictional customer
> panes, scenario identities and reset controls here describe only that layer.
> Six-number consolidation, central handling, branch availability, automatic
> booking and handoff are operational requirements. See [accepted scope](PRODUCT_DIRECTION_AND_RELEASES.md)
> and P1-026/P1-027/P1-038. Earlier no-code/assumption notes describe prior
> documentation work; this update makes no runtime change either.

**Recorded:** 16 November 2026.  
**Tracker:** [P1-026](../testing/PHASE_1_ISSUES_TRACKER.md#p1-026) and [P1-027](../testing/PHASE_1_ISSUES_TRACKER.md#p1-027).  
**Status:** Documentation only. The user authorized assuming a complete functional sequence and explicitly requested no code changes. No runtime behavior described below has been implemented or verified by this proposal.

## Confirmed intent and proposed defaults

The outside demo-user selector opens the specified user's workspace under actual RBAC. The WhatsApp demo has a customer side and an agent side, demonstrating customer inputs, list choices, auto-replies, and staff navigation. The operational shared inbox belongs in demo and production views; provider integration remains disconnected.

**Latest confirmed requirement — 16 November 2026:** The central feature is one shared inbox consolidating **six WhatsApp business phone numbers**. Automation checks booking availability at the customer's requested branch, lets the customer choose an available preferred time, collects the required information, and automatically books in Garage OS. Human handoff is available on request and for enquiries outside the supported choices. This supersedes the earlier proposed default requiring staff approval for the primary booking journey. Customer confirmation remains a review/consent step; staff approval is not part of the successful automated path. No configuration or code is changed by recording this requirement.

## Six-number shared inbox

All six business numbers feed a single operational inbox, filtered by the selected staff user's authorized scope. Each conversation retains its receiving business number, customer identity, requested booking branch, operational routing branch/team, assignee, and bot/human handling state. Show the receiving number clearly and allow permitted filters by number, branch, assignee, and action status. Distinguish the receiving number from the customer's number.

Replies use the business number that received the conversation; selecting a different booking branch does not silently change the reply number. Keep conversations distinguishable when the same customer contacts multiple business numbers; customer history may link them only within permitted access. Repeated provider events or retries must not create duplicate messages or bookings.

**Confirmed central-team model — 16 November 2026:** One central team handles conversations from all six numbers across the supported booking branches. All human handoffs enter the central team's queue, where an authorized agent claims the conversation. Changing the requested booking branch keeps the conversation with the same central team and agent; it does not require a branch-team transfer. The receiving number identifies the reply channel, while the customer's chosen branch determines service availability and booking capacity. There is no assumed number-to-branch split.

Authorized central-team members need access to all six channels and the customer/availability/booking context required to serve supported branches. This is a functional access requirement for future implementation, not a permission already present in the current server. Central-team membership does not give every employee inbox access or grant owner settings, unrelated financial information, warranty approval, or workshop controls. Users outside the central team retain their role/branch restrictions. Enforce authorized coverage for the whole conversation, transcript, and linked context. If access is revoked, remove the conversation and customer-simulation pane from that user's view and clear cached details. The exact membership mechanism can be settled during implementation without reopening the confirmed central-team model.

In the demo, six labeled fictional business-number channels feed the same simulated inbox. The customer pane can select which fictional business number is contacted before starting a conversation. Production shows the intended authorized inbox and per-number connection states while integration remains disconnected; no phone numbers are registered or connected in this documentation task.

Everything below that goes beyond this intent is a proposed demo default, not an approved Go Stores operating policy. Use fictional customers, vehicles, references, and configurable sample services. Prices, working hours, capacity, cancellation rules, and warranty terms must not become business promises merely because they appear in the demo.

## Entry, access, and layout

1. Select a demo user outside the workspace. Start that user's session and open the role's normal permitted landing page. Do not force every role into WhatsApp.
2. Eligible users open WhatsApp from their normal navigation. Preserve the selected identity and branch scope through subsequent navigation.
3. On desktop, show two simultaneous panes: customer conversation/input on one side and the selected user's operational agent workspace on the other. Mirror placement appropriately in RTL. On narrow screens, provide clearly labeled Customer / Agent tabs with unread indicators while retaining one shared conversation.
4. The customer pane contains a fictional customer profile, transcript, text composer, and interactive lists/buttons. Demo profile/reset controls live outside the customer chat and remain clearly labeled.
5. The agent pane contains a conversation list, transcript, owner/status, permitted customer/booking/job context, reply composer, and internal-note mode. Provide links to permitted operational pages and a return-to-conversation action. Keep identity and conversation context when navigating.
6. Customer text, selected choices, automatic replies, and staff replies belong to the same fictional interaction. Internal notes, assignment events, and staff-only diagnostics never appear in the customer transcript.

### RBAC baseline

The current [server authorization rules](../../apps/server/features/auth/authz.ts) provide the baseline below. Future implementation must explicitly add the central team's cross-branch inbox and necessary booking access; it must not silently treat every receptionist as a central agent:

| Selected role | Proposed demo behavior |
|---|---|
| Owner | Inbox and linked pages within authorized scope; owner-only settings remain owner-only. |
| Branch manager | Branch-scoped operations by default; cross-branch inbox/booking context only with authorized central-team coverage; no owner settings. |
| Receptionist | Authorized central-team members handle all six channels and necessary booking/customer context across supported branches. Other receptionists retain branch scope. No warranty issuance or policy management merely because the customer requests them. |
| Technician | Normal technician workspace with no WhatsApp inbox or customer-demo controls, consistent with current inbox authorization. |

Owner, manager, and receptionist may claim an unassigned conversation or one already assigned to themselves. Staff replies require assignment to the current user. Reassignment must follow existing server checks. Links do not imply authorization: direct routes and API actions must enforce access too.

## Starting conversation and navigation rules

Start a new scenario with an empty customer transcript and a prompt to send a message. The first customer message triggers one greeting and the main menu. A suggested quick-start message can help the presenter begin without scripting a fake completed conversation.

**Sample English greeting:** “Welcome to Go Stores. How can we help you today? Choose an option below, or ask to speak to our team.”

**Sample Arabic greeting:** “أهلاً بيك في Go Stores. نقدر نساعدك إزاي؟ اختار من القائمة أو اطلب تكلم فريقنا.”

Use an explicit Arabic / English switch, defaulting to the demo's current locale. Changing language preserves the conversation and current step; future prompts use the selected language. Do not depend on unverified language detection.

**Proposed main list:**

1. Explore services and sample prices / الخدمات والأسعار التجريبية.
2. Book a service / احجز خدمة.
3. Check my booking or job / تابع الحجز أو حالة العربية.
4. Change or cancel a booking / عدّل أو الغِ الحجز.
5. Warranty help / مساعدة في الضمان.
6. Branch information / معلومات الفروع.
7. Talk to the team / كلم فريقنا.

Treat typed “menu,” “back,” and “talk to the team,” with Arabic equivalents, as navigation controls during bot handling. Support deterministic matching of common requests; do not assume an AI integration. A clearly unsupported enquiry routes directly to human handoff with its original text and collected context. For ambiguous input, ask one clarifying question with the relevant choices and a visible Talk to the team action; unresolved input then routes to handoff. Customers can request immediate handoff at any bot step.

Back returns one uncommitted step. Menu leaves the current uncommitted branch after asking whether to discard collected input. Neither control silently cancels an existing booking. If an action is already committed, show its outcome and offer the appropriate change path.

## Sequential journeys

### A. Service enquiry to booking

1. Customer chooses services. Show active sample services available at the relevant branch; allow selection of configured customer-bookable branches when needed. The staff view remains independently restricted by RBAC.
2. Customer selects a service. Return its configured description, sample estimate if available, and a clear statement that a final quote may require inspection. If no price exists, offer a team quote rather than inventing one.
3. Offer Book this service, Ask the team, or Main menu. Booking retains the chosen service and branch.

### B. Automatic booking at the requested branch

1. Ask which branch the customer wants and which service they need, reusing prior choices. Any of the six receiving numbers can start this journey; do not infer a branch from the number. Offer configured customer-bookable branches. Authorized central-team agents retain the necessary booking context when the customer changes branch.
2. Ask for a preferred date. Check service availability, working calendar, and actual branch/service booking capacity, then show a small list of available times at that requested branch. Avoid presenting suggested business-hour labels as proven slot availability. If none fit, offer other dates at the same branch, an explicit choice to change branch, or staff help.
3. Customer selects their preferred offered time. Collect/validate any missing required details: name, contact identity from the simulated channel, and required vehicle details such as make/model and plate. Reuse verified existing profile information. The exact required fields remain configurable discovery inputs; do not require unrelated warranty or billing fields.
4. Show a review summary: receiving business number, selected branch, service, customer/vehicle, date/time, estimated pickup if supported, and configured sample estimate. Pickup remains an estimate. Offer Confirm booking, Edit details, or Discard request.
5. On customer confirmation, recheck the selected slot and create the booking automatically in one protected operation. No agent claim or staff approval is needed for a valid automated booking. If another customer took the capacity, preserve the collected information and offer refreshed available times without creating a failed or duplicate reservation.
6. Only after successful persistence, return a confirmed booking reference and final details. The demo provides a separate fictional verification code for later status/change paths. A failed save cannot generate success copy; retries must resolve to at most one booking.
7. Show the linked confirmed booking/job in the authorized operational view and update the conversation context. A fully automated success does not require a human-queue assignment. Record receiving number, requested branch, and automation source for traceability.
8. Continue with View booking, Change booking, Talk to the team, or Main menu. Demonstrate subsequent workshop transitions only through actions permitted to the current user. Customer status updates remain simulated and follow the agreed customer-facing milestones.

**Current implementation gap:** The existing server chooses pending versus confirmed using the `booking-confirmation` setting, and existing capacity logic requires the separate date-integrity fixes in P1-001/P1-002. This document records the desired automatic path; it does not change settings or claim that exact time-slot availability or full automation already works. Future implementation must reconcile confirmation settings explicitly, validate time-slot semantics and concurrent capacity enforcement, and avoid silently converting a confirmed customer booking into a pending request. Manual review is a separate exception/policy choice only if later requested, not the default for this flow.

### C. Status lookup and after-service continuation

1. Request the fictional booking reference and secondary verification code. Never expose another customer's existence or details after a failed match.
2. Return only approved customer-facing status, branch, drop-off details, and supported estimated pickup. Keep staff notes, costs, internal QC findings, and unrelated records private.
3. Show a simple customer-facing milestone sequence: request received, booking confirmed, vehicle received, in service, ready for pickup, delivered. Map current internal stages into these labels; do not fabricate progress or treat the timeline as proof of outbound notification.
4. Offer Change booking when eligible, Warranty help after delivery, Talk to the team, or Main menu.
5. To showcase progression, provide demo controls for loading suitable fictional scenarios or explicitly advancing a walkthrough. Scenario controls never bypass RBAC to mutate operational jobs. Any operational transition uses the actual permitted action and records its outcome.

For cancelled, rejected, or no-show outcomes, replace the successful-progress timeline with the actual recorded result and its permitted next action: start a new request or talk to staff. Show rejection only where an explicit recorded rejection exists; do not infer it from cancellation. Do not offer changes to a terminal booking or imply that a cancelled/no-show vehicle is still progressing through service.

### D. Reschedule or cancel

1. Verify the fictional booking as in status lookup; select the intended booking if several are available to that fictional customer.
2. Show its current state and available actions. For work already received/in service, unavailable rules, or uncertain eligibility, hand off instead of inventing a cancellation policy.
3. Reschedule: select a new date/time with capacity checks, review old/new details, then explicitly confirm. Retain the old reservation if the change fails; update the existing booking rather than creating a duplicate.
4. Cancel: show the selected booking, ask for an optional reason and explicit final confirmation. Only then record cancellation and release the applicable reservation. Do not invent a fee, refund, or cutoff.
5. Reflect the result on both sides and offer Main menu or Talk to the team. Repeated confirmation must not repeat the mutation.

### E. Warranty help

1. Offer View existing warranty, Ask about coverage, or Request claim assistance.
2. Before private record lookup, collect the fictional booking reference and secondary verification code, reusing a valid verified context only for the same customer/conversation. Once verified, list that customer's eligible completed jobs/coverage records with minimal identifying information and ask which one they mean. A failed match reveals no record details and offers retry or staff help; a verified customer with no coverage sees that outcome and can request assistance. Show only the selected record's relevant published policy/issued coverage facts; no draft terms as approved coverage. The booking verification does not itself authorize a public verification endpoint or create new credentials; any private warranty lookup remains a proposed capability requiring server authorization in future implementation.
3. An existing public verification link may be shown only if Owner-gated verification is enabled and permitted fields apply. Otherwise provide the allowed private summary or handoff.
4. Claim assistance collects a short fictional description and links the conversation to authorized staff review. Do not automatically promise acceptance, issue coverage, or approve a claim. Evidence upload is a separate optional extension; it is not assumed to exist in the WhatsApp demo.
5. Reception can acknowledge and route the request; owner/manager actions follow existing warranty permissions. The customer receives a simulated acknowledgement that review is needed, without an invented response deadline.

### F. Branch information

Show configured public branch contact/location/hours only where available. Any fictional example is labeled as sample. Missing information offers staff help. If a chosen branch is outside the staff user's scope, do not expose its inbox or operational data; explain the scope and offer the permitted route.

### G. Human handoff and agent navigation

1. Customer chooses Talk to the team at any bot step, or sends an enquiry outside supported automation. Send one acknowledgement, preserve the original enquiry, receiving business number, requested branch, selected slot, collected information, and any existing booking reference, and place the conversation in the central team's queue as Open / unassigned. Do not create a booking merely because handoff occurred.
2. Suspend intent auto-replies while waiting for or speaking with staff. Further customer messages join the same conversation and update unread/activity state without repeating greetings. Requests from all six numbers are handled by this same central team; changing booking branch does not reset assignment or conversation context.
3. An authorized agent claims it. Show the assignment and collected service/booking context on the agent side; require claim before reply. Assignment conflicts preserve the current owner and explain what happened.
4. The agent replies; only that external reply appears in the customer pane. Internal notes remain staff-only. The agent can open permitted customer, booking, workshop, or warranty details and return to the same conversation.
5. Pending means waiting for the customer or an internal action; it does not erase ownership. Resolved closes the current action. A new customer message reopens the conversation and alerts the appropriate queue without silently restarting the bot.
6. Resuming bot handling requires an explicit action and a visible customer message, preventing simultaneous bot/staff answers. Returning to the main menu during human handling offers a return-to-bot choice rather than automatically taking over.
7. Outside configured hours, show the configured next opening time if known; otherwise state that the team will respond during working hours. Do not invent a wait-time promise or send real alerts. Self-service options may continue when their rules support them.

## Demo scenarios, reset, and recovery

Provide a fictional empty conversation plus separate sample scenarios: six-number inbox aggregation, service enquiry, automatic booking, slot taken before confirmation, booked vehicle status, ready-for-pickup, reschedule, cancellation, warranty assistance, requested handoff, unsupported-enquiry handoff, and cross-branch routing. Load only scenarios permitted for the selected user and branch. Select a fresh scenario explicitly rather than silently changing the current booking.

Reset asks for confirmation if it would discard a conversation. It starts a new isolated fictional scenario; it does not silently delete shared fixtures, real records, audit history, or an existing operational booking. A future implementation must define fixture ownership and cleanup before adding destructive reset behavior.

Preserve input on failed sends and failed saves. Show local sending/saved/error states honestly and support safe retry without duplicated replies or booking mutations. Failed verification exposes no details; unavailable services/capacity show alternatives. Changes of conversation or identity cannot carry draft inputs, verification results, or permissions across users.

Always label the showcase “Simulation — not connected to WhatsApp.” Demo messages are simulated events, never real provider delivery/read receipts. Production uses the authorized staff inbox with a disconnected state and no customer-simulation controls or fictional traffic. This proposal makes no claims about live provider policies or integration readiness.

## Review criteria for future implementation

- Receive conversations from all six fictional business numbers in the central team's shared inbox, retaining source number and correct reply channel. Authorized central-team agents see all six channels and necessary context across supported booking branches; other users retain their permitted scope. One customer's conversations across business numbers remain distinguishable.
- Complete requested branch/service → actual available times → customer choice → required details → review/customer confirmation → automatically persisted confirmed booking → status lookup, with corresponding changes visible on both panes and no staff approval step.
- Recheck a slot taken between display and confirmation; preserve details, offer alternatives, and prevent duplicate bookings from repeated clicks/events/retries. A central agent can continue the same conversation across requested-branch changes without reassignment or loss of context; unrelated management privileges remain restricted.
- Route both explicit agent requests and unsupported enquiries to the correct human queue with full context; pause bot handling until explicitly resumed.
- Complete reschedule, cancellation, warranty assistance, branch information, and human handoff paths, including Back/Menu/exit behavior.
- Demonstrate rejected capacity, invalid verification, ambiguous text, assignment conflict, network retry, and return from linked operational pages.
- Enforce role/branch checks through UI, direct routes, and API actions; technician access must not acquire inbox privileges.
- Separate internal notes, customer-visible text, demo scenarios, and production data; preserve conversation isolation under P1-007.
- Verify Arabic/RTL, English/LTR, keyboard use, and mobile pane switching. Keep validation and active-step context visible.

**Next discussion:** Review the overall journey and simplify any steps the user finds unnecessary. Exact copy, sample services, visual layout, and timings remain adjustable demo choices. Business-policy approval and live integration are separate work.
