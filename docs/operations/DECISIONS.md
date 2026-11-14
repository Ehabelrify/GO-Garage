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

### DEC-001 — Use authenticated, server-enforced role workspaces
- **Date:** 2026-11-11
- **Status:** Accepted for the current meeting build
- **Context:** The owner-facing walkthrough needs to behave like an application rather than a role-preview demo.
- **Decision:** Use Clerk for individual sign-in, PostgreSQL for persistent operating data, and an Express API that enforces role, branch, and assigned-job access. Keep Owner operating controls in Settings, and mark unimplemented areas On hold.
- **Alternatives considered:** Browser-only sample accounts, front-end role switching, or a visual-only mockup.
- **Consequences:** No default account or shared password is created. The first Owner requires a verified-email bootstrap configuration; staff accounts require individual invitations. This meeting build does not include production publishing, backups, WhatsApp, or the broader PRD modules.
- **Owner approval required:** The owner must verify seeded operating defaults before live operation; production setup requires separate approval.
