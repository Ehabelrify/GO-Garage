# Garage OS — Technical and Product Decisions

Record decisions that affect architecture, user experience, business logic, integrations, or operations.

## Decision template

### DEC-XXX — Title
- **Date:**
- **Status:** Proposed / Accepted / Superseded
- **Context:**
- **Decision:**
- **Alternatives considered:**
- **Consequences:**
- **Owner approval required:** Yes / No

### DEC-002 — Full operational product with auxiliary demonstrations
- **Date:** 2026-11-16
- **Status:** Accepted by the user as product direction
- **Context:** After reviewing sourced Go Stores findings and proposed applications, the user approved all recommendations/additions and explicitly rejected treating the project primarily as a demo.
- **Decision:** Build functional operational workflows; isolate fictional demonstration/training over the same domain behavior; deliver future capabilities in phases/versions. Scope is mapped in [accepted direction](../product/PRODUCT_DIRECTION_AND_RELEASES.md) and P1-038–P1-044 plus existing inbox/reporting/warranty issues.
- **Alternatives considered:** Continuing demo-first framing or creating an independent simplified demonstration app; neither matches the user's instruction.
- **Consequences:** Existing simulator/provider/readiness limits remain factual. All original defects remain tracked. Feature acceptance does not approve researched prices or business policy, activate integrations, grant staff roles, or establish production readiness. DEC-001 remains applicable for authentication/settings; its meeting-only scope is superseded as the target product boundary.
- **Owner approval required:** Product direction is already user-approved. Actual business terms and operational parameters require their authorized business approver.

### DEC-003 — Hand over a complete tracker-based implementation plan
- **Date:** 2026-11-16
- **Status:** Accepted; direct user request
- **Context:** The user requested tracker/instruction updates and a next-session handover covering all findings/issues.
- **Decision:** Create the full plan from every current tracker issue before implementation, following [planning handover](PHASE_1_FULL_PLAN_HANDOVER.md). At recording there are44issues, nextP1-045. Include per-ID coverage, dependencies, releases, exact source/interface tasks, migrations and verification.
- **Alternatives considered:** Implementing an isolated addition immediately or planning only the newest features; both omit the requested comprehensive handover.
- **Consequences:** This session changes documentation only; all issue implementation statuses remain Open. Preserve already approved scope; do not ask the user to reselect features. Detailed unapproved business conditions remain explicit.
- **Owner approval required:** No new approval needed for creating the requested plan; plan review and any new material implementation decisions remain separate.

### DEC-001 — Use authenticated, server-enforced role workspaces
- **Date:** 2026-11-11
- **Status:** Accepted for the current meeting build
- **Context:** The owner-facing walkthrough needs to behave like an application rather than a role-preview demo.
- **Decision:** Use Clerk for individual sign-in, PostgreSQL for persistent operating data, and an Express API that enforces role, branch, and assigned-job access. Keep Owner operating controls in Settings, and mark unimplemented areas On hold.
- **Alternatives considered:** Browser-only sample accounts, front-end role switching, or a visual-only mockup.
- **Consequences:** No default account or shared password is created. The first Owner requires a verified-email bootstrap configuration; staff accounts require individual invitations. This meeting build does not include production publishing, backups, WhatsApp, or the broader PRD modules.
- **Owner approval required:** The owner must verify seeded operating defaults before live operation; production setup requires separate approval.
