# Workflow product research — 16 November 2026

**Purpose:** Initial comparison for [P1-030](../testing/PHASE_1_ISSUES_TRACKER.md#p1-030), supporting the user's WhatsApp, warranty, owner-dashboard, and broader UI/UX discussion. This is product-pattern research, not a purchasing recommendation or an approved implementation specification. Owner/business-specific research is the subsequent task, P1-031.

**Method / limits:** Reviewed official product/help sources on 16 November 2026. Documentation establishes advertised behavior, not an independent usability test or proof that a feature fits Garage OS. No accounts were purchased, external systems connected, or app workflows retested. Additional niche research was delegated to a research subagent and consolidated here.

## Cross-industry comparisons

| Product / niche | What the official source documents | Possible Garage OS adaptation — proposal only |
|---|---|---|
| Housecall Pro / home services | A global date range, daily through yearly grouping, report-card drill-down, rearrangeable cards, and line/bar/table views. [Reporting dashboard](https://help.housecallpro.com/en/articles/6577580-reporting-dashboard) | A compact owner financial overview with month selection, trends, and detail on demand. Configurable cards could follow later if users actually need them. |
| Jobber / field services | Job costing distinguishes costs and profitability; work still in progress displays costs so far rather than a profit percentage. Its documentation also warns against counting the same material in both line-item costs and expenses. [Job costing](https://help.getjobber.com/en/articles/job-costing/) | Define revenue, cost, payment, and profit inputs before adding owner figures. Distinguish incomplete jobs, draft amounts, collected money, and final profit. |
| Front / customer-service teams | Shared inboxes, conversation assignment, internal comments, tags, message templates, snoozing, and rules. Internal comments are visible to teammates. [Front 101](https://help.front.com/en/articles/2157) | A staff inbox centered on who handles the conversation and its next action, with customer/job context. The customer simulator could feed fictional conversations into this interface after the intended journey is agreed. |
| Process Street / administrative and cross-team workflows | Conditional logic can show/hide tasks, headings, and fields based on choices and previous actions. [Conditional logic](https://www.process.st/help/docs/conditional-logic/) | Reveal warranty fields and steps relevant to the selected task. Start with clear fixed rules; a generic workflow builder would add configuration complexity and is not currently requested. |
| RepairDesk / electronics repair | Job types can have staged workflows; users can filter by workflow/current step and control whether those columns appear. [Workflows](https://help.repairdesk.co/portal/en/kb/articles/workflows) | Make the current stage and next handoff clear while keeping secondary columns optional. Different service workflows are an owner-discovery candidate, not an established requirement. |
| Fresha / salons and wellness | Service-specific forms can be used before, during, or after an appointment, with conditional questions. Forms can be organized, edited, duplicated, and archived while completed submissions retain their original content. [Create a client form](https://www.fresha.com/help-center/knowledge-base/clients/102340-create-a-client-form), [Organize forms](https://www.fresha.com/help-center/knowledge-base/clients/101353-organize-your-forms) | Show relevant warranty sections on demand. Distinguish editable draft templates from issued records; discuss whether archive/retire is the appropriate removal action for each entity. |

## Suggested discussion shortlist

These are inferences from the comparisons, not claims made by the cited products about Garage OS, and not requirements accepted by the user.

1. **Warranty summaries with details on demand — P1-028.** Lead with the selected record's status and main action; open forms, terms, evidence, and history when needed. Hiding too much can make actions hard to find, so retain clear labels and validation indicators. Editing/removal rules must respect published policy versions and issued coverage.
2. **One staff inbox experience in demo and production views — P1-027.** Keep simulation controls distinct from operational conversations. Assignment, internal notes, and customer/job context are candidates to discuss. Integration remains disconnected; demo activity must remain fictional and isolated.
3. **A purposeful demo entry journey — P1-026.** Connect the outside demo-user choice to the intended experience. A scenario that demonstrates a useful operational outcome may help, but the user's next-step explanation must determine the flow and participants.
4. **Financial summaries with time filters and drill-down — P1-029.** Candidate figures include revenue, collections, outstanding balances, direct costs, and profit. More figures should not recreate warranty-page overload. Current invoice drafts do not supply a complete financial ledger; reliable profit reporting depends on agreed definitions and source data.
5. **Clear responsibility and next actions — P1-030.** Explore visible ownership, waiting reasons, and pending handoffs in current booking/workshop/claim journeys before adding new modules. An exception list may help users act faster than additional summary cards.

## Decisions still open

| Topic | What the user has stated | What needs discussion |
|---|---|---|
| WhatsApp | Outside demo-user selection opens that user's workspace under RBAC. The WhatsApp demo has customer input/conversation and agent dashboard/navigation sides, showcasing auto-replies and selectable list choices. Retain the shared inbox in production/demo views without integration for now. | Exact greeting, list choices, reply sequences, agent handoff, reset/mobile behavior, and disconnected production behavior. Selecting a role does not grant additional inbox permissions or require every role to land on WhatsApp. |
| Warranty | Less visible at once; expandable information; edit/add/remove where possible. | Default visible content; which entities can change; archive versus delete; treatment of already-issued records. |
| Owner overview | Rearrangement, more money/profit figures, monthly trends. | Highest-value figures, profit definition, cost/payment sources, periods, and branch comparisons. |
| Broader UX/features | Research similar management/workflow ideas and discuss findings. | Which ideas solve observed problems; which to reject or postpone; concrete success criteria. |
| Subsequent research | Research the owner and business after these topics. | Confirm business identity/public sources and the questions to answer when P1-031 begins. |

**Recommendation for discussion:** Start with the user's promised WhatsApp journey, then clarify warranty add/remove semantics and owner financial priorities. Select concrete work from the research together. Keep the existing correctness issues in the tracker independently actionable; these broader requests do not supersede them.

**Progress:** Initial research collected. User discussion and prioritization remain open; no product behavior was changed.

**User clarification — 2026-11-16:** The two-sided WhatsApp showcase and role-based entry are confirmed requirements, recorded in P1-026/P1-027. A shared fictional conversation between the customer and agent sides is the proposed way to demonstrate their relationship; detailed conversation and automation rules still need discussion.

**Follow-up — 2026-11-16:** The user authorized assuming a complete functional sequence and explicitly requested no code changes. The [WhatsApp demo-flow proposal](WHATSAPP_DEMO_FLOW_PROPOSAL.md) now supplies suggested greeting/menu content, sequential customer journeys, staff handoff/navigation, and recovery behavior for discussion. These defaults remain proposals, not approved business policy or implemented features.

**Latest user requirement — 2026-11-16:** The core is a shared inbox for six WhatsApp business numbers, with requested-branch availability lookup, customer selection of an available time, collection of required details, and automatic confirmed booking in Garage OS. Agent handoff covers explicit requests and enquiries outside available options. This replaces routine staff approval in the earlier assumed booking path. The proposal/tracker now reflect this; number-to-branch/team routing remains to be clarified. No application code or settings changed.

**Routing resolved — 2026-11-16:** The user confirmed **one central team** handles all six numbers. Handoffs use a central queue; requested branch controls booking availability without forcing a conversation transfer. The active proposal and P1-027 record the necessary central-team cross-branch access while preserving restrictions for other users. No code or settings changed.

## Phase 1 follow-ups requested by the user

All six findings have been added to the Phase 1 tracker with concrete Garage OS behavior, suggested sequences, dependencies, and acceptance criteria. They remain Open and unimplemented; adding them does not approve unconfirmed business policies or change the user's no-code instruction.

| Research pattern | Tracker entry |
|---|---|
| Front: shared-inbox teamwork | [P1-032 — Central inbox ownership, handoff, and unanswered-work visibility](../testing/PHASE_1_ISSUES_TRACKER.md#p1-032) |
| Housecall Pro: flexible reporting | [P1-033 — Owner report filters, trend views, and drill-down](../testing/PHASE_1_ISSUES_TRACKER.md#p1-033) |
| Jobber: trustworthy job finances | [P1-034 — Separate quotes, collections, balances, costs, and profit](../testing/PHASE_1_ISSUES_TRACKER.md#p1-034) |
| Fresha: contextual forms and retained history | [P1-035 — Contextual warranty forms and safe template lifecycle](../testing/PHASE_1_ISSUES_TRACKER.md#p1-035) |
| RepairDesk: staged work views | [P1-036 — Stage-based action queues and optional operational columns](../testing/PHASE_1_ISSUES_TRACKER.md#p1-036) |
| Process Street: conditional task steps | [P1-037 — Sequential forms with conditional steps and retained input](../testing/PHASE_1_ISSUES_TRACKER.md#p1-037) |
